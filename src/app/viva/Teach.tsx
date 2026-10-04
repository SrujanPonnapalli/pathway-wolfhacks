"use client";

// Teach mode: the Feynman technique. The student picks a concept from their own uploaded
// material and explains it to Viva, out loud or typed. Viva plays a curious beginner and checks
// the explanation against the concept's key points only: what landed, what was fuzzy, one hint
// at a gap, and the question a beginner would ask next. Up to three rounds, then a summary;
// finishing logs a practice quiz to the on-device model, like a quiz in Study.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, ArrowUp, BookOpen, Check, CircleDashed, FastForward, Keyboard, Loader2, Mic, PhoneOff, RotateCcw, Sparkles, Square } from "lucide-react";
import { VoiceBeam } from "voice-glow";
import { VivaAvatar, VivaGlyph } from "@/components/Viva";
import { teachFeedback } from "@/lib/api";
import type { Concept } from "@/lib/intel/study";
import { usePathway, type ChatMsg } from "@/lib/store";
import { MAX_ROUNDS, clearCount, finished, spoken, tally, type PointStatus, type TeachRound } from "@/lib/teach";
import { useVoiceSession } from "@/lib/voice";

export function Teach() {
  const { courses, state, logTeach, archiveChat } = usePathway();
  const params = useSearchParams();
  const [course, setCourse] = useState(() => {
    const asked = params.get("course");
    if (asked && courses.some((c) => c.slug === asked)) return asked;
    return courses.find((c) => state.materials[c.slug]?.concepts?.length)?.slug ?? courses[0]?.slug ?? "";
  });
  const [concept, setConcept] = useState<Concept | null>(null);
  const [done, setDone] = useState<TeachRound[] | null>(null);

  const finish = (rounds: TeachRound[], transcript: ChatMsg[]) => {
    if (!concept) return;
    if (!rounds.length) return setConcept(null);
    const status = tally(concept, rounds);
    logTeach(course, concept.topic, clearCount(status), status.length);
    archiveChat(`Explained: ${concept.topic}`, transcript);
    setDone(rounds);
  };

  if (concept && done)
    return <Summary concept={concept} rounds={done} course={course} onAgain={() => (setConcept(null), setDone(null))} />;
  if (concept) return <Session key={concept.topic} concept={concept} onFinish={finish} onBack={() => setConcept(null)} />;
  return <Picker course={course} setCourse={setCourse} onStart={setConcept} />;
}

function Picker({ course, setCourse, onStart }: { course: string; setCourse: (slug: string) => void; onStart: (c: Concept) => void }) {
  const { courses, state } = usePathway();
  const [picked, setPicked] = useState(0);
  const material = state.materials[course];
  const concepts = material?.concepts ?? [];
  const code = courses.find((c) => c.slug === course)?.code ?? "this course";
  const study = `/study?tool=quiz&course=${course}`;

  return (
    <section aria-label="Pick a concept to teach" className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black">Teach Viva a concept</h2>
        <label className="flex items-center gap-2 font-bold">
          Course
          <select value={course} onChange={(e) => (setCourse(e.target.value), setPicked(0))} className="rounded-xl border-2 border-line bg-white px-3 py-2 font-bold">
            {courses.map((c) => (
              <option key={c.slug} value={c.slug}>{c.code}</option>
            ))}
          </select>
        </label>
      </div>

      {!material ? (
        <NoConcepts href={study}>No study material for {code} yet. Drop this week&apos;s slides or notes in Study and Viva will pick the concepts you can teach.</NoConcepts>
      ) : !concepts.length ? (
        <NoConcepts href={study}>&ldquo;{material.title}&rdquo; was read before Teach mode existed. Drop it in Study again to get concepts to teach.</NoConcepts>
      ) : (
        <>
          <fieldset className="mt-4">
            <legend className="text-sm font-bold text-muted">From &ldquo;{material.title}&rdquo;</legend>
            <div className="mt-2 space-y-2">
              {concepts.map((c, i) => (
                <label key={c.topic} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-colors ${picked === i ? "border-sky bg-sky-soft/50" : "border-line bg-white hover:bg-polar"}`}>
                  <input type="radio" name="concept" checked={picked === i} onChange={() => setPicked(i)} className="size-4 accent-sky" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold">{c.topic}</span>
                    <span className="block text-xs font-bold text-muted">{c.key_points.length} key ideas · {c.source_ref}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button onClick={() => onStart(concepts[Math.min(picked, concepts.length - 1)])} className="btn btn-sky mt-5">
            <Mic size={18} aria-hidden /> Start explaining
          </button>
          <p className="mt-3 text-sm text-muted">Viva only checks against key ideas from your own material, so it can&apos;t mark you down for something your slides don&apos;t cover.</p>
        </>
      )}
    </section>
  );
}

function NoConcepts({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl border-2 border-dashed border-line px-4 py-4">
      <p className="text-muted">{children}</p>
      <Link href={href} className="btn btn-ghost text-xs">
        <BookOpen size={15} aria-hidden /> Open Study
      </Link>
    </div>
  );
}

const STATE_LABEL: Record<string, string> = {
  idle: "Tap Start when you're ready to explain",
  connecting: "Connecting…",
  listening: "Listening… take your time",
  thinking: "Viva is checking your notes…",
  speaking: "Viva is speaking",
  error: "Something went wrong. Try again.",
};

function Session({ concept, onFinish, onBack }: { concept: Concept; onFinish: (rounds: TeachRound[], transcript: ChatMsg[]) => void; onBack: () => void }) {
  const [rounds, setRounds] = useState<TeachRound[]>([]);
  const roundsRef = useRef<TeachRound[]>([]); // the voice loop reads this between renders
  const transcript = useRef<ChatMsg[]>([]);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const status = tally(concept, rounds);
  const over = rounds.length > 0 && finished(status, rounds.length);
  const opener = `Explain ${concept.topic} to me like I've never heard of it.`;
  const prompt = rounds.at(-1)?.feedback.follow_up || opener;

  // One round: the explanation and the earlier rounds go to /api/feynman; returns what Viva says back.
  const explain = async (text: string) => {
    const feedback = await teachFeedback(concept, text, roundsRef.current);
    const next = [...roundsRef.current, { explanation: text, feedback }];
    roundsRef.current = next;
    setRounds(next);
    return spoken(feedback, tally(concept, next), next.length);
  };

  const v = useVoiceSession({
    greeting: () => roundsRef.current.at(-1)?.feedback.follow_up || opener,
    reply: explain,
    onTurn: (who, text) => {
      transcript.current.push({ role: who, text });
      const r = roundsRef.current;
      if (who === "viva" && r.length && finished(tally(concept, r), r.length)) v.stop(); // last word said: stop listening
    },
    turn: { silenceMs: 2500, maxMs: 120_000 }, // explaining has thinking pauses and runs long
  });
  useEffect(() => () => v.stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const text = String(new FormData(form).get("explanation") ?? "").trim();
    if (!text || busy) return;
    setBusy(true);
    setErr("");
    try {
      const reply = await explain(text);
      // Viva's replies end on its next question, so only the opener needs adding.
      if (!transcript.current.length) transcript.current.push({ role: "viva", text: opener });
      transcript.current.push({ role: "you", text }, { role: "viva", text: reply });
      form.reset();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const end = () => {
    v.stop();
    onFinish(roundsRef.current, transcript.current);
  };

  return (
    <section aria-label={`Teach Viva: ${concept.topic}`} className="panel px-5 py-6 md:px-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
            Teaching Viva · Round {over ? rounds.length : Math.min(rounds.length + 1, MAX_ROUNDS)} of {MAX_ROUNDS}
          </p>
          <h2 className="text-2xl font-black">{concept.topic}</h2>
        </div>
        <Progress status={status} />
      </div>

      {!typing && (
        <div className="flex flex-col items-center text-center">
          <VivaAvatar size={200} state={v.state} input={v.input} output={v.output} />
          <p className="mt-2 text-lg font-black" aria-live="polite">
            {v.state === "listening" && !v.micOn ? "Your microphone is off, so type your explanation instead." : STATE_LABEL[v.state]}
          </p>
          {v.notice && <p role="status" className="mt-1 text-sm font-bold text-muted">{v.notice}</p>}
          <VoiceBeam level={v.input} active={v.state === "listening"} colorVariant="ocean" theme="light" borderRadius={16} className="mt-4 w-full max-w-xl">
            <div className="min-h-24 w-full rounded-2xl bg-polar px-5 py-4 text-left">
              {v.caption ? (
                <p className="text-lg">
                  <span className={`font-black ${v.caption.who === "viva" ? "text-sky" : "text-teal"}`}>{v.caption.who === "viva" ? "Viva" : "You"}: </span>
                  {v.caption.text}
                </p>
              ) : (
                <p className="text-muted">{over ? "That's the session. See how you did below." : <>Viva will ask: &ldquo;{prompt}&rdquo;</>}</p>
              )}
            </div>
          </VoiceBeam>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {v.active ? (
              <>
                {v.state === "listening" && v.micOn && (
                  <button onClick={v.finish} className="btn btn-sky">
                    <Square size={16} className="fill-current" aria-hidden /> Done explaining
                  </button>
                )}
                {v.state === "speaking" && (
                  <button onClick={v.skip} className="btn btn-ghost" title="Skip to the end of Viva's reply">
                    <FastForward size={18} aria-hidden /> Skip
                  </button>
                )}
                <button onClick={v.stop} className="btn btn-danger">
                  <PhoneOff size={18} aria-hidden /> Stop
                </button>
              </>
            ) : (
              !over && (
                <button onClick={v.start} className="btn btn-sky">
                  <Mic size={18} aria-hidden /> {rounds.length ? "Keep talking" : "Start talking"}
                </button>
              )
            )}
            {!over && (
              <button onClick={() => (v.stop(), setTyping(true))} className="btn btn-ghost">
                <Keyboard size={18} aria-hidden /> Type instead
              </button>
            )}
          </div>
        </div>
      )}

      {typing && !over && (
        <form onSubmit={submit}>
          <div className="flex gap-3">
            <VivaGlyph size={32} className="mt-1 shrink-0 text-sky" />
            <p className="rounded-2xl rounded-tl-md border-2 border-sky/25 bg-sky-soft px-4 py-3">{prompt}</p>
          </div>
          <label htmlFor="explanation" className="sr-only">Your explanation</label>
          <textarea
            id="explanation"
            name="explanation"
            rows={6}
            placeholder="Explain it in your own words, as if to a friend…"
            className="mt-3 w-full rounded-2xl border-2 border-line bg-white p-4 font-bold outline-none placeholder:text-muted focus:border-sky"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={busy} className="btn btn-sky">
              {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ArrowUp size={18} strokeWidth={3} aria-hidden />}
              {busy ? "Viva is checking your notes…" : "Send to Viva"}
            </button>
            <button type="button" onClick={() => setTyping(false)} className="btn btn-ghost">
              <Mic size={18} aria-hidden /> Talk instead
            </button>
          </div>
          {err && <p role="alert" className="mt-2 text-sm font-bold text-sun-ink">{err}</p>}
        </form>
      )}

      {rounds.length > 0 && <Feedback concept={concept} round={rounds[rounds.length - 1]} n={rounds.length} over={over} />}

      <div className="mt-6 flex flex-wrap gap-2 border-t-2 border-line pt-4">
        {rounds.length > 0 && (
          <button onClick={end} className={over ? "btn btn-sky" : "btn btn-ghost"}>
            <Check size={18} strokeWidth={3} aria-hidden /> {over ? "See how you did" : "Finish"}
          </button>
        )}
        <button onClick={() => (v.stop(), onBack())} className="btn btn-ghost">Pick another concept</button>
      </div>
    </section>
  );
}

function Progress({ status }: { status: PointStatus[] }) {
  const n = clearCount(status);
  const total = status.length || 1;
  return (
    <div className="w-40">
      <p className="text-right text-sm font-black">{n} / {status.length} ideas clear</p>
      <div role="progressbar" aria-label="Key ideas explained clearly" aria-valuemin={0} aria-valuemax={status.length} aria-valuenow={n} className="mt-1 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-teal transition-[width] duration-500" style={{ width: `${(n / total) * 100}%` }} />
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        <span className="font-black">{label}: </span>
        {children}
      </span>
    </li>
  );
}

function Feedback({ concept, round, n, over }: { concept: Concept; round: TeachRound; n: number; over: boolean }) {
  const f = round.feedback;
  return (
    <section aria-live="polite" aria-label={`Feedback on round ${n}`} className="mt-6 rounded-2xl border-2 border-sky/25 bg-sky-soft/40 p-4">
      <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Round {n} feedback</p>
      {f.encouragement && <p className="mt-1 font-bold">{f.encouragement}</p>}
      <ul className="mt-3 space-y-2 text-sm">
        {f.clear.map((i) => (
          <Row key={`c${i}`} icon={<Check size={16} strokeWidth={3} className="text-teal" aria-hidden />} label="Clear">{concept.key_points[i]}</Row>
        ))}
        {f.vague.map((x) => (
          <Row key={`v${x.point}`} icon={<CircleDashed size={16} className="text-sun-ink" aria-hidden />} label="Unclear">{x.note}</Row>
        ))}
        {f.check_notes.map((s, i) => (
          <Row key={`n${i}`} icon={<BookOpen size={16} className="text-sun-ink" aria-hidden />} label="Check your notes">{s}</Row>
        ))}
        {!over && f.hint && (
          <Row icon={<ArrowRight size={16} className="text-sky" aria-hidden />} label="Hint">{f.hint}</Row>
        )}
      </ul>
      {!over && f.follow_up && (
        <p className="mt-3 flex gap-2">
          <VivaGlyph size={22} className="shrink-0 text-sky" />
          <span>
            <span className="font-black text-sky">Viva asks: </span>
            {f.follow_up}
          </span>
        </p>
      )}
    </section>
  );
}

function Summary({ concept, rounds, course, onAgain }: { concept: Concept; rounds: TeachRound[]; course: string; onAgain: () => void }) {
  const status = tally(concept, rounds);
  const n = clearCount(status);
  const label: Record<PointStatus, string> = { clear: "Clear", vague: "Fuzzy", missing: "Not yet" };
  return (
    <section aria-label="How you did" className="panel border-2 border-teal/40 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-teal text-white">
          <Check size={20} strokeWidth={3} />
        </span>
        <div>
          <p className="text-xl font-black text-ink">You taught Viva {concept.topic}</p>
          <p className="text-xs text-muted">
            {n} of {status.length} key ideas explained clearly · {rounds.length} {rounds.length === 1 ? "round" : "rounds"}
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-2 text-sm">
        {concept.key_points.map((p, i) => (
          <Row
            key={i}
            icon={status[i] === "clear" ? <Check size={16} strokeWidth={3} className="text-teal" aria-hidden /> : <CircleDashed size={16} className="text-sun-ink" aria-hidden />}
            label={label[status[i]]}
          >
            {p}
          </Row>
        ))}
      </ul>
      {n < status.length && (
        <p className="mt-3 text-sm text-muted">Go back to your notes for the ideas that aren&apos;t clear yet ({concept.source_ref}), then teach it to Viva again.</p>
      )}

      <div className="mt-4 rounded-xl border border-teal/20 bg-teal-soft/60 p-4">
        <div className="flex items-center gap-1.5 text-xs font-black text-teal-lip">
          <Sparkles size={14} className="text-teal" />
          <span>Practice logged &middot; Model re-evaluated on this device</span>
        </div>
        <p className="mt-1 text-xs text-muted">This session counts as a practice quiz. The whole conversation is in Previous chats.</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <button onClick={onAgain} className="btn btn-primary text-xs">
          <RotateCcw size={14} aria-hidden /> Teach another concept
        </button>
        <Link href={`/insights?course=${course}`} className="btn btn-ghost text-xs">
          See your path in Insights &rarr;
        </Link>
      </div>
    </section>
  );
}
