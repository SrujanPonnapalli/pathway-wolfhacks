"use client";

// Small pieces both the Viva page and the mini Viva dock render under a message:
// the receipts of what Viva just did, and an email draft the student can copy or open.

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import type { EmailDraft } from "@/lib/viva";

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
