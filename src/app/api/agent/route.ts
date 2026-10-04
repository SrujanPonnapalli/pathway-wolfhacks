// POST JSON { message, context: AgentContext, history? } -> { say, actions, remember, specialist, ms, usage }
// Viva's agent turn: one structured Gemini call. Actions are executed by the browser, which owns the data.
import { agentTurn, type AgentContext } from "@/lib/intel/agent";
import { route, HttpError } from "@/lib/intel/http";

export const POST = route(async (req) => {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const ctx = body?.context as AgentContext | undefined;
  if (!message) throw new HttpError(400, "Body needs { message }.");
  if (!ctx || !Array.isArray(ctx.courses)) throw new HttpError(400, "Body needs { context }. See src/lib/api.ts agentContext().");
  const history = Array.isArray(body.history) ? body.history : [];
  return Response.json(await agentTurn(message, ctx, history));
});
