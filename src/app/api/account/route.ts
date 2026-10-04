import { db, noDb } from "@/lib/db";
import { sessionCookie, sessionProfile } from "@/lib/auth";

const signedOut = () => Response.json({ error: "sign in first" }, { status: 401 });

// Download everything Pathway stores for the signed-in account, as JSON. Inputs only: there is no
// status to export because it's never stored. Wallet secret keys are never included.
export async function GET(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const id = sessionProfile(req);
  if (!id) return signedOut();
  const q = {
    profile: sql`SELECT id, name, class_year, term_start, created_at FROM profiles WHERE id = ${id}`,
    account: sql`SELECT email, picture, created_at, last_login FROM accounts WHERE profile_id = ${id}`,
    courses: sql`SELECT slug, code, name, baseline, created_at FROM courses WHERE profile_id = ${id}`,
    class_meetings: sql`SELECT course_slug, starts_at, title FROM class_meetings WHERE profile_id = ${id}`,
    deadlines: sql`SELECT course_slug, kind, title, due_at, source, confirmed, submitted_at FROM deadlines WHERE profile_id = ${id}`,
    study_blocks: sql`SELECT course_slug, title, starts_at, done_at, created_at FROM study_blocks WHERE profile_id = ${id}`,
    todos: sql`SELECT id, title, detail, due_at, done_at FROM todos WHERE profile_id = ${id}`,
    buddies: sql`SELECT buddy_id FROM buddies WHERE profile_id = ${id}`,
    buddy_requests_sent: sql`SELECT to_email, created_at FROM buddy_requests WHERE from_id = ${id}`,
    events: sql`SELECT time, course_slug, kind, minutes, score, late_night, source, meta FROM events WHERE profile_id = ${id} ORDER BY time`,
    wallet: sql`SELECT pubkey, created_at FROM wallets WHERE profile_id = ${id}`,
    pots: sql`SELECT m.pot, p.stake, p.week_start, p.phase, m.joined_at, m.payout FROM pot_members m JOIN pots p ON p.address = m.pot WHERE m.profile_id = ${id}`,
    solana_transactions: sql`SELECT sig, at, kind, pot, detail FROM chain_txs WHERE profile_id = ${id} ORDER BY at`,
  };
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), note: "Everything Pathway stores about you. Your status is computed on your device and never stored." };
  for (const [k, v] of Object.entries(q)) out[k] = await v;
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="pathway-data-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}

// Delete the account and everything tied to it. Solana devnet transactions are public and permanent;
// the wallet's tie to this account is removed here, so on-chain it's an anonymous address.
export async function DELETE(req: Request) {
  const sql = db();
  if (!sql) return noDb();
  const id = sessionProfile(req);
  if (!id) return signedOut();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM events WHERE profile_id = ${id}`; // hypertable: no foreign key to cascade from
    await tx`DELETE FROM buddies WHERE buddy_id = ${id}`;
    await tx`DELETE FROM buddy_requests WHERE to_email = (SELECT lower(email) FROM accounts WHERE profile_id = ${id})`; // sent ones cascade
    // Knowledge tables are created lazily and keyed by profile_id without foreign keys.
    for (const t of ["kb_nodes", "kb_sources", "viva_turns"]) {
      const [exists] = await tx`SELECT to_regclass(${t}) AS r`;
      if (exists.r) await tx`DELETE FROM ${tx(t)} WHERE profile_id = ${id}`; // nodes cascade edges; sources cascade their nodes
    }
    await tx`DELETE FROM profiles WHERE id = ${id}`; // cascades: account, courses, blocks, todos, wallet, pot membership, tx log
  });
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie("", 0) } });
}
