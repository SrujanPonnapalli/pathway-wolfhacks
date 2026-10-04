// The one place the UI gets data from. It uses the Tiger database through /api when it's
// reachable, and falls back to the local demo content (src/lib/mock.ts) when it isn't, so the
// demo never depends on the network. Writes are fire-and-forget: the UI never waits on them.
import { NOW, PROFILES, JUDGE_COURSE, JUDGE_CLASS, BUDDIES, type Profile } from "./mock";
import type { Tree } from "./tree";
import { isDemo } from "./demo";

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

export async function getProfiles(): Promise<Profile[]> {
  try {
    const p = await api<Profile[]>("/api/profiles");
    live = true; // an empty list is a real answer: not signed in and not in demo mode
    return p;
  } catch {}
  live = false;
  return isDemo() ? PROFILES : []; // offline: the local sample students, still only in demo mode
}

export async function getState(profileId: string): Promise<RemoteState | null> {
  if (!live) return null;
  try {
    return await api<RemoteState>(`/api/state?profile_id=${encodeURIComponent(profileId)}`);
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
  return BUDDIES;
}

const send = (path: string, method: string, body: unknown) =>
  live ? api(path, { method, body: JSON.stringify(body) }).catch(() => undefined) : Promise.resolve(undefined);

// Writes. Inputs only: nothing here ever sends a status or score from the model.
export const sync = {
  event: (profile_id: string, course_slug: string, e: { kind: string; minutes?: number; score?: number; meta?: object }) => {
    const h = new Date().getHours();
    return send("/api/events", "POST", { profile_id, course_slug, ...e, late_night: h < 4 });
  },
  blocks: (profile_id: string, blocks: RemoteState["blocks"]) => send("/api/blocks", "POST", { profile_id, blocks }),
  blockDone: (profile_id: string, id: string, done: boolean) => send("/api/blocks", "PATCH", { profile_id, id, done }),
  todo: (profile_id: string, id: string, done: boolean) => send("/api/todos", "PATCH", { profile_id, id, done }),
  addJudgeCourse: (profile_id: string) => send("/api/courses", "POST", { profile_id }),
  reset: (profile_id: string) => (live ? fetch(`/api/state?profile_id=${encodeURIComponent(profile_id)}`, { method: "DELETE" }).catch(() => undefined) : Promise.resolve(undefined)),
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
