import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIT_DEMO, featuresFromHealth, healthCalls, healthSignals, projectedAverage, sleepAverage, sleepImpact, sleepLine } from "./health.ts";
import { PROFILES } from "./mock.ts";
import { predict, type Features, type Tree } from "./tree.ts";
import ROWS from "./rows.json" with { type: "json" };

const tree = JSON.parse(readFileSync(new URL("../../public/models/tree_early.json", import.meta.url), "utf8")) as Tree;
const rows = ROWS as Record<string, Features>;
const bio = PROFILES[0].courses[0];
const x: Features = { ...rows._median, ...(rows[bio.row] ?? {}), ...bio.x, course_BIO_181: 1, work_hours_missing: 0, sleep_missing: 0 };

test("the week's sleep average is what the model reads, and one more short night moves it under the line", () => {
  assert.equal(sleepAverage(FIT_DEMO.nights), 5.6);
  assert.equal(featuresFromHealth(FIT_DEMO).avg_sleep_hours, 5.6);
  assert.ok(projectedAverage(FIT_DEMO.nights, 3) < 5.55);
  assert.equal(sleepLine(tree, { ...x, avg_sleep_hours: 5.6 }), 5.55);
});

test("sleep changes the demo student's path: 71% now, 96% after another short night, lower with a full week", () => {
  const r = sleepImpact(tree, x, FIT_DEMO)!;
  assert.ok(r);
  assert.equal(Math.round(r.now.pRisk * 100), 71);
  assert.equal(Math.round(r.shortNight.pRisk * 100), 96);
  assert.ok(r.goodWeek.pRisk <= r.now.pRisk);
  assert.equal(predict(tree, { ...x, avg_sleep_hours: 5.6 }).pRisk, r.now.pRisk);
});

test("a 3-hour night with readiness 25 is a rest day, and the calls say what to change", () => {
  const s = healthSignals(FIT_DEMO);
  assert.ok(s.restDay);
  assert.equal(s.lateNights, 6);
  assert.equal(s.cardioPct, 0);
  const calls = healthCalls(FIT_DEMO, new Date("2026-10-06T09:00:00"));
  assert.deepEqual(calls.map((c) => c.id), ["rest", "winddown", "cardio"]);
  assert.match(calls[0].title, /lower body/);
  // after the gym slot has passed, the rest call is gone; the other two stay
  assert.deepEqual(healthCalls(FIT_DEMO, new Date("2026-10-06T17:00:00")).map((c) => c.id), ["winddown", "cardio"]);
});

test("the gym plan lands on the week by weekday, health blocks are not study, and the Fit line reads right", async () => {
  const { blocksAsEvents, demoWeek } = await import("./schedule.ts");
  const { healthLine } = await import("./health.ts");
  const now = new Date("2026-10-06T09:00:00");
  const week = demoWeek(now, [], [], FIT_DEMO.gym);
  const gym = week.filter((e) => e.id.startsWith("demo-gym"));
  assert.deepEqual(gym.map((e) => `${e.id} ${e.start.slice(0, 16)} ${e.title}`), ["demo-gym-1 2026-10-06T15:30 Gym · lower body", "demo-gym-3 2026-10-08T15:30 Gym · upper body", "demo-gym-5 2026-10-10T14:00 Gym"]);
  assert.equal(demoWeek(now, [], []).find((e) => e.id === "demo-gym")?.start.slice(0, 16), "2026-10-10T14:00"); // without Fit, Saturday's gym stands in
  const [walk, study] = blocksAsEvents([
    { id: "health-walk", course: "", title: "Walk · 20 min (cardio)", at: "2026-10-07T08:00:00", done: false, minutes: 20, kind: "health" },
    { id: "b1", course: "bio-181", title: "Study block", at: "2026-10-07T10:00:00", done: false },
  ]);
  assert.equal(walk.kind, "other");
  assert.equal(walk.end.slice(11, 16), "08:20");
  assert.equal(study.kind, "study");
  const line = healthLine(FIT_DEMO, now);
  assert.match(line, /last night 3 h \(Poor, bed 4:45 AM\); 7-night average 5\.6 h/);
  assert.match(line, /Today is a rest day/);
  assert.match(line, /Calls: Rest today: swap Gym · lower body/);
  assert.match(line, /^Google Fit \(rehanyeet@gmail.com, synced 08:07\)/); // the agent's context carries this line verbatim (src/lib/intel/agent.ts)
});
