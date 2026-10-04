"use client";

// /device — the Raspberry Pi kiosk: a desk-companion screen for a 7" touchscreen
// (~1024×600, landscape, fullscreen, no browser chrome). No app chrome either (see
// components/Chrome). Left = the assistant: Viva's face, her read of the route, a
// voice-state/transcript area, and the Talk button. Right = live student status.
// Display-only for now: tapping Viva or the button opens the normal Viva page;
// mic/camera hardware hooks come later.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, BookOpen, Check, ChevronDown, Compass, Flag, Mic, Route as RouteIcon, TriangleAlert } from "lucide-react";
import { Wordmark } from "@/components/Sidebar";
import { VivaAvatar } from "@/components/Viva";
import { goalText } from "@/lib/features";
import { planBlocks } from "@/lib/plan";
import { fmtDay, fmtTime, usePathway, type CourseView } from "@/lib/store";

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

// The model knows two outcomes; the kiosk words them as a route. REROUTING = worth a
// check-in but a recovery block is already on the calendar; OFF TRACK = high risk and
// no plan yet; DRIFTING = worth a check-in and no plan yet.
type RouteStatus = "ON TRACK" | "DRIFTING" | "OFF TRACK" | "REROUTING";

const routeStatus = (c: CourseView, hasPlan: boolean): RouteStatus => {
  if (!c.result.atRisk) return "ON TRACK";
  if (hasPlan) return "REROUTING";
  return c.result.pRisk >= 0.75 ? "OFF TRACK" : "DRIFTING";
};

const statusTone: Record<RouteStatus, string> = {
  "ON TRACK": "text-teal",
  DRIFTING: "text-sun-ink",
  "OFF TRACK": "text-sun-ink",
  REROUTING: "text-sky",
};

// Viva's headline under the face: short, calm, never alarming.
const vivaLine: Record<RouteStatus, { line: string; sub: string }> = {
  "ON TRACK": { line: "You're on track.", sub: "Keep the streak going." },
  DRIFTING: { line: "You're drifting a little.", sub: "Let's get you back on track." },
  "OFF TRACK": { line: "You've gone off route.", sub: "The next step leads back." },
  REROUTING: { line: "Rerouting you.", sub: "Your new plan is on the week." },
};

function RouteMark({ status }: { status: RouteStatus }) {
  const s = 26;
  if (status === "DRIFTING")
    return <span className="shrink-0 rounded-full border-sun bg-sun-soft" style={{ width: s, height: s, borderWidth: 6 }} aria-hidden />;
  const Icon = status === "ON TRACK" ? Check : status === "REROUTING" ? RouteIcon : TriangleAlert;
  const face = status === "ON TRACK" ? "bg-teal text-white" : status === "REROUTING" ? "bg-sky text-white" : "bg-sun text-sun-ink";
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${face}`} style={{ width: s, height: s }} aria-hidden>
      <Icon size={15} strokeWidth={3.2} />
    </span>
  );
}

function Card({
  icon: Icon,
  label,
  tone = "text-muted",
  children,
  className = "",
}: {
  icon: typeof Compass;
  label: string;
  tone?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={label} className={`panel flex min-h-0 flex-col justify-center p-4 ${className}`}>
      <p className="flex items-center gap-1.5 text-[0.68rem] font-extrabold uppercase tracking-widest text-muted">
        <Icon size={14} strokeWidth={2.8} className={tone} aria-hidden />
        {label}
      </p>
      {children}
    </section>
  );
}

// TEMP debug: verify the Pi's Chromium can open the Logitech Brio. Requests the
// camera on mount and shows a small live preview, bottom-right. Local display
// only — nothing is recorded, stored, or uploaded. Remove once hardware is proven.
export function CameraTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    Promise.resolve()
      .then(() => {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("navigator.mediaDevices is undefined (page needs HTTPS or localhost)");
        return navigator.mediaDevices.getUserMedia({ video: true });
      })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((e: unknown) => setErr(e instanceof Error ? `${e.name}: ${e.message}` : String(e)));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  return (
    <div className="fixed bottom-3 right-3 z-50 w-[220px] overflow-hidden rounded-xl border-2 border-line bg-black shadow-lg">
      <p className="px-2 py-1 text-[0.62rem] font-extrabold uppercase tracking-widest text-white">Camera Test</p>
      {err ? (
        <p role="alert" className="h-[140px] w-[220px] break-words p-2 text-xs font-bold leading-snug text-red-400">
          {err}
        </p>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="h-[140px] w-[220px] object-cover" />
      )}
    </div>
  );
}

export function Device() {
  const { courses, profile, state, now, vivaThinking } = usePathway();
  const params = useSearchParams();
  const router = useRouter();
  const c = courses.find((x) => x.slug === params.get("course")) ?? courses.find((x) => x.result.atRisk) ?? courses[0];

  if (!c)
    return (
      <main className="grid h-screen w-screen place-items-center overflow-hidden bg-polar p-6">
        <div className="panel max-w-md p-8 text-center">
          <div className="flex justify-center"><Wordmark /></div>
          <p className="mt-4 text-lg font-bold text-muted">No courses yet. Add one on the Home page first.</p>
        </div>
      </main>
    );

  // Course pill: one tap cycles to the next course — simplest possible touch control.
  const nextCourse = courses[(courses.findIndex((x) => x.slug === c.slug) + 1) % courses.length];

  // Next recommended action: the next planned recovery block, else the first block the
  // recourse plan would create, else a small always-available practice step.
  const nextBlock = state.blocks.filter((b) => !b.done && b.course === c.slug).sort((a, b) => a.at.localeCompare(b.at))[0];
  const planned = !nextBlock && c.rec ? planBlocks(c, c.rec.moves, now) : [];
  const action = nextBlock
    ? { title: nextBlock.title, when: `${fmtDay(nextBlock.at)} · ${fmtTime(nextBlock.at)}` }
    : planned[0]
      ? { title: planned[0].title, when: `${fmtDay(planned[0].at)} · ${fmtTime(planned[0].at)}` }
      : c.rec
        ? { title: c.rec.moves.map(goalText).join(" and "), when: "This week" }
        : { title: `${c.code} practice quiz`, when: "5 min, any time" };

  // Next checkpoint: the nearest due to-do, or the exam itself — whichever comes first.
  const due = profile.todos.filter((t) => !state.done[t.id] && t.due).sort((a, b) => a.due!.localeCompare(b.due!))[0];
  const checkpoint =
    due && new Date(due.due!) < new Date(c.exam.date)
      ? { title: due.title, when: `Due ${fmtDay(due.due!)}` }
      : { title: c.exam.title, when: `${fmtDay(c.exam.date)} · in ${c.daysToExam} ${c.daysToExam === 1 ? "day" : "days"}` };

  // Today's progress = today's agenda checked off: classes checked in, blocks done, to-dos done.
  const same = (a: { course: string; at: string }, b: { course: string; at: string }) => a.course === b.course && +new Date(a.at) === +new Date(b.at);
  const classesToday = [...profile.classes, ...state.addedClasses.filter((k) => !profile.classes.some((p) => same(p, k)))].filter((k) =>
    sameDay(new Date(k.at), now),
  );
  const blocksToday = state.blocks.filter((b) => sameDay(new Date(b.at), now));
  const dueToday = profile.todos.filter((t) => t.due && sameDay(new Date(t.due), now));
  const total = classesToday.length + blocksToday.length + dueToday.length;
  const done =
    classesToday.filter((k) => state.checkedIn[k.at]).length + blocksToday.filter((b) => b.done).length + dueToday.filter((t) => state.done[t.id]).length;
  const todayPct = total ? Math.round((done / total) * 100) : 0;

  const status = routeStatus(c, !!nextBlock);
  const risk = Math.round(c.result.pRisk * 100);
  const tone = statusTone[status];
  const { line, sub } = vivaLine[status];
  const last = state.chat.at(-1);

  return (
    // Kiosk hardening: exact 100vw×100vh, no scroll/overscroll, no text selection,
    // no long-press context menu, no tap highlight, no pinch zoom (viewport meta),
    // no cursor — this is a dedicated touchscreen, not a web page.
    <main
      onContextMenu={(e) => e.preventDefault()}
      className="flex h-screen w-screen cursor-none touch-manipulation select-none flex-col overflow-hidden overscroll-none bg-polar [-webkit-tap-highlight-color:transparent]"
    >
      <header className="flex items-center justify-between px-5 pb-3 pt-3.5">
        <Wordmark />
        <button
          onClick={() => nextCourse.slug !== c.slug && router.replace(`/device?course=${nextCourse.slug}`, { scroll: false })}
          aria-label={`Showing ${c.code}. Switch course.`}
          className="flex min-h-11 items-center gap-2 rounded-full border-2 border-line bg-white px-4 font-extrabold text-teal transition-colors hover:bg-polar"
        >
          <BookOpen size={17} strokeWidth={2.6} aria-hidden />
          {c.code}
          <ChevronDown size={16} strokeWidth={2.8} className="text-muted" aria-hidden />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-5 pb-5">
        {/* Left: the assistant. */}
        <section aria-label="Viva" className="panel flex min-h-0 flex-col items-center p-4 text-center">
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
            {/* Soft halo so the orb reads as a presence, not an image. */}
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 size-[240px] -translate-x-1/2 -translate-y-[58%] rounded-full"
              style={{ background: "radial-gradient(closest-side, var(--color-sky-soft), transparent)" }}
            />
            <Link href="/viva" aria-label="Talk to Viva" className="relative block">
              <VivaAvatar size={132} state={vivaThinking ? "thinking" : "idle"} />
            </Link>
            <h1 className={`relative mt-2 text-[1.6rem] font-black leading-tight tracking-tight text-balance ${tone}`}>{line}</h1>
            <p className="relative mt-0.5 font-bold text-muted">{sub}</p>
          </div>

          {/* Voice state + transcript preview; live once the mic lands. */}
          <div className="mt-3 w-full rounded-2xl bg-polar px-4 py-2.5 text-left">
            <p className="flex items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-widest text-muted">
              <span className={`size-2 rounded-full ${vivaThinking ? "animate-pulse bg-sky" : "bg-line"}`} aria-hidden />
              {vivaThinking ? "Viva is thinking" : "Voice idle"}
            </p>
            <p className="mt-0.5 truncate text-sm font-bold text-ink/80">
              {last ? `${last.role === "viva" ? "Viva: " : "You: "}${last.text}` : "Type for now — voice arrives with the mic."}
            </p>
          </div>

          <Link href="/viva" className="btn btn-sky mt-3 min-h-[60px] w-full rounded-2xl text-lg tracking-wider">
            <Mic size={24} strokeWidth={2.6} aria-hidden />
            Talk to Viva
          </Link>
        </section>

        {/* Right: live student status. */}
        <div className="grid min-h-0 grid-cols-2 grid-rows-3 gap-3">
          <Card icon={RouteIcon} label="Route" tone={tone}>
            <p className={`mt-1.5 flex items-center gap-2 text-xl font-black leading-tight ${tone}`}>
              <RouteMark status={status} />
              {status}
            </p>
            <p className="mt-0.5 truncate text-sm font-bold text-muted">{c.result.atRisk ? "Worth a check-in" : "On track"}</p>
          </Card>

          <Card icon={TriangleAlert} label="Risk" tone={tone}>
            <p className={`mt-1 text-3xl font-black leading-none tabular-nums ${tone}`}>
              {risk}
              <span className="text-lg">%</span>
            </p>
            <p className="mt-1 truncate text-sm font-bold text-muted">
              {c.exam.title} in {c.daysToExam}d
            </p>
          </Card>

          <Card icon={Compass} label="Next action" tone="text-teal" className="col-span-2">
            <p className="mt-1.5 line-clamp-2 text-xl font-black leading-snug text-balance">{action.title}</p>
            <p className="mt-0.5 truncate font-bold text-teal">{action.when}</p>
          </Card>

          <Card icon={Flag} label="Checkpoint">
            <p className="mt-1.5 line-clamp-2 text-xl font-black leading-snug">{checkpoint.title}</p>
            <p className="mt-0.5 truncate text-sm font-bold text-muted">{checkpoint.when}</p>
          </Card>

          <Card icon={BarChart3} label="Today" tone="text-teal">
            <p className="mt-1 text-3xl font-black leading-none tabular-nums text-teal">{total ? `${todayPct}%` : "—"}</p>
            <span className="mt-2 block h-2.5 w-full overflow-hidden rounded-full bg-line" role="presentation">
              <span className="block h-full rounded-full bg-teal-face" style={{ width: `${total ? todayPct : 0}%` }} />
            </span>
            <p className="mt-1 truncate text-sm font-bold text-muted">{total ? `${done} of ${total} done` : "Free day"}</p>
          </Card>
        </div>
      </div>
    </main>
  );
}
