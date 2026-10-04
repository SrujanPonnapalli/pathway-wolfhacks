// Viva's brain. One fast Gemini call, no tools, no thinking: the browser sends the numbers
// it already has (status is computed on-device in src/lib/store.tsx) plus anything the
// student dropped in (syllabus facts, Gradescope grades), and the model answers from that
// context alone. A phrase filter blocks causal wording.

import type { Content } from "@google/genai";
import { answerFast } from "../gemini";
import { meta } from "../features";

export type CoachCourse = {
  slug: string;
  code: string;
  name: string;
  exam: { title: string; date: string };
  daysToExam: number;
  status: "on_track" | "check_in";
  x: Record<string, number>;
  steps: { feature: string; threshold: number; value: number; above: boolean }[];
  recourse: { feature: string; from: number; to: number }[] | null;
  similarStudentsStruggledPct: number;
};

/** Things the student dropped in: parsed on the server, kept on their device, sent back as context. */
export type Source =
  | { kind: "syllabus"; course: string; title: string; deadlines: { title: string; date: string; kind: string }[]; policies: Record<string, string>; grading: { component: string; weight_percent: number | null }[] }
  | { kind: "grades"; course: string; title: string; items: { name: string; score: number | null; max: number | null; status: string; due: string }[] }
  | { kind: "note"; course: string; title: string; summary: string };

export type CoachContext = {
  now: string;
  studentName: string;
  courses: CoachCourse[];
  todos: { title: string; detail: string; due?: string }[];
  blocks: { course: string; title: string; at: string; done: boolean }[];
  sources?: Source[];
  inbox?: { from: string; subject: string; course: string; snippet: string }[];
  week?: { title: string; start: string; end: string; kind: string }[]; // this week's calendar
  suggestions?: { title: string; why: string }[]; // pending schedule changes awaiting approval
  focusTimer?: { status: "running" | "paused" | "done"; course: string; minutesLeft: number } | null; // Study's 25-minute timer
  // Structured scene facts from the kiosk camera, when it has seen anything. Observed
  // facts only — the vision layer never infers anything about the person.
  deviceContext?: {
    personPresent: boolean;
    studyMaterialsVisible: boolean;
    phoneVisible: boolean;
    activity: string;
    lastEvent: string | null;
    lastUpdated: string;
  } | null;
};

export type CoachReply = { text: string; filtered: boolean; ms: number };

const SYSTEM = `You are Viva, Pathway's study coach: a warm, plain-spoken TA on the student's side.
Answer in at most three short sentences, then one question back. Plain words, no headers, no bullet lists, no markdown.
Rules:
1. Use ONLY the facts in CONTEXT. Every number, date, grade, status or deadline you say must appear there. If it is not there, say you don't have it.
2. Statuses are only "on track" or "worth a check-in". Never say failing, at risk, behind, or in trouble.
3. Patterns, never cause and effect: "students with similar patterns often do better when...". Never "this will raise your grade", "you will pass", "guarantees".
4. Only suggest changing features marked role=suggest. Never suggest changing work hours, sleep, credit hours, class year, or uploading more files.
5. When you suggest something, put a day on it.
6. Asked about the week, schedule, or time: answer from "calendar this week" and "pending schedule suggestions". If a
   suggestion is pending, name it and say they can approve it on the Week page. Do not invent other changes.
7. The "desk camera" line, when present, reports plainly observed scene facts (presence, visible objects) from the
   kiosk camera. You may use it only for presence and schedule relevance: welcoming the student back, noting they
   stepped away during a study block, acknowledging materials are out. Never infer or claim emotion, stress, focus,
   tiredness, health, identity, or anything about the person beyond presence and visible objects. Never change or
   comment on a status because of it.`;

const DRAFT_SYSTEM = `You write short emails for a college student, in their voice, ready to send.
Rules: reply body only, no subject line, no greeting placeholders like [Name]; 3 to 5 sentences; polite and specific;
use ONLY facts from CONTEXT (schedule, deadlines, grades) to pick times or reference work. Never promise outcomes.
Sign off with the student's first name if it is in CONTEXT, otherwise no signature.`;

const ADVISOR_SYSTEM = `You write a short note from a college student to their academic advisor, in the student's own voice, ready to paste into an email.
Rules: body only, no subject line, no [placeholders]; 4 to 6 plain sentences, no markdown.
Say which course Pathway flagged as "worth a check-in" and why, in everyday words taken from CONTEXT (the "why" facts), never "at risk" or "failing".
Say what the student is changing (the change set in the request) and when the study blocks are, if CONTEXT has them.
Ask for one concrete thing (a short meeting or a pointer to a resource). Never promise outcomes or grades.
Sign off with the student's first name if it is in CONTEXT, otherwise no signature.`;

export type CoachMode = "chat" | "draft" | "advisor";

export const CAUSAL = /\b(will (raise|improve|fix|guarantee|boost|make you pass)|guarantees?|causes?|this will|you will pass|you'll pass)\b/i;

/** Render the context as compact lines the model reads once. Smaller prompt = faster answer. */
export function renderContext(ctx: CoachContext): string {
  const L: string[] = [];
  L.push(`today: ${ctx.now.slice(0, 10)}${ctx.studentName ? `; student: ${ctx.studentName}` : ""}`);
  for (const c of ctx.courses) {
    const status = c.status === "check_in" ? "worth a check-in" : "on track";
    L.push(`course ${c.code} (${c.name}): ${status}; ${c.exam.title} ${c.exam.date.slice(0, 10)} in ${c.daysToExam} days; ${c.similarStudentsStruggledPct}% of similar students struggled`);
    L.push(`  why: ${c.steps.map((s) => meta(s.feature).fact(s.value)).join("; ")}`);
    L.push(`  numbers: ${Object.entries(c.x).map(([f, v]) => `${meta(f).label}=${meta(f).fmt(v)} [role=${meta(f).role}]`).join(", ")}`);
    if (c.status === "check_in" && c.recourse?.length)
      L.push(`  smallest change to on track: ${c.recourse.map((m) => `${meta(m.feature).label} ${meta(m.feature).fmt(m.from)} -> ${meta(m.feature).fmt(m.to)}`).join("; ")}`);
  }
  if (ctx.todos.length) L.push(`to-dos: ${ctx.todos.map((t) => `${t.title}${t.due ? ` (due ${t.due.slice(0, 16)})` : ""}`).join("; ")}`);
  if (ctx.blocks.length) L.push(`study blocks: ${ctx.blocks.map((b) => `${b.title} ${b.at.slice(0, 16)}${b.done ? " done" : ""}`).join("; ")}`);
  for (const s of ctx.sources ?? []) {
    if (s.kind === "syllabus") {
      L.push(`syllabus ${s.course} (${s.title}): deadlines ${s.deadlines.map((d) => `${d.title} ${d.date || "date not given"}`).join("; ") || "none"}`);
      const pol = Object.entries(s.policies).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ");
      if (pol) L.push(`  policies: ${pol}`);
      const gr = s.grading.filter((g) => g.weight_percent != null).map((g) => `${g.component} ${g.weight_percent}%`).join(", ");
      if (gr) L.push(`  grading: ${gr}`);
    } else if (s.kind === "grades") {
      L.push(`grades ${s.course} (${s.title}): ${s.items.map((i) => `${i.name} ${i.score ?? "-"}/${i.max ?? "-"} ${i.status}${i.due ? ` due ${i.due}` : ""}`).join("; ")}`);
    } else {
      L.push(`note ${s.course} (${s.title}): ${s.summary}`);
    }
  }
  if (ctx.inbox?.length) L.push(`inbox: ${ctx.inbox.map((m) => `${m.course} from ${m.from}: "${m.subject}" ${m.snippet}`).join(" | ")}`);
  if (ctx.week?.length) L.push(`calendar this week: ${ctx.week.map((e) => `${e.title} ${e.start.slice(5, 16).replace("T", " ")}-${e.end.slice(11, 16)} [${e.kind}]`).join("; ")}`);
  if (ctx.suggestions?.length) L.push(`pending schedule suggestions (student must approve on the Week page): ${ctx.suggestions.map((x) => `${x.title} (${x.why})`).join("; ")}`);
  if (ctx.focusTimer) {
    const f = ctx.focusTimer;
    L.push(`focus timer (25-minute session): ${f.status === "done" ? "just finished" : `${f.status}, ${f.minutesLeft} min left`}${f.course ? ` for ${f.course}` : ""}`);
  }
  if (ctx.deviceContext) {
    const d = ctx.deviceContext;
    L.push(
      `desk camera (observed scene facts only): person ${d.personPresent ? "present" : "away"}; study materials ${d.studyMaterialsVisible ? "visible" : "not visible"}; phone ${d.phoneVisible ? "visible" : "not visible"}; activity ${d.activity}${d.lastEvent ? `; last event ${d.lastEvent}` : ""}; observed ${d.lastUpdated.slice(11, 16)}`,
    );
  }
  return L.join("\n");
}

export async function coach(message: string, ctx: CoachContext, history: { role: "you" | "viva" | "coach"; text: string }[] = [], mode: CoachMode = "chat"): Promise<CoachReply> {
  const t0 = Date.now();
  const hist: Content[] = history.slice(-6).map((h) => ({ role: h.role === "you" ? "user" : "model", parts: [{ text: h.text }] }));
  const system = mode === "draft" ? DRAFT_SYSTEM : mode === "advisor" ? ADVISOR_SYSTEM : SYSTEM;
  let text = await answerFast({ system, context: renderContext(ctx), history: hist, message, maxTokens: mode === "chat" ? 400 : 700 });
  let filtered = false;
  if (CAUSAL.test(text)) {
    filtered = true;
    text = text.replace(new RegExp(CAUSAL.source, "gi"), "often goes with better outcomes");
  }
  return { text: text.trim(), filtered, ms: Date.now() - t0 };
}
