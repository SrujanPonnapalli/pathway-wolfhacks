// POST multipart { frame } -> Observation. One webcam snapshot in, one small JSON out.
// The image lives only for this request; it is never written to disk or a database.
import { observeScene } from "@/lib/intel/vision";
import { route, HttpError, readUpload } from "@/lib/intel/http";

export const POST = route(async (req) => {
  const { bytes, mimeType } = await readUpload(req, "frame");
  if (!mimeType.startsWith("image/")) throw new HttpError(415, "The frame must be an image.");
  return Response.json(await observeScene(bytes, mimeType));
});
