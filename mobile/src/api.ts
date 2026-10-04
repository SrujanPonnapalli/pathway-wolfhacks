// The one place mobile talks to Pathway's backend: the same POST /api/coach (Gemini) the web
// app and the Raspberry Pi use. Context is built exactly like src/lib/api.ts's coachContext:
// numbers only, status computed on-device.
import Constants from "expo-constants";
import { meta } from "./model/features";
import { usedFeatures } from "./model/tree";
import { vivaReply, type ChatMessage } from "./model/viva";
import { COURSES, INITIAL_BLOCKS, NOW, PROFILE } from "./data";

// On a physical iPhone localhost means the phone — so default to the Mac running Metro
// (hostUri is the LAN address the dev client connected through). Override with
// EXPO_PUBLIC_API_URL, e.g. EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 npx expo start --dev-client
const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (metroHost ? `http://${metroHost}:3000` : "http://localhost:3000");

type CoachCourse = {
  slug: string;
  code: string;
  name: string;
  exam: { title: string; date: string };
  daysToExam: number;
  status: "on_track" | "check_in";
  x: Record<string, number>;
  steps: { feature: string; threshold: number; value: number; above: boolean }[];
  recourse: { feature: string; from: number; to: number }[] | null;
  similarStudentsStruggledPct: number;
};

export type CoachContext = {
  now: string;
  studentName: string;
  courses: CoachCourse[];
  todos: { title: string; detail: string; due?: string }[];
  blocks: { course: string; title: string; at: string; done: boolean }[];
  sources?: unknown[];
  inbox?: unknown[];
  week?: unknown[];
  suggestions?: unknown[];
};

export type CoachReply = { text: string; filtered: boolean; ms: number };
export type VivaAnswer = { text: string; source: "gemini" | "offline" };

export function coachContext(): CoachContext {
  return {
    now: NOW.toISOString(),
    studentName: PROFILE.name,
    courses: COURSES.map((c) => ({
      slug: c.slug,
      code: c.code,
      name: c.name,
      exam: c.exam,
      daysToExam: c.daysToExam,
      status: c.result.atRisk ? "check_in" : "on_track",
      // Only numbers that matter to this tree or that the student can move; keeps the prompt small.
      x: Object.fromEntries(
        Object.entries(c.x).filter(([f]) => !f.startsWith("course_") && !f.endsWith("_missing") && (meta(f).role === "suggest" || usedFeatures(c.tree).includes(f))),
      ),
      steps: c.steps.map(({ feature, threshold, value, above }) => ({ feature, threshold, value, above })),
      recourse: c.rec?.moves ?? null,
      similarStudentsStruggledPct: Math.round(c.result.pRisk * 100),
    })),
    todos: PROFILE.todos.map(({ title, detail, due }) => ({ title, detail, due })),
    blocks: INITIAL_BLOCKS.map(({ course, title, at, done }) => ({ course, title, at, done })),
    sources: [],
    inbox: [],
    week: [],
    suggestions: [],
  };
}

async function postCoach(message: string, history: ChatMessage[]): Promise<string> {
  const res = await fetch(`${API_URL}/api/coach`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message,
      context: coachContext(),
      history: history.slice(-8).map(({ role, text }) => ({ role, text })),
      mode: "chat",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<CoachReply> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body.text ?? "";
}

/** Ask Viva: Gemini through the shared backend when reachable, the on-device fallback brain otherwise. */
export async function askViva(message: string, history: ChatMessage[]): Promise<VivaAnswer> {
  try {
    const text = await postCoach(message, history);
    if (text.trim()) return { text, source: "gemini" };
    throw new Error("empty reply");
  } catch {
    return { text: vivaReply(message, { name: PROFILE.name, courses: COURSES }).text, source: "offline" };
  }
}
