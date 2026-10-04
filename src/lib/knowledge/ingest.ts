// The ingestion agent (docs/knowledge/PLAN.md §3.2): receive → classify → extract → link → review.
// Every stage is reported as it lands (the UI animates it) and recorded as a step with its model,
// tokens and time. A file seen before (same sha256 for this student) replays in milliseconds, which
// also keeps the demo safe when the Gemini quota runs out.

import { createHash } from "node:crypto";
import { ThinkingLevel, Type, type Schema } from "@google/genai";
import { generate, textPart } from "../gemini";
import { classify, extract, type Classification } from "../intel/analyze";
import { legacySource, linkAll, reconcile, review, toNodes } from "./nodes";
import * as store from "./db";
import type { IngestEvent, KbEdge, KbNode, KbSource, KbStep } from "./types";

export type IngestInput = { profile: string; bytes: Buffer; mime: string; filename: string; knownCourses: string[]; course?: string; existing?: { nodes: KbNode[] } };

export async function ingest(input: IngestInput, emit: (e: IngestEvent) => void): Promise<void> {
  const t0 = Date.now();
  const at = () => new Date().toISOString();
  const steps: KbStep[] = [];
  const stamp = (step: KbStep["step"], ms: number, extra: Partial<KbStep> = {}) => steps.push({ step, at: at(), ms, ...extra });

  // 1. Receive: hash, and replay a file we've already read for this student.
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const sourceId = `s${sha256.slice(0, 12)}`;
  const seen = await store.findSource(input.profile, sha256).catch(() => null);
  if (seen) {
    const kb = await store.load(input.profile, seen.course).catch(() => null);
    const nodes = kb?.nodes.filter((n) => n.source === seen.id) ?? [];
    if (nodes.length) {
      const ids = new Set(nodes.map((n) => n.id));
      // Links are recomputed against what the course knows now (a syllabus may have arrived since).
      const others = (input.existing?.nodes ?? kb?.nodes ?? []).filter((n) => !ids.has(n.id));
      const relinked = linkAll([...others, ...nodes]).filter((e) => ids.has(e.from) || ids.has(e.to));
      const edges = [...kb!.edges.filter((e) => ids.has(e.from) || ids.has(e.to)), ...relinked].filter((e, i, arr) => arr.findIndex((x) => x.from === e.from && x.to === e.to && x.rel === e.rel) === i);
      emit({ stage: "received", source: seen.id, filename: input.filename, cached: true, ms: Date.now() - t0 });
      emit({ stage: "classified", kind: seen.kind, course: seen.course, title: input.filename, confidence: seen.kindConfidence, why: "read before: replaying what Pathway already knows", ms: 0 });
      emit({ stage: "extracted", facts: nodes.length, ms: 0 });
      emit({ stage: "reviewed", confirmed: nodes.filter((n) => n.review !== "proposed").length, needsYou: nodes.filter((n) => n.review === "proposed").length, ms: 0 });
      emit({ stage: "linked", merged: 0, conflicts: edges.filter((e) => e.rel === "conflicts_with").length, edges: edges.length, ms: 0 });
      emit({ stage: "done", source: seen, nodes, edges, legacy: legacySource(seen.kind, seen.filename, seen.course, nodes), ms: Date.now() - t0 });
      return;
    }
  }
  stamp("received", Date.now() - t0, { detail: { sha256, size: input.bytes.length, mime: input.mime } });
  emit({ stage: "received", source: sourceId, filename: input.filename, cached: false, ms: Date.now() - t0 });

  // 2. Classify.
  let t = Date.now();
  const base = { bytes: input.bytes, mimeType: input.mime, filename: input.filename, knownCourses: input.knownCourses };
  const { classification, meta: cm } = await classify(base);
  const course = resolveCourse(input.course, classification, input.knownCourses);
  stamp("classified", Date.now() - t, { model: cm?.model, tokensIn: cm?.usage.input, tokensOut: cm?.usage.output, detail: { kind: classification.kind, confidence: classification.confidence, why: classification.why } });
  emit({ stage: "classified", kind: classification.kind, course, title: classification.title, confidence: classification.confidence, why: classification.why, ms: Date.now() - t });

  // 3. Extract, then normalise into nodes with quote + locator.
  t = Date.now();
  const { result, meta: em } = await extract(base, classification);
  const fresh = toNodes(result, { profile: input.profile, course, source: sourceId, at: at(), filename: input.filename });
  stamp("extracted", Date.now() - t, { model: em?.model, tokensIn: em?.usage.input, tokensOut: em?.usage.output, detail: { facts: fresh.length, types: countTypes(fresh) } });
  emit({ stage: "extracted", facts: fresh.length, ms: Date.now() - t });

  // 4. Link and reconcile against what the course already knows (the browser's copy wins when sent).
  t = Date.now();
  const known = input.existing?.nodes ?? (await store.load(input.profile, course).catch(() => null))?.nodes ?? [];
  const rec = reconcile(known.filter((n) => n.course === course), fresh);
  let edges: KbEdge[] = rec.edges;
  let linkMeta: { model?: string; usage?: { input: number; output: number } } = {};
  try {
    const linked = await linkTopics(rec.nodes, known);
    edges = [...edges, ...linked.edges];
    linkMeta = linked.meta;
  } catch {
    /* the linker is optional; the deterministic pass already ran */
  }
  stamp("linked", Date.now() - t, { model: linkMeta.model, tokensIn: linkMeta.usage?.input, tokensOut: linkMeta.usage?.output, detail: { merged: rec.merged, conflicts: rec.conflicts, edges: edges.length } });
  emit({ stage: "linked", merged: rec.merged, conflicts: rec.conflicts, edges: edges.length, ms: Date.now() - t });

  // 5. Review gate: high confidence and no conflict is confirmed (undoable); the rest waits.
  t = Date.now();
  const reviewed = review(rec.nodes, edges);
  const confirmed = reviewed.filter((n) => n.review === "confirmed").length;
  stamp("reviewed", Date.now() - t, { detail: { confirmed, needsYou: reviewed.length - confirmed } });
  emit({ stage: "reviewed", confirmed, needsYou: reviewed.length - confirmed, ms: Date.now() - t });

  const source: KbSource = { id: sourceId, profile: input.profile, course, filename: input.filename, mime: input.mime, size: input.bytes.length, sha256, kind: classification.kind, kindConfidence: classification.confidence, why: classification.why, uploadedAt: at(), steps };
  await store.save(source, reviewed, edges).catch((e) => console.warn("[knowledge] save failed:", (e as Error).message));
  emit({ stage: "done", source, nodes: reviewed, edges, legacy: legacySource(classification.kind, classification.title || input.filename, course, [...known, ...reviewed]), ms: Date.now() - t0 });
}

function resolveCourse(given: string | undefined, c: Classification, known: string[]) {
  if (given && known.includes(given)) return given;
  const g = c.course_guess.trim().toUpperCase().replace(/\s+/g, " ");
  return known.find((k) => k.toUpperCase() === g || k.toUpperCase().replace(" ", "") === g.replace(" ", "")) ?? known[0] ?? g;
}

function countTypes(nodes: KbNode[]) {
  const by: Record<string, number> = {};
  for (const n of nodes) by[n.type] = (by[n.type] ?? 0) + 1;
  return by;
}

const linkSchema: Schema = {
  type: Type.OBJECT,
  required: ["links"],
  properties: {
    links: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, required: ["topic", "exam", "why"], properties: { topic: { type: Type.STRING, description: "topic node id" }, exam: { type: Type.STRING, description: "deadline node id" }, why: { type: Type.STRING } } },
    },
  },
};

/** One cheap call: which topics does each exam cover? Ids and titles only, never documents. */
async function linkTopics(fresh: KbNode[], known: KbNode[]): Promise<{ edges: KbEdge[]; meta: { model?: string; usage?: { input: number; output: number } } }> {
  const all = [...known, ...fresh];
  const topics = all.filter((n) => n.type === "topic");
  const exams = all.filter((n) => n.type === "deadline" && /exam|midterm|final|test/i.test(`${n.title} ${n.body.kind}`));
  const newTopics = fresh.some((n) => n.type === "topic");
  const newExams = fresh.some((n) => n.type === "deadline");
  if (!topics.length || !exams.length || !(newTopics || newExams)) return { edges: [], meta: {} };
  const res = await generate(
    {
      contents: [{ role: "user", parts: [textPart(`Topics: ${topics.map((n) => `${n.id}=${n.title}${n.body.summary ? ` (${String(n.body.summary).slice(0, 80)})` : ""}`).join("; ")}\nExams: ${exams.map((n) => `${n.id}=${n.title}${n.quote ? ` ("${n.quote.slice(0, 100)}")` : ""}`).join("; ")}`)] }],
      config: { systemInstruction: "Pair each topic with the exam that most likely covers it, using the exam titles and quoted syllabus text. Only pair when the evidence supports it; otherwise leave the topic out. Return ids exactly as given.", responseMimeType: "application/json", responseSchema: linkSchema, temperature: 0.1, maxOutputTokens: 600, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
    },
    "fast",
  );
  const parsed = JSON.parse(res.text ?? "{}") as { links?: { topic: string; exam: string; why: string }[] };
  const ids = new Set(all.map((n) => n.id));
  const edges = (parsed.links ?? []).filter((l) => ids.has(l.topic) && ids.has(l.exam)).map((l) => ({ from: l.topic, to: l.exam, rel: "covers" as const, why: l.why, createdBy: "linker" as const }));
  const u = res.usageMetadata;
  return { edges, meta: { model: (res as { modelUsed?: string }).modelUsed, usage: { input: u?.promptTokenCount ?? 0, output: u?.candidatesTokenCount ?? 0 } } };
}
