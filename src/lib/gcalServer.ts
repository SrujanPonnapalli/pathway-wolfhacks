// Server-side Google Calendar for the ONE shared demo calendar ("Maya's" calendar, which is
// the Evan Keys Google account). A service account that the calendar is shared with signs
// a JWT, trades it for an access token, and talks to the Calendar API. Visitors never see
// an OAuth screen: the calendar is simply already connected for everyone.
//
// Env: GOOGLE_SERVICE_ACCOUNT_JSON (the downloaded key file, as one line)
//      GOOGLE_CALENDAR_ID (the calendar to use; the account's email for its primary calendar)

import { createSign } from "node:crypto";

export type GEvent = { id: string; summary?: string; description?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; htmlLink?: string; updated?: string };

const SCOPE = "https://www.googleapis.com/auth/calendar.events";

function creds(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (j.client_email && j.private_key) return { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, "\n") };
  } catch {}
  return null;
}

export const calendarId = () => process.env.GOOGLE_CALENDAR_ID ?? "primary";
// GOOGLE_FAKE_CALENDAR=1 runs an in-memory calendar so the whole flow works with no Google account (dev only).
const FAKE = process.env.GOOGLE_FAKE_CALENDAR === "1";
export const isConfigured = () => FAKE || (!!creds() && !!process.env.GOOGLE_CALENDAR_ID);
const fake: Map<string, GEvent> = new Map();

let cached: { token: string; exp: number } | null = null;
async function token(): Promise<string> {
  if (cached && cached.exp > Date.now()) return cached.token;
  const c = creds();
  if (!c) throw new Error("Google service account is not configured (GOOGLE_SERVICE_ACCOUNT_JSON).");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: c.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(c.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  if (!r.ok) throw new Error(`Google token: ${r.status} ${(await r.text()).slice(0, 160)}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cached.token;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await token();
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events`;
  const r = await fetch(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${t}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`Google Calendar: ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.status === 204 ? (undefined as T) : r.json();
}

export async function list(timeMin: string, timeMax: string): Promise<GEvent[]> {
  if (FAKE) return [...fake.values()].filter((e) => e.start!.dateTime! >= timeMin.slice(0, 19) && e.start!.dateTime! < timeMax.slice(0, 19));
  const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  return ((await call<{ items: GEvent[] }>(`?${q}`)).items ?? []).filter((e) => e.start?.dateTime && e.end?.dateTime);
}

export async function insert(ev: { title: string; start: string; end: string; description: string; timeZone: string }): Promise<GEvent> {
  if (FAKE) {
    const e: GEvent = { id: Math.random().toString(36).slice(2), summary: ev.title, description: ev.description, start: { dateTime: ev.start }, end: { dateTime: ev.end } };
    fake.set(e.id, e);
    return e;
  }
  return call<GEvent>("", { method: "POST", body: JSON.stringify({ summary: ev.title, description: ev.description, start: { dateTime: ev.start, timeZone: ev.timeZone }, end: { dateTime: ev.end, timeZone: ev.timeZone } }) });
}

export async function move(id: string, start: string, end: string, timeZone: string): Promise<void> {
  if (FAKE) {
    const e = fake.get(id);
    if (e) {
      e.start = { dateTime: start };
      e.end = { dateTime: end };
    }
    return;
  }
  await call(`/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ start: { dateTime: start, timeZone }, end: { dateTime: end, timeZone } }) });
}

export async function remove(id: string): Promise<void> {
  if (FAKE) {
    fake.delete(id);
    return;
  }
  await call(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}
