import { test } from "node:test";
import assert from "node:assert/strict";
import { COURSES } from "../coursework-data.ts";
import { prebuiltConcepts } from "./teachConcepts.ts";

test("pre-built Teach concepts: every lecture file in Rehan's courses has them, and a changed file doesn't", () => {
  for (const code of ["BIO 181", "ST 311", "CSC 216", "MA 241"])
    for (const d of COURSES[code].docs) assert.ok(prebuiltConcepts(d.id, d.body)?.length, `${d.id} has no pre-built concepts (npm run kb:teach)`);
  const d = COURSES["BIO 181"].docs[0];
  assert.equal(prebuiltConcepts(d.id, d.body + " edited"), undefined);
});
