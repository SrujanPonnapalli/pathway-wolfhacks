// POST multipart { file, profile, courses (JSON array of codes), course?, existing? (JSON nodes) }
// Streams NDJSON: one {stage: ...} object per line, ending with {stage: "done", source, nodes, edges, legacy}.
// The browser animates each stage as it lands. See docs/knowledge/PLAN.md §3.2.
import { ingest } from "@/lib/knowledge/ingest";
import type { IngestEvent } from "@/lib/knowledge/types";
import { HttpError, readUpload, str } from "@/lib/intel/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  let upload: Awaited<ReturnType<typeof readUpload>>;
  try {
    upload = await readUpload(req);
  } catch (e) {
    const err = e as HttpError;
    return Response.json({ error: err.message }, { status: err.status ?? 400 });
  }
  const profile = str(upload.form.get("profile"), "maya");
  const courses = safeJson<string[]>(str(upload.form.get("courses")), []);
  const course = str(upload.form.get("course")) || undefined;
  const existing = safeJson<{ nodes: never[] } | undefined>(str(upload.form.get("existing")), undefined);
  if (!process.env.GEMINI_API_KEY) return Response.json({ error: "GEMINI_API_KEY is not set (see .env.example)." }, { status: 503 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: IngestEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        await ingest({ profile, bytes: upload.bytes, mime: upload.mimeType, filename: upload.filename, knownCourses: courses, course, existing }, emit);
      } catch (e) {
        emit({ stage: "error", error: (e as Error).message || "Couldn't read that file." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}

function safeJson<T>(s: string, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
