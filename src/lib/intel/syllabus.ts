// Syllabus -> structured course facts. PDF, image (photo of a printed syllabus), or text.
// Structured output mode means parsing never breaks the calendar.

import { Type, type Schema } from "@google/genai";
import { filePart, generateJSON, textPart } from "../gemini";

export type Syllabus = {
  course: { code: string; name: string; term: string; instructor: string; instructor_email: string; office_hours: string };
  grading: { component: string; weight_percent: number | null; notes: string }[];
  deadlines: {
    title: string;
    kind: "exam" | "quiz" | "assignment" | "project" | "reading" | "other";
    date: string; // YYYY-MM-DD, or "" if the syllabus gives only a week
    time: string; // "23:59" or ""
    weight_percent: number | null;
    confidence: "high" | "medium" | "low";
    source_text: string; // the phrase it came from, so the student can confirm
  }[];
  policies: { late_work: string; attendance: string; extensions: string; academic_integrity: string };
  warnings: string[]; // e.g. "No year printed; dates assume Fall 2026"
};

const schema: Schema = {
  type: Type.OBJECT,
  required: ["course", "grading", "deadlines", "policies", "warnings"],
  properties: {
    course: {
      type: Type.OBJECT,
      required: ["code", "name", "term", "instructor", "instructor_email", "office_hours"],
      properties: {
        code: { type: Type.STRING },
        name: { type: Type.STRING },
        term: { type: Type.STRING },
        instructor: { type: Type.STRING },
        instructor_email: { type: Type.STRING },
        office_hours: { type: Type.STRING },
      },
    },
    grading: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["component", "weight_percent", "notes"],
        properties: {
          component: { type: Type.STRING },
          weight_percent: { type: Type.NUMBER, nullable: true },
          notes: { type: Type.STRING },
        },
      },
    },
    deadlines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["title", "kind", "date", "time", "weight_percent", "confidence", "source_text"],
        properties: {
          title: { type: Type.STRING },
          kind: { type: Type.STRING, enum: ["exam", "quiz", "assignment", "project", "reading", "other"] },
          date: { type: Type.STRING, description: "YYYY-MM-DD or empty" },
          time: { type: Type.STRING, description: "HH:MM 24h or empty" },
          weight_percent: { type: Type.NUMBER, nullable: true },
          confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
          source_text: { type: Type.STRING },
        },
      },
    },
    policies: {
      type: Type.OBJECT,
      required: ["late_work", "attendance", "extensions", "academic_integrity"],
      properties: {
        late_work: { type: Type.STRING },
        attendance: { type: Type.STRING },
        extensions: { type: Type.STRING },
        academic_integrity: { type: Type.STRING },
      },
    },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
};

const SYSTEM = `You extract facts from a university course syllabus for a student planning app.
Rules:
- Only report what the document says. Empty string for anything missing. Never invent dates.
- Dates: resolve to YYYY-MM-DD using the term printed on the syllabus. If only a week number or
  "Week 5" is given, leave date empty and add a warning. If the year is missing, assume the
  current academic term and say so in warnings.
- Every graded item with a date is a deadline (exams, quizzes, projects, homework, papers).
  Recurring items ("homework due every Friday") become one deadline per occurrence only when
  the dates are listed; otherwise one entry with the pattern in source_text and date empty.
- confidence: high = explicit date next to the item; medium = inferred from a schedule table;
  low = guessed from context.
- Keep source_text to the exact phrase (max 120 chars) so the student can verify.`;

export async function parseSyllabus(input: { bytes?: Buffer; mimeType?: string; text?: string; today?: string }): Promise<Syllabus> {
  const parts = [];
  if (input.bytes && input.mimeType) parts.push(filePart(input.bytes, input.mimeType));
  if (input.text) parts.push(textPart(input.text));
  parts.push(textPart(`Today is ${input.today ?? new Date().toISOString().slice(0, 10)}. Extract the syllabus.`));
  return generateJSON<Syllabus>({ parts, schema, system: SYSTEM });
}
