"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, MessageCircle, Mic, PhoneOff } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { VoiceBeam } from "voice-glow";
import { LiquidSelect } from "@/components/LiquidSelect";
import { VivaAvatar, VivaGlyph } from "@/components/Viva";
import { usePathway, type ChatMsg } from "@/lib/store";
import { VIVA, type Action, type Reply } from "@/lib/viva";
import { useVoiceSession } from "@/lib/voice";

export function VivaPage() {
  const params = useSearchParams();
  const router = useRouter();
  const mode = params.get("mode") === "voice" ? "voice" : "chat";
  const setMode = (m: "chat" | "voice") => router.replace(m === "voice" ? "/viva?mode=voice" : "/viva", { scroll: false });

  return (
    <main className="mx-auto flex max-w-3xl flex-col px-4 py-6 md:px-10 md:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <VivaGlyph size={52} className="text-sky" />
          <div>
            <h1 className="text-[2rem] font-black leading-tight">{VIVA.name}</h1>
            <p className="text-muted">Your study coach. Answers come only from your numbers and the model.</p>
          </div>
        </div>
        <LiquidSelect active={mode} fill="#1a6fd1" shadow="inset 0 -4px 0 #12509a" className="inline-flex items-center rounded-2xl border-2 border-line bg-polar p-1">
        <div role="group" aria-label="Mode" className="flex items-center">
          {(["chat", "voice"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              data-liquid-key={m}
              className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold uppercase tracking-wider transition-colors duration-300 ${mode === m ? "text-white" : "text-muted hover:text-ink"}`}
            >
              {m === "chat" ? <MessageCircle size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
              {m}
            </button>
          ))}
        </div>
        </LiquidSelect>
      </header>
      {mode === "chat" ? <Chat /> : <Voice />}
      <p className="mt-4 text-sm text-muted">
        Viva is AI (Gemini, with an ElevenLabs voice) and can be wrong. It never sees anything you haven&apos;t logged, and it never stores your status.
      </p>
    </main>
  );
}

function Message({ m }: { m: ChatMsg }) {
  if (m.role === "you")
    return <li className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-teal-soft px-4 py-3 text-teal-lip">{m.text}</li>;
  return (
    <li className="flex max-w-[90%] gap-3">
      <VivaGlyph size={36} className="mt-1 shrink-0 text-sky" />
      <div className="rounded-2xl rounded-tl-md border-2 border-sky/25 bg-sky-soft px-4 py-3">
        <p>{m.text}</p>
        {m.actions && m.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {m.actions.map((a) => (
              <Link key={a.href} href={a.href} className="btn btn-ghost min-h-9 px-3 text-xs">{a.label}</Link>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function Chat() {
  const { state, ask, vivaThinking, profile } = usePathway();
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); // returns a Promise in newer browsers; keep it out of the cleanup slot
  }, [state.chat.length, vivaThinking]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (q) ask(q);
    e.currentTarget.reset();
  };

  return (
    <>
      <ol className="space-y-4" aria-live="polite">
        <Message m={{ role: "viva", text: VIVA.greeting(profile.sample ? profile.name : undefined) }} />
        {state.chat.map((m, i) => <Message key={i} m={m} />)}
        {vivaThinking && (
          <li className="flex items-center gap-3 font-bold text-muted">
            <ThinkingOrb state="searching" size={32} theme="light" color="#1a6fd1" aria-hidden />
            Viva is checking your numbers…
          </li>
        )}
        <li ref={end} aria-hidden />
      </ol>
      {state.chat.length === 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {VIVA.suggestions.map((s) => (
            <li key={s}>
              <button onClick={() => ask(s)} className="rounded-full border-2 border-line bg-white px-3 py-1.5 text-sm font-bold text-sky hover:border-sky/40">{s}</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="sticky bottom-24 mt-6 flex items-center gap-2 rounded-2xl border-2 border-line bg-white p-1.5 pl-4 focus-within:border-sky md:bottom-6">
        <label htmlFor="q" className="sr-only">Message Viva</label>
        <input id="q" name="q" autoComplete="off" placeholder="Message Viva…" className="min-w-0 flex-1 bg-transparent py-2 font-bold outline-none placeholder:text-muted" />
        <button className="btn btn-sky min-h-10 px-3" aria-label="Send">
          <ArrowUp size={20} strokeWidth={3} />
        </button>
      </form>
    </>
  );
}

const STATE_LABEL: Record<string, string> = {
  idle: "Tap Start to talk with Viva",
  connecting: "Connecting…",
  listening: "Listening… just talk",
  thinking: "Thinking…",
  speaking: "Viva is speaking",
  error: "Something went wrong. Try again.",
};

function Voice() {
  const { profile, reply, addTurn } = usePathway();
  const last = useRef<Reply | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const v = useVoiceSession({
    greeting: () => VIVA.greeting(profile.sample ? profile.name : undefined),
    reply: (q) => {
      last.current = reply(q);
      setActions([]);
      return last.current.text;
    },
    onTurn: (who, text) => {
      const acts = who === "viva" ? (last.current?.actions ?? []) : undefined;
      addTurn({ role: who, text, actions: acts });
      if (acts) setActions(acts);
      last.current = null;
    },
  });
  useEffect(() => () => v.stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-label="Voice conversation with Viva" className="panel flex flex-col items-center px-5 py-8 text-center">
      <VivaAvatar size={260} state={v.state} input={v.input} output={v.output} />
      <p className="mt-2 text-lg font-black" aria-live="polite">
        {v.state === "listening" && !v.micOn ? "Tap a question to ask Viva" : STATE_LABEL[v.state]}
      </p>
      {v.notice && <p role="status" className="mt-1 text-sm font-bold text-muted">{v.notice}</p>}

      {/* Glows with the student's microphone level while Viva is listening. */}
      <VoiceBeam
        level={v.input}
        active={v.state === "listening"}
        colorVariant="ocean"
        theme="light"
        borderRadius={16}
        className="mt-4 w-full max-w-xl"
      >
      <div className="min-h-24 w-full rounded-2xl bg-polar px-5 py-4 text-left">
        {v.caption ? (
          <p className="text-lg">
            <span className={`font-black ${v.caption.who === "viva" ? "text-sky" : "text-teal"}`}>{v.caption.who === "viva" ? "Viva" : "You"}: </span>
            {v.caption.text}
          </p>
        ) : (
          <p className="text-muted">Live captions show up here.</p>
        )}
        {actions.length > 0 && v.state === "listening" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((a) => (
              <Link key={a.href} href={a.href} className="btn btn-ghost min-h-9 px-3 text-xs">{a.label}</Link>
            ))}
          </div>
        )}
      </div>
      </VoiceBeam>

      {v.active ? (
        <>
          <p className="mt-5 text-sm font-extrabold text-muted">{v.micOn ? "Or tap a question" : "Tap a question"}</p>
          <ul className="mt-2 flex flex-wrap justify-center gap-2">
            {VIVA.suggestions.map((s) => (
              <li key={s}>
                <button
                  onClick={() => v.say(s)}
                  disabled={v.state !== "listening"}
                  className="rounded-full border-2 border-line bg-white px-3 py-1.5 text-sm font-bold text-sky hover:border-sky/40 disabled:opacity-50"
                >
                  “{s}”
                </button>
              </li>
            ))}
          </ul>
          <button onClick={v.stop} className="btn btn-danger mt-6">
            <PhoneOff size={18} aria-hidden /> End
          </button>
        </>
      ) : (
        <button onClick={v.start} className="btn btn-sky mt-6">
          <Mic size={18} aria-hidden /> Start talking
        </button>
      )}
      <p className="mt-5 max-w-xl text-sm text-muted">
        Voice mode sends what you say and what Viva says to ElevenLabs to turn speech into text and back. Pathway doesn&apos;t keep the audio. Your words also appear in the Chat transcript.
      </p>
    </section>
  );
}
