// POST multipart { file, question?, courses? }  ->  { classification, syllabus | study | profile+insights | generic }
// "Drop anything" endpoint for the Home drop zone.
import { analyzeFile } from "@/lib/intel/analyze";
import { readUpload, route, str } from "@/lib/intel/http";

export const POST = route(async (req) => {
  const { bytes, mimeType, filename, form } = await readUpload(req);
  const question = str(form.get("question")) || undefined;
  const knownCourses = str(form.get("courses")).split(",").map((s) => s.trim()).filter(Boolean);
  return Response.json(await analyzeFile({ bytes, mimeType, filename, question, knownCourses }));
});
