// The one place the UI gets data from. It uses the Tiger database through /api when it's
// reachable, and falls back to the local demo content (src/lib/mock.ts) when it isn't, so the
// demo never depends on the network. Writes are fire-and-forget: the UI never waits on them.
import { NOW, PROFILES, JUDGE_COURSE, JUDGE_CLASS, BUDDIES, type Profile } from "./mock";
import { toLocal, toUtc } from "./time";
import type { Tree } from "./tree";
import { DEMO_PROFILE, isDemo } from "./demo";

export type Horizon = "early" | "mid";
export type RemoteState = {
  deltas: Record<string, { quizzes: number; checkins: number; sessions: number }>;
  checkedIn: Record<string, boolean>;
  blocks: { id: string; course: string; title: string; at: string; done: boolean }[];
  done: Record<string, boolean>;
};

let live = false; // true once /api/profiles answered from the database
export const isLive = () => live;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

// Everything dated arrives in the app's local form (src/lib/time.ts), whether the database sent a
// UTC instant or the demo content a bare wall-clock time, so sorting and comparing stay plain text.
const localize = (p: Profile): Profile => ({
  ...p,
  courses: p.courses.map((c) => ({ ...c, exam: { ...c.exam, date: toLocal(c.exam.date) } })),
  classes: p.classes.map((m) => ({ ...m, at: toLocal(m.at) })),
  todos: p.todos.map((t) => (t.due ? { ...t, due: toLocal(t.due) } : t)),
});

export async function getProfiles(): Promise<Profile[]> {
  try {
    const p = await api<Profile[]>("/api/profiles");
    live = true; // an empty list is a real answer: not signed in and not in demo mode
    return p.map(localize);
  } catch {}
  live = false;
  return (isDemo() ? PROFILES.filter((p) => p.id === DEMO_PROFILE) : []).map(localize); // offline: the demo student, still only in demo mode
}

export async function getState(profileId: string): Promise<RemoteState | null> {
  if (!live) return null;
  try {
    const r = await api<RemoteState>(`/api/state?profile_id=${encodeURIComponent(profileId)}`);
    return { ...r, blocks: r.blocks.map((b) => ({ ...b, at: toLocal(b.at) })), checkedIn: Object.fromEntries(Object.entries(r.checkedIn ?? {}).map(([k, v]) => [toLocal(k), v])) };
  } catch {
    return null;
  }
}

/** The profile's browser-side state kept on the server (chats, set-aside suggestions, moved demo events…). null: not reachable. */
export type Extras = Record<string, unknown>;
export async function getExtras(profileId: string): Promise<{ data: Extras | null } | null> {
  if (!live) return null;
  try {
    return await api<{ data: Extras | null }>(`/api/extras?profile_id=${encodeURIComponent(profileId)}`);
  } catch {
    return null;
  }
}

export async function getTree(h: Horizon): Promise<Tree> {
  const r = await fetch(`/models/tree_${h}.json`);
  if (!r.ok) throw new Error(`tree_${h}.json: ${r.status}`);
  return r.json();
}

export async function getBuddies(profileId: string) {
  if (live)
    try {
      return await api<typeof BUDDIES>(`/api/buddies?profile_id=${encodeURIComponent(profileId)}`);
    } catch {}
  return isDemo() ? BUDDIES : []; // the sample buddies are demo data, never a real account's
}

const send = (path: string, method: string, body: unknown) =>
  live ? api(path, { method, body: JSON.stringify(body) }).catch(() => undefined) : Promise.resolve(undefined);

// Writes. Inputs only: nothing here ever sends a status or score from the model.
export const sync = {
  event: (profile_id: string, course_slug: string, e: { kind: string; minutes?: number; score?: number; meta?: object }) => {
    const h = new Date().getHours();
    return send("/api/events", "POST", { profile_id, course_slug, ...e, late_night: h < 4 });
  },
  // Blocks go out as UTC instants (the browser knows its zone; the server doesn't), ten per request.
  blocks: (profile_id: string, blocks: RemoteState["blocks"]) => {
    const rows = blocks.map((b) => ({ id: b.id, course: b.course, title: b.title, at: toUtc(b.at), done: b.done }));
    const batches = Array.from({ length: Math.ceil(rows.length / 10) }, (_, i) => rows.slice(i * 10, i * 10 + 10));
    return Promise.all(batches.map((batch) => send("/api/blocks", "POST", { profile_id, blocks: batch })));
  },
  blockDone: (profile_id: string, id: string, done: boolean) => send("/api/blocks", "PATCH", { profile_id, id, done }),
  /** A block moved or renamed here: the database follows, so a reload (or another device) shows the same week. */
  blockEdit: (profile_id: string, id: string, patch: { at?: string; title?: string }) =>
    send("/api/blocks", "PATCH", { profile_id, id, ...(patch.at ? { at: toUtc(patch.at) } : {}), ...(patch.title ? { title: patch.title } : {}) }),
  blockRemove: (profile_id: string, id: string) => send("/api/blocks", "DELETE", { profile_id, id }),
  /** Save the extras document. "stale" means a Reset happened elsewhere since this device loaded: reload, don't write. */
  extras: async (profile_id: string, data: Extras): Promise<"ok" | "stale" | undefined> => {
    if (!live) return undefined;
    const r = await fetch("/api/extras", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile_id, data }), signal: AbortSignal.timeout(4000) }).catch(() => null);
    return r?.status === 409 ? "stale" : r?.ok ? "ok" : undefined;
  },
  todo: (profile_id: string, id: string, done: boolean) => send("/api/todos", "PATCH", { profile_id, id, done }),
  addJudgeCourse: (profile_id: string) => send("/api/courses", "POST", { profile_id }),
  /** Reset the profile to its start state; resolves to the reset's stamp (see /api/extras). */
  reset: async (profile_id: string): Promise<string | undefined> => {
    if (!live) return undefined;
    const r = await fetch(`/api/state?profile_id=${encodeURIComponent(profile_id)}`, { method: "DELETE" }).catch(() => null);
    return r?.ok ? ((await r.json().catch(() => ({}))) as { resetAt?: string }).resetAt : undefined;
  },
};

export const demo = { now: NOW, judgeCourse: JUDGE_COURSE, judgeClass: JUDGE_CLASS };

// ── Study Pots (Solana devnet). Live only: there's no local fallback for a blockchain. ──────
export type PotsView = {
  wallet: { address: string; balance: number; explorer: string; allowancePending: boolean };
  upcoming: { weekStart: string; lockAt: string; settleAfter: string };
  pots: Pot[];
};
export type Pot = import("./solana/chain").PotView;

export async function getPots(profileId: string): Promise<PotsView | null> {
  if (!live) return null;
  try {
    return await api<PotsView>(`/api/pots?profile_id=${encodeURIComponent(profileId)}`);
  } catch {
    return null;
  }
}

/** Create, join or leave. Waits for devnet confirmation; throws with a readable message. */
export async function potAction(body: { profile_id: string; action: "create" | "join" | "leave"; pot?: string; stake?: number }) {
  const t0 = performance.now();
  const r = await fetch("/api/pots", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Couldn't reach Solana devnet. Try again in a moment.");
  return { ...(j as { pot: string; sig: string; explorer: string }), seconds: (performance.now() - t0) / 1000 };
}
