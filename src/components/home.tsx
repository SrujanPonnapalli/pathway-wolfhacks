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
import { PageHeader, SectionHeading, StatusMark } from "@/components/ui";
import { googleCalendarUrl } from "@/lib/calendar";
import { isSampleSource } from "@/lib/knowledge/sample";
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
      <PageHeader
        className="mb-4!"
        title={`${greet(now.getHours())}${profile.sample ? `, ${profile.name}` : ""}`}
        lead={`${courses.length - checkIns} of ${courses.length} classes on track${checkIns > 0 ? `, ${checkIns} worth a check-in` : ""}${profile.streakDays > 0 ? ` · ${profile.streakDays}-day streak` : ""}`}
      />
      <ul className="flex flex-wrap gap-2">
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

  // Turn 1: the nearest hard deadline still ahead.
  const due = todos.filter((t) => !done[t.id] && t.due && new Date(t.due) >= now).sort((a, b) => +new Date(a.due!) - +new Date(b.due!))[0];
  if (due) {
    const d = new Date(due.due!);
    turns.push({ when: sameDay(d, now) ? `Today, ${fmtTime(due.due!)}` : fmtDay(due.due!), title: due.title, action: { label: "Open", href: due.href } });
  }

  // Turn 2: the next planned block (the first one still ahead), or the one change that would help most, as a plan.
  const open = blocks.filter((b) => !b.done).sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const next = open.find((b) => new Date(b.at).getTime() >= now.getTime() - 50 * 60_000) ?? open[0];
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
            <h2 id="route" className="text-xl font-black leading-snug">
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

type TodayItem = { at: string; kind: "class" | "study" | "due" | "exam" | "other"; title: string; course: string };

export function WeekPanel() {
  const { now, state, profile, checkIn, toggleTodo, googleOn, events } = usePathway();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const blocksOn = (d: Date) => state.blocks.filter((b) => sameDay(new Date(b.at), d));
  // Today is the week itself, for one day: classes, exams, study blocks, due dates, work and
  // whatever Google Calendar holds, so a change Viva makes shows here the moment it's made.
  const minute = (iso: string) => Math.floor(new Date(iso).getTime() / 60_000);
  const sameSlot = (a: { course: string; at: string }, b: { course: string; at: string }) => a.course === b.course && minute(a.at) === minute(b.at);
  const fromWeek: TodayItem[] = events
    .filter((e) => sameDay(new Date(e.start), now))
    .map((e) => ({ at: e.start, kind: e.kind === "class" || e.kind === "study" || e.kind === "exam" ? e.kind : e.title.startsWith("Due:") ? "due" : "other", title: e.title.replace(/^Due:\s*/, ""), course: e.course ?? "" }));
  // The profile's own class meetings (what check-in is for), unless the week already lists that meeting.
  const meetings: TodayItem[] = [...profile.classes, ...state.addedClasses]
    .filter((c) => sameDay(new Date(c.at), now))
    .map((c) => ({ at: c.at, kind: "class" as const, title: c.title, course: c.course }));
  const today = [...fromWeek, ...meetings.filter((m) => !fromWeek.some((e) => sameSlot(e, m)))]
    .filter((item, i, all) => all.findIndex((x) => x.title.toLowerCase() === item.title.toLowerCase() && minute(x.at) === minute(item.at)) === i)
    .sort((a, b) => minute(a.at) - minute(b.at));
  const checkedIn = (at: string) => Object.keys(state.checkedIn).some((k) => state.checkedIn[k] && minute(k) === minute(at));
  const later = profile.todos.filter((t) => !(t.due && sameDay(new Date(t.due), now)));
  const planned = state.blocks.length;
  const done = state.blocks.filter((b) => b.done).length;
  const past = (at: string) => new Date(at).getTime() + 50 * 60_000 < now.getTime();

  return (
    <section aria-labelledby="this-week">
      <SectionHeading id="this-week" action={{ href: "/calendar", label: planned > 0 ? `${done} of ${planned} blocks done` : "Open week" }}>
        This week
      </SectionHeading>
      <ol className="mt-3 grid grid-cols-7 text-center">
        {days.map((d) => {
          const bs = blocksOn(d);
          const isToday = sameDay(d, now);
          return (
            <li key={d.toISOString()} className="flex flex-col items-center gap-1">
              <span className="text-xs font-bold text-muted">{d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2)}</span>
              <span className={`grid size-8 place-items-center rounded-full text-sm font-extrabold tabular-nums ${isToday ? "bg-ink text-white" : ""}`}>{d.getDate()}</span>
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                {bs.slice(0, 5).map((b) => (
                  <span key={b.id} className={`size-1.5 rounded-full ${b.done ? "bg-teal-face" : "border-2 border-teal-face"}`} />
                ))}
                {bs.length > 5 && <span className="text-[9px] font-black leading-none text-teal">+{bs.length - 5}</span>}
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
            <li key={a.at + a.title} className={`flex items-center gap-3 py-1.5 ${past(a.at) ? "text-muted" : ""}`}>
              <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums text-muted">{fmtTime(a.at)}</span>
              <span className={`min-w-0 flex-1 truncate font-bold leading-snug ${a.kind === "study" ? "text-teal-lip" : ""}`}>{a.title}</span>
              {a.kind === "class" &&
                (checkedIn(a.at) ? (
                  <span className="flex items-center gap-1 text-sm font-bold text-teal"><Check size={15} strokeWidth={3} aria-hidden /> Here</span>
                ) : (
                  <button onClick={() => checkIn(a.course, a.at)} className="btn btn-ghost min-h-8 px-2.5 text-xs">Check in</button>
                ))}
              {a.kind === "due" && <span className="text-xs font-bold text-sun-ink">Due</span>}
              {a.kind === "exam" && <span className="text-xs font-bold text-sun-ink">Exam</span>}
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
      <SectionHeading id="inbox">Inbox</SectionHeading>
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

// ---- 6. Course materials: what Pathway already knows per course (seeded, no upload needed), plus
// a drop zone for anything else. Every file goes through the ingestion agent, stage by stage.

const ACCEPT = [".pdf", ".png", ".jpg", ".jpeg", ".txt", ".csv"];
type Pending = { id: number; name: string; stage: string; detail: string; status: "reading" | "error"; error?: string };

const STAGE_TEXT: Record<string, string> = { received: "Reading", classified: "Classified", extracted: "Extracting facts", linked: "Linking", reviewed: "Reviewing", done: "Done" };

export function Files() {
  const { courses, knowledge, ingestFile, reassignSource, removeKnowledgeSource } = usePathway();
  const [over, setOver] = useState(false);
  const [items, setItems] = useState<Pending[]>([]);

  const take = (list: FileList | null) => {
    if (!list) return;
    for (const f of Array.from(list)) {
      const id = Date.now() + Math.random();
      if (!ACCEPT.some((ext) => f.name.toLowerCase().endsWith(ext))) {
        setItems((xs) => [...xs, { id, name: f.name, stage: "", detail: "", status: "error", error: "Export slides or docs to PDF first." }]);
        continue;
      }
      setItems((xs) => [...xs, { id, name: f.name, stage: "received", detail: "", status: "reading" }]);
      ingestFile(f, (e) => {
        const detail =
          e.stage === "classified" ? `${e.kind} (${e.confidence}) · ${e.course}` : e.stage === "extracted" ? `${e.facts} facts` : e.stage === "linked" ? `${e.edges} links${e.conflicts ? ` · ${e.conflicts} clash` : ""}` : e.stage === "reviewed" ? `${e.confirmed} confirmed${e.needsYou ? ` · ${e.needsYou} need you` : ""}` : e.stage === "received" && e.cached ? "seen before" : "";
        setItems((xs) => xs.map((x) => (x.id === id ? { ...x, stage: e.stage, detail: detail || x.detail } : x)));
      })
        .then(() => setItems((xs) => xs.filter((x) => x.id !== id)))
        .catch((e: Error) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status: "error", error: e.message } : x))));
    }
  };
  const facts = (sourceId: string) => knowledge.nodes.filter((n) => n.source === sourceId && n.review !== "rejected");
  const own = knowledge.sources.filter((src) => !isSampleSource(src));

  return (
    <section aria-labelledby="files">
      <SectionHeading id="files" action={knowledge.sources.length > 0 ? { href: "/courses?tab=facts", label: "See on Courses" } : undefined}>
        Course materials
      </SectionHeading>
      {/* Sample course files live on the Courses tab; this card is the drop zone plus what the student added. */}
      {knowledge.sources.length > 0 && (
        <p className="mt-1 text-sm text-muted">
          {knowledge.sources.length} file{knowledge.sources.length === 1 ? "" : "s"} · {knowledge.nodes.filter((n) => n.review !== "rejected").length} facts on file for your {courses.length} class{courses.length === 1 ? "" : "es"}.
        </p>
      )}
      {own.length > 0 && (
        <ul className="mt-2" aria-live="polite">
          {own.map((src) => {
            const mine = facts(src.id);
            const waiting = mine.filter((n) => n.review === "proposed").length;
            return (
              <li key={src.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Check size={15} strokeWidth={3} className="shrink-0 text-teal" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-bold">{src.filename}</span> <span className="text-muted">· {src.kind} · {mine.length} fact{mine.length === 1 ? "" : "s"}{waiting ? ` · ${waiting} need${waiting === 1 ? "s" : ""} you` : ""}</span>
                </span>
                <label className="sr-only" htmlFor={`src-${src.id}`}>Course</label>
                <select id={`src-${src.id}`} value={src.course} onChange={(e) => reassignSource(src.id, e.target.value)} className="rounded-lg border-2 border-line bg-white px-2 py-1 text-xs font-bold">
                  {!courses.some((c) => c.code === src.course) && <option value={src.course}>{src.course || "Course?"}</option>}
                  {courses.map((c) => <option key={c.slug} value={c.code}>{c.code}</option>)}
                </select>
                <button onClick={() => removeKnowledgeSource(src.id)} aria-label={`Forget ${src.filename}`} className="text-muted hover:text-ink"><X size={16} /></button>
              </li>
            );
          })}
        </ul>
      )}
      {items.map((p) => (
        <p key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm" aria-live="polite">
          <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
          {p.status === "reading" ? (
            <span className="flex items-center gap-1.5 text-muted"><ThinkingOrb state="solving" size={20} theme="light" color="#1a6fd1" aria-hidden /> {STAGE_TEXT[p.stage] ?? p.stage}…{p.detail ? ` ${p.detail}` : ""}</span>
          ) : (
            <span className="text-sun-ink">{p.error}</span>
          )}
          <button onClick={() => setItems((xs) => xs.filter((x) => x.id !== p.id))} aria-label={`Dismiss ${p.name}`} className="text-muted hover:text-ink"><X size={16} /></button>
        </p>
      ))}
      <label
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), take(e.dataTransfer.files))}
        className={`mt-2 flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 transition-colors ${over ? "border-teal bg-teal-soft" : "border-line hover:bg-polar"}`}
      >
        <FileUp size={22} strokeWidth={2.4} className="shrink-0 text-teal" aria-hidden />
        <span className="min-w-0">
          <span className="block font-bold">{knowledge.sources.length ? "Anything else? Drop it here" : "Drop a syllabus, slides, or a grade page"}</span>
          <span className="block text-sm text-muted">Pathway reads it stage by stage and keeps every fact with the sentence it came from.</span>
        </span>
        <input type="file" multiple accept={ACCEPT.join(",")} className="sr-only" onChange={(e) => take(e.target.files)} />
      </label>
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
