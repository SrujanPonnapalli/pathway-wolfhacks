// Viva's inbox brief: the few course emails worth acting on, ranked by what the decision tree says.
// Shared by the browser (instant rule-based brief, cache key) and the server (Gemini brief + fallback).

import type { Mail } from "./inbox";

export type BriefKind = "reply" | "date" | "action" | "fyi";
export type BriefItem = { mail: string; kind: BriefKind; text: string };
export type Brief = { headline: string; items: BriefItem[]; by: "viva" | "rules" };

/** What the brief needs from each course: its code and the tree's status. */
export type BriefCourse = { code: string; checkIn: boolean };

export const MAX_ITEMS = 3;

/**
 * The instant brief, no model: replies owed first, then unread mail for courses worth a check-in,
 * then other unread. Shown while Viva reads, and kept if Gemini is unavailable.
 */
export function ruleBrief(mail: Mail[], courses: BriefCourse[]): Brief {
  const flagged = new Set(courses.filter((c) => c.checkIn).map((c) => c.code));
  const unread = mail.filter((m) => m.unread);
  const rank = (m: Mail) => (m.needsReply ? 0 : flagged.has(m.course) ? 1 : 2);
  const items = [...unread]
    .sort((a, b) => rank(a) - rank(b) || b.at.localeCompare(a.at))
    .slice(0, MAX_ITEMS)
    .map((m): BriefItem => ({ mail: m.id, kind: m.needsReply ? "reply" : "fyi", text: `${m.course}: ${m.subject}${m.needsReply ? " (needs a reply)" : ""}` }));
  const replies = unread.filter((m) => m.needsReply).length;
  const headline = !unread.length
    ? "You're caught up on course mail."
    : `${unread.length} unread from your classes${replies ? `, ${replies} ${replies === 1 ? "needs" : "need"} a reply` : ""}.`;
  return { headline, items, by: "rules" };
}

/** Changes whenever the brief could: which mail is there or unread, and each course's status. */
export function briefKey(mail: Mail[], courses: BriefCourse[], day: string) {
  return [day, ...mail.map((m) => `${m.id}${m.unread ? "u" : ""}${m.needsReply ? "r" : ""}`), ...courses.map((c) => `${c.code}${c.checkIn ? "!" : ""}`)].join("|");
}

/** How long a check of unchanged mail stays current. New or newly read mail, or a status change, re-checks at once. */
export const RECHECK_MS = 5 * 60_000;

/** A brief as cached: the mail fingerprint it was written for and when (real time, ms). */
export type SavedBrief = { key: string; brief: Brief; at: number };

// Browser side. The server (/api/inbox/brief) holds the shared copy for a profile, and Reset deletes it there;
// this device keeps a copy only to paint instantly, plus a note of the last check made in this page session so
// opening an email and coming back doesn't even ask the server.
const LOCAL = (profile: string) => `pathway_inbox_brief:${profile}`;
const session = new Map<string, { key: string; at: number }>();

export function localBrief(profile: string): SavedBrief | null {
  try {
    const hit = JSON.parse(localStorage.getItem(LOCAL(profile)) ?? "null");
    return hit?.key && hit.brief && hit.at ? hit : null;
  } catch {
    return null;
  }
}

/** Remember a brief Viva wrote (or the server confirmed) as current. */
export function keepBrief(profile: string, saved: SavedBrief) {
  session.set(profile, { key: saved.key, at: saved.at });
  try {
    localStorage.setItem(LOCAL(profile), JSON.stringify(saved));
  } catch {}
}

/** True when this page session already checked this exact mail recently. */
export function checkedThisSession(profile: string, key: string) {
  const s = session.get(profile);
  return !!s && s.key === key && Date.now() - s.at < RECHECK_MS;
}

/** Reset: forget everything on this device, so the next inbox visit rebuilds (the server copy is deleted too). */
export function forgetBrief(profile: string) {
  session.delete(profile);
  try {
    localStorage.removeItem(LOCAL(profile));
  } catch {}
}
