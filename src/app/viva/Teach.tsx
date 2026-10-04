"use client";

// Teach mode: the Feynman technique. The student says what they want to work on ("I keep mixing
// up glycolysis and the Krebs cycle for BIO 181") or picks one of their course files. Viva finds
// the concept, says when it's on an exam, and asks for an explanation. It plays a curious beginner
// and checks the explanation against key points taken from that file only: what landed, what was
// fuzzy, one hint at a gap, and the question a beginner would ask next. Up to three rounds, then
// a summary; finishing logs a practice quiz to the on-device model, like a quiz in Study.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, ArrowUp, BookOpen, Brain, Check, ChevronDown, CircleDashed, FastForward, FileText, Keyboard, Layers, Loader2, Mic, PhoneOff, RotateCcw, Sparkles, Square } from "lucide-react";
import { VoiceBeam } from "voice-glow";
import { VivaAvatar, VivaGlyph } from "@/components/Viva";
import { useViva } from "@/components/VivaDock";
import { teachConcepts, teachFeedback, teachStart } from "@/lib/api";
import { prebuiltConcepts } from "@/lib/knowledge/teachConcepts";
import type { Concept } from "@/lib/intel/study";
import { docsFor } from "@/lib/knowledge/sample";
import { openMic } from "@/lib/mic";
import { usePathway, type ChatMsg } from "@/lib/store";
import {
  MAX_ROUNDS,
  clearCount,
  finished,
  matchConcept,
  matchRequest,
  mergeConcepts,
  onStudyGuide,
  spoken,
  tally,
  teachIntro,
  type PointStatus,
  type TeachCourse,
  type TeachDoc,
  type TeachMatch,
  type TeachRound,
  weakPoints,
} from "@/lib/teach";
import { useVoiceSession } from "@/lib/voice";

type Picked = { course: string; concept: Concept; opener?: string; doc?: { id: string; title: string } };
/** A course file Teach can read. Material made in Study comes with its concepts already picked. */
type TeachFile = TeachDoc & { sample?: boolean; concepts?: Concept[] };

export function Teach() {
  const { logTeach, archiveChat, saveReview } = usePathway();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [done, setDone] = useState<{ rounds: TeachRound[]; review: string } | null>(null);

  const finish = (rounds: TeachRound[], transcript: ChatMsg[]) => {
    if (!picked) return;
    if (!rounds.length) return setPicked(null);
    const status = tally(picked.concept, rounds);
    logTeach(picked.course, picked.concept.topic, clearCount(status), status.length);
    archiveChat(`Explained: ${picked.concept.topic}`, transcript);
    // What didn't land goes to Study (an all-clear session clears this concept's old item instead).
    const review = saveReview({ course: picked.course, topic: picked.concept.topic, points: weakPoints(picked.concept, status), doc: picked.doc });
    setDone({ rounds, review });
  };

  if (picked && done)
    return <Summary concept={picked.concept} rounds={done.rounds} review={done.review} course={picked.course} onAgain={() => (setPicked(null), setDone(null))} />;
  if (picked)
    return <Session key={`${picked.course}:${picked.concept.topic}`} concept={picked.concept} opener={picked.opener} onFinish={finish} onBack={() => setPicked(null)} />;
  return <Start onStart={setPicked} />;
}

const CACHE_KEY = "pathway:teach-concepts:v1";

/** Concepts already pulled from a file, kept on this device so the same file never waits on Gemini twice. */
function useConceptCache() {
  const [map, setMap] = useState<Record<string, Concept[]>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(map));
    } catch {}
  }, [map]);
  return { get: (id: string): Concept[] | undefined => map[id], set: (id: string, list: Concept[]) => setMap((m) => ({ ...m, [id]: list })) };
}

/** Say it instead of typing: tap to record, tap again to stop; the words come back through /api/stt. */
function useDictation(onText: (text: string) => void, beforeStart: () => void) {
  const [phase, setPhase] = useState<"idle" | "recording" | "transcribing">("idle");
  const [err, setErr] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const alive = useRef(true);
  const cb = useRef(onText);
  useEffect(() => {
    cb.current = onText;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      rec.current?.stop();
    };
  }, []);

  const toggle = async () => {
    if (rec.current) return rec.current.stop();
    if (phase !== "idle") return;
    setErr("");
    beforeStart();
    const stream = await openMic();
    if (!stream) return setErr("Your microphone is off, so type it instead.");
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      rec.current = null;
      if (!alive.current) return;
      setPhase("transcribing");
      try {
        const form = new FormData();
        form.append("file", new Blob(chunks, { type: r.mimeType }), "speech");
        const res = await fetch("/api/stt", { method: "POST", body: form });
        const { text } = res.ok ? await res.json() : { text: "" };
        if (!alive.current) return;
        if (text) cb.current(text);
        else setErr("I didn't catch that. Try again, or type it.");
      } catch {
        if (alive.current) setErr("Couldn't reach speech-to-text, so type it instead.");
      } finally {
        if (alive.current) setPhase("idle");
      }
    };
    rec.current = r;
    r.start(250);
    setPhase("recording");
  };
  return { phase, err, toggle };
}

function Start({ onStart }: { onStart: (p: Picked) => void }) {
  const { courses, knowledge, state } = usePathway();
  const { voice: dock } = useViva();
  const params = useSearchParams();
  const router = useRouter();
  const cache = useConceptCache();

  // Every course's files: its lecture files (built in, or added on Courses) plus anything Study made from an upload.
  const files = useMemo(() => {
    const out: Record<string, TeachFile[]> = {};
    for (const c of courses) {
      const m = state.materials[c.slug];
      const fromStudy: TeachFile[] = m?.concepts?.length ? [{ id: `study:${c.slug}`, course: c.code, title: m.title, summary: m.topics.join(", "), body: "", concepts: m.concepts }] : [];
      // Built-in lecture files come with their concepts made ahead of time (npm run kb:teach): no Gemini call.
      out[c.code] = [...fromStudy, ...docsFor(c.code, knowledge).map((d) => ({ id: d.id, course: c.code, title: d.title, summary: d.summary, body: d.body, sample: d.sample, concepts: d.sample ? prebuiltConcepts(d.id, d.body) : undefined }))];
    }
    return out;
  }, [courses, knowledge, state.materials]);
  const all = useMemo(() => Object.values(files).flat(), [files]);
  const tcourses = useMemo<TeachCourse[]>(() => courses.map((c) => ({ slug: c.slug, code: c.code, name: c.name, exam: c.exam, daysToExam: c.daysToExam })), [courses]);
  const courseOf = (code: string) => tcourses.find((c) => c.code === code);

  const [course, setCourse] = useState(() => {
    const asked = params.get("course");
    if (asked && courses.some((c) => c.slug === asked)) return asked;
    return courses.find((c) => files[c.code]?.length)?.slug ?? courses[0]?.slug ?? "";
  });
  const [text, setText] = useState(params.get("ask") ?? "");
  const [busy, setBusy] = useState(""); // what Viva is doing right now, shown while it works
  const [note, setNote] = useState("");

  // Viva's first line: exam timing and study-guide evidence from this course's files, then the ask.
  const intro = (f: TeachFile, concept: Concept, topic = "") => {
    const c = courseOf(f.course);
    if (!c) return undefined;
    const guide = onStudyGuide(topic || concept.topic, (files[f.course] ?? []).filter((d) => d.id !== f.id));
    return teachIntro({ course: c, concept: concept.topic, doc: f.title, guide, topic });
  };

  // A file's concepts: from Study's material, this device's cache, or Gemini (asked to lead with `focus`).
  const conceptsFor = async (f: TeachFile, focus = ""): Promise<{ list: Concept[]; i: number }> => {
    const have = f.concepts ?? cache.get(f.id);
    const hit = have ? (focus ? matchConcept(have, focus) : 0) : -1;
    if (have && (hit >= 0 || f.concepts || !f.body)) return { list: have, i: Math.max(0, hit) };
    const list = mergeConcepts(await teachConcepts(f.title, f.body, focus || undefined), have ?? []);
    cache.set(f.id, list);
    return { list, i: focus ? Math.max(0, matchConcept(list, focus)) : 0 };
  };

  // From a sentence: Gemini picks the course and file (plain word overlap if it can't), then Viva reads the concepts.
  const ask = async (message: string) => {
    const m = message.trim();
    if (!m || busy) return;
    setNote("");
    setBusy("Looking through your course files…");
    try {
      let match: TeachMatch = { course: "", doc: "", topic: "" };
      try {
        match = await teachStart(m, tcourses.map(({ code, name }) => ({ code, name })), all.map(({ id, course, title, summary }) => ({ id, course, title, summary })));
      } catch {}
      if (!match.doc) {
        const local = matchRequest(m, tcourses, all);
        if (local.doc && (!match.course || local.course === match.course)) match = { ...match, course: local.course, doc: local.doc };
        else if (!match.course) match = { ...match, course: local.course };
      }
      const f = all.find((x) => x.id === match.doc);
      const c = courseOf(match.course);
      if (!f || !c) {
        if (c) setCourse(c.slug);
        setNote(
          c
            ? `${match.topic ? `"${match.topic}" isn't` : "That isn't"} in your ${c.code} files yet, so Viva can't check you on it fairly. Pick one of your ${c.code} files below, or add your slides under Courses → Files.`
            : `Which class is that for? Try naming it (like "${courses[0]?.code ?? "BIO 181"}"), or pick a file below.`,
        );
        return;
      }
      setBusy(`Reading "${f.title}"…`);
      const { list, i } = await conceptsFor(f, match.topic);
      onStart({ course: c.slug, concept: list[i], opener: intro(f, list[i], match.topic), doc: { id: f.id, title: f.title } });
    } catch (e) {
      setNote(`Something went wrong: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  const dictation = useDictation(
    (said) => {
      setText(said);
      void ask(said);
    },
    () => dock.stop(), // never two microphones at once
  );

  // Arriving with ?ask= (e.g. from chat): run it once, then drop it from the URL so "Teach another" starts fresh.
  const asked = params.get("ask");
  const ran = useRef(false);
  useEffect(() => {
    if (!asked || ran.current) return;
    const t = setTimeout(() => {
      ran.current = true;
      router.replace("/viva?mode=teach", { scroll: false });
      void ask(asked);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  // Browsing: open a file to see its concepts, pick one, start.
  const [open, setOpen] = useState("");
  const [loaded, setLoaded] = useState<{ id: string; list: Concept[] } | null>(null);
  const [pick, setPick] = useState(0);
  const openFile = async (f: TeachFile) => {
    if (open === f.id) return setOpen("");
    setOpen(f.id);
    setLoaded(null);
    setPick(0);
    setNote("");
    try {
      // Pre-built concepts are instant; a short "Picking concepts…" beat still shows Viva reading the file.
      const [{ list }] = await Promise.all([conceptsFor(f), f.concepts ? new Promise((r) => setTimeout(r, 900)) : null]);
      setLoaded({ id: f.id, list });
    } catch (e) {
      setOpen("");
      setNote(`Couldn't read "${f.title}": ${(e as Error).message}`);
    }
  };

  const code = courses.find((c) => c.slug === course)?.code ?? "";
  const list = files[code] ?? [];

  return (
    <div className="space-y-5">
      <section aria-label="Tell Viva what to work on" className="panel p-5 md:p-6">
        <h2 className="text-xl font-black">What do you want to teach Viva?</h2>
        <p className="mt-1 text-sm text-muted">Name the topic and the class. Viva finds it in your course files, then checks your explanation against them.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(text);
          }}
          className="mt-4 flex items-center gap-2 rounded-2xl border-2 border-line bg-white p-1.5 pl-4 focus-within:border-sky"
        >
          <label htmlFor="teach-ask" className="sr-only">What do you want to teach Viva?</label>
          <input
            id="teach-ask"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!!busy}
            autoComplete="off"
            placeholder="e.g. I keep mixing up glycolysis and the Krebs cycle for BIO 181"
            className="min-w-0 flex-1 bg-transparent py-2 font-bold outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={() => void dictation.toggle()}
            disabled={!!busy || dictation.phase === "transcribing"}
            aria-label={dictation.phase === "recording" ? "Stop and send" : "Say it instead"}
            title={dictation.phase === "recording" ? "Stop and send" : "Say it instead"}
            className={`btn min-h-10 px-3 ${dictation.phase === "recording" ? "btn-danger" : "btn-ghost"}`}
          >
            {dictation.phase === "recording" ? <Square size={16} className="fill-current" aria-hidden /> : dictation.phase === "transcribing" ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Mic size={18} aria-hidden />}
          </button>
          <button disabled={!!busy || !text.trim()} className="btn btn-sky min-h-10 px-3" aria-label="Find it">
            <ArrowUp size={20} strokeWidth={3} aria-hidden />
          </button>
        </form>
        <div aria-live="polite" className="mt-2 min-h-5 text-sm">
          {busy ? (
            <p className="flex items-center gap-2 font-bold text-muted">
              <Loader2 size={15} className="animate-spin" aria-hidden /> {busy}
            </p>
          ) : dictation.phase === "recording" ? (
            <p className="font-bold text-sky">Listening… tap the square when you&apos;re done.</p>
          ) : dictation.err || note ? (
            <p className="font-bold text-sun-ink">{dictation.err || note}</p>
          ) : null}
        </div>
      </section>

      <section aria-label="Pick from your course files" className="panel p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black">Or pick from your course files</h2>
          <label className="flex items-center gap-2 font-bold">
            Course
            <select value={course} onChange={(e) => (setCourse(e.target.value), setOpen(""))} className="rounded-xl border-2 border-line bg-white px-3 py-2 font-bold">
              {courses.map((c) => (
                <option key={c.slug} value={c.slug}>{c.code}</option>
              ))}
            </select>
          </label>
        </div>

        {!list.length ? (
          <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl border-2 border-dashed border-line px-4 py-4">
            <p className="text-muted">No course files for {code || "this class"} yet. Add lecture slides or notes under Courses → Files and they&apos;ll show up here.</p>
            <Link href={`/courses?course=${course}&tab=files`} className="btn btn-ghost text-xs">
              <BookOpen size={15} aria-hidden /> Open Courses
            </Link>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {list.map((f) => {
              const isOpen = open === f.id;
              const ready = isOpen && loaded?.id === f.id ? loaded.list : null;
              return (
                <li key={f.id} className={`rounded-xl border-2 bg-white transition-colors ${isOpen ? "border-sky" : "border-line"}`}>
                  <button onClick={() => void openFile(f)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <FileText size={18} className="shrink-0 text-sky" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-extrabold">{f.title}</span>
                      <span className="block truncate text-xs font-bold text-muted">{f.sample ? "Sample · " : ""}{f.summary}</span>
                    </span>
                    <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {isOpen && (
                    <div className="border-t-2 border-line px-4 py-3">
                      {!ready ? (
                        <p className="flex items-center gap-2 text-sm font-bold text-muted">
                          <Loader2 size={15} className="animate-spin" aria-hidden /> Picking concepts to teach from this file…
                        </p>
                      ) : (
                        <>
                          <fieldset>
                            <legend className="sr-only">Concept</legend>
                            <div className="space-y-2">
                              {ready.map((c, i) => (
                                <label key={c.topic} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2.5 transition-colors ${pick === i ? "border-sky bg-sky-soft/50" : "border-line bg-white hover:bg-polar"}`}>
                                  <input type="radio" name={`concept-${f.id}`} checked={pick === i} onChange={() => setPick(i)} className="size-4 accent-sky" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block font-extrabold">{c.topic}</span>
                                    <span className="block text-xs font-bold text-muted">{c.key_points.length} key ideas</span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                          <button
                            onClick={() => {
                              const c = ready[Math.min(pick, ready.length - 1)];
                              onStart({ course, concept: c, opener: intro(f, c), doc: { id: f.id, title: f.title } });
                            }}
                            className="btn btn-sky mt-3"
                          >
                            <Mic size={18} aria-hidden /> Start explaining
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted">Viva only checks against key ideas from these files, so it can&apos;t mark you down for something your class doesn&apos;t cover.</p>
      </section>
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

function Session({
  concept,
  opener: intro,
  onFinish,
  onBack,
}: {
  concept: Concept;
  opener?: string;
  onFinish: (rounds: TeachRound[], transcript: ChatMsg[]) => void;
  onBack: () => void;
}) {
  const [rounds, setRounds] = useState<TeachRound[]>([]);
  const roundsRef = useRef<TeachRound[]>([]); // the voice loop reads this between renders
  const transcript = useRef<ChatMsg[]>([]);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const status = tally(concept, rounds);
  const over = rounds.length > 0 && finished(status, rounds.length);
  const opener = intro || `Explain ${concept.topic} to me like I've never heard of it.`;
  const prompt = rounds.at(-1)?.feedback.follow_up || opener;

  // One round: the explanation and the earlier rounds go to /api/feynman; returns what Viva says back.
  const explain = async (text: string) => {
    const feedback = await teachFeedback(concept, text, roundsRef.current);
    const next = [...roundsRef.current, { explanation: text, feedback }];
    roundsRef.current = next;
    setRounds(next);
    return spoken(feedback, tally(concept, next), next.length);
  };

  // The dock's voice call (Voice mode, mini Viva) is a separate session: end it before Teach listens.
  const { voice: dock, speed } = useViva();
  const v = useVoiceSession({
    greeting: () => roundsRef.current.at(-1)?.feedback.follow_up || opener,
    speed: () => speed,
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
          {concept.source_ref && <p className="text-xs font-bold text-muted">Checked against: {concept.source_ref}</p>}
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
                <button onClick={() => (dock.stop(), v.start())} className="btn btn-sky">
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

function Summary({ concept, rounds, review, course, onAgain }: { concept: Concept; rounds: TeachRound[]; review: string; course: string; onAgain: () => void }) {
  const status = tally(concept, rounds);
  const n = clearCount(status);
  const toWork = status.length - n;
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
      {review && toWork > 0 && (
        <div className="mt-4 rounded-xl border-2 border-sky/30 bg-sky-soft/40 p-4">
          <p className="text-sm font-black text-ink">
            Added to your Study page: {toWork} idea{toWork === 1 ? "" : "s"} to review
          </p>
          <p className="mt-1 text-xs text-muted">
            Quiz yourself or make a deck on just these, straight from {concept.source_ref.split(" · ")[0] || "your course file"}. Then teach it to Viva again.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/study?tool=quiz&course=${course}&review=${review}`} className="btn btn-sky min-h-9 px-3 text-xs">
              <Brain size={14} aria-hidden /> Quiz me on these
            </Link>
            <Link href={`/study?tool=flashcards&course=${course}&review=${review}`} className="btn btn-ghost min-h-9 px-3 text-xs">
              <Layers size={14} aria-hidden /> Make a deck
            </Link>
          </div>
        </div>
      )}
      {toWork === 0 && <p className="mt-3 text-sm font-bold text-teal-lip">Every key idea landed, so there&apos;s nothing to add to Study for this one.</p>}

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
