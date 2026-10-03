# %% [markdown]
# # Pathway: at-risk decision tree (WolfHacks 2026, IAA track)
#
# Predicts whether a student finishes a course with a D or F (`at_risk = 1`) from the synthetic
# end-of-semester dataset in `data/`, evaluates on a held-out test set touched once, and explains
# what the tree learned.
#
# Run as a script:  `.venv\Scripts\python.exe notebooks\pathway_model.py`
# or cell by cell in VS Code (each `# %%` is a cell).
#
# Discipline:
# - Split 60/20/20 (train/validation/test), stratified on at_risk, seed 42.
# - Every choice is made on train (5-fold CV) or validation. The test set is scored once, in the
#   TEST cell, after models and cutoffs are frozen.

# %%
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib

if "ipykernel" not in sys.modules:
    matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, average_precision_score, balanced_accuracy_score, confusion_matrix, f1_score,
    fbeta_score, precision_score, recall_score, roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_val_predict, cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier, plot_tree

try:
    NB = Path(__file__).resolve().parent
except NameError:  # interactive window
    NB = Path.cwd() if (Path.cwd() / "pathway_model.py").exists() else Path.cwd() / "notebooks"
ROOT = NB.parent
DATA = ROOT / "data" / "student_outcomes.csv"
FIG = NB / "figures"
FIG.mkdir(exist_ok=True)

SEED = 42
CV = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
MIN_RECALL = 0.80  # catch at least 4 in 5 struggling students...
COST_FN = 4  # ...because missing one is assumed to cost about 4 false alarms
pd.set_option("display.width", 200, "display.max_columns", 40)

# %% [markdown]
# ## 1. Load and audit
# Verifies the planning docs' claims instead of trusting them.

# %%
raw = pd.read_csv(DATA)
PCT = ["on_time_submission_rate", "late_night_study_pct", "attendance_rate"]
print(f"{len(raw)} rows, {raw.student_id.nunique()} unique student_id → each student appears once; a row split is a student split")
print(f"at_risk: {raw.at_risk.mean():.2%} ({raw.at_risk.sum()} of {len(raw)}); always guessing 'on track' = {1 - raw.at_risk.mean():.2%} accuracy, 0 recall")
print("missing:", raw.isna().sum()[lambda s: s > 0].to_dict())
assert (raw.practice_quizzes_taken.eq(0) == raw.avg_practice_quiz_score.isna()).all()
print("avg_practice_quiz_score is blank exactly when practice_quizzes_taken == 0")
assert all(raw[c].astype(str).str.endswith("%").all() for c in PCT) and not raw.duplicated().any()

# %% [markdown]
# ## 2. Cleaning
# - `%` strings → fractions (0.83).
# - Quiz score blank → **0**: blank always means "no quizzes taken", which belongs at the low end.
#   The median would pretend non-takers scored like an average student.
# - `took_any_quiz` flag: used by logistic regression only. For a tree it is the same partition as
#   `practice_quizzes_taken ≤ 0.5`, which the tree can already make.
# - Work hours and sleep (self-reported, partly blank): a missing flag + the **training-set median**.
# - class_year → 1–4 (ordered). course → one-hot (unordered; the 8 codes are fixed by the data dictionary).

# %%
YEAR = {"Freshman": 1, "Sophomore": 2, "Junior": 3, "Senior": 4}
COURSE_COL = {c: "course_" + c.replace(" ", "_") for c in sorted(raw.course.unique())}
NUMERIC = [
    "credit_hours", "work_hours_per_week", "avg_weekly_study_hours", "study_sessions_logged", "materials_uploaded",
    "practice_quizzes_taken", "avg_practice_quiz_score", "flashcards_reviewed", "avg_days_started_before_exam",
    "on_time_submission_rate", "missed_deadlines", "late_night_study_pct", "attendance_rate", "avg_sleep_hours", "midterm_score",
]
MISSING_FLAGS = {"work_hours_missing": "work_hours_per_week", "sleep_missing": "avg_sleep_hours"}

data = raw.copy()
for c in PCT:
    data[c] = pd.to_numeric(data[c].str.rstrip("%"), errors="raise") / 100
y_all = data.at_risk.to_numpy()


def fit_impute(df: pd.DataFrame) -> dict:
    return {src: float(df[src].median()) for src in MISSING_FLAGS.values()}


def prepare(df: pd.DataFrame, impute: dict) -> pd.DataFrame:
    X = df[NUMERIC].astype(float)
    for flag, src in MISSING_FLAGS.items():
        X[flag] = df[src].isna().astype(float)
        X[src] = X[src].fillna(impute[src])
    X["avg_practice_quiz_score"] = X["avg_practice_quiz_score"].fillna(0.0)
    X["took_any_quiz"] = (df.practice_quizzes_taken > 0).astype(float)
    X["class_year_ord"] = df.class_year.map(YEAR).astype(float)
    for c, col in COURSE_COL.items():
        X[col] = (df.course == c).astype(float)
    assert not X.isna().any().any()
    return X


# %% [markdown]
# ## 3. Features
# - **Early model** (the main one): everything except `midterm_score`, so it can warn in weeks 1–7.
# - **Mid model**: adds `midterm_score`. More accurate, less time to act.
#
# `DIRECTION` is the expected sign of each actionable behaviour's link with risk (more attendance →
# less risk). It powers an optional **monotonic constraint** in the tuning grid, so the tree can never
# say "attending more raises your risk". The cell after the split checks the signs against the
# training data.

# %%
ACTIONABLE = [
    "attendance_rate", "avg_days_started_before_exam", "practice_quizzes_taken", "on_time_submission_rate",
    "missed_deadlines", "late_night_study_pct", "avg_weekly_study_hours", "study_sessions_logged",
]
OTHER = ["credit_hours", "work_hours_per_week", "work_hours_missing", "class_year_ord", "avg_practice_quiz_score",
         "materials_uploaded", "flashcards_reviewed", "avg_sleep_hours", "sleep_missing", *COURSE_COL.values()]
EARLY = ACTIONABLE + OTHER
MID = EARLY + ["midterm_score"]
DIRECTION = {
    "attendance_rate": -1, "avg_days_started_before_exam": -1, "practice_quizzes_taken": -1, "on_time_submission_rate": -1,
    "missed_deadlines": 1, "late_night_study_pct": 1, "avg_weekly_study_hours": -1, "study_sessions_logged": -1,
}
FEATS = {"baseline": EARLY, "logreg_early": EARLY + ["took_any_quiz"], "tree_early": EARLY, "hgb_early": EARLY,
         "logreg_mid": MID + ["took_any_quiz"], "tree_mid": MID, "hgb_mid": MID}

# %% [markdown]
# ## 4. Split: 60 / 20 / 20, stratified, seed 42
# - **train (480)**: fitting + 5-fold CV for every tuning choice
# - **validation (160)**: compare models, depth curve, permutation importance
# - **test (160)**: scored once at the end
#
# After all choices are made, each model is **refit on train + validation (640, "dev")** with the same
# settings before the test. With only 800 rows the extra 33% of data matters; the test stays untouched.

# %%
idx = np.arange(len(data))
dev_idx, test_idx = train_test_split(idx, test_size=0.20, stratify=y_all, random_state=SEED)
train_idx, val_idx = train_test_split(dev_idx, test_size=0.25, stratify=y_all[dev_idx], random_state=SEED)
for name, ix in [("train", train_idx), ("validation", val_idx), ("test", test_idx)]:
    print(f"{name:>10}: {len(ix)} rows, {y_all[ix].mean():.1%} at risk")

imp_tr = fit_impute(data.iloc[train_idx])
X_tr, X_val = prepare(data.iloc[train_idx], imp_tr), prepare(data.iloc[val_idx], imp_tr)
y_tr, y_val = y_all[train_idx], y_all[val_idx]

corr = X_tr[ACTIONABLE].corrwith(pd.Series(y_tr, index=X_tr.index))
assert all(np.sign(corr[f]) == DIRECTION[f] for f in ACTIONABLE), corr
print("monotone priors match the training data's correlation signs:", corr.round(2).to_dict())

# %% [markdown]
# ## 5. Metric and threshold helpers
# - Cutoffs come from **out-of-fold** predictions (each training row scored by a model that never saw
#   it), so the cutoff isn't tuned on rows the model memorised.
# - `recall80`: the highest cutoff that still catches ≥ 80% of at-risk students (best precision at
#   that recall). This is the product cutoff. `accuracy`: the cutoff with the best accuracy.
#   `cost4`: minimises 4 × missed + false alarms, the stated cost ratio, as a cross-check.

# %%
def oof_proba(est, X, y):
    return cross_val_predict(est, X, y, cv=CV, method="predict_proba", n_jobs=-1)[:, 1]


def pick_thresholds(y, p):
    rows = []
    for t in np.unique(p):
        pred = p >= t
        tp, fp, fn = (pred & (y == 1)).sum(), (pred & (y == 0)).sum(), (~pred & (y == 1)).sum()
        rows.append({"t": t, "recall": tp / (tp + fn), "accuracy": (pred == y).mean(), "cost": COST_FN * fn + fp})
    T = pd.DataFrame(rows)
    return {
        "recall80": float(T[T.recall >= MIN_RECALL].t.max()),
        "accuracy": float(T.sort_values(["accuracy", "t"], ascending=[False, False]).t.iloc[0]),
        "cost4": float(T.sort_values(["cost", "t"], ascending=[True, False]).t.iloc[0]),
    }


def scores(y, p, t):
    pred = (p >= t).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "cutoff": t, "accuracy": accuracy_score(y, pred), "bal_acc": balanced_accuracy_score(y, pred),
        "precision": precision_score(y, pred, zero_division=0), "recall": recall_score(y, pred, zero_division=0),
        "f1": f1_score(y, pred, zero_division=0), "f2": fbeta_score(y, pred, beta=2, zero_division=0),
        "roc_auc": roc_auc_score(y, p), "pr_auc": average_precision_score(y, p), "tp": tp, "fn": fn, "fp": fp, "tn": tn,
    }


def boot_ci(y, p, t, keys=("recall", "precision", "f2", "pr_auc", "roc_auc", "accuracy"), n=1000):
    """95% bootstrap interval over test rows: how much each number could move with a different 160."""
    rng = np.random.default_rng(SEED)
    vals = {k: [] for k in keys}
    for _ in range(n):
        i = rng.integers(0, len(y), len(y))
        if y[i].min() != y[i].max():
            s = scores(y[i], p[i], t)
            for k in keys:
                vals[k].append(s[k])
    return {k: (np.percentile(v, 2.5), np.percentile(v, 97.5)) for k, v in vals.items()}


# %% [markdown]
# ## 6. Tune the trees (5-fold CV on train)
# Grid: max_depth × min_samples_leaf × ccp_alpha × class_weight × criterion × monotonic (960 settings).
# - **Scored by PR-AUC** (average precision), not F2. F2 depends on a cutoff, and the cutoff is chosen
#   separately afterwards; tuning on it would mix the two decisions. PR-AUC measures how well at-risk
#   students are ranked above the rest, and suits a 28% positive rate.
# - **1-SE rule**: every setting within one standard error of the best CV score is statistically tied,
#   so take the one with the **fewest leaves** (most readable), preferring monotone, then higher score.

# %%
def tree_grid(features):
    return {
        "max_depth": [2, 3, 4, 5, 6, 8], "min_samples_leaf": [1, 5, 10, 20, 40], "ccp_alpha": [0.0, 0.002, 0.005, 0.01],
        "class_weight": [None, "balanced"], "criterion": ["gini", "entropy"],
        "monotonic_cst": [None, [DIRECTION.get(f, 0) for f in features]],
    }


def n_leaves(est, X, y):
    return est.get_n_leaves()


def tune_tree(name):
    features = FEATS[name]
    gs = GridSearchCV(DecisionTreeClassifier(random_state=SEED), tree_grid(features),
                      scoring={"ap": "average_precision", "leaves": n_leaves}, refit=False, cv=CV, n_jobs=-1).fit(X_tr[features], y_tr)
    r = pd.DataFrame(gs.cv_results_)
    r["monotone"] = r.param_monotonic_cst.map(lambda v: v is not None)
    b = r.mean_test_ap.idxmax()
    se = r.std_test_ap[b] / np.sqrt(CV.get_n_splits())
    pool = r[r.mean_test_ap >= r.mean_test_ap[b] - se].sort_values(["mean_test_leaves", "monotone", "mean_test_ap"], ascending=[True, False, False])
    pick = pool.iloc[0]
    print(f"[{name}] best CV PR-AUC {r.mean_test_ap[b]:.3f} ± {se:.3f} SE ({r.mean_test_leaves[b]:.0f} leaves); "
          f"{len(pool)} settings tied within 1 SE → pick {pick.mean_test_ap:.3f} with {pick.mean_test_leaves:.1f} leaves")
    params = dict(pick.params)
    print("   ", {k: ("monotone" if k == "monotonic_cst" and v else v) for k, v in params.items()})
    return params, r


TUNED, CV_RESULTS = {}, {}
for name in ["tree_early", "tree_mid"]:
    TUNED[name], CV_RESULTS[name] = tune_tree(name)

# %% [markdown]
# ## 7. Comparison models (same CV, same training rows)
# - **Majority class**: always "on track". The bar to clear.
# - **Logistic regression (balanced)**: a simple linear reference; C tuned by CV PR-AUC.
# - **HistGradientBoosting**: an accuracy ceiling, to measure what choosing a readable tree costs.

# %%
gs = GridSearchCV(make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=5000)),
                  {"logisticregression__C": np.logspace(-3, 2, 11)}, scoring="average_precision", cv=CV, n_jobs=-1)
HGB_GRID = {"learning_rate": [0.05, 0.1], "max_leaf_nodes": [7, 15], "min_samples_leaf": [20, 40], "max_iter": [100, 200], "l2_regularization": [0.0, 1.0]}
hg = GridSearchCV(HistGradientBoostingClassifier(early_stopping=False, random_state=SEED), HGB_GRID, scoring="average_precision", cv=CV, n_jobs=-1)
for h in ["early", "mid"]:
    TUNED[f"logreg_{h}"] = gs.fit(X_tr[FEATS[f"logreg_{h}"]], y_tr).best_params_
    print(f"[logreg_{h}] CV PR-AUC {gs.best_score_:.3f}", TUNED[f"logreg_{h}"])
    TUNED[f"hgb_{h}"] = hg.fit(X_tr[FEATS[f"hgb_{h}"]], y_tr).best_params_
    print(f"[hgb_{h}] CV PR-AUC {hg.best_score_:.3f}", TUNED[f"hgb_{h}"])


def make(name):
    p = TUNED.get(name, {})
    if name.startswith("tree"):
        return DecisionTreeClassifier(random_state=SEED, **p)
    if name.startswith("logreg"):
        return make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=5000, C=p["logisticregression__C"]))
    if name.startswith("hgb"):
        return HistGradientBoostingClassifier(early_stopping=False, random_state=SEED, **p)
    return DummyClassifier(strategy="prior")


MODELS = list(FEATS)

# %% [markdown]
# ## 8. Validation comparison
# Each model is fit on train, gets its own recall-80 cutoff from its own out-of-fold training
# predictions, and is scored on validation. Same rule for everyone, no peeking. A tree only has a few
# distinct probabilities (one per leaf), so its recall lands *near* 0.80, not exactly on it.

# %%
THR_TR, val_rows = {}, {}
for m in MODELS:
    est, f = make(m), FEATS[m]
    THR_TR[m] = {"recall80": 0.5, "accuracy": 0.5, "cost4": 0.5} if m == "baseline" else pick_thresholds(y_tr, oof_proba(est, X_tr[f], y_tr))
    est.fit(X_tr[f], y_tr)
    val_rows[m] = scores(y_val, est.predict_proba(X_val[f])[:, 1], THR_TR[m]["recall80"])
VAL = pd.DataFrame(val_rows).T
print(VAL.drop(columns=["tp", "fn", "fp", "tn"]).astype(float).round(3))

# %% [markdown]
# ## 9. Overfitting control: depth curve (train / CV / validation)
# Depth varies with leaf-size and pruning limits **off**, so the curve shows raw overfitting: train
# PR-AUC keeps climbing while CV and validation level off or fall. The chosen tree is marked.

# %%
base = {**TUNED["tree_early"], "min_samples_leaf": 1, "ccp_alpha": 0.0}
depth_rows = []
for d in range(1, 13):
    est = DecisionTreeClassifier(random_state=SEED, **{**base, "max_depth": d})
    cv_ap = cross_val_score(est, X_tr[EARLY], y_tr, cv=CV, scoring="average_precision", n_jobs=-1).mean()
    est.fit(X_tr[EARLY], y_tr)
    depth_rows.append({"depth": d, "leaves": est.get_n_leaves(), "train": average_precision_score(y_tr, est.predict_proba(X_tr[EARLY])[:, 1]),
                       "cv": cv_ap, "validation": average_precision_score(y_val, est.predict_proba(X_val[EARLY])[:, 1])})
DEPTH = pd.DataFrame(depth_rows)
chosen_tr = make("tree_early").fit(X_tr[EARLY], y_tr)
print(DEPTH.round(3).to_string(index=False))
print(f"chosen tree: depth {chosen_tr.get_depth()}, {chosen_tr.get_n_leaves()} leaves, "
      f"train PR-AUC {average_precision_score(y_tr, chosen_tr.predict_proba(X_tr[EARLY])[:, 1]):.3f}, validation {VAL.loc['tree_early', 'pr_auc']:.3f}")

# %% [markdown]
# ## 10. Permutation importance (validation)
# How much validation PR-AUC drops when one feature's values are shuffled (30 repeats). On validation,
# not train, so it measures what the tree relies on to generalise. Unused features score exactly 0.

# %%
pi = permutation_importance(chosen_tr, X_val[EARLY], y_val, scoring="average_precision", n_repeats=30, random_state=SEED, n_jobs=-1)
IMPORTANCE = pd.DataFrame({"feature": EARLY, "mean": pi.importances_mean, "std": pi.importances_std}).query("mean != 0 or std != 0").sort_values("mean", ascending=False)
print(IMPORTANCE.round(4).to_string(index=False))

# %% [markdown]
# ## 11. Final refit on dev (train + validation) and final cutoffs
# Same settings, 640 rows. Cutoffs are re-chosen with the same rules on 5-fold out-of-fold predictions
# over dev. These frozen models go to the test set.

# %%
imp_dev = fit_impute(data.iloc[dev_idx])
X_dev, X_test = prepare(data.iloc[dev_idx], imp_dev), prepare(data.iloc[test_idx], imp_dev)
y_dev, y_test = y_all[dev_idx], y_all[test_idx]
FIT, THR = {}, {}
for m in MODELS:
    est, f = make(m), FEATS[m]
    THR[m] = {"recall80": 0.5, "accuracy": 0.5, "cost4": 0.5} if m == "baseline" else pick_thresholds(y_dev, oof_proba(est, X_dev[f], y_dev))
    FIT[m] = est.fit(X_dev[f], y_dev)
for m in ["tree_early", "tree_mid"]:
    print(f"[{m}] depth {FIT[m].get_depth()}, {FIT[m].get_n_leaves()} leaves; cutoffs {({k: round(v, 3) for k, v in THR[m].items()})}")

# %% [markdown]
# ## 12. TEST: scored once
# Every model at its recall-80 cutoff (from dev out-of-fold predictions), plus the two trees at their
# accuracy-optimal cutoff. 95% bootstrap intervals for the trees: the test set holds ~44 at-risk
# students, so one student moves recall by ~2.3 points.

# %%
P_TEST = {m: FIT[m].predict_proba(X_test[FEATS[m]])[:, 1] for m in MODELS}
TEST = {m: scores(y_test, P_TEST[m], THR[m]["recall80"]) for m in MODELS}
for m in ["tree_early", "tree_mid"]:
    TEST[f"{m} @accuracy cutoff"] = scores(y_test, P_TEST[m], THR[m]["accuracy"])
TEST_DF = pd.DataFrame(TEST).T
print(TEST_DF.astype(float).round(3).to_string())
for m in ["tree_early", "tree_mid"]:
    ci = boot_ci(y_test, P_TEST[m], THR[m]["recall80"])
    print(f"[{m}] 95% CI: " + ", ".join(f"{k} {lo:.2f}–{hi:.2f}" for k, (lo, hi) in ci.items()))
e, b = TEST["tree_early"], TEST["hgb_early"]
print(f"\nprice of interpretability: the {FIT['tree_early'].get_n_leaves()}-leaf early tree keeps {e['pr_auc'] / b['pr_auc']:.0%} of boosting's PR-AUC "
      f"({e['pr_auc']:.3f} vs {b['pr_auc']:.3f}); precision at ~80% recall {e['precision']:.2f} vs {b['precision']:.2f}")
print(f"early vs mid: recall {e['recall']:.2f} vs {TEST['tree_mid']['recall']:.2f}, precision {e['precision']:.2f} vs {TEST['tree_mid']['precision']:.2f}, "
      f"PR-AUC {e['pr_auc']:.3f} vs {TEST['tree_mid']['pr_auc']:.3f}")

# %% [markdown]
# ## 13. What the early tree learned, in plain English
# One line per leaf, sorted by risk. Counts are the 640 dev students who landed in that leaf (raw,
# not class-weighted). Wording describes patterns in the data, not causes.

# %%
RATES = {"attendance_rate", "on_time_submission_rate", "late_night_study_pct"}
INTS = {"practice_quizzes_taken", "missed_deadlines", "study_sessions_logged", "materials_uploaded", "flashcards_reviewed", "credit_hours", "midterm_score"}


def cond(f, lo, hi):
    if f.startswith("course_"):
        return f"{'in' if lo >= 0.5 else 'not in'} {f[7:].replace('_', ' ')}"
    if f == "class_year_ord":
        return " or ".join(y for y, k in YEAR.items() if lo < k <= hi)
    if f.endswith("_missing"):
        return f"{f.split('_')[0]} hours {'not reported' if lo >= 0.5 else 'reported'}"
    fmt = (lambda v: f"{v:.1%}") if f in RATES else (lambda v: f"{v:g}")
    if f in INTS:  # "> 8.5" on an integer means "at least 9"
        parts = [f"≥ {int(np.floor(lo)) + 1}" if lo > -np.inf else "", f"≤ {int(np.floor(hi))}" if hi < np.inf else ""]
    else:
        parts = [f"> {fmt(lo)}" if lo > -np.inf else "", f"≤ {fmt(hi)}" if hi < np.inf else ""]
    return f"{f} " + " and ".join(p for p in parts if p)


def leaf_rules(est, features, X, y, cutoff):
    t = est.tree_
    leaf = est.apply(X)
    out = []

    def walk(i, lo, hi):
        if t.children_left[i] == -1:
            m = leaf == i
            n, k = int(m.sum()), int(y[m].sum())
            fs = list(dict.fromkeys([*lo, *hi]))
            rate = k / n
            out.append((rate, f"If {' and '.join(cond(f, lo.get(f, -np.inf), hi.get(f, np.inf)) for f in fs)}: "
                              f"{k} of {n} students ({rate:.0%}) finished below a C → {'worth a check-in' if est.predict_proba(X[m][:1])[0, 1] >= cutoff else 'on track'}"))
            return
        f, thr = features[t.feature[i]], t.threshold[i]
        walk(t.children_left[i], lo, {**hi, f: min(hi.get(f, np.inf), thr)})
        walk(t.children_right[i], {**lo, f: max(lo.get(f, -np.inf), thr)}, hi)

    walk(0, {}, {})
    return [s for _, s in sorted(out, reverse=True)]


for m, f in [("tree_early", EARLY), ("tree_mid", MID)]:
    print(f"--- {m} (cutoff {THR[m]['recall80']:.3f}) ---")
    for line in leaf_rules(FIT[m], f, X_dev[f], y_dev, THR[m]["recall80"]):
        print(" ", line)

# %% [markdown]
# ## 14. Figures (notebooks/figures/)
# Light surface; blue / orange / aqua series in a fixed order; 2px lines; direct labels; light grid.

# %%
INK, INK2, MUTED, GRID, SURF = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#fcfcfb"
S1, S2, S3 = "#2a78d6", "#eb6834", "#1baf7a"
plt.rcParams.update({"figure.facecolor": SURF, "axes.facecolor": SURF, "axes.edgecolor": "#c3c2b7", "axes.labelcolor": INK2,
                     "xtick.color": MUTED, "ytick.color": MUTED, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6,
                     "axes.spines.top": False, "axes.spines.right": False, "font.size": 11, "axes.titlecolor": INK,
                     "legend.frameon": False, "lines.linewidth": 2})

fig, ax = plt.subplots(figsize=(7.5, 4.2))
for col, c, lab in [("train", S1, "Train"), ("cv", S2, "5-fold CV"), ("validation", S3, "Validation")]:
    ax.plot(DEPTH.depth, DEPTH[col], color=c, marker="o", markersize=4, label=lab)
ax.axvline(chosen_tr.get_depth(), color=MUTED, linestyle="--", linewidth=1)
ax.text(chosen_tr.get_depth() + 0.15, ax.get_ylim()[0] + 0.01, f"chosen tree\ndepth {chosen_tr.get_depth()}, {chosen_tr.get_n_leaves()} leaves", color=INK2, fontsize=9)
ax.set(title="Deeper trees memorise the training data", xlabel="max depth (leaf-size and pruning limits off)", ylabel="PR-AUC", xlim=(0.5, 12.5))
ax.legend(loc="center right", bbox_to_anchor=(1, 0.72))
fig.tight_layout()
fig.savefig(FIG / "depth_curve.png", dpi=200)

imp = IMPORTANCE.head(10)
fig, ax = plt.subplots(figsize=(7, 0.45 * len(imp) + 1.3))
ax.barh(imp.feature, imp["mean"], xerr=imp["std"], color=S1, height=0.6, error_kw={"ecolor": MUTED, "lw": 1})
ax.invert_yaxis()
ax.grid(axis="y", visible=False)
ax.set(title="What the early tree relies on (validation)", xlabel="drop in PR-AUC when the feature is shuffled")
fig.tight_layout()
fig.savefig(FIG / "importance.png", dpi=200)

fig, ax = plt.subplots(figsize=(24, 9))
plot_tree(FIT["tree_early"], feature_names=EARLY, class_names=["on track", "at risk"], filled=False, impurity=False, rounded=True, precision=3, fontsize=8, ax=ax)
weighted = " (value = class-weighted counts; raw counts are in the printed rules)" if TUNED["tree_early"].get("class_weight") else ""
ax.set_title(f"Early-semester tree, fit on train + validation{weighted}")
fig.tight_layout()
fig.savefig(FIG / "tree_early.png", dpi=200)
if "ipykernel" not in sys.modules:
    plt.close("all")
print("figures:", *(p.name for p in sorted(FIG.glob("*.png"))))
