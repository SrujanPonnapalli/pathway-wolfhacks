"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Award, Check, CircleDashed, ExternalLink, Link2, LogIn, LogOut, Radio, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Friends } from "@/components/Friends";
import { Burst, Gate, PageHeader, Pending } from "@/components/ui";
import { getBuddies, getPots, potAction, type Pot, type PotsView } from "@/lib/data";
import { blocksToGo, finished } from "@/lib/solana/payout";
import { useNow, watchPots, type ChainPot } from "@/lib/solana/live";
import { usePathway } from "@/lib/store";

type Buddy = Awaited<ReturnType<typeof getBuddies>>[number];
type Notice = { text: string; sig?: string; error?: boolean };

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const txUrl = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const addrUrl = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const weekLabel = (monday: string) => `Week of ${new Date(`${monday}T12:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
function until(iso: string, now: number) {
  const m = Math.round((Date.parse(iso) - now) / 60_000);
  if (m <= 0) return "now";
  if (m < 60) return `in ${m} min`;
  if (m < 48 * 60) return `in ${Math.round(m / 60)} h`;
  return `in ${Math.round(m / 1440)} days`;
}
function ago(iso: string, now: number) {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  return s < 60 ? `${Math.max(1, s)}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
}

export default function Page() {
  return (
    <Gate>
      <ForProfile />
    </Gate>
  );
}

// Keyed by profile, so switching profiles starts from a clean slate.
function ForProfile() {
  const { profile } = usePathway();
  return <Buddies key={profile.id} />;
}

function Buddies() {
  const { state, profile } = usePathway();
  const now = useNow();
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [view, setView] = useState<PotsView | null | undefined>(undefined); // undefined: loading, null: unavailable
  const [onchain, setOnchain] = useState<Record<string, ChainPot>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [burst, setBurst] = useState(0);

  const loadBuddies = useCallback(() => getBuddies(profile.id).then(setBuddies), [profile.id]);
  useEffect(() => void loadBuddies(), [loadBuddies]);

  const refresh = useCallback(() => getPots(profile.id).then(setView), [profile.id]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (!view?.wallet.allowancePending) return;
    const t = setTimeout(refresh, 4000); // this week's 100 PATH is being minted
    return () => clearTimeout(t);
  }, [view, refresh]);

  // Live: subscribe to every open pot on devnet. A confirmed change refreshes the page's data.
  const recap = view?.pots.find((p) => p.mine && p.phase !== "open");
  const watched = [...(view?.pots.filter((p) => p.phase === "open") ?? []), ...(recap ? [recap] : [])].map((p) => p.address).join(",");
  useEffect(
    () =>
      watchPots(watched ? watched.split(",") : [], (address, pot, changed) => {
        setOnchain((s) => ({ ...s, [address]: pot }));
        if (changed) refresh();
      }),
    [watched, refresh],
  );

  const act = async (key: string, body: Parameters<typeof potAction>[0], done: string) => {
    setBusy(key);
    setNotice(null);
    try {
      const r = await potAction(body);
      setNotice({ text: `${done} Confirmed on Solana devnet in ${r.seconds.toFixed(1)} s.`, sig: r.sig });
      if (body.action !== "leave") setBurst((k) => k + 1);
      await refresh();
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    } finally {
      setBusy(null);
    }
  };

  const mine = view?.pots.filter((p) => p.mine) ?? [];
  const open = mine.filter((p) => p.phase === "open");
  const joinable = view?.pots.filter((p) => !p.mine && p.phase === "open" && Date.parse(p.lockAt) > now && p.members.length < 6) ?? [];
  const canStart = !!view && !mine.some((p) => p.weekStart === view.upcoming.weekStart);

  // Effort board (study blocks this week): you and your buddies.
  const me = { name: "You", streak: profile.streakDays, blocksDone: state.blocks.filter((b) => b.done).length, blocksPlanned: state.blocks.length };
  const board = [me, ...buddies].sort((a, b) => b.blocksDone - a.blocksDone);

  return (
    <main className="relative mx-auto max-w-narrow px-4 py-6 md:px-10 md:py-10">
      {burst > 0 && <Burst key={burst} />}
      <PageHeader title="Study buddies" lead="Keep each other going. Buddies see effort, like study blocks and streaks, never your status.">
        {view ? <WalletChip wallet={view.wallet} /> : view === undefined && <span className="h-11 w-56 animate-pulse rounded-2xl bg-line/70" aria-hidden />}
      </PageHeader>

      {notice && (
        <p role="status" className={`mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 px-4 py-3 text-sm font-bold ${notice.error ? "border-sun bg-sun-soft text-sun-ink" : "border-grape/30 bg-grape-soft text-ink"}`}>
          <span className="flex-1">{notice.text}</span>
          {notice.sig && (
            <a href={txUrl(notice.sig)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-grape underline underline-offset-4">
              View transaction <ExternalLink size={13} aria-hidden />
            </a>
          )}
        </p>
      )}

      {/* Buddies and requests first, so a waiting request is the first thing on the page. */}
      <Friends
        onChange={() => {
          void loadBuddies();
          void refresh();
        }}
      />

      {view === undefined && <PotSkeleton />}
      {view === null && (
        <div className="mb-8">
          <Pending what="Study Pots" wire="they need the database and Solana devnet (see docs/solana/README.md). Your study blocks below still count." />
        </div>
      )}

      {open.map((p) => (
        <PotCard key={p.address} pot={p} chain={onchain[p.address]} me={profile.id} now={now} busy={busy} onLeave={() => act(`leave-${p.address}`, { profile_id: profile.id, action: "leave", pot: p.address }, `Left the pot; ${p.stake} PATH refunded.`)} />
      ))}

      {view && canStart && (
        <section className="panel mb-8 border-2 border-grape/30 p-5 md:p-6" aria-labelledby="start-pot">
          <h2 id="start-pot" className="text-xl font-black">
            Study Pot · <span className="text-grape">{weekLabel(view.upcoming.weekStart)}</span>
          </h2>
          <p className="mt-1 max-w-[60ch] text-muted">
            Stake PATH on finishing your study plan. Finish 80% of the blocks you planned and you keep your stake, plus a share of any stake from buddies who don&apos;t. If everyone or no one finishes, everyone&apos;s refunded. Joining and leaving are free until {when(view.upcoming.lockAt)}.
          </p>
          {joinable.map((p) => (
            <div key={p.address} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-grape-soft/60 p-4">
              <div>
                <p className="font-black">{p.members.map((m) => m.name).join(" & ")}&apos;s pot</p>
                <p className="text-sm font-bold text-muted">
                  {p.stake} PATH each · {p.members.length} of 6 · locks {until(p.lockAt, now)}
                </p>
              </div>
              <button className="btn btn-grape min-h-11 text-xs" disabled={!!busy} onClick={() => act(`join-${p.address}`, { profile_id: profile.id, action: "join", pot: p.address }, `You're in. ${p.stake} PATH staked on your plan.`)}>
                <LogIn size={16} aria-hidden /> {busy === `join-${p.address}` ? "Confirming…" : `Join · stake ${p.stake} PATH`}
              </button>
            </div>
          ))}
          <StartPot busy={busy} first={!joinable.length} onStart={(stake) => act("create", { profile_id: profile.id, action: "create", stake }, `Pot started with ${stake} PATH. Buddies can join until Monday.`)} />
        </section>
      )}

      {recap && <Recap pot={recap} chain={onchain[recap.address]} me={profile.id} />}


      <section className="panel mb-8 p-5" aria-labelledby="week">
        <h2 id="week" className="mb-4 text-xl font-black">
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
                <div className="h-full rounded-full bg-grape" style={{ width: `${b.blocksPlanned ? (b.blocksDone / b.blocksPlanned) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="space-y-2 rounded-2xl border-2 border-line bg-polar p-5 text-xs text-muted">
        <p className="flex items-center gap-2 font-black text-ink">
          <ShieldCheck size={16} className="text-teal" aria-hidden /> How Study Pots work
        </p>
        <p>
          <strong>PATH is a Solana devnet test token.</strong> It has no value and can&apos;t be bought, sold or cashed out. Every student gets 100 PATH a week; you can only lose what you stake.
        </p>
        <p>
          <strong>The program holds the pot.</strong> Stakes sit in an on-chain escrow that can only pay pot members, by the split rule. Nobody, including Pathway, can withdraw it. After the week, anyone can trigger settlement, and the program itself works out who finished.
        </p>
        <p>
          <strong>Pathway attests effort.</strong> When you plan or finish a study block, Pathway&apos;s server records your planned and backed block counts on-chain within seconds. After the lock, your plan is frozen and finished blocks can&apos;t be taken back. Only wallet addresses, block counts and amounts go on-chain: no names, courses or status.
        </p>
        <p>
          <strong>Your wallet is app-made.</strong> Pathway holds its key (encrypted) and signs for you, which is fine for a test token. Connecting your own wallet is next.
        </p>
      </footer>
    </main>
  );
}

function WalletChip({ wallet }: { wallet: PotsView["wallet"] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-2 rounded-2xl border-2 border-line bg-white px-3.5 py-2">
        <Wallet size={16} className="text-grape" aria-hidden />
        <span className="text-sm font-black tabular-nums">{wallet.balance} PATH</span>
        <span className="rounded-lg bg-grape-soft px-2 py-0.5 text-xs font-black text-grape">Devnet</span>
      </div>
      <a href={wallet.explorer} target="_blank" rel="noreferrer" title="Your wallet on Solana Explorer" className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-line bg-white px-3 py-2 text-xs font-bold text-muted hover:text-ink">
        {short(wallet.address)} <ArrowUpRight size={13} aria-hidden />
      </a>
      {wallet.allowancePending && <span className="text-xs font-bold text-grape" aria-live="polite">Adding this week&apos;s 100 PATH…</span>}
    </div>
  );
}

function StartPot({ busy, first, onStart }: { busy: string | null; first: boolean; onStart: (stake: number) => void }) {
  const [stake, setStake] = useState(20);
  return (
    <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 ${first ? "" : "border-t-2 border-line pt-4"}`}>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Stake per member</legend>
        <span className="mr-1 text-sm font-bold text-muted">{first ? "Start a pot:" : "Or start your own:"}</span>
        {[10, 20, 30, 50].map((s) => (
          <label key={s} className={`cursor-pointer rounded-xl border-2 px-3 py-1.5 text-sm font-black ${stake === s ? "border-grape bg-grape-soft text-grape" : "border-line text-muted hover:text-ink"}`}>
            <input type="radio" name="stake" value={s} checked={stake === s} onChange={() => setStake(s)} className="sr-only" />
            {s} PATH
          </label>
        ))}
      </fieldset>
      <button className={`btn min-h-11 text-xs ${first ? "btn-grape" : "btn-ghost"}`} disabled={!!busy} onClick={() => onStart(stake)}>
        <Sparkles size={16} aria-hidden /> {busy === "create" ? "Confirming…" : "Start a pot"}
      </button>
    </div>
  );
}

function PotCard({ pot, chain, me, now, busy, onLeave }: { pot: Pot; chain?: ChainPot; me: string; now: number; busy: string | null; onLeave: () => void }) {
  const locked = Date.parse(pot.lockAt) <= now;
  const inPot = pot.members.some((m) => m.id === me);
  return (
    <section className="panel mb-8 border-2 border-grape/30 p-5 md:p-6" aria-labelledby={`pot-${pot.address}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-line pb-4">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-muted">
            <span className="rounded-lg bg-grape px-2.5 py-1 font-black uppercase tracking-wider text-white">Study Pot</span>
            {locked ? `Locked · settles ${when(pot.settleAfter)} (${until(pot.settleAfter, now)})` : `Open · locks ${when(pot.lockAt)} (${until(pot.lockAt, now)})`}
          </p>
          <h2 id={`pot-${pot.address}`} className="mt-2 text-2xl font-black">
            {weekLabel(pot.weekStart)}
          </h2>
        </div>
        <div className="text-right">
          <p className="text-xs font-black uppercase tracking-wider text-muted">In the pot</p>
          <p className="text-2xl font-black tabular-nums text-grape">{pot.stake * pot.members.length} PATH</p>
          <a href={addrUrl(pot.address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-muted underline underline-offset-4 hover:text-ink">
            Escrow on Solana Explorer <ExternalLink size={12} aria-hidden />
          </a>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted">
        {pot.stake} PATH each. Finish 80% of the study blocks you planned for the week. Finishers split the stakes of anyone who doesn&apos;t; if everyone or no one finishes, everyone&apos;s refunded.
      </p>

      <ul className="mt-5 space-y-3">
        {pot.members.map((m) => {
          const c = chain?.members[m.wallet];
          const planned = c?.planned ?? m.planned;
          const backed = c?.backed ?? m.backed;
          const synced = c && c.planned === m.planned && c.backed === m.backed;
          const done = finished(planned, backed);
          const isMe = m.id === me;
          return (
            <li key={m.id} className={`rounded-xl p-3 ${isMe ? "border border-grape/20 bg-grape-soft/60" : "bg-polar"}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                <span className={`flex items-center gap-2 font-black ${isMe ? "text-grape" : ""}`}>
                  {isMe ? "You" : m.name}
                  {done && (
                    <span className="inline-flex items-center gap-1 text-xs font-extrabold text-teal">
                      <Check size={14} strokeWidth={3} aria-hidden /> Plan finished
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 text-xs font-extrabold text-muted">
                  {planned === 0 ? "No blocks planned yet" : `${backed} of ${planned} blocks backed${done ? "" : ` · ${blocksToGo(planned, backed)} to go`}`}
                  {c?.frozen && <span title="Plan frozen at the lock">· plan locked</span>}
                  {!c && (
                    <span className="inline-flex items-center gap-1 text-muted" title="Reading this pot's account on Solana devnet">
                      <CircleDashed size={12} className="animate-spin" aria-hidden /> reading devnet…
                    </span>
                  )}
                  {c && (synced ? (
                    <span className="inline-flex items-center gap-1 text-teal" title="These numbers are read live from the pot's on-chain account">
                      <Link2 size={12} aria-hidden /> on-chain
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-grape">
                      <CircleDashed size={12} className="animate-spin" aria-hidden /> attesting…
                    </span>
                  ))}
                </span>
              </div>
              <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-line" role="img" aria-label={`${backed} of ${planned} planned blocks backed; the finish line is 80%`}>
                <div className={`h-full rounded-full transition-[width] duration-500 ${done ? "bg-teal-face" : "bg-grape"}`} style={{ width: `${planned ? Math.min(100, (backed / planned) * 100) : 0}%` }} />
                <span className="absolute inset-y-0 left-[80%] w-0.5 bg-ink/50" aria-hidden />
              </div>
            </li>
          );
        })}
      </ul>

      {pot.txs.length > 0 && <Feed txs={pot.txs} now={now} />}

      {inPot && !locked && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t-2 border-line pt-4">
          <p className="max-w-md text-sm text-muted">Plans freeze at the lock. Until then you can leave for a full refund.</p>
          <button className="btn btn-ghost min-h-11 text-xs" disabled={!!busy} onClick={onLeave}>
            <LogOut size={16} aria-hidden /> {busy === `leave-${pot.address}` ? "Confirming…" : `Leave · refund ${pot.stake} PATH`}
          </button>
        </div>
      )}
    </section>
  );
}

// Stands in for a pot card while the pots come back from the database and Solana devnet (a few seconds on a cold start).
function PotSkeleton() {
  const bar = "animate-pulse rounded-full bg-line/70";
  return (
    <section className="panel mb-8 border-2 border-grape/20 p-5 md:p-6" aria-busy="true" aria-label="Loading Study Pots">
      <div className="flex items-start justify-between gap-3 border-b-2 border-line pb-4">
        <div className="space-y-3">
          <div className={`h-6 w-48 ${bar}`} />
          <div className={`h-7 w-40 ${bar}`} />
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className={`h-3 w-16 ${bar}`} />
          <div className={`h-7 w-24 ${bar}`} />
        </div>
      </div>
      <ul className="mt-5 space-y-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-xl bg-polar p-3">
            <div className="flex justify-between gap-3">
              <div className={`h-4 w-20 ${bar}`} />
              <div className={`h-4 w-36 ${bar}`} />
            </div>
            <div className={`mt-3 h-3 w-full ${bar}`} />
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-2 text-sm font-bold text-muted" aria-live="polite">
        <CircleDashed size={15} className="animate-spin text-grape" aria-hidden /> Reading Study Pots from Solana devnet…
      </p>
    </section>
  );
}

const verb: Record<string, (t: Pot["txs"][number]) => string> = {
  create: (t) => `${t.name} started the pot`,
  join: (t) => `${t.name} joined`,
  leave: (t) => `${t.name} left (refunded)`,
  attest: (t) => {
    const d = t.detail as { planned: number; backed: number };
    return `Effort attested for ${t.name}: ${d.backed} of ${d.planned} blocks`;
  },
  settle: () => "Settled by the program",
  cancel: () => "Cancelled and refunded",
};

function Feed({ txs, now }: { txs: Pot["txs"]; now: number }) {
  return (
    <div className="mt-5">
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-muted">
        <Radio size={13} className="text-grape" aria-hidden /> On-chain activity
      </p>
      <ol className="mt-2 divide-y-2 divide-line rounded-xl border-2 border-line">
        {txs.slice(0, 6).map((t) => (
          <li key={t.sig} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 truncate font-bold">{verb[t.kind]?.(t) ?? t.kind}</span>
            <a href={txUrl(t.sig)} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-muted hover:text-grape">
              {ago(t.at, now)} · {short(t.sig)} <ExternalLink size={11} aria-hidden />
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Recap({ pot, chain, me }: { pot: Pot; chain?: ChainPot; me: string }) {
  // The settled Pot account keeps each member's final attested numbers and payout: prefer the chain's.
  const members = pot.members.map((m) => ({ ...m, ...(chain?.members[m.wallet] ?? {}) }));
  const done = members.map((m) => finished(m.planned, m.backed));
  const all = done.every(Boolean);
  const mine = members.find((m) => m.id === me);
  const settleTx = pot.txs.find((t) => t.kind === "settle" || t.kind === "cancel");
  return (
    <section className="panel mb-8 p-5" aria-labelledby={`recap-${pot.address}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`recap-${pot.address}`} className="flex items-center gap-2 text-xl font-black">
          <Award size={18} className="text-grape" aria-hidden /> {weekLabel(pot.weekStart)}: {pot.phase === "cancelled" ? "pot cancelled" : "pot settled"}
        </h2>
        {all && pot.phase === "settled" && <span className="rounded-lg bg-teal-soft px-2 py-1 text-xs font-black text-teal-lip">Everyone finished their plan</span>}
      </div>
      {mine?.payout != null && (
        <p className="mt-2 text-muted">
          {pot.phase === "cancelled" ? `Not enough members joined, so your ${mine.payout} PATH came back.` : `You received ${mine.payout} PATH from the pot.`}
          {mine.payout === 0 && " Next week's a fresh start, with 100 new PATH."}
        </p>
      )}
      <ul className="mt-3 space-y-2 rounded-xl border-2 border-line bg-polar p-3.5 text-sm font-bold">
        {members.map((m, i) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              {done[i] ? <Check size={15} strokeWidth={3} className="text-teal" aria-label="Finished" /> : <CircleDashed size={15} className="text-muted" aria-label="Didn't finish" />}
              {m.id === me ? "You" : m.name} · {m.backed} of {m.planned} blocks
            </span>
            <span className={done[i] || all ? "font-black text-teal" : "text-muted"}>{m.payout == null ? "…" : m.payout > 0 ? `${m.payout} PATH back` : "stake shared with finishers"}</span>
          </li>
        ))}
      </ul>
      {settleTx && (
        <a href={txUrl(settleTx.sig)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-grape underline underline-offset-4">
          View the payout transaction on Solana Explorer <ExternalLink size={13} aria-hidden />
        </a>
      )}
    </section>
  );
}
