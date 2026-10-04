// POST JSON { title, body, focus? }  ->  { concepts: Concept[] }
// Teach mode: the concepts (and their key points) a student could teach back from one course file.
import { conceptsFrom } from "@/lib/intel/feynman";
import { route, HttpError } from "@/lib/intel/http";

export const POST = route(async (req) => {
  const b = await req.json().catch(() => null);
  if (typeof b?.title !== "string" || typeof b?.body !== "string" || !b.body.trim()) throw new HttpError(400, "Body needs { title: string, body: string, focus?: string }.");
  const focus = typeof b.focus === "string" ? b.focus.slice(0, 80) : "";
  const concepts = await conceptsFrom(b.title.slice(0, 160), b.body, focus);
  if (!concepts.length) throw new HttpError(422, "Couldn't find concepts to teach in that file.");
  return Response.json({ concepts });
});
