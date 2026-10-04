// Viva's inbox brief, with one shared copy per profile so /demo and the demo account, on any device, see
// the same brief, and Reset (which deletes the row) makes the next visit rebuild it.
//   GET  ?profile_id=          -> { key, brief, at } | null      the saved brief (a database read, no Gemini)
//   POST { mail, context, profile_id?, key? }  -> Brief           one fast Gemini call; saved when it's Viva's
// Grounded in the mail and the on-device tree status the browser sends. The server never scores.
import { bad, db, profileExists } from "@/lib/db";
import type { Mail } from "@/lib/inbox";
import type { Brief } from "@/lib/inboxBrief";
import { briefInbox } from "@/lib/intel/inboxBrief";
import type { CoachContext } from "@/lib/intel/coach";
import { route, HttpError } from "@/lib/intel/http";

type Sql = NonNullable<ReturnType<typeof db>>;
let ensured = false;
async function ensure(sql: Sql) {
  if (ensured) return;
  // Created on first use, like profile_extras; /api/state DELETE (Reset) clears it.
  await sql`CREATE TABLE IF NOT EXISTS inbox_briefs (profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE, key TEXT NOT NULL, brief JSONB NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  ensured = true;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export const GET = route(async (req) => {
  const sql = db();
  if (!sql) return Response.json(null);
  const id = new URL(req.url).searchParams.get("profile_id");
  if (!(await profileExists(sql, id, req))) return bad("unknown profile_id");
  await ensure(sql);
  const [r] = await sql`SELECT key, brief, at FROM inbox_briefs WHERE profile_id = ${id}`;
  return Response.json(r ? { key: r.key, brief: r.brief, at: (r.at as Date).getTime() } : null);
});

export const POST = route(async (req) => {
  const body = await req.json().catch(() => null);
  const ctx = body?.context as CoachContext | undefined;
  if (!Array.isArray(body?.mail)) throw new HttpError(400, "Body needs { mail: [...] }.");
  if (!ctx || !Array.isArray(ctx.courses)) throw new HttpError(400, "Body needs { context } from coachContext().");
  const mail: Mail[] = body.mail.slice(0, 20).map((m: Record<string, unknown>) => ({
    id: str(m.id, 40),
    course: str(m.course, 20),
    from: str(m.from, 120),
    subject: str(m.subject, 200),
    snippet: "",
    body: str(m.body, 2000),
    at: str(m.at, 30),
    unread: m.unread === true,
    needsReply: m.needsReply === true,
  }));
  const brief: Brief = await briefInbox(mail.filter((m) => m.id), ctx);
  // Keep Viva's brief (not the rule-based fallback) as this profile's shared copy.
  const sql = db();
  const key = str(body.key, 2000);
  if (sql && brief.by === "viva" && key && (await profileExists(sql, body.profile_id, req))) {
    await ensure(sql);
    await sql`INSERT INTO inbox_briefs (profile_id, key, brief) VALUES (${body.profile_id}, ${key}, ${sql.json(brief)})
              ON CONFLICT (profile_id) DO UPDATE SET key = EXCLUDED.key, brief = EXCLUDED.brief, at = now()`;
  }
  return Response.json(brief);
});
