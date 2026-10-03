// The one place the UI gets data from. Today it returns demo content and the static tree JSON;
// replace each body with a fetch to /api/... when the backend lands. Keep the return shapes.
import { NOW, PROFILES, JUDGE_COURSE, JUDGE_CLASS, BUDDIES } from "./mock";
import type { Tree } from "./tree";

export type Horizon = "early" | "mid";

export async function getProfiles() {
  return PROFILES;
}

export async function getTree(h: Horizon): Promise<Tree> {
  const r = await fetch(`/models/tree_${h}.json`);
  if (!r.ok) throw new Error(`tree_${h}.json: ${r.status}`);
  return r.json();
}

export async function getBuddies() {
  return BUDDIES; // TODO: /api/events weekly_stats for each buddy (effort only, never status)
}

export const demo = { now: NOW, judgeCourse: JUDGE_COURSE, judgeClass: JUDGE_CLASS };
