import { ELEVEN } from "@/lib/elevenlabs";

// What the student said: an audio clip in, text out. The audio isn't stored.
export async function POST(req: Request) {
  const key = ELEVEN.key();
  if (!key) return Response.json({ error: "voice not configured" }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob) || file.size === 0 || file.size > ELEVEN.maxAudioBytes) return Response.json({ error: "audio file required (max 10 MB)" }, { status: 400 });

  const out = new FormData();
  out.append("model_id", ELEVEN.sttModel);
  out.append("file", file, "speech");
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: out });
  if (!r.ok) return Response.json({ error: `elevenlabs stt ${r.status}` }, { status: 502 });
  const d = await r.json();
  return Response.json({ text: typeof d.text === "string" ? d.text.trim() : "" });
}
