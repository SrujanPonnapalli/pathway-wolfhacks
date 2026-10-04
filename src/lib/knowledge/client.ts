// Browser side of the knowledge graph: stream a file through the ingestion agent, keep a
// local-first copy, and rebuild the older `Source` shapes (which the Week, the tree inputs and the
// coach still read) from confirmed facts so one truth feeds everything.

import type { Source } from "../intel/coach";
import { legacySource } from "./nodes";
import type { IngestEvent, KbEdge, KbNode, KbSource, Knowledge, Review } from "./types";

export type DoneEvent = Extract<IngestEvent, { stage: "done" }>;

/** POST the file and replay each stage as it lands. Resolves with the final event. */
export async function ingestFile(
  file: File,
  opts: { profile: string; courses: string[]; course?: string; existing: KbNode[] },
  onStage: (e: IngestEvent) => void,
): Promise<DoneEvent> {
  const form = new FormData();
  form.append("file", file);
  form.append("profile", opts.profile);
  form.append("courses", JSON.stringify(opts.courses));
  if (opts.course) form.append("course", opts.course);
  form.append("existing", JSON.stringify({ nodes: opts.existing.map((n) => ({ ...n, quote: undefined })) }));
  const r = await fetch("/api/knowledge/ingest", { method: "POST", body: form });
  if (!r.ok || !r.body) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? `${r.status}`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let done: DoneEvent | null = null;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const e = JSON.parse(line) as IngestEvent;
      if (e.stage === "error") throw new Error(e.error);
      onStage(e);
      if (e.stage === "done") done = e;
    }
  }
  if (!done) throw new Error("The reader stopped early.");
  return done;
}

/** Merge a finished ingest (or a seed) into the local graph. Same ids replace; nothing duplicates. */
export function merge(kb: Knowledge, add: { sources?: KbSource[]; nodes: KbNode[]; edges: KbEdge[] }): Knowledge {
  const sources = new Map(kb.sources.map((s) => [s.id, s]));
  for (const s of add.sources ?? []) sources.set(s.id, s);
  const nodes = new Map(kb.nodes.map((n) => [n.id, n]));
  for (const n of add.nodes) {
    const old = nodes.get(n.id);
    // a student's own decision on a fact outlives a re-read of the same file
    nodes.set(n.id, old && old.review !== "proposed" ? { ...n, review: old.review, title: old.title, body: { ...n.body, ...old.body } } : n);
  }
  const key = (e: KbEdge) => `${e.from}|${e.to}|${e.rel}`;
  const edges = new Map(kb.edges.map((e) => [key(e), e]));
  for (const e of add.edges) edges.set(key(e), e);
  return { sources: [...sources.values()], nodes: [...nodes.values()], edges: [...edges.values()] };
}

export function setReview(kb: Knowledge, id: string, review: Review, patch?: { title?: string; body?: Record<string, unknown> }): Knowledge {
  return { ...kb, nodes: kb.nodes.map((n) => (n.id === id ? { ...n, review, ...(patch?.title ? { title: patch.title } : {}), ...(patch?.body ? { body: { ...n.body, ...patch.body } } : {}) } : n)) };
}

export function dropSource(kb: Knowledge, id: string): Knowledge {
  const nodes = kb.nodes.filter((n) => n.source !== id);
  const ids = new Set(nodes.map((n) => n.id));
  return { sources: kb.sources.filter((s) => s.id !== id), nodes, edges: kb.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
}

export function reassign(kb: Knowledge, sourceId: string, course: string): Knowledge {
  return { ...kb, sources: kb.sources.map((s) => (s.id === sourceId ? { ...s, course } : s)), nodes: kb.nodes.map((n) => (n.source === sourceId ? { ...n, course } : n)) };
}

/** The `Source[]` the rest of the app reads, rebuilt from the graph: one per file, confirmed facts only. */
export function legacySources(kb: Knowledge): Source[] {
  const out: Source[] = [];
  for (const s of kb.sources) {
    const mine = kb.nodes.filter((n) => n.source === s.id);
    const src = legacySource(s.kind, s.filename.replace(/\.[a-z0-9]+$/i, ""), s.course, mine);
    if (src) out.push(src);
  }
  // facts without a file (Viva's notes, seeds typed by hand) still reach the coach as a note per course
  return out;
}

/** A one-line human summary of a finished ingest, for toasts and the Files card. */
export function summary(e: DoneEvent) {
  const n = e.nodes.length;
  const waiting = e.nodes.filter((x) => x.review === "proposed").length;
  const conflicts = e.edges.filter((x) => x.rel === "conflicts_with").length;
  return `${e.source.kind} · ${n} fact${n === 1 ? "" : "s"}${waiting ? ` · ${waiting} need${waiting === 1 ? "s" : ""} you` : ""}${conflicts ? ` · ${conflicts} clash${conflicts === 1 ? "" : "es"}` : ""} · ${(e.ms / 1000).toFixed(1)} s`;
}
