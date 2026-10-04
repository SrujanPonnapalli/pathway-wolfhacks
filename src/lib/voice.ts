"use client";

// Viva's voice session. Microphone → end-of-speech detection → /api/stt (ElevenLabs Scribe)
// → the shared Gemini coach (/api/coach, same brain as chat) → /api/tts (ElevenLabs v4
// Turbo) → playback. Real input and output levels
// drive the orb and the voice glow. Degrades gracefully: no microphone → tap a question;
// no voice service → captions with simulated speech. The page reads { state, input, output, caption }.
import { useEffect, useRef, useState } from "react";
import type { OrbState } from "orb-ui";

export type Caption = { who: "you" | "viva"; text: string } | null;
type Who = "you" | "viva";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now(); // module-level so the React compiler doesn't treat it as render work

// End-of-speech detection, tuned for a quiet-ish room. A session can stretch the turn
// (Teach mode: explaining takes pauses to think and runs longer than a question).
const SPEECH_LEVEL = 0.06; // input level that counts as talking (0..1)
const SILENCE_MS = 900; // this much quiet after speech ends a turn
const MAX_TURN_MS = 15000;
export type TurnTiming = { silenceMs: number; maxMs: number };

function level(an: AnalyserNode | null, buf: Float32Array<ArrayBuffer> | null) {
  if (!an || !buf) return 0;
  an.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  return Math.min(1, Math.sqrt(sum / buf.length) * 5); // RMS, scaled so speech sits mid-range
}

export function useVoiceSession(opts: {
  greeting: () => string;
  reply: (q: string) => string | Promise<string>;
  onTurn: (who: Who, text: string) => void;
  /** Playback speed for Viva's voice, 0.8 to 1.6; read at speak time so a slider applies to the next line. */
  speed?: () => number;
  turn?: Partial<TurnTiming>;
}) {
  const [state, setState] = useState<OrbState>("idle");
  const [caption, setCaption] = useState<Caption>(null);
  const [levels, setLevels] = useState({ input: 0, output: 0 });
  const [micOn, setMicOn] = useState(false);
  const [notice, setNotice] = useState("");

  const run = useRef(0); // bumping this cancels any in-flight turn
  const stateRef = useRef<OrbState>("idle");
  const optsRef = useRef(opts);
  const ctx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const micAn = useRef<AnalyserNode | null>(null);
  const outAn = useRef<AnalyserNode | null>(null);
  const buf = useRef<Float32Array<ArrayBuffer> | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const fakeOut = useRef(false); // simulated mouth movement when real audio isn't available
  const skips = useRef(0); // bumped by skip(): the current line stops and Viva listens
  const doneTalking = useRef(false); // the student said they're finished: end the turn now

  useEffect(() => {
    optsRef.current = opts;
  });
  const go = (s: OrbState) => ((stateRef.current = s), setState(s));

  // Levels at ~20fps while a session is running.
  useEffect(() => {
    if (state === "idle" || state === "error") return;
    const t0 = now();
    const id = setInterval(() => {
      const s = stateRef.current;
      const input = s === "listening" ? level(micAn.current, buf.current) : 0;
      const output =
        s !== "speaking" ? 0 : fakeOut.current ? Math.abs(Math.sin(((now() - t0) / 1000) * 9)) * (0.4 + Math.random() * 0.6) : level(outAn.current, buf.current);
      setLevels({ input, output });
    }, 50);
    return () => clearInterval(id);
  }, [state]);

  const teardown = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    audio.current?.pause();
    audio.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    micAn.current = null;
    setMicOn(false);
  };
  useEffect(
    () => () => {
      run.current++;
      teardown();
      ctx.current?.close().catch(() => {});
    },
    [],
  );

  // Speak a line: real ElevenLabs audio with captions synced to playback, or simulated if that fails.
  const speak = async (text: string, id: number) => {
    go("speaking");
    const skipAtStart = skips.current;
    const words = text.split(" ");
    let played = false;
    try {
      const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (!r.ok) throw new Error(String(r.status));
      const url = URL.createObjectURL(await r.blob());
      if (run.current !== id) return false;
      const el = new Audio(url);
      el.playbackRate = Math.min(1.6, Math.max(0.8, optsRef.current.speed?.() ?? 1.2));
      audio.current = el;
      if (ctx.current) {
        const src = ctx.current.createMediaElementSource(el);
        const an = ctx.current.createAnalyser();
        an.fftSize = 1024;
        src.connect(an);
        an.connect(ctx.current.destination);
        outAn.current = an;
      }
      fakeOut.current = !ctx.current;
      await el.play();
      played = true;
      await new Promise<void>((done) => {
        const tick = () => {
          if (run.current !== id || el.ended || el.paused || skips.current !== skipAtStart) return done();
          const shown = Math.max(1, Math.ceil((el.currentTime / (el.duration || 1)) * words.length));
          setCaption({ who: "viva", text: words.slice(0, shown).join(" ") });
          requestAnimationFrame(tick);
        };
        el.onended = () => done();
        tick();
      });
      URL.revokeObjectURL(url);
    } catch {
      if (!played) {
        // Voice service unavailable: keep the conversation going with captions only.
        setNotice("Viva's voice isn't available right now, so replies show as captions.");
        fakeOut.current = true;
        const skipAt = skips.current;
        const pace = Math.round(170 / (optsRef.current.speed?.() ?? 1.15));
        for (let i = 1; i <= words.length; i++) {
          if (run.current !== id) return false;
          if (skips.current !== skipAt) break;
          setCaption({ who: "viva", text: words.slice(0, i).join(" ") });
          await sleep(pace);
        }
      }
    }
    if (run.current !== id) return false;
    setCaption({ who: "viva", text });
    optsRef.current.onTurn("viva", text);
    return true;
  };

  // Handle one student turn (from the microphone or a tapped question): the transcript goes
  // through the same Gemini coach as chat, and the reply comes back as speech.
  const answer = async (question: string, id: number) => {
    setCaption({ who: "you", text: question });
    optsRef.current.onTurn("you", question);
    go("thinking");
    const reply = await Promise.resolve()
      .then(() => optsRef.current.reply(question))
      .catch(() => "");
    if (run.current !== id) return;
    if (!reply) {
      setNotice("Viva couldn't answer that. Try again, or tap a question.");
      return listen(id);
    }
    if (await speak(reply, id)) listen(id);
  };

  // Listen for one turn: record until the student stops talking, then transcribe.
  const listen = async (id: number) => {
    if (run.current !== id) return;
    go("listening");
    if (!stream.current) return; // no microphone: wait for a tapped question
    await sleep(250); // let Viva's last word clear the room
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream.current, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.current = rec;
    rec.start(250);

    const { silenceMs = SILENCE_MS, maxMs = MAX_TURN_MS } = optsRef.current.turn ?? {};
    doneTalking.current = false;
    let spoke = false;
    let quietSince = now();
    const t0 = now();
    while (run.current === id && recorder.current === rec) {
      await sleep(80);
      if (doneTalking.current) break;
      if (level(micAn.current, buf.current) > SPEECH_LEVEL) {
        spoke = true;
        quietSince = now();
      }
      const t = now();
      if (spoke && (t - quietSince > silenceMs || t - t0 > maxMs)) break;
    }
    if (recorder.current !== rec) return; // stopped or replaced by a tapped question
    await new Promise<void>((done) => ((rec.onstop = () => done()), rec.stop()));
    recorder.current = null;
    if (run.current !== id) return;

    go("thinking");
    setCaption({ who: "you", text: "…" });
    try {
      const form = new FormData();
      form.append("file", new Blob(chunks, { type: rec.mimeType }), "speech");
      const r = await fetch("/api/stt", { method: "POST", body: form });
      const { text } = r.ok ? await r.json() : { text: "" };
      if (run.current !== id) return;
      if (!text) {
        setNotice("I didn't catch that. Try again, or tap a question.");
        return listen(id);
      }
      setNotice("");
      await answer(text, id);
    } catch {
      setNotice("Couldn't reach speech-to-text. Tap a question instead.");
      listen(id);
    }
  };

  return {
    state,
    caption,
    input: levels.input,
    output: levels.output,
    micOn,
    notice,
    active: state !== "idle" && state !== "error",
    async start() {
      const id = ++run.current;
      go("connecting");
      setCaption(null);
      setNotice("");
      // Audio objects must be created inside the click for browsers to allow playback and recording.
      ctx.current ??= new AudioContext();
      await ctx.current.resume().catch(() => {});
      buf.current = new Float32Array(1024);
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const an = ctx.current.createAnalyser();
        an.fftSize = 1024;
        ctx.current.createMediaStreamSource(stream.current).connect(an);
        micAn.current = an;
        setMicOn(true);
      } catch {
        setNotice("Microphone is off, so tap a question below to talk with Viva.");
      }
      if (run.current !== id) return;
      if (await speak(optsRef.current.greeting(), id)) listen(id);
    },
    /** Fast-forward: stop the line Viva is saying and go straight to listening. */
    skip() {
      skips.current++;
      audio.current?.pause();
    },
    // End the student's turn now instead of waiting for silence ("Done explaining").
    finish() {
      doneTalking.current = true;
    },
    // A tapped question stands in for speech (and is the fallback when there's no microphone).
    say(question: string) {
      const id = ++run.current;
      if (recorder.current?.state === "recording") recorder.current.stop();
      recorder.current = null;
      answer(question, id);
    },
    stop() {
      run.current++;
      teardown();
      go("idle");
      setCaption(null);
      setNotice("");
      setLevels({ input: 0, output: 0 });
    },
  };
}
