import { after } from "next/server";
import { attestProfile } from "@/lib/solana/chain";
import { bad, db, noDb, profileExists } from "@/lib/db";

// Study blocks, the plan the browser keeps and the database remembers. Times arrive as UTC
// instants (src/lib/data.ts converts from the device's local form) and go back the same way.

// Make It Real, Viva, an approved suggestion: save blocks (idempotent on the browser's id).
// A block for a course this profile doesn't have (Viva's "gym at 9") stays on the device; the
// rest of the batch is saved rather than the whole request failing on it.
export async function POST(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const b = await req.json().catch(() => null);
  if (!(await profileExists(sql, b?.profile_id, req))) return bad("unknown profile_id");
  if (!Array.isArray(b.blocks) || b.blocks.length === 0 || b.blocks.length > 10) return bad("blocks must be 1-10 items");
  for (const x of b.blocks)
    if (typeof x.id !== "string" || typeof x.course !== "string" || typeof x.title !== "string" || Number.isNaN(Date.parse(x.at))) return bad("each block needs id, course, title, at");
  const known = new Set((await sql`SELECT slug FROM courses WHERE profile_id = ${b.profile_id}`).map((r) => r.slug as string));
  const rows = (b.blocks as { id: string; course: string; title: string; at: string }[]).filter((x) => known.has(x.course));
  if (rows.length)
    await sql`INSERT INTO study_blocks ${sql(rows.map((x) => ({ client_id: x.id, profile_id: b.profile_id, course_slug: x.course, title: x.title.slice(0, 200), starts_at: new Date(x.at) })))} ON CONFLICT (profile_id, client_id) DO NOTHING`;
  if (rows.length) after(() => attestProfile(sql, b.profile_id).catch((e) => console.error("attest", e))); // the plan grew
  return Response.json({ ok: true, saved: rows.length, skipped: b.blocks.length - rows.length });
}

// Mark a block done or not done, move it (`at`, UTC) or rename it (`title`).
export async function PATCH(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const b = await req.json().catch(() => null);
  if (!(await profileExists(sql, b?.profile_id, req)) || typeof b.id !== "string") return bad("profile_id and id required");
  const patch: Record<string, unknown> = {};
  if (typeof b.done === "boolean") patch.done_at = b.done ? new Date() : null;
  if (typeof b.at === "string" && !Number.isNaN(Date.parse(b.at))) patch.starts_at = new Date(b.at);
  if (typeof b.title === "string" && b.title.trim()) patch.title = b.title.trim().slice(0, 200);
  if (!Object.keys(patch).length) return bad("nothing to change: done, at or title");
  await sql`UPDATE study_blocks SET ${sql(patch)} WHERE profile_id = ${b.profile_id} AND client_id = ${b.id}`;
  after(() => attestProfile(sql, b.profile_id).catch((e) => console.error("attest", e)));
  return Response.json({ ok: true });
}

// A block the student (or Viva) removed: gone here too, so a reload doesn't bring it back.
export async function DELETE(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const b = await req.json().catch(() => null);
  if (!(await profileExists(sql, b?.profile_id, req)) || typeof b.id !== "string") return bad("profile_id and id required");
  await sql`DELETE FROM study_blocks WHERE profile_id = ${b.profile_id} AND client_id = ${b.id}`;
  after(() => attestProfile(sql, b.profile_id).catch((e) => console.error("attest", e)));
  return Response.json({ ok: true });
}
