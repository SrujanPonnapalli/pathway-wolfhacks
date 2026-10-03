import { bad, db, noDb, profileExists } from "@/lib/db";

// A profile's logged activity since its seed, in the store's shape. GET hydrates the app;
// DELETE is the demo's "Reset demo data" (removes logged activity and plans, keeps the seed).
export async function GET(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const id = new URL(req.url).searchParams.get("profile_id");
  if (!(await profileExists(sql, id))) return bad("unknown profile_id");

  const [counts, checkins, blocks, todos] = await Promise.all([
    sql`SELECT course_slug, kind, count(*)::int AS n FROM events
        WHERE profile_id = ${id} AND source <> 'seed' GROUP BY course_slug, kind`,
    sql`SELECT DISTINCT meta->>'class_at' AS at FROM events
        WHERE profile_id = ${id} AND kind = 'check_in' AND meta ? 'class_at'`,
    sql`SELECT client_id, course_slug, title, starts_at, done_at FROM study_blocks WHERE profile_id = ${id} ORDER BY starts_at`,
    sql`SELECT id FROM todos WHERE profile_id = ${id} AND done_at IS NOT NULL`,
  ]);
  const deltas: Record<string, { quizzes: number; checkins: number; sessions: number }> = {};
  for (const r of counts) {
    const d = (deltas[r.course_slug] ??= { quizzes: 0, checkins: 0, sessions: 0 });
    if (r.kind === "quiz") d.quizzes += r.n;
    if (r.kind === "check_in") d.checkins += r.n;
    if (r.kind === "study") d.sessions += r.n;
  }
  return Response.json({
    deltas,
    checkedIn: Object.fromEntries(checkins.filter((c) => c.at).map((c) => [c.at, true])),
    blocks: blocks.map((b) => ({ id: b.client_id ?? String(b.starts_at), course: b.course_slug, title: b.title, at: b.starts_at.toISOString(), done: !!b.done_at })),
    done: Object.fromEntries(todos.map((t) => [t.id, true])),
  });
}

export async function DELETE(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const id = new URL(req.url).searchParams.get("profile_id");
  if (!(await profileExists(sql, id))) return bad("unknown profile_id");
  await sql.begin(async (tx) => {
    await tx`DELETE FROM events WHERE profile_id = ${id} AND source <> 'seed'`;
    await tx`DELETE FROM study_blocks WHERE profile_id = ${id}`;
    await tx`UPDATE todos SET done_at = NULL WHERE profile_id = ${id}`;
    // The live judge profile starts empty again.
    await tx`DELETE FROM courses WHERE profile_id = ${id} AND ${id} = 'judge'`;
  });
  return Response.json({ ok: true });
}
