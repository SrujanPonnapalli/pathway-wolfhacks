// Server-only Postgres client for Tiger Cloud. One connection per serverless instance and no
// prepared statements, so it works through Tiger's PgBouncer pooler (use the pooled URL on Vercel).
import postgres from "postgres";

let client: postgres.Sql | null = null;

// null when DATABASE_URL isn't set: routes answer 503 and the app falls back to local demo data.
export function db() {
  if (!process.env.DATABASE_URL) return null;
  client ??= postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  return client;
}

export const noDb = () => Response.json({ error: "database not configured" }, { status: 503 });
export const bad = (error: string) => Response.json({ error }, { status: 400 });

// No auth in the demo: a profile id is trusted if it exists. See docs/database/README.md.
export async function profileExists(sql: postgres.Sql, id: unknown) {
  if (typeof id !== "string" || !id) return false;
  const [row] = await sql`SELECT 1 FROM profiles WHERE id = ${id}`;
  return !!row;
}

export async function courseExists(sql: postgres.Sql, profile: string, slug: unknown) {
  if (typeof slug !== "string" || !slug) return false;
  const [row] = await sql`SELECT 1 FROM courses WHERE profile_id = ${profile} AND slug = ${slug}`;
  return !!row;
}
