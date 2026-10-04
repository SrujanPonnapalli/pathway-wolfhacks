// Teach mode's concepts for the built-in lecture files, made ahead of time (npm run kb:teach) so opening a
// file costs no Gemini call on any device. An entry only counts while its file's text is unchanged.
import type { Concept } from "../intel/study";
import prebuilt from "./teach-concepts.json" with { type: "json" };

/** Short, stable fingerprint of a file's text (FNV-1a), the same in the browser and the build script. */
export function textHash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

const TABLE = prebuilt as Record<string, { hash: string; concepts: Concept[] }>;

/** The pre-built concepts for a built-in file, or undefined when there are none or the file has changed. */
export function prebuiltConcepts(id: string, body: string): Concept[] | undefined {
  const e = TABLE[id];
  return e && e.hash === textHash(body) && e.concepts.length ? e.concepts : undefined;
}
