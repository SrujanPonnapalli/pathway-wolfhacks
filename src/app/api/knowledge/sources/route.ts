// DELETE /api/knowledge/sources { profile, id }  -> removes the file's facts, edges and telemetry.
import { removeSource } from "@/lib/knowledge/db";
import { HttpError, route } from "@/lib/intel/http";

export const DELETE = route(async (req) => {
  const b = await req.json().catch(() => null);
  if (!b || typeof b.id !== "string") throw new HttpError(400, "Body needs { profile, id }.");
  await removeSource(typeof b.profile === "string" ? b.profile : "maya", b.id);
  return Response.json({ ok: true });
});
