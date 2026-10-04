import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksAsEvents, demoWeek, freeSlot, slotsFor, sourceEvents, suggest, type CalEvent } from "./schedule.ts";
import { planBlocks } from "./plan.ts";
import { localIso, toLocal, toUtc } from "./time.ts";

const NOW = new Date("2026-10-06T09:00:00");
const courses = [
  { slug: "st-311", code: "ST 311", exam: { title: "Midterm", date: "2026-10-14T13:30:00" }, atRisk: false },
  { slug: "bio-181", code: "BIO 181", exam: { title: "Midterm", date: "2026-10-10T10:00:00" }, atRisk: true },
];

test("every time the app keeps is the local form, whatever came in", () => {
  assert.equal(toLocal("2026-10-06T13:35:00.000Z"), localIso(new Date("2026-10-06T13:35:00.000Z")));
  assert.equal(toLocal("2026-10-06T09:35"), "2026-10-06T09:35:00");
  assert.equal(toLocal("2026-10-06T09:35:00"), "2026-10-06T09:35:00");
  assert.equal(toLocal("2026-10-06T09:35:00.000"), "2026-10-06T09:35:00");
  assert.equal(toLocal("2026-10-10"), "2026-10-10");
  assert.equal(new Date(toUtc("2026-10-06T09:35:00")).getTime(), new Date("2026-10-06T09:35:00").getTime());
  assert.match(toUtc("2026-10-06T09:35:00"), /Z$/);
  // the local form sorts as text
  assert.ok(toLocal("2026-10-06T09:35") < toLocal("2026-10-06T10:00:00.000"));
});

test("a plan's blocks are in the local form, at the hour they were meant for", () => {
  const made = planBlocks({ slug: "bio-181", code: "BIO 181", exam: { date: "2026-10-10T10:00:00" } }, [{ feature: "avg_days_started_before_exam", from: 1, to: 3, direction: "up" } as never], NOW);
  assert.ok(made.length > 0);
  for (const b of made) {
    assert.match(b.at, /^\d{4}-\d{2}-\d{2}T16:00:00$/);
  }
});

test("one deadline once: a syllabus and a grade page listing the same item make one marker, and the Moodle feed's copy wins", () => {
  const feed = demoWeek(NOW, courses, [{ id: "st-hw4", title: "Submit ST 311 HW 4", due: "2026-10-06T23:59:00" }]);
  const sources = [
    { kind: "syllabus", course: "ST 311", deadlines: [{ title: "HW 4", date: "2026-10-06", kind: "homework" }, { title: "Midterm", date: "2026-10-14", kind: "exam", time: "13:30" }] },
    { kind: "grades", course: "ST 311", items: [{ name: "Homework 4", due: "2026-10-06", status: "not_submitted" }] },
  ];
  const extra = sourceEvents(sources, courses, NOW, feed);
  const hw = [...feed, ...extra].filter((e) => e.course === "st-311" && e.start.startsWith("2026-10-06") && /hw|homework/i.test(e.title));
  assert.equal(hw.length, 1, hw.map((e) => e.title).join(", "));
  const exams = [...feed, ...extra].filter((e) => e.course === "st-311" && e.kind === "exam");
  assert.equal(exams.length, 1);
});

test("a due marker is not a clash: a block at 11 PM beside a 11:30 PM deadline is left alone", () => {
  const events: CalEvent[] = [
    { id: "due-1", title: "Due: HW 4", start: "2026-10-06T23:30:00", end: "2026-10-07T00:00:00", kind: "other", course: "st-311", source: "demo" },
    ...blocksAsEvents([{ id: "b1", course: "st-311", title: "Study block", at: "2026-10-06T23:00:00", done: false }]),
  ];
  const out = suggest(events, NOW, courses.filter((c) => c.slug === "st-311"));
  assert.ok(!out.some((s) => s.id.startsWith("clash-")), out.map((s) => s.title).join("; "));
  // the late-night rule still speaks up
  assert.ok(out.some((s) => s.id.startsWith("late-")));
});

test("freeSlot skips what's taken and keeps the form", () => {
  const busy: CalEvent[] = [{ id: "c", title: "Lecture", start: "2026-10-06T09:00:00", end: "2026-10-06T10:00:00", kind: "class", source: "demo" }];
  const slot = freeSlot(busy, new Date("2026-10-06T00:00:00"), 50, 9, 21);
  assert.equal(slot?.start, "2026-10-06T10:00:00");
});

test("slotsFor: same-length free slots ahead of now, never overlapping, ignoring the event itself", () => {
  const now = new Date("2026-10-06T13:20:00");
  const ev: CalEvent = { id: "b1", title: "Study block", start: "2026-10-06T16:00:00", end: "2026-10-06T16:50:00", kind: "study", source: "pathway" };
  const lecture: CalEvent = { id: "c1", title: "MA 241 lecture", start: "2026-10-07T09:00:00", end: "2026-10-07T10:15:00", kind: "class", source: "demo" };
  const slots = slotsFor([ev, lecture], ev, now, 2);
  assert.ok(slots.length > 0);
  for (const s of slots) {
    assert.ok(new Date(s.start) > now, `${s.start} is in the past`);
    assert.equal((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60_000, 50);
    assert.ok(!(s.start < lecture.end && s.end > lecture.start), `${s.start} overlaps the lecture`);
    assert.notEqual(s.start, ev.start);
  }
  assert.ok(slots.some((s) => s.start.startsWith("2026-10-07T10:30")), "first free morning slot after the lecture");
});
