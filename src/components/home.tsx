"use client";

// Home is a route, not a dashboard. Like a map: where you are, the next three turns, one
// button each. Everything else (week, inbox, files) sits below in quiet sections.
// Every feature from the old Home is still here; it is reordered, not removed.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowUp, Check, ChevronRight, FileUp, Mail, X } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { VivaAvatar } from "@/components/Viva";
import { StatusMark } from "@/components/ui";
import { analyzeFile, toSource, type AnalyzeResult } from "@/lib/api";
import { googleCalendarUrl } from "@/lib/calendar";
import { moveText, reasonFor } from "@/lib/features";
import { inboxFor } from "@/lib/inbox";
import { planBlocks } from "@/lib/plan";
import { fmtDay, fmtTime, usePathway, type Block, type CourseView } from "@/lib/store";

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const greet = (h: number) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

// ---- 1. Greeting: one line of status, the course legend, the connection line ----------

export function Greeting() {
  const { profile, courses, now } = usePathway();
  const checkIns = courses.filter((c) => c.result.atRisk).length;
  return (
    <section>
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-balance md:text-[2.125rem]">
        {greet(now.getHours())}
        {profile.sample ? `, ${profile.name}` : ""}
      </h1>
      <p className="mt-1.5 text-muted">
        {courses.length - checkIns} of {courses.length} classes on track
        {checkIns > 0 && `, ${checkIns} worth a check-in`}
        {profile.streakDays > 0 && ` · ${profile.streakDays}-day streak`}
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {courses.map((c) => (
          <li key={c.slug}>
            <Link href={`/insights?course=${c.slug}`} className="flex items-center gap-2 rounded-xl border-2 border-line bg-white py-1.5 pl-2.5 pr-3.5 font-bold transition-colors hover:bg-polar">
              <StatusMark atRisk={c.result.atRisk} label={false} size={16} />
              {c.code}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- 2. The route: heads-up, then three turns ----------------------------------------

type Turn = { when: string; title: string; detail?: string; action: { label: string; href?: string; onClick?: () => void; primary?: boolean } };

function buildTurns(args: {
  now: Date;
  focus: CourseView | undefined;
  courses: CourseView[];
  todos: { id: string; title: string; detail: string; href: string; due?: string }[];
  done: Record<string, boolean>;
  blocks: Block[];
  completeBlock: (b: Block) => void;
  makeReal: (blocks: Omit<Block, "id" | "done">[]) => void;
}): Turn[] {
  const { now, focus, todos, done, blocks, completeBlock, makeReal } = args;
  const turns: Turn[] = [];

  // Turn 1: the nearest hard deadline.
  const due = todos.filter((t) => !done[t.id] && t.due).sort((a, b) => a.due!.localeCompare(b.due!))[0];
  if (due) {
    const d = new Date(due.due!);
    turns.push({ when: sameDay(d, now) ? `Today, ${fmtTime(due.due!)}` : fmtDay(due.due!), title: due.title, action: { label: "Open", href: due.href } });
  }

  // Turn 2: the next planned block, or the one change that would help most, as a plan.
  const next = blocks.filter((b) => !b.done).sort((a, b) => a.at.localeCompare(b.at))[0];
  if (next) {
    turns.push({ when: `${fmtDay(next.at)}, ${fmtTime(next.at)}`, title: next.title, action: { label: "Done", onClick: () => completeBlock(next), primary: true } });
  } else if (focus?.rec) {
    const planned = planBlocks(focus, focus.rec.moves, now);
    turns.push({
      when: planned[0] ? `${fmtDay(planned[0].at)}, ${fmtTime(planned[0].at)}` : "This week",
      title: focus.rec.moves.map(moveText).join(" and "),
      detail: `${planned.length} study ${planned.length === 1 ? "block" : "blocks"} before the ${focus.exam.title.toLowerCase()}. Similar students often end up on track.`,
      action: { label: "Put it on my calendar", onClick: () => makeReal(planned), primary: true },
    });
  }

  // Turn 3: a short practice step for the focus course.
  if (focus) {
    turns.push({ when: "5 minutes, any time", title: `${focus.code} practice quiz`, action: { label: "Quiz", href: `/study?tool=quiz&course=${focus.slug}` } });
  }
  return turns.slice(0, 3);
}

export function Route() {
  const { courses, now, profile, state, completeBlock, makeReal, suggestions } = usePathway();
  const focus = [...courses].filter((c) => c.result.atRisk).sort((a, b) => a.daysToExam - b.daysToExam)[0] ?? [...courses].sort((a, b) => a.daysToExam - b.daysToExam)[0];
  const turns = buildTurns({ now, focus, courses, todos: profile.todos, done: state.done, blocks: state.blocks, completeBlock, makeReal });

  return (
    <section className="panel p-5 md:p-6" aria-labelledby="route">
      {focus && (
        <div className="flex items-start gap-3">
          <span className="mt-1"><StatusMark atRisk={focus.result.atRisk} label={false} size={22} /></span>
          <div className="min-w-0">
            <h2 id="route" className="text-xl font-extrabold leading-snug">
              {focus.code} is {focus.result.atRisk ? "worth a check-in" : "on track"}
              <span className="font-bold text-muted"> · {focus.exam.title} {fmtDay(focus.exam.date)}, in {focus.daysToExam} {focus.daysToExam === 1 ? "day" : "days"}</span>
            </h2>
            <p className="mt-1 text-muted">{reasonFor(focus.steps)}</p>
          </div>
        </div>
      )}

      <ol className="mt-5">
        {turns.map((t, i) => (
          <li key={t.title} className="relative flex gap-4 pb-5 last:pb-0">
            {i < turns.length - 1 && <span className="absolute left-[9px] top-6 bottom-0 border-l-2 border-dotted border-line" aria-hidden />}
            <span className={`mt-1.5 grid size-5 shrink-0 place-items-center rounded-full border-[3px] bg-white ${i === 0 ? "border-ink" : "border-line"}`} aria-hidden>
              {i === 0 && <span className="size-1.5 rounded-full bg-ink" />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-muted">{t.when}</p>
                <p className="font-extrabold leading-snug">{t.title}</p>
                {t.detail && <p className="text-sm text-muted">{t.detail}</p>}
              </div>
              {t.action.href ? (
                <Link href={t.action.href} className={`btn min-h-10 shrink-0 px-4 text-xs ${t.action.primary ? "btn-primary" : "btn-ghost"}`}>{t.action.label}</Link>
              ) : (
                <button onClick={t.action.onClick} className={`btn min-h-10 shrink-0 px-4 text-xs ${t.action.primary ? "btn-primary" : "btn-ghost"}`}>{t.action.label}</button>
              )}
            </div>
          </li>
        ))}
      </ol>

      {focus && (
        <p className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t-2 border-line pt-4 text-sm font-bold">
          <Link href={`/insights?course=${focus.slug}`} className="text-teal underline underline-offset-4">Why this route</Link>
          {suggestions.length > 0 && (
            <Link href="/calendar" className="text-sky underline underline-offset-4">
              {suggestions.length === 1 ? "A better slot for one block" : `${suggestions.length} changes to your week`} · review
            </Link>
          )}
        </p>
      )}
    </section>
  );
}

// ---- 3. Ask Viva: one line -----------------------------------------------------------

export function AskLine() {
  const { ask: askViva } = usePathway();
  const router = useRouter();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (!q) return;
    askViva(q);
    router.push("/viva");
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-3 rounded-2xl border-2 border-line bg-white p-1.5 pl-2 focus-within:border-sky" aria-label="Ask Viva">
      <VivaAvatar size={36} state="idle" />
      <label htmlFor="q" className="sr-only">Ask Viva</label>
      <input id="q" name="q" autoComplete="off" placeholder="Ask Viva: what should I do first?" className="min-w-0 flex-1 bg-transparent py-2 font-bold outline-none placeholder:text-muted" />
      <button className="btn btn-sky min-h-10 px-3" aria-label="Send">
        <ArrowUp size={18} strokeWidth={3} />
      </button>
    </form>
  );
}

// ---- 4. This week: calendar strip, today, to-dos --------------------------------------

export function WeekPanel() {
  const { now, state, profile, checkIn, toggleTodo, googleOn } = usePathway();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const blocksOn = (d: Date) => state.blocks.filter((b) => sameDay(new Date(b.at), d));
  // Locally added classes may also arrive from the database; keep one of each.
  const same = (a: { course: string; at: string }, b: { course: string; at: string }) => a.course === b.course && +new Date(a.at) === +new Date(b.at);
  const classes = [...profile.classes, ...state.addedClasses.filter((c) => !profile.classes.some((p) => same(p, c)))].filter((c) => sameDay(new Date(c.at), now));
  const today = [
    ...classes.map((c) => ({ at: c.at, kind: "class" as const, title: c.title, course: c.course })),
    ...blocksOn(now).map((b) => ({ at: b.at, kind: "study" as const, title: b.title, course: b.course })),
    ...profile.todos.filter((t) => t.due && sameDay(new Date(t.due), now)).map((t) => ({ at: t.due!, kind: "due" as const, title: t.title, course: "" })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const later = profile.todos.filter((t) => !(t.due && sameDay(new Date(t.due), now)));
  const planned = state.blocks.length;
  const done = state.blocks.filter((b) => b.done).length;

  return (
    <section aria-labelledby="this-week">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="this-week" className="font-extrabold">This week</h2>
        <Link href="/calendar" className="text-sm font-bold text-teal underline underline-offset-4">{planned > 0 ? `${done} of ${planned} blocks done` : "Open week"}</Link>
      </div>
      <ol className="mt-3 grid grid-cols-7 text-center">
        {days.map((d) => {
          const bs = blocksOn(d);
          const isToday = sameDay(d, now);
          return (
            <li key={d.toISOString()} className="flex flex-col items-center gap-1">
              <span className="text-xs font-bold text-muted">{d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2)}</span>
              <span className={`grid size-8 place-items-center rounded-full text-sm font-extrabold tabular-nums ${isToday ? "bg-ink text-white" : ""}`}>{d.getDate()}</span>
              <span className="flex h-1.5 gap-0.5" aria-hidden>
                {bs.map((b) => (
                  <span key={b.id} className={`size-1.5 rounded-full ${b.done ? "bg-teal-face" : "border-2 border-teal-face"}`} />
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      <h3 className="mb-1 mt-4 text-sm font-bold text-muted">Today</h3>
      {today.length === 0 ? (
        <p className="text-muted">Nothing scheduled.</p>
      ) : (
        <ul>
          {today.map((a) => (
            <li key={a.at + a.title} className="flex items-center gap-3 py-1.5">
              <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums text-muted">{fmtTime(a.at)}</span>
              <span className="min-w-0 flex-1 font-bold leading-snug">{a.title}</span>
              {a.kind === "class" &&
                (state.checkedIn[a.at] ? (
                  <span className="flex items-center gap-1 text-sm font-bold text-teal"><Check size={15} strokeWidth={3} aria-hidden /> Here</span>
                ) : (
                  <button onClick={() => checkIn(a.course, a.at)} className="btn btn-ghost min-h-8 px-2.5 text-xs">Check in</button>
                ))}
              {a.kind === "due" && <span className="text-xs font-bold text-sun-ink">Due</span>}
            </li>
          ))}
        </ul>
      )}
      {later.length > 0 && (
        <>
          <h3 className="mb-1 mt-4 text-sm font-bold text-muted">To do</h3>
          <ul>
            {later.map((t) => {
              const isDone = !!state.done[t.id];
              return (
                <li key={t.id} className="flex items-center gap-3 py-1.5">
                  <button onClick={() => toggleTodo(t.id)} aria-pressed={isDone} aria-label={isDone ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`} className={`grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${isDone ? "animate-[pop_250ms_ease-out] border-[#109c8a] bg-teal-face text-teal-ink" : "border-line bg-white hover:bg-polar"}`}>
                    {isDone && <Check size={14} strokeWidth={4} />}
                  </button>
                  <Link href={t.href} className="group flex min-w-0 flex-1 items-center gap-2">
                    <span className={`min-w-0 flex-1 font-bold leading-snug ${isDone ? "text-muted line-through" : ""}`}>{t.title}</span>
                    <ChevronRight size={18} className="shrink-0 text-muted/50 group-hover:text-muted" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {planned > 0 && !googleOn && (
        <p className="mt-3 text-sm">
          <a href={googleCalendarUrl(state.blocks.find((b) => !b.done) ?? state.blocks[0])} target="_blank" rel="noreferrer" className="font-bold text-teal underline underline-offset-4">Add next block to Google Calendar</a>
        </p>
      )}
    </section>
  );
}

// ---- 5. Inbox: course mail only --------------------------------------------------------

export function InboxPanel() {
  const { courses } = usePathway();
  const mail = inboxFor(courses.map((c) => c.code));
  const unread = mail.filter((m) => m.unread).length;
  const reply = mail.filter((m) => m.unread && m.needsReply).length;
  return (
    <section aria-labelledby="inbox">
      <h2 id="inbox" className="font-extrabold">Inbox</h2>
      <Link href="/inbox" className="group mt-2 flex items-center gap-3 rounded-2xl border-2 border-line px-4 py-3 hover:bg-polar">
        <Mail size={20} className={`shrink-0 ${unread ? "text-sky" : "text-muted"}`} aria-hidden />
        <span className="min-w-0 flex-1 font-bold">
          {unread === 0 ? "No unread course mail" : `${unread} unread from your classes`}
          {reply > 0 && <span className="font-semibold text-muted"> · {reply} {reply === 1 ? "needs" : "need"} a reply</span>}
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted/50 group-hover:text-muted" aria-hidden />
      </Link>
    </section>
  );
}

// ---- 6. Files: drop a syllabus or a Gradescope page; Gemini reads it, you confirm ---------

const ACCEPT = [".pdf", ".png", ".jpg", ".jpeg", ".txt", ".csv"];
type Pending = { id: number; name: string; course: string; status: "reading" | "ready" | "error"; result?: AnalyzeResult; error?: string };

export function Files() {
  const { courses, state, addSource, removeSource } = usePathway();
  const [over, setOver] = useState(false);
  const [items, setItems] = useState<Pending[]>([]);

  const take = (list: FileList | null) => {
    if (!list) return;
    for (const f of Array.from(list)) {
      if (!ACCEPT.some((ext) => f.name.toLowerCase().endsWith(ext))) {
        setItems((xs) => [...xs, { id: Date.now() + Math.random(), name: f.name, course: "", status: "error", error: "Export slides or docs to PDF first." }]);
        continue;
      }
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs, { id, name: f.name, course: courses[0]?.slug ?? "", status: "reading" }]);
      analyzeFile(f, { courses: courses.map((c) => c.code) })
        .then((result) => {
          const guess = courses.find((c) => result.classification.course_guess.toUpperCase().includes(c.code))?.slug;
          setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status: "ready", result, course: guess ?? x.course } : x)));
        })
        .catch((e: Error) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status: "error", error: e.message } : x))));
    }
  };
  const confirm = (p: Pending) => {
    const course = courses.find((c) => c.slug === p.course);
    if (!p.result || !course) return;
    const src = toSource(p.result, course.code);
    if (src) addSource(src);
    setItems((xs) => xs.filter((x) => x.id !== p.id));
  };
  const summary = (r: AnalyzeResult) => {
    if (r.syllabus) return `Syllabus · ${r.syllabus.deadlines.length} dates, grading, policies`;
    if (r.grades) return `Grades · ${r.grades.items.length} items${r.grades.average_percent != null ? `, avg ${r.grades.average_percent}%` : ""}`;
    if (r.study) return `${r.classification.kind} · ${r.study.quiz.length} quiz questions ready`;
    if (r.insights) return `Dataset · ${r.profile?.rows} rows`;
    return r.classification.kind;
  };

  return (
    <section aria-labelledby="files">
      <h2 id="files" className="font-extrabold">Files</h2>
      <label
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), take(e.dataTransfer.files))}
        className={`mt-2 flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 transition-colors ${over ? "border-teal bg-teal-soft" : "border-line hover:bg-polar"}`}
      >
        <FileUp size={22} strokeWidth={2.4} className="shrink-0 text-teal" aria-hidden />
        <span className="min-w-0">
          <span className="block font-bold">Drop a syllabus, slides, or your Gradescope page</span>
          <span className="block text-sm text-muted">Gemini reads it; you confirm the course before it counts.</span>
        </span>
        <input type="file" multiple accept={ACCEPT.join(",")} className="sr-only" onChange={(e) => take(e.target.files)} />
      </label>

      {(items.length > 0 || state.sources.length > 0) && (
        <ul className="mt-2" aria-live="polite">
          {items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
              {p.status === "reading" && (
                <span className="flex items-center gap-1.5 text-muted"><ThinkingOrb state="solving" size={20} theme="light" color="#1a6fd1" aria-hidden /> Reading…</span>
              )}
              {p.status === "error" && <span className="text-sun-ink">{p.error}</span>}
              {p.status === "ready" && p.result && (
                <>
                  <span className="text-muted">{summary(p.result)}</span>
                  <label className="sr-only" htmlFor={`c${p.id}`}>Course</label>
                  <select id={`c${p.id}`} value={p.course} onChange={(e) => setItems((xs) => xs.map((x) => (x.id === p.id ? { ...x, course: e.target.value } : x)))} className="rounded-lg border-2 border-line bg-white px-2 py-1 font-bold">
                    {courses.map((c) => <option key={c.slug} value={c.slug}>{c.code}</option>)}
                  </select>
                  <button onClick={() => confirm(p)} className="font-extrabold text-teal">Confirm</button>
                </>
              )}
              <button onClick={() => setItems((xs) => xs.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.name}`} className="text-muted hover:text-ink"><X size={16} /></button>
            </li>
          ))}
          {state.sources.map((s, i) => (
            <li key={`${s.kind}-${s.course}-${s.title}`} className="flex items-center gap-2 py-2 text-sm">
              <Check size={15} strokeWidth={3} className="shrink-0 text-teal" aria-hidden />
              <span className="min-w-0 flex-1 truncate"><span className="font-bold">{s.title}</span> <span className="text-muted">· {s.kind} · {s.course}</span></span>
              <button onClick={() => removeSource(i)} aria-label={`Remove ${s.title}`} className="text-muted hover:text-ink"><X size={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- Onboarding (judge profile) ------------------------------------------------------------

export function Onboarding() {
  const { addJudgeCourse } = usePathway();
  return (
    <section className="panel mx-auto max-w-2xl p-6 md:p-8" aria-labelledby="start">
      <h1 id="start" className="text-[1.75rem] font-extrabold leading-tight">Let&apos;s set up your semester</h1>
      <p className="mt-2 text-muted">Moodle, Gradescope and Gmail are connected. Add one course to start your route.</p>
      <button onClick={addJudgeCourse} className="btn btn-primary mt-5">Add BIO 181 from its syllabus</button>
      <p className="mt-3 text-sm text-muted">Pathway saves your courses and study activity, never your status.</p>
    </section>
  );
}
