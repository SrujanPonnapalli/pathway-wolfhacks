// Demo content. Read it through src/lib/data.ts, not directly, so the swap to real APIs is one file.
// Sample students are stitched from real rows of data/student_outcomes.csv (one row per course; the
// dataset has one row per student). Values are end-of-semester totals, shown as "projected" pace.
import type { Features } from "./tree";

// Fixed demo clock so dates, countdowns and the greeting agree. Swap for `new Date()` when live.
export const NOW = new Date("2026-10-06T09:00:00");

export type CourseSeed = {
  slug: string;
  code: string;
  name: string;
  row: string; // dataset student_id this course's numbers come from
  exam: { title: string; date: string };
  x: Features;
};

export type ClassSeed = { course: string; title: string; at: string };
export type TodoSeed = { id: string; title: string; detail: string; href: string; due?: string };

export type Profile = {
  id: string;
  name: string;
  classYear: string;
  streakDays: number;
  sample: boolean; // built from dataset rows (synthetic) vs. the live judge profile
  account?: boolean; // the signed-in Google account's own profile
  courses: CourseSeed[];
  classes: ClassSeed[];
  todos: TodoSeed[];
};

const row = (o: Record<string, number>) => o as Features;

export const COURSE_NAMES: Record<string, string> = {
  "BIO 181": "Introductory Biology",
  "ST 311": "Intro to Statistics",
  "CSC 216": "Software Development Fundamentals",
  "MA 241": "Calculus II",
  "ECE 200": "Intro to Signals, Circuits and Systems",
  "EC 201": "Principles of Microeconomics",
  "PY 205": "Physics for Engineers I",
  "CH 101": "Chemistry: A Molecular Science",
};

const course = (code: string, rowId: string, exam: [string, string], x: Features): CourseSeed => ({
  slug: code.toLowerCase().replace(" ", "-"),
  code,
  name: COURSE_NAMES[code],
  row: rowId,
  exam: { title: exam[0], date: exam[1] },
  x,
});

export const PROFILES: Profile[] = [
  {
    id: "maya",
    name: "Maya",
    classYear: "Sophomore",
    streakDays: 4,
    sample: true,
    courses: [
      course("BIO 181", "S1070", ["Midterm", "2026-10-10T10:00"], row({ avg_days_started_before_exam: 1, attendance_rate: 0.73, practice_quizzes_taken: 0, on_time_submission_rate: 0.79, late_night_study_pct: 0.28, missed_deadlines: 2, work_hours_per_week: 13, credit_hours: 16 })),
      course("ST 311", "S1056", ["Midterm", "2026-10-14T13:30"], row({ avg_days_started_before_exam: 5.2, attendance_rate: 0.87, practice_quizzes_taken: 23, on_time_submission_rate: 0.85, late_night_study_pct: 0.17, missed_deadlines: 1, work_hours_per_week: 13, credit_hours: 16 })),
      course("CSC 216", "S1003", ["Exam 1", "2026-10-16T11:45"], row({ avg_days_started_before_exam: 4, attendance_rate: 0.95, practice_quizzes_taken: 30, on_time_submission_rate: 0.88, late_night_study_pct: 0.27, missed_deadlines: 3, work_hours_per_week: 13, credit_hours: 16 })),
      course("MA 241", "S1202", ["Test 2", "2026-10-20T08:30"], row({ avg_days_started_before_exam: 4, attendance_rate: 0.83, practice_quizzes_taken: 13, on_time_submission_rate: 0.9, late_night_study_pct: 0.3, missed_deadlines: 2, work_hours_per_week: 13, credit_hours: 16 })),
    ],
    classes: [
      { course: "bio-181", title: "BIO 181 lecture", at: "2026-10-06T09:35" },
      { course: "st-311", title: "ST 311 lecture", at: "2026-10-06T13:30" },
    ],
    todos: [
      { id: "syllabus", title: "Confirm 3 dates from your BIO 181 syllabus", detail: "Found in the PDF you uploaded", href: "/insights?course=bio-181" },
      { id: "st-hw4", title: "Submit ST 311 HW 4", detail: "Due tonight", href: "/study?course=st-311", due: "2026-10-06T23:59" },
      { id: "csc-cards", title: "Review 24 CSC 216 flashcards", detail: "About 10 minutes", href: "/study?tool=flashcards&course=csc-216" },
    ],
  },
  {
    id: "jordan",
    name: "Jordan",
    classYear: "Junior",
    streakDays: 2,
    sample: true,
    courses: [
      course("ECE 200", "S1213", ["Midterm", "2026-10-09T15:00"], row({ avg_days_started_before_exam: 2.9, attendance_rate: 0.81, practice_quizzes_taken: 6, on_time_submission_rate: 0.76, late_night_study_pct: 0.41, missed_deadlines: 3, work_hours_per_week: 34, credit_hours: 16 })),
      course("EC 201", "S1050", ["Exam 2", "2026-10-15T10:15"], row({ avg_days_started_before_exam: 6.8, attendance_rate: 0.99, practice_quizzes_taken: 30, on_time_submission_rate: 0.88, late_night_study_pct: 0.25, missed_deadlines: 2, work_hours_per_week: 34, credit_hours: 16 })),
      course("PY 205", "S1108", ["Test 2", "2026-10-13T08:30"], row({ avg_days_started_before_exam: 3.9, attendance_rate: 0.82, practice_quizzes_taken: 23, on_time_submission_rate: 0.82, late_night_study_pct: 0.17, missed_deadlines: 2, work_hours_per_week: 34, credit_hours: 16 })),
    ],
    classes: [{ course: "ece-200", title: "ECE 200 lab", at: "2026-10-06T11:20" }],
    todos: [
      { id: "ece-hw", title: "Submit ECE 200 problem set 5", detail: "Due Wednesday", href: "/study?course=ece-200", due: "2026-10-08T23:59" },
      { id: "py-quiz", title: "PY 205 practice quiz", detail: "15 minutes", href: "/study?tool=quiz&course=py-205" },
    ],
  },
  {
    id: "priya",
    name: "Priya",
    classYear: "Freshman",
    streakDays: 9,
    sample: true,
    courses: [
      course("CH 101", "S1154", ["Exam 1", "2026-10-08T09:00"], row({ avg_days_started_before_exam: 3.7, attendance_rate: 0.83, practice_quizzes_taken: 22, on_time_submission_rate: 0.95, late_night_study_pct: 0.31, missed_deadlines: 1, work_hours_per_week: 0, credit_hours: 15 })),
      course("MA 241", "S1197", ["Test 2", "2026-10-20T08:30"], row({ avg_days_started_before_exam: 6.4, attendance_rate: 0.88, practice_quizzes_taken: 20, on_time_submission_rate: 0.94, late_night_study_pct: 0.1, missed_deadlines: 1, work_hours_per_week: 0, credit_hours: 15 })),
      course("BIO 181", "S1001", ["Midterm", "2026-10-10T10:00"], row({ avg_days_started_before_exam: 4, attendance_rate: 0.84, practice_quizzes_taken: 8, on_time_submission_rate: 0.81, late_night_study_pct: 0.07, missed_deadlines: 3, work_hours_per_week: 0, credit_hours: 15 })),
    ],
    classes: [{ course: "ch-101", title: "CH 101 lecture", at: "2026-10-06T10:40" }],
    todos: [{ id: "ch-review", title: "Review CH 101 Chapter 4", detail: "Exam Wednesday", href: "/study?course=ch-101" }],
  },
  {
    id: "judge",
    name: "you",
    classYear: "",
    streakDays: 0,
    sample: false,
    courses: [],
    classes: [],
    todos: [],
  },
];

// The judge adds this from onboarding. Tuned so one class check-in plus one practice quiz
// moves it from "worth a check-in" to "on track" (sample tree: leaf 2 → leaf 4 → leaf 5).
export const JUDGE_COURSE = course("BIO 181", "demo", ["Midterm", "2026-10-10T10:00"], row({ avg_days_started_before_exam: 2.5, attendance_rate: 0.795, practice_quizzes_taken: 8, on_time_submission_rate: 0.8, late_night_study_pct: 0.2, missed_deadlines: 1, work_hours_per_week: 10, credit_hours: 15 }));
export const JUDGE_CLASS: ClassSeed = { course: "bio-181", title: "BIO 181 lecture", at: "2026-10-06T09:35" };

export const BUDDIES = [
  { name: "Alex", streak: 6, blocksDone: 5, blocksPlanned: 6 },
  { name: "Sam", streak: 3, blocksDone: 2, blocksPlanned: 4 },
  { name: "Riley", streak: 11, blocksDone: 7, blocksPlanned: 7 },
];
