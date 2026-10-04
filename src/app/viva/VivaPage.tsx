"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Clock, FastForward, GraduationCap, History, Loader2, MessageCircle, Mic, PhoneOff, Plus, Search, Square, Trash2, Volume2, X } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { VoiceBeam } from "voice-glow";
import { LiquidSelect } from "@/components/LiquidSelect";
import { VivaAvatar, VivaGlyph } from "@/components/Viva";
import { Citations, EmailCard, Receipts } from "@/components/VivaBits";
import { useViva } from "@/components/VivaDock";
import { usePathway, type ChatMsg, type ChatSession } from "@/lib/store";
import { VIVA, type Action } from "@/lib/viva";
import { Teach } from "./Teach";

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

type Mode = "chat" | "voice" | "teach";
const MODES: { id: Mode; icon: typeof Mic }[] = [
  { id: "chat", icon: MessageCircle },
  { id: "voice", icon: Mic },
  { id: "teach", icon: GraduationCap },
];

export function VivaPage() {
  const params = useSearchParams();
  const router = useRouter();
  const asked = params.get("mode");
  const mode: Mode = asked === "voice" || asked === "teach" ? asked : "chat";
  const setMode = (m: Mode) => router.replace(m === "chat" ? "/viva" : `/viva?mode=${m}`, { scroll: false });
  const { chatSessions, activeChatId, startNewChat, selectChat, deleteChat } = usePathway();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Track mode transitions so coming back to chat from voice or teach does not auto-scroll
  const prevModeRef = useRef<Mode>(mode);
  const chatScrollYRef = useRef<number | null>(null);
  const switchedFromVoiceRef = useRef<boolean>(false);

  const handleSetMode = (nextMode: Mode) => {
    if (nextMode === mode) return;
    if (mode === "chat") {
      chatScrollYRef.current = window.scrollY;
    }
    if (mode !== "chat" && nextMode === "chat") {
      switchedFromVoiceRef.current = true;
    } else {
      switchedFromVoiceRef.current = false;
    }
    prevModeRef.current = mode;
    setMode(nextMode);
  };

  useEffect(() => {
    if (prevModeRef.current !== "chat" && mode === "chat") {
      switchedFromVoiceRef.current = true;
      if (chatScrollYRef.current !== null) {
        const targetY = chatScrollYRef.current;
        requestAnimationFrame(() => {
          window.scrollTo({ top: targetY, behavior: "instant" });
        });
      }
    } else if (prevModeRef.current === "chat" && mode !== "chat") {
      chatScrollYRef.current = window.scrollY;
    }
    prevModeRef.current = mode;
  }, [mode]);

  const handleStartNew = () => {
    if (mode !== "chat") handleSetMode("chat");
    startNewChat();
    setTimeout(() => {
      const input = document.getElementById("q") as HTMLInputElement | null;
      input?.focus();
    }, 60);
  };

  const handleSelectChat = (id: string) => {
    selectChat(id);
    if (mode !== "chat") handleSetMode("chat");
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col px-4 py-6 md:px-10 md:py-10">
      {/* Pinned persistent top-right controls */}
      <aside
        aria-label="Viva chat controls"
        className="fixed top-3 right-3 sm:top-4 sm:right-6 md:top-6 md:right-8 z-40 flex items-center gap-1.5 rounded-2xl border-2 border-line bg-white/95 p-1 shadow-md backdrop-blur-md transition-all hover:bg-white"
      >
        <button
          onClick={handleStartNew}
          className="btn btn-sky min-h-8 px-2.5 text-xs sm:min-h-9 sm:px-3"
          title="Start a fresh conversation with Viva"
        >
          <Plus size={15} strokeWidth={3} aria-hidden />
          <span>New<span className="hidden sm:inline"> chat</span></span>
        </button>
        <button
          onClick={() => setDrawerOpen(true)}
          className="btn btn-ghost min-h-8 px-2.5 text-xs sm:min-h-9 sm:px-3"
          aria-label={`View previous chats (${chatSessions.length})`}
          title="View previous chats"
        >
          <History size={15} strokeWidth={2.5} aria-hidden />
          <span className="hidden sm:inline">Previous chats</span>
          <span className="sm:hidden">History</span>
          <span className="ml-1 rounded-full bg-line/80 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-black text-muted">
            {chatSessions.length}
          </span>
        </button>
      </aside>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 pr-36 sm:pr-48 md:pr-56">
        <div className="flex items-center gap-3">
          <VivaGlyph size={52} className="text-sky" />
          <div>
            <h1 className="text-[2rem] font-black leading-tight">{VIVA.name}</h1>
            <p className="text-muted">
              {mode === "teach"
                ? "Explain a topic from your notes. If you can teach it, you know it."
                : "Your study coach. Answers come only from your numbers and the model."}
            </p>
          </div>
        </div>
        <LiquidSelect active={mode} fill="#1a6fd1" shadow="inset 0 -4px 0 #12509a" className="inline-flex items-center rounded-2xl border-2 border-line bg-polar p-1">
        <div role="group" aria-label="Mode" className="flex items-center">
          {MODES.map(({ id: m, icon: Icon }) => (
            <button
              key={m}
              onClick={() => handleSetMode(m)}
              aria-pressed={mode === m}
              data-liquid-key={m}
              className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold uppercase tracking-wider transition-colors duration-300 ${mode === m ? "text-white" : "text-muted hover:text-ink"}`}
            >
              <Icon size={18} aria-hidden />
              {m}
            </button>
          ))}
        </div>
        </LiquidSelect>
      </header>
      <div className={mode === "chat" ? "contents" : "hidden"}>
        <Chat
          onStartNew={handleStartNew}
          isVoiceMode={mode !== "chat"}
          switchedFromVoiceRef={switchedFromVoiceRef}
        />
      </div>
      {mode === "voice" && <Voice />}
      {mode === "teach" && <Teach />}
      <p className="mt-4 text-sm text-muted">
        {mode === "teach"
          ? "Viva is AI (Gemini, with an ElevenLabs voice) and can be wrong. In Teach it checks only against key ideas from the material you uploaded; your explanation goes to Gemini and, out loud, to ElevenLabs."
          : "Viva is AI (Gemini, with an ElevenLabs voice) and can be wrong. It never sees anything you haven't logged, and it never stores your status."}
      </p>

      <ChatHistoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sessions={chatSessions}
        activeId={activeChatId}
        onSelect={handleSelectChat}
        onDelete={deleteChat}
        onNewChat={handleStartNew}
      />
    </main>
  );
}

function Message({
  m,
  id,
  isPlaying = false,
  isLoading = false,
  onToggleReadAloud,
}: {
  m: ChatMsg;
  id?: string;
  isPlaying?: boolean;
  isLoading?: boolean;
  onToggleReadAloud?: (id: string, text: string) => void;
}) {
  if (m.role === "you")
    return <li className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-teal-soft px-4 py-3 text-teal-lip">{m.text}</li>;
  return (
    <li className="flex max-w-[90%] gap-3">
      <VivaGlyph size={36} className="mt-1 shrink-0 text-sky" />
      <div className="group relative rounded-2xl rounded-tl-md border-2 border-sky/25 bg-sky-soft pl-4 pr-8 py-3">
        <p className="whitespace-pre-wrap">{m.text}</p>
        <Receipts items={m.receipts} />
        <Citations items={m.citations} />
        <EmailCard email={m.email} />
        {m.actions && m.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 pr-6">
            {m.actions.map((a) => (
              <Link key={a.href} href={a.href} className="btn btn-ghost min-h-9 px-3 text-xs">{a.label}</Link>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => id && onToggleReadAloud?.(id, m.text)}
          className={`absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-md transition-all ${
            isPlaying
              ? "bg-sky text-white shadow-xs"
              : "text-sky/60 hover:bg-sky/15 hover:text-sky active:scale-95"
          }`}
          title={isPlaying ? "Stop reading" : "Read aloud"}
          aria-label={isPlaying ? "Stop reading aloud" : "Read aloud"}
        >
          {isLoading ? (
            <Loader2 size={13} className="animate-spin text-sky" />
          ) : isPlaying ? (
            <Square size={10} className="fill-current" />
          ) : (
            <Volume2 size={14} />
          )}
        </button>
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
  const [closing, setClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open && prevOpen) {
      setClosing(true);
    }
  }

  const isMounted = open || closing;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame1: number | undefined;
    let frame2: number | undefined;

    if (open) {
      frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(() => {
          setVisible(true);
        });
      });
    } else {
      frame1 = requestAnimationFrame(() => {
        setVisible(false);
      });
      timer = setTimeout(() => {
        setClosing(false);
      }, 320);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (frame1) cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!isMounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isMounted]);

  if (!isMounted) return null;

  const filtered = sessions.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.messages.some((m) => m.text.toLowerCase().includes(q));
  });

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden ${
        visible ? "pointer-events-auto" : "pointer-events-none"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Previous chats with Viva"
    >
      {/* Animated Backdrop with smooth opacity and blur transitions */}
      <div
        className={`fixed inset-0 bg-ink/30 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={{
          backdropFilter: visible ? "blur(10px)" : "blur(0px)",
          WebkitBackdropFilter: visible ? "blur(10px)" : "blur(0px)",
          transition: "opacity 300ms cubic-bezier(0.16, 1, 0.3, 1), backdrop-filter 300ms cubic-bezier(0.16, 1, 0.3, 1), -webkit-backdrop-filter 300ms cubic-bezier(0.16, 1, 0.3, 1)",
          willChange: "opacity, backdrop-filter",
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Animated Drawer panel sliding in from right */}
      <div
        className={`fixed inset-y-0 right-0 z-10 flex h-full w-full max-w-md flex-col border-l-2 border-line bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          willChange: "transform",
        }}
      >
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

function Chat({
  onStartNew,
  isVoiceMode,
  switchedFromVoiceRef,
}: {
  onStartNew: () => void;
  isVoiceMode: boolean;
  switchedFromVoiceRef: React.RefObject<boolean>;
}) {
  const { state, ask, vivaThinking, profile, activeChat } = usePathway();
  const { speed } = useViva();
  const router = useRouter();
  // Viva can move the student around the app ("show me my week"): follow her.
  const send = (q: string) => ask(q).then((r) => r?.navigate && router.push(r.navigate));
  const end = useRef<HTMLLIElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const hasAutoScrolledOnOpen = useRef(false);

  // Auto-scroll to bottom ONLY when viva is opened from a different page or loaded into
  useEffect(() => {
    if (!hasAutoScrolledOnOpen.current && !switchedFromVoiceRef.current && !isVoiceMode) {
      hasAutoScrolledOnOpen.current = true;
      const timer = setTimeout(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "instant",
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [switchedFromVoiceRef, isVoiceMode]);

  // Track scrolling up to show/hide the "go to bottom" down arrow button
  const checkScroll = useCallback(() => {
    if (isVoiceMode) return;
    const scrollHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY;
    const clientHeight = window.innerHeight;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

    const isScrollable = scrollHeight > clientHeight + 40;
    setIsScrolledUp(isScrollable && distanceFromBottom > 80);
  }, [isVoiceMode]);

  useEffect(() => {
    if (isVoiceMode) return;
    const handleScroll = () => {
      checkScroll();
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    const frame = requestAnimationFrame(() => {
      checkScroll();
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [checkScroll, isVoiceMode, state.chat.length]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior,
    });
  }, []);

  // Read aloud audio player state
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobUrlRef = useRef<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stopMedia = useCallback(() => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
    }
  }, []);

  const stopAudio = useCallback(() => {
    stopMedia();
    setActiveAudioId(null);
    setLoadingAudioId(null);
  }, [stopMedia]);

  useEffect(() => {
    if (isVoiceMode) {
      stopMedia();
      const frame = requestAnimationFrame(() => {
        setActiveAudioId(null);
        setLoadingAudioId(null);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isVoiceMode, stopMedia]);

  useEffect(() => {
    stopMedia();
    const frame = requestAnimationFrame(() => {
      setActiveAudioId(null);
      setLoadingAudioId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeChat?.id, stopMedia]);

  useEffect(() => {
    return () => {
      stopMedia();
    };
  }, [stopMedia]);

  const handleToggleReadAloud = useCallback(
    async (id: string, text: string) => {
      if (activeAudioId === id || loadingAudioId === id) {
        stopAudio();
        return;
      }

      stopAudio();
      setLoadingAudioId(id);

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          audioBlobUrlRef.current = url;
          const audio = new Audio(url);
          audio.playbackRate = speed;
          audioElRef.current = audio;

          audio.onended = () => {
            stopAudio();
          };
          audio.onerror = () => {
            stopAudio();
          };

          setLoadingAudioId(null);
          setActiveAudioId(id);
          await audio.play();
          return;
        }
        throw new Error(`TTS status ${res.status}`);
      } catch {
        setLoadingAudioId(null);
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utteranceRef.current = utterance;
            utterance.rate = speed;
            utterance.pitch = 1.0;
            utterance.onend = () => {
              stopAudio();
            };
            utterance.onerror = () => {
              stopAudio();
            };
            setActiveAudioId(id);
            window.speechSynthesis.speak(utterance);
          } catch {
            stopAudio();
          }
        } else {
          stopAudio();
        }
      }
    },
    [activeAudioId, loadingAudioId, stopAudio, speed],
  );

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (q) {
      send(q);
      scrollToBottom("smooth");
    }
    e.currentTarget.reset();
  };

  const isOldChat = activeChat && activeChat.messages.length > 0 && activeChat.title !== "New conversation";

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2.5 rounded-2xl border-2 border-line bg-polar px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-sky" aria-hidden />
          <span className="truncate text-xs font-extrabold uppercase tracking-wider text-muted">Current chat:</span>
          <span className="truncate text-sm font-black text-ink">{activeChat?.title || "New conversation"}</span>
        </div>
        <span className="shrink-0 text-xs font-bold text-muted">
          {fmtSessionDate(activeChat?.updatedAt || activeChat?.createdAt || new Date().toISOString())}
        </span>
      </div>

      {isOldChat && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-sky/30 bg-sky-soft/40 px-3.5 py-2 text-xs">
          <span className="flex items-center gap-1.5 font-bold text-sky">
            <Clock size={14} aria-hidden />
            Viewing past conversation from {fmtSessionDate(activeChat.createdAt)}
          </span>
          <button
            onClick={onStartNew}
            className="font-extrabold text-sky hover:underline"
          >
            + Start new chat
          </button>
        </div>
      )}

      <ol className="space-y-4" aria-live="polite">
        {state.chat.length === 0 && (
          <Message
            id="greeting"
            m={{ role: "viva", text: VIVA.greeting(profile.sample ? profile.name : undefined) }}
            isPlaying={activeAudioId === "greeting"}
            isLoading={loadingAudioId === "greeting"}
            onToggleReadAloud={handleToggleReadAloud}
          />
        )}
        {state.chat.map((m, i) => (
          <Message
            key={i}
            id={`msg-${i}`}
            m={m}
            isPlaying={activeAudioId === `msg-${i}`}
            isLoading={loadingAudioId === `msg-${i}`}
            onToggleReadAloud={handleToggleReadAloud}
          />
        ))}
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
              <button onClick={() => send(s)} className="rounded-full border-2 border-line bg-white px-3 py-1.5 text-sm font-bold text-sky hover:border-sky/40">{s}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="sticky bottom-24 mt-6 z-30 md:bottom-6">
        {/* Simple down arrow go to bottom button right above chat interface */}
        <div className="pointer-events-none relative flex justify-center">
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            aria-label="Go to bottom"
            title="Go to bottom"
            className={`pointer-events-auto absolute -top-11 flex h-9 w-9 items-center justify-center rounded-full border-2 border-line bg-white text-sky shadow-md transition-all duration-200 hover:border-sky hover:bg-sky-soft hover:shadow-lg active:scale-95 ${
              isScrolledUp
                ? "translate-y-0 opacity-100 scale-100"
                : "pointer-events-none translate-y-2 opacity-0 scale-90"
            }`}
          >
            <ArrowDown size={18} strokeWidth={2.5} />
          </button>
        </div>

        <form onSubmit={submit} className="flex items-center gap-2 rounded-2xl border-2 border-line bg-white p-1.5 pl-4 shadow-xs focus-within:border-sky">
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
      </div>
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
  // The session lives in the app shell (VivaProvider), so leaving this page doesn't hang up:
  // the mini Viva in the sidebar picks the call up.
  const { voice: v, speed } = useViva();
  const actions: Action[] = [];
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
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button onClick={v.skip} disabled={v.state !== "speaking"} className="btn btn-ghost disabled:opacity-50" title="Skip what Viva is saying">
              <FastForward size={18} aria-hidden /> Skip
            </button>
            <button onClick={v.stop} className="btn btn-danger">
              <PhoneOff size={18} aria-hidden /> End
            </button>
          </div>
          <p className="mt-2 text-xs font-bold text-muted">Speed {speed.toFixed(2)}× · change it in the mini Viva settings</p>
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
