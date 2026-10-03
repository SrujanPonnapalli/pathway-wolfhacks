import { PageHeader, Todo } from "@/components/ui";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Friends" lead="Keep each other on track. Friends see effort, never your status." />
      <div className="space-y-4">
        <Todo what="Study streaks and plan blocks finished, side by side" wire="/api/events weekly_stats per friend" />
        <Todo what="Commit test tokens to this week's plan (stretch)" wire="Solana devnet; never real money" />
      </div>
    </main>
  );
}
