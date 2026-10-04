// Viva's inbox brief on the server: one fast Gemini call over the course mail plus the same context
// Viva chat reads (renderContext: each course's tree status, the "why" facts, the smallest change to
// on track, this week's calendar). Returns at most three items, each pinned to a real email.

import { Type, type Schema } from "@google/genai";
import { generateJSON, textPart } from "../gemini";
import type { Mail } from "../inbox";
import { MAX_ITEMS, ruleBrief, type Brief, type BriefItem, type BriefKind } from "../inboxBrief";
import { CAUSAL, renderContext, type CoachContext } from "./coach";

const SYSTEM = `You are Viva, Pathway's study coach, writing the short brief at the top of a student's course inbox.
Return a headline (one plain sentence, at most 14 words) that names the single most important thing by course,
in the shape "<course>'s <thing> <day> is the one to <verb>.", and at most ${MAX_ITEMS} items, most important first.
Each item points at one email by its id and says, in one sentence of at most 22 words, what matters and what to do.
kind: "reply" if the email asks the student to respond; "date" for a time, place or deadline to keep; "action" for something to do;
"fyi" otherwise. Skip emails that need nothing.
Rank emails for courses marked "worth a check-in" first. When an email offers a step that matches that course's
"smallest change to on track" or its "why" facts (a makeup quiz, a review session, a practice set), say so as a pattern
in a clause at the end, after the facts, in the shape "<course> <event> <day> <time> in <place>, the kind of step
that helps students with similar patterns." Lead every item with the course and the concrete fact.
Rules: use ONLY facts in the emails and CONTEXT; every date, time, place and number must appear there.
Statuses are only "on track" or "worth a check-in"; never failing, at risk, behind or in trouble.
Patterns, never cause and effect: never "this will raise your grade" or "you will pass". No markdown.`;

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          mail: { type: Type.STRING },
          kind: { type: Type.STRING, enum: ["reply", "date", "action", "fyi"] },
          text: { type: Type.STRING },
        },
        required: ["mail", "kind", "text"],
      },
    },
  },
  required: ["headline", "items"],
};

const KINDS = new Set<BriefKind>(["reply", "date", "action", "fyi"]);
const clean = (s: string) => (CAUSAL.test(s) ? s.replace(new RegExp(CAUSAL.source, "gi"), "often goes with better outcomes") : s).trim();

export async function briefInbox(mail: Mail[], ctx: CoachContext): Promise<Brief> {
  const fallback = ruleBrief(mail, ctx.courses.map((c) => ({ code: c.code, checkIn: c.status === "check_in" })));
  if (!mail.some((m) => m.unread || m.needsReply)) return fallback;
  // Newest first, bodies trimmed: the brief needs the gist, and a smaller prompt answers faster.
  const emails = [...mail]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10)
    .map((m) => `email ${m.id} [${m.course}] from ${m.from}, ${m.at.slice(0, 16).replace("T", " ")}${m.unread ? ", unread" : ""}${m.needsReply ? ", asks for a reply" : ""}\nsubject: ${m.subject}\n${m.body.slice(0, 700)}`)
    .join("\n---\n");
  try {
    const out = await generateJSON<{ headline: string; items: BriefItem[] }>({
      parts: [textPart(`CONTEXT\n${renderContext(ctx)}\n\nEMAILS\n${emails}`)],
      schema: SCHEMA,
      system: SYSTEM,
      temperature: 0.2,
      tier: "fast",
    });
    // Grounding: only items about emails that exist, once each.
    const ids = new Set(mail.map((m) => m.id));
    const seen = new Set<string>();
    const items = (out.items ?? [])
      .filter((i) => ids.has(i.mail) && KINDS.has(i.kind) && i.text?.trim() && !seen.has(i.mail) && seen.add(i.mail))
      .slice(0, MAX_ITEMS)
      .map((i) => ({ mail: i.mail, kind: i.kind, text: clean(i.text) }));
    if (!out.headline?.trim() || !items.length) return fallback;
    return { headline: clean(out.headline), items, by: "viva" };
  } catch (e) {
    console.warn("[inbox brief] Gemini unavailable, using the rule-based brief:", (e as Error).message);
    return fallback;
  }
}
