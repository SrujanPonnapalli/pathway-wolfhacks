"use client";

// Small pieces both the Viva page and the mini Viva dock render under a message:
// the receipts of what Viva just did, and an email draft the student can copy or open.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePathway } from "@/lib/store";
import { BookMarked, CalendarClock, Check, Copy, Mail } from "lucide-react";
import type { Citation, EmailDraft, Proposal } from "@/lib/viva";

export function Receipts({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm font-bold text-teal-lip" aria-label="What Viva did">
      {items.map((r, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0" aria-hidden /> <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}

export function EmailCard({ email }: { email?: EmailDraft }) {
  const [copied, setCopied] = useState(false);
  if (!email) return null;
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email.to)}&su=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  const copy = () => {
    navigator.clipboard?.writeText(`Subject: ${email.subject}\n\n${email.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="mt-3 rounded-xl border-2 border-line bg-white p-3 text-sm text-ink">
      {email.to && (
        <p className="text-xs font-bold text-muted">
          To: <span className="text-ink">{email.to}</span>
        </p>
      )}
      {email.subject && <p className="mt-0.5 font-black">{email.subject}</p>}
      <p className="mt-2 whitespace-pre-wrap font-semibold leading-relaxed">{email.body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={copy} className="btn btn-ghost min-h-9 px-3 text-xs">
          <Copy size={14} aria-hidden /> {copied ? "Copied" : "Copy"}
        </button>
        <a href={gmail} target="_blank" rel="noreferrer" className="btn btn-ghost min-h-9 px-3 text-xs">
          <Mail size={14} aria-hidden /> Open in Gmail
        </a>
      </div>
      <p className="mt-2 text-xs text-muted">You send it. Pathway never sends mail for you.</p>
    </div>
  );
}

/** The facts Viva relied on, as chips. Each opens the receipt: the quoted sentence and where it came from. */
export function Citations({ items }: { items?: Citation[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items?.length) return null;
  const shown = items.find((c) => c.id === open);
  // Two facts can share a title (a midterm's weight and its date): then say where each came from.
  const label = (c: Citation) => {
    const base = c.title.length > 32 ? `${c.title.slice(0, 32)}…` : c.title;
    return items.filter((x) => x.title === c.title).length > 1 && c.locator ? `${base} · ${c.locator.replace(/^.*?·\s*/, "")}` : base;
  };
  return (
    <div className="mt-2" aria-label="Sources Viva used">
      <ul className="flex flex-wrap gap-1.5">
        {items.map((c) => (
          <li key={c.id}>
            <button onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${open === c.id ? "border-sky bg-white text-sky" : "border-sky/30 bg-white/70 text-sky hover:border-sky"}`}>
              <BookMarked size={12} aria-hidden /> {label(c)}
            </button>
          </li>
        ))}
      </ul>
      {shown && (
        <div className="mt-2 rounded-xl border border-sky/30 bg-white p-2.5 text-xs">
          <p className="font-black text-ink">{shown.title} <span className="font-bold text-muted">· {shown.course}</span></p>
          {shown.quote && <p className="mt-1 italic text-ink">“{shown.quote}”</p>}
          <p className="mt-1 text-muted">
            {shown.locator ? `From ${shown.locator}` : "From your course materials"}
            {shown.course && (
              <>
                {" · "}
                <Link href={`/courses?course=${shown.course.toLowerCase().replace(" ", "-")}&tab=facts&fact=${shown.id}`} className="font-extrabold text-sky">Open in Courses</Link>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A change Viva wants to make, waiting for the student: exactly what will happen, then Approve or Not now. Saying
 * or typing "yes" approves it too. Calendar changes open the Week once they're made, so the student sees them.
 */
export function ProposalCard({ proposal }: { proposal?: Proposal }) {
  const { approveProposal, dismissProposal } = usePathway();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!proposal) return null;
  const pending = proposal.status === "pending";
  return (
    <div className={`mt-2 rounded-xl border-2 p-2.5 ${pending ? "border-sky/40 bg-white" : "border-line bg-white/60"}`} aria-label={pending ? "Viva wants to make these changes" : undefined}>
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted">
        <CalendarClock size={13} className="text-sky" aria-hidden />
        {pending ? (proposal.calendar ? "Calendar changes, waiting for you" : "Waiting for you") : proposal.status === "approved" ? "Approved" : "Not made"}
      </p>
      <ul className={`mt-1.5 space-y-1 text-sm font-bold ${pending ? "text-ink" : "text-muted line-through decoration-line"}`}>
        {proposal.items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
      {pending && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const to = await approveProposal(proposal.id);
              setBusy(false);
              if (to) router.push(to);
            }}
            className="btn btn-sky min-h-9 px-3 text-xs"
          >
            <Check size={14} strokeWidth={3} aria-hidden /> {busy ? "Working…" : "Approve"}
          </button>
          <button disabled={busy} onClick={() => dismissProposal(proposal.id)} className="text-xs font-bold text-muted underline underline-offset-4 hover:text-ink">
            Not now
          </button>
          <span className="text-xs text-muted">or just say “yes”</span>
        </div>
      )}
    </div>
  );
}
