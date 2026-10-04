import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ROUNDS, clean, clearCount, finished, spoken, tally, type TeachFeedback } from "./teach.ts";

const krebs = {
  topic: "Krebs cycle",
  key_points: ["Happens in the mitochondrial matrix", "Breaks acetyl-CoA down to CO2", "Makes NADH and FADH2 for the electron transport chain"],
  source_ref: "Slides 12-15",
};
const fb = (f: Partial<TeachFeedback>): TeachFeedback => clean(f, krebs.key_points.length);

test("clean drops out-of-range and duplicate points, and clear wins over vague", () => {
  const f = clean({ clear: [2, 2, 7, -1, 0], vague: [{ point: 0, note: "dup" }, { point: 1, note: "fuzzy" }, { point: 1, note: "again" }, { point: 9, note: "bad" }] }, 3);
  assert.deepEqual(f.clear, [0, 2]);
  assert.deepEqual(f.vague, [{ point: 1, note: "fuzzy" }]);
  assert.equal(f.hint, "");
});

test("clean survives junk sent back by the browser", () => {
  const f = clean({ clear: "nope", vague: [null], check_notes: [3, " ", "Check that"] } as unknown as Partial<TeachFeedback>, 3);
  assert.deepEqual(f.clear, []);
  assert.deepEqual(f.vague, []);
  assert.deepEqual(f.check_notes, ["Check that"]);
});

test("tally keeps the best status per key point across rounds", () => {
  const rounds = [
    { explanation: "a", feedback: fb({ clear: [0], vague: [{ point: 1, note: "what is acetyl-CoA?" }] }) },
    { explanation: "b", feedback: fb({ clear: [1] }) },
    { explanation: "c", feedback: fb({ vague: [{ point: 0, note: "later fuzzier" }] }) },
  ];
  assert.deepEqual(tally(krebs, rounds), ["clear", "clear", "missing"]);
  assert.equal(clearCount(tally(krebs, rounds)), 2);
});

test("a session ends when everything is clear or the rounds run out", () => {
  assert.equal(finished(["clear", "clear", "clear"], 1), true);
  assert.equal(finished(["clear", "vague", "missing"], 1), false);
  assert.equal(finished(["clear", "vague", "missing"], MAX_ROUNDS), true);
});

test("spoken feedback asks the follow-up mid-session and wraps up at the end", () => {
  const f = fb({ clear: [0], hint: "Think about what happens to the carbon.", follow_up: "So where does the CO2 come from?", encouragement: "Nice job placing it in the cell." });
  const mid = spoken(f, ["clear", "missing", "missing"], 1);
  assert.match(mid, /^Nice job/);
  assert.match(mid, /carbon/);
  assert.match(mid, /\?$/);
  assert.match(spoken(f, ["clear", "clear", "clear"], 2), /every key idea/);
  assert.match(spoken(f, ["clear", "missing", "missing"], MAX_ROUNDS), /review in your notes/);
});
