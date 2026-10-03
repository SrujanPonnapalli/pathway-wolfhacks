"use client";

import { type FormEvent } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { Gate, PageHeader } from "@/components/ui";
import { usePathway } from "@/lib/store";

export default function Page() {
  return (
    <Gate>
      <Chat />
    </Gate>
  );
}

function Chat() {
  const { state, sendChat } = usePathway();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (q) sendChat(q);
    e.currentTarget.reset();
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Chat" lead="Ask about your classes. Answers use only your own numbers and the model." />
      <ol className="flex-1 space-y-3" aria-live="polite">
        {state.chat.length === 0 && <li className="text-muted">No messages yet. Try “What should I focus on this week?”</li>}
        {state.chat.map((m, i) => (
          <li key={i} className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === "you" ? "ml-auto bg-teal-soft text-teal-lip" : "border-2 border-sky/30 bg-sky-soft"}`}>
            {m.role === "coach" && (
              <span className="mb-1 flex items-center gap-1.5 text-sm font-black text-sky">
                <Sparkles size={15} aria-hidden /> Coach
              </span>
            )}
            {m.text}
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="sticky bottom-24 mt-6 flex items-center gap-2 rounded-2xl border-2 border-line bg-white p-1.5 pl-4 focus-within:border-sky md:bottom-6">
        <label htmlFor="q" className="sr-only">Message</label>
        <input id="q" name="q" autoComplete="off" placeholder="Ask anything about your classes…" className="min-w-0 flex-1 bg-transparent py-2 font-bold outline-none placeholder:text-muted" />
        <button className="btn btn-sky min-h-10 px-3" aria-label="Send">
          <ArrowUp size={20} strokeWidth={3} />
        </button>
      </form>
      <p className="mt-2 text-sm text-muted">AI answers (Gemini) can be wrong. The coach never sees anything you haven&apos;t logged here.</p>
    </main>
  );
}
