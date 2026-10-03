"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Clock, History, MessageCircle, Mic, PhoneOff, Plus, Search, Trash2, X } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { VoiceBeam } from "voice-glow";
import { LiquidSelect } from "@/components/LiquidSelect";
import { VivaAvatar, VivaGlyph } from "@/components/Viva";
import { usePathway, type ChatMsg, type ChatSession } from "@/lib/store";
import { VIVA, type Action, type Reply } from "@/lib/viva";
import { useVoiceSession } from "@/lib/voice";

function fmtSessionDate(iso: string) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Recently";
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (isToday) return `Today · ${timeStr}`;
    if (isYesterday) return `Yesterday · ${timeStr}`;
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${timeStr}`;
  } catch {
    return "Recently";
  }
}

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

function ChatHistoryDrawer({
  open,
  onClose,
  sessions,
  activeId,
  onSelect,
  onDelete,
  onNewChat,
}: {
  open: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const filtered = sessions.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.messages.some((m) => m.text.toLowerCase().includes(q));
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Previous chats with Viva">
      <div
        className="fixed inset-0 bg-ink/30 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l-2 border-line bg-white shadow-2xl transition-transform duration-200">
        <div className="flex items-center justify-between border-b-2 border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-soft text-sky">
              <History size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-lg font-black text-ink">Previous chats</h2>
              <p className="text-xs font-bold text-muted">{sessions.length} saved {sessions.length === 1 ? "conversation" : "conversations"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                onNewChat();
                onClose();
              }}
              className="btn btn-sky min-h-9 px-3 text-xs"
              title="Start a new chat"
            >
              <Plus size={15} strokeWidth={3} aria-hidden />
              New
            </button>
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-xl border-2 border-line text-muted hover:border-ink hover:text-ink"
              aria-label="Close drawer"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="border-b border-line/60 p-3">
          <div className="flex items-center gap-2 rounded-xl border-2 border-line bg-polar px-3 py-1.5 focus-within:border-sky">
            <Search size={16} className="text-muted" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter past conversations…"
              className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-muted"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-xs font-bold text-muted hover:text-ink">Clear</button>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-bold text-muted">
                {query ? "No conversations match your search." : "No previous chats yet."}
              </p>
            </div>
          ) : (
            filtered.map((s) => {
              const isActive = s.id === activeId;
              const lastTurn = s.messages.at(-1);
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    onSelect(s.id);
                    onClose();
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onSelect(s.id);
                      onClose();
                    }
                  }}
                  className={`group relative flex cursor-pointer flex-col gap-1.5 rounded-2xl border-2 p-3.5 text-left transition-all ${
                    isActive
                      ? "border-sky bg-sky-soft/40 shadow-xs"
                      : "border-line bg-white hover:border-sky/50 hover:bg-polar/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-1 text-sm font-extrabold text-ink">{s.title || "New conversation"}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isActive && (
                        <span className="rounded-full bg-sky px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                          Current
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(s.id);
                        }}
                        className="rounded-lg p-1 text-muted opacity-70 transition-colors hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                        title="Delete this conversation"
                        aria-label={`Delete conversation ${s.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {lastTurn ? (
                    <p className="line-clamp-2 text-xs font-medium text-muted">
                      <span className="font-bold text-ink">{lastTurn.role === "you" ? "You: " : "Viva: "}</span>
                      {lastTurn.text}
                    </p>
                  ) : (
                    <p className="text-xs font-medium italic text-muted">Fresh conversation</p>
                  )}

                  <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-muted">
                    <span>{fmtSessionDate(s.updatedAt || s.createdAt)}</span>
                    <span>{s.messages.length} {s.messages.length === 1 ? "turn" : "turns"}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t-2 border-line bg-polar/50 p-4">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="btn btn-sky w-full"
          >
            <Plus size={18} strokeWidth={3} aria-hidden />
            Start new conversation
          </button>
        </div>
      </div>
    </div>
  );
}

function Chat() {
  const { state, ask, vivaThinking, profile, chatSessions, activeChatId, activeChat, startNewChat, selectChat, deleteChat } = usePathway();
  const end = useRef<HTMLLIElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.chat.length, vivaThinking]);

  const handleStartNew = () => {
    startNewChat();
    setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (q) ask(q);
    e.currentTarget.reset();
  };

  const isOldChat = activeChat && activeChat.messages.length > 0 && activeChat.title !== "New conversation";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border-2 border-line bg-polar p-2.5 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-sky" aria-hidden />
          <span className="truncate text-xs font-extrabold uppercase tracking-wider text-muted">Current chat:</span>
          <span className="truncate text-sm font-extrabold text-ink">{activeChat?.title || "New conversation"}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleStartNew}
            className="btn btn-sky min-h-9 px-3 text-xs"
            title="Start a fresh conversation with Viva"
          >
            <Plus size={15} strokeWidth={3} aria-hidden />
            New chat
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            className="btn btn-ghost min-h-9 px-3 text-xs"
            aria-label={`View previous chats (${chatSessions.length})`}
          >
            <History size={15} strokeWidth={2.5} aria-hidden />
            Previous chats
            <span className="ml-1 rounded-full bg-line px-1.5 py-0.5 text-[11px] font-extrabold text-muted">
              {chatSessions.length}
            </span>
          </button>
        </div>
      </div>

      {isOldChat && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-sky/30 bg-sky-soft/40 px-3.5 py-2 text-xs">
          <span className="flex items-center gap-1.5 font-bold text-sky">
            <Clock size={14} aria-hidden />
            Viewing past conversation from {fmtSessionDate(activeChat.createdAt)}
          </span>
          <button
            onClick={handleStartNew}
            className="font-extrabold text-sky hover:underline"
          >
            + Start new chat
          </button>
        </div>
      )}

      <ol className="space-y-4" aria-live="polite">
        {state.chat.length === 0 && (
          <Message m={{ role: "viva", text: VIVA.greeting(profile.sample ? profile.name : undefined) }} />
        )}
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
        <input
          ref={inputRef}
          id="q"
          name="q"
          autoComplete="off"
          placeholder="Message Viva…"
          className="min-w-0 flex-1 bg-transparent py-2 font-bold outline-none placeholder:text-muted"
        />
        <button className="btn btn-sky min-h-10 px-3" aria-label="Send">
          <ArrowUp size={20} strokeWidth={3} />
        </button>
      </form>

      <ChatHistoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sessions={chatSessions}
        activeId={activeChatId}
        onSelect={selectChat}
        onDelete={deleteChat}
        onNewChat={handleStartNew}
      />
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
