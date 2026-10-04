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

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: { role: "you" | "viva"; text: string; actions?: Action[] }[];
};

export function sampleChatSessions(profileId: string = "maya"): ChatSession[] {
  if (profileId === "maya") {
    return [
      {
        id: "session-maya-bio-checkin",
        title: "Why is BIO 181 worth a check-in?",
        createdAt: "2026-10-05T14:15:00.000Z",
        updatedAt: "2026-10-05T14:18:20.000Z",
        messages: [
          { role: "you", text: "Why is BIO 181 worth a check-in?" },
          {
            role: "viva",
            text: "BIO 181 is worth a check-in because attendance is under 72% and exam prep starts 2 days out. That's what 84 similar students had in common, so I could be wrong about you. Want to see the full path?",
            actions: [{ label: "See BIO 181 path", href: "/insights?course=bio-181" }],
          },
          { role: "you", text: "What's the best way to get back on track?" },
          {
            role: "viva",
            text: "The biggest lever is bumping practice quizzes to 3 and starting review 5 days out. Logging one 5-minute quiz today shifts your projected standing. Want me to plan that?",
            actions: [
              { label: "Open the plan", href: "/insights?course=bio-181" },
              { label: "Take a 5-min quiz", href: "/study?tool=quiz&course=bio-181" },
            ],
          },
        ],
      },
      {
        id: "session-maya-weekly-plan",
        title: "Weekly study schedule & focus",
        createdAt: "2026-10-03T10:00:00.000Z",
        updatedAt: "2026-10-03T10:05:40.000Z",
        messages: [
          { role: "you", text: "What should I focus on this week?" },
          {
            role: "viva",
            text: "I'd start with BIO 181: attendance is under 72% and your Midterm 1 is in 13 days. Students with a similar pattern often get back on track with 3 practice quizzes. Want me to plan that?",
            actions: [{ label: "See BIO 181 path", href: "/insights?course=bio-181" }],
          },
          { role: "you", text: "Plan my week" },
          {
            role: "viva",
            text: "Let's put it on the calendar. For BIO 181, the smallest change is taking 3 practice quizzes. Press Make it real and I'll add up to 3 study blocks before your Midterm 1.",
            actions: [{ label: "Open the plan", href: "/insights?course=bio-181" }],
          },
        ],
      },
    ];
  }

  if (profileId === "jordan") {
    return [
      {
        id: "session-jordan-ece",
        title: "ECE 200 lab & problem set strategy",
        createdAt: "2026-10-04T16:00:00.000Z",
        updatedAt: "2026-10-04T16:04:10.000Z",
        messages: [
          { role: "you", text: "How am I doing in ECE 200?" },
          {
            role: "viva",
            text: "ECE 200 is worth a check-in: late-night study is at 41% and your problem set 5 is due Wednesday. Shifting prep 2 days earlier is linked to much lower exam stress. Want to see the full path?",
            actions: [{ label: "See ECE 200 path", href: "/insights?course=ece-200" }],
          },
        ],
      },
    ];
  }

  if (profileId === "priya") {
    return [
      {
        id: "session-priya-chem",
        title: "CH 101 Exam 1 review plan",
        createdAt: "2026-10-04T09:30:00.000Z",
        updatedAt: "2026-10-04T09:33:00.000Z",
        messages: [
          { role: "you", text: "What should I focus on for CH 101?" },
          {
            role: "viva",
            text: "You have a 9-day streak going! CH 101 Exam 1 is on Wednesday morning. Review Chapter 4 flashcards today to lock in your standing.",
            actions: [{ label: "Review Flashcards", href: "/study?tool=flashcards&course=ch-101" }],
          },
        ],
      },
    ];
  }

  return [
    {
      id: "session-judge-intro",
      title: "How Pathway & Viva work together",
      createdAt: "2026-10-05T08:00:00.000Z",
      updatedAt: "2026-10-05T08:02:15.000Z",
      messages: [
        { role: "you", text: "How does the model calculate my standing?" },
        {
          role: "viva",
          text: "The decision tree evaluates your study numbers directly on your device. Every status comes with its exact branch path and the cheapest actionable change to stay on track.",
          actions: [{ label: "Check Insights", href: "/insights" }],
        },
      ],
    },
  ];
}
