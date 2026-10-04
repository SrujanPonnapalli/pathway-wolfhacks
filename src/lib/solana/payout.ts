// The Study Pot rules, mirrored exactly from the on-chain program (solana/programs/study_pots/src/lib.rs)
// so the UI can preview what settlement will do. Both sides are tested on the same cases.

/** Finished = at least one planned block and backed / planned >= 80%. */
export const finished = (planned: number, backed: number) => planned > 0 && 5 * backed >= 4 * planned;

/** Blocks still needed to reach the 80% line. */
export const blocksToGo = (planned: number, backed: number) => Math.max(0, Math.ceil((4 * planned) / 5) - backed);

/**
 * Everyone or no one finished: full refund. Otherwise finishers split the whole pot equally and the
 * integer-division remainder goes to the first finisher in member order.
 */
export function payouts(stake: number, done: boolean[]): number[] {
  const n = done.filter(Boolean).length;
  if (n === 0 || n === done.length) return done.map(() => stake);
  const total = stake * done.length;
  const share = Math.floor(total / n);
  let rem = total - share * n;
  return done.map((f) => {
    if (!f) return 0;
    const extra = rem;
    rem = 0;
    return share + extra;
  });
}
