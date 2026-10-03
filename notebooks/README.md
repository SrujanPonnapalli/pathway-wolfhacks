Training lives here (`iaa_baseline.py` + analyses). Export to `public/models/`:

- `tree_early.json`, `tree_mid.json` — sklearn `clf.tree_` arrays, see `src/lib/tree.ts` for the shape:
  ```py
  t = clf.tree_
  json.dump({"feature_names": list(X.columns), "class_names": [str(c) for c in clf.classes_],
             "children_left": t.children_left.tolist(), "children_right": t.children_right.tolist(),
             "feature": t.feature.tolist(), "threshold": t.threshold.tolist(),
             "value": (t.value[:, 0, :] * t.n_node_samples[:, None]).round().tolist(),  # class counts
             "risk_threshold": THRESHOLD}, f)  # tuned for recall >= 0.8
  ```
- `evidence.json` — curves/tables for the Model Evidence tab.

Notes for the export:
- Use the dataset's column names as feature names; the UI's labels and slider bounds live in `src/lib/features.ts`.
- Class index 1 must be at-risk. `risk_threshold` is the at-risk probability cutoff picked on out-of-fold predictions.
- Every `student_id` appears exactly once (800 ids, 800 rows), so grouping the split by student is a no-op. Leakage across splits is impossible by construction; say that instead.
