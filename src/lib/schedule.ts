// The week as one list of events, wherever they come from, plus the rules that look at it
// and suggest a change. Suggestions are deterministic (no model call) so they appear
// instantly; Viva can explain them in chat because they are also in its context.

import type { Block } from "./store";

export type CalEvent = {
  id: string;
  title: string;
  start: string; // ISO local
  end: string;
  kind: "class" | "work" | "study" | "exam" | "other";
  course?: string; // slug
  source: "demo" | "google" | "pathway";
  localId?: string; // on a Google event: the local event it is a copy of (from the Pathway tag)
};

/** Local wall-clock ISO without a zone, the form the grid and Google (with timeZone) both read. */
export const localIso = (d: Date) => iso(d);
const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
};
const at = (base: Date, dayOffset: number, h: number, m = 0) => {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
};
export const mondayOf = (d: Date) => {
  const m = new Date(d);
  m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  m.setHours(0, 0, 0, 0);
  return m;
};

// ---- demo classes: a believable week built from the student's course codes ---------------

const PATTERNS: Record<string, { days: number[]; h: number; m: number; len: number; room: string }> = {
  // day index: 0 = Monday
  "BIO 181": { days: [0, 2, 4], h: 9, m: 35, len: 50, room: "Bostian 2722" },
  "ST 311": { days: [1, 3], h: 13, m: 30, len: 75, room: "SAS 1102" },
  "CSC 216": { days: [0, 2, 4], h: 11, m: 45, len: 50, room: "EB2 1230" },
  "MA 241": { days: [1, 3], h: 8, m: 30, len: 75, room: "SAS 2203" },
  "ECE 200": { days: [0, 2], h: 11, m: 20, len: 110, room: "EB2 1021" },
  "EC 201": { days: [1, 3], h: 10, m: 15, len: 75, room: "Nelson 3400" },
  "PY 205": { days: [0, 2, 4], h: 8, m: 30, len: 50, room: "Riddick 301" },
  "CH 101": { days: [0, 2, 4], h: 10, m: 40, len: 50, room: "Dabney 220" },
};

export function demoWeek(now: Date, courses: { slug: string; code: string; exam: { title: string; date: string } }[], todos: { id: string; title: string; due?: string }[] = []): CalEvent[] {
  const mon = mondayOf(now);
  const out: CalEvent[] = [];
  courses.forEach((c, i) => {
    const p = PATTERNS[c.code] ?? { days: [i % 2 === 0 ? 0 : 1, i % 2 === 0 ? 2 : 3], h: 9 + i, m: 0, len: 50, room: "" };
    for (const d of p.days) {
      const s = at(mon, d, p.h, p.m);
      out.push({ id: `demo-${c.slug}-${d}`, title: `${c.code} lecture`, start: iso(s), end: iso(new Date(s.getTime() + p.len * 60_000)), kind: "class", course: c.slug, source: "demo" });
    }
    const ex = new Date(c.exam.date);
    if (ex >= mon && ex < at(mon, 14, 0)) out.push({ id: `demo-exam-${c.slug}`, title: `${c.code} ${c.exam.title}`, start: iso(ex), end: iso(new Date(ex.getTime() + 75 * 60_000)), kind: "exam", course: c.slug, source: "demo" });
  });
  // due dates (from Moodle), as 30-minute markers
  for (const t of todos) {
    if (!t.due) continue;
    const d = new Date(t.due);
    if (d < mon || d >= at(mon, 14, 0)) continue;
    out.push({ id: `demo-due-${t.id}`, title: `Due: ${t.title.replace(/^Submit /, "")}`, start: iso(d), end: iso(new Date(d.getTime() + 30 * 60_000)), kind: "other", source: "demo" });
  }
  // the rest of a life
  for (const d of [1, 3]) out.push({ id: `demo-work-${d}`, title: "Work shift", start: iso(at(mon, d, 17)), end: iso(at(mon, d, 21)), kind: "work", source: "demo" });
  out.push({ id: "demo-club", title: "Robotics club", start: iso(at(mon, 2, 18)), end: iso(at(mon, 2, 19, 30)), kind: "other", source: "demo" });
  out.push({ id: "demo-gym", title: "Gym", start: iso(at(mon, 5, 14)), end: iso(at(mon, 5, 15)), kind: "other", source: "demo" });
  return out;
}

/** Dated items from dropped syllabi (exams, quizzes, due work) become calendar events too. */
export function sourceEvents(
  sources: { kind: string; course: string; deadlines?: { title: string; date: string; kind: string; time?: string }[] }[],
  courses: { slug: string; code: string }[],
  now: Date,
): CalEvent[] {
  const mon = mondayOf(now);
  const horizon = at(mon, 28, 0);
  const out: CalEvent[] = [];
  for (const src of sources) {
    if (src.kind !== "syllabus" || !src.deadlines) continue;
    const course = courses.find((c) => c.code === src.course);
    src.deadlines.forEach((d, i) => {
      if (!d.date) return;
      const isExam = d.kind === "exam" || d.kind === "quiz";
      const [h, m] = (d.time || (isExam ? "09:00" : "23:30")).split(":").map(Number);
      const start = new Date(`${d.date}T00:00:00`);
      start.setHours(h, m, 0, 0);
      if (start < mon || start >= horizon) return;
      out.push({
        id: `src-${src.course.replace(/\s/g, "")}-${i}`,
        title: isExam ? `${src.course} ${d.title}` : `Due: ${d.title}`,
        start: iso(start),
        end: iso(new Date(start.getTime() + (isExam ? 75 : 30) * 60_000)),
        kind: isExam ? "exam" : "other",
        course: course?.slug,
        source: "demo",
      });
    });
  }
  return out;
}

export function blocksAsEvents(blocks: Block[], minutes = 50): CalEvent[] {
  return blocks.map((b) => ({ id: b.id, title: b.title, start: iso(new Date(b.at)), end: iso(new Date(new Date(b.at).getTime() + minutes * 60_000)), kind: "study", course: b.course, source: "pathway" }));
}

// ---- rules -----------------------------------------------------------------------------------

export type Op = { op: "move"; id: string; start: string; end: string } | { op: "add"; event: CalEvent };
export type Suggestion = { id: string; title: string; why: string; ops: Op[] };

const overlaps = (a: CalEvent, b: CalEvent) => a.id !== b.id && a.start < b.end && b.start < a.end;
const dayKey = (s: string) => s.slice(0, 10);

/** Earliest free 50-minute slot on `day` between 9:00 and 21:00, not overlapping `events`. */
export function freeSlot(events: CalEvent[], day: Date, minutes = 50, fromHour = 9, toHour = 21): { start: string; end: string } | null {
  for (let h = fromHour; h + minutes / 60 <= toHour; h++) {
    for (const m of [0, 30]) {
      const s = at(day, 0, h, m);
      const e = new Date(s.getTime() + minutes * 60_000);
      if (e.getHours() + e.getMinutes() / 60 > toHour) continue;
      const probe: CalEvent = { id: "probe", title: "", start: iso(s), end: iso(e), kind: "study", source: "pathway" };
      if (!events.some((x) => overlaps(x, probe))) return { start: probe.start, end: probe.end };
    }
  }
  return null;
}

export function suggest(allEvents: CalEvent[], now: Date, courses: { slug: string; code: string; exam: { title: string; date: string }; atRisk: boolean }[]): Suggestion[] {
  const out: Suggestion[] = [];
  // slots already proposed count as taken for the next proposal
  const taken: CalEvent[] = [];
  const events = allEvents;
  const withTaken = () => [...allEvents, ...taken];
  const claim = (slot: { start: string; end: string } | null) => {
    if (slot) taken.push({ id: `taken-${taken.length}`, title: "", start: slot.start, end: slot.end, kind: "study", source: "pathway" });
    return slot;
  };
  const study = events.filter((e) => e.kind === "study");
  const fmt = (s: string) => new Date(s).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

  for (const b of study) {
    // 1. A study block that collides with something else.
    const clash = events.find((e) => e.kind !== "study" && overlaps(e, b));
    if (clash) {
      const day = new Date(b.start);
      const slot = claim(freeSlot(withTaken(), day) ?? freeSlot(withTaken(), at(day, 1, 0)));
      if (slot)
        out.push({
          id: `clash-${b.id}`,
          title: `Move "${b.title}" to ${fmt(slot.start)}`,
          why: `It overlaps ${clash.title} (${fmt(clash.start)}).`,
          ops: [{ op: "move", id: b.id, start: slot.start, end: slot.end }],
        });
      continue;
    }
    // 2. A study block that starts late at night (late-night share is a model input).
    if (new Date(b.start).getHours() >= 22) {
      const day = new Date(b.start);
      const slot = claim(freeSlot(withTaken(), day, 50, 9, 21) ?? freeSlot(withTaken(), at(day, 1, 0)));
      if (slot)
        out.push({
          id: `late-${b.id}`,
          title: `Move "${b.title}" to ${fmt(slot.start)}`,
          why: "It starts after 10 PM. Students with similar patterns often do better with daytime blocks.",
          ops: [{ op: "move", id: b.id, start: slot.start, end: slot.end }],
        });
    }
  }

  // 3. An exam inside 10 days with no study block at least 2.5 days out. Exams from a dropped
  //    syllabus count too, as long as they belong to one of the student's courses.
  const examsFromSources = events
    .filter((e) => e.kind === "exam" && e.course && e.id.startsWith("src-"))
    .map((e) => ({ slug: e.course!, code: courses.find((c) => c.slug === e.course)?.code ?? e.title, exam: { title: e.title, date: e.start }, atRisk: courses.find((c) => c.slug === e.course)?.atRisk ?? false }));
  for (const c of [...courses, ...examsFromSources]) {
    const exam = new Date(c.exam.date);
    const days = (exam.getTime() - now.getTime()) / 86_400_000;
    if (days < 0 || days > 10 || (!c.atRisk && days > 7)) continue;
    const early = study.some((b) => b.course === c.slug && (exam.getTime() - new Date(b.start).getTime()) / 86_400_000 >= 2.5);
    if (early) continue;
    const target = at(exam, -3, 0);
    const day = target < now ? at(now, 0, 0) : target;
    const slot = claim(freeSlot(withTaken(), day) ?? freeSlot(withTaken(), at(day, 1, 0)));
    if (!slot) continue;
    if (out.some((x) => x.id === `exam-${c.slug}-${c.exam.date.slice(0, 10)}`)) continue;
    out.push({
      id: `exam-${c.slug}-${c.exam.date.slice(0, 10)}`,
      title: `Add a ${c.code} review block ${fmt(slot.start)}`,
      why: `${c.exam.title} is in ${Math.round(days)} days and nothing is planned 3 days out.${c.atRisk ? " Starting earlier is the smallest change that moves this class to on track." : ""}`,
      ops: [{ op: "add", event: { id: `add-${c.slug}-${slot.start}`, title: `${c.code} exam review`, start: slot.start, end: slot.end, kind: "study", course: c.slug, source: "pathway" } }],
    });
  }

  // 4. A day packed past 6 hours of class and work with no study at all, when an exam is near.
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) byDay.set(dayKey(e.start), [...(byDay.get(dayKey(e.start)) ?? []), e]);
  for (const [day, es] of byDay) {
    const busy = es.filter((e) => e.kind === "class" || e.kind === "work").reduce((h, e) => h + (new Date(e.end).getTime() - new Date(e.start).getTime()) / 3_600_000, 0);
    const hasStudy = es.some((e) => e.kind === "study");
    if (busy >= 6 && hasStudy) {
      const b = es.find((e) => e.kind === "study")!;
      const next = at(new Date(day + "T00:00:00"), 1, 0);
      const slot = claim(freeSlot(withTaken(), next));
      const exam = courses.find((c) => c.slug === b.course)?.exam.date;
      const tooLate = exam ? (new Date(exam).getTime() - new Date(slot?.start ?? next).getTime()) / 86_400_000 < 1.5 : false;
      if (slot && !tooLate && !out.some((s) => s.ops.some((o) => o.op === "move" && o.id === b.id)))
        out.push({
          id: `packed-${b.id}`,
          title: `Move "${b.title}" to ${fmt(slot.start)}`,
          why: `${new Date(day + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })} already has ${busy.toFixed(0)} hours of class and work.`,
          ops: [{ op: "move", id: b.id, start: slot.start, end: slot.end }],
        });
    }
  }
  return out.slice(0, 3);
}

export function applyOps(events: CalEvent[], ops: Op[]): CalEvent[] {
  let next = events;
  for (const o of ops) {
    if (o.op === "move") next = next.map((e) => (e.id === o.id ? { ...e, start: o.start, end: o.end } : e));
    else next = [...next.filter((e) => e.id !== o.event.id), o.event];
  }
  return next;
}
