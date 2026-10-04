// Teach mode's brain: the student explains a concept out loud and Viva, playing a curious friend
// who has never heard of it, says what landed. The yardstick is the concept's key points, which
// come from the student's own slides; anything beyond them is "check your notes", never "wrong".

import { Type, type Schema } from "@google/genai";
import { generateJSON, textPart } from "../gemini";
import { clean, tally, type TeachFeedback, type TeachMatch, type TeachRound } from "../teach";
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

// ---- Starting from a sentence ------------------------------------------------------------

const startSchema: Schema = {
  type: Type.OBJECT,
  required: ["course", "doc", "topic"],
  properties: { course: { type: Type.STRING }, doc: { type: Type.STRING }, topic: { type: Type.STRING } },
};

const START_SYSTEM = `You route a student's request to their own course files for Teach mode, where the student explains a concept to you.
From the MESSAGE and the lists below, return:
- course: the course code it's about, copied exactly from COURSES, or "" if you can't tell.
- doc: the id of the one file that best covers the concept, copied exactly from FILES, or "" if no file covers it. Prefer a lecture over a study guide.
- topic: the specific concept they want to explain, in 1 to 5 words and in their wording (for example "glycolysis"), or "" if they didn't name one.
Never invent a code or an id.`;

/** Which course and file a request like "let me teach you glycolysis for BIO 181" is about. One fast call; ids are checked against the lists. */
export async function resolveTeach(message: string, courses: { code: string; name: string }[], docs: { id: string; course: string; title: string; summary: string }[]): Promise<TeachMatch> {
  const prompt = [
    `MESSAGE: ${message}`,
    `COURSES:\n${courses.map((c) => `${c.code} · ${c.name}`).join("\n")}`,
    `FILES:\n${docs.map((d) => `${d.id} · ${d.course} · ${d.title}: ${d.summary}`).join("\n")}`,
  ].join("\n\n");
  const raw = await generateJSON<Partial<TeachMatch>>({ parts: [textPart(prompt)], schema: startSchema, system: START_SYSTEM, tier: "fast", temperature: 0 });
  const doc = docs.find((d) => d.id === raw.doc);
  const course = doc?.course ?? courses.find((c) => c.code === raw.course)?.code ?? "";
  return { course, doc: doc?.id ?? "", topic: String(raw.topic ?? "").trim().slice(0, 60) };
}

const conceptSchema: Schema = {
  type: Type.OBJECT,
  required: ["concepts"],
  properties: {
    concepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["topic", "key_points", "source_ref"],
        properties: {
          topic: { type: Type.STRING },
          key_points: { type: Type.ARRAY, items: { type: Type.STRING } },
          source_ref: { type: Type.STRING },
        },
      },
    },
  },
};

const CONCEPT_SYSTEM = `You pick the concepts a student could teach back from one of their own course files (the Feynman technique).
- 3 to 5 concepts. topic is a short name ("Glycolysis").
- key_points: 3 to 5 ideas a clear explanation must get across, each one short, plain and taken from the file. Nothing from outside the file.
- If FOCUS is given and the file covers it, make it the first concept and name it the way the student did.
- source_ref: the section or heading of the file it came from.`;

/** Concepts to teach, with their key points, read from one course file. These key points are what Viva grades against. */
export async function conceptsFrom(title: string, body: string, focus = ""): Promise<Concept[]> {
  const raw = await generateJSON<{ concepts?: Partial<Concept>[] }>({
    parts: [textPart(`FILE: ${title}\n\n${body.slice(0, 16000)}${focus ? `\n\nFOCUS: ${focus}` : ""}`)],
    schema: conceptSchema,
    system: CONCEPT_SYSTEM,
  });
  return (raw.concepts ?? [])
    .map((c) => ({
      topic: String(c.topic ?? "").trim(),
      key_points: (Array.isArray(c.key_points) ? c.key_points : []).map((p) => String(p).trim()).filter(Boolean).slice(0, 5),
      source_ref: [title, String(c.source_ref ?? "").trim()].filter(Boolean).join(" · "),
    }))
    .filter((c) => c.topic && c.key_points.length >= 2)
    .slice(0, 5);
}
