"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BorderBeam } from "border-beam";
import { Check, Copy, Lock, Mail, RefreshCw, RotateCcw } from "lucide-react";
import { LiquidSelect } from "@/components/LiquidSelect";
import { PathView } from "@/components/PathView";
import { Burst, PageHeader, StatusMark } from "@/components/ui";
import { FEATURES, meta, moveText, reasonFor } from "@/lib/features";
import { planBlocks } from "@/lib/plan";
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
      <main className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-10">
        <PageHeader title="Insights" lead="Add a course on Home first. Then this page shows why it has its status and what would help.">
          <RefreshButton />
        </PageHeader>
      </main>
    );

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Insights" lead="Why each class has its status, what would help, and how sure the model is.">
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
  const { now, makeReal, setMidterm, state } = usePathway();
  const [what, setWhat] = useState<Record<string, number>>({});
  const [burst, setBurst] = useState(0);
  const [planned, setPlanned] = useState(false);

  const tried = Object.keys(what).length > 0;
  const x = { ...c.x, ...what };
  const shown = tried ? score(c.tree, x) : c;
  // Only features that can change this tree's answer get a slider or a chip (the warning-sign
  // count the early tree splits on expands to the four habits behind it).
  const inTree = usedFeatures(c.tree);
  const levers = inTree.filter((f) => meta(f).role === "suggest");
  const context = inTree.filter((f) => meta(f).role !== "suggest" && f in c.x && !f.startsWith("course_"));
  const moves = tried
    ? Object.entries(what).filter(([f, v]) => v !== c.x[f]).map(([f, v]) => ({ feature: f, from: c.x[f], to: v }))
    : c.rec?.moves ?? [];
  const canPlan = moves.length > 0 && !shown.result.atRisk;

  const real = () => {
    makeReal(planBlocks(c, moves, now));
    setBurst((b) => b + 1);
    setPlanned(true);
  };

  return (
    <section aria-labelledby="course" className="mb-14">
      <header className="mb-6">
        <h2 id="course" className="text-[1.75rem] font-black leading-tight md:text-[2rem]">
          {c.code} <span className="font-bold text-muted">· {c.name}</span>
        </h2>
        <div className="mt-2 text-lg"><StatusMark atRisk={c.result.atRisk} size={24} /></div>
        <p className="mt-2 max-w-[65ch] text-lg">{reasonFor(c.steps)}</p>
        <p className="mt-1 text-muted">
          {c.exam.title} in {c.daysToExam} days · {fmtDay(c.exam.date)} · {c.horizon === "mid" ? "Mid-semester model (uses your midterm)" : "Early-semester model"}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
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
          <div className="panel relative p-5 md:p-6">
            <h3 className="text-xl font-black">What would help</h3>
            {c.rec && !tried && (
              <div className="mt-3 rounded-2xl bg-teal-soft p-4">
                <p className="font-bold text-teal-lip">Smallest change that leads to an on-track path:</p>
                <p className="mt-1 text-lg font-black">{c.rec.moves.map(moveText).join(" and ")}</p>
                <button onClick={() => setWhat(Object.fromEntries(c.rec!.moves.map((m) => [m.feature, m.to])))} className="btn btn-ghost mt-3 min-h-10 text-xs">
                  Try it
                </button>
              </div>
            )}
            {!c.rec && !tried && <p className="mt-2 text-muted">You&apos;re on track. Drag a slider to see what keeps you there.</p>}

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
                      onChange={(e) => (setWhat((w) => ({ ...w, [f]: +e.target.value })), setPlanned(false))}
                      className="slider mt-2"
                      style={{ ["--fill" as string]: `${((v - m.min) / (m.max - m.min)) * 100}%` }}
                    />
                  </label>
                );
              })}
            </div>

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

            <div className="relative mt-6">
              {burst > 0 && <Burst key={burst} />}
              {planned ? (
                <p className="flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-teal-soft font-extrabold text-teal-lip">
                  <Check size={20} strokeWidth={3} aria-hidden /> Added to your week
                </p>
              ) : (
                <BorderBeam size="md" colorVariant="ocean" theme="light" active={canPlan} borderRadius={14}>
                  <button onClick={real} disabled={!canPlan} className="btn btn-primary w-full">
                    Make it real
                  </button>
                </BorderBeam>
              )}
            </div>
            <p className="mt-2 text-sm text-muted" aria-live="polite">
              {planned
                ? "Study blocks are on your calendar. Find them on Home under Up next."
                : canPlan
                  ? `Adds up to 3 dated study blocks before ${fmtDay(c.exam.date)}.`
                  : "Move a slider until the path ends on track, or press Try it."}
            </p>
            {tried && (
              <button onClick={() => (setWhat({}), setPlanned(false))} className="mt-3 flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
                <RotateCcw size={14} aria-hidden /> Back to my real numbers
              </button>
            )}
          </div>

          <Midterm c={c} has={state.midterm[c.slug]} set={(v) => setMidterm(c.slug, v)} />
          <AdvisorNote c={c} moves={moves} />
        </div>
      </div>
    </section>
  );
}

// Spec "nice to have": one Gemini call drafts a short "here's what I'm working on" note from the
// status and the chosen change set. The student decides whether to send it; Pathway never does.
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

