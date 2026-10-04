// POST multipart { file, quiz?, viva?, flashcards?, concepts?, focus? }  ->  StudyMaterial
// Slides or notes in, quiz questions + viva questions + flashcards + concepts to teach out.
import { makeStudyMaterial } from "@/lib/intel/study";
import { readUpload, route, str } from "@/lib/intel/http";

export const POST = route(async (req) => {
  const { bytes, mimeType, form } = await readUpload(req);
  const n = (k: string, d: number) => Math.min(30, Math.max(0, parseInt(str(form.get(k), String(d)), 10) || d));
  const material = await makeStudyMaterial({
    bytes,
    mimeType,
    counts: { quiz: n("quiz", 3), viva: n("viva", 2), flashcards: n("flashcards", 10), concepts: n("concepts", 4) },
    focus: str(form.get("focus")) || undefined,
  });
  return Response.json(material);
});
