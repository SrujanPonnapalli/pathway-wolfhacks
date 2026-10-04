// Sample course records for the Courses tab, Insights, Study and Viva.
//
// The shared part of a course (syllabus, schedule, documents) lives in coursework-data.ts. The
// student-specific part (which assignments were submitted, their scores, which lectures were
// missed) is generated here from the numbers the profile already carries (on-time rate, missed
// deadlines, attendance, quiz average), so the records agree with the status the decision tree
// shows. Everything is deterministic: the same profile always gets the same gradebook.
//
// src/lib/knowledge/sample.ts turns these records into the knowledge graph every profile starts
// with (sources, facts with provenance), which is what the tree's inputs, Insights and Viva read.

import ROWS from "./rows.json" with { type: "json" };
import { NOW, type CourseSeed } from "./mock.ts";
import type { Features } from "./tree.ts";
import { COURSES, type AssignmentSpec, type CourseInfo } from "./coursework-data.ts";

export type AssignmentStatus =
  "graded" | "submitted" | "missing" | "not_submitted";
export type Assignment = AssignmentSpec & {
  status: AssignmentStatus;
  score: number | null;
};
export type Meeting = { date: string; status: "present" | "absent" | "late" };
export type CourseRecord = {
  code: string;
  assignments: Assignment[];
  attendance: Meeting[];
};

const TERM_START = "2026-08-17";
const NO_CLASS = new Set(["2026-09-07"]); // Labor Day
// Class meeting days per course (0 = Monday), matching the week grid in src/lib/schedule.ts.
const MEETS: Record<string, number[]> = {
  "BIO 181": [0, 2, 4],
  "ST 311": [1, 3],
  "CSC 216": [0, 2, 4],
  "MA 241": [1, 3],
  "ECE 200": [0, 2],
  "EC 201": [1, 3],
  "PY 205": [0, 2, 4],
  "CH 101": [0, 2, 4],
};
// The tree's own line for on-time submissions (public/models/tree_early.json). A generated
// gradebook keeps the student on the same side of it as their seeded number.
const ON_TIME_LINE = 0.79;
// Items a sample student is known to have missed (the sample inbox refers to them).
const KNOWN_MISSING: Record<string, string[]> = { "MA 241": ["Quiz 3"] };
const NEVER_MISSING = /exam|test|midterm/i;

export const courseInfo = (code: string): CourseInfo | undefined =>
  COURSES[code];

/** The numbers a course starts from before any logged activity: the dataset row behind it, then the profile's own values. */
export function baseFeatures(c: CourseSeed): Features {
  const rows = ROWS as Record<string, Features>;
  return { ...rows._median, ...(rows[c.row] ?? {}), ...c.x };
}

/** Small deterministic hash in [0, 1). */
function unit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayOf = (iso: string) => new Date(`${iso}T12:00:00`);

/** Every scheduled class meeting from the start of term up to (not including) today. */
export function meetingsBefore(code: string, now: Date = NOW): string[] {
  const days = MEETS[code] ?? [0, 2];
  const out: string[] = [];
  const today = ymd(now);
  for (let d = dayOf(TERM_START); ymd(d) < today; d.setDate(d.getDate() + 1)) {
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    const iso = ymd(d);
    if (days.includes(dow) && !NO_CLASS.has(iso)) out.push(iso);
  }
  return out;
}

/** Target score level for this student in this course, from the numbers the profile carries. */
function level(x: Features): number {
  const quiz = x.avg_practice_quiz_score ?? 0;
  const att = x.attendance_rate ?? 0.85;
  const raw = quiz > 0 ? 55 + 0.4 * quiz : 40 + 45 * att;
  return Math.min(95, Math.max(62, raw));
}

function categoryShift(category: string): number {
  if (/exam|test|midterm/i.test(category)) return -6;
  if (/quiz/i.test(category)) return -3;
  if (/lab|recitation/i.test(category)) return 4;
  if (/project/i.test(category)) return 2;
  return 1;
}

/** The gradebook and attendance log for one student in one course. */
export function recordFor(
  code: string,
  x: Features,
  now: Date = NOW,
): CourseRecord | null {
  const info = COURSES[code];
  if (!info) return null;
  const today = ymd(now);
  const past = info.assignments.filter((a) => a.due < today);
  const open = info.assignments.filter((a) => a.due >= today);

  // How many past items went unsubmitted: the profile's on-time rate, kept on its side of the model's line.
  const onTime = x.on_time_submission_rate ?? 0.85;
  const missable = past.filter(
    (a) => !NEVER_MISSING.test(a.category) && !NEVER_MISSING.test(a.name),
  );
  let missing = Math.round(past.length * (1 - onTime));
  missing = Math.max(0, Math.min(missable.length, missing));
  const rate = (n: number) =>
    past.length ? (past.length - n) / past.length : 1;
  const wantSign = onTime <= ON_TIME_LINE;
  if (past.length) {
    if (wantSign && rate(missing) > ON_TIME_LINE)
      missing = Math.min(missable.length, missing + 1);
    if (!wantSign && rate(missing) <= ON_TIME_LINE)
      missing = Math.max(0, missing - 1);
  }
  const forced = new Set(KNOWN_MISSING[code] ?? []);
  const ranked = [...missable].sort((a, b) => {
    const fa = forced.has(a.name) ? -1 : unit(`${code}|${a.name}|miss`);
    const fb = forced.has(b.name) ? -1 : unit(`${code}|${b.name}|miss`);
    return fa - fb;
  });
  const missed = new Set(ranked.slice(0, missing).map((a) => a.name));

  // Work turned in during the last three days is still being graded.
  const recent = new Date(now);
  recent.setDate(recent.getDate() - 3);
  const recentIso = ymd(recent);
  const mean = level(x);
  const assignments: Assignment[] = [
    ...past.map((a): Assignment => {
      if (missed.has(a.name)) return { ...a, status: "missing", score: null };
      if (a.due >= recentIso) return { ...a, status: "submitted", score: null };
      const pct =
        mean +
        categoryShift(a.category) +
        (unit(`${code}|${a.name}|score`) - 0.5) * 14;
      return {
        ...a,
        status: "graded",
        score: Math.max(0, Math.min(a.max, Math.round((a.max * pct) / 100))),
      };
    }),
    ...open.map((a): Assignment => ({
      ...a,
      status: "not_submitted",
      score: null,
    })),
  ];

  // Attendance: the profile's rate spread over the real meeting dates, never the first two.
  const meetings = meetingsBefore(code, now);
  const att = x.attendance_rate ?? 0.85;
  const absences = Math.max(
    0,
    Math.min(meetings.length - 2, Math.round(meetings.length * (1 - att))),
  );
  const order = meetings
    .map((date, i) => ({
      date,
      i,
      k: i < 2 ? 2 : unit(`${code}|${date}|absent`),
    }))
    .sort((a, b) => a.k - b.k);
  const absent = new Set(order.slice(0, absences).map((m) => m.date));
  const late =
    meetings.length > 10
      ? (order.filter((m) => m.i >= 2 && !absent.has(m.date)).at(-1)?.date ??
        "")
      : "";
  const attendance: Meeting[] = meetings.map((date) => ({
    date,
    status: absent.has(date) ? "absent" : date === late ? "late" : "present",
  }));

  return { code, assignments, attendance };
}

export const fmtDueDay = (iso: string) =>
  dayOf(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
