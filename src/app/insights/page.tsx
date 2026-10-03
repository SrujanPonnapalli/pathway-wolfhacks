import { PageHeader, Todo } from "@/components/ui";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Insights" lead="Your trends, and exactly how good the model is." />
      <div className="space-y-4">
        <Todo what="Your weekly hours, late-night %, on-time rate" wire="/api/events GET → weekly_stats continuous aggregate (Recharts)" />
        <Todo what="Model evidence: baselines, recall, early vs. mid, capacity slider, fairness" wire="public/models/evidence.json from the notebook" />
      </div>
    </main>
  );
}
