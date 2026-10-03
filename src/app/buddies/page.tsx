"use client";

import { useEffect, useState } from "react";
import { Gate, PageHeader, Pending } from "@/components/ui";
import { getBuddies } from "@/lib/data";
import { usePathway } from "@/lib/store";

type Buddy = Awaited<ReturnType<typeof getBuddies>>[number];

export default function Page() {
  return (
    <Gate>
      <Buddies />
    </Gate>
  );
}

function Buddies() {
  const { state, profile } = usePathway();
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  useEffect(() => void getBuddies().then(setBuddies), []);

  const me = { name: "You", streak: profile.streakDays, blocksDone: state.blocks.filter((b) => b.done).length, blocksPlanned: state.blocks.length };
  const board = [me, ...buddies].sort((a, b) => b.blocksDone - a.blocksDone);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Study buddies" lead="Keep each other going. Buddies see effort, like study blocks and streaks, never your status." />
      <section className="panel p-5" aria-labelledby="week">
        <h2 id="week" className="mb-4 text-lg font-black">This week&apos;s study blocks</h2>
        <ul className="space-y-4">
          {board.map((b) => (
            <li key={b.name}>
              <div className="flex items-baseline justify-between gap-3">
                <span className={`font-black ${b === me ? "text-grape" : ""}`}>{b.name}</span>
                <span className="text-sm font-bold text-muted">
                  {b.blocksDone} of {b.blocksPlanned} done · {b.streak}-day streak
                </span>
              </div>
              <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-grape" style={{ width: `${b.blocksPlanned ? (b.blocksDone / b.blocksPlanned) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-6">
        <Pending what="Pledge test tokens on this week's plan" wire="Solana devnet. Test tokens only, never real money; you get them back when you finish your plan." />
      </div>
    </main>
  );
}
