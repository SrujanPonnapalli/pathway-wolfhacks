// POST JSON { question: VivaQuestion, answer: string }  ->  VivaFeedback (hint, not the answer)
// The STT route turns speech into `answer`; this grades it.
import { gradeViva, type VivaQuestion } from "@/lib/intel/study";
import { route, HttpError } from "@/lib/intel/http";

export const POST = route(async (req) => {
  const body = await req.json().catch(() => null);
  const q = body?.question as VivaQuestion | undefined;
  if (!q?.question || !Array.isArray(q.key_points) || typeof body?.answer !== "string") throw new HttpError(400, "Body needs { question: VivaQuestion, answer: string }.");
  return Response.json(await gradeViva(q, body.answer));
});
