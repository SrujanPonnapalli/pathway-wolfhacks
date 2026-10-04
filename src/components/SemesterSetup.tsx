"use client";

// First run for a Google account: pick syllabi from Drive (or upload) → Gemini reads each one →
// a real course with its exams and deadlines → optionally onto Google Calendar. Each permission
// is asked for at the step that needs it, never all at sign-in.
import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Check, CircleDashed, FileUp, HardDrive, TriangleAlert } from "lucide-react";
import { analyzeFile, toSource } from "@/lib/api";
import { driveReady, pickFromDrive, prepareDrive } from "@/lib/drive";
import { usePathway } from "@/lib/store";

type Row = { name: string; state: "reading" | "done" | "skipped" | "error"; text: string };

export const setupKey = (profileId: string) => `pathway:setup:${profileId}`;

export function SemesterSetup({ onDone }: { onDone: () => void }) {
  const { profile, courses, addSource, reloadProfiles, connectGoogle, googleOn } = usePathway();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [cal, setCal] = useState<"idle" | "busy" | "error">("idle");
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => void prepareDrive().catch(() => {}), []);

  const read = async (files: File[]) => {
    setErr("");
    const start = rows.length;
    setRows((r) => [...r, ...files.map((f) => ({ name: f.name, state: "reading" as const, text: "Reading with Gemini…" }))]);
    const set = (i: number, row: Partial<Row>) => setRows((r) => r.map((x, j) => (j === start + i ? { ...x, ...row } : x)));
    let added = 0;
    await Promise.all(
      files.map(async (f, i) => {
        try {
          const res = await analyzeFile(f, { courses: courses.map((c) => c.code) });
          if (!res.syllabus) return set(i, { state: "skipped", text: `Looks like ${res.classification.kind}, not a syllabus. Drop it on Home later.` });
          const r = await fetch("/api/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile_id: profile.id, syllabus: res.syllabus }) });
          const j = await r.json();
          if (!r.ok) return set(i, { state: "error", text: j.error ?? "Couldn't add this course." });
          const src = toSource(res, j.code);
          if (src) addSource(src); // Viva can answer from it right away
          added++;
          set(i, { state: "done", text: `${j.code} · ${j.name} · ${j.exams} ${j.exams === 1 ? "exam" : "exams"}, ${j.deadlines} dated items` });
        } catch (e) {
          set(i, { state: "error", text: (e as Error).message || "Gemini couldn't read this one." });
        }
      }),
    );
    if (added) await reloadProfiles(profile.id);
  };

  const fromDrive = () =>
    pickFromDrive().then(
      (files) => (files.length ? read(files) : undefined),
      (e) => setErr((e as Error).message),
    );
  const calendar = async () => {
    setCal("busy");
    try {
      await connectGoogle();
      setCal("idle");
    } catch {
      setCal("error");
    }
  };
  const hasCourses = courses.length > 0;

  return (
    <section className="panel mx-auto max-w-2xl p-6 md:p-8" aria-labelledby="setup">
      <h1 id="setup" className="text-[1.75rem] font-extrabold leading-tight">Let&apos;s set up your semester, {profile.name}</h1>
      <p className="mt-2 text-muted">Pathway reads your syllabi and builds your route. You choose every file it sees.</p>

      <ol className="mt-6 space-y-6">
        <Step n={1} done title="Signed in with Google" />

        <Step n={2} done={hasCourses} title="Add your syllabi" detail="Pick them from Google Drive or upload them. Gemini reads each one for exams, due dates and grading.">
          <div className="mt-3 flex flex-wrap gap-2">
            {driveReady() && (
              <button onClick={fromDrive} className="btn btn-primary min-h-11 text-xs">
                <HardDrive size={16} aria-hidden /> Pick from Google Drive
              </button>
            )}
            <button onClick={() => upload.current?.click()} className="btn btn-ghost min-h-11 text-xs">
              <FileUp size={16} aria-hidden /> Upload files
            </button>
            <input ref={upload} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt" className="sr-only" onChange={(e) => e.target.files?.length && read([...e.target.files])} />
          </div>
          {err && <p role="alert" className="mt-2 text-sm font-bold text-sun-ink">{err}</p>}
          {rows.length > 0 && (
            <ul className="mt-3 space-y-1.5" aria-live="polite">
              {rows.map((r, i) => (
                <li key={i} className="flex items-start gap-2 rounded-xl bg-polar px-3 py-2 text-sm">
                  {r.state === "reading" ? (
                    <CircleDashed size={16} className="mt-0.5 shrink-0 animate-spin text-sky" aria-hidden />
                  ) : r.state === "done" ? (
                    <Check size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-teal" aria-hidden />
                  ) : (
                    <TriangleAlert size={16} className="mt-0.5 shrink-0 text-sun-ink" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{r.name}</span>
                    <span className="text-muted">{r.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Step>

        <Step n={3} done={googleOn} title="Put it on your Google Calendar" detail="Optional. Exams, due dates and study blocks stay in sync with your calendar. Google asks for calendar access at this step only.">
          {hasCourses && !googleOn && (
            <button onClick={calendar} disabled={cal === "busy"} className="btn btn-ghost mt-3 min-h-11 text-xs">
              <CalendarCheck size={16} aria-hidden /> {cal === "busy" ? "Connecting…" : "Connect Google Calendar"}
            </button>
          )}
          {cal === "error" && <p role="alert" className="mt-2 text-sm font-bold text-sun-ink">Google Calendar didn&apos;t connect. You can do it later on the Week page.</p>}
        </Step>
      </ol>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t-2 border-line pt-5">
        <button onClick={onDone} disabled={!hasCourses} className="btn btn-primary min-h-11">
          {hasCourses ? "See my route" : "Add a syllabus to start"}
        </button>
        <p className="text-sm text-muted">Pathway saves your courses and study activity, never your status.</p>
      </div>
    </section>
  );
}

function Step({ n, done, title, detail, children }: { n: number; done?: boolean; title: string; detail?: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className={`grid size-8 shrink-0 place-items-center rounded-full font-black ${done ? "bg-teal-face text-teal-ink" : "border-2 border-line text-muted"}`} aria-hidden>
        {done ? <Check size={16} strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold">
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </p>
        {detail && <p className="text-sm text-muted">{detail}</p>}
        {children}
      </div>
    </li>
  );
}
