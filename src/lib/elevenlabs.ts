// Server-only ElevenLabs settings. The API key never reaches the browser.
export const ELEVEN = {
  key: () => process.env.ELEVENLABS_API_KEY,
  // Viva's voice. Override with ELEVENLABS_VOICE_ID; the fallback is a stock ElevenLabs voice.
  voice: () => process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb",
  ttsModel: "eleven_v4_turbo", // low-latency model for real-time agents
  sttModel: "scribe_v2",
  maxTextChars: 800, // one Viva reply; keeps a misuse of the route cheap
  maxAudioBytes: 10 * 1024 * 1024,
};
