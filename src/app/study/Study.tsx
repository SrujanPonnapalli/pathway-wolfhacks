"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Brain, Layers, Timer, type LucideIcon } from "lucide-react";
import { VivaGlyph } from "@/components/Viva";
import { PageHeader, Pending } from "@/components/ui";
import { usePathway } from "@/lib/store";

type Tool = { id: string; title: string; icon: LucideIcon; wire: string; action?: "quiz" | "session"; actionLabel?: string };
const TOOLS: Tool[] = [
  { id: "quiz", title: "Practice quiz", icon: Brain, wire: "Gemini writes questions from your slides (/api/syllabus).", action: "quiz", actionLabel: "Log a finished quiz" },
  { id: "flashcards", title: "Flashcards", icon: Layers, wire: "Gemini-made deck from your notes.", action: "session", actionLabel: "Log a review session" },
  { id: "timer", title: "Focus timer", icon: Timer, wire: "Start/stop timer; the Pathway Puck posts here too (/api/events).", action: "session", actionLabel: "Log a 25-minute session" },
];

export function Study() {
  const { courses, logQuiz, logSession } = usePathway();
  const params = useSearchParams();
  const [course, setCourse] = useState(params.get("course") ?? courses[0]?.slug ?? "");
  const focus = params.get("tool");

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Study" lead="Every quiz, review and session you log updates your status, right on this device.">
        <label className="flex items-center gap-2 font-extrabold">
          Course
          <select value={course} onChange={(e) => setCourse(e.target.value)} className="rounded-xl border-2 border-b-4 border-line bg-white px-3 py-2 font-extrabold">
            {courses.map((c) => (
              <option key={c.slug} value={c.slug}>{c.code}</option>
            ))}
          </select>
        </label>
      </PageHeader>
      <ul className="space-y-4">
        {TOOLS.map(({ id, title, icon: Icon, wire, action, actionLabel }) => (
          <li key={id} className={`panel p-5 ${focus === id ? "border-teal-face" : ""}`}>
            <h2 className="flex items-center gap-3 text-xl font-black">
              <Icon size={26} className="text-teal" aria-hidden /> {title}
            </h2>
            <div className="mt-3">
              <Pending what="The tool itself" wire={wire}>
                {action && course && (
                  <button onClick={() => (action === "quiz" ? logQuiz(course) : logSession(course))} className="btn btn-primary mt-4">
                    {actionLabel}
                  </button>
                )}
              </Pending>
            </div>
          </li>
        ))}
      </ul>
      <Link href="/viva?mode=voice" className="panel mt-4 flex items-center gap-4 p-5 hover:bg-polar">
        <VivaGlyph size={44} className="shrink-0 text-sky" />
        <span>
          <span className="block text-lg font-black">Want to talk it through?</span>
          <span className="block text-muted">Viva can quiz you, explain your status, or plan your week, by voice or chat.</span>
        </span>
      </Link>
    </main>
  );
}
