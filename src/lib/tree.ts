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
};

export type Features = Record<string, number>;

export function predict(tree: Tree, x: Features) {
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

export function explain(tree: Tree, path: number[], x: Features): Step[] {
  return path.slice(0, -1).map((node, k) => {
    const feature = tree.feature_names[tree.feature[node]];
    return { node, feature, threshold: tree.threshold[node], value: x[feature] ?? 0, above: path[k + 1] === tree.children_right[node] };
  });
}

export type Bounds = Record<string, { min: number; max: number; step: number }>;
export type Move = { feature: string; from: number; to: number };

// Exact recourse: the cheapest move into any not-at-risk leaf, changing only `actionable` features.
// Leaves whose path needs a non-actionable feature to change are skipped.
export function recourse(tree: Tree, x: Features, actionable: Bounds) {
  let best: { leaf: number; moves: Move[]; cost: number } | null = null;
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
    if (moves.length && (!best || cost < best.cost)) best = { leaf: i, moves, cost };
  };
  walk(0, {}, {});
  return best as { leaf: number; moves: Move[]; cost: number } | null;
}
