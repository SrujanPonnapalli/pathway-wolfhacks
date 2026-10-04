"use client";

// Course mail only. Read it, let Viva draft a reply, open the draft in Gmail. Pathway never
// sends on the student's behalf: the send button is Gmail's, not ours.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, Copy, ExternalLink, Info, Mail, PenLine, Sparkles } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { PageHeader } from "@/components/ui";
import { VivaGlyph } from "@/components/Viva";
import { askCoach, coachContext } from "@/lib/api";
import { inboxFor, type Mail as MailT } from "@/lib/inbox";
import { RECHECK_MS, briefKey, checkedThisSession, keepBrief, localBrief, ruleBrief, type Brief, type BriefKind, type SavedBrief } from "@/lib/inboxBrief";
import { fmtDay, fmtTime, usePathway } from "@/lib/store";

export function Inbox() {
  const { courses, profile, now, state } = usePathway();
  const params = useSearchParams();
  const mail = inboxFor(courses.map((c) => c.code));
  const [openId, setOpenId] = useState<string | null>(params.get("open"));
  const [autoDraft, setAutoDraft] = useState(false);
  const open = mail.find((m) => m.id === openId) ?? null;
  const show = (id: string, draft = false) => (setAutoDraft(draft), setOpenId(id));

  return (
    <main className="mx-auto max-w-narrow px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Inbox" lead="Only mail about your classes. Viva can draft a reply; you send it from Gmail." />
      {open ? (
        <Message key={open.id} m={open} autoDraft={autoDraft} onBack={() => setOpenId(null)} ctxArgs={{ courses, profile, now, state }} />
      ) : mail.length === 0 ? (
        <p className="text-muted">No course mail yet.</p>
      ) : (
        <>
        <VivaBrief mail={mail} onOpen={show} />
        <ul className="divide-y-2 divide-line">
          {mail.map((m) => (
            <li key={m.id}>
              <button onClick={() => setOpenId(m.id)} className="flex w-full items-start gap-3 py-3 text-left hover:bg-polar">
                <Mail size={18} className={`mt-1 shrink-0 ${m.unread ? "text-sky" : "text-muted"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block leading-snug ${m.unread ? "font-extrabold" : "font-bold"}`}>{m.subject}</span>
                  <span className="block text-sm text-muted">{m.course} · {m.from} · {fmtDay(m.at)}{m.needsReply ? " · reply needed" : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        </>
      )}
    </main>
  );
}

const KIND: Record<BriefKind, { icon: typeof Mail; label: string }> = {
  reply: { icon: PenLine, label: "Reply" },
  date: { icon: CalendarClock, label: "Date" },
  action: { icon: Sparkles, label: "To do" },
  fyi: { icon: Info, label: "FYI" },
};

/**
 * Viva's brief at the top of the inbox. It paints at once from this device's copy (or the rule-based brief),
 * then: nothing to do if this page session already checked this mail; otherwise the profile's shared copy on
 * the server is used when it matches this mail and is under 5 minutes old; otherwise Viva re-reads the mail
 * (one fast Gemini call over the mail and each course's tree status), so "checking" is always a real call.
 * Reset deletes the server copy, so the next visit rebuilds on every device.
 */
function VivaBrief({ mail, onOpen }: { mail: MailT[]; onOpen: (id: string, draft?: boolean) => void }) {
  const { courses, profile, now, state, events, suggestions } = usePathway();
  const status = courses.map((c) => ({ code: c.code, checkIn: c.result.atRisk }));
  const key = briefKey(mail, status, now.toISOString().slice(0, 10));
  const instant = useMemo(() => ruleBrief(mail, status), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [viva, setViva] = useState<SavedBrief | null>(() => {
    const hit = localBrief(profile.id);
    return hit?.key === key ? hit : null;
  });
  const [checkedFor, setCheckedFor] = useState<string | null>(() => (checkedThisSession(profile.id, key) ? key : null)); // the key last confirmed current
  const [asking, setAsking] = useState(false); // Viva (Gemini) is re-reading right now
  const [updated, setUpdated] = useState(false); // Viva re-read the mail during this visit
  const [shownAt] = useState(() => Date.now()); // real time this brief appeared, for "checked N min ago"
  const fresh = viva?.key === key ? viva.brief : null;
  const toRead = mail.some((m) => m.unread || m.needsReply);

  useEffect(() => {
    if (!toRead || checkedFor === key) return; // already confirmed current in this page session
    let live = true;
    const abort = new AbortController(); // a superseded check (or React's dev double-run) never reaches Gemini twice
    let slow = 0;
    const adopt = (saved: SavedBrief, fromViva: boolean) => {
      keepBrief(profile.id, saved);
      setViva(saved);
      if (fromViva) setUpdated(true);
    };
    const reread = () => {
      setAsking(true);
      // If Gemini is slow (it falls back across models under load), stop "checking" after 8 s and keep what's shown.
      slow = window.setTimeout(() => abort.abort(), 8000);
      const context = coachContext({
        now,
        studentName: profile.sample ? profile.name : "",
        courses,
        todos: profile.todos,
        blocks: state.blocks,
        sources: state.sources,
        week: events.map((e) => ({ title: e.title, start: e.start, end: e.end, kind: e.kind })),
        suggestions: suggestions.map((x) => ({ title: x.title, why: x.why })),
      });
      return fetch("/api/inbox/brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mail, context, profile_id: profile.id, key }), signal: abort.signal })
        .then((r) => (r.ok ? (r.json() as Promise<Brief>) : null))
        .then((brief) => {
          if (live && brief?.by === "viva") adopt({ key, brief, at: Date.now() }, true);
        });
    };
    // The shared copy first: a database read, no Gemini. Then Viva only if it's missing, stale or for other mail.
    fetch(`/api/inbox/brief?profile_id=${encodeURIComponent(profile.id)}`, { signal: abort.signal })
      .then((r) => (r.ok ? (r.json() as Promise<SavedBrief | null>) : null))
      .catch(() => null)
      .then((hit) => {
        if (!live) return;
        if (hit?.key === key && Date.now() - hit.at < RECHECK_MS) return adopt(hit, false);
        return reread();
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(slow);
        if (!live) return;
        setAsking(false);
        setCheckedFor(key);
      });
    return () => {
      live = false;
      clearTimeout(slow);
      abort.abort();
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const brief = fresh ?? instant;
  const reading = asking;
  // Real time, not the demo clock: how long ago Viva actually read the mail.
  const mins = viva ? Math.round((shownAt - viva.at) / 60_000) : 0;
  const checked = updated || mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `at ${new Date(viva!.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  return (
    <section aria-labelledby="brief" aria-busy={reading || undefined} className="panel mb-6 border-sky/30 p-5">
      <div className="flex items-start gap-3">
        <VivaGlyph size={30} className="mt-0.5 shrink-0 text-sky" />
        <div className="min-w-0 flex-1">
          <h2 id="brief" className="text-xl font-black leading-snug">{brief.headline}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-muted" aria-live="polite">
            {reading ? (
              <>
                <ThinkingOrb state="solving" size={20} theme="light" color="#1a6fd1" aria-hidden /> {fresh ? "Viva is checking your mail for anything new…" : "Viva is reading your mail…"}
              </>
            ) : brief.by === "viva" ? (
              `Viva's read of your course mail, ranked by what your classes need · checked ${checked}. Viva can be wrong.`
            ) : (
              "Newest first, replies and check-in courses on top."
            )}
          </p>
        </div>
      </div>
      {brief.items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {brief.items.map((it) => {
            const m = mail.find((x) => x.id === it.mail);
            const { icon: Icon, label } = KIND[it.kind];
            return (
              <li key={it.mail} className="flex items-center gap-3 rounded-xl bg-sky-soft/60 px-3 py-2.5">
                <Icon size={17} className="shrink-0 text-sky" aria-label={label} />
                <button onClick={() => onOpen(it.mail)} className="min-w-0 flex-1 text-left text-sm font-bold leading-snug hover:text-sky">
                  {it.text}
                  {m && brief.by === "viva" && <span className="block text-xs font-semibold text-muted">{m.course} · {m.from}</span>}
                </button>
                {it.kind === "reply" && (
                  <button onClick={() => onOpen(it.mail, true)} className="btn btn-ghost min-h-9 shrink-0 px-3 text-xs">
                    Draft reply
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type CtxArgs = { courses: ReturnType<typeof usePathway>["courses"]; profile: ReturnType<typeof usePathway>["profile"]; now: Date; state: ReturnType<typeof usePathway>["state"] };

function Message({ m, onBack, ctxArgs, autoDraft = false }: { m: MailT; onBack: () => void; ctxArgs: CtxArgs; autoDraft?: boolean }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(autoDraft);
  const [err, setErr] = useState("");

  // The request itself, no state: the button and the auto-start below both apply its answer.
  const draftText = () => {
    const ctx = coachContext({ now: ctxArgs.now, studentName: ctxArgs.profile?.sample ? ctxArgs.profile.name : "", courses: ctxArgs.courses, todos: ctxArgs.profile?.todos ?? [], blocks: ctxArgs.state.blocks, sources: ctxArgs.state.sources, inbox: [{ from: m.from, subject: m.subject, course: m.course, snippet: m.body }] });
    return askCoach(`Draft a short, polite reply email to ${m.from} about "${m.subject}". Email text: """${m.body}""". Write only the reply body (no subject line), 3 to 5 sentences, first person, ready to send. Use my schedule from the context if it helps pick a time.`, ctx, [], "draft").then((r) => r.text);
  };
  const apply = (p: Promise<string>) =>
    p.then(setDraft, (e: Error) => setErr(e.message)).finally(() => setBusy(false));
  const makeDraft = () => {
    setBusy(true);
    setErr("");
    void apply(draftText());
  };
  // Opened from the brief's "Draft reply": start the draft right away (busy already starts true).
  useEffect(() => {
    if (autoDraft) void apply(draftText());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(m.from)}&su=${encodeURIComponent(`Re: ${m.subject}`)}&body=${encodeURIComponent(draft)}`;

  return (
    <article>
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm font-bold text-teal"><ArrowLeft size={16} aria-hidden /> All mail</button>
      <h2 className="text-xl font-black leading-snug">{m.subject}</h2>
      <p className="mt-1 text-sm text-muted">{m.course} · {m.from} · {fmtDay(m.at)}, {fmtTime(m.at)}</p>
      <p className="mt-4 whitespace-pre-line leading-relaxed">{m.body}</p>

      <div className="mt-6 border-t-2 border-line pt-5">
        {!draft && (
          <button onClick={makeDraft} disabled={busy} className="btn btn-sky">
            {busy ? <><ThinkingOrb state="solving" size={20} theme="dark" color="#ffffff" aria-hidden /> Drafting…</> : "Draft a reply with Viva"}
          </button>
        )}
        {err && <p role="alert" className="mt-2 text-sm font-bold text-sun-ink">{err}</p>}
        {draft && (
          <>
            <label htmlFor="draft" className="text-sm font-bold text-muted">Draft (edit before you send)</label>
            <textarea id="draft" value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} className="mt-1 w-full rounded-2xl border-2 border-line bg-white p-3 font-semibold leading-relaxed outline-none focus:border-sky" />
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={gmail} target="_blank" rel="noreferrer" className="btn btn-primary min-h-10 px-4 text-xs"><ExternalLink size={15} aria-hidden /> Open in Gmail</a>
              <button onClick={() => navigator.clipboard?.writeText(draft)} className="btn btn-ghost min-h-10 px-4 text-xs"><Copy size={15} aria-hidden /> Copy</button>
              <button onClick={makeDraft} disabled={busy} className="btn btn-ghost min-h-10 px-4 text-xs">Redo</button>
            </div>
            <p className="mt-2 text-xs text-muted">Viva drafted this from your numbers and this email. You send it; Pathway never sends mail for you.</p>
          </>
        )}
      </div>
      <p className="mt-6 text-sm"><Link href={`/insights?course=${ctxArgs.courses.find((c) => c.code === m.course)?.slug ?? ""}`} className="font-bold text-teal underline underline-offset-4">See {m.course} in Insights</Link></p>
    </article>
  );
}
