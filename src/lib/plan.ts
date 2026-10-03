// Make It Real: turn the chosen changes into up to 3 dated study blocks before the exam.
// TODO: also offer these as an .ics download via /api/calendar.
import type { Move } from "./tree";

type Course = { slug: string; code: string; exam: { date: string } };

const at = (base: Date, dayOffset: number, hour: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export function planBlocks(c: Course, moves: Move[], now: Date) {
  const exam = new Date(c.exam.date);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysLeft = Math.max(1, Math.round((midnight(exam) - midnight(now)) / 86_400_000));
  const out: { course: string; title: string; at: string }[] = [];
  const add = (title: string, day: number, hour: number) =>
    out.length < 3 && day < daysLeft && out.push({ course: c.slug, title, at: at(now, day, hour) });

  for (const m of moves) {
    switch (m.feature) {
      case "avg_days_started_before_exam": {
        const start = Math.max(0, daysLeft - Math.ceil(m.to));
        add(`Start ${c.code} exam review`, start, 16);
        add(`${c.code} practice quiz`, start + 1, 16);
        add(`${c.code} review session`, start + 2, 16);
        break;
      }
      case "attendance_rate":
        add(`Go to ${c.code} class`, 1, 9);
        add(`Go to ${c.code} class`, 3, 9);
        break;
      case "practice_quizzes_taken":
        for (let i = 0; i < Math.min(3, m.to - m.from); i++) add(`${c.code} practice quiz`, i + 1, 17);
        break;
      case "late_night_study_pct":
        add(`${c.code} study block, done by 10 PM`, 1, 19);
        add(`${c.code} study block, done by 10 PM`, 2, 19);
        break;
      default:
        add(`Start ${c.code} assignment early`, 1, 15);
    }
  }
  return out;
}
