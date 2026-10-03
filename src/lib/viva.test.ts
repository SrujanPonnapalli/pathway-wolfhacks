import { test } from "node:test";
import assert from "node:assert/strict";
import { soften, vivaReply } from "./viva.ts";

const bio = {
  slug: "bio-181",
  code: "BIO 181",
  exam: { title: "Midterm" },
  daysToExam: 4,
  result: { atRisk: true, n: 153 },
  steps: [{ feature: "avg_days_started_before_exam", value: 1 }],
  rec: { moves: [{ feature: "avg_days_started_before_exam", from: 1, to: 3.5 }] },
};

test("soften strips causal promises and judgment", () => {
  assert.equal(soften("This will make you pass."), "This is linked to better outcomes.");
  assert.equal(soften("You're failing BIO."), "this class is worth a check-in BIO.");
  assert.ok(!/guarantee/i.test(soften("It guarantees an A")));
});

test("focus question points at the flagged class with its reason and an action", () => {
  const r = vivaReply("What should I focus on this week?", { courses: [bio] });
  assert.match(r.text, /BIO 181/);
  assert.match(r.text, /exam prep about 1 day out/);
  assert.equal(r.actions[0].href, "/insights?course=bio-181");
});

test("never suggests cutting work hours", () => {
  const r = vivaReply("should I work fewer hours at my job?", { courses: [bio] });
  assert.match(r.text, /never suggest cutting them/);
});
