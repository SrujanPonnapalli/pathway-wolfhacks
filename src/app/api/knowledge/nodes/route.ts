// PATCH /api/knowledge/nodes { profile, id, review: confirmed|rejected|edited, title?, body? }
// The review gate: the student confirms, edits or rejects a fact. Only confirmed facts feed the
// Week, the model's inputs and Viva. The browser updates its own copy too (local-first).
import { mayUseProfile } from "@/lib/db";
import { setReview } from "@/lib/knowledge/db";
import { HttpError, route } from "@/lib/intel/http";

export const PATCH = route(async (req) => {
  const b = await req.json().catch(() => null);
  if (!b || typeof b.id !== "string" || !["confirmed", "rejected", "edited", "proposed"].includes(b.review)) throw new HttpError(400, "Body needs { profile, id, review }.");
  const profile: string = typeof b.profile === "string" ? b.profile : "maya";
  if (!(await mayUseProfile(req, profile))) throw new HttpError(403, "Sign in to that account first.");
  await setReview(profile, b.id, b.review, { title: typeof b.title === "string" ? b.title : undefined, body: b.body && typeof b.body === "object" ? b.body : undefined });
  return Response.json({ ok: true });
});
