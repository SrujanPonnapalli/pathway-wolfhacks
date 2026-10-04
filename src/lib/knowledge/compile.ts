// The context compiler: what Viva gets to read about a course. Scoped, compact, and every line
// carries the node id so the model can cite it back (`used` in the agent's reply) and the UI can
// turn citations into chips that open the fact. Confirmed facts only; proposed ones are listed as
// "waiting for you" so Viva can say so instead of guessing.

import type { KbNode, Knowledge } from "./types";

export type Scope = { courses: string[]; all: string[] }; // course codes in focus, and every course the student has

const date = (n: KbNode) => {
  const d = String(n.body.date ?? "");
  const t = String(n.body.time ?? "");
  return d ? `${d}${t ? ` ${t}` : ""}` : "date not given";
};

function line(n: KbNode): string {
  const where = n.locator ? ` (${n.locator})` : "";
  switch (n.type) {
    case "deadline":
      return `[${n.id}] ${n.title} · ${date(n)}${n.body.weight ? ` · ${n.body.weight}%` : ""}${where}`;
    case "grading":
      return `[${n.id}] ${n.title}${n.body.weight != null ? ` ${n.body.weight}%` : ""}${where}`;
    case "grade_item":
      return `[${n.id}] ${n.title}: ${n.body.score ?? "–"}/${n.body.max ?? "–"} ${n.body.status}${n.body.due ? ` due ${n.body.due}` : ""}`;
    case "policy":
      return `[${n.id}] ${n.title}: ${String(n.body.text ?? "").slice(0, 160)}`;
    case "topic":
      return `[${n.id}] ${n.title}: ${String(n.body.summary ?? "").slice(0, 220)}${where}`;
    case "contact":
      return `[${n.id}] ${n.title}${n.body.email ? ` <${n.body.email}>` : ""}${n.body.office_hours ? ` · office hours ${n.body.office_hours}` : ""}`;
    case "preference":
      return `[${n.id}] ${n.title}`;
    default:
      return `[${n.id}] ${n.title}`;
  }
}

const mentions = (text: string, all: string[]) => {
  const m = text.toLowerCase().replace(/\s+/g, " ");
  return all.filter((code) => m.includes(code.toLowerCase()) || m.includes(code.toLowerCase().replace(" ", "")) || m.includes(code.toLowerCase().replace(" ", "-")));
};

/** Which courses a message is about: codes it names, else the ones the last turns named, else the page's course, else all. */
export function scopeFor(message: string, pageCourse: string | undefined, all: string[], recent: string[] = []): Scope {
  const named = mentions(message, all);
  if (named.length) return { courses: named, all };
  for (const r of [...recent].reverse()) {
    const prev = mentions(r, all);
    if (prev.length) return { courses: prev, all };
  }
  if (pageCourse && all.includes(pageCourse)) return { courses: [pageCourse], all };
  return { courses: all, all };
}

/** Compact, citable context for the courses in scope. Other courses get one line each. */
export function compileContext(kb: Knowledge, scope: Scope, maxChars = 6000, now = new Date()): { text: string; ids: string[] } {
  const live = kb.nodes.filter((n) => n.review !== "rejected" && !n.supersededBy);
  const L: string[] = [];
  const ids: string[] = [];
  const focus = scope.courses;
  // One course in focus gets every fact. Several (a question about the whole week) get the parts that
  // can change a plan: dates in the next two weeks, open and missing work, the weights. Graded history,
  // policies, contacts and topics are a question away ("in BIO 181, ...") and cost nothing until then.
  const brief = focus.length > 1;
  const soon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14).toISOString().slice(0, 10);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
  for (const code of scope.all) {
    const mine = live.filter((n) => n.course === code);
    if (!mine.length) continue;
    const confirmed = mine.filter((n) => n.review !== "proposed");
    const waiting = mine.filter((n) => n.review === "proposed");
    if (!focus.includes(code)) {
      L.push(`${code}: ${confirmed.length} facts on file (${count(confirmed)})`);
      continue;
    }
    const files = kb.sources.filter((s) => s.course === code);
    L.push(`${code} knowledge (cite ids in used)${files.length ? ` · files: ${files.map((f) => `${f.filename} [${f.kind}]`).join(", ")}` : ""}:`);
    const order: KbNode["type"][] = brief ? ["deadline", "grade_item", "grading"] : ["deadline", "grade_item", "grading", "policy", "contact", "topic", "course_info"];
    for (const t of order) {
      let rows = confirmed.filter((n) => n.type === t).sort((a, b) => String(a.body.date ?? a.body.due ?? "").localeCompare(String(b.body.date ?? b.body.due ?? "")));
      if (brief && t === "deadline") rows = rows.filter((n) => String(n.body.date ?? "") >= today && String(n.body.date ?? "") <= soon);
      if (brief && t === "grade_item") rows = rows.filter((n) => n.body.status !== "graded" && n.body.status !== "submitted");
      for (const n of rows) {
        L.push(`  ${line(n)}`);
        ids.push(n.id);
      }
    }
    if (brief) {
      const skipped = confirmed.length - ids.filter((id) => mine.some((n) => n.id === id)).length;
      if (skipped > 0) L.push(`  (${skipped} more facts on file: graded work, policies, people, ${confirmed.filter((n) => n.type === "topic").length} lecture files; ask about ${code} to see them)`);
    }
    if (waiting.length) L.push(`  waiting for the student to confirm (do not state as fact): ${waiting.map((n) => `${n.title}${n.type === "deadline" ? ` ${date(n)}` : ""}`).join("; ")}`);
  }
  const prefs = live.filter((n) => n.type === "preference");
  if (prefs.length) L.push(`things the student told Viva: ${prefs.map((n) => `[${n.id}] ${n.title}`).join("; ")}`);
  let text = L.join("\n");
  if (text.length > maxChars) text = text.slice(0, maxChars - 1) + "…";
  return { text, ids };
}

function count(nodes: KbNode[]) {
  const by: Record<string, number> = {};
  for (const n of nodes) by[n.type] = (by[n.type] ?? 0) + 1;
  return Object.entries(by)
    .map(([t, c]) => `${c} ${t.replace("_", " ")}${c === 1 ? "" : "s"}`)
    .join(", ");
}
