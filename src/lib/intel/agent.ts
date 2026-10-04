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
    | "add_event" // title, start, end, course?, kind, repeat?, until?
    | "move_event" // id, start, end
    | "resize_event" // id, end (same start, new length)
    | "rename_event" // id, title (blocks Pathway made)
    | "remove_event" // id
    | "clear_range" // start, end, kind? ("study" = Pathway blocks only, "all" = everything but classes, exams and work)
    | "approve_suggestion" // id
    | "dismiss_suggestion" // id
    | "approve_all" // every pending suggestion
    | "make_it_real" // course: apply the recourse plan as study blocks
    | "complete_block" // id
    | "log_quiz" // course
    | "log_session" // course
    | "check_in" // course
    | "set_midterm" // course, score
    | "start_quiz" // course, title (a lecture file), tool? ("quiz" | "flashcards"): opens Study on that file
    | "start_timer" // course: starts the 25-minute focus timer (shared across the student's devices)
    | "start_teach" // course, title (the topic): opens Teach mode, where the student explains it and Viva checks
    | "draft_email" // email_to, email_subject, email_body (shown to the student; never sent)
    | "health_call" // call: rest | winddown | cardio, one of today's Google Fit calls (src/lib/health.ts)
    | "navigate" // path
    | "link"; // label, path (a chip, no navigation)
  id?: string;
  title?: string;
  start?: string;
  end?: string;
  course?: string;
  kind?: string;
  repeat?: string;
  until?: string;
  tool?: string;
  score?: number;
  path?: string;
  label?: string;
  email_to?: string;
  email_subject?: string;
  email_body?: string;
  call?: string; // health_call: rest (today's gym block becomes a rest-day walk), winddown (tonight), cardio (a walk tomorrow morning)
  asked?: boolean; // the student explicitly asked for this exact action in this message (tools then run without asking)
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
  excerpts?: { course: string; title: string; text: string }[]; // the lecture files this message is about, picked by word overlap (no model call)
  health?: string; // the Google Fit line (src/lib/health.ts): last night, the week's average, readiness, today's calls
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
        propertyOrdering: ["type", "asked", "id", "title", "start", "end", "course", "kind", "repeat", "until", "tool", "score", "path", "label", "email_to", "email_subject", "email_body", "call"],
        properties: {
          type: { type: Type.STRING, enum: ["add_event", "move_event", "resize_event", "rename_event", "remove_event", "clear_range", "approve_suggestion", "dismiss_suggestion", "approve_all", "make_it_real", "complete_block", "log_quiz", "log_session", "check_in", "set_midterm", "start_quiz", "start_timer", "start_teach", "draft_email", "health_call", "navigate", "link"] },
          asked: { type: Type.BOOLEAN, description: "true only if the student explicitly asked for this exact action in this message; false when you are offering it" },
          id: { type: Type.STRING, description: "move_event/resize_event/rename_event/remove_event/complete_block: the calendar event id; approve/dismiss_suggestion: the suggestion id. Copy exactly from CONTEXT." },
          title: { type: Type.STRING, description: "add_event: short event title like 'BIO 181 review'; rename_event: the new title; start_quiz: the lecture file's title from CONTEXT; start_teach: the topic, e.g. 'glycolysis'" },
          start: { type: Type.STRING, description: "add_event/move_event/clear_range: start as local ISO, e.g. 2026-10-09T16:00:00" },
          end: { type: Type.STRING, description: "add_event/move_event/resize_event/clear_range: end as local ISO, e.g. 2026-10-09T16:50:00" },
          course: { type: Type.STRING, description: "course slug such as bio-181. Always set it on add_event when the block is for a class (blocks without a course can't be saved), and on make_it_real, log_quiz, log_session, check_in, set_midterm, start_quiz, start_timer, start_teach)" },
          kind: { type: Type.STRING, enum: ["study", "other", "all"], description: "add_event: study or other. clear_range: study (Pathway's blocks only) or all (everything except classes, exams and work)" },
          repeat: { type: Type.STRING, enum: ["none", "daily", "weekdays", "weekly"], description: "add_event only: repeat the block until `until` (at most 10 copies)" },
          until: { type: Type.STRING, description: "add_event with repeat: last date, YYYY-MM-DD" },
          tool: { type: Type.STRING, enum: ["quiz", "flashcards"], description: "start_quiz only; default quiz" },
          score: { type: Type.NUMBER, description: "set_midterm only: 0 to 100" },
          path: { type: Type.STRING, description: "navigate/link only: an app path like /calendar or /insights?course=bio-181" },
          label: { type: Type.STRING, description: "link only: chip text, 2 to 4 words" },
          email_to: { type: Type.STRING, description: "draft_email only: recipient's name" },
          email_subject: { type: Type.STRING, description: "draft_email only: subject line" },
          email_body: { type: Type.STRING, description: "draft_email only: the complete email body" },
          call: { type: Type.STRING, enum: ["rest", "winddown", "cardio"], description: "health_call only: which of today's Google Fit calls from CONTEXT to put on the week" },
        },
      },
    },
    remember: { type: Type.ARRAY, items: { type: Type.STRING }, description: "0 to 2 durable facts the student just stated about themselves, under 12 words each. Never restate CONTEXT." },
    used: { type: Type.ARRAY, items: { type: Type.STRING }, description: "ids like n1a2b3c4d of the knowledge facts the reply relied on; empty if none" },
  },
};

const SYSTEM = `You are Viva, Pathway's study coach and the student's hands inside the app: a warm, plain-spoken TA on their side.
You can change their week, their study log and their place in the app by returning actions, so never say "I can't" for
anything in the action list. Do only what was asked, nothing extra.
Calendar changes are always proposals: the app shows the student exactly what will change and runs it only when they
approve (a button, or saying yes). So in say, describe calendar changes as a proposal ("I'd add a BIO 181 block Wednesday
at 3 PM. Want me to?"), never as done, and ALWAYS return the calendar actions in that same reply: the app holds them
until the student approves, so never wait for a yes before returning them. Other actions the student asked for run right away.

Rules:
1. Use ONLY the facts in CONTEXT. Every number, date, grade, status, deadline or file you mention must appear there. If it is not there, say so.
2. Statuses are only "on track" or "worth a check-in". Never say failing, at risk, behind, or in trouble.
3. Patterns, never cause and effect: "students with similar patterns often do better when...". Never promise outcomes.
4. Only suggest changing habits marked role=suggest. Never suggest working fewer hours, sleeping differently, or uploading more files.
5. Scheduling: you have full control of the calendar. Add, move, resize, rename, remove, clear a range, repeat a block (daily, weekdays, weekly until a date). Pick times that do not overlap anything in "calendar" unless the student names a time; the app moves a block to the next free slot if the time is taken and says so. Defaults: 50-minute study blocks; morning = 9:00, afternoon = 14:00, evening = 18:00, tonight = 19:00, "after class" = right after that class ends. Dates are local ISO; use the "dates" line for weekday names. Use event ids exactly as listed; to act on several events, return one action per event.
5b. Study tools: start_timer (course) starts a 25-minute focus timer; start_quiz (course, title, tool quiz or flashcards)
   opens a quiz or a flashcard deck from a lecture file; start_teach (course, title = the topic) opens Teach, where the
   student explains the topic in their own words and Viva checks it (the Feynman method). If the student asks for one,
   return it with asked=true and it starts now. Offer one when it clearly fits, with asked=false (the app asks the student
   first, so phrase it as a question): a timer when they say they're about to study; flashcards or a quiz when an exam is
   close or they ask how to prepare; Teach when they say they get a topic or want to check they do. At most one offer per reply.
6. Approving or dismissing a pending suggestion uses its id; "approve them all" is approve_all. "Make it real" for a flagged course adds its study plan.
7. Email: when asked to write, reply to, or send mail, return a draft_email with a real, specific body in the student's voice (3 to 6 sentences, no placeholders, sign with their first name if known). The student sends it; say that in one short clause.
8. Course knowledge: facts from the student's syllabi, grade pages, slides and notes are listed per course with ids in brackets.
   Answer deadline, grading, policy, grade and topic questions from them and put every id you relied on in "used".
   Facts marked "waiting for the student to confirm" are not settled: say so instead of stating them.
   When a "file excerpt" is in CONTEXT, teach and quiz from that text (it is the student's own lecture file) and name the file.
   To quiz the student on a file, use start_quiz with the file's title; to study a course with no file named, start_quiz with the course alone.
9. Navigation: if the student asks to see or go somewhere, navigate. Add a link chip when pointing at a page would help.
10. remember: only facts the student states about themselves (preferences, constraints, plans), never your own advice.
11. The "desk camera" line, when present, reports plainly observed scene facts from the kiosk camera. Use it only for
    presence and schedule relevance (welcome back after a PERSON_RETURNED, note a step-away during a study block,
    acknowledge materials are out). Never infer emotion, stress, focus, tiredness, health, or identity, and never
    change a status or act on a suggestion because of it.
12. The "Google Fit" line, when present, is the student's own data from their watch, with today's calls already worked
    out and listed as health_call ids (rest = today's gym block becomes a rest-day walk, winddown = a wind-down block
    tonight, cardio = a 20-minute walk tomorrow morning). Answer sleep, recovery, gym and cardio questions from that line
    only. To put a call on the week, return health_call with its id (a calendar change, so a proposal); never rebuild it
    with add_event or rename_event. Plan around it: on a rest day propose no lifting; with a wind-down call put nothing
    after 11 PM. Repeat its calls as its calls ("Fit says..."), never as diagnosis. The 7-night sleep average is one of the
    model's inputs (avg_sleep_hours), so you may say a full night moves that number, under rule 3. Rule 4 still applies to
    everything the Fit line does not say.`;

const CHANNEL = {
  chat: "Reply in at most three short sentences, plain words, no headers or lists. Then one question back at most.",
  voice: "This is spoken aloud: at most two short sentences, no lists, no symbols, numbers as words where natural. Always return the actions that would make a requested change — the app holds calendar changes and asks the student to confirm out loud before running them. Describe the change in say as a proposal and end with a short question like 'Want me to go ahead?', never claim it is already done. On the /device kiosk never navigate — there is nowhere to go; say it instead.",
};

type Specialist = { name: string; addendum: string; maxTokens: number; temperature: number };

/** Zero-token router: the message picks the specialist, each with its own prompt addendum and budget. */
export function route(message: string): Specialist {
  const m = message.toLowerCase();
  if (/\b(email|e-mail|mail|write to|reply|respond|message (my|the|dr|prof)|note to|letter|extension|professor|advisor|ta\b)/.test(m))
    return { name: "writer", addendum: "WRITER: produce the email now as a draft_email action with a complete body. Keep the spoken reply to one sentence.", maxTokens: 900, temperature: 0.4 };
  if (/\b(sleep|slept|tired|exhausted|rest day|readiness|recover|heart rate|hrv|cardio|wind[- ]?down|google fit|fit says|fitbit|health|how('?s| is) my body)\b/.test(m))
    return {
      name: "health",
      addendum:
        "HEALTH: answer from the Google Fit line in CONTEXT only (last night, the 7-night average, readiness, HRV, resting HR, steps, cardio, exercise days, today's calls). " +
        "Whenever the student wants a call on the week, or agrees to one you suggested (swap the gym, rest today, add the wind-down, add the walk), you MUST return one health_call action per call, with call set to its id from the Google Fit line (rest, winddown or cardio), in this same reply: the app holds them and asks the student to approve. " +
        "Never say you proposed, added or swapped anything without returning the action; never use add_event or rename_event for a call. If there is no Google Fit line, say Fit isn't connected for this profile and change nothing.",
      maxTokens: 450,
      temperature: 0.2,
    };
  if (/\b(add|move|reschedul|schedule|put|block|calendar|remove|delete|cancel|shift|free|clear|slot|plan my|approve|not now|dismiss|make it real|resize|longer|shorter|rename|repeat|every day|weekday|weekly)\b/.test(m))
    return { name: "scheduler", addendum: "SCHEDULER: compute concrete times from the calendar in CONTEXT, avoid overlaps, and return every calendar action needed (one per event). Say what you'd change and when, briefly, as a proposal the student approves. When you name an existing event's day or time, read it from that event in CONTEXT, never from earlier messages: the app may have moved it to a free slot.", maxTokens: 1200, temperature: 0.2 };
  if (/\b(quiz|explain|what is|what's|define|teach|study for|review|flashcard|slides|notes|chapter|concept)\b/.test(m))
    return { name: "tutor", addendum: "TUTOR: teach from the student's files and syllabus facts in CONTEXT when they cover it; otherwise say what you have. When practice would help, offer it with start_quiz (quiz or flashcards) or start_teach, asked=false, as a question.", maxTokens: 500, temperature: 0.4 };
  return { name: "coach", addendum: "", maxTokens: 400, temperature: 0.3 };
}

export function renderAgentContext(ctx: AgentContext): string {
  // The week is rendered once, below, with ids (the coach's own week line would repeat it).
  const L: string[] = [renderContext({ ...ctx, week: [] })];
  // Weekday names for the next two weeks, so "Friday" never lands on a Saturday.
  const base = new Date(ctx.now);
  const days = Array.from({ length: 14 }, (_, i) => {
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
  for (const x of ctx.excerpts ?? []) L.push(`file excerpt "${x.title}" (${x.course}): ${x.text}`);
  if (ctx.weekIds.length) {
    const ends = new Map((ctx.week ?? []).map((e) => [`${e.title}|${e.start}`, `${e.end.slice(11, 16)} [${e.kind}]`]));
    L.push(`calendar, next 14 days (id=title start-end [kind]): ${ctx.weekIds.map((e) => `${e.id}=${e.title} ${e.start.slice(5, 16).replace("T", " ")}-${ends.get(`${e.title}|${e.start}`) ?? ""}`).join("; ")}`);
  }
  if (ctx.suggestionIds.length) L.push(`pending suggestion ids: ${ctx.suggestionIds.map((x) => `${x.id}=${x.title}`).join("; ")}`);
  if (ctx.recourse.length) L.push(`make-it-real plans: ${ctx.recourse.map((r) => `${r.course}: ${r.plan}`).join(" | ")}`);
  if (ctx.health) L.push(`Google Fit: ${ctx.health}`);
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
    if (a.type === "add_event") return !!a.title && ok(a.start) && ok(a.end) && a.end! > a.start!;
    if (a.type === "move_event") return !!a.id && ok(a.start) && ok(a.end) && a.end! > a.start!;
    if (a.type === "resize_event") return !!a.id && ok(a.end);
    if (a.type === "rename_event") return !!a.id && !!a.title;
    if (a.type === "clear_range") return ok(a.start) && ok(a.end) && a.end! > a.start!;
    if (a.type === "remove_event" || a.type === "approve_suggestion" || a.type === "dismiss_suggestion" || a.type === "complete_block") return !!a.id;
    if (a.type === "approve_all") return true;
    if (a.type === "make_it_real" || a.type === "log_quiz" || a.type === "log_session" || a.type === "check_in" || a.type === "start_quiz" || a.type === "start_timer" || a.type === "start_teach") return !!a.course;
    if (a.type === "set_midterm") return !!a.course && typeof a.score === "number";
    if (a.type === "draft_email") return !!a.email_body;
    if (a.type === "health_call") return a.call === "rest" || a.call === "winddown" || a.call === "cardio";
    if (a.type === "navigate") return !!a.path && a.path.startsWith("/");
    if (a.type === "link") return !!a.path && a.path.startsWith("/");
    return false;
  });
  const u = res.usageMetadata;
  const reply: AgentReply = {
    say: (parsed.say ?? "").trim(),
    actions: actions.slice(0, 12),
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
