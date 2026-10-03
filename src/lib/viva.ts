// Viva: Pathway's study coach, one character across chat and voice.
//
// Character: a warm, plain-spoken TA who has read your syllabus and is on your side.
// - Short: at most three sentences, then one question back.
// - Grounded: only talks about the student's own numbers and the model, and cites them.
// - Celebrates effort, never outcomes; never says "failing"; never suggests working less.
// - Honest about limits: patterns, not verdicts; "I could be wrong".
// - Loves turning advice into a time on the calendar.
//
// This file is the fallback brain. Chat and voice both answer through POST /api/coach (Gemini)
// via the shared coachTurn() in src/lib/store.tsx; vivaReply() runs only when that route is
// unreachable, so one canned reply beats silence. soften() still applies to whatever comes back.
import { goalText, meta, sentence } from "./features.ts";

export const VIVA = {
  name: "Viva",
  role: "your study coach",
  greeting: (name?: string) =>
    `Hey${name ? ` ${name}` : ""}, I'm Viva! I can explain why a class has its status, plan your week, or quiz you. What's on your mind?`,
  suggestions: ["What should I focus on this week?", "Why is my class worth a check-in?", "Plan my week", "Quiz me"],
};

export type Action = { label: string; href: string };
export type Reply = { text: string; actions: Action[] };

type Course = {
  slug: string;
  code: string;
  exam: { title: string };
  daysToExam: number;
  result: { atRisk: boolean; n: number };
  steps: { feature: string; value: number }[];
  rec: { moves: { feature: string; from: number; to: number }[] } | null;
};

// Causal-language filter: the model finds patterns, so Viva never promises outcomes.
export function soften(text: string) {
  return text
    .replace(/\bwill (make you|help you) pass\b/gi, "is linked to better outcomes")
    .replace(/\bguarantee(s|d)?\b/gi, "make more likely")
    .replace(/\bcauses?\b/gi, "is linked to")
    .replace(/\byou(?:'re| are) failing\b/gi, "this class is worth a check-in");
}

const facts = (c: Course) => sentence(c.steps.map((s) => meta(s.feature).fact(s.value)));
const pathLink = (c: Course): Action => ({ label: `See ${c.code} path`, href: `/insights?course=${c.slug}` });
const quizLink = (c: Course): Action => ({ label: "Take a 5-min quiz", href: `/study?tool=quiz&course=${c.slug}` });

export function vivaReply(input: string, ctx: { name?: string; courses: Course[] }): Reply {
  const q = input.toLowerCase();
  const { courses } = ctx;
  const flagged = courses.filter((c) => c.result.atRisk).sort((a, b) => a.daysToExam - b.daysToExam);
  const named = courses.find((c) => q.includes(c.code.toLowerCase()) || q.includes(c.code.toLowerCase().replace(" ", "")));
  const top = named ?? flagged[0] ?? [...courses].sort((a, b) => a.daysToExam - b.daysToExam)[0];
  const out = (text: string, actions: Action[] = []): Reply => ({ text: soften(text), actions });

  if (!top) return out("Add a course on Home first, then I can tell you how it's going and what would help.", [{ label: "Go to Home", href: "/" }]);

  if (/^(hi|hey|hello|yo)\b/.test(q)) return out(VIVA.greeting(ctx.name));

  if (/\bfail/.test(q))
    return out(
      `You're not failing. ${top.code} is ${top.result.atRisk ? "worth a check-in" : "on track"}, and that's a pattern from ${top.result.n} similar students, not a verdict about you. Want to see what would help?`,
      [pathLink(top)],
    );

  if (/\b(work|job|shift|hours)\b/.test(q))
    return out(
      `Your work hours are context. I'll never suggest cutting them. ${top.rec ? `The bigger lever for ${top.code} is ${goalText(top.rec.moves[0])}.` : "Your study habits are doing the heavy lifting right now."}`,
      [pathLink(top)],
    );

  if (/\b(quiz|test me|flashcard|practice)\b/.test(q))
    return out(
      `Quiz time! I'll pull questions from your ${top.code} slides once I'm hooked up to Gemini. For now, log a practice quiz in Study and watch your status update.`,
      [quizLink(top)],
    );

  if (/\b(plan|schedule|calendar|week)\b/.test(q) && !/focus/.test(q))
    return out(
      top.rec
        ? `Let's put it on the calendar. For ${top.code}, the smallest change is ${goalText(top.rec.moves[0])}. Press Make it real and I'll add up to 3 study blocks before your ${top.exam.title.toLowerCase()}.`
        : `Everything's on track, so let's protect it: one review block for ${top.code} before its ${top.exam.title.toLowerCase()} in ${top.daysToExam} days. Want me to set it up?`,
      [{ label: "Open the plan", href: `/insights?course=${top.slug}` }],
    );

  if (/\b(why|status|check-?in|standing|how am i)\b/.test(q) || named)
    return out(
      `${top.code} is ${top.result.atRisk ? "worth a check-in" : "on track"} because ${facts(top)}. That's what ${top.result.n} similar students had in common, so I could be wrong about you. Want to see the full path?`,
      [pathLink(top)],
    );

  if (/\b(focus|priority|first|should i)\b/.test(q))
    return flagged.length
      ? out(
          `I'd start with ${top.code}: ${facts(top)}, and your ${top.exam.title.toLowerCase()} is in ${top.daysToExam} days. ${top.rec ? `Students with a similar pattern often get back on track with ${goalText(top.rec.moves[0])}.` : ""} Want me to plan that?`,
          [pathLink(top), quizLink(top)],
        )
      : out(`Everything's on track. Nice work! Your next exam is ${top.code} in ${top.daysToExam} days, so a quick review keeps the streak going.`, [quizLink(top)]);

  return out(
    "I only see your study numbers and the model, so I might be missing context. Try asking what to focus on, why a class has its status, or to plan your week.",
  );
}
