import { test } from "node:test";
import assert from "node:assert/strict";
import { pickExcerpts } from "./excerpts.ts";
import { sampleKnowledge } from "./sample.ts";
import { PROFILES } from "../mock.ts";

const maya = PROFILES[0];
const kb = sampleKnowledge(maya.id, maya.courses);
const codes = maya.courses.map((c) => c.code);

test("a topic question brings the matching lecture file, trimmed", () => {
  const x = pickExcerpts("quiz me on cellular respiration and the electron transport chain", codes, kb);
  assert.equal(x[0]?.title, "Lecture 12: Cellular respiration");
  assert.ok(x[0].text.length <= 1801);
  assert.ok(x.length <= 2);
});

test("a scheduling or status question brings nothing", () => {
  assert.deepEqual(pickExcerpts("move my BIO 181 review block to Friday at 3", codes, kb), []);
  assert.deepEqual(pickExcerpts("what should I focus on this week", codes, kb), []);
  assert.deepEqual(pickExcerpts("add a study block tomorrow at 7pm", codes, kb), []);
});

test("scope limits which courses are searched", () => {
  const x = pickExcerpts("explain integration by parts", ["BIO 181"], kb);
  assert.deepEqual(x, []);
  assert.equal(pickExcerpts("explain integration by parts", ["MA 241"], kb)[0]?.title, "Lecture 10: Integration by parts");
});
