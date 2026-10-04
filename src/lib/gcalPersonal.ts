// Personal Google Calendar from the browser (fallback when no shared calendar is configured). Google Identity Services hands the
// page a short-lived access token for the calendar scope; the page calls the Calendar REST
// API directly. Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID (OAuth 2.0 Web client, with
// http://localhost:3000 as an authorized JavaScript origin). Without it, connect() throws
// and the app stays on the demo calendar.

import type { CalEvent } from "./schedule";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const KEY = "pathway:gcal-token";

type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (c: {
            client_id: string;
            scope: string;
            callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void;
            error_callback?: (e: { type: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let token: { value: string; exp: number } | null = null;
function load(): { value: string; exp: number } | null {
  if (token) return token;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) token = JSON.parse(raw);
  } catch {}
  return token;
}
export function isConnected() {
  const t = load();
  return !!t && t.exp > Date.now();
}
export function disconnect() {
  token = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}

/** Loads Google Identity Services once (calendar access and Sign in with Google share it). */
export function script(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error("Could not load Google sign-in."));
    document.head.appendChild(s);
  });
}

export async function connect(): Promise<void> {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!id) throw new Error("No Google client ID yet. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to .env.local (see README).");
  await script();
  await new Promise<void>((res, rej) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) return rej(new Error(r.error ?? "Google did not return a token."));
        token = { value: r.access_token, exp: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 };
        try {
          sessionStorage.setItem(KEY, JSON.stringify(token));
        } catch {}
        res();
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = load();
  if (!t || t.exp < Date.now()) throw new Error("Google Calendar is not connected.");
  const r = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${t.value}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  if (r.status === 401) {
    disconnect();
    throw new Error("Google session expired. Connect again.");
  }
  if (!r.ok) throw new Error(`Google Calendar: ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.status === 204 ? (undefined as T) : r.json();
}

type GEvent = { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; description?: string; htmlLink?: string };

/** Which Google account's primary calendar we are writing to. */
export async function whoAmI(): Promise<{ email: string; name: string }> {
  const t = load();
  if (!t) throw new Error("Google Calendar is not connected.");
  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", { headers: { authorization: `Bearer ${t.value}` } });
  if (!r.ok) throw new Error(`Google Calendar: ${r.status}`);
  const j = (await r.json()) as { id: string; summary: string };
  return { email: j.id, name: j.summary };
}

/** Events Pathway wrote in the two weeks around `monday`, straight from Google, with links. */
export async function listPathway(monday: Date): Promise<{ title: string; start: string; link: string }[]> {
  const min = new Date(monday); min.setDate(monday.getDate() - 7);
  const max = new Date(monday); max.setDate(monday.getDate() + 14);
  const q = new URLSearchParams({ timeMin: min.toISOString(), timeMax: max.toISOString(), singleEvents: "true", orderBy: "startTime", q: "Pathway", maxResults: "100" });
  const res = await call<{ items: GEvent[] }>(`?${q}`);
  return (res.items ?? []).map((e) => ({ title: e.summary ?? "", start: e.start?.dateTime ?? e.start?.date ?? "", link: e.htmlLink ?? "" }));
}

function kindOf(summary: string): CalEvent["kind"] {
  const s = summary.toLowerCase();
  if (/\b(exam|midterm|final|test)\b/.test(s)) return "exam";
  if (/\b(work|shift)\b/.test(s)) return "work";
  if (/\b(lecture|lab|class|recitation|[A-Z]{2,4}\s?\d{3})\b/i.test(summary)) return "class";
  if (/\b(study|review|quiz)\b/.test(s)) return "study";
  return "other";
}

export async function listWeek(monday: Date): Promise<CalEvent[]> {
  const end = new Date(monday);
  end.setDate(monday.getDate() + 14);
  const q = new URLSearchParams({ timeMin: monday.toISOString(), timeMax: end.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const res = await call<{ items: GEvent[] }>(`?${q}`);
  return (res.items ?? [])
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .map((e) => {
      const desc = e.description ?? "";
      const localId = desc.match(/Pathway:(\S+)/)?.[1];
      return { id: `g-${e.id}`, title: e.summary ?? "(no title)", start: e.start!.dateTime!.slice(0, 19), end: e.end!.dateTime!.slice(0, 19), kind: desc.includes("Planned in Pathway") ? "study" : kindOf(e.summary ?? ""), source: "google" as const, localId };
    });
}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export async function insert(ev: Pick<CalEvent, "title" | "start" | "end">, description = "Planned in Pathway"): Promise<string> {
  const r = await call<GEvent>("", { method: "POST", body: JSON.stringify({ summary: ev.title, description, start: { dateTime: ev.start, timeZone: tz() }, end: { dateTime: ev.end, timeZone: tz() } }) });
  return r.id;
}

export async function move(googleId: string, start: string, end: string): Promise<void> {
  await call(`/${encodeURIComponent(googleId)}`, { method: "PATCH", body: JSON.stringify({ start: { dateTime: start, timeZone: tz() }, end: { dateTime: end, timeZone: tz() } }) });
}

export async function remove(googleId: string): Promise<void> {
  await call(`/${encodeURIComponent(googleId)}`, { method: "DELETE" });
}
