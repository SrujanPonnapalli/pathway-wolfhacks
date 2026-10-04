// "Where you stand" for one class, in numbers a student already understands: attendance,
// assignments, grades, exam prep. The lines between good and "watch" are the decision tree's
// own warning-sign cutoffs (public/models/tree_early.json), so the tiles and the status always
// agree. Grades come from a dropped Gradescope/Moodle page, categorised by the syllabus weights.

import type { Source } from "./intel/coach";
import type { Features, Tree } from "./tree";

export type GradeItem = { name: string; score: number | null; max: number | null; status: string; due: string };
export type Category = { name: string; weight: number | null; items: GradeItem[]; avg: number | null; missing: number };
export type Tile = { key: "attendance" | "assignments" | "grades" | "prep"; label: string; value: string; detail: string; ok: boolean | null };

const DEFAULT_CUTOFFS = { attendance_rate: 0.82, on_time_submission_rate: 0.79, avg_days_started_before_exam: 1.9, avg_practice_quiz_score: 69 };

/** The model's lines: a habit at or below its cutoff counts as a warning sign. */
export function cutoffs(tree?: Tree) {
  return { ...DEFAULT_CUTOFFS, ...(tree?.derived?.warning_signs?.cutoffs ?? {}) };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const isMissing = (it: GradeItem) => it.status === "missing" || it.status === "not_submitted";
const isGraded = (it: GradeItem) => it.score != null && it.max != null && it.max > 0;

// Syllabus component names → the words that identify an assignment as belonging to it.
const SYNONYMS: [RegExp, RegExp][] = [
  [/home ?work|hw|problem set|pset|assignment/i, /\b(hw|homework|problem set|pset|assignment|ps)\b|\bhw\d/i],
  [/quiz/i, /\bquiz/i],
  [/exam|midterm|final|test/i, /\b(exam|midterm|final|test)\b/i],
  [/project/i, /\bproject/i],
  [/lab/i, /\blab\b|\blab\d/i],
  [/participation|attendance|clicker|discussion/i, /\b(participation|attendance|clicker|discussion|in-class)\b/i],
  [/paper|essay|report|writing/i, /\b(paper|essay|report)\b/i],
];

function matches(componentName: string, itemName: string) {
  for (const [component, item] of SYNONYMS) if (component.test(componentName) && item.test(itemName)) return true;
  // Fall back to the component's own first word ("Reading responses" → /reading/).
  const word = componentName.split(/\s+/)[0]?.replace(/[^a-z]/gi, "");
  return word.length > 3 && new RegExp(`\\b${word}`, "i").test(itemName);
}

/** Group grade rows under the syllabus grading components (or sensible defaults when there's no syllabus). */
export function categorize(items: GradeItem[], grading: { component: string; weight_percent: number | null }[]): Category[] {
  const comps = grading.length ? grading : [{ component: "Homework", weight_percent: null }, { component: "Quizzes", weight_percent: null }, { component: "Exams", weight_percent: null }, { component: "Projects", weight_percent: null }];
  const cats: Category[] = comps.map((g) => ({ name: g.component, weight: g.weight_percent, items: [], avg: null, missing: 0 }));
  const other: Category = { name: "Other", weight: null, items: [], avg: null, missing: 0 };
  for (const it of items) {
    const cat = cats.find((c) => matches(c.name, it.name)) ?? other;
    cat.items.push(it);
  }
  for (const cat of [...cats, other]) {
    const graded = cat.items.filter(isGraded);
    cat.avg = graded.length ? graded.reduce((s, it) => s + (it.score! / it.max!) * 100, 0) / graded.length : null;
    cat.missing = cat.items.filter(isMissing).length;
  }
  return [...cats, ...(other.items.length ? [other] : [])];
}

/** Weighted average of the categories that have graded work; `covered` is how much of the final grade that is. */
export function standing(cats: Category[]): { pct: number | null; covered: number } {
  const withWeight = cats.filter((c) => c.avg != null && c.weight != null);
  if (withWeight.length) {
    const covered = withWeight.reduce((s, c) => s + c.weight!, 0);
    return { pct: withWeight.reduce((s, c) => s + c.avg! * c.weight!, 0) / covered, covered };
  }
  const graded = cats.flatMap((c) => c.items.filter(isGraded));
  return { pct: graded.length ? graded.reduce((s, it) => s + (it.score! / it.max!) * 100, 0) / graded.length : null, covered: 0 };
}

/** Unsubmitted work, most urgent first. */
export function missingWork(items: GradeItem[], now: Date) {
  return items
    .filter(isMissing)
    .map((it) => ({ ...it, overdue: !!it.due && new Date(`${it.due}T23:59:00`) < now }))
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
}

export function sourcesFor(sources: Source[], code: string) {
  const grades = sources.find((s) => s.kind === "grades" && s.course === code);
  const syllabus = sources.find((s) => s.kind === "syllabus" && s.course === code);
  return {
    gradeItems: grades && grades.kind === "grades" ? grades.items : [],
    grading: syllabus && syllabus.kind === "syllabus" ? syllabus.grading.filter((g) => g.component) : [],
    deadlines: syllabus && syllabus.kind === "syllabus" ? syllabus.deadlines : [],
    hasGrades: !!grades,
    hasSyllabus: !!syllabus,
  };
}

/** The four tiles. `ok` is null when there is nothing to judge yet. */
export function tiles(x: Features, tree: Tree | undefined, deltas: { quizzes: number; checkins: number }, items: GradeItem[], cats: Category[]): Tile[] {
  const cut = cutoffs(tree);
  const missing = items.filter(isMissing).length;
  const st = standing(cats);
  const att = x.attendance_rate ?? 0;
  const onTime = x.on_time_submission_rate ?? 0;
  const prep = x.avg_days_started_before_exam ?? 0;
  const quizAvg = x.avg_practice_quiz_score ?? 0;
  const quizzes = x.practice_quizzes_taken ?? 0;
  return [
    {
      key: "attendance",
      label: "Attendance",
      value: pct(att),
      detail: `${deltas.checkins ? `${deltas.checkins} check-in${deltas.checkins === 1 ? "" : "s"} logged · ` : ""}the model's line is ${pct(cut.attendance_rate)}`,
      ok: att > cut.attendance_rate,
    },
    {
      key: "assignments",
      label: "Assignments",
      value: missing ? `${missing} missing` : `${pct(onTime)} on time`,
      detail: missing ? `${pct(onTime)} on time · ${x.missed_deadlines ?? 0} missed deadline${x.missed_deadlines === 1 ? "" : "s"} overall` : `${x.missed_deadlines ?? 0} missed deadline${x.missed_deadlines === 1 ? "" : "s"} · the line is ${pct(cut.on_time_submission_rate)}`,
      ok: !missing && onTime > cut.on_time_submission_rate,
    },
    {
      key: "grades",
      label: "Grades",
      value: st.pct != null ? `≈ ${Math.round(st.pct)}%` : quizzes ? `${Math.round(quizAvg)}% quizzes` : "No grades yet",
      detail: st.pct != null ? (st.covered ? `from graded work covering ${Math.round(st.covered)}% of the grade` : "average of graded work so far") : quizzes ? `practice quiz average · the line is ${Math.round(cut.avg_practice_quiz_score)}%` : "drop your Gradescope page on Home",
      ok: st.pct != null ? st.pct >= 70 : quizzes ? quizAvg > cut.avg_practice_quiz_score : null,
    },
    {
      key: "prep",
      label: "Exam prep",
      value: `${+prep.toFixed(1)} day${prep === 1 ? "" : "s"} out`,
      detail: `${quizzes} practice quiz${quizzes === 1 ? "" : "zes"} taken · the line is ${cut.avg_days_started_before_exam} days`,
      ok: prep > cut.avg_days_started_before_exam,
    },
  ];
}
