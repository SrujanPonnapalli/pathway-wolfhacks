"use client";

// Client-side app state. Study actions update a course's features, and the tree re-scores right here
// in the browser: the status is computed on this device and never stored by Pathway (in voice mode,
// Viva's spoken words, which can mention it, are voiced by ElevenLabs).
// TODO: also POST each action to /api/events so Tiger has the timeline (inputs only, never the status).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { demo, getProfiles, getState, getTree, isLive, sync, type Horizon } from "./data";
import { ACTIONABLE, meta } from "./features";
import type { ClassSeed, CourseSeed, Profile } from "./mock";
import { explain, predict, recourse, type Features, type Tree } from "./tree";
import { sampleChatSessions, soften, vivaReply, type Action, type ChatSession, type Reply } from "./viva";
import { askCoach, coachContext } from "./api";
import type { Source } from "./intel/coach";
import type { StudyMaterial } from "./intel/study";
import { inboxFor } from "./inbox";
import * as gcal from "./gcal";
import { blocksAsEvents, demoWeek, sourceEvents, suggest, type CalEvent, type Suggestion } from "./schedule";

export type ChatMsg = { role: "you" | "viva"; text: string; actions?: Action[] };
export type { ChatSession };
export type Block = { id: string; course: string; title: string; at: string; done: boolean; googleId?: string };
type Deltas = { quizzes: number; checkins: number; sessions: number };
type PState = {
  added: CourseSeed[];
  addedClasses: ClassSeed[];
  deltas: Record<string, Deltas>;
  midterm: Record<string, number>;
  blocks: Block[];
  done: Record<string, boolean>;
  checkedIn: Record<string, boolean>;
  chat: ChatMsg[];
  chatSessions: ChatSession[];
  activeChatId: string;
  sources: Source[]; // dropped files, parsed by Gemini, kept on this device
  materials: Record<string, StudyMaterial>; // latest slides/notes read per course: Study's quiz and Viva's Teach mode use them
  moved: Record<string, { start: string; end: string }>; // approved moves of demo/Google events
  dismissed: string[]; // suggestion ids the student said "not now" to
  gids: Record<string, string>; // local event id -> Google event id, for everything Pathway wrote to Google
  removed: string[]; // feed events the student deleted in Google Calendar; we stop showing and re-adding them
};
type Saved = { profile: string; by: Record<string, PState> };

const KEY = "pathway:v1";
const empty = (profileId: string = "maya"): PState => {
  const seedSessions = sampleChatSessions(profileId);
  const activeId = `chat-new-${profileId}`;
  const newChat: ChatSession = {
    id: activeId,
    title: "New conversation",
    createdAt: demo.now.toISOString(),
    updatedAt: demo.now.toISOString(),
    messages: [],
  };
  const sessions = [newChat, ...seedSessions];
  return {
    added: [],
    addedClasses: [],
    deltas: {},
    midterm: {},
    blocks: [],
    done: {},
    checkedIn: {},
    chat: [],
    chatSessions: sessions,
    activeChatId: activeId,
    sources: [],
    materials: {},
    moved: {},
    dismissed: [],
    gids: {},
    removed: [],
  };
};
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
  const [vivaThinking, setVivaThinking] = useState(false);

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

  // When the database is reachable, it's the source of truth for a profile's logged activity:
  // pull it on load and on every profile switch (local edits not yet confirmed stay local).
  const hydrate = useCallback((id: string) => {
    getState(id).then((r) => {
      if (!r) return;
      setSaved((v) => {
        const cur = v.by[id] ?? empty(id);
        return { ...v, by: { ...v.by, [id]: { ...cur, deltas: r.deltas, checkedIn: r.checkedIn, blocks: r.blocks, done: r.done, added: [], addedClasses: [] } } };
      });
    });
  }, []);
  const activeId = profiles.length ? (profiles.find((p) => p.id === saved.profile) ?? profiles[0]).id : null;
  useEffect(() => {
    if (activeId) hydrate(activeId);
  }, [activeId, hydrate]);

  const profile = profiles.find((p) => p.id === saved.profile) ?? profiles[0];
  // Older saved state (or a database row) may lack newer fields; merge over a blank state. Memoized so `courses` is stable.
  const s = useMemo<PState>(() => {
    const raw = (profile && saved.by[profile.id]) ?? {};
    const base = empty(profile?.id ?? "maya");

    let sessions: ChatSession[] = raw.chatSessions && raw.chatSessions.length > 0 ? raw.chatSessions : [];
    let activeChatId: string = raw.activeChatId ?? "";

    if (sessions.length === 0) {
      if (raw.chat && raw.chat.length > 0) {
        const legacy: ChatSession = {
          id: `chat-legacy-${profile?.id ?? "default"}`,
          title: raw.chat.find((m: ChatMsg) => m.role === "you")?.text.slice(0, 36) || "Previous check-in",
          createdAt: demo.now.toISOString(),
          updatedAt: demo.now.toISOString(),
          messages: raw.chat,
        };
        sessions = [legacy, ...base.chatSessions.filter((x) => x.id !== legacy.id)];
        activeChatId = legacy.id;
      } else {
        sessions = base.chatSessions;
        activeChatId = sessions[0]?.id ?? `chat-new-${profile?.id ?? "default"}`;
      }
    }

    if (!activeChatId || !sessions.some((x) => x.id === activeChatId)) {
      activeChatId = sessions[0]?.id ?? `chat-new-${profile?.id ?? "default"}`;
    }

    const activeSession = sessions.find((x) => x.id === activeChatId);
    const activeMessages = activeSession?.messages ?? (raw.chat ?? []);

    return {
      ...base,
      ...raw,
      chatSessions: sessions,
      activeChatId,
      chat: activeMessages,
    };
  }, [profile, saved]);

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
    () =>
      profile
        ? [...profile.courses, ...s.added.filter((a) => !profile.courses.some((c) => c.slug === a.slug))]
            .map((c) => view(c, s))
            .filter((c): c is CourseView => !!c)
        : [],
    [profile, s, view],
  );

  // ---- calendar. Local feed = classes, exams and due dates (from Moodle; demo data here) plus
  // Pathway study blocks. Google Calendar, once connected, becomes the working copy: everything
  // local is written there once (tracked in gids), and approved changes are written back.
  const [googleEvents, setGoogleEvents] = useState<CalEvent[]>([]);
  // Lazy init is safe here for the same reason as `saved` above; nothing renders before the trees load.
  const [googleOn, setGoogleOn] = useState(false);
  const [googleWho, setGoogleWho] = useState<{ email: string; name: string } | null>(null);
  const [googleShared, setGoogleShared] = useState(false);
  useEffect(() => {
    gcal.init().then(async (on) => {
      setGoogleOn(on);
      setGoogleShared(gcal.isShared());
      if (on) setGoogleWho(await gcal.whoAmI().catch(() => null));
    });
  }, []);
  const monday = useMemo(() => new Date(demo.now.getFullYear(), demo.now.getMonth(), demo.now.getDate() - ((demo.now.getDay() + 6) % 7)), []);

  const localEvents = useMemo<CalEvent[]>(() => {
    if (!profile) return [];
    const feed = [...demoWeek(demo.now, courses, profile.todos), ...sourceEvents(s.sources, courses, demo.now)];
    const base = [...feed, ...blocksAsEvents(s.blocks)].filter((e) => !s.removed.includes(e.id));
    return base.map((e) => (s.moved[e.id] ? { ...e, ...s.moved[e.id] } : e));
  }, [profile, courses, s.blocks, s.moved, s.sources, s.removed]);
  // Google copies of things we already render locally are skipped (they carry a Pathway tag).
  const events = useMemo<CalEvent[]>(() => {
    const localIds = new Set(localEvents.map((e) => e.id));
    return [...localEvents, ...googleEvents.filter((g) => !g.localId || !localIds.has(g.localId))];
  }, [localEvents, googleEvents]);
  /** Study blocks in the shared calendar that this browser did not create: treat them as part of the plan. */
  const sharedBlocks = useMemo<Block[]>(() => {
    const local = new Set(s.blocks.map((b) => b.id));
    return googleEvents
      .filter((g) => g.localId && g.kind === "study" && !local.has(g.localId))
      .map((g) => ({ id: g.localId!, course: courses.find((c) => g.title.startsWith(c.code))?.slug ?? "", title: g.title, at: g.start, done: false, googleId: g.id.slice(2) }));
  }, [googleEvents, s.blocks, courses]);
  const allBlocks = useMemo<Block[]>(() => [...s.blocks, ...sharedBlocks], [s.blocks, sharedBlocks]);
  /** Google's id for one of our events: from Google's own tag first (shared calendar, any visitor), then this browser's map. */
  const gidFor = (localId: string) => googleEvents.find((g) => g.localId === localId)?.id.slice(2) ?? s.gids[localId] ?? s.blocks.find((b) => b.id === localId)?.googleId;
  const suggestions = useMemo<Suggestion[]>(
    () => suggest(events, demo.now, courses.map((c) => ({ slug: c.slug, code: c.code, exam: c.exam, atRisk: c.result.atRisk }))).filter((x) => !s.dismissed.includes(x.id)),
    [events, courses, s.dismissed],
  );

  const say = (text: string) => setToast({ id: Date.now(), text });
  const update = (fn: (st: PState) => PState) =>
    profile && setSaved((v) => ({ ...v, by: { ...v.by, [profile.id]: fn({ ...empty(profile.id), ...(v.by[profile.id] ?? {}) }) } }));

  const [notices, setNotices] = useState<{ id: number; text: string }[]>([]);
  const prevGoogle = useRef<Map<string, CalEvent> | null>(null);
  const touched = useRef<Map<string, string>>(new Map()); // google id -> start we wrote; a matching start is our own change, not news
  const TOUCHED = "pathway:gcal-touched";
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(TOUCHED);
      if (raw) touched.current = new Map(Object.entries(JSON.parse(raw)));
    } catch {}
  }, []);
  const markTouched = (gid: string, start: string) => {
    touched.current.set(gid, start.slice(0, 16));
    try {
      sessionStorage.setItem(TOUCHED, JSON.stringify(Object.fromEntries(touched.current)));
    } catch {}
  };
  const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  const notice = (text: string) => {
    setNotices((n) => [{ id: Date.now() + Math.random(), text }, ...n].slice(0, 5));
    say(text);
  };
  const ours = (gid: string, start: string) => touched.current.get(gid) === start.slice(0, 16);
  // 1. Diff Google against the last poll: anything moved, added or removed there gets a notice.
  // 2. For our own tagged events, pull Google's version into local state so the week matches.
  const SEEN = "pathway:gcal-seen";
  const reconcile = (fromGoogle: CalEvent[]) => {
    if (!prevGoogle.current) {
      try {
        const raw = sessionStorage.getItem(SEEN);
        if (raw) prevGoogle.current = new Map((JSON.parse(raw) as CalEvent[]).map((g) => [g.id, g]));
      } catch {}
    }
    const prev = prevGoogle.current;
    const cur = new Map(fromGoogle.map((g) => [g.id, g]));
    try {
      sessionStorage.setItem(SEEN, JSON.stringify(fromGoogle));
    } catch {}
    if (prev) {
      for (const [id, g] of cur) {
        const was = prev.get(id);
        if (ours(id.slice(2), g.start)) continue;
        if (!was) notice(`Heads up: "${g.title}" was added in Google Calendar for ${fmtWhen(g.start)}.`);
        else if (was.start.slice(0, 16) !== g.start.slice(0, 16)) notice(`Heads up: "${g.title}" moved to ${fmtWhen(g.start)} in Google Calendar. Your week is updated.`);
      }
      for (const [id, was] of prev) if (!cur.has(id) && !ours(id.slice(2), "")) notice(`Heads up: "${was.title}" was removed in Google Calendar. Taking it off your week.`);
    }
    prevGoogle.current = cur;
    // local state follows Google for our tagged events
    const byLocal = new Map(fromGoogle.filter((g) => g.localId).map((g) => [g.localId!, g]));
    for (const e of localEvents) {
      const g = byLocal.get(e.id);
      if (g) {
        if (g.start.slice(0, 16) !== e.start.slice(0, 16)) {
          if (s.blocks.some((b) => b.id === e.id)) update((st) => ({ ...st, blocks: st.blocks.map((b) => (b.id === e.id ? { ...b, at: g.start } : b)) }));
          else update((st) => ({ ...st, moved: { ...st.moved, [e.id]: { start: g.start, end: g.end } } }));
        }
      } else if (prev && [...prev.values()].some((p) => p.localId === e.id)) {
        // it was in Google last poll and is gone now: someone deleted it there
        if (s.blocks.some((b) => b.id === e.id)) update((st) => ({ ...st, blocks: st.blocks.filter((b) => b.id !== e.id) }));
        else update((st) => ({ ...st, removed: [...st.removed, e.id] }));
        update((st) => {
          const gids = { ...st.gids };
          delete gids[e.id];
          return { ...st, gids };
        });
      }
    }
  };
  // Write every local event Google does not have yet. Idempotent: gids remembers what was written.
  const syncing = useRef(false);
  const syncAll = async (): Promise<number> => {
    if (!gcal.isConnected() || syncing.current) return 0;
    syncing.current = true;
    let n = 0;
    try {
      const have: Record<string, string> = { ...s.gids };
      for (const b of s.blocks) if (b.googleId && !have[b.id]) have[b.id] = b.googleId;
      // what Google already holds (tagged by Pathway), fetched fresh so two visitors never double-write
      const fresh = await gcal.listWeek(monday);
      setGoogleEvents(fresh);
      reconcile(fresh); // keeps the diff baseline current so our own writes below stay silent later
      for (const g of fresh) if (g.localId) have[g.localId] = g.id.slice(2);
      const horizon = new Date(monday);
      horizon.setDate(monday.getDate() + 14);
      for (const e of localEvents) {
        if (have[e.id]) continue;
        if (new Date(e.start) < monday || new Date(e.start) >= horizon) continue;
        if (e.kind === "study" && s.blocks.find((b) => b.id === e.id)?.done) continue;
        const tag = e.source === "pathway" ? "Planned in Pathway" : "From Moodle via Pathway";
        const id = await gcal.insert({ title: e.title, start: e.start, end: e.end }, `${tag}\nPathway:${e.id}`);
        have[e.id] = id;
        markTouched(id, e.start);
        n++;
        update((st) => ({ ...st, gids: { ...st.gids, [e.id]: id } }));
      }
    } catch (e) {
      say(`Google Calendar said: ${(e as Error).message}`);
    } finally {
      syncing.current = false;
    }
    if (n) {
      const after = await gcal.listWeek(monday).catch(() => null);
      if (after) {
        setGoogleEvents(after);
        reconcile(after);
      }
    }
    return n;
  };
  const refreshGoogle = async () => {
    if (!gcal.isConnected()) return;
    const list = await gcal.listWeek(monday);
    setGoogleEvents(list);
    reconcile(list);
  };
  // Watch Google while connected: every 45 s and whenever the tab regains focus.
  const refreshRef = useRef(refreshGoogle);
  useEffect(() => {
    refreshRef.current = refreshGoogle;
  });
  useEffect(() => {
    if (!googleOn) return;
    const tick = () => void refreshRef.current().catch(() => {});
    tick(); // first fetch as soon as the calendar is known to be connected
    const id = setInterval(tick, 20_000);
    const onFocus = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [googleOn]);
  // Keep Google current while connected: whenever local events change, write the new ones.
  const localKey = localEvents.map((e) => e.id).join("|");
  const syncRef = useRef(syncAll);
  useEffect(() => {
    syncRef.current = syncAll;
  });
  useEffect(() => {
    if (!googleOn || !profile) return;
    // Defer a tick so the write happens after render, as an external-system sync.
    const t = setTimeout(() => void syncRef.current(), 0);
    return () => clearTimeout(t);
  }, [googleOn, localKey, profile]);


  // Apply a change to one course's inputs, then tell the student what moved and what the tree says now.
  const bump = (slug: string, key: keyof Deltas, label: string, extra: Partial<PState> = {}, event?: Parameters<typeof sync.event>[2]) => {
    const c = courses.find((x) => x.slug === slug);
    if (!c || !profile) return;
    if (event) sync.event(profile.id, slug, event);
    const d = s.deltas[slug] ?? { quizzes: 0, checkins: 0, sessions: 0 };
    const next = { ...s, ...extra, deltas: { ...s.deltas, [slug]: { ...d, [key]: d[key] + 1 } } };
    const after = view(c, next)!;
    const f = key === "quizzes" ? "practice_quizzes_taken" : key === "checkins" ? "attendance_rate" : null;
    const moved = f ? ` ${meta(f).label} ${meta(f).fmt(c.x[f])} → ${meta(f).fmt(after.x[f])}.` : "";
    const flip = c.result.atRisk !== after.result.atRisk ? ` ${c.code} is now ${after.result.atRisk ? "worth a check-in" : "on track"}!` : " Status re-checked on this device.";
    update(() => next);
    say(`${label}.${moved}${flip}`);
  };

  // One Gemini-backed coaching turn, shared by chat and voice so they can't diverge: same
  // context (courses, to-dos, blocks, sources, inbox, week, suggestions), same history, same
  // answer. The local mock replies only when /api/coach can't be reached, and the console
  // says which brain answered.
  const coachTurn = async (text: string): Promise<Reply & { via: "gemini" | "local" }> => {
    try {
      const ctx = coachContext({
        now: demo.now,
        studentName: profile?.sample ? profile.name ?? "" : "",
        courses,
        todos: profile?.todos ?? [],
        blocks: s.blocks,
        sources: s.sources,
        inbox: inboxFor(courses.map((c) => c.code)).map((m) => ({ from: m.from, subject: m.subject, course: m.course, snippet: m.snippet })),
        week: events.map((e) => ({ title: e.title, start: e.start, end: e.end, kind: e.kind })),
        suggestions: suggestions.map((x) => ({ title: x.title, why: x.why })),
      });
      // Voice appends the student's turn before calling this; don't send it twice.
      const history = s.chat[s.chat.length - 1]?.role === "you" && s.chat[s.chat.length - 1].text === text ? s.chat.slice(0, -1) : s.chat;
      const r = await askCoach(text, ctx, history);
      if (!r.text.trim()) throw new Error("empty reply");
      console.info(`[viva] Gemini answered in ${r.ms}ms${r.filtered ? " (filtered)" : ""}`);
      return { text: soften(r.text), actions: [], via: "gemini" };
    } catch (e) {
      console.warn("[viva] /api/coach unavailable, using the local fallback brain:", (e as Error).message);
      return { ...vivaReply(text, { name: profile?.sample ? profile.name : undefined, courses }), via: "local" };
    }
  };

  return {
    ready: !!trees && !!profile,
    error,
    now: demo.now,
    profiles,
    profile,
    state: { ...s, blocks: allBlocks },
    courses,
    toast,
    dismissToast: () => setToast(undefined),
    setProfile: (id: string) => setSaved((v) => ({ ...v, profile: id })),
    reset: async () => {
      setSaved((v) => ({ ...v, by: { ...v.by, [profile.id]: empty(profile.id) } }));
      await sync.reset(profile.id);
      if (isLive()) {
        setProfiles(await getProfiles());
        hydrate(profile.id);
      }
      say("Demo data reset.");
    },
    logQuiz: (slug: string) => bump(slug, "quizzes", "Practice quiz logged", {}, { kind: "quiz", minutes: 5 }),
    logSession: (slug: string) => bump(slug, "sessions", "Study session logged", {}, { kind: "study", minutes: 25 }),
    // A finished Teach session counts as a practice quiz (the database counts only kind "quiz" as one,
    // so hydrating keeps it); meta marks where it came from and the score rides along.
    logTeach: (slug: string, topic: string, clear: number, total: number) =>
      bump(slug, "quizzes", `You taught Viva ${topic}`, {}, { kind: "quiz", minutes: 5, score: Math.round((clear / total) * 100), meta: { via: "teach", topic, clear, total } }),
    saveMaterial: (slug: string, m: StudyMaterial) => update((st) => ({ ...st, materials: { ...st.materials, [slug]: m } })),
    checkIn: (slug: string, at: string) => {
      bump(slug, "checkins", "Checked in", { checkedIn: { ...s.checkedIn, [at]: true } }, { kind: "check_in", meta: { class_at: at } });
    },
    setMidterm: (slug: string, v: number | null) =>
      update((st) => {
        const midterm = { ...st.midterm };
        if (v == null) delete midterm[slug];
        else midterm[slug] = v;
        return { ...st, midterm };
      }),
    makeReal: (blocks: Omit<Block, "id" | "done">[]) => {
      const made = blocks.map((b, i) => ({ ...b, id: `${Date.now()}-${i}`, done: false }));
      update((st) => ({ ...st, blocks: [...st.blocks, ...made] }));
      sync.blocks(profile.id, made);
      say(gcal.isConnected() ? `${blocks.length} study blocks added to your week and your Google Calendar.` : `${blocks.length} study blocks added to your week.`);
    },
    completeBlock: (b: Block) => {
      sync.blockDone(profile.id, b.id, true);
      const mine = s.blocks.some((x) => x.id === b.id);
      const blocks = mine ? s.blocks.map((x) => (x.id === b.id ? { ...x, done: true } : x)) : [...s.blocks, { ...b, done: true }];
      bump(b.course, "sessions", "Study block done", { blocks }, { kind: "study", minutes: 45 });
    },
    toggleTodo: (id: string) => {
      sync.todo(profile.id, id, !s.done[id]);
      update((st) => ({ ...st, done: { ...st.done, [id]: !st.done[id] } }));
    },
    addJudgeCourse: async () => {
      update((st) => (st.added.length ? st : { ...st, added: [demo.judgeCourse], addedClasses: [demo.judgeClass] }));
      say("BIO 181 added from your syllabus.");
      await sync.addJudgeCourse();
      if (isLive()) setProfiles(await getProfiles());
    },
    events,
    suggestions,
    notices,
    dismissNotice: (id: number) => setNotices((n) => n.filter((x) => x.id !== id)),
    googleOn,
    googleWho,
    googleShared,
    connectGoogle: async () => {
      await gcal.connect();
      setGoogleOn(true);
      setGoogleWho(await gcal.whoAmI().catch(() => null));
      await refreshGoogle();
      const n = await syncAll();
      say(n ? `Google Calendar connected. ${n} events added: classes, exams, due dates and study blocks.` : "Google Calendar connected.");
    },
    disconnectGoogle: () => {
      gcal.disconnect();
      setGoogleOn(false);
      setGoogleWho(null);
      setGoogleEvents([]);
    },
    refreshGoogle,
    // Pull fresh data from every source: profiles/courses, logged activity, Google Calendar.
    refresh: async () => {
      const p = await getProfiles().catch(() => null);
      if (p) setProfiles(p);
      if (profile) hydrate(profile.id);
      if (gcal.isConnected()) await refreshGoogle().catch(() => {});
      say("Everything's up to date.");
    },
    dismissSuggestion: (id: string) => update((st) => ({ ...st, dismissed: [...st.dismissed, id] })),
    // The student approved a change: apply it here, and in Google Calendar when that event lives there.
    approveSuggestion: async (sg: Suggestion) => {
      let googleErr = "";
      for (const op of sg.ops) {
        if (op.op === "move") {
          if (s.blocks.some((b) => b.id === op.id)) update((st) => ({ ...st, blocks: st.blocks.map((b) => (b.id === op.id ? { ...b, at: op.start } : b)) }));
          else update((st) => ({ ...st, moved: { ...st.moved, [op.id]: { start: op.start, end: op.end } } }));
          const gid = op.id.startsWith("g-") ? op.id.slice(2) : gidFor(op.id);
          if (gid && gcal.isConnected()) {
            markTouched(gid, op.start);
            await gcal.move(gid, op.start, op.end).catch((e) => (googleErr = e.message));
          }
        } else {
          const b: Block = { id: op.event.id, course: op.event.course ?? "", title: op.event.title, at: op.event.start, done: false };
          update((st) => ({ ...st, blocks: [...st.blocks, b] })); // the sync effect writes it to Google
        }
      }
      update((st) => ({ ...st, dismissed: [...st.dismissed, sg.id] }));
      say(googleErr ? `Changed here. Google Calendar said: ${googleErr}` : gcal.isConnected() ? "Done, here and in your Google Calendar." : "Done. Your week is updated.");
    },
    addSource: (src: Source) => {
      update((st) => ({ ...st, sources: [...st.sources.filter((x) => !(x.kind === src.kind && x.course === src.course && x.title === src.title)), src] }));
      const dated = src.kind === "syllabus" ? src.deadlines.filter((d) => d.date).length : 0;
      say(dated ? `${src.title} filed under ${src.course}: ${dated} dates added to your week${gcal.isConnected() ? " and Google Calendar" : ""}.` : `${src.title} filed under ${src.course}. Viva can use it now.`);
    },
    removeSource: (i: number) => update((st) => ({ ...st, sources: st.sources.filter((_, j) => j !== i) })),
    vivaThinking,
    coachTurn,
    chatSessions: s.chatSessions,
    activeChatId: s.activeChatId,
    activeChat: s.chatSessions.find((x) => x.id === s.activeChatId) ?? s.chatSessions[0],
    startNewChat: () => {
      const newId = `chat-${Date.now()}`;
      const newSession: ChatSession = {
        id: newId,
        title: "New conversation",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      update((st) => ({
        ...st,
        chatSessions: [newSession, ...(st.chatSessions ?? [])],
        activeChatId: newId,
        chat: [],
      }));
      return newId;
    },
    selectChat: (id: string) => {
      update((st) => {
        const target = st.chatSessions?.find((x) => x.id === id);
        if (!target) return st;
        return {
          ...st,
          activeChatId: id,
          chat: target.messages,
        };
      });
    },
    deleteChat: (id: string) => {
      update((st) => {
        const current = st.chatSessions ?? [];
        const nextSessions = current.filter((x) => x.id !== id);
        let nextActiveId = st.activeChatId;
        let nextMessages = st.chat;

        if (st.activeChatId === id) {
          if (nextSessions.length > 0) {
            nextActiveId = nextSessions[0].id;
            nextMessages = nextSessions[0].messages;
          } else {
            const freshId = `chat-${Date.now()}`;
            const freshSession: ChatSession = {
              id: freshId,
              title: "New conversation",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messages: [],
            };
            nextSessions.push(freshSession);
            nextActiveId = freshId;
            nextMessages = [];
          }
        }

        return {
          ...st,
          chatSessions: nextSessions,
          activeChatId: nextActiveId,
          chat: nextMessages,
        };
      });
      say("Conversation deleted.");
    },
    // File a finished conversation (a Teach session) in Previous chats without switching to it.
    archiveChat: (title: string, messages: ChatMsg[]) => {
      if (!messages.length) return;
      const at = new Date().toISOString();
      update((st) => ({ ...st, chatSessions: [{ id: `chat-${Date.now()}`, title, createdAt: at, updatedAt: at, messages }, ...(st.chatSessions ?? [])] }));
    },
    reply: (text: string) => vivaReply(text, { name: profile?.sample ? profile.name : undefined, courses }),
    addTurn: (m: ChatMsg) =>
      update((st) => {
        const sessions = st.chatSessions ?? [];
        const activeId = st.activeChatId || sessions[0]?.id || `chat-${Date.now()}`;
        const active = sessions.find((s) => s.id === activeId) ?? {
          id: activeId,
          title: "New conversation",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
        };
        const nextMessages = [...active.messages, m];
        const nextTitle =
          active.title === "New conversation" && m.role === "you"
            ? (m.text.slice(0, 36) + (m.text.length > 36 ? "…" : ""))
            : active.title;
        const updatedSession: ChatSession = { ...active, title: nextTitle, updatedAt: new Date().toISOString(), messages: nextMessages };
        const nextSessions = sessions.some((s) => s.id === activeId)
          ? sessions.map((s) => (s.id === activeId ? updatedSession : s))
          : [updatedSession, ...sessions];
        return {
          ...st,
          chatSessions: nextSessions,
          activeChatId: activeId,
          chat: nextMessages,
        };
      }),
    // Chat mode: show the question, run the shared Gemini coach, then append Viva's turn.
    // If the coach route is down the local fallback answers so the page never goes silent.
    ask: async (text: string) => {
      const local = vivaReply(text, { name: profile?.sample ? profile.name : undefined, courses });
      const userMsg: ChatMsg = { role: "you", text };

      update((st) => {
        const sessions = st.chatSessions ?? [];
        const activeId = st.activeChatId || sessions[0]?.id || `chat-${Date.now()}`;
        const active = sessions.find((s) => s.id === activeId) ?? {
          id: activeId,
          title: "New conversation",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
        };
        const nextMessages = [...active.messages, userMsg];
        const nextTitle =
          active.title === "New conversation"
            ? (text.slice(0, 36) + (text.length > 36 ? "…" : ""))
            : active.title;
        const updatedSession: ChatSession = { ...active, title: nextTitle, updatedAt: new Date().toISOString(), messages: nextMessages };
        const nextSessions = sessions.some((s) => s.id === activeId)
          ? sessions.map((s) => (s.id === activeId ? updatedSession : s))
          : [updatedSession, ...sessions];
        return {
          ...st,
          chatSessions: nextSessions,
          activeChatId: activeId,
          chat: nextMessages,
        };
      });

      setVivaThinking(true);
      const r = await coachTurn(text);
      setVivaThinking(false);
      const vivaMsg: ChatMsg = { role: "viva", text: r.text, actions: local.actions };
      update((st) => {
        const sessions = st.chatSessions ?? [];
        const activeId = st.activeChatId || sessions[0]?.id || `chat-${Date.now()}`;
        const active = sessions.find((s) => s.id === activeId);
        if (!active) return { ...st, chat: [...st.chat, vivaMsg] };
        const nextMessages = [...active.messages, vivaMsg];
        const updatedSession: ChatSession = { ...active, updatedAt: new Date().toISOString(), messages: nextMessages };
        return {
          ...st,
          chatSessions: sessions.map((s) => (s.id === activeId ? updatedSession : s)),
          chat: nextMessages,
        };
      });
    },
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
