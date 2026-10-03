// One calendar API for the app, two backends:
//   shared   -> /api/gcal, the demo student's calendar, already connected for every visitor
//   personal -> the visitor's own Google account via OAuth in the browser (gcalPersonal.ts)
// init() asks the server which one applies. Everything else is the same shape either way.

import type { CalEvent } from "./schedule";
import * as personal from "./gcalPersonal";

let mode: "shared" | "personal" | "unknown" = "unknown";
let sharedId: string | null = null;

/** Call once on load. Resolves true when a calendar is already connected. */
export async function init(): Promise<boolean> {
  if (mode !== "unknown") return isConnected();
  try {
    const r = await fetch("/api/gcal", { cache: "no-store" });
    const j = (await r.json()) as { connected: boolean; calendarId: string | null };
    if (j.connected) {
      mode = "shared";
      sharedId = j.calendarId;
      return true;
    }
  } catch {}
  mode = "personal";
  return personal.isConnected();
}

export const isShared = () => mode === "shared";
export function isConnected() {
  return mode === "shared" ? true : personal.isConnected();
}
export async function connect() {
  if (mode === "shared") return;
  return personal.connect();
}
export function disconnect() {
  if (mode === "shared") return;
  personal.disconnect();
}
export async function whoAmI(): Promise<{ email: string; name: string }> {
  if (mode === "shared") return { email: sharedId ?? "shared calendar", name: "Maya (demo)" };
  return personal.whoAmI();
}

function kindOf(summary: string, description: string): CalEvent["kind"] {
  if (description.includes("Planned in Pathway")) return "study";
  const s = summary.toLowerCase();
  if (/\b(exam|midterm|final|test)\b/.test(s)) return "exam";
  if (/\b(work|shift)\b/.test(s)) return "work";
  if (/\b(lecture|lab|class|recitation)\b/.test(s) || /[A-Z]{2,4}\s?\d{3}/.test(summary)) return "class";
  if (/\b(study|review|quiz)\b/.test(s)) return "study";
  return "other";
}

async function post<T>(body: unknown): Promise<T> {
  const r = await fetch("/api/gcal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `${r.status}`);
  return j as T;
}

export async function listWeek(monday: Date): Promise<CalEvent[]> {
  if (mode !== "shared") return personal.listWeek(monday);
  const end = new Date(monday);
  end.setDate(monday.getDate() + 14);
  const r = await fetch(`/api/gcal?from=${encodeURIComponent(monday.toISOString())}&to=${encodeURIComponent(end.toISOString())}`, { cache: "no-store" });
  const j = (await r.json()) as { events: { id: string; title: string; start: string; end: string; description: string }[]; error?: string };
  if (j.error) throw new Error(j.error);
  return j.events.map((e) => ({ id: `g-${e.id}`, title: e.title, start: e.start, end: e.end, kind: kindOf(e.title, e.description), source: "google" as const, localId: e.description.match(/Pathway:(\S+)/)?.[1] }));
}

export async function insert(ev: Pick<CalEvent, "title" | "start" | "end">, description = "Planned in Pathway"): Promise<string> {
  if (mode !== "shared") return personal.insert(ev, description);
  return (await post<{ id: string }>({ op: "insert", title: ev.title, start: ev.start, end: ev.end, description })).id;
}
export async function move(googleId: string, start: string, end: string): Promise<void> {
  if (mode !== "shared") return personal.move(googleId, start, end);
  await post({ op: "move", id: googleId, start, end });
}
export async function remove(googleId: string): Promise<void> {
  if (mode !== "shared") return personal.remove(googleId);
  await post({ op: "remove", id: googleId });
}
