// POST JSON { message, context: CoachContext, history?, mode?: "chat" | "draft" }  ->  { text, filtered, ms }
// One fast Gemini call over the context the browser sends. The server never scores.
import { coach, type CoachContext } from "@/lib/intel/coach";
import { route, HttpError } from "@/lib/intel/http";

export const POST = route(async (req) => {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const ctx = body?.context as CoachContext | undefined;
  if (!message) throw new HttpError(400, "Body needs { message }.");
  if (!ctx || !Array.isArray(ctx.courses)) throw new HttpError(400, "Body needs { context: { now, courses: [...] } }. See src/lib/api.ts coachContext().");
  const history = Array.isArray(body.history) ? body.history : [];
  const mode = body.mode === "draft" ? "draft" : "chat";
  return Response.json(await coach(message, ctx, history, mode));
});
