"use client";

import { useEffect, useState } from "react";
import { predict, type Tree } from "@/lib/tree";

export default function Home() {
  const [tree, setTree] = useState<Tree>();
  const [x, setX] = useState({ weekly_hours: 6, late_night_pct: 0.3 });

  useEffect(() => {
    fetch("/models/tree_early.json").then((r) => r.json()).then(setTree);
  }, []);

  const result = tree && predict(tree, x);

  return (
    <main className="mx-auto max-w-xl p-8 space-y-6">
      <h1 className="text-3xl font-semibold">Pathway</h1>
      {Object.entries(x).map(([k, v]) => (
        <label key={k} className="block">
          {k}: {v}
          <input
            type="range" min={0} max={k === "weekly_hours" ? 40 : 1} step={k === "weekly_hours" ? 1 : 0.05}
            value={v} onChange={(e) => setX({ ...x, [k]: +e.target.value })} className="w-full"
          />
        </label>
      ))}
      {/* TODO: D3 tree here, highlighting result.path */}
      {result && <p>Risk: <b>{result.label}</b> · path {result.path.join(" → ")}</p>}
    </main>
  );
}
