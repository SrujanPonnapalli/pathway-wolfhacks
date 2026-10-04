// The sample knowledge every demo profile starts with: its courses' syllabi, gradebooks and lecture
// files as graph facts, built in code from src/lib/coursework-data.ts and each profile's own
// numbers (src/lib/coursework.ts). Deterministic, no Gemini, no upload. The same ids come out
// every time, so re-seeding never duplicates a fact, and a real file dropped on Home goes
// through the ingestion agent and lands beside these with the same shape.
//
// Everything here is marked as sample: source ids start with SAMPLE_PREFIX and nodes are
// createdBy "seed". The Courses tab says so; a student's own files are never touched by a re-seed.

import { NOW, type CourseSeed } from "../mock.ts";
import { COURSES, type CourseDoc } from "../coursework-data.ts";
import { baseFeatures, recordFor } from "../coursework.ts";
import type { FileKind } from "../intel/analyze";
import { hash, linkAll, nodeId } from "./nodes.ts";
import type { KbNode, KbSource, Knowledge, NodeType } from "./types";

/** Bump when the sample content changes so profiles that already seeded pick up the new facts. */
export const SAMPLE_VERSION = "coursework-2026-10-04";
export const SAMPLE_PREFIX = "s-sample-";
export const isSampleSource = (s: { id: string }) => s.id.startsWith(SAMPLE_PREFIX);

const DOC_KIND: Record<CourseDoc["type"], FileKind> = { slides: "slides", notes: "notes", reading: "reading", handout: "notes", lab: "assignment" };

/** What a profile should know before touching anything: one syllabus, one gradebook and the lecture files per course. */
export function sampleKnowledge(profile: string, courses: CourseSeed[], now: Date = NOW): Knowledge {
  const at = now.toISOString();
  const sources: KbSource[] = [];
  const nodes: KbNode[] = [];

  for (const c of courses) {
    const info = COURSES[c.code];
    const rec = recordFor(c.code, baseFeatures(c), now);
    if (!info || !rec) continue;
    const code = c.code;

    const source = (kind: FileKind, filename: string, size: number): KbSource => {
      const s: KbSource = {
        id: `${SAMPLE_PREFIX}${hash(`${profile}|${code}|${kind}|${filename}`)}`,
        profile,
        course: code,
        filename,
        mime: "text/plain",
        size,
        sha256: hash(`${code}|${filename}|${SAMPLE_VERSION}`),
        kind,
        kindConfidence: "high",
        why: "Sample course record standing in for Moodle and Gradescope",
        uploadedAt: at,
        steps: [{ step: "reviewed", at, ms: 0, detail: { sample: true } }],
      };
      sources.push(s);
      return s;
    };
    const fact = (src: KbSource, type: NodeType, title: string, body: Record<string, unknown>, quote: string, locator: string, dateKey = "") => {
      nodes.push({ id: nodeId(profile, code, type, title, dateKey), profile, course: code, type, title, body, confidence: "high", review: "confirmed", source: src.id, quote: quote || undefined, locator, createdBy: "seed", createdAt: at });
    };

    // Syllabus: who, what counts, when, and the rules.
    const syl = source("syllabus", `${code} syllabus (${info.term})`, 4000 + info.docs.length);
    fact(syl, "course_info", info.name, { code, term: info.term, credits: info.credits, meets: info.meets, lab: info.lab ?? "", textbook: info.textbook }, info.about, "syllabus · header");
    fact(syl, "contact", info.instructor.name, { email: info.instructor.email, office_hours: `${info.instructor.hours} · ${info.instructor.office}`, role: "instructor" }, `${info.instructor.name}, ${info.instructor.email}, office hours ${info.instructor.hours} (${info.instructor.office})`, "syllabus · staff");
    if (info.ta) fact(syl, "contact", info.ta.name, { email: info.ta.email, office_hours: info.ta.hours, role: "TA" }, `TA ${info.ta.name}, ${info.ta.email}, office hours ${info.ta.hours}`, "syllabus · staff");
    for (const g of info.grading) fact(syl, "grading", g.component, { weight: g.weight_percent, notes: g.notes }, `${g.component} ${g.weight_percent}%${g.notes ? ` (${g.notes})` : ""}`, "syllabus · grading");
    for (const d of info.deadlines) fact(syl, "deadline", d.title, { date: d.date, time: d.time, kind: d.kind, weight: d.weight_percent }, `${d.title}: ${d.date} ${d.time}`, "syllabus · key dates", d.date);
    for (const [k, text] of Object.entries(info.policies)) fact(syl, "policy", k.replace(/_/g, " "), { text }, text, "syllabus · policies");

    // Gradebook: every released assignment, as the student's record shows it.
    const gb = source("grades", `${code} gradebook`, 1200 + rec.assignments.length * 40);
    rec.assignments.forEach((a, i) =>
      fact(gb, "grade_item", a.name, { score: a.score, max: a.max, status: a.status, due: a.due, category: a.category, from: "Gradescope" }, `${a.name}: ${a.score ?? "–"}/${a.max} · ${a.status.replace("_", " ")} · due ${a.due}`, `gradebook · row ${i + 1}`, a.due),
    );

    // Lecture files: one topic per file (the summary Viva reads; the full text stays on the Courses tab for the quiz tools).
    for (const d of info.docs) {
      const f = source(DOC_KIND[d.type], d.title, d.body.length);
      fact(f, "topic", d.title, { summary: d.summary, from: d.title, week: d.week, doc: d.id, quiz: 0 }, d.summary, `${d.type} · week ${d.week}`);
    }
  }

  return { sources, nodes, edges: linkAll(nodes) };
}

/** Materials for a course: the sample lecture files (with their full text) plus anything the student dropped. */
export function docsFor(code: string, kb: Knowledge): (CourseDoc & { sample: boolean; source?: string })[] {
  const sample = (COURSES[code]?.docs ?? []).map((d) => ({ ...d, sample: true }));
  const dropped = kb.sources
    .filter((s) => s.course === code && !isSampleSource(s) && s.kind !== "syllabus" && s.kind !== "grades" && s.kind !== "dataset")
    .map((s): CourseDoc & { sample: boolean; source?: string } => {
      const topics = kb.nodes.filter((n) => n.source === s.id && n.type === "topic" && n.review !== "rejected");
      const summary = topics.map((t) => `${t.title}: ${String(t.body.summary ?? "")}`).join(" · ");
      const type: CourseDoc["type"] = s.kind === "slides" ? "slides" : s.kind === "reading" ? "reading" : "notes";
      return { id: s.id, title: s.filename.replace(/\.[a-z0-9]+$/i, ""), type, week: 0, summary, body: summary, sample: false, source: s.id };
    });
  return [...dropped, ...sample];
}

/**
 * A real syllabus or grade page retires the sample one for its course: the sample source and its
 * facts go, so weights, dates and grade rows never come from two files at once. Lecture files stack.
 */
export function retireSuperseded(kb: Knowledge): Knowledge {
  const real = new Set(kb.sources.filter((s) => !isSampleSource(s) && (s.kind === "syllabus" || s.kind === "grades")).map((s) => `${s.course}|${s.kind}`));
  if (!real.size) return kb;
  const drop = new Set(kb.sources.filter((s) => isSampleSource(s) && real.has(`${s.course}|${s.kind}`)).map((s) => s.id));
  if (!drop.size) return kb;
  const nodes = kb.nodes.filter((n) => !n.source || !drop.has(n.source));
  const ids = new Set(nodes.map((n) => n.id));
  return { sources: kb.sources.filter((s) => !drop.has(s.id)), nodes, edges: kb.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
}
