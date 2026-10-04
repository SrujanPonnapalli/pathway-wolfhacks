import { bad, db, noDb, profileExists } from "@/lib/db";

// A student's buddies and their effort this week. Effort only: never courses, status or inputs.
export async function GET(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const id = new URL(req.url).searchParams.get("profile_id");
  if (!(await profileExists(sql, id, req))) return bad("unknown profile_id");
  const rows = await sql`
    SELECT e.name, e.blocks_done::int AS "blocksDone", e.blocks_planned::int AS "blocksPlanned", coalesce(s.streak_days, 0) AS streak
    FROM buddies b JOIN buddy_effort e ON e.profile_id = b.buddy_id
    LEFT JOIN profile_streaks s ON s.profile_id = b.buddy_id
    WHERE b.profile_id = ${id} ORDER BY e.name`;
  return Response.json(rows);
}
