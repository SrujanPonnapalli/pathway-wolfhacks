import { bad, db, noDb, profileExists } from "@/lib/db";
import { demoProfileId, resetDemoProfile } from "@/lib/demoAccount";

// A profile's logged activity since its seed, in the store's shape. GET hydrates the app;
// DELETE is the demo's "Reset": back to the start state. Logged activity, plans, uploaded files
// and their facts, chats and the rest of the browser-side state go; the seed (courses, meetings,
// deadlines, to-dos, the streak) stays, and the browser re-seeds the sample files and facts.
export async function GET(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const id = new URL(req.url).searchParams.get("profile_id");
  if (!(await profileExists(sql, id, req))) return bad("unknown profile_id");

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
  if (!(await profileExists(sql, id, req))) return bad("unknown profile_id");
  const resetAt = new Date().toISOString();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM events WHERE profile_id = ${id} AND source <> 'seed'`;
    await tx`DELETE FROM study_blocks WHERE profile_id = ${id} AND (client_id IS NULL OR client_id NOT LIKE 'pot-%')`; // Study Pot blocks are seeded (scripts/solana.ts)
    await tx`UPDATE todos SET done_at = NULL WHERE profile_id = ${id}`;
    // Uploaded files and their facts, and the browser-side state kept here: created lazily, so check first.
    for (const t of ["kb_nodes", "kb_sources", "profile_extras", "viva_turns", "inbox_briefs"]) {
      const [exists] = await tx`SELECT to_regclass(${t}) AS r`;
      if (exists.r) await tx`DELETE FROM ${tx(t)} WHERE profile_id = ${id}`; // nodes cascade edges; sources cascade their nodes
    }
    // Stamp the reset in the extras document: a device whose copy predates it drops that copy instead of
    // merging it back (chats, "Viva has introduced herself"), and /api/extras refuses its stale writes.
    const [extras] = await tx`SELECT to_regclass('profile_extras') AS r`;
    if (extras.r) await tx`INSERT INTO profile_extras (profile_id, data) VALUES (${id}, ${tx.json({ resetAt })})`;
    // The live judge profile starts empty again.
    await tx`DELETE FROM courses WHERE profile_id = ${id} AND ${id} = 'judge'`;
    // The demo student: everything else back to its default state too (courses, to-dos, buddies, Srujan's request).
    if (id === demoProfileId()) await resetDemoProfile(tx, id);
  });
  return Response.json({ ok: true, resetAt });
}
