// Study's ready-made material for the built-in lecture files (npm run kb:decks): flashcards, a quiz, viva
// questions and concepts, made ahead of time so the demo opens lived-in on every device and after every Reset.
// An entry only counts while its file's text is unchanged; "New deck" in Study still makes a fresh one.
import type { StudyMaterial } from "../intel/study";
import decks from "./study-decks.json" with { type: "json" };
import { textHash } from "./teachConcepts.ts";

const TABLE = decks as Record<string, { hash: string; material: StudyMaterial }>;

/** The ready material for a built-in file, titled like the file, or undefined if there is none or it changed. */
export function readyDeck(id: string, title: string, body: string): StudyMaterial | undefined {
  const e = TABLE[id];
  return e && e.hash === textHash(body) && e.material.flashcards?.length ? { ...e.material, title } : undefined;
}
