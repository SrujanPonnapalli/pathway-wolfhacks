// Server-side persistence for the knowledge graph. Tiger when DATABASE_URL is set; otherwise an
// in-memory copy per server instance (the browser keeps its own local-first copy either way, so
// nothing is lost when the database is off). Raw files are never stored, only facts and telemetry.

import { db } from "../db";
import type { KbEdge, KbNode, KbSource, Knowledge } from "./types";

const mem = { sources: new Map<string, KbSource>(), nodes: new Map<string, KbNode>(), edges: [] as KbEdge[], turns: [] as TurnLog[] };
let ensured = false;

export type TurnLog = { at: string; profile: string; specialist: string; ms: number; tokensIn: number; tokensOut: number; used: string[]; question: string };

export async function ensureTables() {
  const sql = db();
  if (!sql || ensured) return;
  // Mirrors db/schema.sql §knowledge; here so the route works before anyone re-runs db:setup.
  await sql`CREATE TABLE IF NOT EXISTS kb_sources (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, course_code TEXT NOT NULL DEFAULT '', filename TEXT NOT NULL, mime TEXT NOT NULL, size_bytes INT NOT NULL, sha256 TEXT NOT NULL, kind TEXT NOT NULL, kind_confidence TEXT NOT NULL, why TEXT NOT NULL DEFAULT '', uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(), steps JSONB NOT NULL DEFAULT '[]', UNIQUE (profile_id, sha256))`;
  await sql`CREATE TABLE IF NOT EXISTS kb_nodes (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, course_code TEXT NOT NULL DEFAULT '', type TEXT NOT NULL, title TEXT NOT NULL, body JSONB NOT NULL DEFAULT '{}', confidence TEXT NOT NULL, review TEXT NOT NULL DEFAULT 'proposed', source_id TEXT REFERENCES kb_sources(id) ON DELETE CASCADE, quote TEXT, locator TEXT, superseded_by TEXT, created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS kb_nodes_profile_course ON kb_nodes (profile_id, course_code)`;
  await sql`CREATE TABLE IF NOT EXISTS kb_edges (from_id TEXT NOT NULL REFERENCES kb_nodes(id) ON DELETE CASCADE, to_id TEXT NOT NULL REFERENCES kb_nodes(id) ON DELETE CASCADE, rel TEXT NOT NULL, why TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, PRIMARY KEY (from_id, to_id, rel))`;
  await sql`CREATE TABLE IF NOT EXISTS kb_steps (at TIMESTAMPTZ NOT NULL DEFAULT now(), source_id TEXT NOT NULL, step TEXT NOT NULL, ms INT NOT NULL, model TEXT, tokens_in INT, tokens_out INT, detail JSONB)`;
  await sql`CREATE TABLE IF NOT EXISTS viva_turns (at TIMESTAMPTZ NOT NULL DEFAULT now(), profile_id TEXT NOT NULL, specialist TEXT NOT NULL, ms INT NOT NULL, tokens_in INT NOT NULL, tokens_out INT NOT NULL, used_node_ids TEXT[] NOT NULL DEFAULT '{}', question TEXT NOT NULL DEFAULT '')`;
  try {
    await sql`SELECT create_hypertable('kb_steps', 'at', if_not_exists => TRUE)`;
    await sql`SELECT create_hypertable('viva_turns', 'at', if_not_exists => TRUE)`;
  } catch {
    /* plain Postgres without Timescale: fine, they stay ordinary tables */
  }
  ensured = true;
}

export const live = () => !!db();

export async function findSource(profile: string, sha256: string): Promise<KbSource | null> {
  const sql = db();
  if (!sql) return [...mem.sources.values()].find((s) => s.profile === profile && s.sha256 === sha256) ?? null;
  await ensureTables();
  const [r] = await sql`SELECT * FROM kb_sources WHERE profile_id = ${profile} AND sha256 = ${sha256}`;
  return r ? rowSource(r) : null;
}

export async function load(profile: string, course?: string): Promise<Knowledge> {
  const sql = db();
  if (!sql) {
    const nodes = [...mem.nodes.values()].filter((n) => n.profile === profile && (!course || n.course === course));
    const ids = new Set(nodes.map((n) => n.id));
    return { sources: [...mem.sources.values()].filter((s) => s.profile === profile && (!course || s.course === course)), nodes, edges: mem.edges.filter((e) => ids.has(e.from) || ids.has(e.to)) };
  }
  await ensureTables();
  const sources = course ? await sql`SELECT * FROM kb_sources WHERE profile_id = ${profile} AND course_code = ${course} ORDER BY uploaded_at` : await sql`SELECT * FROM kb_sources WHERE profile_id = ${profile} ORDER BY uploaded_at`;
  const nodes = course ? await sql`SELECT * FROM kb_nodes WHERE profile_id = ${profile} AND course_code = ${course} ORDER BY created_at` : await sql`SELECT * FROM kb_nodes WHERE profile_id = ${profile} ORDER BY created_at`;
  const ids = nodes.map((n) => n.id as string);
  const edges = ids.length ? await sql`SELECT * FROM kb_edges WHERE from_id = ANY(${ids}) OR to_id = ANY(${ids})` : [];
  return { sources: sources.map(rowSource), nodes: nodes.map(rowNode), edges: edges.map((e) => ({ from: e.from_id, to: e.to_id, rel: e.rel, why: e.why, createdBy: e.created_by })) };
}

export async function save(source: KbSource, nodes: KbNode[], edges: KbEdge[]) {
  const sql = db();
  if (!sql) {
    mem.sources.set(source.id, source);
    for (const n of nodes) mem.nodes.set(n.id, n);
    for (const e of edges) if (!mem.edges.some((x) => x.from === e.from && x.to === e.to && x.rel === e.rel)) mem.edges.push(e);
    return;
  }
  await ensureTables();
  await sql`INSERT INTO kb_sources (id, profile_id, course_code, filename, mime, size_bytes, sha256, kind, kind_confidence, why, uploaded_at, steps)
    VALUES (${source.id}, ${source.profile}, ${source.course}, ${source.filename}, ${source.mime}, ${source.size}, ${source.sha256}, ${source.kind}, ${source.kindConfidence}, ${source.why}, ${source.uploadedAt}, ${sql.json(source.steps as never)})
    ON CONFLICT (id) DO UPDATE SET course_code = EXCLUDED.course_code, kind = EXCLUDED.kind, kind_confidence = EXCLUDED.kind_confidence, why = EXCLUDED.why, steps = EXCLUDED.steps`;
  for (const st of source.steps) await sql`INSERT INTO kb_steps (at, source_id, step, ms, model, tokens_in, tokens_out, detail) VALUES (${st.at}, ${source.id}, ${st.step}, ${st.ms}, ${st.model ?? null}, ${st.tokensIn ?? null}, ${st.tokensOut ?? null}, ${sql.json((st.detail ?? {}) as never)})`;
  for (const n of nodes)
    await sql`INSERT INTO kb_nodes (id, profile_id, course_code, type, title, body, confidence, review, source_id, quote, locator, superseded_by, created_by, created_at)
      VALUES (${n.id}, ${n.profile}, ${n.course}, ${n.type}, ${n.title}, ${sql.json(n.body as never)}, ${n.confidence}, ${n.review}, ${n.source ?? null}, ${n.quote ?? null}, ${n.locator ?? null}, ${n.supersededBy ?? null}, ${n.createdBy}, ${n.createdAt})
      ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, confidence = EXCLUDED.confidence, review = CASE WHEN kb_nodes.review IN ('confirmed','edited','rejected') THEN kb_nodes.review ELSE EXCLUDED.review END, quote = EXCLUDED.quote, locator = EXCLUDED.locator`;
  for (const e of edges) await sql`INSERT INTO kb_edges (from_id, to_id, rel, why, created_by) VALUES (${e.from}, ${e.to}, ${e.rel}, ${e.why}, ${e.createdBy}) ON CONFLICT DO NOTHING`;
}

export async function setReview(profile: string, id: string, review: KbNode["review"], patch?: { title?: string; body?: Record<string, unknown> }) {
  const sql = db();
  if (!sql) {
    const n = mem.nodes.get(id);
    if (n && n.profile === profile) mem.nodes.set(id, { ...n, review, ...(patch?.title ? { title: patch.title } : {}), ...(patch?.body ? { body: { ...n.body, ...patch.body } } : {}) });
    return;
  }
  await ensureTables();
  if (patch?.title || patch?.body) await sql`UPDATE kb_nodes SET review = ${review}, title = COALESCE(${patch.title ?? null}, title), body = body || ${sql.json((patch.body ?? {}) as never)} WHERE id = ${id} AND profile_id = ${profile}`;
  else await sql`UPDATE kb_nodes SET review = ${review} WHERE id = ${id} AND profile_id = ${profile}`;
}

export async function removeSource(profile: string, id: string) {
  const sql = db();
  if (!sql) {
    mem.sources.delete(id);
    for (const [k, n] of mem.nodes) if (n.source === id && n.profile === profile) mem.nodes.delete(k);
    mem.edges = mem.edges.filter((e) => mem.nodes.has(e.from) && mem.nodes.has(e.to));
    return;
  }
  await ensureTables();
  await sql`DELETE FROM kb_sources WHERE id = ${id} AND profile_id = ${profile}`; // nodes and edges cascade
}

export async function logTurn(t: TurnLog) {
  const sql = db();
  if (!sql) {
    mem.turns.push(t);
    if (mem.turns.length > 200) mem.turns.shift();
    return;
  }
  await ensureTables();
  await sql`INSERT INTO viva_turns (at, profile_id, specialist, ms, tokens_in, tokens_out, used_node_ids, question) VALUES (${t.at}, ${t.profile}, ${t.specialist}, ${t.ms}, ${t.tokensIn}, ${t.tokensOut}, ${t.used}, ${t.question.slice(0, 200)})`;
}

export async function recentTurns(profile: string, limit = 10): Promise<TurnLog[]> {
  const sql = db();
  if (!sql) return mem.turns.filter((t) => t.profile === profile).slice(-limit).reverse();
  await ensureTables();
  const rows = await sql`SELECT * FROM viva_turns WHERE profile_id = ${profile} ORDER BY at DESC LIMIT ${limit}`;
  return rows.map((r) => ({ at: new Date(r.at).toISOString(), profile: r.profile_id, specialist: r.specialist, ms: r.ms, tokensIn: r.tokens_in, tokensOut: r.tokens_out, used: r.used_node_ids, question: r.question }));
}

type Row = Record<string, unknown>;
const rowSource = (r: Row): KbSource => ({ id: r.id as string, profile: r.profile_id as string, course: r.course_code as string, filename: r.filename as string, mime: r.mime as string, size: r.size_bytes as number, sha256: r.sha256 as string, kind: r.kind as KbSource["kind"], kindConfidence: r.kind_confidence as KbSource["kindConfidence"], why: r.why as string, uploadedAt: new Date(r.uploaded_at as string).toISOString(), steps: (r.steps as KbSource["steps"]) ?? [] });
const rowNode = (r: Row): KbNode => ({ id: r.id as string, profile: r.profile_id as string, course: r.course_code as string, type: r.type as KbNode["type"], title: r.title as string, body: (r.body as Record<string, unknown>) ?? {}, confidence: r.confidence as KbNode["confidence"], review: r.review as KbNode["review"], source: (r.source_id as string) ?? undefined, quote: (r.quote as string) ?? undefined, locator: (r.locator as string) ?? undefined, supersededBy: (r.superseded_by as string) ?? undefined, createdBy: r.created_by as KbNode["createdBy"], createdAt: new Date(r.created_at as string).toISOString() });
