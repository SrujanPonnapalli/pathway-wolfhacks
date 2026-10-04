// Which lecture files a message is about, with no model call: plain word overlap against each
// file's title, summary and text. Title and summary hits count double, and nothing is returned
// for a weak match, so a scheduling question costs no extra tokens and a "quiz me on glycolysis"
// brings the right lecture along (trimmed) for Viva to teach from.

import { docsFor } from "./sample.ts";
import type { Knowledge } from "./types";

const STOP = new Set(["about", "after", "before", "class", "could", "course", "doing", "going", "have", "help", "into", "just", "like", "make", "need", "please", "should", "some", "something", "study", "than", "that", "their", "them", "there", "these", "they", "this", "today", "tomorrow", "want", "week", "what", "when", "where", "which", "will", "with", "would", "your"]);
const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(" ").filter((w) => w.length >= 4 && !STOP.has(w)));

export function pickExcerpts(message: string, courseCodes: string[], kb: Knowledge, maxChars = 1800): { course: string; title: string; text: string }[] {
  const terms = words(message);
  if (!terms.size) return [];
  const scored: { course: string; title: string; text: string; score: number }[] = [];
  for (const code of courseCodes) {
    for (const d of docsFor(code, kb)) {
      const head = words(`${d.title} ${d.summary}`);
      const body = words(d.body);
      let score = 0;
      for (const t of terms) {
        if (head.has(t)) score += 2;
        else if (body.has(t)) score += 1;
      }
      if (score >= 3) scored.push({ course: code, title: d.title, text: d.body.length > maxChars ? `${d.body.slice(0, maxChars)}…` : d.body, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 2).map(({ course, title, text }) => ({ course, title, text }));
}
