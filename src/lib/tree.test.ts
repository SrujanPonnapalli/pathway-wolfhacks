import { test } from "node:test";
import assert from "node:assert/strict";
import { predict, type Tree } from "./tree.ts";
import sample from "../../public/models/tree_early.json" with { type: "json" };

test("walks left and right", () => {
  const t = sample as Tree;
  assert.deepEqual(predict(t, { weekly_hours: 2, late_night_pct: 0 }).path, [0, 1]);
  const r = predict(t, { weekly_hours: 10, late_night_pct: 0.6 });
  assert.deepEqual(r.path, [0, 2, 4]);
  assert.equal(r.label, "at_risk");
});
