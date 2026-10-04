import { test } from "node:test";
import assert from "node:assert/strict";
import { compileContext, scopeFor } from "./compile.ts";
import { legacySource, nodeId, reconcile, review, toNodes } from "./nodes.ts";
import type { KbNode } from "./types.ts";

const ctx = { profile: "maya", course: "BIO 181", source: "s1", at: "2026-10-06T13:00:00.000Z" };
const syllabus = {
  classification: { kind: "syllabus" as const, course_guess: "BIO 181", title: "BIO 181 Syllabus", confidence: "high" as const, why: "" },
  syllabus: {
    course: { code: "BIO 181", name: "Introductory Biology", term: "Fall 2026", instructor: "Dr. Lena Ortiz", instructor_email: "lortiz@ncsu.edu", office_hours: "Tue 2-3" },
    grading: [{ component: "Midterm", weight_percent: 25, notes: "" }, { component: "Lab reports", weight_percent: 20, notes: "" }],
    deadlines: [
      { title: "Midterm", kind: "exam" as const, date: "2026-10-10", time: "10:00", weight_percent: 25, confidence: "high" as const, source_text: "Midterm Sat Oct 10" },
      { title: "Lab report 2", kind: "assignment" as const, date: "", time: "", weight_percent: null, confidence: "medium" as const, source_text: "Lab report 2 due week 9" },
    ],
    policies: { late_work: "10% per day", attendance: "", extensions: "", academic_integrity: "" },
    warnings: [],
  },
};

test("a syllabus becomes typed nodes with quotes, locators and stable ids", () => {
  const nodes = toNodes(syllabus, ctx);
  const types = nodes.map((n) => n.type);
  assert.ok(types.includes("contact") && types.includes("grading") && types.includes("deadline") && types.includes("policy"));
  const midterm = nodes.find((n) => n.title === "Midterm" && n.type === "deadline")!;
  assert.equal(midterm.quote, "Midterm Sat Oct 10");
  assert.equal(midterm.locator, "syllabus · schedule");
  assert.equal(midterm.id, nodeId("maya", "BIO 181", "deadline", "Midterm", "2026-10-10"));
  const undated = nodes.find((n) => n.title === "Lab report 2")!;
  assert.equal(undated.confidence, "low", "a deadline without a date waits for the student");
});

test("re-reading the same file merges; a moved date becomes a conflict that waits for review", () => {
  const first = review(toNodes(syllabus, ctx), []);
  const again = reconcile(first, toNodes(syllabus, ctx));
  assert.equal(again.nodes.length, 0);
  assert.ok(again.merged > 0);
  const moved = { ...syllabus, syllabus: { ...syllabus.syllabus, deadlines: [{ ...syllabus.syllabus.deadlines[0], date: "2026-10-12", source_text: "Exam moved to Oct 12" }] } };
  const rec = reconcile(first, toNodes(moved, { ...ctx, source: "s2" }));
  assert.equal(rec.conflicts, 1);
  assert.equal(rec.edges[0].rel, "conflicts_with");
  const reviewed = review(rec.nodes, rec.edges);
  assert.equal(reviewed.find((n) => n.type === "deadline")!.review, "proposed");
});

test("grade rows link to the grading component they count toward", () => {
  const base = review(toNodes(syllabus, ctx), []);
  const grades = toNodes({ classification: { kind: "grades", course_guess: "BIO 181", title: "Gradescope", confidence: "high", why: "" }, grades: { course_guess: "BIO 181", source: "Gradescope", items: [{ name: "Lab Report 1", score: 41, max: 50, status: "graded", due: "2026-09-18" }], average_percent: 82, warnings: [] } }, { ...ctx, source: "s3" });
  const rec = reconcile(base, grades);
  assert.ok(rec.edges.some((e) => e.rel === "counts_toward"));
});

test("the legacy Source shape only carries confirmed deadlines", () => {
  const nodes = review(toNodes(syllabus, ctx), []);
  const src = legacySource("syllabus", "BIO 181 Syllabus", "BIO 181", nodes)!;
  assert.equal(src.kind, "syllabus");
  if (src.kind === "syllabus") {
    assert.deepEqual(src.deadlines.map((d) => d.title), ["Midterm"]);
    assert.equal(src.grading.length, 2);
  }
});

test("the context pack is scoped, citable and flags unconfirmed facts", () => {
  const nodes: KbNode[] = review(toNodes(syllabus, ctx), []).concat(review(toNodes({ ...syllabus, classification: { ...syllabus.classification, course_guess: "ST 311" } }, { ...ctx, course: "ST 311", source: "s9" }), []));
  const kb = { sources: [], nodes, edges: [] };
  const scope = scopeFor("when is my bio 181 midterm?", undefined, ["BIO 181", "ST 311"]);
  assert.deepEqual(scope.courses, ["BIO 181"]);
  const pack = compileContext(kb, scope);
  assert.ok(pack.text.includes("BIO 181 knowledge"));
  assert.ok(pack.text.includes("Midterm · 2026-10-10 10:00"));
  assert.ok(pack.text.includes("ST 311: ") && !pack.text.includes("ST 311 knowledge"), "the other course is one line");
  assert.ok(pack.text.includes("waiting for the student to confirm"));
  assert.ok(pack.ids.every((id) => /^n[0-9a-f]{8}$/.test(id)));
});
