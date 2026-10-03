// Mirrors sklearn's tree_ arrays so the notebook can dump them as-is.
// Leaf nodes have children_left[i] === -1.
export type Tree = {
  feature_names: string[];
  class_names: string[];
  children_left: number[];
  children_right: number[];
  feature: number[];
  threshold: number[];
  value: number[][]; // per-node class counts/probabilities
};

export function predict(tree: Tree, x: Record<string, number>) {
  const path = [0];
  let i = 0;
  while (tree.children_left[i] !== -1) {
    const name = tree.feature_names[tree.feature[i]];
    i = x[name] <= tree.threshold[i] ? tree.children_left[i] : tree.children_right[i];
    path.push(i);
  }
  const v = tree.value[i];
  const total = v.reduce((a, b) => a + b, 0);
  const probs = v.map((n) => n / total);
  return { path, probs, label: tree.class_names[probs.indexOf(Math.max(...probs))] };
}
