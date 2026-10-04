import { test } from "node:test";
import assert from "node:assert/strict";
import { docsFor, isSampleSource, sampleKnowledge } from "./sample.ts";
import { legacySource } from "./nodes.ts";
import { COURSES } from "../coursework-data.ts";
import { JUDGE_COURSE, PROFILES } from "../mock.ts";

const profiles = PROFILES.map((p) => ({ id: p.id, courses: p.id === "judge" ? [JUDGE_COURSE] : p.courses }));

test("every profile seeds a syllabus, a gradebook and lecture files per course, with unique ids and no clashes", () => {
  for (const p of profiles) {
    const kb = sampleKnowledge(p.id, p.courses);
    assert.equal(kb.sources.length, p.courses.reduce((n, c) => n + 2 + COURSES[c.code].docs.length, 0), `${p.id}: one source per syllabus, gradebook and file`);
    assert.ok(kb.sources.every(isSampleSource), "sample sources are marked");
    assert.equal(new Set(kb.nodes.map((n) => n.id)).size, kb.nodes.length, `${p.id}: node ids are unique`);
    assert.ok(kb.nodes.every((n) => n.review === "confirmed" && n.createdBy === "seed" && n.source), `${p.id}: seeded facts are confirmed and traceable`);
    assert.equal(kb.edges.filter((e) => e.rel === "conflicts_with").length, 0, `${p.id}: no planted clashes`);
    for (const c of p.courses) {
      const mine = kb.nodes.filter((n) => n.course === c.code);
      assert.ok(mine.some((n) => n.type === "contact") && mine.some((n) => n.type === "grading") && mine.some((n) => n.type === "deadline") && mine.some((n) => n.type === "policy") && mine.some((n) => n.type === "grade_item") && mine.some((n) => n.type === "topic"), `${p.id} ${c.code} has every fact type`);
    }
  }
});

test("the seed projects back into the Sources Insights and the tree read, with the syllabus weights intact", () => {
  const maya = profiles[0];
  const kb = sampleKnowledge(maya.id, maya.courses);
  const legacy = kb.sources.map((s) => legacySource(s.kind, s.filename, s.course, kb.nodes.filter((n) => n.source === s.id))).filter((x) => x !== null);
  for (const c of maya.courses) {
    const syl = legacy.find((s) => s.kind === "syllabus" && s.course === c.code);
    const grades = legacy.find((s) => s.kind === "grades" && s.course === c.code);
    assert.ok(syl && syl.kind === "syllabus", `${c.code} syllabus`);
    assert.ok(grades && grades.kind === "grades", `${c.code} gradebook`);
    assert.equal(syl.grading.reduce((n, g) => n + (g.weight_percent ?? 0), 0), 100);
    assert.equal(grades.items.length, kb.nodes.filter((n) => n.course === c.code && n.type === "grade_item").length);
    assert.ok(syl.policies.late_work, "late-work policy reaches the planner");
    assert.ok(syl.deadlines.some((d) => d.kind === "exam"), "exam dates reach the week");
  }
});

test("re-seeding is idempotent and materials keep their full text", () => {
  const maya = profiles[0];
  const a = sampleKnowledge(maya.id, maya.courses);
  const b = sampleKnowledge(maya.id, maya.courses);
  assert.deepEqual(a.nodes.map((n) => n.id), b.nodes.map((n) => n.id));
  const docs = docsFor("BIO 181", a);
  assert.equal(docs.length, COURSES["BIO 181"].docs.length);
  assert.ok(docs.every((d) => d.sample && d.body.length > 500));
});
