Training lives here (`iaa_baseline.py` + analyses). Export to `public/models/`:

- `tree_early.json`, `tree_mid.json` — sklearn `clf.tree_` arrays, see `src/lib/tree.ts` for the shape:
  ```py
  t = clf.tree_
  json.dump({"feature_names": list(X.columns), "class_names": [str(c) for c in clf.classes_],
             "children_left": t.children_left.tolist(), "children_right": t.children_right.tolist(),
             "feature": t.feature.tolist(), "threshold": t.threshold.tolist(),
             "value": t.value[:, 0, :].tolist()}, f)
  ```
- `evidence.json` — curves/tables for the Model Evidence tab.
