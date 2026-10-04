"use client";

// Study's "To review" list: key ideas a Teach session with Viva found fuzzy or missing. Each one
// becomes a quiz or a deck from the same course file, focused on exactly those ideas, so the
// questions stay grounded in the class material.

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { CircleDashed, GraduationCap, X } from "lucide-react";
import type { CourseDoc } from "@/lib/coursework-data";
import { usePathway } from "@/lib/store";
import type { ReviewItem } from "@/lib/teach";

export function ReviewList({ course, tool, busy, docs, onPick }: { course: string; tool: string; busy: boolean; docs: CourseDoc[]; onPick: (file: File, focus: string) => void }) {
  const { state, removeReview } = usePathway();
  const params = useSearchParams();
  const items = (state.toReview ?? []).filter((r) => r.course === course);

  // The file it reads: the course file the ideas came from (else just the ideas), aimed at what was missed.
  const start = (r: ReviewItem) => {
    const d = r.doc && docs.find((x) => x.id === r.doc?.id);
    const text = d ? `${d.title}\n\n${d.body}` : `${r.topic}\n\nKey ideas:\n${r.points.map((p) => `- ${p.text}`).join("\n")}`;
    onPick(new File([text], `${r.topic}.txt`, { type: "text/plain" }), `${r.topic}, especially: ${r.points.map((p) => p.text).join("; ")}`);
  };

  // Arriving from Teach's summary (?review=<id>): start that one right away.
  const wanted = params.get("review");
  const started = useRef("");
  useEffect(() => {
    if (!wanted || started.current === wanted) return;
    const r = items.find((x) => x.id === wanted);
    if (!r) return;
    const t = setTimeout(() => {
      started.current = wanted;
      start(r);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, items.length]);

  if (!items.length) return null;
  return (
    <div className="mb-3 rounded-2xl border-2 border-sky/30 bg-sky-soft/30 p-3">
      <p className="flex items-center gap-2 px-1 text-sm font-bold">
        <GraduationCap size={16} className="text-sky" aria-hidden /> To review, from teaching Viva
      </p>
      <ul className="mt-1 divide-y divide-line/70">
        {items.map((r) => (
          <li key={r.id} className="flex items-start gap-3 py-2">
            <CircleDashed size={18} className="mt-0.5 shrink-0 text-sun-ink" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{r.topic}</span>
              <span className="block text-xs text-muted">
                {r.points.length} idea{r.points.length === 1 ? "" : "s"} to work on{r.doc ? ` · ${r.doc.title}` : ""}
              </span>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
                {r.points.map((p) => (
                  <li key={p.text}>
                    {p.text}
                    {p.status === "vague" && <span className="font-bold"> (fuzzy)</span>}
                  </li>
                ))}
              </ul>
            </span>
            <button onClick={() => start(r)} disabled={busy} className="btn btn-ghost min-h-9 shrink-0 px-3 text-xs disabled:opacity-60">
              {tool === "flashcards" ? "Make a deck" : "Quiz me"}
            </button>
            <button
              onClick={() => removeReview(r.id)}
              aria-label={`Remove ${r.topic} from review`}
              title="Remove"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-polar hover:text-ink"
            >
              <X size={16} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
