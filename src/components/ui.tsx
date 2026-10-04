"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { usePathway } from "@/lib/store";

// Shape + words, never color alone: filled check = on track, hollow ring = worth a check-in.
export function StatusMark({ atRisk, label = true, size = 20 }: { atRisk: boolean; label?: boolean; size?: number }) {
  const text = atRisk ? "Worth a check-in" : "On track";
  return (
    <span className={`inline-flex items-center gap-1.5 font-extrabold ${atRisk ? "text-sun-ink" : "text-teal"}`}>
      {atRisk ? (
        <span className="rounded-full border-sun" style={{ width: size, height: size, borderWidth: size / 4 }} aria-hidden />
      ) : (
        <span className="grid place-items-center rounded-full bg-teal text-white" style={{ width: size, height: size }} aria-hidden>
          <Check size={size * 0.65} strokeWidth={4} />
        </span>
      )}
      {label ? text : <span className="sr-only">{text}</span>}
    </span>
  );
}

export function PageHeader({ title, lead, icon, className = "", children }: { title: ReactNode; lead?: ReactNode; icon?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <header className={`mb-8 flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <h1 className="text-[2rem] font-black leading-tight tracking-tight text-balance md:text-[2.5rem]">{title}</h1>
          {lead && <p className="mt-2 max-w-[60ch] text-lg text-muted">{lead}</p>}
        </div>
      </div>
      {children}
    </header>
  );
}

/** A section's heading, with an optional small "see more" link (or a short note) on the right. */
export function SectionHeading({ id, children, action, note }: { id?: string; children: ReactNode; action?: { href: string; label: ReactNode }; note?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 id={id} className="text-xl font-black leading-snug">{children}</h2>
      {note && <span className="text-xs font-bold text-muted">{note}</span>}
      {action && (
        <Link href={action.href} className="shrink-0 text-xs font-extrabold uppercase tracking-wider text-teal hover:text-teal-lip">
          {action.label}
        </Link>
      )}
    </div>
  );
}

// A feature that isn't built yet: says what will live here and what to wire it to.
export function Pending({ what, wire, children }: { what: string; wire: string; children?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-tile)] border-2 border-dashed border-line bg-polar p-5">
      <p className="font-extrabold">{what}</p>
      <p className="mt-1 text-sm text-muted">Not connected yet: {wire}</p>
      {children}
    </div>
  );
}

/** One glowing placeholder bar. Size and shape it with classes (h-4 w-40, rounded-2xl…). */
export function Bone({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-full bg-line/70 ${className}`} aria-hidden />;
}

/** A page-shaped stand-in while the app loads: a title and cards (narrow), or chips, stat tiles and a panel (wide). */
export function PageSkeleton({ wide = false, label = "Loading your classes" }: { wide?: boolean; label?: string }) {
  return (
    <main className={`mx-auto px-4 py-6 md:px-10 md:py-10 ${wide ? "max-w-wide" : "max-w-narrow"}`} aria-busy="true" aria-label={label}>
      <p className="sr-only" aria-live="polite">{label}…</p>
      <Bone className="h-10 w-56 rounded-2xl md:h-12" />
      <Bone className="mt-3 h-5 w-full max-w-md" />
      <div className="mt-6 flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-9 w-24 rounded-xl" />
        ))}
      </div>
      {wide ? (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="panel space-y-3 p-4">
                <Bone className="h-3.5 w-20" />
                <Bone className="h-7 w-24" />
                <Bone className="h-3.5 w-full" />
              </div>
            ))}
          </div>
          <div className="panel mt-4 space-y-3 p-5">
            <Bone className="h-6 w-40" />
            {[0, 1, 2, 3].map((i) => (
              <Bone key={i} className="h-4 w-full" />
            ))}
          </div>
        </>
      ) : (
        <div className="mt-8 space-y-4">
          <div className="panel space-y-3 p-5">
            <Bone className="h-6 w-2/3" />
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-5/6" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 pt-2">
                <Bone className="size-5 shrink-0" />
                <Bone className="h-4 flex-1" />
                <Bone className="h-8 w-16 rounded-xl" />
              </div>
            ))}
          </div>
          <Bone className="h-12 w-full rounded-2xl" />
        </div>
      )}
    </main>
  );
}

// Renders children once the model and profiles have loaded; otherwise a page-shaped placeholder or an error.
export function Gate({ children, wide = false, fallback }: { children: ReactNode; wide?: boolean; fallback?: ReactNode }) {
  const { ready, error } = usePathway();
  if (error)
    return (
      <div role="alert" className="panel mx-auto mt-10 max-w-lg border-sun p-6">
        <p className="text-lg font-black">Couldn&apos;t load the model</p>
        <p className="mt-1 text-muted">{error}. Check that the tree JSON files exist in public/models, then reload.</p>
      </div>
    );
  if (!ready) return fallback ?? <PageSkeleton wide={wide} />;
  return <>{children}</>;
}

export function Toast() {
  const { toast, dismissToast } = usePathway();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 6000);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-24 z-30 flex justify-center md:inset-x-auto md:right-6 md:bottom-6">
      {toast && (
        <p key={toast.id} className="pointer-events-auto flex max-w-md animate-[rise_220ms_ease-out] items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-[0_8px_24px_rgb(0_0_0/0.18)]">
          <span className="flex-1">{toast.text}</span>
          <button onClick={dismissToast} aria-label="Dismiss" className="text-white/70 hover:text-white">
            <X size={18} />
          </button>
        </p>
      )}
    </div>
  );
}

// A short burst of confetti dots; remount with a new key to replay.
export function Burst() {
  const colors = ["bg-teal-face", "bg-sun", "bg-sky", "bg-grape", "bg-flame"];
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          className={`absolute size-2.5 rounded-full ${colors[i % colors.length]} animate-[burst_700ms_ease-out_forwards]`}
          style={{ ["--a" as string]: `${(360 / 14) * i}deg` }}
        />
      ))}
    </span>
  );
}
