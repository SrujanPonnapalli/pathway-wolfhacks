"use client";

// Study: one course, three tools. Quiz and flashcards are real (Gemini reads the slides you
// drop here); the timer is a real countdown. Every finished thing logs to the on-device
// model through logQuiz / logSession, exactly as before.

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Brain, Check, FileText, FileUp, Layers, Pause, Play, RotateCcw, Sparkles, Timer } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { VivaGlyph } from "@/components/Viva";
import { PageHeader } from "@/components/ui";
import { makeStudyMaterial } from "@/lib/api";
import type { CourseDoc } from "@/lib/coursework-data";
import { docsFor } from "@/lib/knowledge/sample";
import type { StudyMaterial } from "@/lib/intel/study";
import { usePathway } from "@/lib/store";

export function Study() {
  const { courses, logQuiz, logSession, knowledge } = usePathway();
  const params = useSearchParams();
  const [course, setCourse] = useState(params.get("course") ?? courses[0]?.slug ?? "");
  const focus = params.get("tool") ?? "quiz";
  const [material, setMaterial] = useState<StudyMaterial | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const code = courses.find((c) => c.slug === course)?.code ?? "";
  // The course's own materials (Courses tab): no upload needed to start a quiz or a deck.
  const docs = useMemo(() => (code ? docsFor(code, knowledge) : []), [code, knowledge]);

  const read = async (f: File | null) => {
    if (!f) return;
    setBusy(true);
    setErr("");
    try {
      setMaterial(await makeStudyMaterial(f, { quiz: 3, viva: 2, flashcards: 8 }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // A course file goes through the same route as a dropped one, as plain text.
  const fromDoc = (d: CourseDoc) => read(new File([`${d.title}\n\n${d.body}`], `${d.title}.txt`, { type: "text/plain" }));

  // Switching course clears the material so work is never logged against the wrong class.
  const pickCourse = (slug: string) => {
    setCourse(slug);
    setMaterial(null);
    setErr("");
  };

  // Arriving from a "Quiz me" or "Flashcards" link on Courses: start from that file right away.
  const wanted = params.get("doc");
  const started = useRef("");
  useEffect(() => {
    if (!wanted || started.current === wanted) return;
    const d = docs.find((x) => x.id === wanted);
    if (!d) return;
    started.current = wanted;
    const t = setTimeout(() => void fromDoc(d), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, docs]);

  return (
    <main className="mx-auto max-w-[760px] px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Study" lead="What you finish here updates your status on this device.">
        <label className="flex items-center gap-2 font-bold">
          Course
          <select value={course} onChange={(e) => pickCourse(e.target.value)} className="rounded-xl border-2 border-line bg-white px-3 py-2 font-bold">
            {courses.map((c) => (
              <option key={c.slug} value={c.slug}>{c.code}</option>
            ))}
          </select>
        </label>
      </PageHeader>

      <nav aria-label="Tools" className="mb-6 flex gap-2">
        {[
          { id: "quiz", label: "Quiz", icon: Brain },
          { id: "flashcards", label: "Flashcards", icon: Layers },
          { id: "timer", label: "Timer", icon: Timer },
        ].map(({ id, label, icon: Icon }) => (
          <Link key={id} href={`/study?tool=${id}&course=${course}`} aria-current={focus === id ? "page" : undefined} className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 font-bold ${focus === id ? "border-teal-face bg-teal-soft text-teal-lip" : "border-line bg-white text-muted hover:text-ink"}`}>
            <Icon size={18} aria-hidden /> {label}
          </Link>
        ))}
      </nav>

      {focus !== "timer" && (
        <section className="mb-6">
          {!material ? (
            <>
              {docs.length > 0 && (
                <div className="mb-3 rounded-2xl border-2 border-line p-3">
                  <p className="flex items-center justify-between gap-3 px-1 text-sm font-bold">
                    <span>{code} materials{busy && <span className="ml-2 inline-flex items-center gap-1.5 font-semibold text-muted"><ThinkingOrb state="solving" size={20} theme="light" color="#1a6fd1" aria-hidden /> Reading…</span>}</span>
                    <Link href={`/courses?course=${course}&tab=materials`} className="text-xs font-extrabold uppercase tracking-wider text-teal">All on Courses</Link>
                  </p>
                  <ul className="mt-1 divide-y divide-line/70">
                    {docs.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 py-2">
                        <FileText size={18} className="shrink-0 text-sky" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold">{d.title}</span>
                          <span className="block text-xs text-muted">{d.type}{d.week ? ` · week ${d.week}` : ""}{d.sample ? " · sample" : " · yours"}</span>
                        </span>
                        <button onClick={() => fromDoc(d)} disabled={busy} className="btn btn-ghost min-h-9 shrink-0 px-3 text-xs disabled:opacity-60">
                          {focus === "flashcards" ? "Make a deck" : "Quiz me"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-line px-4 py-4 hover:bg-polar">
                <FileUp size={22} className="shrink-0 text-teal" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{docs.length ? "Or drop" : "Drop"} this week&apos;s slides or notes for {code || "this course"}</span>
                  <span className="block text-sm text-muted">Gemini writes the questions from your material only.</span>
                </span>
                {busy && !docs.length && <span className="flex items-center gap-1.5 text-sm text-muted"><ThinkingOrb state="solving" size={20} theme="light" color="#1a6fd1" aria-hidden /> Reading…</span>}
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" className="sr-only" onChange={(e) => read(e.target.files?.[0] ?? null)} />
              </label>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Check size={15} strokeWidth={3} className="text-teal" aria-hidden /> {material.title} · {material.topics.slice(0, 3).join(", ")}
              <button onClick={() => setMaterial(null)} className="ml-auto font-bold text-teal">Change file</button>
            </p>
          )}
          {err && <p role="alert" className="mt-2 text-sm font-bold text-sun-ink">{err}</p>}
        </section>
      )}

      {focus === "quiz" && <Quiz key={material?.title ?? "none"} course={course} material={material} onDone={() => course && logQuiz(course)} />}
      {focus === "flashcards" && <Flashcards key={material?.title ?? "none"} course={course} material={material} onDone={() => course && logSession(course)} />}
      {focus === "timer" && <FocusTimer course={course} onDone={() => course && logSession(course)} />}

      <Link href="/viva?mode=voice" className="mt-10 flex items-center gap-4 border-t-2 border-line pt-6 hover:text-teal">
        <VivaGlyph size={36} className="shrink-0 text-sky" />
        <span className="text-sm text-muted">Want to talk it through? Viva can quiz you out loud.</span>
      </Link>
    </main>
  );
}

function Quiz({ material, course, onDone }: { material: StudyMaterial | null; course: string; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  if (!material) return <p className="text-muted">Drop a file above to get three questions.</p>;
  const q = material.quiz[i];
  if (finished || !q)
    return (
      <div className="panel p-6 border-2 border-teal/40">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-teal text-white">
            <Check size={20} strokeWidth={3} />
          </span>
          <div>
            <p className="text-xl font-black text-ink">{score} of {material.quiz.length} correct</p>
            <p className="text-xs text-muted">Practice quiz completed</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-teal/20 bg-teal-soft/60 p-4">
          <div className="flex items-center gap-1.5 font-black text-xs text-teal-lip">
            <Sparkles size={14} className="text-teal" />
            <span>Telemetry Logged &middot; Model Re-evaluated On-Device</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            This quiz was added to your practice count. Your standing and recourse path have updated in real time.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href={`/insights?course=${course}`} className="btn btn-primary text-xs">
            See Updated Path in Insights &rarr;
          </Link>
          <button
            onClick={() => { setI(0); setPicked(null); setScore(0); setFinished(false); }}
            className="btn btn-ghost text-xs"
          >
            <RotateCcw size={14} aria-hidden /> Again
          </button>
        </div>
      </div>
    );
  const answer = (k: number) => {
    if (picked !== null) return;
    setPicked(k);
    if (k === q.answer_index) setScore((s) => s + 1);
  };
  const next = () => {
    if (i + 1 >= material.quiz.length) {
      setFinished(true);
      onDone();
    } else {
      setI(i + 1);
      setPicked(null);
    }
  };
  return (
    <div className="panel p-5">
      <p className="text-sm font-bold text-muted">Question {i + 1} of {material.quiz.length} · {q.topic}</p>
      <p className="mt-1 text-lg font-extrabold leading-snug">{q.question}</p>
      <ul className="mt-4 space-y-2">
        {q.options.map((o, k) => {
          const state = picked === null ? "" : k === q.answer_index ? "border-teal-face bg-teal-soft" : k === picked ? "border-sun bg-sun-soft" : "opacity-60";
          return (
            <li key={k}>
              <button onClick={() => answer(k)} disabled={picked !== null} className={`w-full rounded-xl border-2 border-line bg-white px-4 py-3 text-left font-bold transition-colors hover:bg-polar disabled:cursor-default ${state}`}>{o}</button>
            </li>
          );
        })}
      </ul>
      {picked === null ? (
        <details className="mt-3 text-sm text-muted"><summary className="cursor-pointer font-bold text-teal">Hint</summary>{q.hint}</details>
      ) : (
        <div className="mt-3">
          <p className="text-sm"><span className="font-bold">{picked === q.answer_index ? "Right." : "Not quite."}</span> {q.explanation} <span className="text-muted">({q.source_ref})</span></p>
          <button onClick={next} className="btn btn-primary mt-3">{i + 1 >= material.quiz.length ? "Finish" : "Next"}</button>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">Questions generated by Gemini from your file.</p>
    </div>
  );
}

function Flashcards({ material, course, onDone }: { material: StudyMaterial | null; course: string; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);
  if (!material) return <p className="text-muted">Drop a file above to get a deck.</p>;
  const cards = material.flashcards;
  const c = cards[i];

  if (finished || !c) {
    return (
      <div className="panel p-6 border-2 border-teal/40">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-teal text-white">
            <Check size={20} strokeWidth={3} />
          </span>
          <div>
            <p className="text-xl font-black text-ink">Deck Completed</p>
            <p className="text-xs text-muted">Reviewed {cards.length} cards</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-teal/20 bg-teal-soft/60 p-4">
          <div className="flex items-center gap-1.5 font-black text-xs text-teal-lip">
            <Sparkles size={14} className="text-teal" />
            <span>Study Session Logged &middot; Model Re-evaluated</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Flashcard review logged to device telemetry. Pace-projected study sessions updated in the decision tree.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href={`/insights?course=${course}`} className="btn btn-primary text-xs">
            See Updated Path in Insights &rarr;
          </Link>
          <button
            onClick={() => { setI(0); setFlipped(false); setFinished(false); }}
            className="btn btn-ghost text-xs"
          >
            <RotateCcw size={14} aria-hidden /> Review Again
          </button>
        </div>
      </div>
    );
  }

  const last = i + 1 >= cards.length;
  return (
    <div className="panel p-5">
      <p className="text-sm font-bold text-muted">Card {i + 1} of {cards.length} · {c.topic}</p>
      <button onClick={() => setFlipped((f) => !f)} className="mt-2 flex min-h-40 w-full items-center justify-center rounded-2xl border-2 border-line bg-polar p-6 text-center text-lg font-extrabold leading-snug hover:bg-white" aria-live="polite">
        {flipped ? <span className="font-bold">{c.back}</span> : c.front}
      </button>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setFlipped((f) => !f)} className="btn btn-ghost min-h-10 px-4 text-xs">Flip</button>
        <button onClick={() => { if (last) { onDone(); setFinished(true); } else setI(i + 1); setFlipped(false); }} className="btn btn-primary min-h-10 px-4 text-xs">{last ? "Finish deck" : "Next"}</button>
      </div>
    </div>
  );
}

function FocusTimer({ course, onDone }: { course: string; onDone: () => void }) {
  const TOTAL = 25 * 60;
  const [left, setLeft] = useState(TOTAL);
  const [running, setRunning] = useState(false);
  const [logged, setLogged] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    if (!running) return;
    ref.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          if (ref.current) clearInterval(ref.current);
          setTimeout(() => {
            setRunning(false);
            setLogged(true);
            doneRef.current();
          }, 0);
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);

  const triggerDone = () => {
    setRunning(false);
    setLeft(TOTAL);
    setLogged(true);
    onDone();
  };

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div className="panel p-5 text-center">
      <p className="text-5xl font-extrabold tabular-nums tracking-tight">{mm}:{ss}</p>
      <p className="mt-1 text-sm text-muted">25-minute focus block. Logs a session when it ends.</p>
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={() => setRunning((r) => !r)} className="btn btn-primary min-h-10 px-4 text-xs">{running ? <><Pause size={15} aria-hidden /> Pause</> : <><Play size={15} aria-hidden /> Start</>}</button>
        <button onClick={() => { setRunning(false); setLeft(TOTAL); setLogged(false); }} className="btn btn-ghost min-h-10 px-4 text-xs"><RotateCcw size={15} aria-hidden /> Reset</button>
        <button onClick={triggerDone} className="btn btn-ghost min-h-10 px-4 text-xs">Log 25 min now</button>
      </div>

      {logged && (
        <div className="mt-5 rounded-xl border border-teal/20 bg-teal-soft/60 p-4 text-left">
          <div className="flex items-center gap-2 font-black text-xs text-teal-lip">
            <Sparkles size={14} className="text-teal" />
            <span>25-Minute Focus Session Logged On-Device</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Logged to study telemetry. Average weekly study hours and session counts updated in your decision tree.
          </p>
          <Link href={`/insights?course=${course}`} className="mt-2 inline-block text-xs font-black text-teal underline underline-offset-4">
            Check your updated standing on Insights &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
