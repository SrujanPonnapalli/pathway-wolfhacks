import { test } from "node:test";
import assert from "node:assert/strict";
import { explain, predict, recourse, usedFeatures, warningSigns, type Tree } from "./tree.ts";
import early from "../../public/models/tree_early.json" with { type: "json" };
import mid from "../../public/models/tree_mid.json" with { type: "json" };
import rows from "./rows.json" with { type: "json" };

const t = early as Tree;
const m = mid as Tree;
// Dataset row S1070 (Maya, BIO 181): starts prep 1 day out, 73% attendance, no quizzes, 79% on time.
const maya: Record<string, number> = { ...(rows as Record<string, Record<string, number>>).S1070, course_MA_241: 0 };
const actionable = {
  avg_days_started_before_exam: { min: 0, max: 14, step: 0.5 },
  attendance_rate: { min: 0.3, max: 1, step: 0.01 },
  practice_quizzes_taken: { min: 0, max: 60, step: 1 },
  on_time_submission_rate: { min: 0.3, max: 1, step: 0.01 },
  late_night_study_pct: { min: 0, max: 0.9, step: 0.01 },
};

test("early tree: four warning signs, worth a check-in, and the path explains itself", () => {
  assert.equal(warningSigns(t, maya), 4);
  const r = predict(t, maya);
  assert.equal(r.atRisk, true);
  const steps = explain(t, r.path, maya);
  assert.equal(steps.length, r.path.length - 1);
  assert.equal(steps[0].feature, "warning_signs");
  assert.equal(steps[0].value, 4);
  assert.equal(steps[0].above, true);
});

test("recourse clears warning signs by moving habits just past their cutoffs, and lands on track", () => {
  const rec = recourse(t, maya, actionable)!;
  assert.ok(rec, "a route to on-track exists");
  const after: Record<string, number> = { ...maya };
  for (const mv of rec.moves) after[mv.feature] = mv.to;
  assert.equal(predict(t, after).atRisk, false);
  // Never a feature the student can't change, and every move is a small nudge, not a leap.
  for (const mv of rec.moves) {
    assert.ok(mv.feature in actionable, `${mv.feature} is actionable`);
    assert.ok(Math.abs(mv.to - mv.from) <= 1.5, `${mv.feature} moves by at most 1.5 units`);
  }
  assert.ok(rec.moves.some((mv) => mv.feature === "on_time_submission_rate" && mv.to === 0.8));
});

test("never moves a non-actionable feature", () => {
  assert.equal(recourse(t, maya, {}), null);
  const rec = recourse(t, maya, { on_time_submission_rate: actionable.on_time_submission_rate, avg_days_started_before_exam: actionable.avg_days_started_before_exam });
  assert.ok(rec && rec.moves.every((mv) => mv.feature === "on_time_submission_rate" || mv.feature === "avg_days_started_before_exam"));
});

test("usedFeatures expands the warning-sign count to the habits behind it", () => {
  const used = usedFeatures(t);
  for (const f of ["warning_signs", "attendance_rate", "avg_days_started_before_exam", "on_time_submission_rate", "avg_practice_quiz_score", "work_hours_per_week"]) assert.ok(used.includes(f), f);
  assert.ok(!used.includes("missed_deadlines"));
});

test("mid tree: a 63 midterm with the same habits stays worth a check-in; a 70 with better attendance is on track", () => {
  assert.equal(predict(m, { ...maya, midterm_score: 63 }).atRisk, true);
  assert.equal(predict(m, { ...maya, midterm_score: 70, attendance_rate: 0.85 }).atRisk, false);
});
