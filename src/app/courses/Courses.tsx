"use client";

// Courses: every class this term in one place. Syllabus facts, the gradebook, attendance and the
// lecture materials, for the course the student picks. The same records feed Insights (grades by
// category, missing work), the Study tools (quizzes and flashcards from the materials) and Viva's
// context, so what the student reads here is what the app reasons from.
//
// The data is sample data (src/lib/coursework.ts) until a real syllabus or grade page is dropped
// on Home, which then replaces the sample one for that course. The page says so.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Brain,
  CalendarPlus,
  Check,
  ChevronDown,
  FileText,
  FlaskConical,
  Layers,
  Mail,
  MapPin,
  Newspaper,
  Presentation,
  ScrollText,
} from "lucide-react";
import { LiquidSelect } from "@/components/LiquidSelect";
import { PageHeader, StatusMark } from "@/components/ui";
import { baseFeatures, courseInfo, fmtDueDay, recordFor } from "@/lib/coursework";
import type { CourseDoc, DocType } from "@/lib/coursework-data";
import { docsFor, isSampleSource } from "@/lib/knowledge/sample";
import type { KbNode, Knowledge } from "@/lib/knowledge/types";
import { categorize, sourcesFor, standing } from "@/lib/standing";
import { fmtDay, usePathway, type CourseView } from "@/lib/store";

const TABS = [
  { id: "work", label: "Assignments" },
  { id: "attendance", label: "Attendance" },
  { id: "materials", label: "Materials" },
  { id: "syllabus", label: "Syllabus" },
  { id: "facts", label: "Facts" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function Courses() {
  const { courses } = usePathway();
  const params = useSearchParams();
  const router = useRouter();
  const c = courses.find((x) => x.slug === params.get("course")) ?? courses[0];
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ??
    "work") as Tab;
  const go = (course: string, next: Tab) =>
    router.replace(`/courses?course=${course}&tab=${next}`, { scroll: false });

  if (!c)
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-10">
        <PageHeader
          title="Courses"
          lead="Add a course on Home first. Then this page holds its syllabus, assignments, attendance and materials."
        />
        <Link href="/" className="btn btn-primary">
          Go to Home
        </Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6 md:px-10 md:py-10">
      <PageHeader
        title="Courses"
        lead="Every class this term: syllabus, assignments, attendance and materials. Insights, Study and Viva read from here."
      >
        <span
          className="rounded-lg bg-polar px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-muted"
          title="Sample Moodle and Gradescope records until you drop your own on Home"
        >
          Sample data
        </span>
      </PageHeader>

      <div className="-mx-1 mb-6 overflow-x-auto px-1 pb-2">
        <LiquidSelect
          active={c.slug}
          fill="#ddf4ef"
          shadow="inset 0 0 0 2px rgba(10,127,114,0.35), inset 0 -4px 0 rgba(10,127,114,0.25)"
          className="inline-flex items-center rounded-2xl border-2 border-line bg-polar p-1"
        >
          <div
            role="tablist"
            aria-label="Courses"
            className="flex items-center gap-1"
          >
            {courses.map((x) => (
              <button
                key={x.slug}
                role="tab"
                aria-selected={x.slug === c.slug}
                onClick={() => go(x.slug, tab)}
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

      <Course key={c.slug} c={c} tab={tab} setTab={(t) => go(c.slug, t)} />
    </main>
  );
}

function Course({
  c,
  tab,
  setTab,
}: {
  c: CourseView;
  tab: Tab;
  setTab: (t: Tab) => void;
}) {
  const { state, now, makeReal, knowledge } = usePathway();
  const info = courseInfo(c.code);
  const src = useMemo(
    () => sourcesFor(state.sources, c.code),
    [state.sources, c.code],
  );
  const cats = useMemo(
    () => categorize(src.gradeItems, src.grading),
    [src.gradeItems, src.grading],
  );
  const grade = standing(cats);
  const rec = useMemo(() => recordFor(c.code, baseFeatures(c), now), [c, now]);
  const docs = useMemo(() => docsFor(c.code, knowledge), [knowledge, c.code]);
  const today = ymd(now);
  const open = src.gradeItems
    .filter(
      (it) =>
        it.due &&
        it.due >= today &&
        it.status !== "graded" &&
        it.status !== "submitted",
    )
    .sort((a, b) => a.due.localeCompare(b.due));
  const missing = src.gradeItems.filter(
    (it) =>
      it.due &&
      it.due < today &&
      (it.status === "missing" || it.status === "not_submitted"),
  );
  const next = open[0] ?? null;
  const syllabusSource = state.sources.find((s) => s.kind === "syllabus" && s.course === c.code);
  // "Sample" until the student's own grade page for this course is on file.
  const gradeFile = knowledge.sources.find((s) => s.kind === "grades" && s.course === c.code);
  const sample = !gradeFile || isSampleSource(gradeFile);
  const waiting = knowledge.nodes.filter((n) => n.course === c.code && n.review === "proposed").length;

  return (
    <section aria-labelledby="course">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="course"
            className="text-[1.75rem] font-black leading-tight md:text-[2rem]"
          >
            {c.code} <span className="font-bold text-muted">· {c.name}</span>
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-lg">
            <StatusMark atRisk={c.result.atRisk} size={22} />
            <span className="text-muted">
              {c.exam.title} {fmtDay(c.exam.date)} · in {c.daysToExam} day
              {c.daysToExam === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/insights?course=${c.slug}`}
            className="btn btn-ghost min-h-11 px-4 text-xs"
          >
            <BarChart3 size={15} aria-hidden /> Insights
          </Link>
          <Link
            href={`/study?tool=quiz&course=${c.slug}`}
            className="btn btn-ghost min-h-11 px-4 text-xs"
          >
            <Brain size={15} aria-hidden /> Study
          </Link>
        </div>
      </header>

      {/* The four numbers a student checks first */}
      <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Standing"
          value={
            grade.pct != null ? `≈ ${Math.round(grade.pct)}%` : "No grades yet"
          }
          detail={
            grade.pct != null
              ? grade.covered
                ? `graded work covering ${Math.round(grade.covered)}% of the grade`
                : "average of graded work"
              : "nothing graded so far"
          }
          tone={grade.pct == null ? "none" : grade.pct >= 70 ? "good" : "watch"}
        />
        <Stat
          label="Attendance"
          value={pct(c.x.attendance_rate ?? 0)}
          detail={
            rec
              ? `${rec.attendance.filter((m) => m.status === "absent").length} absence${rec.attendance.filter((m) => m.status === "absent").length === 1 ? "" : "s"} in ${rec.attendance.length} meetings`
              : "no record"
          }
          tone={(c.x.attendance_rate ?? 0) > 0.82 ? "good" : "watch"}
        />
        <Stat
          label="Missing"
          value={missing.length ? `${missing.length} past due` : "Nothing"}
          detail={
            missing.length
              ? missing
                  .map((m) => m.name)
                  .slice(0, 2)
                  .join(", ") + (missing.length > 2 ? "…" : "")
              : "every past assignment is in"
          }
          tone={missing.length ? "watch" : "good"}
        />
        <Stat
          label="Next due"
          value={next ? fmtDueDay(next.due) : "Nothing open"}
          detail={next ? next.name : "check the syllabus for what's ahead"}
          tone="none"
        />
      </ul>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <LiquidSelect
          active={tab}
          fill="#e6f1fd"
          shadow="inset 0 0 0 2px rgba(26,111,209,0.3), inset 0 -4px 0 rgba(26,111,209,0.2)"
          className="inline-flex rounded-2xl border-2 border-line bg-polar p-1"
        >
          <div
            role="tablist"
            aria-label="Course sections"
            className="flex items-center gap-1"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                data-liquid-key={t.id}
                className={`relative shrink-0 rounded-xl px-3.5 py-2 font-extrabold transition-colors duration-300 ${tab === t.id ? "text-sky-lip" : "text-muted hover:text-ink"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </LiquidSelect>
        {tab !== "materials" && (
          <p className="text-sm text-muted">
            {sample ? `Sample records. Drop your real ${c.code} syllabus or grade page on Home and it takes over.` : `From your own ${c.code} files.`}
            {waiting > 0 && (
              <button onClick={() => setTab("facts")} className="ml-2 rounded-lg bg-sun-soft px-2 py-0.5 text-xs font-extrabold text-sun-ink">
                {waiting} fact{waiting === 1 ? "" : "s"} need{waiting === 1 ? "s" : ""} you
              </button>
            )}
          </p>
        )}
      </div>

      {tab === "work" && (
        <Work
          c={c}
          items={src.gradeItems}
          cats={cats}
          today={today}
          now={now}
          makeReal={makeReal}
        />
      )}
      {tab === "attendance" && (
        <Attendance c={c} rec={rec} meets={info?.meets} lab={info?.lab} />
      )}
      {tab === "materials" && <Materials c={c} docs={docs} />}
      {tab === "facts" && <Facts c={c} kb={knowledge} />}
      {tab === "syllabus" && (
        <Syllabus
          c={c}
          info={info}
          src={src}
          policies={
            syllabusSource?.kind === "syllabus"
              ? syllabusSource.policies
              : undefined
          }
          today={today}
        />
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "good" | "watch" | "none";
}) {
  return (
    <li className="panel p-4">
      <p className="flex items-center justify-between text-sm font-extrabold text-muted">
        {label}
        <span
          className={`h-2.5 w-2.5 rounded-full ${tone === "none" ? "bg-line" : tone === "good" ? "bg-teal-face" : "bg-sun"}`}
          aria-label={
            tone === "none" ? "" : tone === "good" ? "good" : "worth watching"
          }
        />
      </p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </li>
  );
}

// ---- Assignments -------------------------------------------------------------------------------

type Item = {
  name: string;
  score: number | null;
  max: number | null;
  status: string;
  due: string;
};

function Work({
  c,
  items,
  cats,
  today,
  now,
  makeReal,
}: {
  c: CourseView;
  items: Item[];
  cats: ReturnType<typeof categorize>;
  today: string;
  now: Date;
  makeReal: (b: { course: string; title: string; at: string }[]) => void;
}) {
  const [planned, setPlanned] = useState<string[]>([]);
  const catOf = new Map<string, string>();
  for (const cat of cats)
    for (const it of cat.items) catOf.set(it.name, cat.name);
  const open = items
    .filter((it) => !it.due || it.due >= today)
    .sort((a, b) => a.due.localeCompare(b.due));
  const past = items
    .filter((it) => it.due && it.due < today)
    .sort((a, b) => b.due.localeCompare(a.due));
  const planFor = (it: Item) => {
    // The afternoon before it's due, or an hour from now if that has already passed.
    const d = it.due ? new Date(`${it.due}T16:00:00`) : new Date(now);
    d.setDate(d.getDate() - 1);
    if (d < now) {
      d.setTime(now.getTime());
      d.setHours(now.getHours() + 1, 0, 0, 0);
    }
    makeReal([
      { course: c.slug, title: `${c.code}: ${it.name}`, at: d.toISOString() },
    ]);
    setPlanned((p) => [...p, it.name]);
  };

  if (!items.length)
    return (
      <div className="panel p-5">
        <h3 className="text-xl font-black">No gradebook yet</h3>
        <p className="mt-1 text-muted">
          Drop your {c.code} Gradescope or Moodle grade page on Home and every
          assignment shows up here.
        </p>
      </div>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="panel overflow-x-auto p-5">
        <h3 className="text-xl font-black">
          {open.length ? `${open.length} open` : "Nothing open"}
        </h3>
        {open.length > 0 && (
          <ul className="mt-2 divide-y divide-line/70">
            {open.map((it) => (
              <li
                key={it.name}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-extrabold">{it.name}</p>
                  <p className="text-sm text-muted">
                    {catOf.get(it.name) ?? "Assignment"} · due{" "}
                    {it.due ? fmtDueDay(it.due) : "date not given"}
                    {it.due === today ? " · tonight" : ""}
                  </p>
                </div>
                {planned.includes(it.name) ? (
                  <span className="flex items-center gap-1 text-sm font-extrabold text-teal">
                    <Check size={15} strokeWidth={3} aria-hidden /> On your week
                  </span>
                ) : (
                  <button
                    onClick={() => planFor(it)}
                    className="btn btn-ghost min-h-9 shrink-0 px-3 text-xs"
                  >
                    <CalendarPlus size={14} aria-hidden /> Plan time
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-6 text-xl font-black">Past work</h3>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-line text-left text-xs font-extrabold uppercase tracking-wider text-muted">
              <th className="py-1.5 pr-2">Assignment</th>
              <th className="py-1.5 pr-2">Category</th>
              <th className="py-1.5 pr-2">Due</th>
              <th className="py-1.5 pr-2">Status</th>
              <th className="py-1.5 text-right">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {past.map((it) => (
              <tr key={it.name}>
                <td className="py-2 pr-2 font-extrabold">{it.name}</td>
                <td className="py-2 pr-2 text-muted">
                  {catOf.get(it.name) ?? "—"}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-muted">
                  {fmtDueDay(it.due)}
                </td>
                <td className="py-2 pr-2">
                  <Pill status={it.status} />
                </td>
                <td
                  className={`py-2 text-right font-black tabular-nums ${it.score != null && it.max ? (it.score / it.max >= 0.7 ? "text-teal" : "text-sun-ink") : "text-muted"}`}
                >
                  {it.score != null && it.max ? `${it.score} / ${it.max}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel h-fit p-5">
        <h3 className="text-xl font-black">By category</h3>
        <p className="mt-1 text-sm text-muted">
          Weights from the syllabus; averages from graded work.
        </p>
        <ul className="mt-3 divide-y divide-line/70">
          {cats.map((cat) => {
            // Past-due only; open work isn't missing yet.
            const missing = cat.items.filter(
              (it) =>
                it.due &&
                it.due < today &&
                (it.status === "missing" || it.status === "not_submitted"),
            ).length;
            return (
              <li
                key={cat.name}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-extrabold">{cat.name}</span>
                  <span className="ml-1 text-muted">
                    {cat.weight != null ? `${cat.weight}%` : ""}
                    {missing ? ` · ${missing} missing` : ""}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-black tabular-nums ${cat.avg == null ? "text-muted" : cat.avg >= 70 ? "text-teal" : "text-sun-ink"}`}
                >
                  {cat.avg != null ? `${Math.round(cat.avg)}%` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Pill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    graded: ["Graded", "bg-teal-soft text-teal-lip"],
    submitted: ["Submitted · grading", "bg-sky-soft text-sky-lip"],
    missing: ["Missing", "bg-sun-soft text-sun-ink"],
    not_submitted: ["Not submitted", "bg-sun-soft text-sun-ink"],
    unknown: ["Open", "bg-polar text-muted"],
  };
  const [label, cls] = map[status] ?? [status, "bg-polar text-muted"];
  return (
    <span
      className={`inline-block rounded-lg px-2 py-0.5 text-xs font-extrabold ${cls}`}
    >
      {label}
    </span>
  );
}

// ---- Attendance --------------------------------------------------------------------------------

function Attendance({
  c,
  rec,
  meets,
  lab,
}: {
  c: CourseView;
  rec: ReturnType<typeof recordFor>;
  meets?: string;
  lab?: string;
}) {
  if (!rec)
    return <p className="text-muted">No attendance record for this course.</p>;
  const absent = rec.attendance.filter((m) => m.status === "absent");
  const late = rec.attendance.filter((m) => m.status === "late");
  // Group meetings by week (Monday) for the dot grid.
  const weeks = new Map<string, typeof rec.attendance>();
  for (const m of rec.attendance) {
    const d = new Date(`${m.date}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = d.toISOString().slice(0, 10);
    weeks.set(key, [...(weeks.get(key) ?? []), m]);
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="panel p-5">
        <h3 className="text-xl font-black">
          {pct(c.x.attendance_rate ?? 0)} attendance
        </h3>
        <p className="mt-1 text-muted">
          {absent.length} absence{absent.length === 1 ? "" : "s"}
          {late.length ? ` and ${late.length} late arrival` : ""} across{" "}
          {rec.attendance.length} meetings since Aug 17. The model&apos;s line
          is 82%; a check-in on Home after class counts here.
        </p>
        <ol className="mt-4 space-y-2" aria-label="Attendance by week">
          {[...weeks.entries()].map(([mon, ms], i) => (
            <li key={mon} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 font-bold text-muted">
                Week {i + 1}
              </span>
              <span className="flex gap-1.5">
                {ms.map((m) => (
                  <span
                    key={m.date}
                    title={`${fmtDueDay(m.date)}: ${m.status}`}
                    className={`grid h-7 w-7 place-items-center rounded-lg text-[11px] font-black ${m.status === "absent" ? "bg-sun-soft text-sun-ink" : m.status === "late" ? "bg-polar text-muted ring-2 ring-inset ring-sun" : "bg-teal-soft text-teal-lip"}`}
                  >
                    {m.status === "absent"
                      ? "–"
                      : new Date(`${m.date}T12:00:00`).toLocaleDateString(
                          "en-US",
                          { weekday: "narrow" },
                        )}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">
          Green: present · amber: absent · outlined: late.
        </p>
      </div>
      <div className="space-y-4">
        <div className="panel p-5">
          <h3 className="font-black">Meets</h3>
          <p className="mt-1 flex items-start gap-2 text-sm">
            <MapPin
              size={16}
              className="mt-0.5 shrink-0 text-teal"
              aria-hidden
            />{" "}
            {meets ?? "See syllabus"}
          </p>
          {lab && (
            <p className="mt-1 flex items-start gap-2 text-sm">
              <FlaskConical
                size={16}
                className="mt-0.5 shrink-0 text-teal"
                aria-hidden
              />{" "}
              {lab}
            </p>
          )}
        </div>
        {absent.length > 0 && (
          <div className="panel p-5">
            <h3 className="font-black">Missed</h3>
            <ul className="mt-1 space-y-1 text-sm text-muted">
              {absent.map((m) => (
                <li key={m.date}>{fmtDueDay(m.date)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Materials ---------------------------------------------------------------------------------

const DOC_ICON: Record<DocType, typeof FileText> = {
  slides: Presentation,
  notes: FileText,
  reading: Newspaper,
  handout: ScrollText,
  lab: FlaskConical,
};

function Materials({
  c,
  docs,
}: {
  c: CourseView;
  docs: (CourseDoc & { sample: boolean })[];
}) {
  if (!docs.length)
    return (
      <div className="panel p-5">
        <h3 className="text-xl font-black">No materials yet</h3>
        <p className="mt-1 text-muted">
          Drop slides or notes for {c.code} on Home or on the Study page.
        </p>
      </div>
    );
  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        {docs.filter((d) => d.sample).length} sample lecture file
        {docs.filter((d) => d.sample).length === 1 ? "" : "s"}
        {docs.some((d) => !d.sample)
          ? ` and ${docs.filter((d) => !d.sample).length} you dropped`
          : ""}
        . Quiz and flashcards are written by Gemini from the file you pick; Viva
        reads the summaries.
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {docs.map((d) => (
          <Doc key={d.id} c={c} d={d} />
        ))}
      </ul>
    </div>
  );
}

function Doc({ c, d }: { c: CourseView; d: CourseDoc & { sample: boolean } }) {
  const [openBody, setOpenBody] = useState(false);
  const Icon = DOC_ICON[d.type] ?? FileText;
  return (
    <li className="panel flex flex-col p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-soft text-sky">
          <Icon size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black leading-snug">{d.title}</p>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">
            {d.type}
            {d.week ? ` · week ${d.week}` : ""}
            {d.sample ? " · sample" : " · yours"}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">{d.summary}</p>
      {d.body && d.body !== d.summary && (
        <>
          <button
            onClick={() => setOpenBody((v) => !v)}
            aria-expanded={openBody}
            className="mt-2 flex items-center gap-1 self-start text-sm font-bold text-teal hover:text-teal-lip"
          >
            {openBody ? "Hide" : "Read"}{" "}
            <ChevronDown
              size={15}
              className={`transition-transform ${openBody ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {openBody && (
            <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-polar p-3 font-sans text-sm leading-relaxed">
              {d.body}
            </pre>
          )}
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/study?tool=quiz&course=${c.slug}&doc=${encodeURIComponent(d.id)}`}
          className="btn btn-ghost min-h-9 px-3 text-xs"
        >
          <Brain size={14} aria-hidden /> Quiz me
        </Link>
        <Link
          href={`/study?tool=flashcards&course=${c.slug}&doc=${encodeURIComponent(d.id)}`}
          className="btn btn-ghost min-h-9 px-3 text-xs"
        >
          <Layers size={14} aria-hidden /> Flashcards
        </Link>
      </div>
    </li>
  );
}

// ---- Syllabus ----------------------------------------------------------------------------------

function Syllabus({
  c,
  info,
  src,
  policies: fromSource,
  today,
}: {
  c: CourseView;
  info: ReturnType<typeof courseInfo>;
  src: ReturnType<typeof sourcesFor>;
  policies?: Record<string, string>;
  today: string;
}) {
  const policies =
    fromSource && Object.values(fromSource).some(Boolean)
      ? fromSource
      : info?.policies;
  const grading = src.grading.length ? src.grading : (info?.grading ?? []);
  const deadlines = src.deadlines.length
    ? src.deadlines
    : (info?.deadlines ?? []);
  const upcoming = deadlines
    .filter((d) => d.date && d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const thisWeek = info?.schedule.find(
    (w, i, all) => w.starts <= today && (all[i + 1]?.starts ?? "9999") > today,
  );
  if (!info && !src.hasSyllabus)
    return (
      <div className="panel p-5">
        <h3 className="text-xl font-black">No syllabus yet</h3>
        <p className="mt-1 text-muted">
          Drop the {c.code} syllabus on Home. Dates land on your week, weights
          feed Insights, policies go to Viva.
        </p>
      </div>
    );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {info && (
        <div className="panel p-5">
          <h3 className="text-xl font-black">About</h3>
          <p className="mt-1 text-muted">{info.about}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Fact icon={<Mail size={15} aria-hidden />} term="Instructor">
              {info.instructor.name} ·{" "}
              <a
                href={`mailto:${info.instructor.email}`}
                className="text-teal underline-offset-2 hover:underline"
              >
                {info.instructor.email}
              </a>
              <br />
              {info.instructor.office} · office hours {info.instructor.hours}
            </Fact>
            {info.ta && (
              <Fact icon={<Mail size={15} aria-hidden />} term="TA">
                {info.ta.name} ·{" "}
                <a
                  href={`mailto:${info.ta.email}`}
                  className="text-teal underline-offset-2 hover:underline"
                >
                  {info.ta.email}
                </a>
                <br />
                office hours {info.ta.hours}
              </Fact>
            )}
            <Fact icon={<MapPin size={15} aria-hidden />} term="Meets">
              {info.meets}
              {info.lab && (
                <>
                  <br />
                  {info.lab}
                </>
              )}
            </Fact>
            <Fact icon={<FileText size={15} aria-hidden />} term="Textbook">
              {info.textbook}
            </Fact>
          </dl>
        </div>
      )}

      <div className="panel p-5">
        <h3 className="text-xl font-black">Grading</h3>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-line/70">
            {grading.map((g) => {
              const notes = info?.grading.find(
                (x) => x.component === g.component,
              )?.notes;
              return (
                <tr key={g.component}>
                  <td className="py-2 pr-2 font-extrabold">
                    {g.component}
                    {notes && (
                      <span className="block text-xs font-bold text-muted">
                        {notes}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right font-black tabular-nums">
                    {g.weight_percent != null ? `${g.weight_percent}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel p-5">
        <h3 className="text-xl font-black">Key dates</h3>
        <ul className="mt-2 divide-y divide-line/70 text-sm">
          {upcoming.map((d) => (
            <li
              key={`${d.title}-${d.date}`}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="font-extrabold">
                {d.title}
                <span className="ml-1 text-xs font-bold uppercase tracking-wider text-muted">
                  {d.kind}
                </span>
              </span>
              <span className="shrink-0 text-muted">
                {fmtDueDay(d.date)}
                {"time" in d && d.time
                  ? ` · ${fmtClock(d.time as string)}`
                  : ""}
              </span>
            </li>
          ))}
          {!upcoming.length && (
            <li className="py-2 text-muted">No dated items ahead.</li>
          )}
        </ul>
      </div>

      {policies && (
        <div className="panel p-5">
          <h3 className="text-xl font-black">Policies</h3>
          <dl className="mt-2 space-y-2 text-sm">
            {Object.entries(policies)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="font-extrabold capitalize">
                    {k.replace(/_/g, " ")}
                  </dt>
                  <dd className="text-muted">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}

      {info && (
        <div className="panel p-5 lg:col-span-2">
          <h3 className="text-xl font-black">Week by week</h3>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b-2 border-line text-left text-xs font-extrabold uppercase tracking-wider text-muted">
                <th className="py-1.5 pr-2">Week</th>
                <th className="py-1.5 pr-2">Topic</th>
                <th className="py-1.5">Reading</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {info.schedule.map((w) => (
                <tr
                  key={w.week}
                  className={thisWeek?.week === w.week ? "bg-teal-soft/50" : ""}
                >
                  <td className="py-2 pr-2 whitespace-nowrap font-extrabold">
                    {w.week}{" "}
                    <span className="font-bold text-muted">
                      · {fmtDueDay(w.starts).replace(/^\w+, /, "")}
                    </span>
                    {thisWeek?.week === w.week && (
                      <span className="ml-2 rounded-md bg-teal-face px-1.5 py-0.5 text-[10px] font-black uppercase text-teal-ink">
                        now
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2">{w.topic}</td>
                  <td className="py-2 text-muted">{w.reading}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Facts: what Pathway knows about this course, where each fact came from, and the review gate ----

const TYPE_LABEL: Record<KbNode["type"], string> = { deadline: "Dates", grade_item: "Gradebook", grading: "Grading", policy: "Policies", contact: "People", topic: "Topics", course_info: "Course", event: "Events", preference: "Things you told Viva" };
const TYPE_ORDER: KbNode["type"][] = ["deadline", "grading", "grade_item", "policy", "contact", "topic", "course_info", "event", "preference"];

function factLine(n: KbNode): string {
  const b = n.body;
  switch (n.type) {
    case "deadline":
      return `${b.date ? fmtDueDay(String(b.date)) : "date not given"}${b.time ? ` · ${fmtClock(String(b.time))}` : ""}${b.weight ? ` · ${b.weight}%` : ""}`;
    case "grading":
      return b.weight != null ? `${b.weight}%${b.notes ? ` · ${b.notes}` : ""}` : String(b.notes ?? "");
    case "grade_item":
      return `${b.score ?? "–"} / ${b.max ?? "–"} · ${String(b.status ?? "").replace("_", " ")}${b.due ? ` · due ${fmtDueDay(String(b.due))}` : ""}`;
    case "policy":
      return String(b.text ?? "");
    case "contact":
      return [b.role, b.email, b.office_hours ? `office hours ${b.office_hours}` : ""].filter(Boolean).join(" · ");
    case "topic":
      return String(b.summary ?? "");
    case "course_info":
      return [b.term, b.meets, b.textbook].filter(Boolean).join(" · ");
    default:
      return "";
  }
}

function Facts({ c, kb }: { c: CourseView; kb: Knowledge }) {
  const { reviewNode, removeKnowledgeSource } = usePathway();
  const params = useSearchParams();
  const highlight = params.get("fact");
  const [openType, setOpenType] = useState<string | null>(highlight ? (kb.nodes.find((n) => n.id === highlight)?.type ?? null) : "deadline");
  const files = kb.sources.filter((s) => s.course === c.code);
  const mine = kb.nodes.filter((n) => n.course === c.code && n.review !== "rejected" && !n.supersededBy);
  const waiting = mine.filter((n) => n.review === "proposed");
  const confirmed = mine.filter((n) => n.review !== "proposed");
  const byId = new Map(files.map((f) => [f.id, f]));
  const sourceName = (n: KbNode) => (n.source ? (byId.get(n.source)?.filename ?? "a file") : n.createdBy === "viva" ? "you told Viva" : "a note");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {waiting.length > 0 && (
          <div className="panel border-sun/60 bg-sun-soft/40 p-5">
            <h3 className="text-xl font-black">{waiting.length} fact{waiting.length === 1 ? "" : "s"} need{waiting.length === 1 ? "s" : ""} you</h3>
            <p className="mt-1 text-sm text-muted">Only confirmed facts move your week, the model&apos;s inputs or what Viva says.</p>
            <ul className="mt-3 space-y-3">
              {waiting.map((n) => (
                <li key={n.id} className="rounded-xl bg-white p-3 text-sm">
                  <p className="font-extrabold">{n.title} <span className="font-bold text-muted">· {TYPE_LABEL[n.type].toLowerCase()}</span></p>
                  <p className="text-muted">{factLine(n)}</p>
                  {n.quote && <p className="mt-1 italic">“{n.quote}”</p>}
                  <p className="mt-1 text-xs text-muted">{sourceName(n)}{n.locator ? ` · ${n.locator}` : ""} · {n.confidence} confidence</p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => reviewNode(n.id, "confirmed")} className="btn btn-primary min-h-9 px-3 text-xs"><Check size={14} aria-hidden /> Confirm</button>
                    <button onClick={() => reviewNode(n.id, "rejected")} className="btn btn-ghost min-h-9 px-3 text-xs">Not right</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="panel p-5">
          <h3 className="text-xl font-black">{confirmed.length} facts on file</h3>
          <p className="mt-1 text-sm text-muted">Every fact carries the line it came from. Viva cites these by name; the Week and Insights read them.</p>
          <ul className="mt-3 divide-y divide-line/70">
            {TYPE_ORDER.filter((t) => confirmed.some((n) => n.type === t)).map((t) => {
              const rows = confirmed.filter((n) => n.type === t).sort((a, b) => String(a.body.date ?? a.body.due ?? "").localeCompare(String(b.body.date ?? b.body.due ?? "")));
              const open = openType === t;
              return (
                <li key={t} className="py-2">
                  <button onClick={() => setOpenType(open ? null : t)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 py-1 text-left">
                    <span className="font-extrabold">{TYPE_LABEL[t]} <span className="font-bold text-muted">· {rows.length}</span></span>
                    <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {open && (
                    <ul className="mt-1 space-y-2 text-sm">
                      {rows.map((n) => (
                        <li key={n.id} id={`fact-${n.id}`} className={`rounded-xl px-3 py-2 ${highlight === n.id ? "bg-sky-soft ring-2 ring-sky/40" : "bg-polar"}`}>
                          <p className="font-extrabold">{n.title}{n.review === "edited" && <span className="ml-1 text-xs font-bold text-muted">· edited by you</span>}</p>
                          <p className="text-muted">{factLine(n)}</p>
                          <p className="mt-0.5 text-xs text-muted">{sourceName(n)}{n.locator ? ` · ${n.locator}` : ""}{n.quote && n.quote !== factLine(n) ? ` · “${n.quote.length > 110 ? `${n.quote.slice(0, 110)}…` : n.quote}”` : ""}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="panel h-fit p-5">
        <h3 className="text-xl font-black">Files</h3>
        <p className="mt-1 text-sm text-muted">What these facts were read from.</p>
        <ul className="mt-3 divide-y divide-line/70 text-sm">
          {files.map((f) => {
            const n = kb.nodes.filter((x) => x.source === f.id && x.review !== "rejected").length;
            const ms = f.steps.reduce((t, st) => t + (st.ms ?? 0), 0);
            return (
              <li key={f.id} className="py-2">
                <p className="truncate font-extrabold" title={f.filename}>{f.filename}</p>
                <p className="text-xs text-muted">
                  {f.kind} · {n} fact{n === 1 ? "" : "s"} · {isSampleSource(f) ? "sample" : ms ? `read in ${(ms / 1000).toFixed(1)} s` : "yours"}
                  {!isSampleSource(f) && (
                    <button onClick={() => removeKnowledgeSource(f.id)} className="ml-2 font-extrabold text-muted hover:text-ink">Forget</button>
                  )}
                </p>
              </li>
            );
          })}
          {!files.length && <li className="py-2 text-muted">Nothing on file for {c.code} yet.</li>}
        </ul>
        <Link href="/" className="btn btn-ghost mt-3 min-h-9 w-full px-3 text-xs">Drop a file on Home</Link>
      </div>
    </div>
  );
}

function Fact({
  icon,
  term,
  children,
}: {
  icon: ReactNode;
  term: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 shrink-0 text-teal">{icon}</span>
      <div>
        <dt className="text-xs font-extrabold uppercase tracking-wider text-muted">
          {term}
        </dt>
        <dd className="leading-relaxed">{children}</dd>
      </div>
    </div>
  );
}

const fmtClock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h)) return hhmm;
  return new Date(2026, 0, 1, h, m).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};
