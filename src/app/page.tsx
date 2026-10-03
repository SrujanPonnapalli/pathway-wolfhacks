import Link from "next/link";
import { ArrowUp, Brain, Lock, Flame, Layers, Mic, Sparkles, Timer } from "lucide-react";
import { DropZone, Greeting, TodoList } from "@/components/HomeClient";
import { StatusMark } from "@/components/ui";
import { agenda, courses, featuredStudy, headsUp, student, studyTools, todayIndex, todos, week } from "@/lib/mock";

const toolIcon = { flashcards: Layers, viva: Mic, timer: Timer } as const;
const toolTint = { flashcards: "text-grape", viva: "text-sky", timer: "text-teal" } as const;
const agendaDot = { class: "bg-ink", study: "bg-teal-bright", due: "bg-sun" } as const;

export default function Home() {
  const checkIns = courses.filter((c) => c.status === "check_in").length;

  return (
    <main className="mx-auto grid max-w-[1200px] gap-8 px-4 py-6 md:px-10 md:py-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
      <div className="min-w-0 space-y-8">
        {/* Greeting + class standing */}
        <section>
          <div className="flex items-start justify-between gap-4">
            <Greeting name={student.name} />
            <span className="mt-2 inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-sun-soft px-3 py-1.5 font-black text-sun-ink" title="Study streak">
              <Flame size={20} className="fill-sun text-sun-lip" aria-hidden />
              {student.streakDays}
              <span className="sr-only">day study streak</span>
            </span>
          </div>
          <p className="mt-2 text-lg text-muted">
            {courses.length - checkIns} classes on track, {checkIns} worth a check-in.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {courses.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/courses/${c.slug}`}
                  className="flex items-center gap-2 rounded-xl border-2 border-b-4 border-line bg-white py-1.5 pl-2.5 pr-3.5 font-extrabold transition-colors hover:bg-polar"
                >
                  <StatusMark status={c.status} label={false} />
                  {c.code}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Heads-up from the model + chat entry */}
        <section className="panel overflow-hidden border-sky/35" aria-labelledby="heads-up">
          <div className="p-5 md:p-6">
            <div className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-soft text-sky" aria-hidden>
                <Sparkles size={24} strokeWidth={2.4} />
              </span>
              <div className="min-w-0">
                <h2 id="heads-up" className="text-xl font-black leading-snug">{headsUp.title}</h2>
                <p className="mt-1 text-muted">{headsUp.body}</p>
                <p className="mt-3 rounded-xl bg-polar px-3.5 py-2.5 text-[0.9375rem]">
                  <span className="font-black">Why: </span>
                  {courses.find((c) => c.slug === headsUp.course)?.reason}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3 md:pl-15">
              <Link href={`/study?tool=quiz&course=${headsUp.course}`} className="btn btn-primary">
                Take a 5-min quiz
              </Link>
              <Link href={`/courses/${headsUp.course}`} className="btn btn-ghost">
                See what would help
              </Link>
            </div>
          </div>

          <form action="/chat" className="border-t-2 border-line bg-polar p-4 md:px-6">
            <div className="flex items-center gap-2 rounded-2xl border-2 border-line bg-white p-1.5 pl-4 focus-within:border-sky">
              <label htmlFor="ask" className="sr-only">Ask Pathway</label>
              <input id="ask" name="q" placeholder="Ask Pathway anything…" className="min-w-0 flex-1 bg-transparent py-2 font-bold outline-none placeholder:text-muted" />
              <button className="btn btn-sky min-h-10 px-3" aria-label="Send">
                <ArrowUp size={20} strokeWidth={3} />
              </button>
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {headsUp.suggestions.map((s) => (
                <li key={s}>
                  <Link href={`/chat?q=${encodeURIComponent(s)}`} className="block rounded-full border-2 border-line bg-white px-3 py-1 text-sm font-bold text-sky hover:border-sky/40">
                    {s}
                  </Link>
                </li>
              ))}
            </ul>
          </form>
        </section>

        {/* Study actions */}
        <section aria-labelledby="keep-studying">
          <h2 id="keep-studying" className="mb-4 text-2xl font-black">Keep studying</h2>
          <div className="flex flex-col gap-5 rounded-[20px] bg-teal p-6 text-white sm:flex-row sm:items-center">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/15" aria-hidden>
              <Brain size={34} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold uppercase tracking-wider text-white/80">{featuredStudy.course} · {featuredStudy.minutes} min</p>
              <p className="text-xl font-black leading-snug">{featuredStudy.title}</p>
              <p className="text-white/85">{featuredStudy.detail}</p>
            </div>
            <Link href="/study?tool=quiz&course=bio-181" className="btn border-white/0 border-b-teal-lip bg-white text-teal hover:bg-teal-soft">
              Start
            </Link>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {studyTools.map((t) => {
              const Icon = toolIcon[t.tool];
              return (
                <li key={t.tool}>
                  <Link href={`/study?tool=${t.tool}`} className="flex items-center gap-3 rounded-[var(--radius-tile)] border-2 border-b-[5px] border-line bg-white p-4 transition-transform hover:bg-polar active:translate-y-[3px] active:border-b-2">
                    <Icon size={28} strokeWidth={2.4} className={toolTint[t.tool]} aria-hidden />
                    <span>
                      <span className="block font-black">{t.title}</span>
                      <span className="block text-sm text-muted">{t.detail}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <aside className="space-y-6">
        {/* Smart calendar */}
        <section className="panel p-5" aria-labelledby="this-week">
          <div className="flex items-baseline justify-between">
            <h2 id="this-week" className="text-lg font-black">This week</h2>
            <Link href="/courses" className="text-sm font-extrabold uppercase tracking-wider text-sky">Calendar</Link>
          </div>
          <ol className="mt-4 grid grid-cols-7 text-center">
            {week.map((d, i) => (
              <li key={d.day} className="flex flex-col items-center gap-1">
                <span className="text-xs font-extrabold uppercase text-muted">{d.day.slice(0, 2)}</span>
                <span className={`grid size-9 place-items-center rounded-full font-black tabular-nums ${i === todayIndex ? "bg-teal text-white" : ""}`}>{d.date}</span>
                <span className="flex h-1.5 gap-0.5" aria-label={`${d.busy} items`}>
                  {Array.from({ length: d.busy }, (_, k) => (
                    <span key={k} className="size-1.5 rounded-full bg-teal-bright" />
                  ))}
                </span>
              </li>
            ))}
          </ol>
          <h3 className="mt-5 mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Today</h3>
          <ul className="space-y-1">
            {agenda.map((a) => (
              <li key={a.title}>
                <Link href={a.href} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-polar">
                  <span className="w-11 text-right text-sm font-extrabold tabular-nums text-muted">{a.time}</span>
                  <span className={`size-2.5 shrink-0 rounded-full ${agendaDot[a.kind]}`} aria-hidden />
                  <span className="font-bold leading-snug">{a.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <DropZone />

        {/* Reminders */}
        <section className="panel p-5" aria-labelledby="to-do">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 id="to-do" className="text-lg font-black">To do</h2>
            <span className="text-sm font-bold text-muted">{todos.filter((t) => !t.done).length} left</span>
          </div>
          <TodoList initial={todos} />
        </section>

        <p className="flex items-center gap-2 px-1 text-sm text-muted">
          <Lock size={16} aria-hidden /> Your status is calculated on this device and never stored on a server.
        </p>
      </aside>
    </main>
  );
}
