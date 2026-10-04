"use client";

// Study: one course, three tools. Quiz and flashcards are real (Gemini reads the slides you
// drop here); the timer is a real countdown. Every finished thing logs to the on-device
// model through logQuiz / logSession, exactly as before.

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Brain, Check, FileText, FileUp, Layers, Pause, Play, RefreshCw, RotateCcw, Sparkles, Timer } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { VivaGlyph } from "@/components/Viva";
import { PageHeader } from "@/components/ui";
import { makeStudyMaterial } from "@/lib/api";
import type { CourseDoc } from "@/lib/coursework-data";
import { docsFor } from "@/lib/knowledge/sample";
import { readyDeck } from "@/lib/knowledge/studyDecks";
import type { StudyMaterial } from "@/lib/intel/study";
import { usePathway } from "@/lib/store";
import { ReviewList } from "./ReviewList";
import { FOCUS_SECONDS, MarkBlockDone, clock, useStudyTimer } from "@/components/StudyTimer";

export function Study() {
  const { courses, logQuiz, logSession, knowledge, saveMaterial } = usePathway();
  const params = useSearchParams();
  const [course, setCourse] = useState(params.get("course") ?? courses[0]?.slug ?? "");
  const focus = params.get("tool") ?? "quiz";
  const [material, setMaterial] = useState<StudyMaterial | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const code = courses.find((c) => c.slug === course)?.code ?? "";
  // The course's own materials (Courses tab): no upload needed to start a quiz or a deck.
  const docs = useMemo(() => (code ? docsFor(code, knowledge) : []), [code, knowledge]);

  const read = async (f: File | null, focus?: string) => {
    if (!f) return;
    setBusy(true);
    setErr("");
    try {
      const m = await makeStudyMaterial(f, { quiz: 3, viva: 2, flashcards: 8, concepts: 4 }, focus);
      setMaterial(m);
      if (course) saveMaterial(course, m); // Viva's Teach mode reads its concepts from here
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // A course file goes through the same route as a dropped one, as plain text.
  const fromDoc = (d: CourseDoc) => read(new File([`${d.title}\n\n${d.body}`], `${d.title}.txt`, { type: "text/plain" }));
  // Built-in lecture files come with a deck and quiz made ahead of time (npm run kb:decks): open those at once.
  const readyFor = (d: CourseDoc & { sample?: boolean }) => (d.sample ? readyDeck(d.id, d.title, d.body) : undefined);
  const openDoc = (d: CourseDoc & { sample?: boolean }) => {
    const m = readyFor(d);
    if (!m) return fromDoc(d);
    setErr("");
    setMaterial(m);
    if (course) saveMaterial(course, m);
  };

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
    const t = setTimeout(() => void openDoc(d), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, docs]);

  return (
    <main className="mx-auto max-w-narrow px-4 py-6 md:px-10 md:py-10">
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

      <nav aria-label="Tools" className="mb-6 grid grid-cols-3 gap-2 sm:flex">
        {[
          { id: "quiz", label: "Quiz", icon: Brain },
          { id: "flashcards", label: "Flashcards", icon: Layers },
          { id: "timer", label: "Timer", icon: Timer },
        ].map(({ id, label, icon: Icon }) => (
          <Link key={id} href={`/study?tool=${id}&course=${course}`} aria-current={focus === id ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 py-2 text-sm font-bold sm:min-h-11 sm:flex-row sm:gap-2 sm:px-3 sm:text-base ${focus === id ? "border-teal-face bg-teal-soft text-teal-lip" : "border-line bg-white text-muted hover:text-ink"}`}>
            <Icon size={18} aria-hidden /> {label}
          </Link>
        ))}
      </nav>

      {focus !== "timer" && (
        <section className="mb-6">
          {!material ? (
            <>
              <ReviewList course={course} tool={focus} busy={busy} docs={docs} onPick={(f, why) => void read(f, why)} />
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
                        {(() => {
                          const ready = readyFor(d);
                          return (
                            <>
                              {ready && focus === "flashcards" && <span className="hidden shrink-0 text-xs font-bold text-teal sm:inline">{ready.flashcards.length} cards ready</span>}
                              <button onClick={() => void openDoc(d)} disabled={busy} className="btn btn-ghost min-h-9 shrink-0 px-3 text-xs disabled:opacity-60">
                                {focus === "flashcards" ? (ready ? "Open deck" : "Make a deck") : "Quiz me"}
                              </button>
                              {ready && (
                                <button onClick={() => fromDoc(d)} disabled={busy} title={focus === "flashcards" ? "Make a new deck with Gemini" : "Make new questions with Gemini"} aria-label={`${focus === "flashcards" ? "Make a new deck" : "Make new questions"} from ${d.title} with Gemini`} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-polar hover:text-teal disabled:opacity-60">
                                  <RefreshCw size={15} aria-hidden />
                                </button>
                              )}
                            </>
                          );
                        })()}
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
      {focus === "timer" && <FocusTimer course={course} />}

      <Link href={`/viva?mode=teach&course=${course}`} className="mt-10 flex items-center gap-4 border-t-2 border-line pt-6 hover:text-teal">
        <VivaGlyph size={36} className="shrink-0 text-sky" />
        <span className="text-sm text-muted">Think you&apos;ve got it? Teach it to Viva: explain a concept from these slides out loud and Viva tells you what&apos;s still fuzzy.</span>
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
  const cards = material?.flashcards ?? [];
  // The round being worked through (indices into cards); "Review missed" starts a new round of just those.
  const [round, setRound] = useState<number[]>(() => cards.map((_, k) => k));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [missed, setMissed] = useState<number[]>([]);
  const logged = useRef(false);
  const idx = round[pos];
  const c = idx === undefined ? undefined : cards[idx];
  const done = !c;

  const restart = (next: number[]) => {
    setRound(next);
    setPos(0);
    setFlipped(false);
    setMissed([]);
  };
  const mark = (right: boolean) => {
    if (!flipped || idx === undefined) return;
    if (!right) setMissed((m) => [...m, idx]);
    setFlipped(false);
    setPos(pos + 1);
    // The first deck finished logs one session; review rounds don't log again.
    if (pos + 1 >= round.length && !logged.current) {
      logged.current = true;
      onDone();
    }
  };

  // Space / Enter flips; once flipped, ← or 1 = missed, → or 2 = got it. Ignored while typing elsewhere.
  const keys = useRef({ flip: () => setFlipped((f) => !f), mark });
  useEffect(() => {
    keys.current = { flip: () => setFlipped((f) => !f), mark };
  });
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable=true]")) return;
      const k = e.key;
      if (k === " " || k === "Enter") keys.current.flip();
      else if (k === "ArrowLeft" || k === "1") keys.current.mark(false);
      else if (k === "ArrowRight" || k === "2") keys.current.mark(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done]);

  if (!material) return <p className="text-muted">Drop a file above to get a deck.</p>;
  if (!cards.length) return <p className="text-muted">No flashcards came out of that file. Try another one.</p>;

  if (done) {
    const right = round.length - missed.length;
    return (
      <div className="panel p-6 border-2 border-teal/40">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-teal text-white">
            <Check size={20} strokeWidth={3} />
          </span>
          <div>
            <p className="text-xl font-black text-ink">Deck Completed</p>
            <p className="text-xs text-muted">Got {right} of {round.length} right{missed.length ? ` · ${missed.length} to review` : ""}</p>
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

        {missed.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {missed.map((k) => (
              <li key={k} className="rounded-xl border-2 border-line px-3 py-2 text-sm">
                <span className="font-extrabold">{cards[k].front}</span>
                <span className="block font-semibold text-muted">{cards[k].back}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap gap-2.5">
          {missed.length > 0 && (
            <button onClick={() => restart(missed)} className="btn btn-primary text-xs">
              Review {missed.length} missed
            </button>
          )}
          <Link href={`/insights?course=${course}`} className={`btn text-xs ${missed.length ? "btn-ghost" : "btn-primary"}`}>
            See Updated Path in Insights &rarr;
          </Link>
          <button onClick={() => restart(cards.map((_, k) => k))} className="btn btn-ghost text-xs">
            <RotateCcw size={14} aria-hidden /> Whole deck again
          </button>
        </div>
      </div>
    );
  }

  const face = "col-start-1 row-start-1 flex min-h-48 items-center justify-center rounded-2xl border-2 p-6 text-center text-lg leading-snug [backface-visibility:hidden]";
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3 text-sm font-bold text-muted">
        <p>Card {pos + 1} of {round.length} · {c.topic}</p>
        {missed.length > 0 && <p className="text-flame-ink">{missed.length} missed</p>}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-teal-face transition-[width] duration-300" style={{ width: `${(pos / round.length) * 100}%` }} />
      </div>

      <div className="mt-3 [perspective:1200px]">
        {/* key: a new card starts face-up without animating back from the previous card's answer. */}
        <button
          key={`${pos}-${idx}`}
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? `Answer: ${c.back}. Press to see the question.` : `Question: ${c.front}. Press to flip.`}
          className="grid w-full transition-transform duration-500 ease-[cubic-bezier(0.3,0.7,0.2,1)] [transform-style:preserve-3d] motion-reduce:transition-none"
          style={{ transform: flipped ? "rotateY(180deg)" : "none" }}
        >
          <span className={`${face} border-line bg-polar font-extrabold hover:bg-white`}>{c.front}</span>
          <span className={`${face} border-teal/40 bg-teal-soft font-bold text-teal-lip [transform:rotateY(180deg)]`}>{c.back}</span>
        </button>
      </div>
      <p className="sr-only" aria-live="polite">{flipped ? c.back : ""}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {flipped ? (
          <>
            <button onClick={() => mark(false)} className="btn btn-ghost min-h-10 px-4 text-xs">
              Missed it <kbd className="ml-1 font-sans text-[10px] text-muted">←</kbd>
            </button>
            <button onClick={() => mark(true)} className="btn btn-primary min-h-10 px-4 text-xs">
              <Check size={14} strokeWidth={3} aria-hidden /> Got it <kbd className="ml-1 font-sans text-[10px] opacity-70">→</kbd>
            </button>
          </>
        ) : (
          <button onClick={() => setFlipped(true)} className="btn btn-primary min-h-10 px-4 text-xs">
            Flip <kbd className="ml-1 font-sans text-[10px] opacity-70">Space</kbd>
          </button>
        )}
        <p className="ml-auto text-xs font-bold text-muted max-sm:hidden">Space flips · ← missed · → got it</p>
      </div>
    </div>
  );
}

function FocusTimer({ course }: { course: string }) {
  // The timer itself lives in the app shell (src/components/StudyTimer.tsx), so switching to the quiz,
  // flashcards or another page keeps it running; this tab is its full-size view.
  const t = useStudyTimer();
  const { courses } = usePathway();
  const left = t.status === "idle" ? FOCUS_SECONDS : t.left;
  const running = t.status === "running";
  const logged = t.status === "done";
  const other = t.status !== "idle" && t.course && t.course !== course ? (courses.find((c) => c.slug === t.course)?.code ?? "") : "";
  const mm = clock(left).slice(0, 2);
  const ss = clock(left).slice(3);
  return (
    <div className="panel p-5 text-center">
      <p className="text-5xl font-extrabold tabular-nums tracking-tight">{mm}:{ss}</p>
      <p className="mt-1 text-sm text-muted">25-minute focus block. Logs a session when it ends, and keeps running while you switch to a quiz, flashcards or another page.</p>
      {other && <p className="mt-1 text-xs font-bold text-teal">Running for {other}</p>}
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={() => (running ? t.pause() : t.status === "paused" ? t.resume() : t.start(course))} className="btn btn-primary min-h-10 px-4 text-xs">{running ? <><Pause size={15} aria-hidden /> Pause</> : <><Play size={15} aria-hidden /> {t.status === "paused" ? "Resume" : "Start"}</>}</button>
        <button onClick={t.reset} className="btn btn-ghost min-h-10 px-4 text-xs"><RotateCcw size={15} aria-hidden /> Reset</button>
        <button onClick={() => t.logNow(course)} className="btn btn-ghost min-h-10 px-4 text-xs">Log 25 min now</button>
      </div>

      {logged && (
        <div className="mt-5 rounded-xl border border-teal/20 bg-teal-soft/60 p-4 text-left">
          <div className="flex items-center gap-2 font-black text-xs text-teal-lip">
            <Sparkles size={14} className="text-teal" />
            <span>25-minute focus session logged</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Saved as a study session: it counts toward your sessions on Insights, your streak, and the effort your buddies see.
          </p>
          <Link href={`/insights?course=${course}`} className="mt-2 inline-block text-xs font-black text-teal underline underline-offset-4">
            See your sessions on Insights &rarr;
          </Link>
          <div>
            <MarkBlockDone course={t.course || course} />
          </div>
        </div>
      )}
    </div>
  );
}
