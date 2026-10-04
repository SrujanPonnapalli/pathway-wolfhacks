import { after } from "next/server";
import { attestProfile } from "@/lib/solana/chain";
import { bad, courseExists, db, noDb, profileExists } from "@/lib/db";

const KINDS = ["study", "quiz", "flashcards", "check_in", "submit", "viva"];

// Log one study action (inputs only). The puck posts here too, with source "puck".
export async function POST(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const b = await req.json().catch(() => null);
  if (!b || !KINDS.includes(b.kind)) return bad(`kind must be one of ${KINDS.join(", ")}`);
  if (!(await profileExists(sql, b.profile_id))) return bad("unknown profile_id");
  if (!(await courseExists(sql, b.profile_id, b.course_slug))) return bad("unknown course_slug");
  const minutes = Number.isFinite(b.minutes) ? Math.max(0, Math.min(600, Math.round(b.minutes))) : 0;
  const score = Number.isFinite(b.score) ? Math.max(0, Math.min(100, b.score)) : null;
  const meta = b.meta && typeof b.meta === "object" && !Array.isArray(b.meta) ? b.meta : {};
  await sql`INSERT INTO events (profile_id, course_slug, kind, minutes, score, late_night, source, meta)
            VALUES (${b.profile_id}, ${b.course_slug}, ${b.kind}, ${minutes}, ${score}, ${!!b.late_night},
                    ${b.source === "puck" ? "puck" : "app"}, ${sql.json(meta)})`;
  // Study activity can back a done study block: update the student's Study Pot attestation on-chain.
  if (b.kind !== "check_in" && b.kind !== "submit") after(() => attestProfile(sql, b.profile_id).catch((e) => console.error("attest", e)));
  return Response.json({ ok: true });
}

// Activity-derived model inputs per course (the course_features view). Counts are to-date.
export async function GET(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const id = new URL(req.url).searchParams.get("profile_id");
  if (!(await profileExists(sql, id))) return bad("unknown profile_id");
  const rows = await sql`SELECT * FROM course_features WHERE profile_id = ${id} ORDER BY course_slug`;
  // numeric columns arrive as strings; send numbers.
  return Response.json(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v]))));
}
