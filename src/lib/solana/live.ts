// Browser side: read Pot accounts straight from Solana devnet and subscribe to changes over a
// websocket, so the pot card shows what the chain says (not what our server says) and updates
// the moment an attestation, join or payout confirms.
import { useEffect, useState } from "react";
import { BorshAccountsCoder, type Idl } from "@anchor-lang/core";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl.json";

export type ChainMember = { planned: number; backed: number; frozen: boolean; payout: number };
export type ChainPot = { phase: "open" | "settled" | "cancelled"; members: Record<string, ChainMember> };

type RawPot = { phase: Record<string, object>; members: { wallet: PublicKey; planned: number; backed: number; frozen: boolean; payout: { toNumber(): number } }[] };

const coder = new BorshAccountsCoder(idl as Idl);
let conn: Connection | undefined;

function decode(data: Buffer): ChainPot {
  const p = coder.decode<RawPot>("Pot", data);
  return {
    phase: Object.keys(p.phase)[0] as ChainPot["phase"],
    members: Object.fromEntries(p.members.map((m) => [m.wallet.toBase58(), { planned: m.planned, backed: m.backed, frozen: m.frozen, payout: m.payout.toNumber() }])),
  };
}

/** Calls `on` with each pot's on-chain state now (changed = false) and on every change. Returns an unsubscribe. */
export function watchPots(addresses: string[], on: (address: string, pot: ChainPot, changed: boolean) => void) {
  if (!addresses.length) return () => {};
  conn ??= new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet"), "confirmed");
  const c = conn;
  const keys = addresses.map((a) => new PublicKey(a));
  c.getMultipleAccountsInfo(keys)
    .then((infos) => infos.forEach((info, i) => info && on(addresses[i], decode(info.data), false)))
    .catch(() => {}); // the page still shows Tiger's numbers
  const subs = keys.map((k, i) => c.onAccountChange(k, (info) => on(addresses[i], decode(info.data), true), { commitment: "confirmed" }));
  return () => subs.forEach((s) => void c.removeAccountChangeListener(s));
}

/** Wall-clock time for countdowns, ticking every 30 s (keeps render pure). */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
