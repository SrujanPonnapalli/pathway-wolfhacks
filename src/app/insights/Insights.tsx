"use client";

// Insights = "My Standing": where you stand in each class, in plain numbers, and the route the
// model found to on track. The decision tree runs on-device before every render (see
// src/lib/store.tsx), so everything here is already re-scored when you arrive.
//
// Layout, top to bottom: status + reason → the route (smallest change, one button) → four tiles
// (attendance, assignments, grades, exam prep) → assignments and grades from your files →
// details (the model's path, your own what-ifs, midterm, advisor note) → evidence, collapsed.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { BorderBeam } from "border-beam";
import { CalendarPlus, Check, ChevronDown, Copy, Lock, Mail, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { LiquidSelect } from "@/components/LiquidSelect";
import { PathView } from "@/components/PathView";
import { PotLine } from "@/components/PotLine";
import { Burst, PageHeader, StatusMark } from "@/components/ui";
import { FEATURES, goalText, meta, moveText, reasonFor } from "@/lib/features";
import { planBlocks } from "@/lib/plan";
import { categorize, missingWork, sourcesFor, standing, tiles } from "@/lib/standing";
import { usedFeatures } from "@/lib/tree";
import { fmtDay, score, usePathway, type CourseView } from "@/lib/store";
import { EvidenceSection } from "./EvidenceSection";

function RefreshButton() {
  const { refresh } = usePathway();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        await refresh();
        setBusy(false);
      }}
      disabled={busy}
      className="btn btn-ghost min-h-10 px-3 text-xs"
      title="Reload your latest study activity"
    >
      <RefreshCw size={15} aria-hidden className={busy ? "animate-spin" : ""} />
      {busy ? "Refreshing…" : "Refresh"}
    </button>
  );
}

export function Insights() {
  const { courses } = usePathway();
  const params = useSearchParams();
  const router = useRouter();
  const c = courses.find((x) => x.slug === params.get("course")) ?? courses.find((x) => x.result.atRisk) ?? courses[0];

  if (!c)
    return (
      <main className="mx-auto max-w-narrow px-4 py-6 md:px-10 md:py-10">
        <PageHeader title="Insights" lead="Add a course on Home first. Then this page shows where you stand and what would help.">
          <RefreshButton />
        </PageHeader>
      </main>
    );

  return (
    <main className="mx-auto max-w-wide px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Insights" lead="Where you stand in each class, and the shortest route to on track.">
        <RefreshButton />
      </PageHeader>

      <div className="-mx-1 mb-8 overflow-x-auto px-1 pb-2">
      <LiquidSelect active={c.slug} fill="#ddf4ef" shadow="inset 0 0 0 2px rgba(10,127,114,0.35), inset 0 -4px 0 rgba(10,127,114,0.25)" className="inline-flex items-center rounded-2xl border-2 border-line bg-polar p-1">
      <div role="tablist" aria-label="Courses" className="flex items-center gap-1">
        {courses.map((x) => (
          <button
            key={x.slug}
            role="tab"
            aria-selected={x.slug === c.slug}
            onClick={() => router.replace(`/insights?course=${x.slug}`, { scroll: false })}
            data-liquid-key={x.slug}
            className={`relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 font-extrabold transition-colors duration-300 ${x.slug === c.slug ? "text-teal-lip" : "text-muted hover:text-ink"}`}
          >
            <StatusMark atRisk={x.result.atRisk} label={false} />
            {x.code}
          </button>
        ))}
      </div>
      </LiquidSelect>
      </div>

      <CourseInsight key={c.slug} c={c} />
      <EvidenceSection />
    </main>
  );
}

function CourseInsight({ c }: { c: CourseView }) {
  const { now, state, makeReal } = usePathway();
  const [showDetails, setShowDetails] = useState(false);
  const deltas = state.deltas[c.slug] ?? { quizzes: 0, checkins: 0, sessions: 0 };
  const src = useMemo(() => sourcesFor(state.sources, c.code), [state.sources, c.code]);
  const cats = useMemo(() => categorize(src.gradeItems, src.grading, now), [src.gradeItems, src.grading, now]);
  const grade = standing(cats);
  const missing = missingWork(src.gradeItems, now);
  const tileList = tiles(c.x, c.tree, deltas, src.gradeItems, cats, now);
  const watch = tileList.filter((t) => t.ok === false).length;

  return (
    <section aria-labelledby="course" className="mb-12">
      <header className="mb-6">
        <h2 id="course" className="text-[1.75rem] font-black leading-tight md:text-[2rem]">
          {c.code} <span className="font-bold text-muted">· {c.name}</span>
        </h2>
        <div className="mt-2 text-lg"><StatusMark atRisk={c.result.atRisk} size={24} /></div>
        <p className="mt-2 max-w-[65ch] text-lg">{reasonFor(c.steps)}</p>
        <p className="mt-1 text-muted">
          {c.exam.title} in {c.daysToExam} days · {fmtDay(c.exam.date)} · scored just now by the {c.horizon === "mid" ? "mid-semester model (uses your midterm)" : "early-semester model"}, {c.result.n} similar students
        </p>
      </header>

      <Route c={c} now={now} makeReal={makeReal} good={tileList.filter((t) => t.ok).map((t) => `${t.label.toLowerCase()} ${t.value}`)} />

      {/* Where you stand: four numbers, the model's own lines */}
      <h3 className="mt-10 text-xl font-black">
        Where you stand {watch > 0 && <span className="ml-2 rounded-lg bg-sun-soft px-2 py-0.5 text-sm font-extrabold text-sun-ink">{watch} to watch</span>}
      </h3>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tileList.map((t) => (
          <li key={t.key} className="panel p-4">
            <p className="flex items-center justify-between text-sm font-extrabold text-muted">
              {t.label}
              <span className={`h-2.5 w-2.5 rounded-full ${t.ok == null ? "bg-line" : t.ok ? "bg-teal-face" : "bg-sun"}`} aria-label={t.ok == null ? "no data yet" : t.ok ? "good" : "worth watching"} />
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums">{t.value}</p>
            <p className="mt-1 text-sm text-muted">{t.detail}</p>
          </li>
        ))}
      </ul>

      <Work c={c} src={src} cats={cats} grade={grade} missing={missing} now={now} makeReal={makeReal} />

      {/* Everything the model-curious want, out of the way by default */}
      <button onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails} className="mt-10 flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-line bg-polar px-4 py-3 text-left hover:border-teal/40">
        <span>
          <span className="block font-black">How the model decided, and try your own numbers</span>
          <span className="block text-sm text-muted">Your path through the tree, what-if sliders, midterm score, a note to your advisor.</span>
        </span>
        <ChevronDown size={22} className={`shrink-0 text-muted transition-transform ${showDetails ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {showDetails && <Details c={c} />}
    </section>
  );
}

// The route: the smallest change the tree found to an on-track path, as turns, with one button.
function Route({ c, now, makeReal, good }: { c: CourseView; now: Date; makeReal: (b: { course: string; title: string; at: string }[]) => void; good: string[] }) {
  const [burst, setBurst] = useState(0);
  const [planned, setPlanned] = useState(false);
  const moves = c.rec?.moves ?? [];
  const blocks = moves.length ? planBlocks(c, moves, now) : [];
  const real = () => {
    makeReal(blocks);
    setBurst((b) => b + 1);
    setPlanned(true);
  };

  if (!c.result.atRisk)
    return (
      <div className="panel border-teal/30 bg-teal-soft/40 p-5 md:p-6">
        <h3 className="text-xl font-black text-teal-lip">You&apos;re on track</h3>
        <p className="mt-1 text-muted">Keep it up: {good.length ? good.join(", ") : "showing up, submitting on time, starting early"}. Every quiz, check-in and study block you log re-scores this class on the spot.</p>
      </div>
    );

  return (
    <div className="panel relative overflow-hidden p-5 md:p-6">
      <h3 className="text-xl font-black">Your route to on track</h3>
      {moves.length ? (
        <>
          <p className="mt-1 text-muted">The smallest change the model found. Students with similar patterns who made it usually ended up on track.</p>
          <ol className="mt-4 space-y-3">
            {moves.map((m, i) => (
              <li key={m.feature} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-face text-sm font-black text-teal-ink">{i + 1}</span>
                <div>
                  <p className="font-black">{cap(goalText(m))}</p>
                  <p className="text-sm text-muted">{moveText(m)}</p>
                </div>
              </li>
            ))}
            {blocks.length > 0 && (
              <li className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-soft text-sky"><CalendarPlus size={16} aria-hidden /></span>
                <div>
                  <p className="font-black">On your calendar</p>
                  <p className="text-sm text-muted">{blocks.map((b) => `${b.title} · ${fmtWhen(b.at)}`).join(" · ")}</p>
                </div>
              </li>
            )}
          </ol>
          <div className="relative mt-5 max-w-sm">
            {burst > 0 && <Burst key={burst} />}
            {planned ? (
              <p className="flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-teal-soft font-extrabold text-teal-lip">
                <Check size={20} strokeWidth={3} aria-hidden /> Added to your week
              </p>
            ) : (
              <BorderBeam size="md" colorVariant="ocean" theme="light" active borderRadius={14}>
                <button onClick={real} className="btn btn-primary w-full">Make it real</button>
              </BorderBeam>
            )}
          </div>
          <p className="mt-2 text-sm text-muted">{planned ? "Find the blocks on Home under Up next, and in your Week." : `Adds ${blocks.length} dated study block${blocks.length === 1 ? "" : "s"} before ${fmtDay(c.exam.date)}, and to Google Calendar.`}</p>
          {planned && <PotLine offer />}
        </>
      ) : (
        <p className="mt-1 text-muted">The on-track paths all need something you can&apos;t change on your own. Talk to your advisor; the note below is a start.</p>
      )}
    </div>
  );
}

const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Assignments and grades, from the files the student dropped on Home.
function Work({
  c, src, cats, grade, missing, now, makeReal,
}: {
  c: CourseView;
  src: ReturnType<typeof sourcesFor>;
  cats: ReturnType<typeof categorize>;
  grade: ReturnType<typeof standing>;
  missing: ReturnType<typeof missingWork>;
  now: Date;
  makeReal: (b: { course: string; title: string; at: string }[]) => void;
}) {
  const [plannedFor, setPlannedFor] = useState<string[]>([]);
  const planFor = (name: string, due: string) => {
    // The afternoon before it's due, or this afternoon if that's already gone.
    const d = due ? new Date(`${due}T16:00:00`) : new Date(now);
    d.setDate(d.getDate() - 1);
    if (d < now) {
      d.setTime(now.getTime());
      d.setHours(now.getHours() + 1, 0, 0, 0);
    }
    makeReal([{ course: c.slug, title: `${c.code}: ${name}`, at: d.toISOString() }]);
    setPlannedFor((p) => [...p, name]);
  };
  const upcoming = src.deadlines.filter((d) => d.date && new Date(`${d.date}T23:59:00`) >= now).slice(0, 5);

  if (!src.hasGrades && !src.hasSyllabus)
    return (
      <div className="panel mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h3 className="text-xl font-black">Assignments and grades</h3>
          <p className="mt-1 text-muted">Drop your {c.code} Gradescope page and syllabus on Home. Then this tracks every assignment, quiz, test and project against the syllabus weights.</p>
        </div>
        <Link href="/" className="btn btn-ghost min-h-11"><Upload size={16} aria-hidden /> Add files on Home</Link>
      </div>
    );

  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-2">
      <div className="panel p-5">
        <h3 className="text-xl font-black">Grades by category</h3>
        {grade.pct != null ? (
          <p className="mt-1 text-muted">
            Current standing about <span className="font-black text-ink">{Math.round(grade.pct)}%</span>
            {grade.covered ? ` from graded work covering ${Math.round(grade.covered)}% of the final grade.` : " across graded work so far."}
          </p>
        ) : (
          <p className="mt-1 text-muted">{src.hasGrades ? "Nothing graded yet." : "Weights from your syllabus. Drop your Gradescope page on Home to fill in scores."}</p>
        )}
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-line text-left text-xs font-extrabold uppercase tracking-wider text-muted">
              <th className="py-1.5">Category</th>
              <th className="py-1.5 text-right">Weight</th>
              <th className="py-1.5 text-right">Average</th>
              <th className="py-1.5 text-right">Missing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {cats.map((cat) => (
              <tr key={cat.name}>
                <td className="py-2 font-extrabold">{cat.name}<span className="ml-1 font-bold text-muted">{cat.items.length ? `· ${cat.items.length}` : ""}</span></td>
                <td className="py-2 text-right tabular-nums text-muted">{cat.weight != null ? `${cat.weight}%` : "—"}</td>
                <td className={`py-2 text-right font-black tabular-nums ${cat.avg == null ? "text-muted" : cat.avg >= 70 ? "text-teal" : "text-sun-ink"}`}>{cat.avg != null ? `${Math.round(cat.avg)}%` : "—"}</td>
                <td className={`py-2 text-right tabular-nums ${cat.missing ? "font-black text-sun-ink" : "text-muted"}`}>{cat.missing || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel p-5">
        <h3 className="text-xl font-black">{missing.length ? `${missing.length} missing` : "Nothing missing"}</h3>
        {missing.length ? (
          <ul className="mt-2 divide-y divide-line/70">
            {missing.map((it) => (
              <li key={it.name} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-extrabold">{it.name}</p>
                  <p className={`text-sm ${it.overdue ? "font-bold text-sun-ink" : "text-muted"}`}>{it.due ? `${it.overdue ? "Was due" : "Due"} ${fmtDay(it.due)}` : "No due date found"}</p>
                </div>
                {plannedFor.includes(it.name) ? (
                  <span className="flex items-center gap-1 text-sm font-extrabold text-teal"><Check size={15} strokeWidth={3} aria-hidden /> Planned</span>
                ) : (
                  <button onClick={() => planFor(it.name, it.due)} className="btn btn-ghost min-h-9 shrink-0 px-3 text-xs"><CalendarPlus size={14} aria-hidden /> Plan time</button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-muted">{src.hasGrades ? "Everything on your grade page is submitted." : "Drop your Gradescope page on Home to check."}</p>
        )}
        {upcoming.length > 0 && (
          <>
            <h4 className="mt-5 text-sm font-extrabold uppercase tracking-wider text-muted">Coming up (syllabus)</h4>
            <ul className="mt-1 space-y-1 text-sm">
              {upcoming.map((d) => (
                <li key={`${d.title}-${d.date}`} className="flex justify-between gap-3">
                  <span className="font-bold">{d.title}</span>
                  <span className="shrink-0 text-muted">{fmtDay(d.date)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// The old page, kept whole: the path through the tree, what-if sliders, midterm, advisor note.
function Details({ c }: { c: CourseView }) {
  const { setMidterm, state } = usePathway();
  const [what, setWhat] = useState<Record<string, number>>({});
  const tried = Object.keys(what).length > 0;
  const x = { ...c.x, ...what };
  const shown = tried ? score(c.tree, x) : c;
  const inTree = usedFeatures(c.tree);
  const levers = inTree.filter((f) => meta(f).role === "suggest");
  const context = inTree.filter((f) => meta(f).role !== "suggest" && f in c.x && !f.startsWith("course_"));
  const moves = tried ? Object.entries(what).filter(([f, v]) => v !== c.x[f]).map(([f, v]) => ({ feature: f, from: c.x[f], to: v })) : [];

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="panel overflow-x-clip p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xl font-black">Your path through the model</h3>
          {tried && <span className="rounded-lg bg-sky-soft px-2.5 py-1 text-sm font-extrabold text-sky">What-if</span>}
        </div>
        <PathView steps={shown.steps} atRisk={shown.result.atRisk} n={shown.result.n} />
        <div className="mt-6 space-y-2 rounded-2xl bg-polar p-4 text-sm">
          <p>
            <span className="font-black">How sure: </span>
            {shown.result.n} students in the dataset followed this same path. It&apos;s a pattern, not a verdict about you.
          </p>
          <p>
            <span className="font-black">Why this might be wrong: </span>
            the model learned from end-of-semester totals, so early-semester numbers are projected to a full term. It can&apos;t see a hard week, an illness, or a great study group.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="panel p-5 md:p-6">
          <h3 className="text-xl font-black">Try your own numbers</h3>
          <p className="mt-1 text-sm text-muted">Move a slider and watch the path re-score. Nothing is saved.</p>
          <div className="mt-5 space-y-5">
            {levers.map((f) => {
              const m = FEATURES[f];
              const v = x[f] ?? m.min;
              return (
                <label key={f} className="block">
                  <span className="flex justify-between gap-3 font-extrabold">
                    {m.label}
                    <span className="tabular-nums text-teal">{m.fmt(v)}</span>
                  </span>
                  <input
                    type="range" min={m.min} max={m.max} step={m.step} value={v}
                    onChange={(e) => setWhat((w) => ({ ...w, [f]: +e.target.value }))}
                    className="slider mt-2"
                    style={{ ["--fill" as string]: `${((v - m.min) / (m.max - m.min)) * 100}%` }}
                  />
                </label>
              );
            })}
          </div>
          {tried && (
            <p className="mt-4 text-sm">
              <span className="font-black">With these numbers: </span>
              <StatusMark atRisk={shown.result.atRisk} size={16} />
              {moves.length > 0 && <span className="text-muted"> · {moves.map(moveText).join(", ")}</span>}
            </p>
          )}
          {context.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-extrabold text-muted">Context only, never suggested</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {context.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 rounded-full bg-polar px-3 py-1 text-sm font-bold text-muted">
                    <Lock size={13} aria-hidden /> {meta(f).label}: {meta(f).fmt(c.x[f])}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tried && (
            <button onClick={() => setWhat({})} className="mt-4 flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
              <RotateCcw size={14} aria-hidden /> Back to my real numbers
            </button>
          )}
        </div>

        <Midterm c={c} has={state.midterm[c.slug]} set={(v) => setMidterm(c.slug, v)} />
        <AdvisorNote c={c} moves={c.rec?.moves ?? []} />
      </div>
    </div>
  );
}

function AdvisorNote({ c, moves }: { c: CourseView; moves: { feature: string; from: number; to: number }[] }) {
  const { draftAdvisorNote } = usePathway();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const draft = async () => {
    setBusy(true);
    setErr("");
    try {
      setText(await draftAdvisorNote(c.slug, moves));
    } catch (e) {
      setErr((e as Error).message || "Viva couldn't draft that right now.");
    }
    setBusy(false);
  };
  const subject = `Checking in about ${c.code}`;
  return (
    <div className="panel p-5">
      <h3 className="font-black">Tell your advisor</h3>
      <p className="mt-1 text-sm text-muted">A short note about what you&apos;re working on, in your words. Nothing is sent unless you send it.</p>
      {text ? (
        <>
          <label htmlFor="advisor-note" className="sr-only">Advisor note</label>
          <textarea id="advisor-note" value={text} onChange={(e) => setText(e.target.value)} rows={7} className="mt-3 w-full rounded-2xl border-2 border-line bg-white p-3 text-sm font-semibold leading-relaxed outline-none focus:border-sky" />
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => navigator.clipboard?.writeText(text)} className="btn btn-ghost min-h-10 px-4 text-xs"><Copy size={15} aria-hidden /> Copy</button>
            <a href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`} className="btn btn-ghost min-h-10 px-4 text-xs"><Mail size={15} aria-hidden /> Open in email</a>
            <button onClick={draft} disabled={busy} className="btn btn-ghost min-h-10 px-4 text-xs">{busy ? "Drafting…" : "Redraft"}</button>
          </div>
        </>
      ) : (
        <button onClick={draft} disabled={busy} className="btn btn-ghost mt-3 min-h-10 text-xs">{busy ? "Drafting…" : "Draft a note"}</button>
      )}
      {err && <p className="mt-2 text-sm text-muted" role="alert">{err}</p>}
    </div>
  );
}

function Midterm({ c, has, set }: { c: CourseView; has?: number; set: (v: number | null) => void }) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = Number(new FormData(e.currentTarget).get("score"));
    if (v >= 0 && v <= 100) set(v);
  };
  return (
    <div className="panel p-5">
      <h3 className="font-black">Got your midterm back?</h3>
      {has != null ? (
        <p className="mt-1 text-muted">
          Using your {c.code} midterm ({has}) with the mid-semester model.{" "}
          <button onClick={() => set(null)} className="font-extrabold text-teal underline underline-offset-4">Remove</button>
        </p>
      ) : (
        <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="score" className="text-sm text-muted">Score (0–100) switches to the more accurate mid-semester model.</label>
          <input id="score" name="score" type="number" min={0} max={100} required className="w-24 rounded-xl border-2 border-line px-3 py-2 font-bold" />
          <button className="btn btn-ghost min-h-10 text-xs">Use it</button>
        </form>
      )}
    </div>
  );
}

