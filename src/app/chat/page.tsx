import { PageHeader, Todo } from "@/components/ui";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Chat" lead="Ask anything. Answers come only from your own data and the model." />
      <div className="space-y-4">
        <Todo what="Coach conversation" wire="/api/coach (Gemini function calling: explain_path, recourse, make_plan, quiz_me) + causal-language filter" />
        <Todo what="Prefill from ?q= on Home" wire="read searchParams.q" />
      </div>
    </main>
  );
}
