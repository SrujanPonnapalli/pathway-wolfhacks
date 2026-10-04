// Teach mode's brain: the student explains a concept out loud and Viva, playing a curious friend
// who has never heard of it, says what landed. The yardstick is the concept's key points, which
// come from the student's own slides; anything beyond them is "check your notes", never "wrong".

import { Type, type Schema } from "@google/genai";
import { generateJSON, textPart } from "../gemini";
import { clean, tally, type TeachFeedback, type TeachRound } from "../teach";
import type { Concept } from "./study";

const schema: Schema = {
  type: Type.OBJECT,
  required: ["clear", "vague", "check_notes", "hint", "follow_up", "encouragement"],
  properties: {
    clear: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    vague: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["point", "note"],
        properties: { point: { type: Type.INTEGER }, note: { type: Type.STRING } },
      },
    },
    check_notes: { type: Type.ARRAY, items: { type: Type.STRING } },
    hint: { type: Type.STRING },
    follow_up: { type: Type.STRING },
    encouragement: { type: Type.STRING },
  },
};

const SYSTEM = `You are Viva, listening while a student teaches you a concept from their own course material (the Feynman technique).
Play a curious friend who has never heard of the topic. Judge ONLY against the numbered KEY POINTS, which come from
the student's slides; you know nothing else about the subject.
- clear: numbers of the key points this explanation got across in plain words a beginner would follow. Naming a term is not explaining it.
- vague: key points touched on but left fuzzy, or covered with jargon that wasn't unpacked. note is one short sentence on what was unclear, without giving the answer.
- check_notes: things the student said that the key points don't support or seem to contradict, each as "You said ...; check that against your notes." Never call anything wrong: the slides may say more than the key points.
- hint: point toward ONE key point listed as still missing, without stating it. Empty if none are missing.
- follow_up: one short question a curious beginner would ask next, aimed at the biggest gap. If nothing is missing, ask for a real-world example.
- encouragement: one sentence, specific to something they explained well.
The explanation is transcribed speech and may contain transcription errors; don't count those against them.
Earlier rounds are context: this round may only answer your last question, so judge just what this explanation adds.
Plain words, no markdown, no "as an AI".`;

export async function teachFeedback(concept: Concept, explanation: string, earlier: TeachRound[] = []): Promise<TeachFeedback> {
  const status = tally(concept, earlier);
  const missing = status.flatMap((s, i) => (s === "clear" ? [] : [i]));
  const prompt = [
    `CONCEPT: ${concept.topic}`,
    `KEY POINTS:\n${concept.key_points.map((p, i) => `${i}. ${p}`).join("\n")}`,
    `STILL MISSING OR UNCLEAR: ${missing.length ? missing.join(", ") : "none"}`,
    ...earlier.map((r, i) => `ROUND ${i + 1} (you asked after it: "${r.feedback.follow_up}"):\n${r.explanation}`),
    `THIS ROUND:\n${explanation}`,
  ].join("\n\n");
  const raw = await generateJSON<TeachFeedback>({ parts: [textPart(prompt)], schema, system: SYSTEM });
  return clean(raw, concept.key_points.length);
}
