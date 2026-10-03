// Slides / notes / readings -> study material: quiz questions, Viva (oral) questions,
// flashcards. One function, three modes, same source file.

import { Type, type Schema } from "@google/genai";
import { filePart, generateJSON, textPart } from "../gemini";

export type QuizQuestion = {
  question: string;
  options: string[]; // 4 options
  answer_index: number;
  hint: string; // nudges, never gives it away
  explanation: string;
  topic: string;
  source_ref: string; // slide number / section
};

export type VivaQuestion = {
  question: string; // open-ended, answerable out loud in 30-60 s
  key_points: string[]; // what a good answer mentions
  hint: string;
  topic: string;
};

export type Flashcard = { front: string; back: string; topic: string };

export type StudyMaterial = {
  title: string;
  topics: string[];
  quiz: QuizQuestion[];
  viva: VivaQuestion[];
  flashcards: Flashcard[];
};

const schema: Schema = {
  type: Type.OBJECT,
  required: ["title", "topics", "quiz", "viva", "flashcards"],
  properties: {
    title: { type: Type.STRING },
    topics: { type: Type.ARRAY, items: { type: Type.STRING } },
    quiz: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["question", "options", "answer_index", "hint", "explanation", "topic", "source_ref"],
        properties: {
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          answer_index: { type: Type.INTEGER },
          hint: { type: Type.STRING },
          explanation: { type: Type.STRING },
          topic: { type: Type.STRING },
          source_ref: { type: Type.STRING },
        },
      },
    },
    viva: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["question", "key_points", "hint", "topic"],
        properties: {
          question: { type: Type.STRING },
          key_points: { type: Type.ARRAY, items: { type: Type.STRING } },
          hint: { type: Type.STRING },
          topic: { type: Type.STRING },
        },
      },
    },
    flashcards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["front", "back", "topic"],
        properties: { front: { type: Type.STRING }, back: { type: Type.STRING }, topic: { type: Type.STRING } },
      },
    },
  },
};

const SYSTEM = `You write study material from a student's own course content (slides, notes, readings).
Rules:
- Every question must be answerable from the provided material. No outside trivia.
- Quiz: exactly 4 options, one correct, distractors plausible. Mix recall and application.
- Hints nudge toward the concept without stating the answer.
- Viva questions are open-ended and spoken; key_points list 2-4 things a good answer includes.
- Flashcards: front is a term or question, back is a short answer (under 30 words).
- source_ref cites the slide number or section heading you used.
- Plain language. No "as an AI".`;

export async function makeStudyMaterial(input: {
  bytes?: Buffer;
  mimeType?: string;
  text?: string;
  counts?: { quiz?: number; viva?: number; flashcards?: number };
  focus?: string; // optional: "cell respiration only"
}): Promise<StudyMaterial> {
  const n = { quiz: 3, viva: 2, flashcards: 10, ...input.counts };
  const parts = [];
  if (input.bytes && input.mimeType) parts.push(filePart(input.bytes, input.mimeType));
  if (input.text) parts.push(textPart(input.text));
  parts.push(
    textPart(
      `Produce ${n.quiz} quiz questions, ${n.viva} viva questions, and ${n.flashcards} flashcards.` +
        (input.focus ? ` Focus on: ${input.focus}.` : ""),
    ),
  );
  return generateJSON<StudyMaterial>({ parts, schema, system: SYSTEM, temperature: 0.5 });
}

/** Grade a spoken/typed Viva answer against the key points. Returns a hint, not the answer. */
export type VivaFeedback = { score_0_to_5: number; covered: string[]; missed: string[]; hint: string; encouragement: string };

export async function gradeViva(q: VivaQuestion, answer: string): Promise<VivaFeedback> {
  const s: Schema = {
    type: Type.OBJECT,
    required: ["score_0_to_5", "covered", "missed", "hint", "encouragement"],
    properties: {
      score_0_to_5: { type: Type.INTEGER },
      covered: { type: Type.ARRAY, items: { type: Type.STRING } },
      missed: { type: Type.ARRAY, items: { type: Type.STRING } },
      hint: { type: Type.STRING },
      encouragement: { type: Type.STRING },
    },
  };
  return generateJSON<VivaFeedback>({
    parts: [textPart(`Question: ${q.question}\nKey points: ${q.key_points.join("; ")}\nStudent answer (transcribed speech, may have errors): ${answer}`)],
    schema: s,
    system: "You are a kind TA. Score the answer against the key points. The hint must point at a missed idea without giving it away. One sentence of encouragement, specific to what they got right.",
  });
}
