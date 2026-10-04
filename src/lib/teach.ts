// Teach mode (the Feynman technique): the student explains a concept from their own material
// and Viva, playing a curious beginner, checks it against that concept's key points. Nothing
// else counts, so Viva never judges from outside knowledge. The pure parts live here so the
// route, the page and the tests share one tally.
import type { Concept } from "./intel/study";

export const MAX_ROUNDS = 3;

/** What one explanation got across. Points are indices into the concept's key_points. */
export type TeachFeedback = {
  clear: number[]; // explained so a beginner would get it
  vague: { point: number; note: string }[]; // touched on but fuzzy or jargon; note says what was unclear
  check_notes: string[]; // claims the key points don't support: "check your notes", never "wrong"
  hint: string; // points toward one missing idea without stating it
  follow_up: string; // the question a curious beginner would ask next
  encouragement: string;
};
export type TeachRound = { explanation: string; feedback: TeachFeedback };
export type PointStatus = "clear" | "vague" | "missing";

/** Keep only real, distinct key-point indices; a point that is clear can't also be vague. */
export function clean(f: Partial<TeachFeedback>, n: number): TeachFeedback {
  const ok = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < n;
  const list = <T,>(v: T[] | undefined) => (Array.isArray(v) ? v : []);
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const clear = [...new Set(list(f.clear).filter(ok))].sort((a, b) => a - b);
  const taken = new Set(clear);
  const vague = list(f.vague)
    .filter((v) => ok(v?.point) && !taken.has(v.point) && !!taken.add(v.point))
    .map((v) => ({ point: v.point, note: text(v.note) }));
  return {
    clear,
    vague,
    check_notes: list(f.check_notes).map(text).filter(Boolean),
    hint: text(f.hint),
    follow_up: text(f.follow_up),
    encouragement: text(f.encouragement),
  };
}

/** Best status of each key point across rounds: explaining it clearly once is enough. */
export function tally(concept: Concept, rounds: TeachRound[]): PointStatus[] {
  const status: PointStatus[] = concept.key_points.map(() => "missing");
  for (const r of rounds) {
    for (const v of r.feedback.vague) if (status[v.point] === "missing") status[v.point] = "vague";
    for (const i of r.feedback.clear) if (status[i]) status[i] = "clear";
  }
  return status;
}

export const clearCount = (status: PointStatus[]) => status.filter((s) => s === "clear").length;

/** Key ideas a session didn't land, kept for the Study page: one item per course + concept. */
export type ReviewItem = {
  id: string;
  course: string; // slug
  topic: string;
  points: { text: string; status: "vague" | "missing" }[];
  doc?: { id: string; title: string }; // the course file the key points came from
  at: string;
};

/** The key points that still need work after a session, fuzzy ones first. */
export function weakPoints(concept: Concept, status: PointStatus[]): ReviewItem["points"] {
  const weak = concept.key_points.flatMap((text, i) => (status[i] === "vague" || status[i] === "missing" ? [{ text, status: status[i] as "vague" | "missing" }] : []));
  return [...weak.filter((p) => p.status === "vague"), ...weak.filter((p) => p.status === "missing")];
}

/** A session ends when every key point is clear or the rounds run out. */
export const finished = (status: PointStatus[], rounds: number) => status.every((s) => s === "clear") || rounds >= MAX_ROUNDS;

// ---- Starting from a sentence --------------------------------------------------------------
// "I'm struggling with glycolysis for BIO 181": which course, which of its files, whether the
// exam's study guide lists it, and what Viva says first. Matching here is plain word overlap, so
// it still works when Gemini doesn't; the route tries Gemini first for looser phrasing.

export type TeachCourse = { slug: string; code: string; name: string; exam: { title: string; date: string }; daysToExam: number };
export type TeachDoc = { id: string; course: string; title: string; summary: string; body: string };
/** Course code, file id, and the concept in the student's own words ("" when unknown). */
export type TeachMatch = { course: string; doc: string; topic: string };

const STOP = new Set(
  "the and for you can how why let its but not get got use was are has had did does with this that what when where which about into from your have just like want need help really keep think know trying going would could should some them they their there these those than then also very much more most because teach explain explaining struggling struggle stuck confused mixing test testing knowledge understand understanding feynman technique concept concepts topic topics class course lecture please today tomorrow week".split(" "),
);
const terms = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)));
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** Study guides, reviews and practice sets: they list what an exam covers. */
export const isGuide = (d: { title: string }) => /study guide|review|topics|practice|formula sheet/i.test(d.title);

/** The course a message names, by code ("BIO 181", "bio181") or a word of its name ("biology"). */
export function findCourse(message: string, courses: TeachCourse[]): TeachCourse | undefined {
  const flat = message.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const byCode = courses.find((c) => flat.includes(c.code.toLowerCase().replace(/[^a-z0-9]+/g, "")));
  if (byCode) return byCode;
  const said = [...terms(message)];
  const hits = courses.filter((c) => [...terms(c.name)].some((w) => w.length >= 5 && said.some((s) => s.length >= 3 && w.startsWith(s))));
  return hits.length === 1 ? hits[0] : undefined;
}

/** The file that best covers what was said: title and summary hits count double; guides lose ties to lectures. */
export function findDoc(text: string, docs: TeachDoc[]): TeachDoc | undefined {
  const t = terms(text);
  let best: TeachDoc | undefined;
  let top = 0;
  for (const d of docs) {
    const head = terms(`${d.title} ${d.summary}`);
    const body = terms(d.body);
    let score = isGuide(d) ? -0.5 : 0;
    for (const w of t) score += head.has(w) ? 2 : body.has(w) ? 1 : 0;
    if (score > top) [best, top] = [d, score];
  }
  return top >= 2 ? best : undefined;
}

/** Local stand-in for the route: course by name or code, then the best file in it. */
export function matchRequest(message: string, courses: TeachCourse[], docs: TeachDoc[]): TeachMatch {
  const c = findCourse(message, courses);
  const d = findDoc(message, c ? docs.filter((x) => x.course === c.code) : docs);
  return { course: c?.code ?? d?.course ?? "", doc: d?.id ?? "", topic: "" };
}

/** The study guide (title) that names every word of the topic, or "": evidence it's on the exam. */
export function onStudyGuide(topic: string, docs: TeachDoc[]): string {
  const t = [...terms(topic)];
  if (!t.length) return "";
  return docs.find((d) => isGuide(d) && t.every((w) => terms(d.body).has(w)))?.title ?? "";
}

/** Which concept the student meant: most shared words with its name (key points count less), or -1. */
export function matchConcept(concepts: Concept[], topic: string): number {
  const t = terms(topic);
  let best = -1;
  let top = 0;
  concepts.forEach((c, i) => {
    const name = terms(c.topic);
    const points = terms(c.key_points.join(" "));
    let score = 0;
    for (const w of t) score += name.has(w) ? 2 : points.has(w) ? 0.5 : 0;
    if (score > top) [best, top] = [i, score];
  });
  return top >= 1 ? best : -1;
}

/** New concepts first, then earlier ones whose names they don't repeat. */
export function mergeConcepts(fresh: Concept[], old: Concept[]): Concept[] {
  const seen = new Set(fresh.map((c) => c.topic.toLowerCase()));
  return [...fresh, ...old.filter((c) => !seen.has(c.topic.toLowerCase()))];
}

function when(date: string, days: number) {
  const d = new Date(date);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  const day = days <= 6 ? d.toLocaleDateString("en-US", { weekday: "long" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `on ${day}, ${days} days out`;
}

/** Viva's first line: the exam it's for (only when it's soon), where the material came from, then the ask. */
export function teachIntro(o: { course: TeachCourse; concept: string; doc?: string; guide?: string; topic?: string }): string {
  const parts: string[] = [];
  const days = o.course.daysToExam;
  if (days >= 0 && days <= 21) {
    const guide = o.guide ? `, and ${o.topic || o.concept} is on your ${lowerFirst(o.guide.replace(/\s*\(.*\)\s*$/, ""))}` : "";
    parts.push(`Your ${o.course.code} ${lowerFirst(o.course.exam.title)} is ${when(o.course.exam.date, days)}${guide}.`);
  }
  if (o.doc) parts.push(`I'm going off your "${o.doc}" file.`);
  parts.push(`Let's start with ${o.concept}: explain it to me like I've never heard of it.`);
  return parts.join(" ");
}

/** What Viva says out loud after a round: short enough to listen to, ending on a question while there's more to do. */
export function spoken(f: TeachFeedback, status: PointStatus[], rounds: number): string {
  if (status.every((s) => s === "clear")) return `${f.encouragement} You got every key idea from your notes across. Nice teaching!`.trim();
  if (rounds >= MAX_ROUNDS) return `${f.encouragement} Let's stop there. I'll put the ideas to review on your Study page.`.trim();
  return [f.encouragement, f.hint || f.vague[0]?.note, f.follow_up].filter(Boolean).join(" ");
}
