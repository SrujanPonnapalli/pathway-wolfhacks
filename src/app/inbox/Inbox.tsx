"use client";

// Course mail only. Read it, let Viva draft a reply, open the draft in Gmail. Pathway never
// sends on the student's behalf: the send button is Gmail's, not ours.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Copy, ExternalLink, Mail } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { PageHeader } from "@/components/ui";
import { askCoach, coachContext } from "@/lib/api";
import { inboxFor, type Mail as MailT } from "@/lib/inbox";
import { fmtDay, fmtTime, usePathway } from "@/lib/store";

export function Inbox() {
  const { courses, profile, now, state } = usePathway();
  const params = useSearchParams();
  const mail = inboxFor(courses.map((c) => c.code));
  const [openId, setOpenId] = useState<string | null>(params.get("open"));
  const open = mail.find((m) => m.id === openId) ?? null;

  return (
    <main className="mx-auto max-w-[760px] px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Inbox" lead="Only mail about your classes. Viva can draft a reply; you send it from Gmail." />
      {open ? (
        <Message m={open} onBack={() => setOpenId(null)} ctxArgs={{ courses, profile, now, state }} />
      ) : mail.length === 0 ? (
        <p className="text-muted">No course mail yet.</p>
      ) : (
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
      )}
    </main>
  );
}

type CtxArgs = { courses: ReturnType<typeof usePathway>["courses"]; profile: ReturnType<typeof usePathway>["profile"]; now: Date; state: ReturnType<typeof usePathway>["state"] };

function Message({ m, onBack, ctxArgs }: { m: MailT; onBack: () => void; ctxArgs: CtxArgs }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const makeDraft = async () => {
    setBusy(true);
    setErr("");
    try {
      const ctx = coachContext({ now: ctxArgs.now, studentName: ctxArgs.profile?.sample ? ctxArgs.profile.name : "", courses: ctxArgs.courses, todos: ctxArgs.profile?.todos ?? [], blocks: ctxArgs.state.blocks, sources: ctxArgs.state.sources, inbox: [{ from: m.from, subject: m.subject, course: m.course, snippet: m.body }] });
      const r = await askCoach(`Draft a short, polite reply email to ${m.from} about "${m.subject}". Email text: """${m.body}""". Write only the reply body (no subject line), 3 to 5 sentences, first person, ready to send. Use my schedule from the context if it helps pick a time.`, ctx, [], "draft");
      setDraft(r.text);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(m.from)}&su=${encodeURIComponent(`Re: ${m.subject}`)}&body=${encodeURIComponent(draft)}`;

  return (
    <article>
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm font-bold text-teal"><ArrowLeft size={16} aria-hidden /> All mail</button>
      <h2 className="text-xl font-extrabold leading-snug">{m.subject}</h2>
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
