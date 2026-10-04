// The focus timer, shared per profile so every device (laptop, phone, Beacon) shows the same running timer.
//   GET ?profile_id=            -> { state } | null
//   PUT { profile_id, state }   -> { ok }        newest `state.at` wins; an older write is ignored
// state = { status, course, endsAt, left, at, by } (times in real ms; `by` is the device that started it).
// Reset (/api/state DELETE) writes an idle state stamped with the reset time, which stops it everywhere.
import { bad, db, noDb, profileExists } from "@/lib/db";

type Sql = NonNullable<ReturnType<typeof db>>;
let ensured = false;
async function ensure(sql: Sql) {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS focus_timers (profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  ensured = true;
}

const STATUS = new Set(["idle", "running", "paused", "done"]);

export async function GET(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const id = new URL(req.url).searchParams.get("profile_id");
  if (!(await profileExists(sql, id, req))) return bad("unknown profile_id");
  await ensure(sql);
  const [r] = await sql`SELECT state FROM focus_timers WHERE profile_id = ${id}`;
  return Response.json(r ? { state: r.state } : null);
}

export async function PUT(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const b = await req.json().catch(() => null);
  if (!(await profileExists(sql, b?.profile_id, req))) return bad("unknown profile_id");
  const s = b.state;
  if (!s || !STATUS.has(s.status) || typeof s.at !== "number" || typeof s.endsAt !== "number" || typeof s.left !== "number") return bad("state must be { status, course, endsAt, left, at, by }");
  const state = { status: s.status, course: String(s.course ?? "").slice(0, 40), endsAt: s.endsAt, left: Math.max(0, Math.min(3600, s.left)), at: s.at, by: String(s.by ?? "").slice(0, 40) };
  await ensure(sql);
  // Newest wins: a slow device can't undo a later pause, stop or Reset.
  await sql`INSERT INTO focus_timers (profile_id, state) VALUES (${b.profile_id}, ${sql.json(state)})
            ON CONFLICT (profile_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()
            WHERE (focus_timers.state->>'at')::bigint < (EXCLUDED.state->>'at')::bigint`;
  return Response.json({ ok: true });
}
