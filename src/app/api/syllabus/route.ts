// POST multipart { file } or JSON { text }  ->  Syllabus (see src/lib/intel/syllabus.ts)
// Gemini structured output: dates, grading, policies, with source_text for the confirm step.
import { parseSyllabus } from "@/lib/intel/syllabus";
import { readUpload, route, HttpError } from "@/lib/intel/http";

export const POST = route(async (req) => {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const { text, today } = await req.json();
    if (typeof text !== "string" || !text.trim()) throw new HttpError(400, "JSON body needs { text }.");
    return Response.json(await parseSyllabus({ text, today }));
  }
  const { bytes, mimeType, form } = await readUpload(req);
  const today = typeof form.get("today") === "string" ? String(form.get("today")) : undefined;
  return Response.json(await parseSyllabus({ bytes, mimeType, today }));
});
