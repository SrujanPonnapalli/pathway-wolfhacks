// Browser-side helpers for the intelligence routes. UI code calls these; nothing else
// needs to know the request shapes. All of them throw an Error with a readable message.

import { deviceContext } from "./awareness";
import { meta } from "./features";
import { usedFeatures } from "./tree";
import type { CoachContext, CoachMode, CoachReply } from "./intel/coach";
import type { AgentContext, AgentReply } from "./intel/agent";
import type { Syllabus } from "./intel/syllabus";
import type { Concept, StudyMaterial, VivaFeedback, VivaQuestion } from "./intel/study";
import type { TeachFeedback, TeachMatch, TeachRound } from "./teach";
import type { DatasetInsights, DatasetProfile } from "./intel/dataset";
import type { Classification, GenericSummary, GradeImport } from "./intel/analyze";
import type { Source } from "./intel/coach";
import type { CourseView, Block } from "./store";

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

function form(file: File, extra: Record<string, string | undefined> = {}) {
  const fd = new FormData();
  fd.append("file", file);
  for (const [k, v] of Object.entries(extra)) if (v != null) fd.append(k, v);
  return fd;
}

/** Drop anything: Gemini says what it is and extracts accordingly. */
export type AnalyzeResult = {
  classification: Classification;
  syllabus?: Syllabus;
  grades?: GradeImport;
  study?: StudyMaterial;
  profile?: DatasetProfile;
  insights?: DatasetInsights;
  generic?: GenericSummary;
};
export const analyzeFile = (file: File, opts: { question?: string; courses?: string[] } = {}) =>
  fetch("/api/analyze", { method: "POST", body: form(file, { question: opts.question, courses: opts.courses?.join(",") }) }).then(json<AnalyzeResult>);

export const parseSyllabus = (file: File, today?: string) =>
  fetch("/api/syllabus", { method: "POST", body: form(file, { today }) }).then(json<Syllabus>);

export const makeStudyMaterial = (file: File, counts: { quiz?: number; viva?: number; flashcards?: number; concepts?: number } = {}, focus?: string) =>
  fetch("/api/quiz", { method: "POST", body: form(file, { quiz: counts.quiz?.toString(), viva: counts.viva?.toString(), flashcards: counts.flashcards?.toString(), concepts: counts.concepts?.toString(), focus }) }).then(json<StudyMaterial>);

export const gradeViva = (question: VivaQuestion, answer: string) =>
  fetch("/api/viva", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, answer }) }).then(json<VivaFeedback>);

/** Teach mode: one round of feedback on the student's explanation of a concept. */
export const teachFeedback = (concept: Concept, explanation: string, earlier: TeachRound[]) =>
  fetch("/api/feynman", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ concept, explanation, earlier }) }).then(json<TeachFeedback>);

/** Teach mode from a sentence: which course and file the student means. */
export const teachStart = (message: string, courses: { code: string; name: string }[], docs: { id: string; course: string; title: string; summary: string }[]) =>
  fetch("/api/teach/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, courses, docs }) }).then(json<TeachMatch>);

/** Teach mode: concepts and key points from one course file, with the student's topic first when given. */
export const teachConcepts = (title: string, body: string, focus?: string) =>
  fetch("/api/teach/concepts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, body, focus }) })
    .then(json<{ concepts: Concept[] }>)
    .then((r) => r.concepts);

export const analyzeDataset = (file: File, question?: string) =>
  fetch("/api/dataset", { method: "POST", body: form(file, { question }) }).then(json<{ profile: DatasetProfile; insights: DatasetInsights }>);

/** Build the coach's context from what usePathway() already has. Status stays on-device; we send numbers, not identity. */
export function coachContext(input: {
  now: Date;
  studentName: string;
  courses: CourseView[];
  todos: { title: string; detail: string; due?: string }[];
  blocks: Block[];
  sources?: Source[];
  inbox?: { from: string; subject: string; course: string; snippet: string }[];
  week?: { title: string; start: string; end: string; kind: string }[];
  suggestions?: { title: string; why: string }[];
  profileId?: string;
}): CoachContext {
  // Kiosk camera's latest structured observation, when one exists. Read at send time so
  // /device and /viva share the same facts; null when no camera has run in this tab.
  const dc = deviceContext();
  if (dc) console.debug("[device] context → coach:", JSON.stringify(dc)); // TEMP debug
  return {
    now: input.now.toISOString(),
    studentName: input.studentName,
    courses: input.courses.map((c) => ({
      slug: c.slug,
      code: c.code,
      name: c.name,
      exam: c.exam,
      daysToExam: c.daysToExam,
      status: c.result.atRisk ? "check_in" : "on_track",
      // Only numbers that matter to this tree or that the student can move; keeps the prompt small.
      x: Object.fromEntries(Object.entries(c.x).filter(([f]) => !f.startsWith("course_") && !f.endsWith("_missing") && (meta(f).role === "suggest" || usedFeatures(c.tree).includes(f)))),
      steps: c.steps.map(({ feature, threshold, value, above }) => ({ feature, threshold, value, above })),
      recourse: c.rec?.moves ?? null,
      similarStudentsStruggledPct: Math.round(c.result.pRisk * 100),
    })),
    todos: input.todos,
    blocks: input.blocks,
    sources: input.sources ?? [],
    inbox: input.inbox ?? [],
    week: input.week ?? [],
    suggestions: input.suggestions ?? [],
    focusTimer: input.profileId ? focusTimerFor(input.profileId, input.courses) : null,
    deviceContext: dc,
  };
}

/** The focus timer as Viva should know it, read from what StudyTimer keeps for this profile (null when idle). */
function focusTimerFor(profileId: string, courses: CourseView[]): CoachContext["focusTimer"] {
  try {
    const t = JSON.parse(localStorage.getItem(`pathway:focus-timer:${profileId}`) ?? "null");
    if (!t || (t.status !== "running" && t.status !== "paused" && t.status !== "done")) return null;
    const left = t.status === "running" ? Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000)) : t.left;
    return { status: t.status, course: courses.find((c) => c.slug === t.course)?.code ?? "", minutesLeft: Math.ceil(left / 60) };
  } catch {
    return null;
  }
}

/** Turn an analyze result into the compact Source the coach reads. */
export function toSource(r: AnalyzeResult, course: string): Source | null {
  if (r.syllabus) {
    const s = r.syllabus;
    return { kind: "syllabus", course, title: r.classification.title, deadlines: s.deadlines.map((d) => ({ title: d.title, date: d.date, kind: d.kind })), policies: s.policies as unknown as Record<string, string>, grading: s.grading.map((g) => ({ component: g.component, weight_percent: g.weight_percent })) };
  }
  if (r.grades) return { kind: "grades", course, title: r.classification.title, items: r.grades.items };
  if (r.generic) return { kind: "note", course, title: r.classification.title, summary: r.generic.summary };
  if (r.study) return { kind: "note", course, title: r.classification.title, summary: `Study material: ${r.study.topics.join(", ")}` };
  return null;
}

export const askCoach = (message: string, context: CoachContext, history: { role: "you" | "viva" | "coach"; text: string }[] = [], mode: CoachMode = "chat") =>
  fetch("/api/coach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, context, history, mode }) }).then(json<CoachReply>);

/** Viva's agent turn: one call that returns what to say and what to do. The caller executes the actions. */
export const askAgent = (message: string, context: AgentContext, history: { role: "you" | "viva" | "coach"; text: string }[] = []) =>
  fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, context, history }) }).then(json<AgentReply>);
