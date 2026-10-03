"use client";

// /device — the Raspberry Pi kiosk: a desk-companion screen for a 7" touchscreen
// (~1024×600, landscape). No app chrome (see components/Chrome). Viva is the
// centerpiece; the route data sits under her as flat glanceable stats. Display-only
// for now: tapping Viva or the button opens the normal Viva page; mic/camera
// hardware hooks come later.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, ChevronDown, Compass, Flag, BarChart3, Mic, Route as RouteIcon, TriangleAlert } from "lucide-react";
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

// Viva's one-liner under the face: short, calm, never alarming.
const vivaLine: Record<RouteStatus, { line: string; sub: string }> = {
  "ON TRACK": { line: "You're on track.", sub: "Keep the streak going." },
  DRIFTING: { line: "You're drifting a little.", sub: "Let's get you back on track." },
  "OFF TRACK": { line: "You've gone off route.", sub: "The next step below leads back." },
  REROUTING: { line: "Rerouting you.", sub: "Your new plan is already on the week." },
};

function Stat({
  icon: Icon,
  label,
  tone = "text-ink",
  value,
  sub,
  children,
}: {
  icon: typeof Compass;
  label: string;
  tone?: string;
  value: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 px-4">
      <p className="flex items-center gap-1.5 text-[0.68rem] font-extrabold uppercase tracking-widest text-muted">
        <Icon size={14} strokeWidth={2.8} className={tone} aria-hidden />
        {label}
      </p>
      <p className={`mt-1.5 line-clamp-2 text-[1.05rem] font-black leading-snug ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-sm font-bold text-muted">{sub}</p>}
      {children}
    </div>
  );
}

export function Device() {
  const { courses, profile, state, now } = usePathway();
  const params = useSearchParams();
  const router = useRouter();
  const c = courses.find((x) => x.slug === params.get("course")) ?? courses.find((x) => x.result.atRisk) ?? courses[0];

  if (!c)
    return (
      <main className="grid min-h-dvh place-items-center bg-polar p-6">
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

  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="flex items-center justify-between px-5 pt-4">
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

      <section className="relative flex min-h-0 flex-1 flex-col items-center justify-center" aria-label="Viva">
        {/* Soft halo so the orb reads as a presence, not an image. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 size-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(closest-side, var(--color-sky-soft), transparent)" }}
        />
        <Link href="/viva" aria-label="Talk to Viva" className="relative block">
          <VivaAvatar size={150} state="idle" />
        </Link>
        <h1 className="relative mt-3 text-center text-2xl font-black tracking-tight text-balance">{line}</h1>
        <p className="relative mt-0.5 text-center font-bold text-muted">{sub}</p>
      </section>

      <section aria-label="Your route today" className="flex divide-x-2 divide-line px-5 pb-4">
        <Stat icon={RouteIcon} label="Route" tone={tone} value={status} sub={c.result.atRisk ? "Worth a check-in" : "On track"} />
        <Stat icon={TriangleAlert} label="Risk" tone={tone} value={`${risk}%`} sub={`${c.exam.title} in ${c.daysToExam}d`} />
        <Stat icon={Compass} label="Next action" tone="text-teal" value={action.title} sub={action.when} />
        <Stat icon={Flag} label="Checkpoint" value={checkpoint.title} sub={checkpoint.when} />
        <Stat icon={BarChart3} label="Today" tone="text-teal" value={total ? `${todayPct}%` : "—"} sub={total ? `${done} of ${total} done` : "Free day"}>
          <span className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-line" role="presentation">
            <span className="block h-full rounded-full bg-teal-face" style={{ width: `${total ? todayPct : 0}%` }} />
          </span>
        </Stat>
      </section>

      <footer className="px-5 pb-5">
        <Link href="/viva" className="btn btn-sky min-h-[68px] w-full rounded-2xl text-xl tracking-wider">
          <Mic size={26} strokeWidth={2.6} aria-hidden />
          Talk to Viva
        </Link>
      </footer>
    </main>
  );
}
