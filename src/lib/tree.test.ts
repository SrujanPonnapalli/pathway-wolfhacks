import { test } from "node:test";
import assert from "node:assert/strict";
import { explain, predict, recourse, type Tree } from "./tree.ts";
import sample from "../../public/models/tree_early.json" with { type: "json" };

const t = sample as Tree;
// Dataset row S1070 (BIO 181): starts prep 1 day out, 73% attendance, no quizzes.
const maya = { avg_days_started_before_exam: 1, attendance_rate: 0.73, practice_quizzes_taken: 0, on_time_submission_rate: 0.79, late_night_study_pct: 0.28, work_hours_per_week: 13 };
const actionable = {
  avg_days_started_before_exam: { min: 0, max: 14, step: 0.5 },
  attendance_rate: { min: 0.3, max: 1, step: 0.01 },
  practice_quizzes_taken: { min: 0, max: 60, step: 1 },
  on_time_submission_rate: { min: 0.3, max: 1, step: 0.01 },
  late_night_study_pct: { min: 0, max: 0.9, step: 0.01 },
};

test("predict + explain follow the same path", () => {
  const r = predict(t, maya);
  assert.equal(r.atRisk, true);
  const steps = explain(t, r.path, maya);
  assert.equal(steps.length, r.path.length - 1);
  assert.deepEqual(steps.map((s) => s.above), [false, false]);
});

test("recourse picks the cheapest actionable move and lands on-track", () => {
  const rec = recourse(t, maya, actionable)!;
  assert.deepEqual(rec.moves, [{ feature: "avg_days_started_before_exam", from: 1, to: 3.5 }]);
  assert.equal(predict(t, { ...maya, avg_days_started_before_exam: 3.5 }).atRisk, false);
});

test("never moves a non-actionable feature", () => {
  // Only on-track route left requires changing work hours, which isn't actionable: no recourse.
  const stuck = { ...maya, avg_days_started_before_exam: 5, on_time_submission_rate: 0.9, late_night_study_pct: 0.5, work_hours_per_week: 30 };
  const rec = recourse(t, stuck, { late_night_study_pct: actionable.late_night_study_pct });
  assert.ok(rec && rec.moves.every((m) => m.feature === "late_night_study_pct"));
  assert.equal(recourse(t, stuck, {}), null);
});
