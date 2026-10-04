// Server-only: Pathway's side of Study Pots on Solana devnet. One server key (SOLANA_AUTHORITY_SECRET)
// is PATH's mint authority, every pot's attester, and the fee payer for every transaction, so
// students never need SOL. Student wallets are app-made and custodial (see wallet.ts). Every
// transaction is logged to chain_txs. Docs: docs/solana/README.md.
import { randomBytes } from "node:crypto";
import { AnchorProvider, BN, Program, type Idl } from "@anchor-lang/core";
import { clusterApiUrl, Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import type postgres from "postgres";
import idl from "./idl.json" with { type: "json" };
import type { StudyPots } from "./study_pots.ts";
import { decrypt, encrypt } from "./wallet.ts";
import { mondayOf, upcomingWeek } from "./week.ts";
import { finished } from "./payout.ts";

type Sql = postgres.Sql;
export const ALLOWANCE = 100;
export const explorer = (kind: "tx" | "address", id: string) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;

let cached: ReturnType<typeof connect> | undefined;
function connect() {
  const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl("devnet"), "confirmed");
  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.SOLANA_AUTHORITY_SECRET!)));
  // Instructions are built here and signed by hand, so the provider's wallet is never asked to sign.
  const wallet = { publicKey: authority.publicKey, signTransaction: async <T>(t: T) => t, signAllTransactions: async <T>(t: T) => t };
  const program = new Program<StudyPots>(idl as Idl as StudyPots, new AnchorProvider(connection, wallet, { commitment: "confirmed" }));
  return { connection, authority, program, mint: new PublicKey(process.env.PATH_MINT!) };
}

/** null when the Solana env vars aren't set: pot routes answer 503 and the page explains. */
export function chain() {
  if (!process.env.SOLANA_AUTHORITY_SECRET || !process.env.PATH_MINT || !process.env.WALLET_ENCRYPTION_KEY) return null;
  return (cached ??= connect());
}
type Chain = NonNullable<ReturnType<typeof chain>>;

export const potAddress = (programId: PublicKey, potId: Uint8Array) => PublicKey.findProgramAddressSync([Buffer.from("pot"), potId], programId)[0];
const vaultOf = (c: Chain, pot: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("vault"), pot.toBuffer()], c.program.programId)[0];
const ataOf = (c: Chain, owner: PublicKey) => getAssociatedTokenAddressSync(c.mint, owner, false, TOKEN_2022_PROGRAM_ID);

async function send(c: Chain, ixs: TransactionInstruction[], signers: Keypair[] = []) {
  return sendAndConfirmTransaction(c.connection, new Transaction().add(...ixs), [c.authority, ...signers], { commitment: "confirmed", maxRetries: 5 });
}

const log = (sql: Sql, sig: string, kind: string, pot: string | null, profile: string | null, detail: object = {}) =>
  sql`INSERT INTO chain_txs (sig, kind, pot, profile_id, detail) VALUES (${sig}, ${kind}, ${pot}, ${profile}, ${sql.json(detail as never)}) ON CONFLICT DO NOTHING`;

/** A readable message from a failed transaction (Anchor error message if there is one). */
export function chainError(e: unknown) {
  const s = String((e as { transactionMessage?: string })?.transactionMessage ?? (e as Error)?.message ?? e);
  const logs = ((e as { transactionLogs?: string[] })?.transactionLogs ?? []).join(" ");
  return (logs.match(/Error Message: ([^.]+)/) ?? s.match(/Error Message: ([^.]+)/))?.[1] ?? "Solana devnet didn't confirm in time. Try again in a moment.";
}

// ── Wallets and the weekly allowance ──────────────────────────────────────────────────

export async function ensureWallet(sql: Sql, profileId: string) {
  let [w] = await sql`SELECT pubkey, secret_enc FROM wallets WHERE profile_id = ${profileId}`;
  if (!w) {
    const kp = Keypair.generate();
    await sql`INSERT INTO wallets (profile_id, pubkey, secret_enc) VALUES (${profileId}, ${kp.publicKey.toBase58()}, ${encrypt(kp.secretKey)}) ON CONFLICT DO NOTHING`;
    [w] = await sql`SELECT pubkey, secret_enc FROM wallets WHERE profile_id = ${profileId}`;
  }
  return Keypair.fromSecretKey(decrypt(w.secret_enc));
}

/** Mint this week's 100 PATH if it hasn't been claimed yet. Returns the signature when it minted. */
export async function grantAllowance(sql: Sql, profileId: string, owner: PublicKey) {
  const c = chain()!;
  const week = mondayOf(new Date());
  const [claimed] = await sql`INSERT INTO allowance_grants (profile_id, week_start, amount) VALUES (${profileId}, ${week}, ${ALLOWANCE}) ON CONFLICT DO NOTHING RETURNING 1`;
  if (!claimed) return null;
  try {
    const ata = ataOf(c, owner);
    const sig = await send(c, [
      createAssociatedTokenAccountIdempotentInstruction(c.authority.publicKey, ata, owner, c.mint, TOKEN_2022_PROGRAM_ID),
      createMintToInstruction(c.mint, ata, c.authority.publicKey, ALLOWANCE, [], TOKEN_2022_PROGRAM_ID),
    ]);
    await log(sql, sig, "allowance", null, profileId, { amount: ALLOWANCE, week });
    return sig;
  } catch (e) {
    await sql`DELETE FROM allowance_grants WHERE profile_id = ${profileId} AND week_start = ${week}`; // retry next time
    throw e;
  }
}

export async function balance(owner: PublicKey) {
  const c = chain()!;
  return c.connection.getTokenAccountBalance(ataOf(c, owner)).then((b) => Number(b.value.amount), () => 0);
}

// ── Pots ──────────────────────────────────────────────────────────────────────────────

type Week = { weekStart: string; lockAt: Date; settleAfter: Date };

async function weekTaken(sql: Sql, profileId: string, weekStart: string) {
  const [row] = await sql`SELECT 1 FROM pot_members m JOIN pots p ON p.address = m.pot WHERE m.profile_id = ${profileId} AND p.week_start = ${weekStart}`;
  return !!row;
}

/** Start a pot for the upcoming week (or a custom schedule, for the demo seed). The creator joins. */
export async function createPot(sql: Sql, profileId: string, stake: number, week: Week = upcomingWeek()) {
  const c = chain()!;
  if (await weekTaken(sql, profileId, week.weekStart)) throw new Error("You're already in a pot that week.");
  const creator = await ensureWallet(sql, profileId);
  await grantAllowance(sql, profileId, creator.publicKey);
  const potId = randomBytes(16);
  const pot = potAddress(c.program.programId, potId);
  const ix = await c.program.methods
    .createPot([...potId], new BN(stake), new BN(Math.floor(+week.lockAt / 1000)), new BN(Math.floor(+week.settleAfter / 1000)))
    .accountsPartial({ authority: c.authority.publicKey, creator: creator.publicKey, pot, vault: vaultOf(c, pot), mint: c.mint, creatorToken: ataOf(c, creator.publicKey), tokenProgram: TOKEN_2022_PROGRAM_ID })
    .instruction();
  const sig = await send(c, [ix], [creator]);
  const address = pot.toBase58();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO pots (address, pot_id, creator_id, stake, week_start, lock_at, settle_after)
             VALUES (${address}, ${potId}, ${profileId}, ${stake}, ${week.weekStart}, ${week.lockAt}, ${week.settleAfter})`;
    await tx`INSERT INTO pot_members (pot, profile_id) VALUES (${address}, ${profileId})`;
  });
  await log(sql, sig, "create", address, profileId, { stake });
  return { pot: address, sig };
}

async function potRow(sql: Sql, address: string) {
  const [p] = await sql`SELECT address, week_start, lock_at, phase FROM pots WHERE address = ${address}`;
  if (!p) throw new Error("No such pot.");
  return p;
}

export async function joinPot(sql: Sql, profileId: string, address: string) {
  const c = chain()!;
  const p = await potRow(sql, address);
  if (p.phase !== "open" || p.lock_at <= new Date()) throw new Error("This pot is locked for the week.");
  if (await weekTaken(sql, profileId, mondayKey(p.week_start))) throw new Error("You're already in a pot that week.");
  const member = await ensureWallet(sql, profileId);
  await grantAllowance(sql, profileId, member.publicKey);
  const sig = await send(c, [await membershipIx(c, "join", new PublicKey(address), member.publicKey)], [member]);
  await sql`INSERT INTO pot_members (pot, profile_id) VALUES (${address}, ${profileId}) ON CONFLICT DO NOTHING`;
  await log(sql, sig, "join", address, profileId);
  return { pot: address, sig };
}

export async function leavePot(sql: Sql, profileId: string, address: string) {
  const c = chain()!;
  await potRow(sql, address);
  const member = await ensureWallet(sql, profileId);
  const sig = await send(c, [await membershipIx(c, "leave", new PublicKey(address), member.publicKey)], [member]);
  await sql`DELETE FROM pot_members WHERE pot = ${address} AND profile_id = ${profileId}`;
  await log(sql, sig, "leave", address, profileId);
  return { pot: address, sig };
}

function membershipIx(c: Chain, kind: "join" | "leave", pot: PublicKey, member: PublicKey) {
  return c.program.methods[kind]()
    .accountsPartial({ pot, member, memberToken: ataOf(c, member), vault: vaultOf(c, pot), mint: c.mint, tokenProgram: TOKEN_2022_PROGRAM_ID })
    .instruction();
}

const mondayKey = (d: Date | string) => (typeof d === "string" ? d : d.toISOString().slice(0, 10));

/**
 * Attest a profile's effort to every open pot it's in. Called after study blocks or study activity
 * change; sends a transaction only when the numbers differ from what's on-chain.
 */
export function attestProfile(sql: Sql, profileId: string) {
  // One at a time per profile: a block-done and its study event arrive together, and the second
  // run then sees the chain already matches and sends nothing.
  // ponytail: per-instance queue; separate serverless instances can still double-send (harmless).
  const run = (attesting.get(profileId) ?? Promise.resolve()).catch(() => {}).then(() => attestNow(sql, profileId));
  attesting.set(profileId, run);
  return run;
}
const attesting = new Map<string, Promise<unknown>>();

async function attestNow(sql: Sql, profileId: string) {
  const c = chain();
  if (!c) return [];
  const rows = await sql`
    SELECT g.pot, g.planned, g.backed, w.pubkey FROM pot_progress g
    JOIN pots p ON p.address = g.pot JOIN wallets w ON w.profile_id = g.profile_id
    WHERE g.profile_id = ${profileId} AND p.phase = 'open' AND p.settle_after > now()`;
  const sigs: string[] = [];
  for (const r of rows) {
    const pot = new PublicKey(r.pot);
    const onchain = (await c.program.account.pot.fetch(pot)).members.find((m) => m.wallet.toBase58() === r.pubkey);
    if (!onchain) continue;
    // After the lock the plan is frozen on-chain and backed only goes up.
    const planned = onchain.frozen ? onchain.planned : r.planned;
    const backed = Math.min(planned, onchain.frozen ? Math.max(onchain.backed, r.backed) : r.backed);
    if (planned === onchain.planned && backed === onchain.backed && (onchain.frozen || new Date() < (await potRow(sql, r.pot)).lock_at)) continue;
    const ix = await c.program.methods.attest(new PublicKey(r.pubkey), planned, backed).accountsPartial({ pot, authority: c.authority.publicKey }).instruction();
    const sig = await send(c, [ix]);
    await log(sql, sig, "attest", r.pot, profileId, { planned, backed, finished: finished(planned, backed) });
    sigs.push(sig);
  }
  return sigs;
}

/**
 * Settle (or cancel) every pot that's due. Permissionless on-chain, so this is just the crank:
 * the program decides who finished from the attested numbers and pays out. Idempotent.
 */
export async function settleDue(sql: Sql) {
  const c = chain();
  if (!c) return [];
  const due = await sql`
    SELECT p.address FROM pots p
    WHERE p.phase = 'open' AND (p.settle_after <= now()
      OR (p.lock_at <= now() AND (SELECT count(*) FROM pot_members m WHERE m.pot = p.address) < 2))`;
  const done: string[] = [];
  for (const { address } of due) {
    const pot = new PublicKey(address);
    let state = await c.program.account.pot.fetch(pot);
    if ("open" in state.phase) {
      const ix = await c.program.methods
        .settle()
        .accountsPartial({ pot, vault: vaultOf(c, pot), mint: c.mint, tokenProgram: TOKEN_2022_PROGRAM_ID })
        .remainingAccounts(state.members.map((m) => ({ pubkey: ataOf(c, m.wallet), isSigner: false, isWritable: true })))
        .instruction();
      const sig = await send(c, [ix]);
      state = await c.program.account.pot.fetch(pot);
      await log(sql, sig, "cancelled" in state.phase ? "cancel" : "settle", address, null, { payouts: state.members.map((m) => Number(m.payout)) });
    }
    const phase = "cancelled" in state.phase ? "cancelled" : "settled";
    await sql.begin(async (tx) => {
      await tx`UPDATE pots SET phase = ${phase} WHERE address = ${address}`;
      for (const m of state.members)
        await tx`UPDATE pot_members SET payout = ${Number(m.payout)} WHERE pot = ${address} AND profile_id = (SELECT profile_id FROM wallets WHERE pubkey = ${m.wallet.toBase58()})`;
    });
    done.push(address);
  }
  return done;
}

export type PotView = Awaited<ReturnType<typeof potsFor>>[number];

// ── What the Buddies page reads ──────────────────────────────────────────────────────

/** Pots the profile is in (this week, next week, last 4 weeks) and buddies' pots it could join. Effort only. */
export async function potsFor(sql: Sql, profileId: string) {
  const since = mondayOf(new Date(Date.now() - 28 * 86_400_000));
  const pots = await sql`
    SELECT p.address, p.stake, p.week_start, p.lock_at, p.settle_after, p.phase, p.creator_id,
      EXISTS (SELECT 1 FROM pot_members x WHERE x.pot = p.address AND x.profile_id = ${profileId}) AS mine
    FROM pots p
    WHERE p.week_start >= ${since} AND (
      EXISTS (SELECT 1 FROM pot_members x WHERE x.pot = p.address AND x.profile_id = ${profileId})
      OR (p.phase = 'open' AND p.lock_at > now() AND EXISTS (
        SELECT 1 FROM pot_members x JOIN buddies b ON b.buddy_id = x.profile_id WHERE x.pot = p.address AND b.profile_id = ${profileId})))
    ORDER BY p.week_start DESC, p.created_at`;
  const addresses = pots.map((p) => p.address as string);
  const [members, txs] = addresses.length
    ? await Promise.all([
        sql`SELECT m.pot, m.profile_id AS id, pr.name, w.pubkey AS wallet, m.payout, coalesce(g.planned, 0) AS planned, coalesce(g.backed, 0) AS backed
            FROM pot_members m JOIN profiles pr ON pr.id = m.profile_id
            LEFT JOIN wallets w ON w.profile_id = m.profile_id
            LEFT JOIN pot_progress g ON g.pot = m.pot AND g.profile_id = m.profile_id
            WHERE m.pot IN ${sql(addresses)} ORDER BY m.joined_at`,
        sql`SELECT t.sig, t.at, t.kind, t.pot, t.detail, t.profile_id, pr.name FROM chain_txs t LEFT JOIN profiles pr ON pr.id = t.profile_id
            WHERE t.pot IN ${sql(addresses)} ORDER BY t.at DESC LIMIT 40`,
      ])
    : [[], []];
  // The live judge profile is named "you" (for its own greeting); to other members it's "Judge".
  const display = (id: string | null, name: string | null) => (id === "judge" ? "Judge" : name);
  return pots.map((p) => ({
    address: p.address as string,
    stake: p.stake as number,
    weekStart: mondayKey(p.week_start),
    lockAt: (p.lock_at as Date).toISOString(),
    settleAfter: (p.settle_after as Date).toISOString(),
    phase: p.phase as "open" | "settled" | "cancelled",
    mine: p.mine as boolean,
    members: members.filter((m) => m.pot === p.address).map((m) => ({ id: m.id as string, name: display(m.id, m.name) as string, wallet: m.wallet as string, planned: m.planned as number, backed: m.backed as number, payout: m.payout as number | null })),
    txs: txs.filter((t) => t.pot === p.address).slice(0, 12).map((t) => ({ sig: t.sig as string, at: (t.at as Date).toISOString(), kind: t.kind as string, name: display(t.profile_id, t.name), detail: t.detail })),
  }));
}
