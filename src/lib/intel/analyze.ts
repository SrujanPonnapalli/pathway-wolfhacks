// "Drop anything": figure out what a file is, then run the right extractor.
//   syllabus  -> parseSyllabus
//   slides/notes/reading -> makeStudyMaterial
//   dataset (csv/tsv) -> profileDataset + interpretDataset
//   assignment/other -> summary + action items

import { Type, type Schema } from "@google/genai";
import { filePart, generateJSONMeta, textPart, type CallMeta } from "../gemini";
import { interpretDataset, profileDataset, type DatasetInsights, type DatasetProfile } from "./dataset";
import { makeStudyMaterial, type StudyMaterial } from "./study";
import { parseSyllabus, type Syllabus } from "./syllabus";

export type FileKind = "syllabus" | "grades" | "slides" | "notes" | "reading" | "assignment" | "dataset" | "other";

export type Classification = {
  kind: FileKind;
  course_guess: string; // "BIO 181" or ""
  title: string;
  confidence: "high" | "medium" | "low";
  why: string;
};

const classifySchema: Schema = {
  type: Type.OBJECT,
  required: ["kind", "course_guess", "title", "confidence", "why"],
  properties: {
    kind: { type: Type.STRING, enum: ["syllabus", "grades", "slides", "notes", "reading", "assignment", "dataset", "other"] },
    course_guess: { type: Type.STRING },
    title: { type: Type.STRING },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
    why: { type: Type.STRING },
  },
};

/** A Gradescope or Moodle gradebook: page PDF, screenshot, or CSV export. */
export type GradeImport = {
  course_guess: string;
  source: string; // "Gradescope" | "Moodle" | "other"
  items: { name: string; score: number | null; max: number | null; status: "graded" | "submitted" | "not_submitted" | "missing" | "unknown"; due: string }[];
  average_percent: number | null; // over graded items only
  warnings: string[];
};

const gradesSchema: Schema = {
  type: Type.OBJECT,
  required: ["course_guess", "source", "items", "average_percent", "warnings"],
  properties: {
    course_guess: { type: Type.STRING },
    source: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["name", "score", "max", "status", "due"],
        properties: {
          name: { type: Type.STRING },
          score: { type: Type.NUMBER, nullable: true },
          max: { type: Type.NUMBER, nullable: true },
          status: { type: Type.STRING, enum: ["graded", "submitted", "not_submitted", "missing", "unknown"] },
          due: { type: Type.STRING, description: "YYYY-MM-DD or empty" },
        },
      },
    },
    average_percent: { type: Type.NUMBER, nullable: true },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
};

export type GenericSummary = {
  summary: string;
  key_points: string[];
  action_items: { task: string; due: string; effort_minutes: number }[];
  questions_to_ask_instructor: string[];
};

const genericSchema: Schema = {
  type: Type.OBJECT,
  required: ["summary", "key_points", "action_items", "questions_to_ask_instructor"],
  properties: {
    summary: { type: Type.STRING },
    key_points: { type: Type.ARRAY, items: { type: Type.STRING } },
    action_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["task", "due", "effort_minutes"],
        properties: { task: { type: Type.STRING }, due: { type: Type.STRING }, effort_minutes: { type: Type.INTEGER } },
      },
    },
    questions_to_ask_instructor: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
};

const TABULAR = /^(text\/csv|text\/tab-separated-values|application\/vnd\.ms-excel)$/;

export type AnalyzeInput = { bytes: Buffer; mimeType: string; filename: string; question?: string; knownCourses?: string[] };
export type Extracted = { classification: Classification; syllabus?: Syllabus; grades?: GradeImport; study?: StudyMaterial; generic?: GenericSummary; profile?: DatasetProfile; insights?: DatasetInsights };

const partFor = (bytes: Buffer, mimeType: string) => (mimeType.startsWith("text/") ? textPart(bytes.toString("utf8").slice(0, 200_000)) : filePart(bytes, mimeType));

/** Stage 1: what is this file? (datasets are recognised without a model call) */
export async function classify(input: AnalyzeInput): Promise<{ classification: Classification; meta: CallMeta | null }> {
  const { bytes, mimeType, filename } = input;
  if (TABULAR.test(mimeType) || /\.(csv|tsv)$/i.test(filename)) return { classification: { kind: "dataset", course_guess: "", title: filename, confidence: "high", why: "tabular file" }, meta: null };
  const r = await generateJSONMeta<Classification>({
    parts: [partFor(bytes, mimeType), textPart(`Filename: ${filename}.` + (input.knownCourses?.length ? ` The student's courses: ${input.knownCourses.join(", ")}.` : "") + " Classify this document.")],
    schema: classifySchema,
    system: "Classify a student's uploaded course document. A syllabus lists grading and a schedule. Grades is a Gradescope, Moodle or gradebook page/screenshot/export listing assignments with scores or submission status. Slides are lecture decks. Notes are student-written. Reading is a textbook chapter or paper. Assignment is a problem set, lab, or project prompt. Pick the single best kind.",
    tier: "fast", // a label and a title: the small model reads PDFs fine and answers in about a second
  });
  return { classification: r.data, meta: r.meta };
}

/** Stage 2: pull the facts out, with the extractor that fits the kind. */
export async function extract(input: AnalyzeInput, classification: Classification): Promise<{ result: Extracted; meta: CallMeta | null }> {
  const { bytes, mimeType } = input;
  const part = partFor(bytes, mimeType);
  switch (classification.kind) {
    case "dataset": {
      const profile = profileDataset(bytes.toString("utf8"));
      const insights = await interpretDataset(profile, input.question);
      return { result: { classification, profile, insights }, meta: null };
    }
    case "syllabus": {
      const t0 = Date.now();
      const syllabus = await parseSyllabus({ bytes, mimeType });
      return { result: { classification, syllabus }, meta: { model: "", usage: { input: 0, output: 0 }, ms: Date.now() - t0 } };
    }
    case "grades": {
      const r = await generateJSONMeta<GradeImport>({
        parts: [part, textPart("Extract every assignment row with its score, max points, submission status and due date. average_percent is the mean of score/max over graded rows only. Copy names exactly.")],
        schema: gradesSchema,
        system: "You read a student's grade page (Gradescope, Moodle, or a CSV export). Report only what is shown; null for anything missing. Never invent a score.",
      });
      return { result: { classification, grades: r.data }, meta: r.meta };
    }
    case "slides":
    case "notes":
    case "reading": {
      const t0 = Date.now();
      const study = await makeStudyMaterial({ bytes, mimeType });
      return { result: { classification, study }, meta: { model: "", usage: { input: 0, output: 0 }, ms: Date.now() - t0 } };
    }
    default: {
      const r = await generateJSONMeta<GenericSummary>({
        parts: [part, textPart(input.question ?? "Summarize this for the student and list what they need to do, with dates if present.")],
        schema: genericSchema,
        system: "You help a college student act on a course document. Be concrete. If a date is printed, copy it; otherwise write 'not stated'. effort_minutes is your honest estimate.",
      });
      return { result: { classification, generic: r.data }, meta: r.meta };
    }
  }
}

/** Classify then extract, in one go (the older entry point; the ingest pipeline runs the stages itself). */
export async function analyzeFile(input: AnalyzeInput): Promise<Extracted> {
  const { classification } = await classify(input);
  return (await extract(input, classification)).result;
}
