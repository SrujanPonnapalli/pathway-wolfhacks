import { JUDGE_CLASS, JUDGE_COURSE } from "@/lib/mock";
import { bad, db, noDb } from "@/lib/db";
import { easternToUtc } from "@/lib/time";

// Onboarding for the live judge profile: add the demo course from its "syllabus".
// TODO: real version takes Gemini's parsed syllabus (course, exams, deadlines) after the student confirms it.
export async function POST(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const b = await req.json().catch(() => null);
  if (b?.profile_id !== "judge") return bad("only the judge profile adds the demo course");
  const c = JUDGE_COURSE;
  await sql.begin(async (tx) => {
    await tx`INSERT INTO courses (profile_id, slug, code, name, dataset_row, baseline)
             VALUES ('judge', ${c.slug}, ${c.code}, ${c.name}, ${c.row}, ${tx.json(c.x)}) ON CONFLICT DO NOTHING`;
    await tx`INSERT INTO deadlines (profile_id, course_slug, kind, title, due_at, source)
             VALUES ('judge', ${c.slug}, 'exam', ${c.exam.title}, ${easternToUtc(c.exam.date)}, 'syllabus') ON CONFLICT DO NOTHING`;
    await tx`INSERT INTO class_meetings (profile_id, course_slug, starts_at, title)
             VALUES ('judge', ${JUDGE_CLASS.course}, ${easternToUtc(JUDGE_CLASS.at)}, ${JUDGE_CLASS.title}) ON CONFLICT DO NOTHING`;
  });
  return Response.json({ ok: true });
}
