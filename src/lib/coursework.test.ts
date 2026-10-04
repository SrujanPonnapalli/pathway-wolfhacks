import { test } from "node:test";
import assert from "node:assert/strict";
import { baseFeatures, meetingsBefore, recordFor } from "./coursework.ts";
import { COURSES, COURSE_CODES } from "./coursework-data.ts";
import { JUDGE_COURSE, NOW, PROFILES, type CourseSeed } from "./mock.ts";
import { predict, type Features, type Tree } from "./tree.ts";
import early from "../../public/models/tree_early.json" with { type: "json" };

const tree = early as Tree;
const everyCourse: { who: string; c: CourseSeed }[] = [
  ...PROFILES.flatMap((p) => p.courses.map((c) => ({ who: p.name, c }))),
  { who: "judge", c: JUDGE_COURSE },
];

// The same override src/lib/store.tsx featuresFor applies when a grade page exists for a course.
function withGradeOverride(
  x: Features,
  items: { due: string; status: string }[],
): Features {
  const past = items.filter(
    (it) => it.due && new Date(`${it.due}T23:59:00`) < NOW,
  );
  if (!past.length) return x;
  const missed = past.filter(
    (it) => it.status === "missing" || it.status === "not_submitted",
  ).length;
  return {
    ...x,
    missed_deadlines: missed,
    on_time_submission_rate: +((past.length - missed) / past.length).toFixed(4),
  };
}

test("every dataset course has a syllabus with weights that sum to 100, a schedule, assignments and documents with real bodies", () => {
  assert.equal(COURSE_CODES.length, 8);
  for (const code of COURSE_CODES) {
    const info = COURSES[code];
    const weight = info.grading.reduce((s, g) => s + g.weight_percent, 0);
    assert.equal(weight, 100, `${code} grading weights sum to ${weight}`);
    assert.ok(info.schedule.length >= 10, `${code} has a weekly schedule`);
    assert.ok(info.assignments.length >= 7, `${code} has released assignments`);
    assert.ok(
      info.deadlines.some((d) => d.kind === "exam"),
      `${code} has an exam deadline`,
    );
    assert.ok(info.docs.length >= 4, `${code} has documents`);
    for (const d of info.docs) {
      assert.ok(d.summary.length > 40, `${code} ${d.title} has a summary`);
      assert.ok(
        d.body.split(/\s+/).length >= 120,
        `${code} ${d.title} body is substantial`,
      );
    }
    for (const a of info.assignments)
      assert.ok(
        info.grading.some((g) => g.component === a.category),
        `${code} ${a.name} category "${a.category}" is a grading component`,
      );
  }
});

test("the sample gradebook never changes a demo profile's status, and keeps missed work on the student's side of the model's line", () => {
  for (const { who, c } of everyCourse) {
    const x = baseFeatures(c);
    const rec = recordFor(c.code, x)!;
    assert.ok(rec, `${who} ${c.code} has a record`);
    const before = predict(tree, x).atRisk;
    const after = predict(tree, withGradeOverride(x, rec.assignments)).atRisk;
    assert.equal(
      after,
      before,
      `${who} ${c.code}: status flipped (${before} -> ${after})`,
    );
    const past = rec.assignments.filter((a) => a.status !== "not_submitted");
    const missing = past.filter((a) => a.status === "missing").length;
    const onTime = (past.length - missing) / past.length;
    assert.equal(
      onTime <= 0.79,
      (x.on_time_submission_rate ?? 1) <= 0.79,
      `${who} ${c.code}: on-time ${onTime.toFixed(2)} vs seed ${x.on_time_submission_rate}`,
    );
    assert.ok(
      rec.assignments.every(
        (a) => !/exam|test|midterm/i.test(a.name) || a.status !== "missing",
      ),
      `${who} ${c.code}: exams are never missing`,
    );
    assert.ok(
      rec.assignments
        .filter((a) => a.status === "graded")
        .every((a) => a.score != null && a.score >= 0 && a.score <= a.max),
      `${who} ${c.code}: graded scores are in range`,
    );
  }
});

test("attendance logs follow the real meeting days and land near the profile's rate", () => {
  assert.ok(
    !meetingsBefore("BIO 181").includes("2026-09-07"),
    "no class on Labor Day",
  );
  assert.equal(
    meetingsBefore("BIO 181").length,
    21,
    "MWF course has met 21 times by Oct 6",
  );
  assert.equal(
    meetingsBefore("ST 311").length,
    14,
    "TTh course has met 14 times by Oct 6",
  );
  for (const { who, c } of everyCourse) {
    const x = baseFeatures(c);
    const rec = recordFor(c.code, x)!;
    const present = rec.attendance.filter((m) => m.status !== "absent").length;
    assert.ok(
      Math.abs(present / rec.attendance.length - (x.attendance_rate ?? 0)) <
        0.06,
      `${who} ${c.code}: attendance log ${present}/${rec.attendance.length} vs ${x.attendance_rate}`,
    );
    assert.ok(
      rec.attendance.slice(0, 2).every((m) => m.status === "present"),
      "never absent in the first two meetings",
    );
  }
});

test("MA 241 quiz 3 is missing, as the TA's email says", () => {
  for (const { c } of everyCourse.filter((e) => e.c.code === "MA 241")) {
    const rec = recordFor(c.code, baseFeatures(c))!;
    assert.equal(
      rec.assignments.find((a) => a.name === "Quiz 3")?.status,
      "missing",
    );
  }
});

