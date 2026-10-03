import { sql } from "@/lib/db";

export async function POST(req: Request) {
  const { profile_id, kind, minutes = 0, on_time = null, time } = await req.json();
  if (typeof profile_id !== "string" || typeof kind !== "string")
    return Response.json({ error: "profile_id and kind required" }, { status: 400 });
  await sql`INSERT INTO events (time, profile_id, kind, minutes, on_time)
            VALUES (${time ?? new Date()}, ${profile_id}, ${kind}, ${minutes}, ${on_time})`;
  return Response.json({ ok: true });
}

export async function GET(req: Request) {
  const profile = new URL(req.url).searchParams.get("profile_id");
  if (!profile) return Response.json({ error: "profile_id required" }, { status: 400 });
  const rows = await sql`SELECT * FROM weekly_stats WHERE profile_id = ${profile} ORDER BY week`;
  return Response.json(rows);
}
