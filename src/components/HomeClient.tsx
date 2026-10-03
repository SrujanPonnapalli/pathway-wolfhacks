"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronRight, FileUp } from "lucide-react";
import type { Todo } from "@/lib/mock";

export function DropZone() {
  const [over, setOver] = useState(false);
  const [filed, setFiled] = useState<string[]>([]);

  // TODO: POST files to /api/syllabus (Gemini classifies course + extracts dates).
  const take = (files: FileList | null) => files && setFiled(Array.from(files, (f) => `${f.name} → BIO 181`));

  return (
    <label
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => (e.preventDefault(), setOver(false), take(e.dataTransfer.files))}
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-tile)] border-2 border-dashed px-5 py-6 text-center transition-colors ${
        over ? "border-sky bg-sky-soft" : "border-line hover:bg-polar"
      }`}
    >
      <FileUp size={28} strokeWidth={2.4} className="text-sky" aria-hidden />
      <span className="font-extrabold">Drop syllabi, slides or notes</span>
      <span className="text-sm text-muted">We&apos;ll file each one under the right course.</span>
      <input type="file" multiple className="sr-only" onChange={(e) => take(e.target.files)} />
      {filed.length > 0 && (
        <ul className="mt-2 w-full space-y-1 text-left text-sm" aria-live="polite">
          {filed.map((f) => (
            <li key={f} className="truncate rounded-lg bg-teal-soft px-3 py-1.5 font-bold text-teal">
              {f}
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}

export function TodoList({ initial }: { initial: Todo[] }) {
  const [items, setItems] = useState(initial);
  const toggle = (id: string) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));

  return (
    <ul className="divide-y-2 divide-line">
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <button
            onClick={() => toggle(t.id)}
            aria-pressed={t.done}
            aria-label={t.done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
            className={`grid size-7 shrink-0 place-items-center rounded-lg border-2 border-b-4 transition-colors ${
              t.done ? "animate-[pop_250ms_ease-out] border-teal-lip bg-teal text-white" : "border-line bg-white hover:bg-polar"
            }`}
          >
            {t.done && <Check size={16} strokeWidth={4} />}
          </button>
          <Link href={t.href} className="group flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className={`block font-extrabold leading-snug ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
              <span className="block text-sm text-muted">{t.detail}</span>
            </span>
            <ChevronRight size={20} className="shrink-0 text-line transition-colors group-hover:text-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Client-only so the greeting matches the viewer's clock, not the server's.
export function Greeting({ name }: { name: string }) {
  const h = new Date().getHours();
  const hello = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return (
    <h1 suppressHydrationWarning className="text-[2rem] md:text-[2.5rem] font-black leading-[1.1] tracking-tight text-balance">
      {hello}, {name}
    </h1>
  );
}
