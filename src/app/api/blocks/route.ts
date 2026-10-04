import { after } from "next/server";
import { attestProfile } from "@/lib/solana/chain";
import { bad, db, noDb, profileExists } from "@/lib/db";

// Make It Real: save study blocks (idempotent on the browser's id).
export async function POST(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const b = await req.json().catch(() => null);
  if (!(await profileExists(sql, b?.profile_id))) return bad("unknown profile_id");
  if (!Array.isArray(b.blocks) || b.blocks.length === 0 || b.blocks.length > 10) return bad("blocks must be 1-10 items");
  for (const x of b.blocks)
    if (typeof x.id !== "string" || typeof x.course !== "string" || typeof x.title !== "string" || Number.isNaN(Date.parse(x.at))) return bad("each block needs id, course, title, at");
  await sql`INSERT INTO study_blocks ${sql(
    b.blocks.map((x: { id: string; course: string; title: string; at: string }) => ({ client_id: x.id, profile_id: b.profile_id, course_slug: x.course, title: x.title.slice(0, 200), starts_at: x.at })),
  )} ON CONFLICT (profile_id, client_id) DO NOTHING`;
  after(() => attestProfile(sql, b.profile_id).catch((e) => console.error("attest", e))); // the plan grew
  return Response.json({ ok: true });
}

// Mark a block done or not done.
export async function PATCH(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const b = await req.json().catch(() => null);
  if (!(await profileExists(sql, b?.profile_id)) || typeof b.id !== "string") return bad("profile_id and id required");
  await sql`UPDATE study_blocks SET done_at = ${b.done ? sql`now()` : null} WHERE profile_id = ${b.profile_id} AND client_id = ${b.id}`;
  after(() => attestProfile(sql, b.profile_id).catch((e) => console.error("attest", e)));
  return Response.json({ ok: true });
}
