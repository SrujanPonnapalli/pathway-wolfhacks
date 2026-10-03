import { db, noDb } from "@/lib/db";

// Profiles in the same shape as src/lib/mock.ts PROFILES, so the client can swap sources.
export async function GET() {
  const sql = db();
  if (!sql) return noDb();
  const [profiles, courses, exams, classes, todos, streaks] = await Promise.all([
    sql`SELECT id, name, class_year, sample FROM profiles ORDER BY sample DESC, created_at, id`,
    sql`SELECT profile_id, slug, code, name, dataset_row, baseline FROM courses ORDER BY created_at, slug`,
    // Next exam per course (or the latest past one if none are ahead).
    sql`SELECT DISTINCT ON (profile_id, course_slug) profile_id, course_slug, title, due_at
        FROM deadlines WHERE kind = 'exam' AND confirmed
        ORDER BY profile_id, course_slug, (due_at < now()), abs(extract(epoch FROM due_at - now()))`,
    sql`SELECT profile_id, course_slug, title, starts_at FROM class_meetings ORDER BY starts_at`,
    sql`SELECT profile_id, id, title, detail, href, due_at FROM todos ORDER BY due_at NULLS LAST, id`,
    sql`SELECT profile_id, streak_days FROM profile_streaks`,
  ]);
  const iso = (d: Date) => d.toISOString();
  const out = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    classYear: p.class_year ?? "",
    sample: p.sample,
    streakDays: streaks.find((s) => s.profile_id === p.id)?.streak_days ?? 0,
    courses: courses
      .filter((c) => c.profile_id === p.id)
      .map((c) => {
        const e = exams.find((x) => x.profile_id === p.id && x.course_slug === c.slug);
        return { slug: c.slug, code: c.code, name: c.name, row: c.dataset_row ?? "", exam: { title: e?.title ?? "Exam", date: e ? iso(e.due_at) : iso(new Date()) }, x: c.baseline };
      }),
    classes: classes.filter((m) => m.profile_id === p.id).map((m) => ({ course: m.course_slug, title: m.title, at: iso(m.starts_at) })),
    todos: todos.filter((t) => t.profile_id === p.id).map((t) => ({ id: t.id, title: t.title, detail: t.detail, href: t.href, due: t.due_at ? iso(t.due_at) : undefined })),
  }));
  return Response.json(out);
}
