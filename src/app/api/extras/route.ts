import { bad, db, noDb, profileExists } from "@/lib/db";

// The part of a profile's state that used to live only in one browser (Viva chats, suggestions set
// aside, demo events moved or removed, notes, study material), kept per profile so every device
// and the demo door see the same thing. One JSON document per profile, last write wins; the
// browser merges before it writes, so two devices add to each other rather than overwrite.

let ensured = false;
async function ensure(sql: NonNullable<ReturnType<typeof db>>) {
  if (ensured) return;
  // Mirrors db/schema.sql; here so the route works before anyone re-runs db:migrate.
  await sql`CREATE TABLE IF NOT EXISTS profile_extras (profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE, data JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  ensured = true;
}

export async function GET(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const id = new URL(req.url).searchParams.get("profile_id");
  if (!(await profileExists(sql, id, req))) return bad("unknown profile_id");
  await ensure(sql);
  const [r] = await sql`SELECT data, updated_at FROM profile_extras WHERE profile_id = ${id}`;
  return Response.json(r ? { data: r.data, updatedAt: (r.updated_at as Date).toISOString() } : { data: null });
}

export async function PUT(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const b = await req.json().catch(() => null);
  if (!(await profileExists(sql, b?.profile_id, req))) return bad("unknown profile_id");
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) return bad("data must be an object");
  if (JSON.stringify(b.data).length > 2_000_000) return bad("data too large");
  await ensure(sql);
  await sql`INSERT INTO profile_extras (profile_id, data) VALUES (${b.profile_id}, ${sql.json(b.data)})
            ON CONFLICT (profile_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
  return Response.json({ ok: true });
}
