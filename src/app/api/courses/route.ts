import { JUDGE_CLASS, JUDGE_COURSE } from "@/lib/mock";
import { bad, db, noDb, profileExists } from "@/lib/db";
import { easternToUtc } from "@/lib/time";
import type { Syllabus } from "@/lib/intel/syllabus";

// Onboarding for a live profile (the judge or a Google account).
//   { profile_id }            add the demo course (BIO 181) from its "syllabus"
//   { profile_id, syllabus }  create a real course from a syllabus Gemini parsed (Drive pick or upload):
//                             its exams and graded deadlines become the course's calendar. Until the
//                             student logs activity, the model reads typical numbers for everything else.
export async function POST(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const b = await req.json().catch(() => null);
  const id: string = b?.profile_id;
  const [p] = id ? await sql`SELECT sample FROM profiles WHERE id = ${id}` : [];
  if (!p || p.sample || !(await profileExists(sql, id, req))) return bad("only a live profile adds courses");

  if (b.syllabus) return fromSyllabus(sql, id, b.syllabus as Syllabus);

  const c = JUDGE_COURSE;
  await sql.begin(async (tx) => {
    await tx`INSERT INTO courses (profile_id, slug, code, name, dataset_row, baseline)
             VALUES (${id}, ${c.slug}, ${c.code}, ${c.name}, ${c.row}, ${tx.json(c.x)}) ON CONFLICT DO NOTHING`;
    await tx`INSERT INTO deadlines (profile_id, course_slug, kind, title, due_at, source)
             VALUES (${id}, ${c.slug}, 'exam', ${c.exam.title}, ${easternToUtc(c.exam.date)}, 'syllabus') ON CONFLICT DO NOTHING`;
    await tx`INSERT INTO class_meetings (profile_id, course_slug, starts_at, title)
             VALUES (${id}, ${JUDGE_CLASS.course}, ${easternToUtc(JUDGE_CLASS.at)}, ${JUDGE_CLASS.title}) ON CONFLICT DO NOTHING`;
  });
  return Response.json({ ok: true });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

async function fromSyllabus(sql: NonNullable<ReturnType<typeof db>>, id: string, s: Syllabus) {
  const code = String(s?.course?.code ?? "").trim().toUpperCase().replace(/\s+/g, " ").slice(0, 20);
  if (!code) return bad("the syllabus has no course code");
  const slug = code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const name = String(s.course.name ?? "").trim().slice(0, 120) || code;
  // Exams count as exams; graded work with a date counts as an assignment. Readings and "other" don't.
  const dated = (Array.isArray(s.deadlines) ? s.deadlines : [])
    .filter((d) => DATE.test(d?.date ?? "") && ["exam", "quiz", "assignment", "project"].includes(d.kind))
    .slice(0, 80)
    .map((d) => ({
      kind: d.kind === "exam" ? "exam" : "assignment",
      title: String(d.title).slice(0, 200),
      due_at: easternToUtc(`${d.date}T${TIME.test(d.time ?? "") ? d.time : "23:59"}`),
      confirmed: d.confidence !== "low", // low-confidence dates wait for the student
    }));
  await sql.begin(async (tx) => {
    await tx`INSERT INTO courses (profile_id, slug, code, name, baseline) VALUES (${id}, ${slug}, ${code}, ${name}, '{}'::jsonb)
             ON CONFLICT (profile_id, slug) DO UPDATE SET name = EXCLUDED.name`;
    for (const d of dated)
      await tx`INSERT INTO deadlines (profile_id, course_slug, kind, title, due_at, source, confirmed)
               VALUES (${id}, ${slug}, ${d.kind}, ${d.title}, ${d.due_at}, 'syllabus', ${d.confirmed}) ON CONFLICT DO NOTHING`;
  });
  return Response.json({ slug, code, name, exams: dated.filter((d) => d.kind === "exam").length, deadlines: dated.length });
}
