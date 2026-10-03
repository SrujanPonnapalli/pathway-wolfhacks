"use client";

import { useEffect, useState } from "react";
import { predict, type Tree } from "@/lib/tree";

// Sliders over actionable features; the tree re-scores instantly in the browser.
// TODO: swap the sample tree for tree_early.json from the notebook and use its real features.
export function WhatWouldHelp() {
  const [tree, setTree] = useState<Tree>();
  const [x, setX] = useState({ weekly_hours: 6, late_night_pct: 0.5 });

  useEffect(() => {
    fetch("/models/tree_early.json").then((r) => r.json()).then(setTree);
  }, []);

  const result = tree && predict(tree, x);
  const sliders = [
    { key: "weekly_hours", label: "Weekly study hours", min: 0, max: 20, step: 1, fmt: (v: number) => `${v} h` },
    { key: "late_night_pct", label: "Study after midnight", min: 0, max: 0.9, step: 0.05, fmt: (v: number) => `${Math.round(v * 100)}%` },
  ] as const;

  return (
    <div className="space-y-5">
      {sliders.map((s) => (
        <label key={s.key} className="block">
          <span className="flex justify-between font-extrabold">
            {s.label}
            <span className="tabular-nums text-teal">{s.fmt(x[s.key])}</span>
          </span>
          <input
            type="range" min={s.min} max={s.max} step={s.step} value={x[s.key]}
            onChange={(e) => setX({ ...x, [s.key]: +e.target.value })}
            className="mt-2 w-full"
          />
        </label>
      ))}
      <p className="rounded-xl bg-polar px-4 py-3 font-bold" aria-live="polite">
        {result ? (
          <>Model says: <span className={result.label === "at_risk" ? "text-sun-ink" : "text-teal"}>{result.label === "at_risk" ? "worth a check-in" : "on track"}</span> · path {result.path.join(" → ")}</>
        ) : "Loading model…"}
      </p>
    </div>
  );
}
