// Teach mode (the Feynman technique): the student explains a concept from their own material
// and Viva, playing a curious beginner, checks it against that concept's key points. Nothing
// else counts, so Viva never judges from outside knowledge. The pure parts live here so the
// route, the page and the tests share one tally.
import type { Concept } from "./intel/study";

export const MAX_ROUNDS = 3;

/** What one explanation got across. Points are indices into the concept's key_points. */
export type TeachFeedback = {
  clear: number[]; // explained so a beginner would get it
  vague: { point: number; note: string }[]; // touched on but fuzzy or jargon; note says what was unclear
  check_notes: string[]; // claims the key points don't support: "check your notes", never "wrong"
  hint: string; // points toward one missing idea without stating it
  follow_up: string; // the question a curious beginner would ask next
  encouragement: string;
};
export type TeachRound = { explanation: string; feedback: TeachFeedback };
export type PointStatus = "clear" | "vague" | "missing";

/** Keep only real, distinct key-point indices; a point that is clear can't also be vague. */
export function clean(f: Partial<TeachFeedback>, n: number): TeachFeedback {
  const ok = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < n;
  const list = <T,>(v: T[] | undefined) => (Array.isArray(v) ? v : []);
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const clear = [...new Set(list(f.clear).filter(ok))].sort((a, b) => a - b);
  const taken = new Set(clear);
  const vague = list(f.vague)
    .filter((v) => ok(v?.point) && !taken.has(v.point) && !!taken.add(v.point))
    .map((v) => ({ point: v.point, note: text(v.note) }));
  return {
    clear,
    vague,
    check_notes: list(f.check_notes).map(text).filter(Boolean),
    hint: text(f.hint),
    follow_up: text(f.follow_up),
    encouragement: text(f.encouragement),
  };
}

/** Best status of each key point across rounds: explaining it clearly once is enough. */
export function tally(concept: Concept, rounds: TeachRound[]): PointStatus[] {
  const status: PointStatus[] = concept.key_points.map(() => "missing");
  for (const r of rounds) {
    for (const v of r.feedback.vague) if (status[v.point] === "missing") status[v.point] = "vague";
    for (const i of r.feedback.clear) if (status[i]) status[i] = "clear";
  }
  return status;
}

export const clearCount = (status: PointStatus[]) => status.filter((s) => s === "clear").length;

/** A session ends when every key point is clear or the rounds run out. */
export const finished = (status: PointStatus[], rounds: number) => status.every((s) => s === "clear") || rounds >= MAX_ROUNDS;

/** What Viva says out loud after a round: short enough to listen to, ending on a question while there's more to do. */
export function spoken(f: TeachFeedback, status: PointStatus[], rounds: number): string {
  if (status.every((s) => s === "clear")) return `${f.encouragement} You got every key idea from your notes across. Nice teaching!`.trim();
  if (rounds >= MAX_ROUNDS) return `${f.encouragement} Let's stop there and look at what to review in your notes.`.trim();
  return [f.encouragement, f.hint || f.vague[0]?.note, f.follow_up].filter(Boolean).join(" ");
}
