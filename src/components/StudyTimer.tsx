"use client";

// The 25-minute focus timer, app-wide. It lives in the app shell, so leaving Study's Timer tab (for the quiz,
// flashcards or any page) doesn't stop it: it keeps exact time against an end timestamp, survives a reload,
// and logs the study session when it ends. Away from the Timer tab it shows as a small pinned square that
// can be dragged to any corner of the content area (it glides to the nearest one) and closed with ×.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Check, Pause, Play, Timer, X } from "lucide-react";
import { usePathway } from "@/lib/store";

export const FOCUS_SECONDS = 25 * 60;
type Status = "idle" | "running" | "paused" | "done";
/** `at`: when it last changed (real ms, newest wins across devices). `by`: the device that started it, which logs it. */
type Saved = { status: Status; course: string; endsAt: number; left: number; at: number; by: string };
const IDLE: Saved = { status: "idle", course: "", endsAt: 0, left: FOCUS_SECONDS, at: 0, by: "" };
const POLL_MS = 5000;

type TimerCtx = {
  status: Status;
  course: string;
  left: number; // seconds
  start: (course: string) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void; // back to 25:00, idle
  stop: () => void; // the pinned ×: end without logging
  logNow: (course: string) => void; // "Log 25 min now"
};
const Ctx = createContext<TimerCtx | null>(null);
export const useStudyTimer = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStudyTimer outside StudyTimerProvider");
  return c;
};

/** This browser's id, so only the device that started a session logs it (two open devices never log it twice). */
function deviceId() {
  try {
    let id = localStorage.getItem("pathway:device-id");
    if (!id) localStorage.setItem("pathway:device-id", (id = Math.random().toString(36).slice(2, 10)));
    return id;
  } catch {
    return "this-device";
  }
}
const localKey = (profile: string) => `pathway:focus-timer:${profile}`;
const readLocal = (profile: string): Saved | null => {
  try {
    const s = JSON.parse(localStorage.getItem(localKey(profile)) ?? "null");
    return s && typeof s.status === "string" && typeof s.at === "number" ? s : null;
  } catch {
    return null;
  }
};

/** One timer per profile, shared by every device through /api/timer (Reset stops it everywhere). */
export function StudyTimerProvider({ children }: { children: ReactNode }) {
  const { profile } = usePathway();
  return (
    <TimerFor key={profile?.id ?? "none"} profileId={profile?.id ?? ""}>
      {children}
    </TimerFor>
  );
}

function TimerFor({ profileId, children }: { profileId: string; children: ReactNode }) {
  const { logSession } = usePathway();
  const [t, setT] = useState<Saved>(() => (profileId && readLocal(profileId)) || IDLE);
  const [, tick] = useState(0);
  const logRef = useRef(logSession);
  useEffect(() => {
    logRef.current = logSession;
  });
  useEffect(() => {
    if (!profileId) return;
    try {
      localStorage.setItem(localKey(profileId), JSON.stringify(t));
    } catch {}
  }, [t, profileId]);

  // A change made here: stamp it, keep it, and tell the other devices.
  const commit = (next: Omit<Saved, "at">) => {
    const s = { ...next, at: Date.now() };
    setT(s);
    if (profileId) void fetch("/api/timer", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile_id: profileId, state: s }) }).catch(() => {});
  };

  // What other devices did (start, pause, stop, Reset): poll, and when the window comes back to the front.
  useEffect(() => {
    if (!profileId) return;
    let live = true;
    const pull = () =>
      fetch(`/api/timer?profile_id=${encodeURIComponent(profileId)}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ state: Saved } | null>) : null))
        .then((r) => live && r?.state && setT((cur) => (r.state.at > cur.at ? r.state : cur)))
        .catch(() => {});
    void pull();
    const id = window.setInterval(() => document.visibilityState === "visible" && void pull(), POLL_MS);
    window.addEventListener("focus", pull);
    return () => {
      live = false;
      clearInterval(id);
      window.removeEventListener("focus", pull);
    };
  }, [profileId]);

  // While running: re-render each second, and finish when the end time passes. Only the device that started
  // the session logs it (and tells the others it's done); another device just shows it finished.
  useEffect(() => {
    if (t.status !== "running") return;
    const id = window.setInterval(() => {
      if (Date.now() < t.endsAt) return tick((n) => n + 1);
      if (t.by === deviceId()) {
        commit({ ...t, status: "done", left: 0 });
        if (t.course) logRef.current(t.course);
      } else setT((x) => (x.status === "running" ? { ...x, status: "done", left: 0 } : x));
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.status, t.endsAt, t.course, t.by]);

  // Viva's start_timer (src/lib/store.tsx execute) asks for a session for a course.
  const startRef = useRef<(course: string) => void>(() => {});
  useEffect(() => {
    const on = (e: Event) => {
      const course = (e as CustomEvent<{ course: string }>).detail?.course;
      if (course) startRef.current(course);
    };
    window.addEventListener("pathway:start-timer", on);
    return () => window.removeEventListener("pathway:start-timer", on);
  }, []);

  // eslint-disable-next-line react-hooks/purity -- the running timer reads the clock on purpose; it re-renders every second
  const left = t.status === "running" ? Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000)) : t.left;
  const value: TimerCtx = {
    status: t.status,
    course: t.course,
    left,
    start: (course) => commit({ status: "running", course, endsAt: Date.now() + FOCUS_SECONDS * 1000, left: FOCUS_SECONDS, by: deviceId() }),
    pause: () => t.status === "running" && commit({ ...t, status: "paused", left: Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000)) }),
    resume: () => t.status === "paused" && commit({ ...t, status: "running", endsAt: Date.now() + t.left * 1000 }),
    reset: () => commit({ ...IDLE, course: t.course }),
    stop: () => commit({ ...IDLE, course: t.course }),
    logNow: (course) => {
      commit({ status: "done", course, endsAt: 0, left: FOCUS_SECONDS, by: deviceId() });
      logRef.current(course);
    },
  };
  useEffect(() => {
    startRef.current = value.start;
  });
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The planned block a finished session most likely belongs to: this course's unfinished study block nearest the
 * demo clock's "now", today first. Null when there's none (then nothing is offered).
 */
export function useBlockToMark(course: string) {
  const { state, now } = usePathway();
  const day = now.toDateString();
  const open = state.blocks.filter((b) => !b.done && b.course === course);
  const dist = (b: { at: string }) => Math.abs(new Date(b.at).getTime() - now.getTime());
  return [...open].sort((a, b) => Number(new Date(b.at).toDateString() === day) - Number(new Date(a.at).toDateString() === day) || dist(a) - dist(b))[0] ?? null;
}

/** "Mark block done" after a finished session: one tap ties the focus time to the plan. */
export function MarkBlockDone({ course, compact = false }: { course: string; compact?: boolean }) {
  const { markBlockDone } = usePathway();
  const b = useBlockToMark(course);
  if (!b) return null;
  const when = new Date(b.at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  return (
    <button onClick={() => markBlockDone(b)} title={`Mark "${b.title}" (${when}) done`} className={`btn btn-primary min-h-8 w-full px-2 text-[11px] ${compact ? "" : "mt-3 min-h-10 w-auto px-4 text-xs"}`}>
      <Check size={13} strokeWidth={3} aria-hidden /> {compact ? "Mark block done" : `Mark "${b.title}" ${when} done`}
    </button>
  );
}

/**
 * The running timer on Beacon (the kiosk header): same shared timer as the laptop and phone, sized for touch.
 * Hidden when no timer is running.
 */
export function BeaconTimer() {
  const { status, course, left, pause, resume, stop } = useStudyTimer();
  const { courses } = usePathway();
  if (status === "idle") return null;
  const code = courses.find((c) => c.slug === course)?.code ?? "Focus";
  return (
    <div role="timer" aria-label={`Focus timer, ${code}: ${status === "done" ? "done" : `${clock(left)} ${status === "paused" ? "paused" : "left"}`}`} className="flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full border-2 border-line bg-white py-0.5 pl-3.5 pr-1 font-extrabold">
      {status === "done" ? <Check size={17} strokeWidth={3} className="text-teal" aria-hidden /> : <Timer size={17} strokeWidth={2.6} className="text-teal" aria-hidden />}
      <span className="tabular-nums text-ink">{status === "done" ? "Done" : clock(left)}</span>
      <span className="text-sm text-muted">· {code}</span>
      {status !== "done" && (
        <button onClick={status === "running" ? pause : resume} aria-label={status === "running" ? "Pause the focus timer" : "Resume the focus timer"} className="ml-1 grid size-9 place-items-center rounded-full text-teal hover:bg-polar">
          {status === "running" ? <Pause size={17} aria-hidden /> : <Play size={17} aria-hidden />}
        </button>
      )}
      <button onClick={stop} aria-label="Stop the focus timer" className="grid size-9 place-items-center rounded-full text-muted hover:bg-polar hover:text-ink">
        <X size={17} aria-hidden />
      </button>
    </div>
  );
}

export const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// ── The pinned square ────────────────────────────────────────────────────────────────────

type Corner = "tl" | "tr" | "bl" | "br";
const CORNER_KEY = "pathway:focus-timer-corner";
const SIZE = 136; // px, the square
const PAD = 16; // off the sidebar rail, the phone nav and the screen edges
// In a left corner, slide right with the sidebar when it opens (open width minus the rail, Sidebar.tsx), like
// Viva's dock, so it's never covered. The `translate` property stacks on the inline position transform.
const SLIDE = "md:[body:has(nav[data-open])_&]:translate-x-[11.5rem]";

/** Top-left of the square for a corner of the content area (right of the desktop rail, above the phone nav). */
function spot(c: Corner) {
  const desktop = window.innerWidth >= 768;
  const left = (desktop ? 72 : 0) + PAD; // the collapsed rail is 4.5rem (Sidebar.tsx RAIL)
  const right = window.innerWidth - PAD - SIZE;
  const top = (desktop ? 0 : 64) + PAD; // the phone header
  const navHeight = desktop ? 0 : document.querySelector('[aria-label="Mobile main"]')?.getBoundingClientRect().height ?? 72;
  const bottom = window.innerHeight - navHeight - PAD - SIZE;
  return { x: c.endsWith("l") ? left : right, y: c.startsWith("t") ? top : bottom };
}
const nearest = (x: number, y: number): Corner => {
  const cx = x + SIZE / 2 < window.innerWidth / 2 + (window.innerWidth >= 768 ? 36 : 0) ? "l" : "r";
  const cy = y + SIZE / 2 < window.innerHeight / 2 ? "t" : "b";
  return `${cy}${cx}` as Corner;
};

const noop = () => () => {};

export function PinnedTimer() {
  const { status, course, left, pause, resume, stop } = useStudyTimer();
  const { courses } = usePathway();
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const onTimerTab = path === "/study" && params.get("tool") === "timer";
  const [corner, setCorner] = useState<Corner>(() => {
    try {
      const c = localStorage.getItem(CORNER_KEY);
      return c === "tl" || c === "tr" || c === "bl" || c === "br" ? c : "br";
    } catch {
      return "br"; // clear of the demo banner up top and of Viva's dock, which opens bottom-left
    }
  });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const grab = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const [, relayout] = useState(0);
  useEffect(() => {
    const on = () => relayout((n) => n + 1);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(CORNER_KEY, corner);
    } catch {}
  }, [corner]);

  const toMark = useBlockToMark(course);
  // Only in the browser: the saved timer and corner come from localStorage, which the server render can't see.
  const live = useSyncExternalStore(noop, () => true, () => false);
  if (!live || status === "idle" || onTimerTab) return null;
  const code = courses.find((c) => c.slug === course)?.code ?? "Focus";
  const at = drag ?? spot(corner);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return; // × and pause stay plain buttons
    const p = spot(corner);
    grab.current = { dx: e.clientX - p.x, dy: e.clientY - p.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g) return;
    const x = e.clientX - g.dx;
    const y = e.clientY - g.dy;
    if (!g.moved && Math.hypot(x - spot(corner).x, y - spot(corner).y) < 4) return;
    g.moved = true;
    setDrag({ x: Math.min(window.innerWidth - SIZE, Math.max(0, x)), y: Math.min(window.innerHeight - SIZE, Math.max(0, y)) });
  };
  // A drag moves it (it glides to the nearest corner on release); a tap without moving opens the Timer tab.
  const open = () => router.push(`/study?tool=timer${course ? `&course=${course}` : ""}`);
  const up = () => {
    const g = grab.current;
    grab.current = null;
    if (g?.moved && drag) setCorner(nearest(drag.x, drag.y));
    else if (g) open();
    setDrag(null);
  };
  // Arrow keys move it between corners, for keyboard users.
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const v = corner[0], h = corner[1];
    const next = e.key === "ArrowUp" ? `t${h}` : e.key === "ArrowDown" ? `b${h}` : e.key === "ArrowLeft" ? `${v}l` : e.key === "ArrowRight" ? `${v}r` : null;
    if (e.key === "Enter" && e.target === e.currentTarget) return open();
    if (!next) return;
    e.preventDefault();
    setCorner(next as Corner);
  };

  return (
    <div
      role="timer"
      aria-label={`Focus timer, ${code}: ${clock(left)} ${status === "paused" ? "paused" : status === "done" ? "done" : "left"}. Press Enter to open the timer; arrow keys move it to another corner.`}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      style={{ width: SIZE, height: SIZE, transform: `translate3d(${at.x}px, ${at.y}px, 0)` }}
      className={`fixed left-0 top-0 z-30 flex touch-none select-none flex-col rounded-2xl border-2 border-line bg-white p-3 shadow-[0_10px_30px_-12px_rgb(51_56_61/0.45)] ${drag ? "cursor-grabbing" : `cursor-grab transition-[transform,translate] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${corner.endsWith("l") ? SLIDE : ""}`}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-muted">
          <Timer size={13} className="shrink-0 text-teal" aria-hidden />
          <span className="truncate">{code}</span>
        </span>
        <button onClick={stop} aria-label="Stop the focus timer and close it" title="Stop and close" className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-polar hover:text-ink">
          <X size={15} aria-hidden />
        </button>
      </div>
      <p className="mt-1 flex flex-1 items-center justify-center text-[2rem] font-black tabular-nums tracking-tight">
        {status === "done" ? <Check size={30} strokeWidth={3} className="text-teal" aria-hidden /> : clock(left)}
      </p>
      {status === "done" ? (
        toMark ? <MarkBlockDone course={course} compact /> : <p className="text-center text-xs font-extrabold text-teal">Session logged</p>
      ) : (
        <button onClick={status === "running" ? pause : resume} className={`btn min-h-8 w-full px-2 text-[11px] ${status === "running" ? "btn-ghost" : "btn-primary"}`}>
          {status === "running" ? <><Pause size={13} aria-hidden /> Pause</> : <><Play size={13} aria-hidden /> Resume</>}
        </button>
      )}
    </div>
  );
}
