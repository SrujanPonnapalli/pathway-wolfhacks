// DELETE /api/knowledge/sources { profile, id }  -> removes the file's facts, edges and telemetry.
import { mayUseProfile } from "@/lib/db";
import { removeSource } from "@/lib/knowledge/db";
import { HttpError, route } from "@/lib/intel/http";

export const DELETE = route(async (req) => {
  const b = await req.json().catch(() => null);
  if (!b || typeof b.id !== "string") throw new HttpError(400, "Body needs { profile, id }.");
  const profile: string = typeof b.profile === "string" ? b.profile : "maya";
  if (!(await mayUseProfile(req, profile))) throw new HttpError(403, "Sign in to that account first.");
  await removeSource(profile, b.id);
  return Response.json({ ok: true });
});
