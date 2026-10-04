"use client";

// Client-side app state. Study actions update a course's features, and the tree re-scores right here
// in the browser: the status is computed on this device and never stored by Pathway (in voice mode,
// Viva's spoken words, which can mention it, are voiced by ElevenLabs).
// TODO: also POST each action to /api/events so Tiger has the timeline (inputs only, never the status).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { demo, getProfiles, getState, getTree, isLive, sync, type Horizon } from "./data";
import { ACTIONABLE, meta, moveText, reasonFor as reasonForSteps } from "./features";
import type { ClassSeed, CourseSeed, Profile } from "./mock";
import { explain, predict, recourse, type Features, type Tree } from "./tree";
import { sampleChatSessions, soften, vivaReply, type Action, type ChatMessage, type ChatSession, type Citation, type EmailDraft, type Reply } from "./viva";
import { askAgent, askCoach, coachContext } from "./api";
import type { AgentAction } from "./intel/agent";
import { compileContext, scopeFor } from "./knowledge/compile";
import { dropSource, ingestFile, legacySources, merge, reassign, setReview as reviewLocal, summary as ingestSummary, type DoneEvent } from "./knowledge/client";
import { emptyKnowledge, type IngestEvent, type KbNode, type Knowledge, type Review } from "./knowledge/types";
import { nodeId } from "./knowledge/nodes";
import { SAMPLE_VERSION, isSampleSource, retireSuperseded, sampleKnowledge } from "./knowledge/sample";
import { planBlocks } from "./plan";
import type { Source } from "./intel/coach";
import type { StudyMaterial } from "./intel/study";
import { inboxFor } from "./inbox";
import * as gcal from "./gcal";
import { blocksAsEvents, demoWeek, freeSlot, localIso, sourceEvents, suggest, type CalEvent, type Suggestion } from "./schedule";
import { pickExcerpts } from "./knowledge/excerpts";
import { docsFor } from "./knowledge/sample";
import type { Proposal } from "./intel/planner";
import ROWS from "./rows.json";

export type ChatMsg = ChatMessage;
export type { ChatSession };
export type Block = { id: string; course: string; title: string; at: string; done: boolean; googleId?: string; minutes?: number };
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
  notes: string[]; // (older) facts the student told Viva; now stored as preference nodes in `knowledge`
  knowledge: Knowledge; // the course knowledge graph: files, facts with provenance, links. Local-first; Tiger when configured
  seeded: string; // which seed file filled `knowledge` (so the demo profile starts full without uploads)
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
    notes: [],
    knowledge: emptyKnowledge(),
    seeded: "",
  };
};
const SCHEDULED_CLASSES = 20; // class meetings so far; one check-in moves attendance by ~1/21

const COURSE_FLAGS = ["BIO 181", "CH 101", "CSC 216", "EC 201", "ECE 200", "MA 241", "PY 205", "ST 311"];
const YEAR_ORD: Record<string, number> = { Freshman: 1, Sophomore: 2, Junior: 3, Senior: 4 };

// The full feature vector the notebook's trees expect: the dataset row behind this course fills in
// what the profile doesn't set (sleep, quiz average, class year...), the profile's own numbers win,
// then everything the student did in the app moves the numbers.
export function featuresFor(c: CourseSeed, s: PState, classYear = ""): Features {
  const d = s.deltas[c.slug] ?? { quizzes: 0, checkins: 0, sessions: 0 };
  const rows = ROWS as Record<string, Features>;
  const x: Features = { ...rows._median, ...(rows[c.row] ?? {}), ...c.x };
  for (const code of COURSE_FLAGS) x[`course_${code.replace(" ", "_")}`] = code === c.code ? 1 : 0;
  if (YEAR_ORD[classYear]) x.class_year_ord = YEAR_ORD[classYear];
  x.work_hours_missing = 0;
  x.sleep_missing = 0;
  // A dropped Gradescope/Moodle grade page is the real record: it overrides the seeded
  // deadline features for that course, so the tree re-scores on evidence.
  const grades = (s.sources ?? []).find((src) => src.kind === "grades" && src.course === c.code);
  if (grades && grades.kind === "grades") {
    const past = grades.items.filter((it) => it.due && new Date(`${it.due}T23:59:00`) < new Date(demo.now));
    if (past.length) {
      const missed = past.filter((it) => it.status === "missing" || it.status === "not_submitted").length; // past-due only: `past` is filtered above
      x.missed_deadlines = missed;
      x.on_time_submission_rate = +((past.length - missed) / past.length).toFixed(4);
    }
  }
  x.practice_quizzes_taken = (x.practice_quizzes_taken ?? 0) + d.quizzes;
  x.study_sessions_logged = (x.study_sessions_logged ?? 0) + d.sessions;
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

  // Every profile arrives already knowing its courses: syllabus, gradebook and lecture files as
  // graph facts, built in code from src/lib/coursework-data.ts (src/lib/knowledge/sample.ts). No
  // upload is needed. The seed is replaced when the sample content changes or a course is added
  // (the judge's onboarding); files the student dropped themselves are kept.
  const seedCourses = useMemo(() => {
    const p = profiles.find((x) => x.id === activeId);
    return p ? [...p.courses, ...((saved.by[p.id]?.added ?? []).filter((a) => !p.courses.some((c) => c.slug === a.slug)))] : [];
  }, [profiles, activeId, saved]);
  const seedStamp = activeId ? `${SAMPLE_VERSION}|${seedCourses.map((c) => c.code).sort().join(",")}` : "";
  const seedKey = activeId ? `${activeId}:${saved.by[activeId]?.seeded ?? ""}:${seedStamp}` : "";
  useEffect(() => {
    if (!activeId || !seedStamp) return;
    if ((saved.by[activeId]?.seeded ?? "") === seedStamp) return;
    const t = setTimeout(() => setSaved((v) => {
      const st = { ...empty(activeId), ...(v.by[activeId] ?? {}) };
      if (st.seeded === seedStamp) return v;
      const sample = sampleKnowledge(activeId, seedCourses, demo.now);
      // Keep the student's own files and facts; a seed from before the in-code samples is replaced whole.
      const fresh = st.seeded && !st.seeded.startsWith(SAMPLE_VERSION) && !st.seeded.startsWith("coursework-");
      const keepSources = fresh ? [] : st.knowledge.sources.filter((x) => !isSampleSource(x));
      const keepIds = new Set(keepSources.map((x) => x.id));
      const keepNodes = fresh ? [] : st.knowledge.nodes.filter((n) => (n.source ? keepIds.has(n.source) : n.createdBy !== "seed"));
      const nodeIds = new Set(keepNodes.map((n) => n.id));
      const keepEdges = fresh ? [] : st.knowledge.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
      const kb = retireSuperseded(merge({ sources: keepSources, nodes: keepNodes, edges: keepEdges }, sample));
      return { ...v, by: { ...v.by, [activeId]: { ...st, knowledge: kb, sources: legacySources(kb), seeded: seedStamp } } };
    }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

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
      const x = featuresFor(c, st, profile?.classYear);
      return { ...c, x, horizon, tree: trees[horizon], daysToExam: daysBetween(demo.now, new Date(c.exam.date)), ...score(trees[horizon], x) };
    },
    [trees, profile],
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
  const isAccount = !!profile?.account;
  useEffect(() => {
    gcal.init(isAccount).then(async (on) => {
      setGoogleOn(on);
      setGoogleShared(gcal.isShared());
      setGoogleWho(on ? await gcal.whoAmI().catch(() => null) : null);
    });
  }, [isAccount]);
  const monday = useMemo(() => new Date(demo.now.getFullYear(), demo.now.getMonth(), demo.now.getDate() - ((demo.now.getDay() + 6) % 7)), []);

  const localEvents = useMemo<CalEvent[]>(() => {
    if (!profile) return [];
    const demoFeed = demoWeek(demo.now, courses, profile.todos);
    const feed = [...demoFeed, ...sourceEvents(s.sources, courses, demo.now, demoFeed)];
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
  /** Same, but asks Google directly when the local copy is not loaded yet (e.g. a drag right after page load). */
  const gidForSure = async (localId: string) => {
    const known = gidFor(localId);
    if (known || !gcal.isConnected()) return known;
    const fresh = await gcal.listWeek(monday).catch(() => [] as CalEvent[]);
    return fresh.find((g) => g.localId === localId)?.id.slice(2);
  };
  const ruleSuggestions = useMemo<Suggestion[]>(
    () => suggest(events, demo.now, courses.map((c) => ({ slug: c.slug, code: c.code, exam: c.exam, atRisk: c.result.atRisk }))).filter((x) => !s.dismissed.includes(x.id)),
    [events, courses, s.dismissed],
  );

  // ---- the planner: Gemini proposes changes only when the context changes (hash), one call per change,
  // cached per hash, so dragging events around costs nothing and new mail or a new syllabus costs one call.
  const [aiProposals, setAiProposals] = useState<Proposal[]>([]);
  const inbox = useMemo(() => (profile ? inboxFor(courses.map((c) => c.code)) : []), [profile, courses]);
  const planKey = useMemo(() => {
    if (!profile || courses.length === 0) return "";
    const parts = [
      profile.id,
      courses.map((c) => `${c.slug}:${c.result.atRisk ? 1 : 0}`).join(","),
      s.sources.map((x) => `${x.kind}:${x.course}:${x.title}`).join("|"),
      inbox.map((m) => m.id).join(","),
      [...new Set(events.map((e) => e.title))].sort().join("|"),
      ruleSuggestions.map((x) => x.id).join(","),
    ];
    let h = 0;
    for (const ch of parts.join("#")) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return `${profile.id}:${h}`;
  }, [profile, courses, s.sources, inbox, events, ruleSuggestions]);
  const planSeq = useRef(0);
  useEffect(() => {
    if (!planKey) return;
    const seq = ++planSeq.current; // a newer context cancels this one; a stale answer is dropped
    const t = setTimeout(async () => {
      try {
        const cached = localStorage.getItem(`pathway:plan:${planKey}`);
        if (cached) {
          setAiProposals(JSON.parse(cached));
          return;
        }
        const r = await fetch("/api/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            now: demo.now.toISOString(),
            courses: courses.map((c) => ({ slug: c.slug, code: c.code, status: c.result.atRisk ? "check_in" : "on_track", reason: reasonForSteps(c.steps), exam: c.exam, recourse: c.rec ? c.rec.moves.map(moveText).join("; ") : "" })),
            week: events.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, kind: e.kind, course: e.course })),
            dueSoon: events.filter((e) => e.title.startsWith("Due:")).map((e) => ({ title: e.title.slice(5), date: e.start, course: e.course ?? "", status: "not_submitted" })),
            inbox: inbox.slice(0, 6).map((m) => ({ from: m.from, subject: m.subject, snippet: m.snippet, course: m.course })),
            policies: s.sources.filter((x) => x.kind === "syllabus").map((x) => ({ course: x.course, late_work: x.kind === "syllabus" ? x.policies.late_work ?? "" : "" })),
            existingSuggestions: [...ruleSuggestions.map((x) => x.title), ...aiProposals.filter((x) => s.dismissed.includes(x.id)).map((x) => x.title)],
          }),
        });
        const j = await r.json();
        if (seq !== planSeq.current) return;
        const proposals: Proposal[] = r.ok ? j.proposals ?? [] : [];
        try {
          localStorage.setItem(`pathway:plan:${planKey}`, JSON.stringify(proposals));
        } catch {}
        setAiProposals(proposals);
      } catch {
        /* planner is optional; the rules still run */
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const fromAi: Suggestion[] = aiProposals
      .filter((p) => !s.dismissed.includes(p.id))
      .map((p) => ({
        id: p.id,
        title: p.title,
        why: `${p.why} (Viva)`,
        ops: p.ops.map((o) =>
          o.op === "move"
            ? { op: "move" as const, id: o.id, start: o.start, end: o.end }
            : { op: "add" as const, event: { id: `add-${p.id}-${o.start}`, title: o.title, start: o.start, end: o.end, kind: o.kind === "study" ? ("study" as const) : ("other" as const), course: courses.find((c) => c.slug === o.course || c.code === o.course)?.slug, source: "pathway" as const } },
        ),
      }));
    return [...ruleSuggestions, ...fromAi];
  }, [ruleSuggestions, aiProposals, s.dismissed, courses]);

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


  // Advisor note (one Gemini call): status + reason + the change set, in the student's voice. Nothing is
  // sent; the student copies it or opens their mail app with it.
  const draftAdvisorNote = async (slug: string, moves: { feature: string; from: number; to: number }[]) => {
    const c = courses.find((x) => x.slug === slug);
    if (!c) throw new Error("course not found");
    const ctx = coachContext({
      now: demo.now,
      studentName: profile?.sample ? profile.name ?? "" : "",
      courses: [c],
      todos: [],
      blocks: s.blocks.filter((b) => b.course === slug),
      sources: s.sources.filter((x) => x.course === c.code),
    });
    const changes = moves.length ? moves.map(moveText).join("; ") : "none chosen yet";
    const r = await askCoach(`Draft a note to my advisor about ${c.code}. Changes I'm making: ${changes}.`, ctx, [], "advisor");
    return r.text;
  };

  const base = {
    ready: !!trees && !!profile,
    draftAdvisorNote,
    error,
    now: demo.now,
    profiles,
    profile,
    state: { ...s, blocks: allBlocks },
    courses,
    toast,
    dismissToast: () => setToast(undefined),
    setProfile: (id: string) => setSaved((v) => ({ ...v, profile: id })),
    /** After Google sign-in or sign-out: the visible profiles change, so reload them and pick one. */
    reloadProfiles: async (select?: string, forget?: string) => {
      const p = await getProfiles();
      setProfiles(p);
      setSaved((v) => {
        const by = { ...v.by };
        if (forget) delete by[forget]; // a deleted account leaves nothing behind on this device either
        return { ...v, by, profile: select ?? (p.some((x) => x.id === v.profile) ? v.profile : p[0]?.id) };
      });
    },
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
      await sync.addJudgeCourse(profile.id);
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
    // Direct edits on the week grid. Same path as an approved suggestion: local state first, Google second.
    moveEvent: async (id: string, start: string, end: string) => {
      if (s.blocks.some((b) => b.id === id) || sharedBlocks.some((b) => b.id === id)) {
        const mine = s.blocks.some((b) => b.id === id);
        const shared = sharedBlocks.find((b) => b.id === id);
        // The block keeps the length it was given (a resize is a move with a new end).
        const minutes = Math.max(15, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
        update((st) => ({ ...st, blocks: mine ? st.blocks.map((b) => (b.id === id ? { ...b, at: start, minutes } : b)) : [...st.blocks, { ...shared!, at: start, minutes }] }));
      } else if (!id.startsWith("g-")) update((st) => ({ ...st, moved: { ...st.moved, [id]: { start, end } } }));
      const gid = id.startsWith("g-") ? id.slice(2) : await gidForSure(id);
      if (gid && gcal.isConnected()) {
        markTouched(gid, start);
        try {
          await gcal.move(gid, start, end);
          say("Moved, here and in Google Calendar.");
        } catch (e) {
          say(`Moved here. Google Calendar said: ${(e as Error).message}`);
        }
      } else say("Moved.");
      if (id.startsWith("g-")) void refreshRef.current().catch(() => {});
    },
    removeEvent: async (id: string) => {
      if (s.blocks.some((b) => b.id === id)) update((st) => ({ ...st, blocks: st.blocks.filter((b) => b.id !== id) }));
      else if (!id.startsWith("g-")) update((st) => ({ ...st, removed: [...st.removed, id] }));
      const gid = id.startsWith("g-") ? id.slice(2) : await gidForSure(id);
      if (gid && gcal.isConnected()) {
        markTouched(gid, "");
        try {
          await gcal.remove(gid);
          say("Removed, here and in Google Calendar.");
        } catch (e) {
          say(`Removed here. Google Calendar said: ${(e as Error).message}`);
        }
      } else say("Removed.");
      update((st) => {
        const gids = { ...st.gids };
        delete gids[id];
        return { ...st, gids };
      });
      void refreshRef.current().catch(() => {});
    },
    addSource: (src: Source) => {
      const nextSources = [...s.sources.filter((x) => !(x.kind === src.kind && x.course === src.course && x.title === src.title)), src];
      update((st) => ({ ...st, sources: nextSources }));
      const dated = src.kind === "syllabus" ? src.deadlines.filter((d) => d.date).length : 0;
      // A grade page changes the numbers the tree reads, so re-score that course right away and say what moved.
      const seed = src.kind === "grades" ? courses.find((c) => c.code === src.course) : undefined;
      const after = seed ? view(seed, { ...s, sources: nextSources }) : null;
      const label = (atRisk: boolean) => (atRisk ? "worth a check-in" : "on track");
      const rescored = seed && after ? (after.result.atRisk === seed.result.atRisk ? ` The model re-read it: still ${label(after.result.atRisk)}.` : ` The model re-read it: ${label(seed.result.atRisk)} → ${label(after.result.atRisk)}.`) : "";
      say(dated ? `${src.title} filed under ${src.course}: ${dated} dates added to your week${gcal.isConnected() ? " and Google Calendar" : ""}.` : `${src.title} filed under ${src.course}.${rescored || " Viva can use it now."}`);
    },
    removeSource: (i: number) => update((st) => ({ ...st, sources: st.sources.filter((_, j) => j !== i) })),
    /** Rename a block Pathway made. Returns false for Moodle or Google events, which keep their names. */
    renameEvent: (id: string, title: string) => {
      if (!s.blocks.some((b) => b.id === id)) return false;
      update((st) => ({ ...st, blocks: st.blocks.map((b) => (b.id === id ? { ...b, title } : b)) }));
      return true;
    },
    /** Sync now: re-read the sample Moodle/Gradescope records, the database and Google Calendar. */
    syncNow: async () => {
      update((st) => ({ ...st, seeded: "" }));
      const p = await getProfiles().catch(() => null);
      if (p) setProfiles(p);
      if (profile) hydrate(profile.id);
      if (gcal.isConnected()) await refreshGoogle().catch(() => {});
    },
    // ---- knowledge graph (docs/knowledge/PLAN.md) --------------------------------------------
    knowledge: s.knowledge,
    /** Send a file through the ingestion agent, stage by stage, then file its facts here. */
    ingestFile: async (file: File, onStage?: (e: IngestEvent) => void, course?: string): Promise<DoneEvent> => {
      const done = await ingestFile(file, { profile: profile.id, courses: courses.map((c) => c.code), course, existing: s.knowledge.nodes }, (e) => onStage?.(e));
      const kb = retireSuperseded(merge(s.knowledge, { sources: [done.source], nodes: done.nodes, edges: done.edges }));
      update((st) => ({ ...st, knowledge: kb, sources: legacySources(kb) }));
      // A grade page changes the numbers the tree reads: re-score that course right away and say what moved.
      const seed = done.source.kind === "grades" ? courses.find((c) => c.code === done.source.course) : undefined;
      const after = seed ? view(seed, { ...s, sources: legacySources(kb) }) : null;
      const label = (atRisk: boolean) => (atRisk ? "worth a check-in" : "on track");
      const rescored = seed && after ? (after.result.atRisk === seed.result.atRisk ? ` The model re-read it: still ${label(after.result.atRisk)}.` : ` The model re-read it: ${label(seed.result.atRisk)} → ${label(after.result.atRisk)}.`) : "";
      say(`${done.source.filename} filed under ${done.source.course}: ${ingestSummary(done)}.${rescored}`);
      return done;
    },
    /** The review gate: confirm, edit or reject one fact. Only confirmed facts feed the Week, the tree and Viva. */
    reviewNode: (id: string, review: Review, patch?: { title?: string; body?: Record<string, unknown> }) => {
      const kb = reviewLocal(s.knowledge, id, review, patch);
      update((st) => ({ ...st, knowledge: kb, sources: legacySources(kb) }));
      fetch("/api/knowledge/nodes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: profile.id, id, review, ...patch }) }).catch(() => {});
    },
    /** Move a file (and its facts) to another course. */
    reassignSource: (sourceId: string, course: string) => {
      const kb = reassign(s.knowledge, sourceId, course);
      update((st) => ({ ...st, knowledge: kb, sources: legacySources(kb) }));
    },
    /** Forget a file: its facts, links and telemetry go with it. */
    removeKnowledgeSource: (sourceId: string) => {
      const kb = dropSource(s.knowledge, sourceId);
      update((st) => ({ ...st, knowledge: kb, sources: legacySources(kb) }));
      fetch("/api/knowledge/sources", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: profile.id, id: sourceId }) }).catch(() => {});
    },
    vivaThinking,
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
  };

  // ---- Viva as an agent --------------------------------------------------------------------
  // One structured Gemini call per turn (src/lib/intel/agent.ts) returns what to say and what to do.
  // The actions run here, against the student's own state, and each one leaves a receipt the
  // transcript shows. Chat and voice share this, so they can't diverge. If the route is down the
  // local mock answers so the page never goes silent (and does nothing).
  const [usage, setUsage] = useState({ input: 0, output: 0, turns: 0 });
  const slugOf = (x?: string) => (x ? courses.find((c) => c.slug === x || c.code === x || c.code.replace(" ", "-").toLowerCase() === x.toLowerCase())?.slug : undefined);
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  const gnote = () => (gcal.isConnected() ? ", also in Google Calendar" : "");

  const execute = async (actions: AgentAction[]) => {
    const receipts: string[] = [];
    const links: Action[] = [];
    let email: EmailDraft | undefined;
    let navigate: string | undefined;
    for (const a of actions) {
      try {
        switch (a.type) {
          case "add_event": {
            const minutes = Math.max(15, Math.min(240, Math.round((new Date(a.end!).getTime() - new Date(a.start!).getTime()) / 60_000) || 50));
            const course = slugOf(a.course) ?? courses.find((c) => a.title!.toUpperCase().includes(c.code))?.slug ?? "";
            // Repeat: one block per day on the pattern, up to ten, through `until`.
            const first = new Date(a.start!);
            const until = a.until && /^\d{4}-\d{2}-\d{2}$/.test(a.until) ? new Date(`${a.until}T23:59:59`) : first;
            const starts: Date[] = [];
            for (let d = new Date(first); d <= until && starts.length < 10; d.setDate(d.getDate() + (a.repeat === "weekly" ? 7 : 1))) {
              const dow = d.getDay();
              if (a.repeat === "weekdays" && (dow === 0 || dow === 6)) continue;
              starts.push(new Date(d));
              if (!a.repeat || a.repeat === "none") break;
            }
            const made: Block[] = [];
            const shifted: string[] = [];
            for (const st of starts) {
              // Taken? Slide to the next free slot that day and say so, rather than stacking on a class.
              let at = localIso(st);
              const probeEnd = localIso(new Date(st.getTime() + minutes * 60_000));
              const busy = [...events, ...blocksAsEvents(made)].some((e) => e.start < probeEnd && at < e.end);
              if (busy) {
                const slot = freeSlot([...events, ...blocksAsEvents(made)], st, minutes, st.getHours() + (st.getMinutes() ? 1 : 0), 22) ?? freeSlot([...events, ...blocksAsEvents(made)], st, minutes, 8, 22);
                if (slot) {
                  shifted.push(`${when(at)} was taken, used ${when(slot.start)}`);
                  at = slot.start;
                }
              }
              made.push({ id: `viva-${Date.now()}-${receipts.length}-${made.length}`, course, title: a.title!, at, done: false, minutes });
            }
            if (!made.length) break;
            update((st) => ({ ...st, blocks: [...st.blocks, ...made] })); // the sync effect writes them to Google
            sync.blocks(profile.id, made);
            receipts.push(made.length === 1 ? `Added “${a.title}” ${when(made[0].at)}${gnote()}` : `Added “${a.title}” ${made.length} times, ${when(made[0].at)} through ${fmtDay(made[made.length - 1].at)}${gnote()}`);
            for (const x of shifted) receipts.push(x);
            break;
          }
          case "move_event": {
            const ev = events.find((e) => e.id === a.id);
            if (!ev) {
              receipts.push(`Couldn't find that event to move`);
              break;
            }
            await base.moveEvent(a.id!, a.start!, a.end!);
            receipts.push(`Moved “${ev.title}” to ${when(a.start!)}${gnote()}`);
            break;
          }
          case "resize_event": {
            const ev = events.find((e) => e.id === a.id);
            if (!ev || a.end! <= ev.start) {
              receipts.push(`Couldn't change that event's length`);
              break;
            }
            await base.moveEvent(a.id!, ev.start, a.end!);
            receipts.push(`“${ev.title}” now runs ${fmtTime(ev.start)} to ${fmtTime(a.end!)}${gnote()}`);
            break;
          }
          case "rename_event": {
            const ev = events.find((e) => e.id === a.id);
            if (!ev) break;
            if (!base.renameEvent(a.id!, a.title!)) {
              receipts.push(`“${ev.title}” comes from Moodle or Google; only blocks Pathway made can be renamed`);
              break;
            }
            receipts.push(`Renamed “${ev.title}” to “${a.title}”`);
            break;
          }
          case "remove_event": {
            const ev = events.find((e) => e.id === a.id);
            if (!ev) {
              receipts.push(`Couldn't find that event to remove`);
              break;
            }
            await base.removeEvent(a.id!);
            receipts.push(`Removed “${ev.title}”${gnote()}`);
            break;
          }
          case "clear_range": {
            // Study blocks always; with kind "all" also the student's other events, never classes, exams or work.
            const inRange = events.filter((e) => e.start < a.end! && a.start! < e.end && e.kind !== "class" && e.kind !== "exam" && e.kind !== "work" && (a.kind === "all" || e.kind === "study"));
            for (const e of inRange) await base.removeEvent(e.id);
            receipts.push(inRange.length ? `Cleared ${inRange.length} item${inRange.length === 1 ? "" : "s"} between ${when(a.start!)} and ${when(a.end!)}${gnote()}` : `Nothing of yours to clear between ${when(a.start!)} and ${when(a.end!)}`);
            break;
          }
          case "approve_all": {
            for (const sg of suggestions) await base.approveSuggestion(sg);
            receipts.push(suggestions.length ? `Approved ${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}` : "No suggestions were waiting");
            break;
          }
          case "start_quiz": {
            const slug = slugOf(a.course);
            if (!slug) break;
            const code = courses.find((c) => c.slug === slug)?.code ?? "";
            const want = (a.title ?? "").toLowerCase();
            const doc = want ? docsFor(code, s.knowledge).find((d) => d.title.toLowerCase() === want) ?? docsFor(code, s.knowledge).find((d) => d.title.toLowerCase().includes(want) || want.includes(d.title.toLowerCase())) : undefined;
            navigate = `/study?tool=${a.tool === "flashcards" ? "flashcards" : "quiz"}&course=${slug}${doc ? `&doc=${encodeURIComponent(doc.id)}` : ""}`;
            receipts.push(doc ? `Opened a ${a.tool === "flashcards" ? "deck" : "quiz"} from “${doc.title}”` : `Opened Study for ${code}`);
            break;
          }
          case "approve_suggestion": {
            const sg = suggestions.find((x) => x.id === a.id);
            if (!sg) break;
            await base.approveSuggestion(sg);
            receipts.push(`Approved: ${sg.title}`);
            break;
          }
          case "dismiss_suggestion": {
            const sg = suggestions.find((x) => x.id === a.id);
            if (!sg) break;
            base.dismissSuggestion(sg.id);
            receipts.push(`Set aside: ${sg.title}`);
            break;
          }
          case "make_it_real": {
            const c = courses.find((x) => x.slug === slugOf(a.course));
            if (!c?.rec) break;
            const made = planBlocks(c, c.rec.moves, demo.now);
            base.makeReal(made);
            receipts.push(`${made.length} ${c.code} study blocks added before ${fmtDay(c.exam.date)}${gnote()}`);
            break;
          }
          case "complete_block": {
            const b = (base.state.blocks as Block[]).find((x) => x.id === a.id);
            if (!b) break;
            base.completeBlock(b);
            receipts.push(`Marked “${b.title}” done`);
            break;
          }
          case "log_quiz": {
            const slug = slugOf(a.course);
            if (!slug) break;
            base.logQuiz(slug);
            receipts.push(`Logged a practice quiz for ${courses.find((c) => c.slug === slug)?.code}`);
            break;
          }
          case "log_session": {
            const slug = slugOf(a.course);
            if (!slug) break;
            base.logSession(slug);
            receipts.push(`Logged a study session for ${courses.find((c) => c.slug === slug)?.code}`);
            break;
          }
          case "check_in": {
            const slug = slugOf(a.course);
            if (!slug) break;
            const cls = events.find((e) => e.course === slug && e.kind === "class" && new Date(e.start) >= new Date(demo.now.getTime() - 3 * 3600_000));
            base.checkIn(slug, cls?.start ?? demo.now.toISOString());
            receipts.push(`Checked in to ${courses.find((c) => c.slug === slug)?.code}`);
            break;
          }
          case "set_midterm": {
            const slug = slugOf(a.course);
            if (!slug) break;
            base.setMidterm(slug, a.score!);
            receipts.push(`Using your ${courses.find((c) => c.slug === slug)?.code} midterm (${a.score}) with the mid-semester model`);
            break;
          }
          case "draft_email":
            email = { to: a.email_to ?? "", subject: a.email_subject ?? "", body: a.email_body ?? "" };
            receipts.push("Drafted an email (you send it)");
            break;
          case "navigate":
            navigate = a.path;
            break;
          case "link":
            links.push({ label: a.label ?? a.path!, href: a.path! });
            break;
        }
      } catch (e) {
        receipts.push(`Couldn't ${a.type.replace("_", " ")}: ${(e as Error).message}`);
      }
    }
    return { receipts, links, email, navigate };
  };

  // Voice confirmation: on voice turns, calendar-writing actions are held as a spoken
  // proposal ("three blocks, Tue/Thu/Sat — want me to go ahead?") until the student says
  // yes or no, instead of mutating the calendar mid-sentence. The Week page's manual
  // approve/dismiss is untouched — this is the same gate, just spoken.
  const pendingActions = useRef<AgentAction[] | null>(null);
  const MUTATING = new Set<AgentAction["type"]>(["add_event", "move_event", "resize_event", "rename_event", "remove_event", "clear_range", "make_it_real", "approve_suggestion", "dismiss_suggestion", "approve_all"]);
  const CONFIRM = /\b(yes|yeah|yep|sure|ok|okay|go ahead|do it|approve|confirm|sounds good|please)\b/i;

  // act=false is for proactive turns (device events): Viva may speak but never executes
  // actions unprompted — nothing changes without the student asking.
  const coachTurn = async (text: string, channel: "chat" | "voice" = "chat", act = true): Promise<Reply & { via: "gemini" | "local"; receipts?: string[]; email?: EmailDraft; navigate?: string; citations?: Citation[] }> => {
    try {
      const ctx = coachContext({
        now: demo.now,
        studentName: profile?.sample ? profile.name ?? "" : "",
        courses,
        todos: profile?.todos ?? [],
        blocks: s.blocks,
        sources: [], // the compiled knowledge pack below replaces the raw file dump (half the tokens, and citable)
        inbox: inboxFor(courses.map((c) => c.code)).map((m) => ({ from: m.from, subject: m.subject, course: m.course, snippet: m.snippet })),
        week: events.map((e) => ({ title: e.title, start: e.start, end: e.end, kind: e.kind })),
        suggestions: suggestions.map((x) => ({ title: x.title, why: x.why })),
      });
      const page = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
      const pageCourse = courses.find((c) => page.includes(`course=${c.slug}`))?.code;
      const todayIso = localIso(new Date(demo.now.getFullYear(), demo.now.getMonth(), demo.now.getDate()));
      const weekAheadIso = localIso(new Date(demo.now.getFullYear(), demo.now.getMonth(), demo.now.getDate() + 14));
      const pack = compileContext(s.knowledge, scopeFor(text, pageCourse, courses.map((c) => c.code), s.chat.slice(-4).map((m) => m.text)), 6000, demo.now);
      // Voice appends the student's turn before calling this; don't send it twice.
      const history = s.chat[s.chat.length - 1]?.role === "you" && s.chat[s.chat.length - 1].text === text ? s.chat.slice(0, -1) : s.chat;
      // If last turn ended on a spoken proposal, this message is the student's verdict:
      // show the agent exactly what was on the table so it can re-emit or drop it.
      const held = pendingActions.current;
      pendingActions.current = null;
      const message = held?.length
        ? `${text}\n\n[Earlier you proposed these calendar changes and asked the student to confirm: ${JSON.stringify(held)}. If the student just agreed, return the same actions again so they run; if they declined, acknowledge briefly and return no actions.]`
        : text;
      const r = await askAgent(
        message,
        {
          ...ctx,
          page,
          channel,
          profileId: profile.id,
          knowledge: pack.text,
          notes: s.notes,
          // the next two weeks: enough to plan around exams, nothing older
          weekIds: events.filter((e) => e.end >= todayIso && e.start < weekAheadIso).map((e) => ({ id: e.id, title: e.title, start: e.start })),
          // Lecture files this message is about, by word overlap with their titles, summaries and text. No model call,
          // and nothing is sent unless the overlap is real, so a scheduling question costs no extra tokens.
          excerpts: pickExcerpts(text, scopeFor(text, pageCourse, courses.map((c) => c.code), s.chat.slice(-4).map((m) => m.text)).courses, s.knowledge),
          suggestionIds: suggestions.map((x) => ({ id: x.id, title: x.title })),
          files: s.sources.map((x) => ({ course: x.course, title: x.title, kind: x.kind })),
          recourse: courses.filter((c) => c.rec).map((c) => ({ course: c.slug, plan: planBlocks(c, c.rec!.moves, demo.now).map((b) => `${b.title} ${when(b.at)}`).join(", ") })),
        },
        history.map((h) => ({ role: h.role, text: h.text })),
      );
      setUsage((u) => ({ input: u.input + r.usage.input, output: u.output + r.usage.output, turns: u.turns + 1 }));
      console.info(`[viva] ${r.specialist} answered in ${r.ms}ms, ${r.usage.input}+${r.usage.output} tokens, ${r.actions.length} action(s)`);
      let actions = r.actions;
      let spoken = r.say;
      if (page.startsWith("/device")) actions = actions.filter((a) => a.type !== "navigate"); // the kiosk stays put — Viva speaks instead of moving you
      if (act && channel === "voice") {
        const mut = actions.filter((a) => MUTATING.has(a.type));
        if (!mut.length && held?.length && CONFIRM.test(text)) {
          actions = held; // agent confirmed in words but dropped the actions — run the held proposal
        } else if (!held && mut.length) {
          // First proposal on this voice session: hold the calendar writes and say it as a
          // proposal — never reuse `say`, which claims it already happened.
          pendingActions.current = mut;
          actions = actions.filter((a) => !MUTATING.has(a.type));
          const titleFor = (id?: string) => events.find((e) => e.id === id)?.title ?? "that event";
          const sugFor = (id?: string) => suggestions.find((x) => x.id === id)?.title ?? "the suggestion";
          const codeFor = (slug?: string) => courses.find((c) => c.slug === slug)?.code ?? slug ?? "the course";
          const bits = mut.map((a) => {
            if (a.type === "add_event") return `add "${a.title}"${a.start ? ` ${fmtDay(a.start)} ${fmtTime(a.start)}` : ""}`;
            if (a.type === "move_event") return `move "${titleFor(a.id)}"`;
            if (a.type === "resize_event") return `change the length of "${titleFor(a.id)}"`;
            if (a.type === "rename_event") return `rename "${titleFor(a.id)}"`;
            if (a.type === "remove_event") return `remove "${titleFor(a.id)}"`;
            if (a.type === "clear_range") return `clear ${a.start ? `${fmtDay(a.start)} ${fmtTime(a.start)} to ${fmtTime(a.end ?? a.start)}` : "that stretch"}`;
            if (a.type === "approve_all") return "approve every pending suggestion";
            if (a.type === "make_it_real") return `add the study plan for ${codeFor(a.course)}`;
            if (a.type === "approve_suggestion") return `approve "${sugFor(a.id)}"`;
            if (a.type === "dismiss_suggestion") return `set aside "${sugFor(a.id)}"`;
            return a.type;
          });
          spoken = `I can ${bits.join(" and ")} — want me to go ahead?`;
        }
      }
      const done = act ? await execute(actions) : { receipts: [] as string[], links: [] as Action[], email: undefined as EmailDraft | undefined, navigate: undefined as string | undefined };
      // What the student told Viva becomes a visible, deletable preference fact (course-scoped when they named one).
      if (r.remember.length) {
        const course = courses.find((c) => text.toLowerCase().includes(c.code.toLowerCase()))?.code ?? "";
        const nodes: KbNode[] = r.remember.map((t) => ({ id: nodeId(profile.id, course, "preference", t), profile: profile.id, course, type: "preference", title: t, body: {}, confidence: "high", review: "confirmed", locator: "you told Viva", createdBy: "viva", createdAt: new Date().toISOString() }));
        update((st) => ({ ...st, knowledge: merge(st.knowledge, { nodes, edges: [] }) }));
      }
      const byId = new Map(s.knowledge.nodes.map((n) => [n.id, n]));
      const citations = (r.used ?? []).map((id) => byId.get(id)).filter((n): n is KbNode => !!n).map((n) => ({ id: n.id, title: n.title, quote: n.quote, locator: n.locator, course: n.course }));
      const say = spoken.trim() || (done.receipts.length ? "Done." : "I don't have that.");
      return { text: soften(say), actions: done.links, via: "gemini", receipts: done.receipts, email: done.email, navigate: done.navigate, citations };
    } catch (e) {
      console.warn("[viva] /api/agent unavailable, using the local fallback brain:", (e as Error).message);
      return { ...vivaReply(text, { name: profile?.sample ? profile.name : undefined, courses }), via: "local" };
    }
  };

  // Chat: show the question, run the agent, append Viva's turn with its receipts. Returns the
  // reply so the caller can navigate if Viva asked to.
  const ask = async (text: string) => {
    base.addTurn({ role: "you", text });
    setVivaThinking(true);
    const r = await coachTurn(text, "chat");
    setVivaThinking(false);
    base.addTurn({ role: "viva", text: r.text, actions: r.actions, receipts: r.receipts, email: r.email, citations: r.citations });
    return r;
  };

  return { ...base, coachTurn, ask, usage };
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
