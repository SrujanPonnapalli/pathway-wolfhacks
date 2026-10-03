"use client";

import {
  Briefcase, CalendarClock, CalendarX, Circle, Clock, FileText, Flag, ListChecks, Moon, Timer, Trophy, UserCheck, type LucideIcon,
} from "lucide-react";
import { meta } from "@/lib/features";
import type { Step } from "@/lib/tree";

const ICONS: Record<string, LucideIcon> = {
  avg_days_started_before_exam: CalendarClock,
  attendance_rate: UserCheck,
  practice_quizzes_taken: ListChecks,
  on_time_submission_rate: Clock,
  late_night_study_pct: Moon,
  work_hours_per_week: Briefcase,
  midterm_score: FileText,
  missed_deadlines: CalendarX,
  avg_weekly_study_hours: Timer,
};
const OFFSETS = [0, 56, 84, 56, 0, -56, -84, -56]; // the winding column, in px

type Props = { steps: Step[]; atRisk: boolean; n: number };

// The student's route through the decision tree, drawn as a winding path of questions.
// Re-keyed on the route so the nodes light up again whenever it changes.
export function PathView({ steps, atRisk, n }: Props) {
  const route = steps.map((s) => `${s.node}${s.above ? "R" : "L"}`).join("-");
  const Leaf = atRisk ? Flag : Trophy;

  return (
    <ol key={route} className="flex flex-col items-center gap-5 py-2 [--wind:0.3] sm:[--wind:1]" aria-label="Your path through the model">
      {steps.map((s, i) => {
        const Icon = ICONS[s.feature] ?? Circle;
        const m = meta(s.feature);
        const locked = m.role !== "suggest";
        return (
          <li key={s.node} className="flex w-full max-w-[420px] items-center gap-4" style={{ transform: `translateX(calc(${OFFSETS[i % 8]}px * var(--wind)))` }}>
            <span
              className="grid size-16 shrink-0 animate-[light_380ms_ease-out_both] place-items-center rounded-full border-b-[6px] border-[#109c8a] bg-teal-face text-teal-ink"
              style={{ animationDelay: `${i * 140}ms` }}
              aria-hidden
            >
              <Icon size={28} strokeWidth={2.4} />
            </span>
            <span className="min-w-0">
              <span className="block font-extrabold leading-snug">{m.ask(s.threshold)}</span>
              <span className="block text-sm text-muted">
                <span className="font-black text-ink">{s.above ? "Yes" : "No"}</span> · you: {m.fmt(s.value)}
                {locked && " · context only"}
              </span>
            </span>
          </li>
        );
      })}
      <li className="flex w-full max-w-[420px] items-center gap-4" style={{ transform: `translateX(calc(${OFFSETS[steps.length % 8]}px * var(--wind)))` }}>
        <span
          className={`grid size-20 shrink-0 animate-[light_380ms_ease-out_both] place-items-center rounded-full border-b-[6px] ${
            atRisk ? "border-[#d99a00] bg-sun text-sun-ink" : "border-[#109c8a] bg-teal-face text-teal-ink"
          }`}
          style={{ animationDelay: `${steps.length * 140}ms` }}
          aria-hidden
        >
          <Leaf size={34} strokeWidth={2.4} />
        </span>
        <span>
          <span className="block text-xl font-black">{atRisk ? "Worth a check-in" : "On track"}</span>
          <span className="block text-sm text-muted">Where {n} similar students in the data ended up</span>
        </span>
      </li>
    </ol>
  );
}

// Home's teaser: the same route as a small row of steps.
export function MiniPath({ steps, atRisk }: Omit<Props, "n">) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Your path through the model">
      {steps.map((s) => {
        const Icon = ICONS[s.feature] ?? Circle;
        return (
          <li key={s.node} className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border-2 border-b-4 border-[#109c8a] bg-teal-face py-1 pl-1.5 pr-3 text-sm font-extrabold text-teal-ink">
              <Icon size={16} strokeWidth={2.6} aria-hidden />
              {meta(s.feature).label}: {s.above ? "yes" : "no"}
            </span>
            <span className="text-muted" aria-hidden>→</span>
          </li>
        );
      })}
      <li>
        <StatusPill atRisk={atRisk} />
      </li>
    </ol>
  );
}

function StatusPill({ atRisk }: { atRisk: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 rounded-full border-2 border-b-4 py-1 pl-1.5 pr-3 text-sm font-black ${atRisk ? "border-[#d99a00] bg-sun text-sun-ink" : "border-[#109c8a] bg-teal-face text-teal-ink"}`}>
      {atRisk ? <Flag size={16} strokeWidth={2.6} aria-hidden /> : <Trophy size={16} strokeWidth={2.6} aria-hidden />}
      {atRisk ? "Check-in" : "On track"}
    </span>
  );
}
