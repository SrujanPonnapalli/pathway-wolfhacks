"use client";

// Simulated voice session for the mockup. No microphone, no audio: it fakes the
// listen → think → speak loop and the volume levels orb-ui animates from.
// TODO: replace with orb-ui's ElevenLabs adapter (createElevenLabsAdapter from "orb-ui/adapters")
// plus /api/tts and /api/stt; keep the same { state, input, output, caption } shape for the page.
import { useEffect, useRef, useState } from "react";
import type { OrbState } from "orb-ui";

export type Caption = { who: "you" | "viva"; text: string } | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useVoiceSession(opts: { greeting: () => string; reply: (q: string) => string; onTurn: (who: "you" | "viva", text: string) => void }) {
  const [state, setState] = useState<OrbState>("idle");
  const [caption, setCaption] = useState<Caption>(null);
  const [level, setLevel] = useState({ input: 0, output: 0 });
  const talking = useRef<"you" | "viva" | null>(null);
  const run = useRef(0); // bumping this cancels any in-flight script
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  // Fake audio levels at ~20fps.
  useEffect(() => {
    if (state === "idle" || state === "error") return;
    const t0 = performance.now();
    const id = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      const who = talking.current;
      setLevel({
        input: who === "you" ? 0.35 + Math.random() * 0.45 : state === "listening" ? Math.random() * 0.06 : 0,
        output: who === "viva" ? Math.min(1, Math.abs(Math.sin(t * 9)) * (0.4 + Math.random() * 0.6)) : 0,
      });
    }, 50);
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => () => void run.current++, []);

  const words = async (who: "you" | "viva", text: string, ms: number, id: number) => {
    talking.current = who;
    const w = text.split(" ");
    for (let i = 1; i <= w.length; i++) {
      if (run.current !== id) return false;
      setCaption({ who, text: w.slice(0, i).join(" ") });
      await sleep(ms);
    }
    talking.current = null;
    return run.current === id;
  };

  const speak = async (text: string, id: number) => {
    setState("speaking");
    if (!(await words("viva", text, 170, id))) return false;
    optsRef.current.onTurn("viva", text);
    setState("listening");
    return true;
  };

  return {
    state,
    caption,
    input: level.input,
    output: level.output,
    active: state !== "idle" && state !== "error",
    async start() {
      const id = ++run.current;
      setState("connecting");
      setCaption(null);
      await sleep(900);
      if (run.current !== id) return;
      await speak(optsRef.current.greeting(), id);
    },
    // Stand-in for the microphone: plays a sample question as if the student said it.
    async say(question: string) {
      const id = ++run.current;
      setState("listening");
      if (!(await words("you", question, 140, id))) return;
      optsRef.current.onTurn("you", question);
      setState("thinking");
      await sleep(1000);
      if (run.current !== id) return;
      await speak(optsRef.current.reply(question), id);
    },
    stop() {
      run.current++;
      talking.current = null;
      setState("idle");
      setCaption(null);
      setLevel({ input: 0, output: 0 });
    },
  };
}
