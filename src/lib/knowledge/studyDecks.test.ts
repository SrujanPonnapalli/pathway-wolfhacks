import { test } from "node:test";
import assert from "node:assert/strict";
import { COURSES } from "../coursework-data.ts";
import { readyDeck } from "./studyDecks.ts";

test("ready Study decks: every lecture file in Rehan's courses has one, titled like the file; a changed file doesn't", () => {
  for (const code of ["BIO 181", "ST 311", "CSC 216", "MA 241"])
    for (const d of COURSES[code].docs) {
      const m = readyDeck(d.id, d.title, d.body);
      assert.ok(m && m.flashcards.length >= 6 && m.quiz.length >= 1, `${d.id} has no ready deck (npm run kb:decks)`);
      assert.equal(m.title, d.title);
    }
  const d = COURSES["BIO 181"].docs[0];
  assert.equal(readyDeck(d.id, d.title, d.body + " edited"), undefined);
});
