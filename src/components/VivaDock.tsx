"use client";

// The mini Viva: one voice session and one chat thread that live in the app shell, so Viva keeps
// going whatever page the student is on. The sidebar card opens it in chat or voice; the Viva
// page uses the same session, so walking away from that page doesn't hang up.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUp, FastForward, Mic, PhoneOff, Settings2, X } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { VivaAvatar, VivaGlyph } from "@/components/Viva";
import { Citations, EmailCard, Receipts } from "@/components/VivaBits";
import { usePathway } from "@/lib/store";
import { VIVA, type Citation } from "@/lib/viva";
import { useVoiceSession } from "@/lib/voice";

type View = "chat" | "voice" | "settings";
type VivaCtx = {
  voice: ReturnType<typeof useVoiceSession>;
  open: boolean;
  view: View;
  show: (view?: View) => void;
  hide: () => void;
  speed: number;
  setSpeed: (v: number) => void;
};

const Ctx = createContext<VivaCtx | null>(null);
const SPEED_KEY = "pathway:viva-speed";

export function VivaProvider({ children }: { children: ReactNode }) {
  const { profile, coachTurn, addTurn, state, markGreeted } = usePathway();
  // Viva introduces herself once per Reset (the flag rides in the profile's extras, so /demo, the demo
  // account and Beacon agree); after that, opening voice goes straight to listening.
  const greetedRef = useRef(!!state.greeted);
  useEffect(() => {
    greetedRef.current = !!state.greeted; // false again after a Reset
  }, [state.greeted]);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [speed, setSpeedState] = useState(() => {
    try {
      const v = typeof window === "undefined" ? NaN : Number(localStorage.getItem(SPEED_KEY));
      return v >= 0.8 && v <= 1.6 ? v : 1.15;
    } catch {
      return 1.15;
    }
  });
  const speedRef = useRef(speed);
  const setSpeed = (v: number) => {
    speedRef.current = v;
    setSpeedState(v);
    try {
      localStorage.setItem(SPEED_KEY, String(v));
    } catch {}
  };

  const lastExtras = useRef<{ receipts?: string[]; email?: { to: string; subject: string; body: string } } | undefined>(undefined);
  const voice = useVoiceSession({
    greeting: () => {
      if (greetedRef.current) return null;
      greetedRef.current = true;
      markGreeted();
      return VIVA.greeting(profile?.sample ? profile.name : undefined);
    },
    reply: async (q) => {
      const r = await coachTurn(q, "voice");
      if (r.navigate) router.push(r.navigate);
      lastExtras.current = { receipts: r.receipts, email: r.email };
      return r.text;
    },
    onTurn: (who, text) => {
      const extra = who === "viva" ? lastExtras.current : undefined;
      addTurn({ role: who, text, ...(extra ?? {}) });
      lastExtras.current = undefined;
    },
    speed: () => speedRef.current,
  });

  const show = (v?: View) => {
    if (v) setView(v);
    setOpen(true);
  };
  return <Ctx.Provider value={{ voice, open, view, show, hide: () => setOpen(false), speed, setSpeed }}>{children}</Ctx.Provider>;
}

export function useViva() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useViva outside VivaProvider");
  return v;
}

/** The card in the sidebar: opens the dock in chat or voice, and shows a live voice session. */
export function VivaCard() {
  const { voice, show, open, view } = useViva();
  const live = voice.active;
  const label = live ? ({ listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…", connecting: "Connecting…" } as Record<string, string>)[voice.state] ?? "On a call" : "Ask, plan, or talk";
  return (
    <div className="rounded-2xl border-2 border-line bg-polar p-3" aria-label="Mini Viva">
      <button onClick={() => show(live ? "voice" : "chat")} className="flex w-full items-center gap-2.5 text-left" aria-expanded={open}>
        <span className="relative shrink-0">
          <VivaGlyph size={34} className="text-sky" />
          {live && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-teal" aria-hidden />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black text-ink">Viva</span>
          <span className="block truncate text-xs font-bold text-muted" aria-live="polite">{label}</span>
        </span>
      </button>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <button onClick={() => show("chat")} className={`btn min-h-9 px-2 text-xs ${open && view === "chat" ? "btn-sky" : "btn-ghost"}`}>
          Chat
        </button>
        <button onClick={() => show("voice")} className={`btn min-h-9 px-2 text-xs ${open && view === "voice" ? "btn-sky" : "btn-ghost"}`}>
          <Mic size={14} aria-hidden /> Voice
        </button>
      </div>
    </div>
  );
}

const STATE: Record<string, string> = { idle: "Tap Start to talk", connecting: "Connecting…", listening: "Listening… just talk", thinking: "Thinking…", speaking: "Speaking", error: "Something went wrong" };

/** The floating panel. Hidden on the Viva page itself (that page is the big version of this). */
export function VivaDock() {
  const { open, view, show, hide, voice, speed, setSpeed } = useViva();
  const path = usePathname();
  const router = useRouter();
  const { state, ask, vivaThinking, profile, usage, startNewChat, knowledge, reviewNode } = usePathway();
  const prefs = knowledge.nodes.filter((n) => n.type === "preference" && n.review !== "rejected");
  const end = useRef<HTMLDivElement>(null);
  const onVivaPage = path.startsWith("/viva");

  // Leaving the Viva page mid-conversation: it carries on here, so bring the panel up.
  const wasOnViva = useRef(onVivaPage);
  const chatLen = state.chat.length;
  useEffect(() => {
    if (wasOnViva.current && !onVivaPage) {
      if (voice.active) show("voice");
      else if (chatLen > 0) show("chat");
    }
    wasOnViva.current = onVivaPage;
  }, [onVivaPage, voice.active, chatLen, show]);

  useEffect(() => {
    if (open && view === "chat") end.current?.scrollIntoView({ block: "end" });
  }, [open, view, state.chat.length, vivaThinking]);

  if (onVivaPage || path.startsWith("/device") || !profile) return null;
  if (!open) return null;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const q = String(new FormData(form).get("q") ?? "").trim();
    form.reset();
    if (!q) return;
    const r = await ask(q);
    if (r?.navigate) router.push(r.navigate);
  };

  // Slides right with the sidebar when it opens (by the open width minus the rail, Sidebar.tsx), so it is never covered.
  return (
    <section
      aria-label="Viva"
      className="fixed z-30 flex animate-[rise_220ms_cubic-bezier(0.22,1,0.36,1)] flex-col overflow-hidden rounded-2xl border-2 border-line bg-white shadow-xl max-md:inset-x-2 max-md:bottom-24 max-md:max-h-[70dvh] md:bottom-4 md:left-[5.25rem] md:h-[min(620px,calc(100dvh-2rem))] md:w-[400px] md:transition-[translate] md:duration-300 md:ease-[cubic-bezier(0.45,0,0.15,1)] md:[body:has(nav[data-open])_&]:translate-x-[11.5rem]"
    >
      <header className="flex items-center gap-2 border-b-2 border-line px-3 py-2">
        <VivaGlyph size={26} className="text-sky" />
        <span className="font-black">Viva</span>
        <div className="ml-2 flex gap-1 rounded-xl bg-polar p-0.5">
          {(["chat", "voice"] as const).map((v) => (
            <button key={v} onClick={() => show(v)} aria-pressed={view === v} className={`rounded-lg px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider ${view === v ? "bg-white text-sky shadow-xs" : "text-muted hover:text-ink"}`}>
              {v}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button onClick={() => show(view === "settings" ? "chat" : "settings")} aria-label="Viva settings" aria-pressed={view === "settings"} className={`rounded-lg p-1.5 ${view === "settings" ? "bg-sky-soft text-sky" : "text-muted hover:text-ink"}`}>
          <Settings2 size={18} />
        </button>
        <Link href="/viva" className="rounded-lg p-1.5 text-xs font-extrabold text-muted hover:text-ink" title="Open the full Viva page">
          Expand
        </Link>
        <button onClick={hide} aria-label="Close Viva" className="rounded-lg p-1.5 text-muted hover:text-ink">
          <X size={18} />
        </button>
      </header>

      {view === "chat" && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <ol className="space-y-3 text-sm" aria-live="polite">
              {state.chat.length === 0 && <Bubble who="viva" text={VIVA.greeting(profile.sample ? profile.name : undefined)} />}
              {state.chat.map((m, i) => (
                <Bubble key={i} who={m.role} text={m.text} receipts={m.receipts} email={m.email} actions={m.actions} citations={m.citations} />
              ))}
              {vivaThinking && (
                <li className="flex items-center gap-2 font-bold text-muted">
                  <ThinkingOrb state="searching" size={32} theme="light" color="#1a6fd1" aria-hidden /> Viva is on it…
                </li>
              )}
            </ol>
            {state.chat.length === 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {["Add a BIO 181 review block Thursday at 4", "What's due this week?", "Email my professor about the missed quiz"].map((q) => (
                  <li key={q}>
                    <button onClick={() => ask(q).then((r) => r?.navigate && router.push(r.navigate))} className="rounded-full border-2 border-line bg-white px-2.5 py-1 text-xs font-bold text-sky hover:border-sky/40">
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div ref={end} />
          </div>
          <form onSubmit={submit} className="flex items-center gap-2 border-t-2 border-line p-2 pl-3 focus-within:border-sky">
            <label htmlFor="dock-q" className="sr-only">Message Viva</label>
            <input id="dock-q" name="q" autoComplete="off" placeholder="Ask Viva to do anything…" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm font-bold outline-none placeholder:text-muted" />
            <button type="button" onClick={startNewChat} className="text-xs font-extrabold text-muted hover:text-ink" title="Start a new conversation">New</button>
            <button className="btn btn-sky min-h-9 px-2.5" aria-label="Send">
              <ArrowUp size={18} strokeWidth={3} />
            </button>
          </form>
          <p className="px-3 pb-2 text-[11px] font-bold leading-snug text-muted">Viva is AI and can be wrong. It only sees what you&apos;ve logged, and every change it makes gets a receipt.</p>
        </>
      )}

      {view === "voice" && (
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-4 text-center">
          <VivaAvatar size={150} state={voice.state} input={voice.input} output={voice.output} />
          <p className="mt-1 text-sm font-black" aria-live="polite">
            {voice.state === "listening" && !voice.micOn ? "Tap a question to ask Viva" : STATE[voice.state]}
          </p>
          {voice.notice && <p role="status" className="mt-1 text-xs font-bold text-muted">{voice.notice}</p>}
          <div className="mt-3 min-h-16 w-full rounded-xl bg-polar px-3 py-2.5 text-left text-sm">
            {voice.caption ? (
              <p>
                <span className={`font-black ${voice.caption.who === "viva" ? "text-sky" : "text-teal"}`}>{voice.caption.who === "viva" ? "Viva" : "You"}: </span>
                {voice.caption.text}
              </p>
            ) : (
              <p className="text-muted">Live captions show up here.</p>
            )}
          </div>
          {voice.active ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button onClick={voice.skip} disabled={voice.state !== "speaking"} className="btn btn-ghost min-h-9 px-3 text-xs disabled:opacity-50" title="Skip what Viva is saying">
                <FastForward size={15} aria-hidden /> Skip
              </button>
              <button onClick={voice.stop} className="btn btn-danger min-h-9 px-3 text-xs">
                <PhoneOff size={15} aria-hidden /> End
              </button>
            </div>
          ) : (
            <button onClick={voice.start} className="btn btn-sky mt-3 min-h-10">
              <Mic size={16} aria-hidden /> Start talking
            </button>
          )}
          {voice.active && (
            <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
              {VIVA.suggestions.map((q) => (
                <li key={q}>
                  <button onClick={() => voice.say(q)} disabled={voice.state !== "listening"} className="rounded-full border-2 border-line bg-white px-2.5 py-1 text-xs font-bold text-sky hover:border-sky/40 disabled:opacity-50">
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">Speed {speed.toFixed(2)}×. Viva keeps talking while you move around the app.</p>
        </div>
      )}

      {view === "settings" && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">
          <label className="block">
            <span className="flex justify-between font-extrabold">
              Voice speed <span className="tabular-nums text-teal">{speed.toFixed(2)}×</span>
            </span>
            <input type="range" min={0.8} max={1.6} step={0.05} value={speed} onChange={(e) => setSpeed(+e.target.value)} className="slider mt-2" style={{ ["--fill" as string]: `${((speed - 0.8) / 0.8) * 100}%` }} aria-label="Voice speed" />
            <span className="mt-1 block text-xs text-muted">Applies to the next thing Viva says. Skip fast-forwards the current one.</span>
          </label>
          <div className="mt-5 rounded-xl bg-polar p-3">
            <p className="font-black">Token use this visit</p>
            <p className="mt-1 text-muted">
              {usage.turns} Viva turn{usage.turns === 1 ? "" : "s"} · {usage.input.toLocaleString()} in, {usage.output.toLocaleString()} out. One call per turn, no tool loops; the planner runs only when something changes.
            </p>
          </div>
          <div className="mt-4">
            <p className="font-black">Things you told Viva</p>
            {prefs.length ? (
              <ul className="mt-1 space-y-1 text-muted">
                {prefs.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-2">
                    <span>{n.title}{n.course ? <span className="text-xs"> · {n.course}</span> : null}</span>
                    <button onClick={() => reviewNode(n.id, "rejected")} className="text-xs font-extrabold text-muted hover:text-ink" aria-label={`Forget: ${n.title}`}>Forget</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted">Nothing yet. Tell Viva things like “I work Tuesday nights” and it sticks.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Bubble({ who, text, receipts, email, actions, citations }: { who: "you" | "viva"; text: string; receipts?: string[]; email?: { to: string; subject: string; body: string }; actions?: { label: string; href: string }[]; citations?: Citation[] }) {
  if (who === "you") return <li className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-teal-soft px-3 py-2 text-teal-lip">{text}</li>;
  return (
    <li className="max-w-[92%] rounded-2xl rounded-tl-md border-2 border-sky/25 bg-sky-soft px-3 py-2">
      <p className="whitespace-pre-wrap">{text}</p>
      <Receipts items={receipts} />
      <Citations items={citations} />
      <EmailCard email={email} />
      {actions && actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {actions.map((a) => (
            <Link key={a.href} href={a.href} className="btn btn-ghost min-h-8 px-2.5 text-xs">{a.label}</Link>
          ))}
        </div>
      )}
    </li>
  );
}
