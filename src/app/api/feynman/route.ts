// POST JSON { concept: Concept, explanation: string, earlier?: TeachRound[] }  ->  TeachFeedback
// Teach mode: the student explains a concept from their material; Viva says what landed.
import { teachFeedback } from "@/lib/intel/feynman";
import type { Concept } from "@/lib/intel/study";
import { clean, type TeachRound } from "@/lib/teach";
import { route, HttpError } from "@/lib/intel/http";

export const POST = route(async (req) => {
  const body = await req.json().catch(() => null);
  const c = body?.concept as Concept | undefined;
  if (!c?.topic || !Array.isArray(c.key_points) || !c.key_points.length || typeof body?.explanation !== "string" || !body.explanation.trim())
    throw new HttpError(400, "Body needs { concept: Concept, explanation: string, earlier?: TeachRound[] }.");
  const earlier: TeachRound[] = (Array.isArray(body.earlier) ? body.earlier : []).map((r: Partial<TeachRound>) => ({
    explanation: String(r?.explanation ?? ""),
    feedback: clean(r?.feedback ?? {}, c.key_points.length),
  }));
  return Response.json(await teachFeedback(c, body.explanation, earlier));
});
