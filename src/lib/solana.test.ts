import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { blocksToGo, finished, payouts } from "./solana/payout.ts";
import { mondayOf, upcomingWeek, weekBounds } from "./solana/week.ts";
import { decrypt, encrypt } from "./solana/wallet.ts";

// Same cases as the Rust tests in solana/programs/study_pots/src/lib.rs.
test("payout rule matches the program", () => {
  assert.deepEqual(payouts(20, [true, true, true]), [20, 20, 20]);
  assert.deepEqual(payouts(20, [false, false]), [20, 20]);
  assert.deepEqual(payouts(20, [false, true, false]), [0, 60, 0]);
  assert.deepEqual(payouts(5, [false, true, true]), [0, 8, 7]);
  assert.deepEqual(payouts(20, [true, true, false]), [30, 30, 0]);
});

test("finished is 80% of a non-empty plan", () => {
  assert.ok(finished(5, 4));
  assert.ok(!finished(5, 3));
  assert.ok(!finished(0, 0));
  assert.ok(finished(1, 1));
  assert.ok(!finished(4, 3));
  assert.equal(blocksToGo(5, 2), 2);
  assert.equal(blocksToGo(4, 4), 0);
});

test("pot weeks are Monday 00:00 Eastern, across DST", () => {
  assert.equal(mondayOf(new Date("2026-10-04T23:30:00-04:00")), "2026-09-28"); // Sunday night
  assert.equal(mondayOf(new Date("2026-10-05T00:00:00-04:00")), "2026-10-05");
  const w = weekBounds("2026-10-26"); // DST ends Sunday Nov 1
  assert.equal(w.lockAt.toISOString(), "2026-10-26T04:00:00.000Z");
  assert.equal(w.settleAfter.toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(upcomingWeek(new Date("2026-10-04T12:30:00-04:00")).weekStart, "2026-10-05");
});

test("wallet secrets round-trip through AES-256-GCM", () => {
  const k = randomBytes(32).toString("base64");
  const secret = randomBytes(64);
  const blob = encrypt(secret, k);
  assert.deepEqual(Buffer.from(decrypt(blob, k)), secret);
  blob[20] ^= 1;
  assert.throws(() => decrypt(blob, k), "tampering is detected");
});
