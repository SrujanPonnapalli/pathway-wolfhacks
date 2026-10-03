// Dataset columns (data/data_dictionary.csv) and what Pathway may do with each.
// suggest = a lever the student controls; context = used by the model, never suggested;
// never = never suggested (gameable or health). See docs/planning/07_fresh_slate/pathway_full_spec.md §2e.
export type Role = "suggest" | "context" | "never";

type Meta = {
  label: string;
  role: Role;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  ask: (t: number) => string; // the split as a yes/no question; "yes" = value above t
  fact: (v: number) => string; // the student's value, in a sentence fragment
};

const pct = (v: number) => `${+(v * 100).toFixed(1)}%`; // one decimal so small moves (79.5% → 80.5%) stay visible
const days = (v: number) => `${+v.toFixed(1)} ${v === 1 ? "day" : "days"}`;

export const FEATURES: Record<string, Meta> = {
  avg_days_started_before_exam: {
    label: "Start exam prep", role: "suggest", min: 0, max: 14, step: 0.5, fmt: (v) => `${days(v)} before`,
    ask: (t) => `Start exam prep more than ${days(t)} out?`, fact: (v) => `you start exam prep about ${days(v)} out`,
  },
  attendance_rate: {
    label: "Class attendance", role: "suggest", min: 0.3, max: 1, step: 0.01, fmt: pct,
    ask: (t) => `Attend more than ${pct(t)} of classes?`, fact: (v) => `you attend ${pct(v)} of classes`,
  },
  practice_quizzes_taken: {
    label: "Practice quizzes", role: "suggest", min: 0, max: 60, step: 1, fmt: (v) => `${v}`,
    ask: (t) => `Take more than ${Math.floor(t)} practice quizzes?`, fact: (v) => `you've taken ${v} practice ${v === 1 ? "quiz" : "quizzes"}`,
  },
  on_time_submission_rate: {
    label: "On-time submissions", role: "suggest", min: 0.3, max: 1, step: 0.01, fmt: pct,
    ask: (t) => `Submit more than ${pct(t)} of work on time?`, fact: (v) => `you submit ${pct(v)} of work on time`,
  },
  late_night_study_pct: {
    label: "Studying after midnight", role: "suggest", min: 0, max: 0.9, step: 0.01, fmt: pct,
    ask: (t) => `Study after midnight more than ${pct(t)} of the time?`, fact: (v) => `${pct(v)} of your study time is after midnight`,
  },
  missed_deadlines: {
    label: "Missed deadlines", role: "suggest", min: 0, max: 15, step: 1, fmt: (v) => `${v}`,
    ask: (t) => `Miss more than ${Math.floor(t)} deadlines?`, fact: (v) => `you've missed ${v} ${v === 1 ? "deadline" : "deadlines"}`,
  },
  avg_weekly_study_hours: {
    label: "Weekly study hours", role: "suggest", min: 0.5, max: 18, step: 0.5, fmt: (v) => `${v} h`,
    ask: (t) => `Study more than ${t} hours a week?`, fact: (v) => `you study about ${v} hours a week`,
  },
  study_sessions_logged: {
    label: "Study sessions", role: "suggest", min: 3, max: 120, step: 1, fmt: (v) => `${v}`,
    ask: (t) => `Log more than ${Math.floor(t)} study sessions?`, fact: (v) => `you've logged ${v} study sessions`,
  },
  work_hours_per_week: {
    label: "Work hours", role: "context", min: 0, max: 35, step: 1, fmt: (v) => `${v} h/week`,
    ask: (t) => `Work more than ${t} hours a week?`, fact: (v) => `you work about ${v} hours a week`,
  },
  credit_hours: {
    label: "Credit hours", role: "context", min: 12, max: 18, step: 1, fmt: (v) => `${v}`,
    ask: (t) => `Take more than ${t} credit hours?`, fact: (v) => `you're taking ${v} credit hours`,
  },
  midterm_score: {
    label: "Midterm score", role: "context", min: 20, max: 100, step: 1, fmt: (v) => `${v}`,
    ask: (t) => `Midterm score above ${Math.floor(t)}?`, fact: (v) => `your midterm score is ${v}`,
  },
  materials_uploaded: {
    label: "Materials uploaded", role: "never", min: 0, max: 40, step: 1, fmt: (v) => `${v}`,
    ask: (t) => `Upload more than ${t} files?`, fact: (v) => `you've uploaded ${v} files`,
  },
  flashcards_reviewed: {
    label: "Flashcards reviewed", role: "never", min: 0, max: 600, step: 1, fmt: (v) => `${v}`,
    ask: (t) => `Review more than ${t} flashcards?`, fact: (v) => `you've reviewed ${v} flashcards`,
  },
  avg_sleep_hours: {
    label: "Sleep", role: "never", min: 3.5, max: 10, step: 0.1, fmt: (v) => `${v} h`,
    ask: (t) => `Sleep more than ${t} hours?`, fact: (v) => `you sleep about ${v} hours`,
  },
};

export const meta = (f: string): Meta =>
  FEATURES[f] ?? { label: f, role: "context", min: 0, max: 1, step: 0.01, fmt: String, ask: (t) => `${f} above ${t}?`, fact: (v) => `${f} is ${v}` };

export const ACTIONABLE = Object.fromEntries(
  Object.entries(FEATURES).filter(([, m]) => m.role === "suggest").map(([f, m]) => [f, { min: m.min, max: m.max, step: m.step }]),
);

// "you start exam prep about 1 day out and you attend 73% of classes"
export function sentence(parts: string[]) {
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export const reasonFor = (steps: { feature: string; value: number }[]) =>
  `Because ${sentence(steps.map((s) => meta(s.feature).fact(s.value)))}.`;

export const moveText = (m: { feature: string; from: number; to: number }) =>
  `${meta(m.feature).label}: ${meta(m.feature).fmt(m.from)} → ${meta(m.feature).fmt(m.to)}`;
