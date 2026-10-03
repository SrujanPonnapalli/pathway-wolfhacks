# Model results

Two decision trees predict whether a student finishes a course below a C (`at_risk`). Everything here is produced by `pathway_model.py` (seed 42).

- **Data:** 800 synthetic students, one row each, 27.75% at risk.
- **Split:** 60/20/20 train/validation/test, stratified. Each student appears once, so no student is in two splits.
- **Selection:** every model choice was made by 5-fold cross-validation (CV) on the 480 training rows. Final models were refit on train + validation (640 rows).
- **Cutoff:** the highest cutoff that still catches at least 80% of at-risk students on out-of-fold predictions. We assume missing a struggling student costs about 4 false alarms.
- **PR-AUC:** how well the model ranks at-risk students above the rest, averaged over all cutoffs. Guessing scores 0.28.

## Final models

| | Early tree (v2) | Mid tree |
|---|---|---|
| Use | From week 1; no midterm needed | After the midterm score is entered |
| Inputs | Study habits and context, plus `warning_signs` | The same, plus `midterm_score`; no `warning_signs` |
| Size | Depth 4, 11 leaves | Depth 3, 6 leaves |
| Settings | min 20 students per leaf, no pruning, gini, unweighted, monotone | min 20 students per leaf, pruning 0.005, gini, unweighted, monotone |
| Cutoff | 0.248 | 0.253 |

`warning_signs` (0–4) counts how many of these hold for a student. Each cutoff is the bottom third of the training students (q = 0.33):

- on-time submission rate ≤ 79%
- exam prep started ≤ 1.9 days out
- attendance ≤ 82%
- practice-quiz score ≤ 69.2 (no quizzes taken counts as 0)

"Monotone" means the tree is constrained so that better habits (more attendance, earlier prep, fewer warning signs) can never raise predicted risk.

## Test results (160 held-out students, 44 at risk)

| Model | Recall | Precision | Accuracy | Balanced accuracy | PR-AUC | Caught / missed | False alarms |
|---|---|---|---|---|---|---|---|
| Baseline: everyone "on track" | 0.00 | — | 0.725 | 0.50 | 0.28 | 0 / 44 | 0 |
| Early tree v1 (first look) | 0.73 | 0.55 | 0.76 | 0.75 | 0.63 | 32 / 12 | 26 |
| **Early tree v2 (second look)** | **0.73** | **0.63** | **0.81** | **0.78** | **0.75** | **32 / 12** | **19** |
| **Mid tree (first look)** | **0.93** | **0.62** | **0.83** | **0.86** | **0.72** | **41 / 3** | **25** |
| Logistic regression, early (reference) | 0.82 | 0.67 | 0.84 | 0.83 | 0.81 | 36 / 8 | 18 |
| Boosting, early (reference) | 0.86 | 0.59 | 0.80 | 0.82 | 0.82 | 38 / 6 | 26 |

- **The test set was scored twice, and both looks are reported.** The first look scored v1 and all comparison models (`results_v1_test.csv`). The early tree was then revised using CV only, and v2 was scored once (`results_v2_test.csv`). The other models did not change between looks.
- **95% bootstrap ranges:** early v2 recall 0.59–0.85 and precision 0.49–0.76; mid recall 0.84–1.00 and precision 0.50–0.74. With 44 at-risk test students, one student moves recall by about 2 points.
- **Early v2 misses the 80% recall target on the test set** (0.73), although it met it on out-of-fold training data. A tree has only one risk value per leaf, so its cutoff cannot be fine-tuned.
- **The readable tree costs accuracy.** Early v2 keeps about 91% of boosting's PR-AUC (0.75 vs 0.82).

## Experiments (CV on the 480 training rows)

A change was kept only if it raised CV PR-AUC by more than about 0.03. "25 folds" is the same setting re-scored on 5×5 repeated CV, which is less noisy. Precision is out-of-fold, at each model's ~80%-recall cutoff. Full tables: `results_cv_early.csv`, `results_cv_mid.csv`.

### Early tree

| Candidate | CV PR-AUC | 25 folds | Precision | Outcome |
|---|---|---|---|---|
| v1: no count (smallest tied setting) | 0.663 | 0.635 | 0.51 | Replaced by v2 |
| v1 grid, best-scoring setting (~11 leaves) | 0.686 | 0.642 | 0.52 | Not kept: +0.02 over v1 |
| **4 signs (smallest tied setting) = v2** | **0.743** | **0.730** | **0.58** | **Kept: +0.08 over v1** |
| 4 signs, best-scoring setting | 0.752 | 0.725 | 0.63 | Not kept: no better than v2 on 25 folds, larger tree |
| Count over all 8 actionable habits | 0.719 | 0.711 | 0.56 | Not kept: below v2 |
| Count over 8 actionable habits + quiz score | 0.713 | 0.712 | 0.58 | Not kept: below v2 |

### Mid tree

| Candidate | CV PR-AUC | 25 folds | Precision | Outcome |
|---|---|---|---|---|
| **Current mid tree** | **0.716** | **0.686** | **0.67** | **Kept** |
| Mid tree + 4 signs | 0.761 | 0.748 | 0.63 | Not kept: PR-AUC +0.05, but precision at the cutoff fell and the tree is larger |

The mid tree + 4 signs was never scored on the test set.

## Caveats

- The data is synthetic. Patterns describe this dataset, not real students, and they are associations, not causes.
- The trees use some features that must never be given as advice: the early tree splits on sleep, work hours and course, and counts the practice-quiz score as a warning sign; the mid tree splits on the midterm score. These are context only.
- The early v2 tree needs `warning_signs` computed before prediction; the app does not compute it yet.
