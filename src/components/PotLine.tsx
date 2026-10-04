"use client";

// One quiet grape line about Study Pots, used on Home and after Make It Real. In a pot: how many
// blocks keep your stake. Not in one but planning: offer to put PATH on the plan. Otherwise nothing.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins } from "lucide-react";
import { getPots, potAction, type PotsView } from "@/lib/data";
import { blocksToGo } from "@/lib/solana/payout";
import { useNow } from "@/lib/solana/live";
import { usePathway } from "@/lib/store";

export function PotLine({ offer = false }: { offer?: boolean }) {
  const { profile, state } = usePathway();
  const [view, setView] = useState<PotsView | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const now = useNow();
  // Refetch when blocks change: Make It Real adds to the plan, finishing one backs it.
  const blockKey = state.blocks.map((b) => `${b.id}${b.done ? 1 : 0}`).join();
  useEffect(() => {
    const t = setTimeout(() => getPots(profile.id).then(setView), 1500); // after the block write lands
    return () => clearTimeout(t);
  }, [profile.id, blockKey]);

  if (!view) return null;
  const pot = view.pots.find((p) => p.mine && p.phase === "open");
  const cls = "mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 border-grape/25 bg-grape-soft/50 px-4 py-2.5 text-sm font-bold";

  if (pot) {
    const me = pot.members.find((m) => m.id === profile.id)!;
    const togo = blocksToGo(me.planned, me.backed);
    const who = pot.members.filter((m) => m.id !== profile.id).map((m) => m.name).join(" & ");
    const text = me.planned === 0 ? `Plan some study blocks for your ${pot.stake} PATH Study Pot with ${who}.` : togo === 0 ? `Plan finished: your ${pot.stake} PATH is safe in the pot with ${who}.` : `${togo} more study ${togo === 1 ? "block keeps" : "blocks keep"} your ${pot.stake} PATH in the pot with ${who}.`;
    return (
      <p className={cls}>
        <Coins size={16} className="shrink-0 text-grape" aria-hidden />
        <span className="flex-1">{text}</span>
        <Link href="/buddies" className="text-grape underline underline-offset-4">Study Pot</Link>
      </p>
    );
  }

  const join = view.pots.find((p) => !p.mine && p.phase === "open" && Date.parse(p.lockAt) > now && p.members.length < 6);
  const stake = join?.stake ?? 20;
  if (!offer || state.blocks.length === 0 || view.wallet.balance < stake) return null;
  const go = async () => {
    setBusy(true);
    try {
      await potAction(join ? { profile_id: profile.id, action: "join", pot: join.address } : { profile_id: profile.id, action: "create", stake });
      setView(await getPots(profile.id));
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <p className={cls}>
      <Coins size={16} className="shrink-0 text-grape" aria-hidden />
      <span className="flex-1">
        {note || `Put ${stake} PATH on this plan? ${join ? `${join.members.map((m) => m.name).join(" & ")} have a Study Pot open.` : "Start a Study Pot your buddies can join."}`}
      </span>
      <button onClick={go} disabled={busy} className="text-grape underline underline-offset-4 disabled:opacity-60">
        {busy ? "Confirming on Solana…" : join ? "Join their pot" : "Start a pot"}
      </button>
    </p>
  );
}
