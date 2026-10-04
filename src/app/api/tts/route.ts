import { ELEVEN } from "@/lib/elevenlabs";

// Viva's voice: text in, MP3 out (streamed straight through from ElevenLabs).
export async function POST(req: Request) {
  const key = ELEVEN.key();
  if (!key) return Response.json({ error: "voice not configured" }, { status: 503 });
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > ELEVEN.maxTextChars) return Response.json({ error: `text must be 1-${ELEVEN.maxTextChars} characters` }, { status: 400 });

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN.voice()}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: ELEVEN.ttsModel, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, speed: 1.2 } }),
  });
  if (!r.ok || !r.body) return Response.json({ error: `elevenlabs tts ${r.status}` }, { status: 502 });
  return new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
}
