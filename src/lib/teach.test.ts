import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ROUNDS,
  clean,
  clearCount,
  findCourse,
  findDoc,
  finished,
  matchConcept,
  matchRequest,
  mergeConcepts,
  onStudyGuide,
  spoken,
  tally,
  teachIntro,
  type TeachCourse,
  type TeachDoc,
  type TeachFeedback,
  weakPoints,
} from "./teach.ts";

const krebs = {
  topic: "Krebs cycle",
  key_points: ["Happens in the mitochondrial matrix", "Breaks acetyl-CoA down to CO2", "Makes NADH and FADH2 for the electron transport chain"],
  source_ref: "Slides 12-15",
};
const fb = (f: Partial<TeachFeedback>): TeachFeedback => clean(f, krebs.key_points.length);

test("clean drops out-of-range and duplicate points, and clear wins over vague", () => {
  const f = clean({ clear: [2, 2, 7, -1, 0], vague: [{ point: 0, note: "dup" }, { point: 1, note: "fuzzy" }, { point: 1, note: "again" }, { point: 9, note: "bad" }] }, 3);
  assert.deepEqual(f.clear, [0, 2]);
  assert.deepEqual(f.vague, [{ point: 1, note: "fuzzy" }]);
  assert.equal(f.hint, "");
});

test("clean survives junk sent back by the browser", () => {
  const f = clean({ clear: "nope", vague: [null], check_notes: [3, " ", "Check that"] } as unknown as Partial<TeachFeedback>, 3);
  assert.deepEqual(f.clear, []);
  assert.deepEqual(f.vague, []);
  assert.deepEqual(f.check_notes, ["Check that"]);
});

test("tally keeps the best status per key point across rounds", () => {
  const rounds = [
    { explanation: "a", feedback: fb({ clear: [0], vague: [{ point: 1, note: "what is acetyl-CoA?" }] }) },
    { explanation: "b", feedback: fb({ clear: [1] }) },
    { explanation: "c", feedback: fb({ vague: [{ point: 0, note: "later fuzzier" }] }) },
  ];
  assert.deepEqual(tally(krebs, rounds), ["clear", "clear", "missing"]);
  assert.equal(clearCount(tally(krebs, rounds)), 2);
});

test("a session ends when everything is clear or the rounds run out", () => {
  assert.equal(finished(["clear", "clear", "clear"], 1), true);
  assert.equal(finished(["clear", "vague", "missing"], 1), false);
  assert.equal(finished(["clear", "vague", "missing"], MAX_ROUNDS), true);
});

test("spoken feedback asks the follow-up mid-session and wraps up at the end", () => {
  const f = fb({ clear: [0], hint: "Think about what happens to the carbon.", follow_up: "So where does the CO2 come from?", encouragement: "Nice job placing it in the cell." });
  const mid = spoken(f, ["clear", "missing", "missing"], 1);
  assert.match(mid, /^Nice job/);
  assert.match(mid, /carbon/);
  assert.match(mid, /\?$/);
  assert.match(spoken(f, ["clear", "clear", "clear"], 2), /every key idea/);
  assert.match(spoken(f, ["clear", "missing", "missing"], MAX_ROUNDS), /Study page/);
});

test("weakPoints lists what didn't land, fuzzy ideas first", () => {
  assert.deepEqual(weakPoints(krebs, ["clear", "missing", "vague"]), [
    { text: krebs.key_points[2], status: "vague" },
    { text: krebs.key_points[1], status: "missing" },
  ]);
  assert.deepEqual(weakPoints(krebs, ["clear", "clear", "clear"]), []);
});

// ---- starting from a sentence ----

const bio: TeachCourse = { slug: "bio-181", code: "BIO 181", name: "Introductory Biology", exam: { title: "Midterm", date: "2026-10-10T10:00" }, daysToExam: 4 };
const stats: TeachCourse = { slug: "st-311", code: "ST 311", name: "Introduction to Statistics", exam: { title: "Midterm", date: "2026-10-14T13:30" }, daysToExam: 8 };
const docs: TeachDoc[] = [
  { id: "bio-l12", course: "BIO 181", title: "Lecture 12: Cellular respiration", summary: "Glycolysis, the citric acid cycle and oxidative phosphorylation.", body: "Stage 1: Glycolysis. Location: cytosol. Net yield: 2 ATP and 2 NADH." },
  { id: "bio-l15", course: "BIO 181", title: "Lecture 15: Photosynthesis", summary: "Light reactions and the Calvin cycle.", body: "Rubisco fixes CO2 in the stroma." },
  { id: "bio-mid", course: "BIO 181", title: "Midterm study guide (chapters 1–7)", summary: "What the midterm covers.", body: "Chapter 6: glycolysis, the citric acid cycle and oxidative phosphorylation; fermentation." },
  { id: "st-l7", course: "ST 311", title: "Lecture 7: The central limit theorem", summary: "Sampling distributions of the mean.", body: "The CLT says sample means are approximately normal." },
];

test("findCourse reads codes in any spacing and unique name words", () => {
  assert.equal(findCourse("teach you glycolysis for bio181", [bio, stats])?.code, "BIO 181");
  assert.equal(findCourse("my biology midterm", [bio, stats])?.code, "BIO 181");
  assert.equal(findCourse("photosynthesis please", [bio, stats]), undefined);
});

test("findDoc prefers the lecture over the study guide that also mentions the topic", () => {
  assert.equal(findDoc("I'm struggling with glycolysis", docs)?.id, "bio-l12");
  assert.equal(findDoc("the Calvin cycle", docs)?.id, "bio-l15");
  assert.equal(findDoc("organic chemistry mechanisms", docs), undefined);
});

test("matchRequest finds course and file without Gemini", () => {
  assert.deepEqual(matchRequest("let me teach you the central limit theorem for ST 311", [bio, stats], docs), { course: "ST 311", doc: "st-l7", topic: "" });
});

test("onStudyGuide only claims a topic is on the exam when the guide lists it", () => {
  const others = docs.filter((d) => d.id !== "bio-l12");
  assert.equal(onStudyGuide("glycolysis", others), "Midterm study guide (chapters 1–7)");
  assert.equal(onStudyGuide("Krebs cycle", others), ""); // the guide says "citric acid cycle"
});

test("matchConcept and mergeConcepts", () => {
  const cs = [
    { topic: "Glycolysis", key_points: ["Happens in the cytosol"], source_ref: "" },
    { topic: "Citric acid cycle", key_points: ["Also called the Krebs cycle"], source_ref: "" },
  ];
  assert.equal(matchConcept(cs, "glycolysis"), 0);
  assert.equal(matchConcept(cs, "the krebs cycle"), 1);
  assert.equal(matchConcept(cs, "photosynthesis"), -1);
  assert.deepEqual(mergeConcepts([{ ...cs[1], key_points: ["new"] }], cs).map((c) => c.topic), ["Citric acid cycle", "Glycolysis"]);
});

test("teachIntro names the exam, the guide evidence and the file, then asks", () => {
  const line = teachIntro({ course: bio, concept: "Glycolysis", topic: "glycolysis", doc: "Lecture 12: Cellular respiration", guide: "Midterm study guide (chapters 1–7)" });
  assert.match(line, /^Your BIO 181 midterm is on Saturday, 4 days out, and glycolysis is on your midterm study guide\./);
  assert.match(line, /"Lecture 12: Cellular respiration"/);
  assert.match(line, /explain it to me like I've never heard of it\.$/);
  // no exam talk when it's far off
  assert.doesNotMatch(teachIntro({ course: { ...bio, daysToExam: 40 }, concept: "Glycolysis" }), /midterm/);
});
