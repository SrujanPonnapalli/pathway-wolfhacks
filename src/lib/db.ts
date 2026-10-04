// Server-only Postgres client for Tiger Cloud. One connection per serverless instance and no
// prepared statements, so it works through Tiger's PgBouncer pooler (use the pooled URL on Vercel).
import postgres from "postgres";
import { sessionProfile } from "./auth";

let client: postgres.Sql | null = null;

// null when DATABASE_URL isn't set: routes answer 503 and the app falls back to local demo data.
export function db() {
  if (!process.env.DATABASE_URL) return null;
  client ??= postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  return client;
}

export const noDb = () => Response.json({ error: "database not configured" }, { status: 503 });
export const bad = (error: string) => Response.json({ error }, { status: 400 });

// Who may act as a profile: demo profiles (no Google account) are open to everyone, as before, and so
// is a sample student even while the demo account points at it (that account and /demo share her);
// any other profile that belongs to a Google account only to that account's session cookie.
export async function profileExists(sql: postgres.Sql, id: unknown, req: Request) {
  if (typeof id !== "string" || !id) return false;
  const [row] = await sql`SELECT p.sample, EXISTS (SELECT 1 FROM accounts a WHERE a.profile_id = p.id) AS owned FROM profiles p WHERE p.id = ${id}`;
  return !!row && (!row.owned || row.sample || sessionProfile(req) === id);
}

export async function courseExists(sql: postgres.Sql, profile: string, slug: unknown) {
  if (typeof slug !== "string" || !slug) return false;
  const [row] = await sql`SELECT 1 FROM courses WHERE profile_id = ${profile} AND slug = ${slug}`;
  return !!row;
}

/** For routes that also run without a database (Knowledge): a profile owned by a Google account is
 *  only usable with its own session. Demo profiles, unknown ids and the no-database mode stay open. */
export async function mayUseProfile(req: Request, id: string) {
  const sql = db();
  if (!sql) return true;
  const [row] = await sql`SELECT p.sample FROM accounts a JOIN profiles p ON p.id = a.profile_id WHERE a.profile_id = ${id}`;
  return !row || row.sample || sessionProfile(req) === id;
}
