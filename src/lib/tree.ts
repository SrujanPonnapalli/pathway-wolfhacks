// Mirrors sklearn's tree_ arrays so the notebook can dump them as-is.
// Leaf nodes have children_left[i] === -1. Class index 1 is "at risk".
export type Tree = {
  feature_names: string[];
  class_names: string[];
  children_left: number[];
  children_right: number[];
  feature: number[];
  threshold: number[];
  value: number[][]; // per-node class counts
  risk_threshold?: number; // tuned in the notebook for recall; defaults to 0.5
  depth?: number;
  n_leaves?: number;
  features_used?: string[];
  // Features the notebook derives before the tree sees them. warning_signs counts how many of the
  // listed habits sit past their cutoff (low is bad unless the feature is in high_is_bad).
  derived?: { warning_signs?: { cutoffs: Record<string, number>; high_is_bad: string[] } };
};

export type Features = Record<string, number>;

const SIGNS = "warning_signs";

/** How many warning signs a feature vector shows, per the tree's own cutoffs (0 when the tree has none). */
export function warningSigns(tree: Tree, x: Features): number {
  const d = tree.derived?.warning_signs;
  if (!d) return 0;
  let n = 0;
  for (const [f, c] of Object.entries(d.cutoffs)) {
    const v = x[f] ?? 0;
    if (d.high_is_bad.includes(f) ? v >= c : v <= c) n++;
  }
  return n;
}

/** The vector the tree actually walks: the student's numbers plus anything derived from them. */
export function withDerived(tree: Tree, x: Features): Features {
  return tree.derived?.warning_signs ? { ...x, [SIGNS]: warningSigns(tree, x) } : x;
}

/** Features that can change this tree's answer: every split feature, with derived ones expanded to their inputs. */
export function usedFeatures(tree: Tree): string[] {
  const used = new Set(tree.features_used ?? tree.feature.filter((f) => f >= 0).map((f) => tree.feature_names[f]));
  if (used.has(SIGNS)) for (const f of Object.keys(tree.derived?.warning_signs?.cutoffs ?? {})) used.add(f);
  return [...used];
}

export function predict(tree: Tree, raw: Features) {
  const x = withDerived(tree, raw);
  const path = [0];
  let i = 0;
  while (tree.children_left[i] !== -1) {
    i = (x[tree.feature_names[tree.feature[i]]] ?? 0) <= tree.threshold[i] ? tree.children_left[i] : tree.children_right[i];
    path.push(i);
  }
  const [ok, risk] = tree.value[i];
  const n = ok + risk;
  const pRisk = risk / n;
  return { path, leaf: i, n, pRisk, atRisk: pRisk >= (tree.risk_threshold ?? 0.5) };
}

// One step per split on the path: which feature, the cutoff, the student's value, and whether it was above.
export type Step = { node: number; feature: string; threshold: number; value: number; above: boolean };

export function explain(tree: Tree, path: number[], raw: Features): Step[] {
  const x = withDerived(tree, raw);
  return path.slice(0, -1).map((node, k) => {
    const feature = tree.feature_names[tree.feature[node]];
    return { node, feature, threshold: tree.threshold[node], value: x[feature] ?? 0, above: path[k + 1] === tree.children_right[node] };
  });
}

export type Bounds = Record<string, { min: number; max: number; step: number }>;
export type Move = { feature: string; from: number; to: number };

// Exact recourse: the cheapest move into any not-at-risk leaf, changing only `actionable` features.
// Leaves whose path needs a non-actionable feature to change are skipped.
export function recourse(tree: Tree, raw: Features, actionable: Bounds) {
  const x = withDerived(tree, raw);
  const signs = tree.derived?.warning_signs;
  let best: { leaf: number; moves: Move[]; cost: number } | null = null;
  const stepPast = (f: string, c: number, b: Bounds[string], highBad: boolean) => {
    // Nearest slider step that clears this habit's cutoff: just above it (low is bad) or just below it.
    const k = highBad ? Math.ceil(c / b.step - 1e-9) - 1 : Math.floor(c / b.step + 1e-9) + 1;
    return +(k * b.step).toFixed(6);
  };
  const walk = (i: number, lo: Record<string, number>, hi: Record<string, number>) => {
    if (tree.children_left[i] !== -1) {
      const f = tree.feature_names[tree.feature[i]];
      const t = tree.threshold[i];
      walk(tree.children_left[i], lo, { ...hi, [f]: Math.min(hi[f] ?? Infinity, t) });
      walk(tree.children_right[i], { ...lo, [f]: Math.max(lo[f] ?? -Infinity, t) }, hi);
      return;
    }
    const [ok, risk] = tree.value[i];
    if (risk / (ok + risk) >= (tree.risk_threshold ?? 0.5)) return;
    const moves: Move[] = [];
    let cost = 0;
    for (const f of new Set([...Object.keys(lo), ...Object.keys(hi)])) {
      if (f === SIGNS) continue; // derived: handled below by moving the habits behind it
      const v = x[f] ?? 0;
      const min = lo[f] ?? -Infinity; // value must be > min
      const max = hi[f] ?? Infinity; // value must be <= max
      if (v > min && v <= max) continue;
      const b = actionable[f];
      if (!b) return; // would need a feature the student can't or shouldn't change
      // Nearest step strictly above min, or at/below max (epsilon guards float division like 0.35 / 0.01).
      const k = v <= min ? Math.floor(min / b.step + 1e-9) + 1 : Math.floor(max / b.step + 1e-9);
      const to = +(k * b.step).toFixed(6);
      if (to < b.min || to > b.max || !(to > min && to <= max)) return;
      moves.push({ feature: f, from: v, to });
      cost += Math.abs(to - v) / (b.max - b.min);
    }
    if (signs && (SIGNS in lo || SIGNS in hi)) {
      // The leaf wants the warning-sign count in (lo, hi]. Count signs after the moves above, then clear
      // the cheapest extra ones by nudging an actionable habit just past its cutoff (inside the leaf's bounds).
      const after: Features = { ...x };
      for (const m of moves) after[m.feature] = m.to;
      let n = warningSigns(tree, after);
      const max = hi[SIGNS] ?? Infinity;
      if (n <= (lo[SIGNS] ?? -Infinity)) return; // this leaf wants MORE warning signs: never suggest that
      if (n > max) {
        const fixes: Move[] = [];
        for (const [f, c] of Object.entries(signs.cutoffs)) {
          const highBad = signs.high_is_bad.includes(f);
          const v = after[f] ?? 0;
          if (!(highBad ? v >= c : v <= c)) continue; // not a sign right now
          const b = actionable[f];
          if (!b) continue;
          const to = stepPast(f, c, b, highBad);
          const min = lo[f] ?? -Infinity;
          const fmax = hi[f] ?? Infinity;
          if (to < b.min || to > b.max || !(to > min && to <= fmax)) continue;
          fixes.push({ feature: f, from: x[f] ?? 0, to });
        }
        fixes.sort((a, b2) => Math.abs(a.to - a.from) / (actionable[a.feature].max - actionable[a.feature].min) - Math.abs(b2.to - b2.from) / (actionable[b2.feature].max - actionable[b2.feature].min));
        for (const fx of fixes) {
          if (n <= max) break;
          const prev = moves.findIndex((m) => m.feature === fx.feature);
          if (prev >= 0) {
            cost -= Math.abs(moves[prev].to - moves[prev].from) / (actionable[fx.feature].max - actionable[fx.feature].min);
            moves.splice(prev, 1);
          }
          moves.push(fx);
          cost += Math.abs(fx.to - fx.from) / (actionable[fx.feature].max - actionable[fx.feature].min);
          after[fx.feature] = fx.to;
          n = warningSigns(tree, after);
        }
        if (n > max) return; // can't clear enough signs with actionable habits alone
      }
    }
    if (moves.length && (!best || cost < best.cost)) best = { leaf: i, moves, cost };
  };
  walk(0, {}, {});
  return best as { leaf: number; moves: Move[]; cost: number } | null;
}
