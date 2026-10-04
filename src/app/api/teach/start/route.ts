// POST JSON { message, courses: {code,name}[], docs: {id,course,title,summary}[] }  ->  TeachMatch
// Teach mode from a sentence: which course and file "let me teach you glycolysis" is about.
import { resolveTeach } from "@/lib/intel/feynman";
import { route, HttpError } from "@/lib/intel/http";

export const POST = route(async (req) => {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || !Array.isArray(body?.courses) || !Array.isArray(body?.docs))
    throw new HttpError(400, "Body needs { message: string, courses: {code,name}[], docs: {id,course,title,summary}[] }.");
  const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const courses = body.courses.slice(0, 12).map((c: Record<string, unknown>) => ({ code: str(c?.code, 20), name: str(c?.name, 80) }));
  const docs = body.docs.slice(0, 80).map((d: Record<string, unknown>) => ({ id: str(d?.id, 80), course: str(d?.course, 20), title: str(d?.title, 120), summary: str(d?.summary, 400) }));
  return Response.json(await resolveTeach(message.slice(0, 500), courses, docs));
});
