"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowUp, Brain, CalendarPlus, Check, ChevronRight, FileUp, Flag, Layers, Lock, Mic, Sparkles, Timer, Trophy } from "lucide-react";
import { MiniPath } from "@/components/PathView";
import { StatusMark } from "@/components/ui";
import { moveText, reasonFor } from "@/lib/features";
import { fmtDay, fmtTime, usePathway } from "@/lib/store";

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const greet = (h: number) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

export function Greeting() {
  const { profile, courses, now, state } = usePathway();
  const checkIns = courses.filter((c) => c.result.atRisk).length;
  const planned = state.blocks.length;
  const done = state.blocks.filter((b) => b.done).length;
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-[2rem] font-black leading-[1.1] tracking-tight text-balance md:text-[2.5rem]">
          {greet(now.getHours())}
          {profile.sample ? `, ${profile.name}` : ""}
        </h1>
        <span className="mt-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-flame-soft px-3 py-1.5 font-black text-flame-ink">
          <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden>
            <path d="M9 0c1 4 7 6 7 12a7 7 0 0 1-14 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3 0-6 2-9z" fill="var(--color-flame)" />
          </svg>
          {profile.streakDays}
          <span className="sr-only">day study streak</span>
        </span>
      </div>
      {courses.length > 0 && (
        <>
          <p className="mt-2 text-lg text-muted">
            {courses.length - checkIns} of {courses.length} {courses.length === 1 ? "class" : "classes"} on track
            {checkIns > 0 && `, ${checkIns} worth a check-in`}
            {planned > 0 && ` · plan ${done}/${planned} done`}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {courses.map((c) => (
              <li key={c.slug}>
                <Link href={`/insights?course=${c.slug}`} className="flex items-center gap-2 rounded-xl border-2 border-b-4 border-line bg-white py-1.5 pl-2.5 pr-3.5 font-extrabold transition-colors hover:bg-polar">
                  <StatusMark atRisk={c.result.atRisk} label={false} />
                  {c.code}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Lock size={15} aria-hidden /> Statuses are calculated on this device and never stored on a server.
          </p>
        </>
      )}
    </section>
  );
}

export function HeadsUp() {
  const { courses } = usePathway();
  const c = [...courses].filter((x) => x.result.atRisk).sort((a, b) => a.daysToExam - b.daysToExam)[0];

  if (!c)
    return (
      <section className="rounded-[20px] border-2 border-teal-face bg-teal-soft p-6" aria-labelledby="heads-up">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full border-b-[5px] border-[#109c8a] bg-teal-face text-teal-ink" aria-hidden>
            <Trophy size={28} />
          </span>
          <div>
            <h2 id="heads-up" className="text-2xl font-black">Every class is on track</h2>
            <p className="text-teal-lip">Keep the streak going. Insights shows what&apos;s keeping each one there.</p>
          </div>
        </div>
        <Link href="/insights" className="btn btn-primary mt-5">See your paths</Link>
      </section>
    );

  return (
    <section className="rounded-[20px] border-2 border-sun bg-sun-soft p-5 md:p-6" aria-labelledby="heads-up">
      <div className="flex gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full border-b-[5px] border-[#d99a00] bg-sun text-sun-ink" aria-hidden>
          <Flag size={26} strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <h2 id="heads-up" className="text-2xl font-black leading-tight">
            {c.code} is worth a check-in
          </h2>
          <p className="mt-1 text-lg">{reasonFor(c.steps)}</p>
          <p className="mt-1 text-sun-ink">
            {c.exam.title} in {c.daysToExam} {c.daysToExam === 1 ? "day" : "days"} · {fmtDay(c.exam.date)}
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-white/70 p-4">
        <MiniPath steps={c.steps} atRisk />
        {c.rec && (
          <p className="mt-3 font-bold">
            What would help most: <span className="font-black">{c.rec.moves.map(moveText).join(" and ")}</span>. Students with a similar pattern often end up on track.
          </p>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href={`/insights?course=${c.slug}`} className="btn btn-primary">See what would help</Link>
        <Link href={`/study?tool=quiz&course=${c.slug}`} className="btn btn-ghost">Take a 5-min quiz</Link>
        <Link href={`/insights?course=${c.slug}#evidence`} className="text-sm font-extrabold text-teal underline underline-offset-4">How sure is this?</Link>
      </div>
    </section>
  );
}

export function AskCard() {
  const { sendChat } = usePathway();
  const router = useRouter();
  const ask = (q: string) => {
    if (!q.trim()) return;
    sendChat(q.trim());
    router.push("/chat");
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    ask(new FormData(e.currentTarget).get("q") as string);
  };
  const suggestions = ["What should I focus on this week?", "Make me a study plan", "Quiz me on my weakest class"];

  return (
    <section className="panel border-sky/30 p-5" aria-labelledby="ask">
      <h2 id="ask" className="flex items-center gap-2 text-lg font-black">
        <Sparkles size={20} className="text-sky" aria-hidden /> Ask Pathway
      </h2>
      <form onSubmit={submit} className="mt-3 flex items-center gap-2 rounded-2xl border-2 border-line bg-white p-1.5 pl-4 focus-within:border-sky">
        <label htmlFor="q" className="sr-only">Your question</label>
        <input id="q" name="q" autoComplete="off" placeholder="Ask anything about your classes…" className="min-w-0 flex-1 bg-transparent py-2 font-bold outline-none placeholder:text-muted" />
        <button className="btn btn-sky min-h-10 px-3" aria-label="Send">
          <ArrowUp size={20} strokeWidth={3} />
        </button>
      </form>
      <ul className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <li key={s}>
            <button onClick={() => ask(s)} className="rounded-full border-2 border-line bg-white px-3 py-1 text-sm font-bold text-sky hover:border-sky/40">
              {s}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">AI answers (Gemini) use only your own numbers and the model, and can be wrong.</p>
    </section>
  );
}

const TOOLS = [
  { tool: "quiz", title: "Practice quiz", detail: "From your slides", icon: Brain },
  { tool: "flashcards", title: "Flashcards", detail: "Spaced review", icon: Layers },
  { tool: "viva", title: "Viva", detail: "Answer out loud", icon: Mic },
  { tool: "timer", title: "Focus timer", detail: "Log a session", icon: Timer },
];

export function UpNext() {
  const { state, completeBlock, courses } = usePathway();
  const next = state.blocks.filter((b) => !b.done).sort((a, b) => a.at.localeCompare(b.at))[0];
  const code = (slug: string) => courses.find((c) => c.slug === slug)?.code ?? slug;

  return (
    <section aria-labelledby="up-next">
      <h2 id="up-next" className="mb-4 text-2xl font-black">Up next</h2>
      {next ? (
        <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-teal-soft text-teal" aria-hidden>
            <CalendarPlus size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-black leading-snug">{next.title}</p>
            <p className="text-muted">
              {fmtDay(next.at)}, {fmtTime(next.at)} · from your {code(next.course)} plan
            </p>
          </div>
          <button onClick={() => completeBlock(next)} className="btn btn-primary">
            <Check size={18} strokeWidth={3} /> Done
          </button>
        </div>
      ) : (
        <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <p className="flex-1 text-muted">No study blocks planned yet. Pick what would help in Insights and press Make it real.</p>
          <Link href="/insights" className="btn btn-ghost">Make a plan</Link>
        </div>
      )}
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TOOLS.map(({ tool, title, detail, icon: Icon }) => (
          <li key={tool}>
            <Link href={`/study?tool=${tool}`} className="flex h-full flex-col gap-2 rounded-[var(--radius-tile)] border-2 border-b-[5px] border-line bg-white p-4 transition-transform hover:bg-polar active:translate-y-[3px] active:border-b-2">
              <Icon size={26} strokeWidth={2.4} className="text-teal" aria-hidden />
              <span className="font-black leading-tight">{title}</span>
              <span className="text-sm text-muted">{detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WeekPanel() {
  const { now, state, profile, checkIn } = usePathway();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const blocksOn = (d: Date) => state.blocks.filter((b) => sameDay(new Date(b.at), d));
  const classes = [...profile.classes, ...state.addedClasses].filter((c) => sameDay(new Date(c.at), now));
  const today = [
    ...classes.map((c) => ({ at: c.at, kind: "class" as const, title: c.title, course: c.course })),
    ...blocksOn(now).map((b) => ({ at: b.at, kind: "study" as const, title: b.title, course: b.course, done: b.done })),
    ...profile.todos.filter((t) => t.due && sameDay(new Date(t.due), now)).map((t) => ({ at: t.due!, kind: "due" as const, title: t.title, course: "" })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const planned = state.blocks.length;
  const done = state.blocks.filter((b) => b.done).length;

  return (
    <section className="panel p-5" aria-labelledby="this-week">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="this-week" className="text-lg font-black">This week</h2>
        {planned > 0 && <span className="text-sm font-bold text-muted">Plan: {done} of {planned} blocks done</span>}
      </div>
      {planned > 0 && (
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={planned} aria-valuenow={done} aria-label="Study plan progress">
          <div className="h-full rounded-full bg-teal-face transition-[width] duration-500" style={{ width: `${(done / planned) * 100}%` }} />
        </div>
      )}
      <ol className="mt-4 grid grid-cols-7 text-center">
        {days.map((d) => {
          const bs = blocksOn(d);
          const isToday = sameDay(d, now);
          return (
            <li key={d.toISOString()} className="flex flex-col items-center gap-1">
              <span className="text-xs font-extrabold text-muted">{d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2)}</span>
              <span className={`grid size-9 place-items-center rounded-full font-black tabular-nums ${isToday ? "bg-ink text-white" : ""}`}>{d.getDate()}</span>
              <span className="flex h-2 gap-0.5" aria-hidden>
                {bs.map((b) => (
                  <span key={b.id} className={`size-2 rounded-full ${b.done ? "bg-teal-face" : "border-2 border-teal-face"}`} />
                ))}
              </span>
              <span className="sr-only">{bs.length ? `${bs.length} study blocks, ${bs.filter((b) => b.done).length} done` : "no study blocks"}</span>
            </li>
          );
        })}
      </ol>
      <h3 className="mb-2 mt-5 text-sm font-extrabold text-muted">Today, {fmtDay(now.toISOString())}</h3>
      {today.length === 0 ? (
        <p className="text-muted">Nothing scheduled.</p>
      ) : (
        <ul className="space-y-1">
          {today.map((a) => (
            <li key={a.at + a.title} className="flex items-center gap-3 py-1.5">
              <span className="w-16 shrink-0 text-right text-sm font-extrabold tabular-nums text-muted">{fmtTime(a.at)}</span>
              <span className="min-w-0 flex-1 font-bold leading-snug">{a.title}</span>
              {a.kind === "class" &&
                (state.checkedIn[a.at] ? (
                  <span className="flex items-center gap-1 text-sm font-extrabold text-teal">
                    <Check size={16} strokeWidth={3} aria-hidden /> Checked in
                  </span>
                ) : (
                  <button onClick={() => checkIn(a.course, a.at)} className="btn btn-ghost min-h-9 px-3 text-xs">
                    Check in
                  </button>
                ))}
              {a.kind === "due" && <span className="rounded-lg bg-sun-soft px-2 py-0.5 text-xs font-extrabold text-sun-ink">Due</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const ACCEPT = [".pdf", ".ppt", ".pptx", ".doc", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".ics"];

export function DropZone() {
  const { courses } = usePathway();
  const [over, setOver] = useState(false);
  const [files, setFiles] = useState<{ name: string; course: string; confirmed: boolean }[]>([]);
  const [error, setError] = useState("");

  // TODO: POST each file to /api/syllabus; Gemini picks the course and pulls out dates for you to confirm.
  const take = (list: FileList | null) => {
    if (!list) return;
    const all = Array.from(list);
    const ok = all.filter((f) => ACCEPT.some((ext) => f.name.toLowerCase().endsWith(ext)));
    setError(ok.length < all.length ? `Skipped ${all.length - ok.length} file(s). Pathway reads PDFs, slides, docs, images and .ics calendars.` : "");
    setFiles((fs) => [...fs, ...ok.map((f) => ({ name: f.name, course: courses[0]?.slug ?? "", confirmed: false }))]);
  };

  return (
    <section aria-labelledby="drop">
      <h2 id="drop" className="sr-only">Add files</h2>
      <div
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), take(e.dataTransfer.files))}
        className={`flex flex-col items-center gap-2 rounded-[var(--radius-tile)] border-2 border-dashed px-5 py-6 text-center transition-colors ${over ? "border-teal bg-teal-soft" : "border-line"}`}
      >
        <FileUp size={28} strokeWidth={2.4} className="text-teal" aria-hidden />
        <p className="font-extrabold">Drop syllabi, slides or notes</p>
        <p className="text-sm text-muted">We&apos;ll suggest the right course. You confirm before anything is filed.</p>
        <label className="btn btn-ghost mt-1 min-h-10 cursor-pointer text-xs">
          Choose files
          <input type="file" multiple accept={ACCEPT.join(",")} className="sr-only" onChange={(e) => take(e.target.files)} />
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-bold text-sun-ink">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {files.map((f, i) => (
            <li key={f.name + i} className="flex flex-wrap items-center gap-2 rounded-xl bg-polar px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-bold">{f.name}</span>
              {f.confirmed ? (
                <span className="flex items-center gap-1 font-extrabold text-teal">
                  <Check size={15} strokeWidth={3} aria-hidden /> Filed to {courses.find((c) => c.slug === f.course)?.code}
                </span>
              ) : (
                <>
                  <label className="sr-only" htmlFor={`f${i}`}>Course for {f.name}</label>
                  <select id={`f${i}`} value={f.course} onChange={(e) => setFiles((fs) => fs.map((x, j) => (j === i ? { ...x, course: e.target.value } : x)))} className="rounded-lg border-2 border-line bg-white px-2 py-1 font-bold">
                    {courses.map((c) => (
                      <option key={c.slug} value={c.slug}>{c.code}</option>
                    ))}
                  </select>
                  <button onClick={() => setFiles((fs) => fs.map((x, j) => (j === i ? { ...x, confirmed: true } : x)))} className="font-extrabold text-teal">Confirm</button>
                  <button onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} className="font-bold text-muted">Remove</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TodoPanel() {
  const { profile, state, toggleTodo } = usePathway();
  const left = profile.todos.filter((t) => !state.done[t.id]).length;
  return (
    <section className="panel p-5" aria-labelledby="to-do">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="to-do" className="text-lg font-black">To do</h2>
        <span className="text-sm font-bold text-muted">{left} left</span>
      </div>
      {profile.todos.length === 0 ? (
        <p className="text-muted">Nothing yet. Deadlines from your syllabi show up here.</p>
      ) : (
        <ul className="divide-y-2 divide-line">
          {profile.todos.map((t) => {
            const done = !!state.done[t.id];
            return (
              <li key={t.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <button
                  onClick={() => toggleTodo(t.id)}
                  aria-pressed={done}
                  aria-label={done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
                  className={`grid size-8 shrink-0 place-items-center rounded-lg border-2 border-b-4 transition-colors ${done ? "animate-[pop_250ms_ease-out] border-[#109c8a] bg-teal-face text-teal-ink" : "border-line bg-white hover:bg-polar"}`}
                >
                  {done && <Check size={16} strokeWidth={4} />}
                </button>
                <Link href={t.href} className="group flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className={`block font-extrabold leading-snug ${done ? "text-muted line-through" : ""}`}>{t.title}</span>
                    <span className="block text-sm text-muted">{t.detail}</span>
                  </span>
                  <ChevronRight size={20} className="shrink-0 text-muted/50 group-hover:text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Onboarding() {
  const { addJudgeCourse } = usePathway();
  return (
    <section className="panel mx-auto max-w-2xl p-6 md:p-8" aria-labelledby="start">
      <h1 id="start" className="text-[2rem] font-black leading-tight">Let&apos;s set up your semester</h1>
      <p className="mt-2 text-lg text-muted">Two steps. Everything stays on this device until you choose to share it.</p>
      <ol className="mt-6 space-y-4">
        <li className="flex gap-4 rounded-2xl bg-polar p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink font-black text-white">1</span>
          <div className="flex-1">
            <p className="font-black">Import your calendar</p>
            <p className="text-sm text-muted">An .ics file from your school calendar. Not connected yet: /api/calendar (ical.js).</p>
          </div>
        </li>
        <li className="flex gap-4 rounded-2xl bg-polar p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink font-black text-white">2</span>
          <div className="flex-1">
            <p className="font-black">Add a course from its syllabus</p>
            <p className="text-sm text-muted">We read the dates and you confirm them. For the demo, add BIO 181.</p>
            <button onClick={addJudgeCourse} className="btn btn-primary mt-3">Add BIO 181</button>
          </div>
        </li>
      </ol>
    </section>
  );
}

