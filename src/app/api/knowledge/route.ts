// GET /api/knowledge?profile=maya&course=BIO%20181  ->  { live, sources, nodes, edges }
// What Pathway knows, from Tiger when it's configured (live: true), else this server's memory.
import { mayUseProfile } from "@/lib/db";
import { live, load } from "@/lib/knowledge/db";
import { HttpError, route } from "@/lib/intel/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = new URL(req.url);
  const profile = u.searchParams.get("profile") ?? "maya";
  const course = u.searchParams.get("course") ?? undefined;
  if (!(await mayUseProfile(req, profile))) throw new HttpError(403, "Sign in to that account first.");
  const kb = await load(profile, course);
  return Response.json({ live: live(), ...kb });
});
