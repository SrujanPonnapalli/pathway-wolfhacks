import { after } from "next/server";
import { bad, db, noDb, profileExists } from "@/lib/db";
import { attestProfile, balance, chain, chainError, createPot, ensureWallet, explorer, grantAllowance, joinPot, leavePot, potsFor, settleDue } from "@/lib/solana/chain";
import { upcomingWeek } from "@/lib/solana/week";

export const maxDuration = 30;

const noChain = () => Response.json({ error: "Solana not configured" }, { status: 503 });

// The Buddies page: wallet, balance, pots. Wallets are created on first visit; the weekly
// allowance and any due settlements run after the response, so this stays fast.
export async function GET(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  if (!chain()) return noChain();
  const id = new URL(req.url).searchParams.get("profile_id");
  if (!(await profileExists(sql, id))) return bad("unknown profile_id");
  const wallet = await ensureWallet(sql, id!);
  const [pots, bal, [grant]] = await Promise.all([
    potsFor(sql, id!),
    balance(wallet.publicKey),
    sql`SELECT 1 FROM allowance_grants WHERE profile_id = ${id} AND week_start = date_trunc('week', now() AT TIME ZONE 'America/New_York')::date`,
  ]);
  after(async () => {
    await grantAllowance(sql, id!, wallet.publicKey).catch((e) => console.error("allowance", chainError(e)));
    await settleDue(sql).catch((e) => console.error("settle", chainError(e)));
  });
  const address = wallet.publicKey.toBase58();
  return Response.json({
    wallet: { address, balance: bal, explorer: explorer("address", address), allowancePending: !grant },
    upcoming: upcomingWeek(),
    pots,
  });
}

// { profile_id, action: "create", stake } | { profile_id, action: "join" | "leave", pot }
// Waits for devnet confirmation (~1 s) and returns the signature.
export async function POST(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  if (!chain()) return noChain();
  const b = await req.json().catch(() => null);
  if (!(await profileExists(sql, b?.profile_id))) return bad("unknown profile_id");
  const id: string = b.profile_id;
  try {
    let r;
    if (b.action === "create") {
      const stake = Number(b.stake);
      if (!Number.isInteger(stake) || stake < 5 || stake > 50) return bad("stake must be 5-50 PATH");
      r = await createPot(sql, id, stake);
    } else if ((b.action === "join" || b.action === "leave") && typeof b.pot === "string") {
      r = await (b.action === "join" ? joinPot : leavePot)(sql, id, b.pot);
    } else return bad("action must be create, join or leave");
    if (b.action !== "leave") after(() => attestProfile(sql, id).catch((e) => console.error("attest", chainError(e))));
    return Response.json({ ...r, explorer: explorer("tx", r.sig) });
  } catch (e) {
    console.error("pots", e);
    return Response.json({ error: e instanceof Error && !("logs" in e) && !/failed|simulation|timeout|blockhash/i.test(e.message) ? e.message : chainError(e) }, { status: 502 });
  }
}
