"use client";

// Viva's check-in: the few things the app needs from the student right now, asked one at a time with one-tap
// answers, so the model keeps getting good data without the student hunting for the right page. Computed from
// state the app already has (no model call): today's classes not checked in, past study blocks not marked done,
// facts Pathway read but isn't sure of, a calendar change Viva proposed, Viva's schedule suggestions, a buddy
// request, mail that needs a reply. Ordered by value to the decision tree. "Not now" hides an item for the day.

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathway, fmtTime } from "@/lib/store";
import { inboxFor } from "@/lib/inbox";
import { VivaGlyph } from "@/components/Viva";

type Ask = {
  id: string;
  text: string;
  sub?: string;
  yes: { label: string; run: () => unknown };
  no?: { label: string; run: () => unknown };
  open?: { label: string; href: string };
};

type Friend = { id: number; name: string; email: string };
const friendsCache = new Map<string, { at: number; incoming: Friend[] }>();

// What the student set aside today, shared by every user of the hook (the Home card and the sidebar badge).
const skipKey = (profile: string, day: string) => `pathway:checkin-skip:${profile}:${day}`;
const skipCache = new Map<string, string[]>();
const skipSubs = new Set<() => void>();
const NONE: string[] = [];
const readSkips = (key: string): string[] => {
  if (!skipCache.has(key)) {
    try {
      skipCache.set(key, JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch {
      skipCache.set(key, []);
    }
  }
  return skipCache.get(key)!;
};
const addSkip = (key: string, id: string) => {
  const next = [...readSkips(key), id];
  skipCache.set(key, next);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {}
  skipSubs.forEach((f) => f());
};
const subscribeSkips = (f: () => void) => {
  skipSubs.add(f);
  return () => skipSubs.delete(f);
};

/** What Viva would ask right now, best first. Shared by the Home card and the dock badge. */
export function useVivaAsks() {
  const { profile, courses, events, state, now, checkIn, completeBlock, suggestions, approveSuggestion, dismissSuggestion, knowledge, reviewNode, approveProposal, dismissProposal } = usePathway();
  const day = now.toISOString().slice(0, 10);
  const pid = profile?.id ?? ""; // the sidebar renders before profiles load
  const key = skipKey(pid, day);
  const skips = useSyncExternalStore(subscribeSkips, () => (pid ? readSkips(key) : NONE), () => NONE);
  const skip = (id: string) => pid && addSkip(key, id);

  // Buddy requests come from the server (the demo profile answers its account's requests); cached briefly.
  const [incoming, setIncoming] = useState<Friend[]>(() => friendsCache.get(pid)?.incoming ?? []);
  useEffect(() => {
    if (!pid) return;
    const hit = friendsCache.get(pid);
    if (hit && Date.now() - hit.at < 30_000) return;
    let live = true;
    fetch(`/api/friends?profile_id=${encodeURIComponent(pid)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ incoming: Friend[] }>) : null))
      .then((d) => {
        if (!live || !d) return;
        friendsCache.set(pid, { at: Date.now(), incoming: d.incoming ?? [] });
        setIncoming(d.incoming ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pid]);
  const answerFriend = async (id: number, action: "accept" | "decline") => {
    await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile_id: pid, action, id }) }).catch(() => {});
    friendsCache.delete(pid);
    setIncoming((xs) => xs.filter((f) => f.id !== id));
  };

  const asks = useMemo(() => {
    const out: Ask[] = [];
    if (!pid) return out;
    const t = now.getTime();
    const code = (slug?: string) => courses.find((c) => c.slug === slug)?.code ?? "";
    const minute = (s: string) => Math.floor(new Date(s).getTime() / 60_000);
    const checked = (at: string) => Object.keys(state.checkedIn).some((k) => state.checkedIn[k] && minute(k) === minute(at));

    // 1. Classes that already happened today and have no check-in: attendance is a model input.
    for (const e of events) {
      if (e.kind !== "class" || !e.course || new Date(e.start).toDateString() !== now.toDateString() || new Date(e.start).getTime() > t || checked(e.start)) continue;
      out.push({
        id: `class:${e.start}`,
        text: `Were you in ${e.title} at ${fmtTime(e.start)}?`,
        sub: `Attendance counts toward ${code(e.course)}'s status.`,
        yes: { label: "Yes, check me in", run: () => checkIn(e.course!, e.start) },
        no: { label: "Missed it", run: () => skip(`class:${e.start}`) },
      });
    }
    // 2. Study blocks that ended without being marked done.
    for (const b of state.blocks) {
      if (b.done || new Date(b.at).getTime() + (b.minutes ?? 50) * 60_000 > t || t - new Date(b.at).getTime() > 3 * 86_400_000) continue;
      out.push({
        id: `block:${b.id}`,
        text: `Did you finish "${b.title}" (${new Date(b.at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })})?`,
        sub: "Finished blocks count as study time and back your Study Pot.",
        yes: { label: "Yes, done", run: () => completeBlock(b) },
        no: { label: "Not yet", run: () => skip(`block:${b.id}`) },
      });
    }
    // 3. Facts Pathway read but isn't sure about, per course.
    const unsure = knowledge.nodes.filter((n) => n.review === "proposed");
    for (const c of courses) {
      const mine = unsure.filter((n) => n.course === c.code);
      if (!mine.length) continue;
      out.push({
        id: `facts:${c.slug}:${mine.length}`,
        text: `Pathway read ${mine.length} ${mine.length === 1 ? "fact" : "facts"} from your ${c.code} files it isn't sure about. Look right?`,
        sub: mine.slice(0, 2).map((n) => n.title).join(" · "),
        yes: { label: "Confirm all", run: () => mine.forEach((n) => reviewNode(n.id, "confirmed")) },
        open: { label: "Review", href: `/courses?course=${c.slug}&tab=facts` },
      });
    }
    // 4. A calendar change Viva proposed in chat and the student hasn't answered.
    const lastProposal = [...state.chat].reverse().find((m) => m.proposal)?.proposal;
    if (lastProposal?.status === "pending")
      out.push({
        id: `proposal:${lastProposal.id}`,
        text: `Viva is waiting on your OK: ${lastProposal.items.join("; ")}`,
        yes: { label: "Approve", run: () => approveProposal(lastProposal.id) },
        no: { label: "Not now", run: () => dismissProposal(lastProposal.id) },
      });
    // 5. Viva's schedule suggestions: one item, the top suggestion, with the rest a tap away on the Week.
    //    "Not now" hides suggestions for today rather than walking through every one.
    const sg = suggestions[0];
    if (sg)
      out.push({
        id: "suggestions",
        text: sg.title,
        sub: `${sg.why}${suggestions.length > 1 ? ` · ${suggestions.length - 1} more on your Week` : ""}`,
        yes: { label: "Approve", run: () => approveSuggestion(sg) },
        no: { label: "Skip this one", run: () => dismissSuggestion(sg.id) },
        open: suggestions.length > 1 ? { label: "See all on Week", href: "/calendar" } : undefined,
      });
    // 6. Buddy requests.
    for (const f of incoming)
      out.push({
        id: `friend:${f.id}`,
        text: `${f.name} wants to be study buddies.`,
        sub: "Buddies see effort (blocks, streaks), never grades or status.",
        yes: { label: "Accept", run: () => answerFriend(f.id, "accept") },
        no: { label: "Decline", run: () => answerFriend(f.id, "decline") },
      });
    // 7. Course mail that asks for a reply.
    for (const m of inboxFor(courses.map((c) => c.code)).filter((x) => x.needsReply && x.unread))
      out.push({
        id: `mail:${m.id}`,
        text: `${m.from} is waiting on a reply: “${m.subject}”`,
        sub: `${m.course} · Viva can draft it for you.`,
        yes: { label: "Draft a reply", run: () => undefined },
        open: { label: "Draft a reply", href: `/inbox?open=${m.id}` },
      });
    return out.filter((a) => !skips.includes(a.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, state.blocks, state.checkedIn, state.chat, knowledge.nodes, suggestions, incoming, courses, now, skips]);

  return { asks, skip };
}

/** The Home card: one question at a time, answered in place. Gone when there's nothing to ask. */
export function VivaCheckIn() {
  const { asks, skip } = useVivaAsks();
  const [busy, setBusy] = useState(false);
  const a = asks[0];
  if (!a) return null;
  const act = async (run: () => unknown) => {
    setBusy(true);
    try {
      await run();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Viva check-in" className="mt-5 rounded-2xl border-2 border-sky/30 bg-sky-soft/50 p-4">
      <div className="flex items-start gap-3">
        <VivaGlyph size={28} className="mt-0.5 shrink-0 text-sky" />
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Viva · {asks.length === 1 ? "one quick thing" : `${asks.length} quick things`}</p>
          <p className="mt-1 font-black leading-snug">{a.text}</p>
          {a.sub && <p className="mt-0.5 text-sm text-muted">{a.sub}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {a.open && a.yes.label === a.open.label ? (
              <Link href={a.open.href} className="btn btn-sky min-h-9 px-3 text-xs">
                {a.open.label}
              </Link>
            ) : (
              <button disabled={busy} onClick={() => act(a.yes.run)} className="btn btn-sky min-h-9 px-3 text-xs">
                {a.yes.label}
              </button>
            )}
            {a.open && a.yes.label !== a.open.label && (
              <Link href={a.open.href} className="btn btn-ghost min-h-9 px-3 text-xs">
                {a.open.label}
              </Link>
            )}
            {a.no && (
              <button disabled={busy} onClick={() => act(a.no!.run)} className="btn btn-ghost min-h-9 px-3 text-xs">
                {a.no.label}
              </button>
            )}
            <button disabled={busy} onClick={() => skip(a.id)} className="text-xs font-bold text-muted underline underline-offset-4 hover:text-ink">
              Not now
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
