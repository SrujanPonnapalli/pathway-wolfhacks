// Shared request plumbing for the intelligence routes. Every route returns JSON, never a
// stack trace, and a missing GEMINI_API_KEY becomes a readable 503 instead of a crash.

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function route(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      if (/GEMINI_API_KEY/.test(err.message)) return Response.json({ error: err.message }, { status: 503 });
      console.error("[intel]", err);
      return Response.json({ error: err.message || "Something went wrong." }, { status: 500 });
    }
  };
}

export const MAX_BYTES = 20 * 1024 * 1024; // Gemini inline limit

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  md: "text/plain",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

/** Read one uploaded file from a multipart form (field name `file`). */
export async function readUpload(req: Request, field = "file") {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) throw new HttpError(400, `Send multipart/form-data with a "${field}" field.`);
  const form = await req.formData();
  const f = form.get(field);
  if (!(f instanceof File)) throw new HttpError(400, `Missing file field "${field}".`);
  if (f.size === 0) throw new HttpError(400, "The file is empty.");
  if (f.size > MAX_BYTES) throw new HttpError(413, "File is over 20 MB.");
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = f.type && f.type !== "application/octet-stream" ? f.type : MIME_BY_EXT[ext] ?? "application/octet-stream";
  if (/(powerpoint|presentation|msword|wordprocessingml)/.test(mimeType))
    throw new HttpError(415, "Export slides or docs to PDF first; Gemini reads PDFs, images, text and CSV.");
  const bytes = Buffer.from(await f.arrayBuffer());
  return { bytes, mimeType, filename: f.name, form };
}

export function str(v: FormDataEntryValue | null | undefined, fallback = "") {
  return typeof v === "string" ? v : fallback;
}
