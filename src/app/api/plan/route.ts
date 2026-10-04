// POST PlanInput -> { proposals }  One Gemini call; the client only calls this when its context hash changes.
import { plan, type PlanInput } from "@/lib/intel/planner";
import { route, HttpError } from "@/lib/intel/http";

export const POST = route(async (req) => {
  const body = (await req.json().catch(() => null)) as PlanInput | null;
  if (!body || !Array.isArray(body.week) || !Array.isArray(body.courses)) throw new HttpError(400, "Body needs { now, courses, week, dueSoon, inbox, policies, existingSuggestions }.");
  return Response.json({ proposals: await plan(body) });
});
