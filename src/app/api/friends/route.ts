import { bad, db, noDb } from "@/lib/db";
import { sessionProfile } from "@/lib/auth";
import { DEMO_PROFILE, isDemoRequest } from "@/lib/demo";

// Study buddies for Google accounts: requests by email, accept / decline / cancel, remove.
// Requests are stored by email, so they reach people who haven't signed up yet. "Request sent" is the
// same answer whether or not an account exists, so nobody can probe which emails are on Pathway.
// Buddies see effort only (blocks, streaks); that's unchanged and lives in /api/buddies.

type Sql = NonNullable<ReturnType<typeof db>>;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const MAX_PENDING = 25;

// Whose buddies: the profile on screen (?profile_id / body.profile_id). That is your Google account's own
// profile, or the demo student in demo mode, which is the demo account's profile, so requests sent to that
// account show up in /demo too, even while you're signed in as someone else. Demo mode answers requests, never sends them.
function whoami(req: Request, asked?: unknown) {
  const me = sessionProfile(req);
  const demo = isDemoRequest(req) ? DEMO_PROFILE : null;
  if (typeof asked === "string" && asked) return asked === me || asked === demo ? asked : null;
  return me ?? demo;
}

const signedOut = () => Response.json({ error: "Sign in to manage study buddies." }, { status: 401 });

async function myEmail(sql: Sql, me: string) {
  const [a] = await sql`SELECT lower(email) AS email FROM accounts WHERE profile_id = ${me}`;
  return (a?.email as string | undefined) ?? null;
}

async function befriend(sql: Sql, a: string, b: string) {
  await sql`INSERT INTO buddies (profile_id, buddy_id) VALUES (${a}, ${b}), (${b}, ${a}) ON CONFLICT DO NOTHING`;
}

// GET → { incoming: [{id, name, email}], outgoing: [{id, email}], buddies: [{id, name}] }
export async function GET(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const me = whoami(req, new URL(req.url).searchParams.get("profile_id"));
  if (!me) return signedOut();
  const email = await myEmail(sql, me);
  const [incoming, outgoing, buddies] = await Promise.all([
    sql`SELECT r.id, p.name, a.email, a.picture FROM buddy_requests r JOIN profiles p ON p.id = r.from_id JOIN accounts a ON a.profile_id = r.from_id
        WHERE r.to_email = ${email ?? ""} AND NOT EXISTS (SELECT 1 FROM buddies b WHERE b.profile_id = ${me} AND b.buddy_id = r.from_id)
        ORDER BY r.created_at`,
    sql`SELECT id, to_email AS email FROM buddy_requests WHERE from_id = ${me} ORDER BY created_at`,
    sql`SELECT p.id, p.name, a.picture FROM buddies b JOIN profiles p ON p.id = b.buddy_id LEFT JOIN accounts a ON a.profile_id = p.id WHERE b.profile_id = ${me} ORDER BY p.name`,
  ]);
  return Response.json({ incoming, outgoing, buddies });
}

// POST { action: "request", email } | { action: "accept" | "decline" | "cancel", id } | { action: "remove", buddy }
export async function POST(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const b = await req.json().catch(() => null);
  const me = whoami(req, b?.profile_id);
  if (!me) return signedOut();
  if (b?.action === "request" && me !== sessionProfile(req)) return bad("Sign in to send buddy requests.");
  const mine = await myEmail(sql, me);

  if (b?.action === "request") {
    const email = String(b.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) return bad("That doesn't look like an email address.");
    if (email === mine) return bad("That's your own email.");
    const [them] = await sql`SELECT profile_id FROM accounts WHERE lower(email) = ${email}`;
    if (them) {
      const [already] = await sql`SELECT 1 FROM buddies WHERE profile_id = ${me} AND buddy_id = ${them.profile_id}`;
      if (already) return Response.json({ ok: true, result: "already" });
      // They already asked you: that's a yes from both sides.
      const [theirs] = await sql`DELETE FROM buddy_requests WHERE from_id = ${them.profile_id} AND to_email = ${mine ?? ""} RETURNING id`;
      if (theirs) {
        await befriend(sql, me, them.profile_id);
        return Response.json({ ok: true, result: "connected" });
      }
    }
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM buddy_requests WHERE from_id = ${me}`;
    if (n >= MAX_PENDING) return bad(`You have ${MAX_PENDING} requests waiting. Cancel some first.`);
    await sql`INSERT INTO buddy_requests (from_id, to_email) VALUES (${me}, ${email}) ON CONFLICT DO NOTHING`;
    return Response.json({ ok: true, result: "sent" });
  }

  if (b?.action === "accept" || b?.action === "decline") {
    const [r] = await sql`DELETE FROM buddy_requests WHERE id = ${Number(b.id) || 0} AND to_email = ${mine ?? ""} RETURNING from_id`;
    if (!r) return bad("That request is gone.");
    if (b.action === "accept") await befriend(sql, me, r.from_id);
    return Response.json({ ok: true });
  }

  if (b?.action === "cancel") {
    await sql`DELETE FROM buddy_requests WHERE id = ${Number(b.id) || 0} AND from_id = ${me}`;
    return Response.json({ ok: true });
  }

  if (b?.action === "remove" && typeof b.buddy === "string") {
    await sql`DELETE FROM buddies WHERE (profile_id = ${me} AND buddy_id = ${b.buddy}) OR (profile_id = ${b.buddy} AND buddy_id = ${me})`;
    return Response.json({ ok: true });
  }

  return bad("action must be request, accept, decline, cancel or remove");
}
