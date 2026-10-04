// Health, from Google Fit. The body's week sits beside the semester's: sleep feeds the model (it is
// one of the tree's own inputs), readiness decides whether today's gym block stands, and cardio and
// steps are goals the week can hold time for. Everything here is deterministic: numbers in, a
// handful of plain calls out, no model call.
//
// The demo profile arrives already connected (FIT_DEMO is the student's own night, as Fit reported
// it). A real Google Fit link would fill the same FitSnapshot from the Fitness REST API.

import { localIso } from "./time.ts";
import { predict, withDerived, type Features, type Tree } from "./tree.ts";

export type FitNight = { date: string; hours: number; bedtime: string; score?: number };

export type FitSnapshot = {
  source: "google-fit";
  account: string;
  syncedAt: string; // local ISO
  sleep: { hours: number; score: number; quality: "Poor" | "Fair" | "Good"; bedtime: string; wake: string };
  nights: FitNight[]; // the last seven, oldest first; the last one is `sleep`
  readiness: number; // 0–100
  hrv: number; // ms
  restingHr: number; // bpm
  restingHrNote?: string;
  heartRate: number; // bpm, latest
  steps: number;
  distanceMi: number;
  calories: number;
  cardio: { minutes: number; goal: number }; // this week
  exerciseDays: { done: number; goal: number };
  hourlyActivity: { done: number; goal: number };
  weightLb?: number;
  coach?: string; // Fit's own note, verbatim
  gym?: { title: string; weekday: number; hour: number; minute: number; minutes: number }[]; // the gym plan Fit knows about (0 = Monday)
};

/** Last night and the week before it, as Google Fit showed them on Oct 6, 2026. */
export const FIT_DEMO: FitSnapshot = {
  source: "google-fit",
  account: "rehanyeet@gmail.com",
  syncedAt: "2026-10-06T08:07:00",
  sleep: { hours: 3, score: 40, quality: "Poor", bedtime: "4:45 AM", wake: "7:57 AM" },
  nights: [
    { date: "2026-09-29", hours: 6.4, bedtime: "12:40 AM", score: 68 },
    { date: "2026-09-30", hours: 5.9, bedtime: "1:10 AM", score: 61 },
    { date: "2026-10-01", hours: 7.2, bedtime: "11:50 PM", score: 79 },
    { date: "2026-10-02", hours: 5.1, bedtime: "2:05 AM", score: 52 },
    { date: "2026-10-03", hours: 6.0, bedtime: "1:20 AM", score: 63 },
    { date: "2026-10-04", hours: 5.4, bedtime: "1:45 AM", score: 55 },
    { date: "2026-10-05", hours: 3, bedtime: "4:45 AM", score: 40 },
  ],
  readiness: 25,
  hrv: 21,
  restingHr: 73,
  restingHrNote: "month high",
  heartRate: 86,
  steps: 5020,
  distanceMi: 2.24,
  calories: 1350,
  cardio: { minutes: 1, goal: 455 },
  exerciseDays: { done: 0, goal: 6 },
  hourlyActivity: { done: 1, goal: 9 },
  weightLb: 182.7,
  coach: "Swap your scheduled lower body gym session for full rest today. Pushing through now increases your injury risk and delays recovery.",
  gym: [
    { title: "Gym · lower body", weekday: 1, hour: 15, minute: 30, minutes: 60 },
    { title: "Gym · upper body", weekday: 3, hour: 15, minute: 30, minutes: 60 },
    { title: "Gym", weekday: 5, hour: 14, minute: 0, minutes: 60 },
  ],
};

export const SLEEP_GOAL = 7; // hours
export const SHORT_NIGHT = 5; // under this, the next day is a rest day

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Seven-night average, the number the model reads. */
export const sleepAverage = (nights: FitNight[]) => (nights.length ? round1(nights.reduce((s, n) => s + n.hours, 0) / nights.length) : 0);

/** The average after one more night of `hours` (the oldest night drops off). */
export const projectedAverage = (nights: FitNight[], hours: number) => sleepAverage([...nights.slice(-6), { date: "", hours, bedtime: "" }]);

export const lateNights = (nights: FitNight[]) => nights.filter((n) => /AM$/.test(n.bedtime) && !/^1[01]:/.test(n.bedtime)).length;

/** What the body's week says about today: rest or train, and how far sleep and cardio are from their lines. */
export function healthSignals(h: FitSnapshot) {
  const avg = sleepAverage(h.nights);
  const restDay = h.readiness < 40 || h.sleep.hours < SHORT_NIGHT || (h.hrv < 30 && h.restingHr >= 70);
  return {
    avg,
    restDay,
    sleepDebt: round1(h.nights.reduce((s, n) => s + Math.max(0, SLEEP_GOAL - n.hours), 0)),
    lateNights: lateNights(h.nights),
    cardioPct: Math.round((h.cardio.minutes / Math.max(1, h.cardio.goal)) * 100),
    cardioLeft: Math.max(0, h.cardio.goal - h.cardio.minutes),
  };
}

/** The model inputs Google Fit can speak to: average sleep. Everything else stays the student's own numbers. */
export function featuresFromHealth(h: FitSnapshot): Features {
  return { avg_sleep_hours: sleepAverage(h.nights), sleep_missing: 0 };
}

/**
 * Sleep and the tree, for one course: the risk now and the risk after one more short night, straight
 * from the model (same tree, same numbers, only avg_sleep_hours moved). Returns null when sleep makes
 * no difference to this student's path.
 */
export function sleepImpact(tree: Tree, x: Features, h: FitSnapshot) {
  const now = predict(tree, { ...x, ...featuresFromHealth(h) });
  const shortNight = predict(tree, { ...x, avg_sleep_hours: projectedAverage(h.nights, Math.min(h.sleep.hours, 4.5)), sleep_missing: 0 });
  const goodWeek = predict(tree, { ...x, avg_sleep_hours: Math.max(sleepAverage(h.nights), SLEEP_GOAL), sleep_missing: 0 });
  const line = sleepLine(tree, x);
  if (shortNight.pRisk === now.pRisk && goodWeek.pRisk === now.pRisk && line == null) return null;
  return { now, shortNight, goodWeek, line, avg: sleepAverage(h.nights), projected: projectedAverage(h.nights, Math.min(h.sleep.hours, 4.5)) };
}

/** The sleep threshold on this student's own path through the tree, if the path asks about sleep. */
export function sleepLine(tree: Tree, raw: Features): number | null {
  const x = withDerived(tree, raw);
  const fi = tree.feature_names.indexOf("avg_sleep_hours");
  let i = 0;
  while (tree.children_left[i] !== -1) {
    const f = tree.feature[i];
    const t = tree.threshold[i];
    if (f === fi) return t;
    const v = x[tree.feature_names[f]] ?? 0;
    i = v <= t ? tree.children_left[i] : tree.children_right[i];
  }
  return null;
}

export type HealthCall = {
  id: "rest" | "winddown" | "cardio";
  title: string;
  why: string;
  action: string; // button label
};

/** Today's calls, in order, from the numbers. The store turns each into a change on the week. */
export function healthCalls(h: FitSnapshot, now: Date): HealthCall[] {
  const s = healthSignals(h);
  const out: HealthCall[] = [];
  const dow = (now.getDay() + 6) % 7;
  const gymToday = h.gym?.find((g) => g.weekday === dow && g.hour + g.minute / 60 >= now.getHours() + now.getMinutes() / 60 - 0.25);
  if (s.restDay && gymToday)
    out.push({
      id: "rest",
      title: `Rest today: swap ${gymToday.title} (${fmtClock(gymToday.hour, gymToday.minute)}) for a 20-minute walk`,
      why: `Readiness ${h.readiness}, HRV ${h.hrv} ms and a resting heart rate of ${h.restingHr} bpm${h.restingHrNote ? ` (${h.restingHrNote})` : ""} after ${h.sleep.hours} h of sleep. Lifting on that raises injury risk and slows recovery.`,
      action: "Swap it",
    });
  if (h.sleep.hours < 6 || s.lateNights >= 4)
    out.push({
      id: "winddown",
      title: "Protect tonight: wind down at 11 PM, lights out by 11:30",
      why: `${s.lateNights} of the last 7 nights started after midnight (last night ${h.sleep.bedtime}). A full night brings the 7-night average back toward ${SLEEP_GOAL} h, the number the model reads.`,
      action: "Add wind-down",
    });
  if (s.cardioPct < 50)
    out.push({
      id: "cardio",
      title: `Cardio: ${h.cardio.minutes} of ${h.cardio.goal} minutes this week`,
      why: `${h.exerciseDays.done} of ${h.exerciseDays.goal} exercise days so far. A 20-minute walk tomorrow morning starts the count without touching recovery.`,
      action: "Add a walk",
    });
  return out;
}

/**
 * One line for Viva's context: the numbers and today's calls with their health_call ids, so the agent
 * answers from the same data the panel shows and can put a call on the week. `done` marks calls already there.
 */
export function healthLine(h: FitSnapshot, now: Date, done: Partial<Record<HealthCall["id"], boolean>> = {}): string {
  const s = healthSignals(h);
  const calls = healthCalls(h, now).map((c) => `${c.id}=${c.title}${done[c.id] ? " (already on the week)" : ""}`);
  return (
    `Google Fit (${h.account}, synced ${h.syncedAt.slice(11, 16)}): last night ${h.sleep.hours} h (${h.sleep.quality}, bed ${h.sleep.bedtime}); ` +
    `7-night average ${s.avg} h (goal ${SLEEP_GOAL}); readiness ${h.readiness}/100; HRV ${h.hrv} ms; resting HR ${h.restingHr}${h.restingHrNote ? ` (${h.restingHrNote})` : ""}; ` +
    `steps ${h.steps}; cardio ${h.cardio.minutes}/${h.cardio.goal} min this week; exercise days ${h.exerciseDays.done}/${h.exerciseDays.goal}. ` +
    (s.restDay ? "Today is a rest day: no lifting. " : "") +
    (calls.length ? `Today's calls (health_call ids): ${calls.join("; ")}.` : "No calls today.")
  );
}

export const fmtClock = (h: number, m = 0) => `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;

/** Where a health block lands on the week: local ISO for a day offset from `now`. */
export const healthSlot = (now: Date, dayOffset: number, hour: number, minute = 0) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, minute, 0, 0);
  return localIso(d);
};
