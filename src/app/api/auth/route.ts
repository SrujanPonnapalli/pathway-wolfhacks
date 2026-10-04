import { randomUUID } from "node:crypto";
import { bad, db, noDb } from "@/lib/db";
import { sessionCookie, sessionProfile, sign, verifyAccessToken } from "@/lib/auth";

const notSetUp = () => Response.json({ error: "Google sign-in isn't set up (NEXT_PUBLIC_GOOGLE_CLIENT_ID, SESSION_SECRET)." }, { status: 503 });

// Sign in with Google: { access_token } from Google Identity Services' popup (scopes openid email profile).
// First sign-in creates a fresh profile owned by this Google account.
export async function POST(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.SESSION_SECRET) return notSetUp();
  const b = await req.json().catch(() => null);
  if (typeof b?.access_token !== "string") return bad("access_token required");
  let g;
  try {
    g = await verifyAccessToken(b.access_token, clientId);
  } catch (e) {
    return Response.json({ error: `Google sign-in failed: ${(e as Error).message}` }, { status: 401 });
  }
  const first = (g.name ?? g.email).split(/[\s@]/)[0];
  const profileId = await sql.begin(async (tx) => {
    const [had] = await tx`UPDATE accounts SET last_login = now(), email = ${g.email}, picture = ${g.picture ?? null} WHERE google_sub = ${g.sub} RETURNING profile_id`;
    if (had) return had.profile_id as string;
    const id = `g-${randomUUID().slice(0, 8)}`;
    await tx`INSERT INTO profiles (id, name, sample) VALUES (${id}, ${first}, false)`;
    await tx`INSERT INTO accounts (google_sub, profile_id, email, picture) VALUES (${g.sub}, ${id}, ${g.email}, ${g.picture ?? null})`;
    return id;
  });
  return Response.json({ profile_id: profileId, name: first, email: g.email }, { headers: { "set-cookie": sessionCookie(sign(profileId)) } });
}

// Who's signed in.
export async function GET(req: Request) {
  const sql = db();
  const id = sessionProfile(req);
  if (!sql || !id) return Response.json(null);
  const [a] = await sql`SELECT a.email, a.picture, a.created_at, p.id AS profile_id, p.name FROM accounts a JOIN profiles p ON p.id = a.profile_id WHERE a.profile_id = ${id}`;
  return Response.json(a ?? null);
}

// Sign out.
export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie("", 0) } });
}
