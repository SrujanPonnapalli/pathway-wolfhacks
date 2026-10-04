// Viva as an agent. One Gemini call per turn returns what to SAY and what to DO. The browser
// executes the actions against its own state (calendar, suggestions, study log, navigation),
// so the server never holds student data and there is no multi-round tool loop to pay for.
//
// Pipeline (no extra calls, no context growth):
//   1. route()      picks a specialist from the message: coach / writer / scheduler / tutor.
//                   Each has its own system addendum and output budget. Zero tokens.
//   2. one call     fast model, structured JSON, the same compact context Viva always gets
//                   (numbers the tree uses, week with ids, suggestions with ids, files, mail,
//                   the student's notes), plus the last few turns.
//   3. remember[]   durable facts the student stated this turn come back as short notes; the
//                   client keeps a dozen and sends them next time, so history can stay short.

import { ThinkingLevel, Type, type Content, type Schema } from "@google/genai";
import { generate, textPart } from "../gemini";
import { renderContext, type CoachContext } from "./coach";
import { logTurn } from "../knowledge/db";

export type AgentAction = {
  type:
    | "add_event" // title, start, end, course?, kind
    | "move_event" // id, start, end
    | "remove_event" // id
    | "approve_suggestion" // id
    | "dismiss_suggestion" // id
    | "make_it_real" // course: apply the recourse plan as study blocks
    | "complete_block" // id
    | "log_quiz" // course
    | "log_session" // course
    | "check_in" // course
    | "set_midterm" // course, score
    | "draft_email" // email_to, email_subject, email_body (shown to the student; never sent)
    | "navigate" // path
    | "link"; // label, path (a chip, no navigation)
  id?: string;
  title?: string;
  start?: string;
  end?: string;
  course?: string;
  kind?: string;
  score?: number;
  path?: string;
  label?: string;
  email_to?: string;
  email_subject?: string;
  email_body?: string;
};

export type AgentContext = CoachContext & {
  page: string; // where the student is right now
  channel: "chat" | "voice";
  profileId?: string;
  knowledge?: string; // the compiled, citable context pack (src/lib/knowledge/compile.ts)
  notes: string[]; // durable facts from earlier turns
  weekIds: { id: string; title: string; start: string }[]; // ids the student can move/remove
  suggestionIds: { id: string; title: string }[];
  files: { course: string; title: string; kind: string }[];
  recourse: { course: string; plan: string }[]; // what "make it real" would add, per flagged course
};

export type AgentReply = { say: string; actions: AgentAction[]; remember: string[]; used: string[]; specialist: string; ms: number; usage: { input: number; output: number } };

const schema: Schema = {
  type: Type.OBJECT,
  required: ["say", "actions", "remember", "used"],
  propertyOrdering: ["say", "actions", "remember", "used"],
  properties: {
    say: { type: Type.STRING, description: "What Viva says to the student. Plain text, no markdown." },
    actions: {
      type: Type.ARRAY,
      description: "Things to do in the app, in order. Empty when the student only asked a question.",
      items: {
        type: Type.OBJECT,
        required: ["type"],
        propertyOrdering: ["type", "id", "title", "start", "end", "course", "kind", "score", "path", "label", "email_to", "email_subject", "email_body"],
        properties: {
          type: { type: Type.STRING, enum: ["add_event", "move_event", "remove_event", "approve_suggestion", "dismiss_suggestion", "make_it_real", "complete_block", "log_quiz", "log_session", "check_in", "set_midterm", "draft_email", "navigate", "link"] },
          id: { type: Type.STRING, description: "move_event/remove_event/complete_block: the week event id; approve/dismiss_suggestion: the suggestion id. Copy exactly from CONTEXT." },
          title: { type: Type.STRING, description: "add_event only: short event title like 'BIO 181 review'" },
          start: { type: Type.STRING, description: "add_event/move_event only: start as local ISO, e.g. 2026-10-09T16:00:00" },
          end: { type: Type.STRING, description: "add_event/move_event only: end as local ISO, e.g. 2026-10-09T16:50:00" },
          course: { type: Type.STRING, description: "course slug such as bio-181 (add_event, make_it_real, log_quiz, log_session, check_in, set_midterm)" },
          kind: { type: Type.STRING, enum: ["study", "other"], description: "add_event only" },
          score: { type: Type.NUMBER, description: "set_midterm only: 0 to 100" },
          path: { type: Type.STRING, description: "navigate/link only: an app path like /calendar or /insights?course=bio-181" },
          label: { type: Type.STRING, description: "link only: chip text, 2 to 4 words" },
          email_to: { type: Type.STRING, description: "draft_email only: recipient's name" },
          email_subject: { type: Type.STRING, description: "draft_email only: subject line" },
          email_body: { type: Type.STRING, description: "draft_email only: the complete email body" },
        },
      },
    },
    remember: { type: Type.ARRAY, items: { type: Type.STRING }, description: "0 to 2 durable facts the student just stated about themselves, under 12 words each. Never restate CONTEXT." },
    used: { type: Type.ARRAY, items: { type: Type.STRING }, description: "ids like n1a2b3c4d of the knowledge facts the reply relied on; empty if none" },
  },
};

const SYSTEM = `You are Viva, Pathway's study coach and the student's hands inside the app: a warm, plain-spoken TA on their side.
You can change their week, their study log and their place in the app by returning actions. The app runs the actions
immediately and tells the student what happened, so never say "I can't" for anything in the action list, and never
describe an action instead of doing it. Do only what was asked, nothing extra, and do not ask permission for a clear request.

Rules:
1. Use ONLY the facts in CONTEXT. Every number, date, grade, status, deadline or file you mention must appear there. If it is not there, say so.
2. Statuses are only "on track" or "worth a check-in". Never say failing, at risk, behind, or in trouble.
3. Patterns, never cause and effect: "students with similar patterns often do better when...". Never promise outcomes.
4. Only suggest changing habits marked role=suggest. Never suggest working fewer hours, sleeping differently, or uploading more files.
5. Scheduling: pick times that do not overlap anything in "calendar this week", between 9:00 and 21:00 unless the student names a time, 50-minute study blocks by default. Dates are local ISO. The week list gives each event's id; use ids exactly.
6. Approving or dismissing a pending suggestion uses its id. "Make it real" for a flagged course adds its study plan.
7. Email: when asked to write, reply to, or send mail, return a draft_email with a real, specific body in the student's voice (3 to 6 sentences, no placeholders, sign with their first name if known). The student sends it; say that in one short clause.
8. Course knowledge: facts from the student's syllabi, grade pages, slides and notes are listed per course with ids in brackets.
   Answer deadline, grading, policy, grade and topic questions from them and put every id you relied on in "used".
   Facts marked "waiting for the student to confirm" are not settled: say so instead of stating them.
9. Navigation: if the student asks to see or go somewhere, navigate. Add a link chip when pointing at a page would help.
10. remember: only facts the student states about themselves (preferences, constraints, plans), never your own advice.`;

const CHANNEL = {
  chat: "Reply in at most three short sentences, plain words, no headers or lists. Then one question back at most.",
  voice: "This is spoken aloud: at most two short sentences, no lists, no symbols, numbers as words where natural.",
};

type Specialist = { name: string; addendum: string; maxTokens: number; temperature: number };

/** Zero-token router: the message picks the specialist, each with its own prompt addendum and budget. */
export function route(message: string): Specialist {
  const m = message.toLowerCase();
  if (/\b(email|e-mail|mail|write to|reply|respond|message (my|the|dr|prof)|note to|letter|extension|professor|advisor|ta\b)/.test(m))
    return { name: "writer", addendum: "WRITER: produce the email now as a draft_email action with a complete body. Keep the spoken reply to one sentence.", maxTokens: 900, temperature: 0.4 };
  if (/\b(add|move|reschedul|schedule|put|block|calendar|remove|delete|cancel|shift|free|slot|plan my|approve|not now|dismiss|make it real)\b/.test(m))
    return { name: "scheduler", addendum: "SCHEDULER: compute concrete times from the week in CONTEXT, avoid overlaps, and return the calendar actions. Say what you did and when, briefly.", maxTokens: 700, temperature: 0.2 };
  if (/\b(quiz|explain|what is|what's|define|teach|study for|review|flashcard|slides|notes|chapter|concept)\b/.test(m))
    return { name: "tutor", addendum: "TUTOR: teach from the student's files and syllabus facts in CONTEXT when they cover it; otherwise say what you have. Offer a quiz link when relevant.", maxTokens: 500, temperature: 0.4 };
  return { name: "coach", addendum: "", maxTokens: 400, temperature: 0.3 };
}

export function renderAgentContext(ctx: AgentContext): string {
  // The week is rendered once, below, with ids (the coach's own week line would repeat it).
  const L: string[] = [renderContext({ ...ctx, week: [] })];
  // Weekday names for the next ten days, so "Friday" never lands on a Saturday.
  const base = new Date(ctx.now);
  const days = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const name = d.toLocaleDateString("en-US", { weekday: "short" });
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return `${name}=${ymd}${i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : ""}`;
  });
  L.push(`dates: ${days.join(", ")}`);
  L.push(`page now: ${ctx.page}`);
  if (ctx.notes.length) L.push(`student notes (from earlier turns): ${ctx.notes.join("; ")}`);
  if (ctx.knowledge) L.push(ctx.knowledge);
  else if (ctx.files.length) L.push(`files by course: ${ctx.files.map((f) => `${f.course}: ${f.title} [${f.kind}]`).join("; ")}`);
  else L.push("course knowledge: nothing on file yet");
  if (ctx.weekIds.length) {
    const ends = new Map((ctx.week ?? []).map((e) => [`${e.title}|${e.start}`, `${e.end.slice(11, 16)} [${e.kind}]`]));
    L.push(`calendar this week (id=title start-end [kind]): ${ctx.weekIds.map((e) => `${e.id}=${e.title} ${e.start.slice(5, 16).replace("T", " ")}-${ends.get(`${e.title}|${e.start}`) ?? ""}`).join("; ")}`);
  }
  if (ctx.suggestionIds.length) L.push(`pending suggestion ids: ${ctx.suggestionIds.map((x) => `${x.id}=${x.title}`).join("; ")}`);
  if (ctx.recourse.length) L.push(`make-it-real plans: ${ctx.recourse.map((r) => `${r.course}: ${r.plan}`).join(" | ")}`);
  return L.join("\n");
}

const ok = (iso?: string) => !!iso && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso);

export async function agentTurn(message: string, ctx: AgentContext, history: { role: "you" | "viva" | "coach"; text: string }[] = []): Promise<AgentReply> {
  const t0 = Date.now();
  const sp = route(message);
  const hist: Content[] = history.slice(-6).map((h) => ({ role: h.role === "you" ? "user" : "model", parts: [{ text: h.text }] }));
  const contents: Content[] = [
    { role: "user", parts: [textPart(`CONTEXT\n${renderAgentContext(ctx)}\nEND CONTEXT`)] },
    { role: "model", parts: [textPart("Got it. I will answer from CONTEXT only and act through actions.")] },
    ...hist,
    { role: "user", parts: [textPart(message)] },
  ];
  const res = await generate(
    {
      contents,
      config: {
        systemInstruction: `${SYSTEM}\n${CHANNEL[ctx.channel]}\n${sp.addendum}`.trim(),
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: sp.temperature,
        maxOutputTokens: sp.maxTokens,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    },
    "fast",
  );
  let parsed: { say?: string; actions?: AgentAction[]; remember?: string[]; used?: string[] } = {};
  try {
    parsed = JSON.parse(res.text ?? "{}");
  } catch {
    parsed = { say: (res.text ?? "").trim() };
  }
  const raw = parsed.actions ?? [];
  if (process.env.NODE_ENV !== "production") console.info("[agent] raw actions:", JSON.stringify(raw).slice(0, 600));
  const actions = raw.filter((a) => {
    if (!a || typeof a.type !== "string") return false;
    if (a.type === "add_event") return !!a.title && ok(a.start) && ok(a.end);
    if (a.type === "move_event") return !!a.id && ok(a.start) && ok(a.end);
    if (a.type === "remove_event" || a.type === "approve_suggestion" || a.type === "dismiss_suggestion" || a.type === "complete_block") return !!a.id;
    if (a.type === "make_it_real" || a.type === "log_quiz" || a.type === "log_session" || a.type === "check_in") return !!a.course;
    if (a.type === "set_midterm") return !!a.course && typeof a.score === "number";
    if (a.type === "draft_email") return !!a.email_body;
    if (a.type === "navigate") return !!a.path && a.path.startsWith("/");
    if (a.type === "link") return !!a.path && a.path.startsWith("/");
    return false;
  });
  const u = res.usageMetadata;
  const reply: AgentReply = {
    say: (parsed.say ?? "").trim(),
    actions: actions.slice(0, 6),
    remember: (parsed.remember ?? []).filter((x) => typeof x === "string" && x.trim()).slice(0, 2),
    used: (parsed.used ?? []).filter((x) => typeof x === "string" && /^n[0-9a-f]{8}$/.test(x)).slice(0, 8),
    specialist: sp.name,
    ms: Date.now() - t0,
    usage: { input: u?.promptTokenCount ?? 0, output: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0) },
  };
  // Observability: every turn is logged (Tiger when configured) so Viva's view can show what she was given and used.
  logTurn({ at: new Date().toISOString(), profile: ctx.profileId ?? "unknown", specialist: reply.specialist, ms: reply.ms, tokensIn: reply.usage.input, tokensOut: reply.usage.output, used: reply.used, question: message }).catch(() => {});
  return reply;
}
