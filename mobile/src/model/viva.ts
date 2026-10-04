// Port of src/lib/viva.ts — the fallback brain. On mobile this is the only brain until the
// /api/coach route is wired up; same canned replies, same voice.
import { goalText, meta, sentence } from "./features";

export const VIVA = {
  name: "Viva",
  role: "your study coach",
  greeting: (name?: string) =>
    `Hey${name ? ` ${name}` : ""}, I'm Viva! I can explain why a class has its status, plan your week, or quiz you. What's on your mind?`,
  suggestions: ["What should I focus on this week?", "Why is my class worth a check-in?", "Plan my week", "Let me teach you a topic"],
};

export type Action = { label: string; route: string };
export type ChatMessage = { role: "you" | "viva"; text: string; actions?: Action[] };
export type Reply = { text: string; actions: Action[] };

// Causal-language filter: the model finds patterns, so Viva never promises outcomes.
export function soften(text: string) {
  return text
    .replace(/\bwill (make you|help you) pass\b/gi, "is linked to better outcomes")
    .replace(/\bguarantee(s|d)?\b/gi, "make more likely")
    .replace(/\bcauses?\b/gi, "is linked to")
    .replace(/\byou(?:'re| are) failing\b/gi, "this class is worth a check-in");
}

type Course = {
  slug: string;
  code: string;
  exam: { title: string };
  daysToExam: number;
  result: { atRisk: boolean; n: number };
  steps: { feature: string; value: number }[];
  rec: { moves: { feature: string; from: number; to: number }[] } | null;
};

const facts = (c: Course) => sentence(c.steps.map((s) => meta(s.feature).fact(s.value)));
const pathLink = (c: Course): Action => ({ label: `See ${c.code} path`, route: `/insights?course=${c.slug}` });
const quizLink = (c: Course): Action => ({ label: "Take a 5-min quiz", route: `/plan?course=${c.slug}` });

export function vivaReply(input: string, ctx: { name?: string; courses: Course[] }): Reply {
  const q = input.toLowerCase();
  const { courses } = ctx;
  const flagged = courses.filter((c) => c.result.atRisk).sort((a, b) => a.daysToExam - b.daysToExam);
  const named = courses.find((c) => q.includes(c.code.toLowerCase()) || q.includes(c.code.toLowerCase().replace(" ", "")));
  const top = named ?? flagged[0] ?? [...courses].sort((a, b) => a.daysToExam - b.daysToExam)[0];
  const out = (text: string, actions: Action[] = []): Reply => ({ text: soften(text), actions });

  if (!top) return out("Add a course on Home first, then I can tell you how it's going and what would help.");

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

  if (/\b(teach (you|viva)|let me teach|explain (a|this) (topic|concept))\b/.test(q))
    return out("Love that: teaching it is the best test of knowing it. Voice mode is coming to mobile soon — for now, tell me the topic and the class here in chat.");

  if (/\b(quiz|test me|flashcard|practice)\b/.test(q))
    return out(
      `Quiz time! A 5-minute ${top.code} quiz counts toward your standing the moment you finish it. Want me to put it on your plan?`,
      [quizLink(top)],
    );

  if (/\b(plan|schedule|calendar|week)\b/.test(q) && !/focus/.test(q))
    return out(
      top.rec
        ? `Let's put it on the calendar. For ${top.code}, the smallest change is ${goalText(top.rec.moves[0])}. It's already drafted on your Plan tab.`
        : `Everything's on track, so let's protect it: one review block for ${top.code} before its ${top.exam.title.toLowerCase()} in ${top.daysToExam} days.`,
      [{ label: "Open Plan", route: "/plan" }],
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
  messages: ChatMessage[];
};

export const sampleChatSessions: ChatSession[] = [
  {
    id: "session-maya-bio-checkin",
    title: "Why is BIO 181 worth a check-in?",
    createdAt: "2026-10-05T14:15:00",
    updatedAt: "2026-10-05T14:18:00",
    messages: [
      { role: "you", text: "Why is BIO 181 worth a check-in?" },
      {
        role: "viva",
        text: "BIO 181 is worth a check-in because you start exam prep about 1.0 day out and you attend 73% of classes. That's what similar students had in common, so I could be wrong about you. Want to see the full path?",
        actions: [{ label: "See BIO 181 path", route: "/insights?course=bio-181" }],
      },
      { role: "you", text: "What's the best way to get back on track?" },
      {
        role: "viva",
        text: "The biggest levers are starting exam prep earlier and getting attendance up. Logging one 5-minute quiz today shifts your projected standing. Want me to plan that?",
        actions: [
          { label: "Open Plan", route: "/plan" },
          { label: "See BIO 181 path", route: "/insights?course=bio-181" },
        ],
      },
    ],
  },
  {
    id: "session-maya-weekly-plan",
    title: "Weekly study schedule & focus",
    createdAt: "2026-10-03T10:00:00",
    updatedAt: "2026-10-03T10:05:00",
    messages: [
      { role: "you", text: "What should I focus on this week?" },
      {
        role: "viva",
        text: "I'd start with BIO 181: you start exam prep about 1.0 day out, and your Midterm is Friday. Students with a similar pattern often get back on track with earlier prep. Want me to plan that?",
        actions: [{ label: "See BIO 181 path", route: "/insights?course=bio-181" }],
      },
      { role: "you", text: "Plan my week" },
      {
        role: "viva",
        text: "Done — check your Plan tab. I added study blocks before your BIO 181 Midterm.",
        actions: [{ label: "Open Plan", route: "/plan" }],
      },
    ],
  },
];
