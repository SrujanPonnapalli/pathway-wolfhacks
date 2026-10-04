import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleChatSessions, soften, vivaReply } from "./viva.ts";

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

test("wanting to teach a topic points at Teach mode", () => {
  const r = vivaReply("Let me teach you a topic", { courses: [bio] });
  assert.equal(r.actions[0].href, "/viva?mode=teach");
  // Explaining a situation is not teaching a topic.
  const why = vivaReply("let me explain why I missed class", { courses: [bio] });
  assert.ok(!why.actions.some((a) => a.href === "/viva?mode=teach"));
});

test("never suggests cutting work hours", () => {
  const r = vivaReply("should I work fewer hours at my job?", { courses: [bio] });
  assert.match(r.text, /never suggest cutting them/);
});

test("sampleChatSessions provides past conversations for profiles", () => {
  const maya = sampleChatSessions("maya");
  assert.ok(maya.length >= 2, "Maya should have at least 2 sample chat sessions");
  assert.ok(maya[0].title.length > 0, "First session should have a title");
  assert.ok(maya[0].messages.length > 0, "First session should have messages");
  assert.equal(maya[0].messages[0].role, "you");
  assert.equal(maya[0].messages[1].role, "viva");

  const jordan = sampleChatSessions("jordan");
  assert.ok(jordan.length >= 1, "Jordan should have sample chat sessions");
});
