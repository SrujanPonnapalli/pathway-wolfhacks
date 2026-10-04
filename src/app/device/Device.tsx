"use client";

// /device — Pathway Beacon: a desk-companion screen for a 7" Raspberry Pi touchscreen
// (designed at 1024×600 landscape and scaled to the real screen by Stage.tsx, fullscreen,
// no browser chrome). No app chrome either (see components/Chrome). Left = the assistant:
// Viva's face, her read of the route, live captions, and the Talk button — the same voice
// session as the Viva page, so she listens and answers right here. Right = live student status.

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, BookOpen, Check, ChevronDown, Compass, Eye, FastForward, Flag, Mic, PhoneOff, Route as RouteIcon } from "lucide-react";
import { VoiceBeam } from "voice-glow";
import { Wordmark } from "@/components/Sidebar";
import { VivaAvatar } from "@/components/Viva";
import { BeaconTimer, useStudyTimer } from "@/components/StudyTimer";
import { useViva } from "@/components/VivaDock";
import { deviceContext, onVisionEvents, reportObservation } from "@/lib/awareness";
import { goalText } from "@/lib/features";
import type { Observation } from "@/lib/intel/vision";
import { planBlocks } from "@/lib/plan";
import { fmtDay, fmtTime, usePathway, type CourseView } from "@/lib/store";
import { VIVA } from "@/lib/viva";

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

// The model knows two outcomes, and Beacon says them in the app's words ("on track", "worth a check-in"),
// as a route: REROUTING = worth a check-in with a recovery block already on the calendar; CHECK-IN = worth a
// check-in, plan not made yet. Never "off track" or "drifting": the app doesn't use alarm language anywhere.
type RouteStatus = "ON TRACK" | "CHECK-IN" | "REROUTING";

const routeStatus = (c: CourseView, hasPlan: boolean): RouteStatus => {
  if (!c.result.atRisk) return "ON TRACK";
  return hasPlan ? "REROUTING" : "CHECK-IN";
};

const statusTone: Record<RouteStatus, string> = {
  "ON TRACK": "text-teal",
  "CHECK-IN": "text-sun-ink",
  REROUTING: "text-sky",
};

// Voice-state line in the caption box — same words as the Viva page.
const VOICE_LABEL: Record<string, string> = {
  idle: "Voice idle",
  connecting: "Connecting…",
  listening: "Listening… just talk",
  thinking: "Viva is thinking",
  speaking: "Viva is speaking",
  error: "Something went wrong. Tap Talk to retry.",
};

// Viva's headline under the face: short, calm, never alarming.
const vivaLine: Record<RouteStatus, { line: string; sub: string }> = {
  "ON TRACK": { line: "You're on track.", sub: "Keep the streak going." },
  "CHECK-IN": { line: "Worth a check-in.", sub: "Your next step is ready." },
  REROUTING: { line: "Rerouting you.", sub: "Your new plan is on the week." },
};

function RouteMark({ status }: { status: RouteStatus }) {
  const s = 26;
  if (status === "CHECK-IN")
    return <span className="shrink-0 rounded-full border-sun bg-sun-soft" style={{ width: s, height: s, borderWidth: 6 }} aria-hidden />;
  const Icon = status === "ON TRACK" ? Check : RouteIcon;
  const face = status === "ON TRACK" ? "bg-teal text-white" : "bg-sky text-white";
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${face}`} style={{ width: s, height: s }} aria-hidden>
      <Icon size={15} strokeWidth={3.2} />
    </span>
  );
}

function Card({
  icon: Icon,
  label,
  tone = "text-muted",
  children,
  className = "",
}: {
  icon: typeof Compass;
  label: string;
  tone?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={label} className={`panel flex min-h-0 flex-col justify-center p-4 ${className}`}>
      <p className="flex items-center gap-1.5 text-[0.68rem] font-extrabold uppercase tracking-widest text-muted">
        <Icon size={14} strokeWidth={2.8} className={tone} aria-hidden />
        {label}
      </p>
      {children}
    </section>
  );
}

// Camera awareness: the Brio stream runs locally, and every 15 s one small JPEG frame
// goes to /api/device/vision for a structured observation (person present, study
// materials, phone, activity). Only the latest observation is kept; frames are not
// stored or shown. Observations are display-only for now — they don't touch risk,
// rerouting, or Viva. The live preview is hidden; add ?cam=1 to the URL to see it.
type VisionEvent = "PERSON_LEFT_DESK" | "PERSON_RETURNED" | "STUDY_MATERIALS_APPEARED" | "PHONE_APPEARED";

function visionEvents(prev: Observation | null, cur: Observation): VisionEvent[] {
  if (!prev) return [];
  const e: VisionEvent[] = [];
  if (prev.personPresent && !cur.personPresent) e.push("PERSON_LEFT_DESK");
  if (!prev.personPresent && cur.personPresent) e.push("PERSON_RETURNED");
  if (!prev.studyMaterialsVisible && cur.studyMaterialsVisible) e.push("STUDY_MATERIALS_APPEARED");
  if (!prev.phoneVisible && cur.phoneVisible) e.push("PHONE_APPEARED");
  return e;
}

// Proactive ambient lines: device-awareness transitions -> at most one spoken Viva line.
// The sentence itself always comes from the shared Gemini brain — nothing here is canned,
// and proactive turns never execute actions or touch risk.
// Demo-friendly timing (a short step-away is enough to see it), but every prompt states what actually
// happened: how long the student has been away, and whether a study block or the focus timer is running.
// Real-world tuning would be minutes, not seconds.
const PROACTIVE_COOLDOWN_MS = 60_000;
const ABSENCE_MS = 20_000;

function useProactiveViva() {
  const { state, coachTurn, now, courses } = usePathway();
  const { voice } = useViva();
  const timer = useStudyTimer();
  const deps = useRef({ blocks: state.blocks, coachTurn, voice, now, timer, courses });
  useEffect(() => {
    deps.current = { blocks: state.blocks, coachTurn, voice, now, timer, courses };
  });
  const awayTimer = useRef(0);
  const lastSpoke = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    const log = (event: string, verdict: string) => console.debug(`[proactive] ${event} -> ${verdict}`);
    const cooldownLeft = () => PROACTIVE_COOLDOWN_MS - (Date.now() - lastSpoke.current);
    // loose: block running now, starting within 10 min, or ended within 15 — "has or
    // recently had a study block". strict: currently inside the block.
    const relevantBlock = (loose: boolean) => {
      const t = +deps.current.now;
      return deps.current.blocks.find((b) => {
        if (b.done) return false;
        const start = +new Date(b.at);
        const end = start + (b.minutes ?? 50) * 60_000;
        return loose ? t >= start - 10 * 60_000 && t <= end + 15 * 60_000 : t >= start && t <= end;
      });
    };
    // What's really going on, said plainly to Gemini: a block in progress (or about to be), the focus timer.
    const situation = (loose: boolean) => {
      const block = relevantBlock(loose);
      const t = deps.current.timer;
      const code = deps.current.courses.find((c) => c.slug === t.course)?.code ?? "a course";
      const parts = [
        block ? `study block "${block.title}" at ${new Date(block.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} is in progress or about to be` : "no study block is in progress",
        t.status === "running" ? `their ${code} focus timer is running with ${Math.ceil(t.left / 60)} minutes left` : t.status === "paused" ? `their ${code} focus timer is paused` : "no focus timer is running",
      ];
      return parts.join("; ");
    };
    const intervene = async (event: string, prompt: string) => {
      if (busy.current) return log(event, "skipped: an intervention is already in flight");
      busy.current = true;
      try {
        console.debug(`[proactive] ${event} -> proactive trigger -> Gemini (coachTurn)`);
        const r = await deps.current.coachTurn(prompt, "voice", false);
        console.debug(`[proactive] ${event} -> TTS announce(${JSON.stringify(r.text.slice(0, 80))})`);
        if (r.text && (await deps.current.voice.announce(r.text))) {
          lastSpoke.current = Date.now();
          log(event, "proactive trigger -> Gemini -> TTS (delivered)");
        } else {
          log(event, "skipped: empty reply or Viva mid-sentence");
        }
      } catch (e) {
        log(event, `skipped: ${(e as Error).message}`);
      } finally {
        busy.current = false;
      }
    };
    const off = onVisionEvents((events) => {
      for (const ev of events) {
        if (ev === "PERSON_RETURNED") {
          clearTimeout(awayTimer.current); // cancels a pending step-away reminder
          const block = relevantBlock(true);
          if (cooldownLeft() > 0) log(ev, `skipped: cooldown (${Math.ceil(cooldownLeft() / 1000)}s left)`);
          else {
            log(ev, `proactive trigger${block ? ` during "${block.title}"` : ""}`);
            intervene(
              ev,
              `[Device camera event: the student just returned to the desk after being away. Right now: ${situation(true)}.] In one short warm sentence, welcome them back; mention the block or the focus timer only if one is running, using exactly the facts given. No actions, no follow-up question.`,
            );
          }
        } else if (ev === "PERSON_LEFT_DESK") {
          if (cooldownLeft() > 0) log(ev, `skipped: cooldown (${Math.ceil(cooldownLeft() / 1000)}s left)`);
          else {
            log(ev, `pending: absence timer started (${ABSENCE_MS / 1000}s)`);
            clearTimeout(awayTimer.current);
            awayTimer.current = window.setTimeout(() => {
              if (deviceContext()?.personPresent) log(ev, "skipped: student already back");
              else if (cooldownLeft() > 0) log(ev, `skipped: cooldown (${Math.ceil(cooldownLeft() / 1000)}s left)`);
              else {
                log(ev, "intervention: still away");
                intervene(
                  ev,
                  `[Device camera event: the student stepped away from the desk about ${ABSENCE_MS / 1000} seconds ago. Right now: ${situation(false)}.] In one short gentle sentence, check in; if the focus timer is running, offer to pause it, otherwise offer to adjust the plan only if a study block is in progress. Use only the facts given. No guilt, no actions.`,
                );
              }
            }, ABSENCE_MS);
          }
        }
        // STUDY_MATERIALS_APPEARED and PHONE_APPEARED never trigger speech by themselves.
      }
    });
    return () => {
      off();
      clearTimeout(awayTimer.current);
    };
  }, []);
}

// Wake word: an always-on listener that turns "Hey Viva" / "Hi Viva" into the same voice
// session as tapping Talk to Viva — it calls voice.start(), never its own pipeline.
// Browser SpeechRecognition when Chromium has it; 2.5 s mic chunks through the existing
// /api/stt as the fallback. The listener only exists while Viva is idle: it is torn down
// the moment she listens, thinks or speaks, and a 1.5 s gap after she goes idle keeps her
// from waking herself. All decisions are console.debug'd under [wake].
type SpeechRecog = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};

const WAKE_RE = /\b(hey|hi)\s+viva\b/i;
const WAKE_RESTART_GAP_MS = 1500; // cooldown after Viva's last word / state change
const WAKE_CHUNK_MS = 2500; // fallback: each mic chunk sent to /api/stt

function useWakeWord() {
  const { voice } = useViva();
  const gen = useRef(0);
  const v = useRef(voice);
  useEffect(() => {
    v.current = voice;
  });

  useEffect(() => {
    const idle = () => {
      const s = v.current.state;
      return s === "idle" || s === "error";
    };
    const g = ++gen.current;
    const log = (m: string) => console.debug(`[wake] ${m}`);
    if (!idle()) {
      log(`paused: Viva is ${v.current.state}`);
      return;
    }

    const res: { sr: SpeechRecog | null; stream: MediaStream | null; mr: MediaRecorder | null } = { sr: null, stream: null, mr: null };
    const alive = () => gen.current === g;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const stop = () => {
      try {
        res.sr?.abort();
      } catch {}
      res.sr = null;
      if (res.mr && res.mr.state !== "inactive") res.mr.stop();
      res.mr = null;
      res.stream?.getTracks().forEach((t) => t.stop());
      res.stream = null;
    };
    const matches = (text: string | undefined) => {
      const t = (text ?? "").trim();
      if (!t) return false;
      const hit = WAKE_RE.test(t);
      log(`heard "${t.slice(0, 80)}" -> ${hit ? "MATCH" : "no match"}`);
      return hit;
    };
    const wake = () => {
      if (!alive()) return;
      log("wake phrase matched -> voice.startQuiet()");
      stop();
      v.current.startQuiet(); // no greeting — "Hey Viva" goes straight to listening
    };

    // Fallback: short mic chunks through the existing ElevenLabs STT route, idle only.
    const startChunks = async () => {
      try {
        res.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (e) {
        log(`mic unavailable: ${(e as Error).message}`);
        return;
      }
      if (!alive()) return stop();
      log("listener active: mic chunks -> /api/stt (SpeechRecognition unavailable)");
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
      while (alive() && idle()) {
        const chunks: Blob[] = [];
        const mr = new MediaRecorder(res.stream, type ? { mimeType: type } : undefined);
        res.mr = mr;
        mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        mr.start();
        await sleep(WAKE_CHUNK_MS);
        if (mr.state !== "inactive") await new Promise<void>((done) => ((mr.onstop = () => done()), mr.stop()));
        res.mr = null;
        if (!alive() || !idle() || !chunks.length) break;
        try {
          const fd = new FormData();
          fd.append("file", new Blob(chunks, { type: type ?? "audio/webm" }), "wake.webm");
          const r = await fetch("/api/stt", { method: "POST", body: fd });
          const j = (r.ok ? await r.json() : {}) as { text?: string };
          if (!alive() || !idle()) break;
          if (matches(j.text)) return wake();
        } catch {
          await sleep(800); // STT hiccup: keep listening, just slower
        }
      }
    };

    const startSR = () => {
      const w = window as unknown as { SpeechRecognition?: new () => SpeechRecog; webkitSpeechRecognition?: new () => SpeechRecog };
      const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
      if (!Ctor) return false;
      try {
        const sr = new Ctor();
        res.sr = sr;
        sr.continuous = true;
        sr.interimResults = true;
        sr.lang = "en-US";
        sr.onresult = (e) => {
          const text = Array.from(e.results)
            .map((r) => r[0]?.transcript ?? "")
            .join(" ");
          if (idle() && matches(text)) wake();
        };
        sr.onerror = (e) => {
          log(`SpeechRecognition error: ${e.error}`);
          if (alive() && (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "network" || e.error === "audio-capture")) {
            res.sr = null;
            void startChunks();
          }
        };
        sr.onend = () => {
          // Chromium stops SR on its own sometimes; restart while we're the live generation.
          if (alive() && res.sr === sr && idle()) {
            try {
              sr.start();
            } catch {}
          }
        };
        sr.start();
        log("listener active: SpeechRecognition");
        return true;
      } catch {
        res.sr = null;
        return false;
      }
    };

    const t = window.setTimeout(() => {
      if (alive() && idle()) {
        log("wake listener starting");
        if (!startSR()) void startChunks();
      }
    }, WAKE_RESTART_GAP_MS);
    return () => {
      clearTimeout(t);
      stop();
      log("wake listener inactive");
    };
  }, [voice.state]);
}

/** The tiny always-visible wake status. Idle = the wake listener's invitation. */
export function WakeWord() {
  const { voice } = useViva();
  useWakeWord();
  const label =
    voice.state === "listening"
      ? "Listening…"
      : voice.state === "thinking"
        ? "Thinking…"
        : voice.state === "speaking"
          ? "Speaking…"
          : voice.state === "connecting"
            ? "Connecting…"
            : 'Say "Hey Viva"';
  return (
    <div
      aria-live="polite"
      className="absolute left-1/2 top-[22px] z-50 flex -translate-x-[calc(100%+3px)] items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-line bg-white px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-widest shadow-sm"
    >
      <Mic size={13} strokeWidth={2.8} aria-hidden className={voice.state === "idle" ? "text-muted" : "text-sky"} />
      {label}
    </div>
  );
}

export function CameraAwareness() {
  useProactiveViva();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevObs = useRef<Observation | null>(null);
  const busy = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const [obs, setObs] = useState<Observation | null>(null);
  const [event, setEvent] = useState<VisionEvent | null>(null);
  const debug = useSearchParams().has("cam");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let interval = 0;
    let first = 0;
    const snap = async () => {
      const v = videoRef.current;
      const cv = canvasRef.current;
      if (!v || !cv || v.readyState < 2 || busy.current) return;
      busy.current = true;
      try {
        const w = 320;
        const h = v.videoWidth ? Math.round((v.videoHeight / v.videoWidth) * w) : 180;
        cv.width = w;
        cv.height = h;
        cv.getContext("2d")?.drawImage(v, 0, 0, w, h);
        const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/jpeg", 0.6));
        if (!blob) return;
        const fd = new FormData();
        fd.append("frame", blob, "frame.jpg");
        const r = await fetch("/api/device/vision", { method: "POST", body: fd });
        if (!r.ok) return;
        const next = (await r.json()) as Observation;
        const fired = visionEvents(prevObs.current, next);
        prevObs.current = next;
        setObs(next);
        if (fired.length) setEvent(fired[fired.length - 1]);
        reportObservation(next, fired); // share with Viva's coach context + proactive events
      } catch {
        /* a missed snapshot is fine; the next interval tries again */
      } finally {
        busy.current = false;
      }
    };
    Promise.resolve()
      .then(() => {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("navigator.mediaDevices is undefined (page needs HTTPS or localhost)");
        return navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } },
        });
      })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        first = window.setTimeout(snap, 2000); // let the first real frame land
        interval = window.setInterval(snap, 15000);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? `${e.name}: ${e.message}` : String(e)));
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const status = err ? "Camera off" : !obs ? "Aware" : obs.personPresent ? "Person present" : "Away";
  return (
    <div className="absolute left-1/2 top-[22px] z-50 flex translate-x-[3px] flex-col items-start gap-1.5">
      {/* The video stays mounted (and decoding) even when the preview is hidden —
          the snapshot canvas draws from it. */}
      <div className={debug ? "w-[220px] overflow-hidden rounded-xl border-2 border-line bg-black shadow-lg" : "hidden"}>
        {debug && <p className="px-2 py-1 text-[0.62rem] font-extrabold uppercase tracking-widest text-white">Camera</p>}
        <video ref={videoRef} autoPlay playsInline muted className="h-[140px] w-[220px] bg-black object-contain" />
        {debug && err && (
          <p role="alert" className="break-words p-2 text-xs font-bold leading-snug text-red-400">
            {err}
          </p>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      <div
        aria-live="polite"
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-line bg-white px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-widest shadow-sm"
      >
        <Eye size={13} strokeWidth={2.8} aria-hidden className={err ? "text-muted" : obs?.personPresent ? "text-teal" : "text-sun-ink"} />
        {status}
      </div>
      {debug && (
        <p className="rounded-lg bg-black/70 px-2 py-1 text-[0.6rem] font-bold text-white">
          {obs
            ? `${obs.activity} · materials ${obs.studyMaterialsVisible ? "y" : "n"} · phone ${obs.phoneVisible ? "y" : "n"}${event ? ` · ${event}` : ""}`
            : "waiting for first observation"}
        </p>
      )}

    </div>
  );
}

function BeaconWordmark() {
  return (
    <div className="flex items-center gap-3">
      <Wordmark />
      <span className="border-l-2 border-line pl-3 text-lg font-extrabold tracking-tight text-teal">Beacon</span>
    </div>
  );
}

export function Device() {
  const { courses, profile, state, now, vivaThinking } = usePathway();
  const { voice } = useViva();
  const params = useSearchParams();
  const router = useRouter();
  const c = courses.find((x) => x.slug === params.get("course")) ?? courses.find((x) => x.result.atRisk) ?? courses[0];

  if (!c)
    return (
      <main className="grid h-full w-full place-items-center overflow-hidden bg-polar p-6">
        <div className="panel max-w-md p-8 text-center">
          <div className="flex justify-center"><BeaconWordmark /></div>
          <p className="mt-4 text-lg font-bold text-muted">No courses yet. Add one on the Home page first.</p>
        </div>
      </main>
    );

  // Course pill: one tap cycles to the next course — simplest possible touch control.
  const nextCourse = courses[(courses.findIndex((x) => x.slug === c.slug) + 1) % courses.length];

  // Next recommended action: the next planned recovery block, else the first block the
  // recourse plan would create, else a small always-available practice step.
  const nextBlock = state.blocks.filter((b) => !b.done && b.course === c.slug).sort((a, b) => a.at.localeCompare(b.at))[0];
  const planned = !nextBlock && c.rec ? planBlocks(c, c.rec.moves, now) : [];
  const action = nextBlock
    ? { title: nextBlock.title, when: `${fmtDay(nextBlock.at)} · ${fmtTime(nextBlock.at)}` }
    : planned[0]
      ? { title: planned[0].title, when: `${fmtDay(planned[0].at)} · ${fmtTime(planned[0].at)}` }
      : c.rec
        ? { title: c.rec.moves.map(goalText).join(" and "), when: "This week" }
        : { title: `${c.code} practice quiz`, when: "5 min, any time" };

  // Next checkpoint: the nearest due to-do, or the exam itself — whichever comes first.
  const due = profile.todos.filter((t) => !state.done[t.id] && t.due).sort((a, b) => a.due!.localeCompare(b.due!))[0];
  const checkpoint =
    due && new Date(due.due!) < new Date(c.exam.date)
      ? { title: due.title, when: `Due ${fmtDay(due.due!)}` }
      : { title: c.exam.title, when: `${fmtDay(c.exam.date)} · in ${c.daysToExam} ${c.daysToExam === 1 ? "day" : "days"}` };

  // Today's progress = today's agenda checked off: classes checked in, blocks done, to-dos done.
  const same = (a: { course: string; at: string }, b: { course: string; at: string }) => a.course === b.course && +new Date(a.at) === +new Date(b.at);
  const classesToday = [...profile.classes, ...state.addedClasses.filter((k) => !profile.classes.some((p) => same(p, k)))].filter((k) =>
    sameDay(new Date(k.at), now),
  );
  const blocksToday = state.blocks.filter((b) => sameDay(new Date(b.at), now));
  const dueToday = profile.todos.filter((t) => t.due && sameDay(new Date(t.due), now));
  const total = classesToday.length + blocksToday.length + dueToday.length;
  const done =
    classesToday.filter((k) => state.checkedIn[k.at]).length + blocksToday.filter((b) => b.done).length + dueToday.filter((t) => state.done[t.id]).length;
  const todayPct = total ? Math.round((done / total) * 100) : 0;

  const status = routeStatus(c, !!nextBlock);
  const risk = Math.round(c.result.pRisk * 100);
  const tone = statusTone[status];
  const { line, sub } = vivaLine[status];
  const last = state.chat.at(-1);
  // While a voice session runs the face follows it (listening/thinking/speaking with
  // live levels); otherwise it keeps showing "thinking" while a chat answer cooks.
  const avatarState = voice.state !== "idle" ? voice.state : vivaThinking ? "thinking" : "idle";
  const voiceLabel =
    voice.state !== "idle"
      ? voice.state === "listening" && !voice.micOn
        ? "Tap a question below"
        : VOICE_LABEL[voice.state]
      : vivaThinking
        ? "Viva is thinking"
        : "Voice idle";

  return (
    // Kiosk hardening: fills the 1024×600 stage exactly, no scroll/overscroll, no text selection,
    // no long-press context menu, no tap highlight, no pinch zoom (viewport meta),
    // no cursor on touchscreens — this is a dedicated device, not a web page.
    <main
      onContextMenu={(e) => e.preventDefault()}
      className="flex h-full w-full touch-manipulation select-none flex-col overflow-hidden overscroll-none bg-polar pointer-coarse:cursor-none [-webkit-tap-highlight-color:transparent]"
    >
      <header className="flex items-center justify-between px-5 pb-3 pt-3.5">
        <BeaconWordmark />
        <button
          onClick={() => nextCourse.slug !== c.slug && router.replace(`/device?course=${nextCourse.slug}`, { scroll: false })}
          aria-label={`Showing ${c.code}. Switch course.`}
          className="flex min-h-11 items-center gap-2 rounded-full border-2 border-line bg-white px-4 font-extrabold text-teal transition-colors hover:bg-polar"
        >
          <BookOpen size={17} strokeWidth={2.6} aria-hidden />
          {c.code}
          <ChevronDown size={16} strokeWidth={2.8} className="text-muted" aria-hidden />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-5 pb-5">
        {/* Left: the assistant. */}
        <section aria-label="Viva" className="panel relative flex min-h-0 flex-col items-center p-4 text-center">
          {/* The focus timer started on the laptop or phone shows here too (shared per profile, src/components/StudyTimer.tsx). */}
          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
            <BeaconTimer />
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
            {/* Soft halo so the orb reads as a presence, not an image. */}
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 size-[240px] -translate-x-1/2 -translate-y-[58%] rounded-full"
              style={{ background: "radial-gradient(closest-side, var(--color-sky-soft), transparent)" }}
            />
            <div className="relative block">
              <VivaAvatar size={148} state={avatarState} input={voice.input} output={voice.output} />
            </div>
            <h1 className={`relative mt-2 text-[1.6rem] font-black leading-tight tracking-tight text-balance ${tone}`}>{line}</h1>
            <p className="relative mt-0.5 font-bold text-muted">{sub}</p>
          </div>

          {/* Voice state + live captions; glows with the mic level while listening. */}
          <VoiceBeam level={voice.input} active={voice.state === "listening"} colorVariant="ocean" theme="light" borderRadius={16} className="mt-3 w-full">
            <div className="w-full rounded-2xl bg-polar px-4 py-2.5 text-left">
              <p className="flex items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-widest text-muted" aria-live="polite">
                <span className={`size-2 rounded-full ${voice.state !== "idle" || vivaThinking ? "animate-pulse bg-sky" : "bg-line"}`} aria-hidden />
                {voiceLabel}
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm font-bold text-ink/80">
                {voice.caption
                  ? `${voice.caption.who === "viva" ? "Viva: " : "You: "}${voice.caption.text}`
                  : last
                    ? `${last.role === "viva" ? "Viva: " : "You: "}${last.text}`
                    : "Tap Talk and just speak — Viva answers out loud."}
              </p>
              {voice.notice && (
                <p role="status" className="mt-0.5 truncate text-xs font-bold text-muted">
                  {voice.notice}
                </p>
              )}
            </div>
          </VoiceBeam>

          {voice.state === "idle" || voice.state === "error" ? (
            <button onClick={voice.start} className="btn btn-sky mt-3 min-h-[60px] w-full rounded-2xl text-lg tracking-wider">
              <Mic size={24} strokeWidth={2.6} aria-hidden />
              Talk to Viva
            </button>
          ) : (
            <>
              <ul className="mt-3 flex w-full gap-1.5 overflow-x-auto" aria-label="Ask Viva a question">
                {VIVA.suggestions.map((s) => (
                  <li key={s} className="shrink-0">
                    <button
                      onClick={() => voice.say(s)}
                      disabled={voice.state !== "listening"}
                      className="min-h-11 whitespace-nowrap rounded-full border-2 border-line bg-white px-3.5 py-2 text-sm font-bold text-sky hover:border-sky/40 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 grid w-full grid-cols-2 gap-2">
                <button onClick={voice.skip} disabled={voice.state !== "speaking"} className="btn btn-ghost min-h-[52px] rounded-2xl text-base tracking-wider disabled:opacity-50" title="Skip what Viva is saying">
                  <FastForward size={20} strokeWidth={2.6} aria-hidden />
                  Skip
                </button>
                <button onClick={voice.stop} className="btn btn-danger min-h-[52px] rounded-2xl text-base tracking-wider">
                  <PhoneOff size={20} strokeWidth={2.6} aria-hidden />
                  End
                </button>
              </div>
            </>
          )}
        </section>

        {/* Right: live student status. */}
        <div className="grid min-h-0 grid-cols-2 grid-rows-3 gap-3">
          <Card icon={RouteIcon} label="Route" tone={tone}>
            <p className={`mt-1.5 flex items-center gap-2 text-xl font-black leading-tight ${tone}`}>
              <RouteMark status={status} />
              {status}
            </p>
            <p className="mt-0.5 truncate text-sm font-bold text-muted">{c.result.atRisk ? "Worth a check-in" : "On track"}</p>
          </Card>

          {/* The model's leaf rate, said the way Viva says it: of similar students in the data, how many struggled. */}
          <Card icon={BarChart3} label="Similar students" tone={tone}>
            <p className={`mt-1 text-3xl font-black leading-none tabular-nums ${tone}`}>
              {risk}
              <span className="text-lg">%</span>
            </p>
            <p className="mt-1 truncate text-sm font-bold text-muted">
              struggled · {c.exam.title} in {c.daysToExam}d
            </p>
          </Card>

          <Card icon={Compass} label="Next action" tone="text-teal" className="col-span-2">
            <p className="mt-1.5 line-clamp-2 text-xl font-black leading-snug text-balance">{action.title}</p>
            <p className="mt-0.5 truncate font-bold text-teal">{action.when}</p>
          </Card>

          <Card icon={Flag} label="Checkpoint">
            <p className="mt-1.5 line-clamp-2 text-xl font-black leading-snug">{checkpoint.title}</p>
            <p className="mt-0.5 truncate text-sm font-bold text-muted">{checkpoint.when}</p>
          </Card>

          <Card icon={BarChart3} label="Today" tone="text-teal">
            <p className="mt-1 text-3xl font-black leading-none tabular-nums text-teal">{total ? `${todayPct}%` : "—"}</p>
            <span className="mt-2 block h-2.5 w-full overflow-hidden rounded-full bg-line" role="presentation">
              <span className="block h-full rounded-full bg-teal-face" style={{ width: `${total ? todayPct : 0}%` }} />
            </span>
            <p className="mt-1 truncate text-sm font-bold text-muted">{total ? `${done} of ${total} done` : "Free day"}</p>
          </Card>
        </div>
      </div>
    </main>
  );
}
