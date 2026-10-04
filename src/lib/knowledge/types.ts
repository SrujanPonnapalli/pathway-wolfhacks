// The course knowledge graph: typed facts with provenance (docs/knowledge/PLAN.md §3.1).
// Plain data, shared by the server (ingest, Tiger) and the browser (local-first copy, Viva).

import type { FileKind } from "../intel/analyze";

export type NodeType = "deadline" | "grading" | "policy" | "topic" | "grade_item" | "contact" | "event" | "preference" | "course_info";
export type Confidence = "high" | "medium" | "low";
export type Review = "proposed" | "confirmed" | "edited" | "rejected";
export type Rel = "covers" | "counts_toward" | "supersedes" | "conflicts_with" | "feeds_week" | "feeds_model" | "mentioned_in";
export type Creator = "extractor" | "linker" | "student" | "viva" | "seed";
export type Step = "received" | "classified" | "extracted" | "linked" | "indexed" | "reviewed";

export type KbNode = {
  id: string; // stable: n + hash of (profile, course, type, title[, date]) so re-ingesting never duplicates
  profile: string;
  course: string; // course code like "BIO 181" ("" when unknown)
  type: NodeType;
  title: string;
  body: Record<string, unknown>; // typed payload: deadline {date,time,kind,weight} · grade_item {score,max,status,due} · grading {weight} · topic {summary} · policy {text} · contact {email,office_hours}
  confidence: Confidence;
  review: Review;
  source?: string; // KbSource id
  quote?: string; // the sentence it came from
  locator?: string; // "p.3", "slide 12", "email from Dr. Lee", "row 4"
  supersededBy?: string;
  createdBy: Creator;
  createdAt: string;
};

export type KbEdge = { from: string; to: string; rel: Rel; why: string; createdBy: Creator };

export type KbStep = { step: Step; at: string; ms: number; model?: string; tokensIn?: number; tokensOut?: number; detail?: Record<string, unknown> };

export type KbSource = {
  id: string; // s + sha256 prefix
  profile: string;
  course: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  kind: FileKind;
  kindConfidence: Confidence;
  why: string;
  uploadedAt: string;
  steps: KbStep[];
};

export type Knowledge = { sources: KbSource[]; nodes: KbNode[]; edges: KbEdge[] };

export const emptyKnowledge = (): Knowledge => ({ sources: [], nodes: [], edges: [] });

/** What the ingest route streams, one JSON object per line. */
export type IngestEvent =
  | { stage: "received"; source: string; filename: string; cached: boolean; ms: number }
  | { stage: "classified"; kind: FileKind; course: string; title: string; confidence: Confidence; why: string; ms: number }
  | { stage: "extracted"; facts: number; ms: number }
  | { stage: "linked"; merged: number; conflicts: number; edges: number; ms: number }
  | { stage: "reviewed"; confirmed: number; needsYou: number; ms: number }
  | { stage: "done"; source: KbSource; nodes: KbNode[]; edges: KbEdge[]; legacy: unknown; ms: number }
  | { stage: "error"; error: string };
