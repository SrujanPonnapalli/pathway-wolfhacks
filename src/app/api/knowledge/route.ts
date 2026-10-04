// GET /api/knowledge?profile=maya&course=BIO%20181  ->  { live, sources, nodes, edges }
// What Pathway knows, from Tiger when it's configured (live: true), else this server's memory.
import { live, load } from "@/lib/knowledge/db";
import { route } from "@/lib/intel/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = new URL(req.url);
  const profile = u.searchParams.get("profile") ?? "maya";
  const course = u.searchParams.get("course") ?? undefined;
  const kb = await load(profile, course);
  return Response.json({ live: live(), ...kb });
});
