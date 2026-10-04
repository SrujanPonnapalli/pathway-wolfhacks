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
  await tx`UPDATE profiles SET name = ${p.name}, class_year = COALESCE(class_year, ${p.classYear}) WHERE id = ${profileId}`;
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
  // Aadee and Sampath as buddies, both ways, so Buddies and Study Pots have company.
  await seedDemoBuddies(tx);
  for (const b of PROFILES.filter((x) => x.id in BUDDY_EFFORT && x.id !== profileId)) {
    await tx`INSERT INTO buddies (profile_id, buddy_id) VALUES (${profileId}, ${b.id}) ON CONFLICT DO NOTHING`;
    await tx`INSERT INTO buddies (profile_id, buddy_id) VALUES (${b.id}, ${profileId}) ON CONFLICT DO NOTHING`;
  }
}

/** The demo's buddies (Aadee and Sampath) and this week's effort: blocks planned and done. Their streak is PROFILES' streakDays. */
const BUDDY_EFFORT: Record<string, { planned: number; done: number }> = {
  aadee: { planned: 5, done: 4 },
  sampath: { planned: 4, done: 3 },
};
const SRUJAN_EMAIL = "srujan.ponnapalli@gmail.com";

/**
 * Make sure Aadee and Sampath exist, with a current week of study blocks and an unbroken streak.
 * Their seeded blocks and streak are rewritten each time, so the board never goes stale between demos.
 */
async function seedDemoBuddies(tx: postgres.TransactionSql) {
  for (const id of Object.keys(BUDDY_EFFORT)) {
    const p = PROFILES.find((x) => x.id === id)!;
    const { planned, done } = BUDDY_EFFORT[id];
    const c = p.courses[0];
    await tx`INSERT INTO profiles (id, name, class_year, sample) VALUES (${p.id}, ${p.name}, ${p.classYear}, true) ON CONFLICT (id) DO NOTHING`;
    await tx`INSERT INTO courses (profile_id, slug, code, name, dataset_row, baseline)
             VALUES (${p.id}, ${c.slug}, ${c.code}, ${c.name}, ${c.row}, ${tx.json(c.x)}) ON CONFLICT (profile_id, slug) DO NOTHING`;
    await tx`DELETE FROM study_blocks WHERE profile_id = ${p.id} AND client_id LIKE 'seed-%'`;
    // One block a day from Monday (4 pm Eastern); the first `done` are done, if their time has passed.
    // Skipped in a week where their Study Pot blocks (scripts/solana.ts) already fill the board.
    await tx`INSERT INTO study_blocks (client_id, profile_id, course_slug, title, starts_at, done_at)
             SELECT 'seed-' || i, ${p.id}, ${c.slug}, 'Study block', at, CASE WHEN i < ${done} AND at + interval '1 hour' < now() THEN at + interval '1 hour' END
             FROM generate_series(0, ${planned - 1}) i, LATERAL (SELECT date_trunc('week', now()) + make_interval(days => i, hours => 20) AS at) t
             WHERE NOT EXISTS (SELECT 1 FROM study_blocks WHERE profile_id = ${p.id} AND client_id LIKE 'pot-%' AND starts_at >= date_trunc('week', now()))`;
    await tx`DELETE FROM events WHERE profile_id = ${p.id} AND source = 'seed'`;
    await tx`INSERT INTO events (time, profile_id, course_slug, kind, minutes, source)
             SELECT now() - make_interval(days => d, hours => 2), ${p.id}, ${c.slug}, 'study', 45, 'seed' FROM generate_series(0, ${p.streakDays - 1}) d`;
  }
}

/** Srujan's pending buddy request to the demo account, unless they're already buddies. */
export async function seedSrujanRequest(tx: postgres.TransactionSql, profileId: string) {
  const [from] = await tx`SELECT profile_id FROM accounts WHERE lower(email) = ${SRUJAN_EMAIL}`;
  if (!from || from.profile_id === profileId) return;
  const [already] = await tx`SELECT 1 FROM buddies WHERE profile_id = ${profileId} AND buddy_id = ${from.profile_id}`;
  if (!already) await tx`INSERT INTO buddy_requests (from_id, to_email) VALUES (${from.profile_id}, ${demoEmails()[0]}) ON CONFLICT DO NOTHING`;
}

/**
 * The demo's Reset (rehearsals only): the demo profile goes back to its default state, as if no one had
 * touched it. Courses, deadlines, meetings and to-dos added since go; the seeded ones come back as seeded;
 * buddies are the default set again and Srujan's request is waiting. Activity, blocks, uploads and chats
 * are cleared by the caller (/api/state DELETE).
 */
export async function resetDemoProfile(tx: postgres.TransactionSql, profileId: string) {
  const p = PROFILES.find((x) => x.id === demoProfileId()) ?? PROFILES[0];
  const slugs = p.courses.map((c) => c.slug);
  await tx`DELETE FROM courses WHERE profile_id = ${profileId} AND slug <> ALL(${slugs})`; // cascades their deadlines, meetings, files
  for (const c of p.courses) await tx`UPDATE courses SET code = ${c.code}, name = ${c.name}, dataset_row = ${c.row}, baseline = ${tx.json(c.x)} WHERE profile_id = ${profileId} AND slug = ${c.slug}`;
  await tx`DELETE FROM deadlines WHERE profile_id = ${profileId} AND source <> 'seed'`;
  await tx`DELETE FROM class_meetings WHERE profile_id = ${profileId}`;
  await tx`DELETE FROM documents WHERE profile_id = ${profileId}`;
  await tx`DELETE FROM todos WHERE profile_id = ${profileId}`;
  await tx`DELETE FROM buddies WHERE profile_id = ${profileId} OR buddy_id = ${profileId}`;
  await tx`DELETE FROM buddy_requests WHERE from_id = ${profileId} OR to_email = ANY(${demoEmails()})`;
  await tx`UPDATE profiles SET name = ${p.name}, class_year = ${p.classYear} WHERE id = ${profileId}`;
  await seedDemoAccount(tx, profileId);
  await seedSrujanRequest(tx, profileId);
}
