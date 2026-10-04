// Demo accounts: Google accounts that arrive with a full semester already in place, so a judge who
// signs in with one sees the whole app at once (courses, class meetings, the week's deadlines and
// to-dos, a streak, the sample students as buddies). The syllabus, gradebook and lecture files come
// along for free: the browser seeds those from the course codes (src/lib/knowledge/sample.ts).
//
// Which accounts: DEMO_ACCOUNT_EMAILS (comma-separated), defaulting to the team's demo Google account.
// The seed is Maya's semester and it is idempotent: every sign-in re-adds whatever is missing and
// never duplicates what's there, so a reset or a deleted account comes back full on the next login.
import type postgres from "postgres";
import { PROFILES } from "./mock";
import { easternToUtc } from "./time";

const DEFAULT_DEMO_EMAILS = ["rehanyeet@gmail.com"];

export function demoEmails(): string[] {
  const raw = process.env.DEMO_ACCOUNT_EMAILS;
  const list = raw ? raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean) : DEFAULT_DEMO_EMAILS;
  return list;
}

export const isDemoAccount = (email: string) => demoEmails().includes(email.trim().toLowerCase());

/** Give `profileId` the sample semester (Maya's). Safe to run on every sign-in. */
export async function seedDemoAccount(tx: postgres.TransactionSql, profileId: string) {
  const p = PROFILES.find((x) => x.id === "maya")!;
  await tx`UPDATE profiles SET class_year = COALESCE(class_year, ${p.classYear}) WHERE id = ${profileId}`;
  for (const c of p.courses) {
    await tx`INSERT INTO courses (profile_id, slug, code, name, dataset_row, baseline)
             VALUES (${profileId}, ${c.slug}, ${c.code}, ${c.name}, ${c.row}, ${tx.json(c.x)}) ON CONFLICT (profile_id, slug) DO NOTHING`;
    await tx`INSERT INTO deadlines (profile_id, course_slug, kind, title, due_at, source)
             VALUES (${profileId}, ${c.slug}, 'exam', ${c.exam.title}, ${easternToUtc(c.exam.date)}, 'seed') ON CONFLICT DO NOTHING`;
  }
  for (const m of p.classes)
    await tx`INSERT INTO class_meetings (profile_id, course_slug, starts_at, title)
             VALUES (${profileId}, ${m.course}, ${easternToUtc(m.at)}, ${m.title}) ON CONFLICT DO NOTHING`;
  for (const t of p.todos)
    await tx`INSERT INTO todos (profile_id, id, title, detail, href, due_at)
             VALUES (${profileId}, ${t.id}, ${t.title}, ${t.detail}, ${t.href}, ${t.due ? easternToUtc(t.due) : null}) ON CONFLICT (profile_id, id) DO NOTHING`;
  // The streak behind Home's greeting: seeded study history, once (events have no key to conflict on).
  const [{ n }] = await tx`SELECT count(*)::int AS n FROM events WHERE profile_id = ${profileId} AND source = 'seed'`;
  if (!n)
    for (let d = 0; d < p.streakDays; d++)
      await tx`INSERT INTO events (time, profile_id, course_slug, kind, minutes, source)
               VALUES (now() - make_interval(days => ${d}, hours => 2), ${profileId}, ${p.courses[d % p.courses.length].slug}, 'study', 45, 'seed')`;
  // The sample students as buddies, both ways, so Buddies and Study Pots have company.
  for (const b of PROFILES.filter((x) => x.sample)) {
    await tx`INSERT INTO buddies (profile_id, buddy_id) VALUES (${profileId}, ${b.id}) ON CONFLICT DO NOTHING`;
    await tx`INSERT INTO buddies (profile_id, buddy_id) VALUES (${b.id}, ${profileId}) ON CONFLICT DO NOTHING`;
  }
}
