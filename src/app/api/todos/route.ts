import { bad, db, noDb, profileExists } from "@/lib/db";

export async function PATCH(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const b = await req.json().catch(() => null);
  if (!(await profileExists(sql, b?.profile_id, req)) || typeof b.id !== "string") return bad("profile_id and id required");
  await sql`UPDATE todos SET done_at = ${b.done ? sql`now()` : null} WHERE profile_id = ${b.profile_id} AND id = ${b.id}`;
  return Response.json({ ok: true });
}
