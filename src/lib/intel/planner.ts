// The planner: one small Gemini call that looks at everything the student has (week, due
// work, inbox, syllabus facts, status) and proposes up to three concrete calendar changes.
// Called only when the context changes (the client hashes it), so it costs tokens only
// when there is something new to think about. Proposals are ops the Week page can apply
// with the same Approve button as the rule-based ones; nothing happens without approval.

import { ThinkingLevel, Type, type Schema } from "@google/genai";
import { generate, textPart } from "../gemini";

export type PlanInput = {
  now: string;
  courses: { slug: string; code: string; status: "on_track" | "check_in"; reason: string; exam: { title: string; date: string }; recourse: string }[];
  week: { id: string; title: string; start: string; end: string; kind: string; course?: string }[];
  dueSoon: { title: string; date: string; course: string; status: string }[];
  inbox: { from: string; subject: string; snippet: string; course: string }[];
  policies: { course: string; late_work: string }[];
  existingSuggestions: string[]; // titles already proposed by the rules, to avoid repeats
};

export type Proposal = {
  id: string;
  title: string;
  why: string;
  ops: ({ op: "add"; title: string; start: string; end: string; course: string; kind: "study" | "other" } | { op: "move"; id: string; start: string; end: string })[];
};

const schema: Schema = {
  type: Type.OBJECT,
  required: ["proposals"],
  properties: {
    proposals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["title", "why", "ops"],
        properties: {
          title: { type: Type.STRING, description: "Imperative, under 12 words, e.g. 'Add the BIO 181 review session Wed 5 PM'" },
          why: { type: Type.STRING, description: "One sentence citing the fact it comes from (an email, a due date, the status reason)" },
          ops: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["op", "title", "start", "end", "course", "kind", "id"],
              properties: {
                op: { type: Type.STRING, enum: ["add", "move"] },
                title: { type: Type.STRING },
                start: { type: Type.STRING, description: "local ISO like 2026-10-07T17:00:00" },
                end: { type: Type.STRING },
                course: { type: Type.STRING, description: "course slug or empty" },
                kind: { type: Type.STRING, enum: ["study", "other"] },
                id: { type: Type.STRING, description: "for move: the week event id; for add: empty" },
              },
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You plan a college student's week. You get their calendar, due work, course mail, syllabus policies
and each course's status from a decision-tree model. Propose at most 3 changes, each as calendar operations.
Rules:
- Only propose things grounded in the input: an event mentioned in an email (review session, office hours, makeup),
  a due item with no work scheduled, an exam with no review block, a late-work policy that makes a date matter.
- Never overlap an existing event. Daytime slots (9:00 to 21:00). 50-minute study blocks unless the input says otherwise.
- Do not repeat anything in existingSuggestions.
- Never suggest working fewer hours, sleeping differently, or anything the student cannot change.
- Statuses are "on track" or "worth a check-in"; patterns not causes.
- If nothing is worth changing, return an empty list.`;

export async function plan(input: PlanInput): Promise<Proposal[]> {
  const res = await generate(
    {
      contents: [{ role: "user", parts: [textPart(JSON.stringify(input))] }],
      config: { systemInstruction: SYSTEM, responseMimeType: "application/json", responseSchema: schema, temperature: 0.2, maxOutputTokens: 900, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
    },
    "fast",
  );
  let parsed: { proposals: Proposal[] } = { proposals: [] };
  try {
    parsed = JSON.parse(res.text ?? "{}");
  } catch {
    return [];
  }
  const ok = (iso: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso);
  return (parsed.proposals ?? [])
    .map((p, i) => ({ ...p, id: `ai-${Date.now()}-${i}`, ops: (p.ops ?? []).filter((o) => ok(o.start) && ok(o.end)) }))
    .filter((p) => p.ops.length > 0)
    .slice(0, 3);
}
