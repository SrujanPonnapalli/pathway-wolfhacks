// The demo account: the team's Google account signs in as the demo student herself. It and /demo
// (Maya) are one profile, so everything is shared both ways: courses, the syllabus, gradebook and
// lecture files, uploads, study blocks, chats, the Google calendar. Nothing is copied or mirrored;
// there is one row set, reached two ways. Visitors still see Maya through /demo (a sample profile
// stays open to everyone even while an account points at it; see src/lib/db.ts).
//
// Which accounts: DEMO_ACCOUNT_EMAILS (comma-separated), defaulting to the team's demo Google
// account. Which student: DEMO_ACCOUNT_PROFILE, defaulting to maya. Every sign-in also re-adds
// whatever the seed is missing (idempotent), so a reset or a wiped row set comes back full.
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

/** The sample student the demo account signs in as. */
export const demoProfileId = () => process.env.DEMO_ACCOUNT_PROFILE?.trim() || "maya";

/**
 * Point this Google account at the demo student's profile. Returns the profile id, or null when the
 * profile is missing or another account already holds it (the caller then makes an ordinary profile).
 * An earlier, separate profile of this account is removed when it is empty, so it doesn't linger as
 * a stray open profile; one with courses in it is left alone.
 */
export async function adoptDemoProfile(tx: postgres.TransactionSql, sub: string, email: string, picture: string | null): Promise<string | null> {
  const target = demoProfileId();
  const [exists] = await tx`SELECT 1 FROM profiles WHERE id = ${target}`;
  if (!exists) return null;
  const [taken] = await tx`SELECT 1 FROM accounts WHERE profile_id = ${target} AND google_sub <> ${sub}`;
  if (taken) return null;
  const [had] = await tx`SELECT profile_id FROM accounts WHERE google_sub = ${sub}`;
  if (had && had.profile_id !== target) {
    await tx`UPDATE accounts SET profile_id = ${target}, last_login = now(), email = ${email}, picture = ${picture} WHERE google_sub = ${sub}`;
    const [{ n }] = await tx`SELECT count(*)::int AS n FROM courses WHERE profile_id = ${had.profile_id}`;
    if (!n) await tx`DELETE FROM profiles WHERE id = ${had.profile_id} AND NOT sample`;
  } else if (had) await tx`UPDATE accounts SET last_login = now(), email = ${email}, picture = ${picture} WHERE google_sub = ${sub}`;
  else await tx`INSERT INTO accounts (google_sub, profile_id, email, picture) VALUES (${sub}, ${target}, ${email}, ${picture})`;
  await seedDemoAccount(tx, target);
  return target;
}

/** Give `profileId` the sample semester (Maya's). Safe to run on every sign-in. */
export async function seedDemoAccount(tx: postgres.TransactionSql, profileId: string) {
  const p = PROFILES.find((x) => x.id === demoProfileId()) ?? PROFILES[0];
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
  for (const b of PROFILES.filter((x) => x.sample && x.id !== profileId)) {
    await tx`INSERT INTO buddies (profile_id, buddy_id) VALUES (${profileId}, ${b.id}) ON CONFLICT DO NOTHING`;
    await tx`INSERT INTO buddies (profile_id, buddy_id) VALUES (${b.id}, ${profileId}) ON CONFLICT DO NOTHING`;
  }
}
