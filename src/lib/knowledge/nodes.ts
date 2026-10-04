// Facts out of files: turn each extractor's result into typed nodes with a quote and a locator,
// give them stable ids, and reconcile them with what the course already knows (duplicates merge,
// date clashes become conflicts). Pure functions; the same code runs in the browser and on the server.

import type { Classification, GenericSummary, GradeImport } from "../intel/analyze";
import type { Syllabus } from "../intel/syllabus";
import type { StudyMaterial } from "../intel/study";
import type { Source } from "../intel/coach";
import type { KbEdge, KbNode, NodeType } from "./types";

export type Extracted = { classification: Classification; syllabus?: Syllabus; grades?: GradeImport; study?: StudyMaterial; generic?: GenericSummary };

/** Small, dependency-free hash (FNV-1a) so ids match wherever a node is built. */
export function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|a|an|of|for|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function nodeId(profile: string, course: string, type: NodeType, title: string, date = "") {
  return `n${hash(`${profile}|${course}|${type}|${norm(title)}|${date}`)}`;
}

type Ctx = { profile: string; course: string; source: string; at: string; filename?: string };

const node = (c: Ctx, type: NodeType, title: string, body: Record<string, unknown>, extra: Partial<Pick<KbNode, "confidence" | "quote" | "locator">> = {}, dateKey = ""): KbNode => ({
  id: nodeId(c.profile, c.course, type, title, dateKey),
  profile: c.profile,
  course: c.course,
  type,
  title: title.trim(),
  body,
  confidence: extra.confidence ?? "high",
  review: "proposed",
  source: c.source,
  quote: extra.quote?.trim() || undefined,
  locator: extra.locator,
  createdBy: "extractor",
  createdAt: c.at,
});

/** Every fact an extractor found, as nodes. Nothing is thrown away anymore: topics and quiz items become nodes too. */
export function toNodes(r: Extracted, c: Ctx): KbNode[] {
  const out: KbNode[] = [];
  if (r.syllabus) {
    const s = r.syllabus;
    if (s.course.instructor || s.course.instructor_email || s.course.office_hours)
      out.push(node(c, "contact", s.course.instructor || "Instructor", { email: s.course.instructor_email, office_hours: s.course.office_hours }, { locator: "syllabus" }));
    if (s.course.name || s.course.term) out.push(node(c, "course_info", s.course.name || c.course, { code: s.course.code, term: s.course.term }, { locator: "syllabus" }));
    for (const g of s.grading) if (g.component) out.push(node(c, "grading", g.component, { weight: g.weight_percent, notes: g.notes }, { quote: g.notes, locator: "syllabus · grading" }));
    for (const d of s.deadlines) {
      if (!d.title) continue;
      out.push(node(c, "deadline", d.title, { date: d.date, time: d.time, kind: d.kind, weight: d.weight_percent }, { confidence: d.date ? d.confidence : "low", quote: d.source_text, locator: "syllabus · schedule" }, d.date));
    }
    for (const [k, v] of Object.entries(s.policies)) if (v) out.push(node(c, "policy", k.replace(/_/g, " "), { text: v }, { quote: v, locator: "syllabus · policies" }));
  }
  if (r.grades) {
    r.grades.items.forEach((it, i) => {
      if (!it.name) return;
      out.push(node(c, "grade_item", it.name, { score: it.score, max: it.max, status: it.status, due: it.due, from: r.grades!.source }, { confidence: it.status === "unknown" ? "medium" : "high", quote: `${it.name}: ${it.score ?? "–"}/${it.max ?? "–"} · ${it.status}${it.due ? ` · due ${it.due}` : ""}`, locator: `${r.grades!.source || "grade page"} · row ${i + 1}` }));
    });
  }
  if (r.study) {
    const st = r.study;
    const kind = r.classification.kind;
    for (const t of st.topics) {
      if (!t) continue;
      const cards = st.flashcards.filter((f) => norm(f.topic) === norm(t)).slice(0, 3);
      const viva = st.viva.filter((v) => norm(v.topic) === norm(t)).slice(0, 2);
      const summary = [...cards.map((f) => `${f.front}: ${f.back}`), ...viva.map((v) => `${v.question} (${v.key_points.join("; ")})`)].join(" | ");
      out.push(node(c, "topic", t, { summary: summary || `Covered in ${st.title}`, from: st.title, quiz: st.quiz.filter((q) => q.source_ref?.toLowerCase().includes(t.toLowerCase().slice(0, 12))).length }, { confidence: "medium", quote: cards[0] ? `${cards[0].front}: ${cards[0].back}` : undefined, locator: `${kind} · ${c.filename ?? st.title}` }));
    }
  }
  if (r.generic) {
    const g = r.generic;
    for (const a of g.action_items) if (a.task) out.push(node(c, "deadline", a.task, { date: /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? a.due : "", time: "", kind: "other", effort_minutes: a.effort_minutes }, { confidence: /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? "medium" : "low", quote: g.summary.slice(0, 160), locator: r.classification.kind }, /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? a.due : ""));
    if (g.summary) out.push(node(c, "topic", r.classification.title, { summary: g.summary, points: g.key_points }, { confidence: "medium", locator: r.classification.kind }));
  }
  // de-dupe inside one file (two rows with the same name)
  const seen = new Set<string>();
  return out.filter((n) => !seen.has(n.id) && seen.add(n.id));
}

const similar = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  const xs = new Set(x.split(" "));
  const ys = y.split(" ");
  const common = ys.filter((w) => w.length > 2 && xs.has(w)).length;
  return common >= 2 && common >= Math.min(xs.size, ys.length) * 0.6;
};

/**
 * Deterministic reconciliation. Returns the nodes to keep (incoming, minus exact duplicates of what
 * exists), plus edges: `conflicts_with` when the same deadline carries a different date, and
 * `counts_toward` from grade items to the grading component they match.
 */
export function reconcile(existing: KbNode[], incoming: KbNode[]): { nodes: KbNode[]; edges: KbEdge[]; merged: number; conflicts: number } {
  const edges: KbEdge[] = [];
  const keep: KbNode[] = [];
  let merged = 0;
  let conflicts = 0;
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    const same = byId.get(n.id);
    if (same && same.review !== "rejected") {
      merged++; // identical fact already known (same title and date): nothing new to review
      continue;
    }
    if (n.type === "deadline" && n.body.date) {
      const clash = existing.find((e) => e.type === "deadline" && e.course === n.course && e.review !== "rejected" && !e.supersededBy && e.body.date && e.body.date !== n.body.date && similar(e.title, n.title));
      if (clash) {
        conflicts++;
        edges.push({ from: n.id, to: clash.id, rel: "conflicts_with", why: `${n.locator ?? "new file"} says ${n.body.date}, ${clash.locator ?? "earlier file"} says ${clash.body.date}`, createdBy: "linker" });
        n.confidence = "low"; // a clash always waits for the student
      }
    }
    if (n.type === "grade_item") {
      const comp = [...existing, ...incoming].find((e) => e.type === "grading" && e.course === n.course && matchesComponent(e.title, n.title));
      if (comp) edges.push({ from: n.id, to: comp.id, rel: "counts_toward", why: `"${n.title}" looks like ${comp.title}`, createdBy: "linker" });
    }
    keep.push(n);
  }
  return { nodes: keep, edges, merged, conflicts };
}

/** Deterministic links among a set of nodes (no merging): grade rows → grading components, clashing deadline dates. */
export function linkAll(nodes: KbNode[]): KbEdge[] {
  const edges: KbEdge[] = [];
  const live = nodes.filter((n) => n.review !== "rejected");
  for (const n of live) {
    if (n.type === "grade_item") {
      const comp = live.find((e) => e.type === "grading" && e.course === n.course && matchesComponent(e.title, n.title));
      if (comp) edges.push({ from: n.id, to: comp.id, rel: "counts_toward", why: `"${n.title}" looks like ${comp.title}`, createdBy: "linker" });
    }
    if (n.type === "deadline" && n.body.date) {
      for (const e of live) {
        if (e === n || e.type !== "deadline" || e.course !== n.course || !e.body.date || e.body.date === n.body.date || e.id < n.id || !similar(e.title, n.title)) continue;
        edges.push({ from: n.id, to: e.id, rel: "conflicts_with", why: `${n.locator ?? "one file"} says ${n.body.date}, ${e.locator ?? "another"} says ${e.body.date}`, createdBy: "linker" });
      }
    }
  }
  return edges;
}

// Same matcher as the Insights grade table, so a grade row lands under the same syllabus component everywhere.
const SYN: [RegExp, RegExp][] = [
  [/home ?work|hw|problem set|pset|assignment/i, /\b(hw|homework|problem set|pset|assignment|ps)\b|\bhw\d/i],
  [/quiz/i, /\bquiz/i],
  [/exam|midterm|final|test/i, /\b(exam|midterm|final|test)\b/i],
  [/project/i, /\bproject/i],
  [/lab/i, /\blab\b|\blab\d/i],
  [/participation|attendance|clicker|discussion/i, /\b(participation|attendance|clicker|discussion|in-class)\b/i],
  [/paper|essay|report|writing/i, /\b(paper|essay|report)\b/i],
];
export function matchesComponent(component: string, item: string) {
  for (const [c, i] of SYN) if (c.test(component) && i.test(item)) return true;
  const word = component.split(/\s+/)[0]?.replace(/[^a-z]/gi, "") ?? "";
  return word.length > 3 && new RegExp(`\\b${word}`, "i").test(item);
}

/**
 * Auto-confirm what is safe, everything else waits for the student:
 * - deadlines: high confidence and no clash (they move the Week and the tree's inputs)
 * - topics, contacts, grading, policies: high or medium (they only inform Viva and the grade table)
 * - low confidence: always proposed
 */
export function review(nodes: KbNode[], edges: KbEdge[]): KbNode[] {
  const clashing = new Set(edges.filter((e) => e.rel === "conflicts_with").flatMap((e) => [e.from, e.to]));
  return nodes.map((n) => {
    const ok = n.type === "deadline" || n.type === "grade_item" ? n.confidence === "high" && !clashing.has(n.id) : n.confidence !== "low";
    return { ...n, review: ok ? "confirmed" : "proposed" };
  });
}

/** The older `Source` shape the Week, the tree inputs and the coach still read. Built from nodes so one truth feeds everything. */
export function legacySource(kind: Classification["kind"], title: string, course: string, nodes: KbNode[]): Source | null {
  const mine = nodes.filter((n) => n.course === course && n.review !== "rejected");
  if (kind === "syllabus") {
    const policies: Record<string, string> = {};
    for (const p of mine.filter((n) => n.type === "policy")) policies[p.title.replace(/ /g, "_")] = String(p.body.text ?? "");
    return {
      kind: "syllabus",
      course,
      title,
      deadlines: mine.filter((n) => n.type === "deadline" && n.review === "confirmed" && !n.supersededBy).map((n) => ({ title: n.title, date: String(n.body.date ?? ""), kind: String(n.body.kind ?? "other") })),
      policies,
      grading: mine.filter((n) => n.type === "grading").map((n) => ({ component: n.title, weight_percent: (n.body.weight as number | null) ?? null })),
    };
  }
  if (kind === "grades")
    return {
      kind: "grades",
      course,
      title,
      items: mine.filter((n) => n.type === "grade_item").map((n) => ({ name: n.title, score: (n.body.score as number | null) ?? null, max: (n.body.max as number | null) ?? null, status: String(n.body.status ?? "unknown"), due: String(n.body.due ?? "") })),
    };
  const topics = mine.filter((n) => n.type === "topic");
  if (topics.length) return { kind: "note", course, title, summary: topics.map((t) => `${t.title}: ${String(t.body.summary ?? "")}`).join(" · ").slice(0, 1200) };
  return null;
}
