"use client";

// Client-side app state. Study actions update a course's features, and the tree re-scores right here
// in the browser: the status is computed on this device and never sent anywhere.
// TODO: also POST each action to /api/events so Tiger has the timeline (inputs only, never the status).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { demo, getProfiles, getTree, type Horizon } from "./data";
import { ACTIONABLE, meta } from "./features";
import type { ClassSeed, CourseSeed, Profile } from "./mock";
import { explain, predict, recourse, type Features, type Tree } from "./tree";

export type Block = { id: string; course: string; title: string; at: string; done: boolean };
type Deltas = { quizzes: number; checkins: number; sessions: number };
type PState = {
  added: CourseSeed[];
  addedClasses: ClassSeed[];
  deltas: Record<string, Deltas>;
  midterm: Record<string, number>;
  blocks: Block[];
  done: Record<string, boolean>;
  checkedIn: Record<string, boolean>;
  chat: { role: "you" | "coach"; text: string }[];
};
type Saved = { profile: string; by: Record<string, PState> };

const KEY = "pathway:v1";
const empty = (): PState => ({ added: [], addedClasses: [], deltas: {}, midterm: {}, blocks: [], done: {}, checkedIn: {}, chat: [] });
const SCHEDULED_CLASSES = 20; // class meetings so far; one check-in moves attendance by ~1/21

export function featuresFor(c: CourseSeed, s: PState): Features {
  const d = s.deltas[c.slug] ?? { quizzes: 0, checkins: 0, sessions: 0 };
  const x: Features = { ...c.x };
  x.practice_quizzes_taken = (x.practice_quizzes_taken ?? 0) + d.quizzes;
  x.attendance_rate = +(((x.attendance_rate ?? 0) * SCHEDULED_CLASSES + d.checkins) / (SCHEDULED_CLASSES + d.checkins)).toFixed(4);
  if (s.midterm[c.slug] != null) x.midterm_score = s.midterm[c.slug];
  return x;
}

export function score(tree: Tree, x: Features) {
  const result = predict(tree, x);
  return { result, steps: explain(tree, result.path, x), rec: result.atRisk ? recourse(tree, x, ACTIONABLE) : null };
}

export type CourseView = CourseSeed & {
  x: Features;
  horizon: Horizon;
  tree: Tree;
  daysToExam: number;
} & ReturnType<typeof score>;

// Calendar days, so Mon → Fri is 4 whatever the time of day.
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysBetween = (a: Date, b: Date) => Math.round((midnight(b) - midnight(a)) / 86_400_000);

function useStore() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [trees, setTrees] = useState<Record<Horizon, Tree>>();
  const [error, setError] = useState<string>();
  // Lazy read is safe: nothing that depends on it renders until the trees load after hydration.
  const [saved, setSaved] = useState<Saved>(() => {
    try {
      const raw = typeof window !== "undefined" && localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { profile: "maya", by: {} };
  });
  const [toast, setToast] = useState<{ id: number; text: string }>();

  useEffect(() => {
    Promise.all([getProfiles(), getTree("early"), getTree("mid")])
      .then(([p, early, mid]) => (setProfiles(p), setTrees({ early, mid })))
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {}
  }, [saved]);

  const profile = profiles.find((p) => p.id === saved.profile) ?? profiles[0];
  const s = (profile && saved.by[profile.id]) ?? empty();

  const view = useCallback(
    (c: CourseSeed, st: PState): CourseView | null => {
      if (!trees) return null;
      const horizon: Horizon = st.midterm[c.slug] != null ? "mid" : "early";
      const x = featuresFor(c, st);
      return { ...c, x, horizon, tree: trees[horizon], daysToExam: daysBetween(demo.now, new Date(c.exam.date)), ...score(trees[horizon], x) };
    },
    [trees],
  );

  const courses = useMemo(
    () => (profile ? [...profile.courses, ...s.added].map((c) => view(c, s)).filter((c): c is CourseView => !!c) : []),
    [profile, s, view],
  );

  const say = (text: string) => setToast({ id: Date.now(), text });
  const update = (fn: (st: PState) => PState) =>
    profile && setSaved((v) => ({ ...v, by: { ...v.by, [profile.id]: fn(v.by[profile.id] ?? empty()) } }));

  // Apply a change to one course's inputs, then tell the student what moved and what the tree says now.
  const bump = (slug: string, key: keyof Deltas, label: string, extra: Partial<PState> = {}) => {
    const c = courses.find((x) => x.slug === slug);
    if (!c || !profile) return;
    const d = s.deltas[slug] ?? { quizzes: 0, checkins: 0, sessions: 0 };
    const next = { ...s, ...extra, deltas: { ...s.deltas, [slug]: { ...d, [key]: d[key] + 1 } } };
    const after = view(c, next)!;
    const f = key === "quizzes" ? "practice_quizzes_taken" : key === "checkins" ? "attendance_rate" : null;
    const moved = f ? ` ${meta(f).label} ${meta(f).fmt(c.x[f])} → ${meta(f).fmt(after.x[f])}.` : "";
    const flip = c.result.atRisk !== after.result.atRisk ? ` ${c.code} is now ${after.result.atRisk ? "worth a check-in" : "on track"}!` : " Status re-checked on this device.";
    update(() => next);
    say(`${label}.${moved}${flip}`);
  };

  return {
    ready: !!trees && !!profile,
    error,
    now: demo.now,
    profiles,
    profile,
    state: s,
    courses,
    toast,
    dismissToast: () => setToast(undefined),
    setProfile: (id: string) => setSaved((v) => ({ ...v, profile: id })),
    reset: () => (setSaved({ profile: saved.profile, by: {} }), say("Demo data reset.")),
    logQuiz: (slug: string) => bump(slug, "quizzes", "Practice quiz logged"),
    logSession: (slug: string) => bump(slug, "sessions", "Study session logged"),
    checkIn: (slug: string, at: string) => {
      bump(slug, "checkins", "Checked in", { checkedIn: { ...s.checkedIn, [at]: true } });
    },
    setMidterm: (slug: string, v: number | null) =>
      update((st) => {
        const midterm = { ...st.midterm };
        if (v == null) delete midterm[slug];
        else midterm[slug] = v;
        return { ...st, midterm };
      }),
    makeReal: (blocks: Omit<Block, "id" | "done">[]) => {
      update((st) => ({ ...st, blocks: [...st.blocks, ...blocks.map((b, i) => ({ ...b, id: `${Date.now()}-${i}`, done: false }))] }));
      say(`${blocks.length} study blocks added to your week.`);
    },
    completeBlock: (b: Block) => {
      bump(b.course, "sessions", "Study block done", { blocks: s.blocks.map((x) => (x.id === b.id ? { ...x, done: true } : x)) });
    },
    toggleTodo: (id: string) => update((st) => ({ ...st, done: { ...st.done, [id]: !st.done[id] } })),
    addJudgeCourse: () => {
      update((st) => (st.added.length ? st : { ...st, added: [demo.judgeCourse], addedClasses: [demo.judgeClass] }));
      say("BIO 181 added from your syllabus.");
    },
    sendChat: (text: string) =>
      update((st) => ({
        ...st,
        chat: [...st.chat, { role: "you", text }, { role: "coach", text: "The coach isn't connected yet. Once it is, it will answer only from your own numbers and the model (POST /api/coach)." }],
      })),
  };
}

const Ctx = createContext<ReturnType<typeof useStore> | null>(null);

export function PathwayProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function usePathway() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePathway must be used inside PathwayProvider");
  return v;
}

export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
