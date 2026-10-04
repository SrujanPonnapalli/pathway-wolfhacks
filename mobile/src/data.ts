// Demo data for the mobile app: Maya's sample profile, scored on-device by the same
// decision-tree JSON the web app ships (assets/models). Mirrors src/lib/mock.ts + store.tsx.
import treeEarlyJson from "../assets/models/tree_early.json";
import treeMidJson from "../assets/models/tree_mid.json";
import { ACTIONABLE } from "./model/features";
import { planBlocks } from "./model/plan";
import { explain, predict, recourse, type Features, type Tree } from "./model/tree";
import ROWS from "./model/rows.json";

// Fixed demo clock so dates, countdowns and the greeting agree with the web demo.
export const NOW = new Date("2026-10-06T09:00:00");

const TREES: Record<"early" | "mid", Tree> = {
  early: treeEarlyJson as Tree,
  mid: treeMidJson as Tree,
};

export type CourseSeed = {
  slug: string;
  code: string;
  name: string;
  row: string;
  exam: { title: string; date: string };
  x: Features;
};

export type Block = { id: string; course: string; title: string; at: string; done: boolean };
export type Todo = { id: string; title: string; detail: string; course: string; due?: string };
export type ClassMeeting = { course: string; title: string; at: string };

const COURSE_NAMES: Record<string, string> = {
  "BIO 181": "Introductory Biology",
  "ST 311": "Intro to Statistics",
  "CSC 216": "Software Development Fundamentals",
  "MA 241": "Calculus II",
};

const course = (code: string, rowId: string, exam: [string, string], x: Features): CourseSeed => ({
  slug: code.toLowerCase().replace(" ", "-"),
  code,
  name: COURSE_NAMES[code],
  row: rowId,
  exam: { title: exam[0], date: exam[1] },
  x,
});

// Maya, sophomore — same dataset rows as the web demo (src/lib/mock.ts).
export const PROFILE = {
  id: "maya",
  name: "Maya",
  classYear: "Sophomore",
  streakDays: 4,
  courses: [
    course("BIO 181", "S1070", ["Midterm", "2026-10-10T10:00:00"], { avg_days_started_before_exam: 1, attendance_rate: 0.73, practice_quizzes_taken: 0, on_time_submission_rate: 0.79, late_night_study_pct: 0.28, missed_deadlines: 2, work_hours_per_week: 13, credit_hours: 16 }),
    course("ST 311", "S1056", ["Midterm", "2026-10-14T13:30:00"], { avg_days_started_before_exam: 5.2, attendance_rate: 0.87, practice_quizzes_taken: 23, on_time_submission_rate: 0.85, late_night_study_pct: 0.17, missed_deadlines: 1, work_hours_per_week: 13, credit_hours: 16 }),
    course("CSC 216", "S1003", ["Exam 1", "2026-10-16T11:45:00"], { avg_days_started_before_exam: 4, attendance_rate: 0.95, practice_quizzes_taken: 30, on_time_submission_rate: 0.88, late_night_study_pct: 0.27, missed_deadlines: 3, work_hours_per_week: 13, credit_hours: 16 }),
    course("MA 241", "S1202", ["Test 2", "2026-10-20T08:30:00"], { avg_days_started_before_exam: 4, attendance_rate: 0.83, practice_quizzes_taken: 13, on_time_submission_rate: 0.9, late_night_study_pct: 0.3, missed_deadlines: 2, work_hours_per_week: 13, credit_hours: 16 }),
  ],
  classes: [
    { course: "bio-181", title: "BIO 181 lecture", at: "2026-10-06T09:35:00" },
    { course: "st-311", title: "ST 311 lecture", at: "2026-10-06T13:30:00" },
  ] as ClassMeeting[],
  todos: [
    { id: "syllabus", title: "Confirm 3 dates from your BIO 181 syllabus", detail: "Found in the PDF you uploaded", course: "bio-181" },
    { id: "st-hw4", title: "Submit ST 311 HW 4", detail: "Due tonight", course: "st-311", due: "2026-10-06T23:59:00" },
    { id: "csc-cards", title: "Review 24 CSC 216 flashcards", detail: "About 10 minutes", course: "csc-216" },
  ] as Todo[],
};

// ---- scoring (mirrors featuresFor + score in src/lib/store.tsx) ------------------------------

const COURSE_FLAGS = ["BIO 181", "CH 101", "CSC 216", "EC 201", "ECE 200", "MA 241", "PY 205", "ST 311"];
const YEAR_ORD: Record<string, number> = { Freshman: 1, Sophomore: 2, Junior: 3, Senior: 4 };
const rows = ROWS as Record<string, Features>;

function featuresFor(c: CourseSeed): Features {
  const x: Features = { ...(rows._median ?? {}), ...(rows[c.row] ?? {}), ...c.x };
  for (const code of COURSE_FLAGS) x[`course_${code.replace(" ", "_")}`] = code === c.code ? 1 : 0;
  if (YEAR_ORD[PROFILE.classYear]) x.class_year_ord = YEAR_ORD[PROFILE.classYear];
  x.work_hours_missing = 0;
  x.sleep_missing = 0;
  return x;
}

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const daysBetween = (a: Date, b: Date) => Math.round((midnight(b) - midnight(a)) / 86_400_000);

export type CourseView = CourseSeed & {
  x: Features;
  horizon: "early" | "mid";
  tree: Tree;
  daysToExam: number;
  result: ReturnType<typeof predict>;
  steps: ReturnType<typeof explain>;
  rec: ReturnType<typeof recourse>;
};

export function scoreCourse(c: CourseSeed): CourseView {
  const horizon = "early" as const; // no midterm scores in the demo
  const x = featuresFor(c);
  const tree = TREES[horizon];
  const result = predict(tree, x);
  return {
    ...c,
    x,
    horizon,
    tree,
    daysToExam: daysBetween(NOW, new Date(c.exam.date)),
    result,
    steps: explain(tree, result.path, x),
    rec: result.atRisk ? recourse(tree, x, ACTIONABLE) : null,
  };
}

export const COURSES: CourseView[] = PROFILE.courses.map(scoreCourse);

// The course that needs attention first, else the nearest exam.
export const FOCUS: CourseView =
  [...COURSES].filter((c) => c.result.atRisk).sort((a, b) => a.daysToExam - b.daysToExam)[0] ??
  [...COURSES].sort((a, b) => a.daysToExam - b.daysToExam)[0];

// Seed the week: the model's own plan for the focus course plus a couple of regular blocks.
export const INITIAL_BLOCKS: Block[] = [
  ...(FOCUS.rec ? planBlocks(FOCUS, FOCUS.rec.moves, NOW) : []),
  { id: "b-st-quiz", course: "st-311", title: "ST 311 practice quiz", at: "2026-10-07T17:00:00", done: false },
  { id: "b-ma-review", course: "ma-241", title: "MA 241 review session", at: "2026-10-08T16:00:00", done: false },
].map((b, i) => ({ done: false, id: `b-${i}`, ...b }));

export const INITIAL_DONE: Record<string, boolean> = {};

// ---- formatting -----------------------------------------------------------------------------

export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export const greet = (h: number) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
