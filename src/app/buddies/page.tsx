"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  ShieldCheck,
  Check,
  Clock,
  Award,
  ChevronDown,
  ChevronUp,
  Wallet,
  ArrowUpRight,
} from "lucide-react";
import { Burst, Gate, PageHeader } from "@/components/ui";
import { getBuddies } from "@/lib/data";
import { usePathway } from "@/lib/store";

type Buddy = Awaited<ReturnType<typeof getBuddies>>[number];

// Mock Solana Devnet constants from docs/solana/PLAN.md
const MOCK_DEVNET_WALLET = "7xKZp8g3M4rV1N6t9W2sL0yB5dE7qU4mA8cF3hJ6vQ2";
const MOCK_POT_ADDRESS = "8yPZk9Fq2A1bX5C7mD3eR6wT4uV8nE9sL0pM1q2r3t4y";
const MOCK_SETTLE_TX = "4xL7kQ3vN8aZ1bX5C7mD3eR6wT4uV8nE9sL0pM1q2r3t4y";

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

  // Solana Mock State
  const [userJoined, setUserJoined] = useState(false);
  const [balance, setBalance] = useState(100);
  const [showRecap, setShowRecap] = useState(true);
  const [burstKey, setBurstKey] = useState(0);

  useEffect(() => void getBuddies(profile.id).then(setBuddies), [profile.id]);

  // Effort board data
  const me = {
    name: "You",
    streak: profile.streakDays,
    blocksDone: state.blocks.filter((b) => b.done).length,
    blocksPlanned: Math.max(state.blocks.length, 3), // ensure demo planned baseline
  };
  const board = [me, ...buddies].sort((a, b) => b.blocksDone - a.blocksDone);

  // Active Pot mock members (fixed 20 PATH stake)
  const initialMembers = [
    { name: "Maya", backed: 4, planned: 5, streak: 4 },
    { name: "Priya", backed: 3, planned: 4, streak: 9 },
    { name: "Sam", backed: 2, planned: 3, streak: 3 },
  ];

  const currentMembers = userJoined
    ? [
        ...initialMembers,
        {
          name: "You",
          backed: me.blocksDone,
          planned: me.blocksPlanned,
          streak: me.streak,
        },
      ]
    : initialMembers;

  const totalPot = currentMembers.length * 20;

  const handleJoin = () => {
    setUserJoined(true);
    setBalance((prev) => Math.max(0, prev - 20));
    setBurstKey((k) => k + 1);
  };

  const handleLeave = () => {
    setUserJoined(false);
    setBalance((prev) => prev + 20);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-10">
      <PageHeader
        title="Study buddies"
        lead="Keep each other going. Buddies see effort, like study blocks and streaks, never your status."
      >
        {/* Wallet & Allowance Pill */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-2xl border-2 border-line bg-polar px-3.5 py-2">
            <span className="flex size-2 rounded-full bg-teal animate-pulse" aria-hidden />
            <Wallet size={16} className="text-grape" aria-hidden />
            <span className="text-sm font-black text-ink">{balance} PATH</span>
            <span className="rounded-lg bg-grape-soft px-2 py-0.5 text-xs font-black text-grape">
              Devnet
            </span>
          </div>

          <a
            href={`https://explorer.solana.com/address/${MOCK_DEVNET_WALLET}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-2xl border-2 border-line bg-white px-3 py-2 text-xs font-bold text-muted transition-colors hover:text-ink"
            title="View wallet on Solana Explorer"
          >
            <span>{MOCK_DEVNET_WALLET.slice(0, 4)}...{MOCK_DEVNET_WALLET.slice(-4)}</span>
            <ArrowUpRight size={13} aria-hidden />
          </a>
        </div>
      </PageHeader>

      {/* 1. Active Weekly Study Pot (Grape Theme) */}
      <section
        className="panel relative mb-8 overflow-hidden border-2 border-grape/30 p-5 md:p-6 shadow-sm"
        aria-labelledby="active-pot-heading"
      >
        {burstKey > 0 && <Burst key={burstKey} />}
        
        {/* Top Header of Pot */}
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-line pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-grape text-white px-2.5 py-1 text-xs font-black uppercase tracking-wider">
                Active Study Pot
              </span>
              <span className="flex items-center gap-1 text-xs font-extrabold text-muted">
                <Clock size={13} aria-hidden /> Locks Monday 00:00 ET · 2d left
              </span>
            </div>
            <h2 id="active-pot-heading" className="mt-2 text-2xl font-black text-ink">
              This Week&apos;s Pot
            </h2>
          </div>

          <div className="flex items-baseline gap-3">
            <div className="text-right">
              <span className="block text-xs font-black uppercase tracking-wider text-muted">
                Total Staked
              </span>
              <span className="text-2xl font-black text-grape">{totalPot} PATH</span>
            </div>
            <a
              href={`https://explorer.solana.com/address/${MOCK_POT_ADDRESS}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-xl border-2 border-line bg-polar px-2.5 py-1.5 text-xs font-bold text-muted transition-colors hover:text-ink"
            >
              <span>Explorer</span>
              <ExternalLink size={12} aria-hidden />
            </a>
          </div>
        </div>

        {/* Pot Rules & Context */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-bold text-muted">
          <div className="rounded-xl bg-polar p-3">
            <span className="text-ink font-black block">Fixed Stake</span>
            20 PATH per member
          </div>
          <div className="rounded-xl bg-polar p-3">
            <span className="text-ink font-black block">Target Rule</span>
            Finish ≥80% of planned study blocks
          </div>
          <div className="rounded-xl bg-polar p-3">
            <span className="text-ink font-black block">Sunday Settle</span>
            Finishers split forfeits equally
          </div>
        </div>

        {/* Member Progress Bars */}
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between text-xs font-extrabold text-muted">
            <span className="uppercase tracking-wider">Members ({currentMembers.length})</span>
            <span>Target: 80% line</span>
          </div>

          {currentMembers.map((m) => {
            const pct = Math.min(100, Math.round((m.backed / m.planned) * 100));
            const isFinishing = pct >= 80;
            const isMe = m.name === "You";

            return (
              <div key={m.name} className={`rounded-xl p-3 ${isMe ? "bg-grape-soft/60 border border-grape/20" : "bg-polar"}`}>
                <div className="flex items-center justify-between text-sm">
                  <span className={`font-black flex items-center gap-2 ${isMe ? "text-grape" : "text-ink"}`}>
                    {m.name}
                    {isMe && <span className="rounded bg-grape text-white text-[10px] px-1.5 py-0.2 uppercase">You</span>}
                    {isFinishing && (
                      <span className="inline-flex items-center gap-1 text-xs font-extrabold text-teal">
                        <Check size={14} strokeWidth={3} aria-hidden /> Finish line reached
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-extrabold text-muted">
                    {m.backed} of {m.planned} backed blocks ({pct}%)
                  </span>
                </div>

                {/* Progress bar with 80% threshold marker */}
                <div className="relative mt-2 h-3.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${isFinishing ? "bg-teal" : "bg-grape"}`}
                    style={{ width: `${pct}%` }}
                  />
                  {/* 80% marker line */}
                  <div
                    className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-ink/50 z-10"
                    title="80% qualification threshold"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Join / Leave Interaction Bar */}
        <div className="mt-6 border-t-2 border-line pt-4 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted max-w-md">
            {userJoined
              ? "You're in! You have staked 20 PATH. Complete at least 80% of your planned study blocks by Sunday night to qualify for the split."
              : "Stakes are locked on Monday at 00:00 ET. If everyone finishes, all stakes are fully refunded."}
          </p>

          <div>
            {userJoined ? (
              <button
                type="button"
                onClick={handleLeave}
                className="btn btn-ghost text-xs"
              >
                Leave Pot · Refund 20 PATH
              </button>
            ) : (
              <button
                type="button"
                onClick={handleJoin}
                className="btn bg-grape text-white border-b-[5px] border-[#6035b8] hover:brightness-105 active:translate-y-[3px] active:border-b-[2px] text-xs font-black"
              >
                Join Pot · Stake 20 PATH
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. Last Week's Recap (Settled Pot) */}
      <section className="panel mb-8 p-5" aria-labelledby="recap-heading">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award size={18} className="text-grape" aria-hidden />
            <h2 id="recap-heading" className="text-lg font-black text-ink">
              Last Week&apos;s Settle Recap
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowRecap(!showRecap)}
            className="flex items-center gap-1 text-xs font-bold text-muted hover:text-ink"
            aria-expanded={showRecap}
          >
            <span>{showRecap ? "Hide" : "Show"}</span>
            {showRecap ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showRecap && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted">
              Pot settled on Sunday, Oct 4. Maya and Priya finished their plans (≥80%), splitting Jordan&apos;s 20 PATH forfeit.
            </p>

            <div className="rounded-xl border border-line bg-polar p-3.5 text-xs font-bold space-y-2">
              <div className="flex justify-between items-center text-ink">
                <span>Maya (5/5 blocks · 100%)</span>
                <span className="font-black text-teal">+30 PATH returned (split bonus)</span>
              </div>
              <div className="flex justify-between items-center text-ink">
                <span>Priya (4/5 blocks · 80%)</span>
                <span className="font-black text-teal">+30 PATH returned (split bonus)</span>
              </div>
              <div className="flex justify-between items-center text-muted">
                <span>Jordan (2/5 blocks · 40%)</span>
                <span className="font-extrabold text-sun-ink">20 PATH forfeited</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <span className="text-muted">Jordan&apos;s next week is a fresh start with 100 new PATH.</span>
              <a
                href={`https://explorer.solana.com/tx/${MOCK_SETTLE_TX}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-grape font-bold hover:underline"
              >
                <span>View settle tx</span>
                <ExternalLink size={12} aria-hidden />
              </a>
            </div>
          </div>
        )}
      </section>

      {/* 3. Overall Study Blocks Effort Leaderboard */}
      <section className="panel mb-8 p-5" aria-labelledby="week">
        <h2 id="week" className="mb-4 text-lg font-black">
          This week&apos;s study blocks
        </h2>
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
                <div
                  className="h-full rounded-full bg-grape"
                  style={{ width: `${b.blocksPlanned ? (b.blocksDone / b.blocksPlanned) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* 4. Responsible Design & Trust Model Footer */}
      <footer className="rounded-2xl border-2 border-line bg-polar p-5 text-xs text-muted space-y-2">
        <div className="flex items-center gap-2 font-black text-ink">
          <ShieldCheck size={16} className="text-teal" aria-hidden />
          <span>Solana Devnet &middot; Responsible Study Pots</span>
        </div>
        <p>
          <strong>PATH is a Solana devnet test token.</strong> It has no real monetary value, cannot be bought or sold, and exists solely as a friendly accountability commitment between study buddies.
        </p>
        <p>
          <strong>Trust model:</strong> The on-chain program holds stakes in escrow and guarantees funds can only be returned to members or split according to fixed completion rules. Pathway attests block completion from study events logged in your private dashboard. No academic risk scores or model predictions ever touch the blockchain.
        </p>
      </footer>
    </main>
  );
}
