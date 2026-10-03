import { Check } from "lucide-react";
import type { Status } from "@/lib/mock";

// Shape + words, never color alone: filled check = on track, hollow ring = check-in.
export function StatusMark({ status, label = true }: { status: Status; label?: boolean }) {
  const on = status === "on_track";
  return (
    <span className={`inline-flex items-center gap-1.5 font-extrabold ${on ? "text-teal" : "text-sun-ink"}`}>
      {on ? (
        <span className="grid size-5 place-items-center rounded-full bg-teal text-white" aria-hidden>
          <Check size={13} strokeWidth={4} />
        </span>
      ) : (
        <span className="size-5 rounded-full border-[5px] border-sun" aria-hidden />
      )}
      {label ? (on ? "On track" : "Worth a check-in") : <span className="sr-only">{on ? "On track" : "Worth a check-in"}</span>}
    </span>
  );
}

export function PageHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-[2rem] font-black leading-tight tracking-tight text-balance">{title}</h1>
      <p className="mt-2 max-w-[60ch] text-lg text-muted">{lead}</p>
    </header>
  );
}

// Placeholder block for a feature that isn't built yet. Says what will live here and where its data comes from.
export function Todo({ what, wire }: { what: string; wire: string }) {
  return (
    <div className="rounded-[var(--radius-tile)] border-2 border-dashed border-line bg-polar p-6">
      <p className="font-extrabold">{what}</p>
      <p className="mt-1 text-sm text-muted">Wire up: {wire}</p>
    </div>
  );
}
