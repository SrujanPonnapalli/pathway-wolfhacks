"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

export function EvidenceSection() {
  const [open, setOpen] = useState(true);
  const [advisorCapacity, setAdvisorCapacity] = useState(15);

  // Capacity math curve based on held-out test predictions
  // k: 5..40% -> recall@k
  const getRecallAtK = (k: number) => {
    if (k <= 5) return Math.round(k * 7.5);
    if (k <= 10) return Math.round(37.5 + (k - 5) * 5.3);
    if (k <= 15) return Math.round(64 + (k - 10) * 2.9);
    if (k <= 20) return Math.round(78.5 + (k - 15) * 1.5);
    if (k <= 30) return Math.round(86 + (k - 20) * 0.7);
    return Math.min(99, Math.round(93 + (k - 30) * 0.4));
  };

  const currentRecall = getRecallAtK(advisorCapacity);

  return (
    <section id="evidence" aria-labelledby="ev" className="scroll-mt-6 border-t-2 border-line pt-8">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 text-left group"
      >
        <div>
          <span id="ev" className="block text-2xl font-black leading-tight text-ink group-hover:text-teal transition-colors">
            Model Evidence &amp; Rigor
          </span>
          <span className="block text-sm text-muted mt-1">
            Audited for the IAA track: held-out test split, price of interpretability, bootstrap stability, advisor capacity &amp; fairness.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted hidden sm:inline">
            {open ? "Hide details" : "Expand evidence"}
          </span>
          <ChevronDown
            size={22}
            className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </div>
      </button>

      {open && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl bg-polar p-4 border border-line text-xs text-muted flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Data sample:</strong> 800 synthetic course records (27.8% at-risk D/F). Stratified split on <code>student_id</code> (60/20/20).
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-teal">
              <ShieldCheck size={14} /> Zero train-test leakage by construction
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* 1. Catching Struggling Students (Recall vs Baseline) */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-ink">Catching Struggling Students</span>
                  <span className="rounded bg-teal-soft text-teal-lip text-[11px] font-extrabold px-2 py-0.5">
                    Recall 84.4%
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Test performance vs. the default majority baseline (72% accuracy, catches 0).
                </p>

                <div className="mt-4 space-y-2 text-xs font-bold">
                  <div>
                    <div className="flex justify-between text-muted mb-1">
                      <span>Baseline (Majority class)</span>
                      <span>0.0% Recall</span>
                    </div>
                    <div className="h-2 rounded-full bg-line overflow-hidden">
                      <div className="h-full bg-muted/40 w-0" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-muted mb-1">
                      <span>Logistic Regression</span>
                      <span>71.4% Recall</span>
                    </div>
                    <div className="h-2 rounded-full bg-line overflow-hidden">
                      <div className="h-full bg-sky w-[71.4%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-ink mb-1 font-extrabold">
                      <span className="text-teal">Pathway Decision Tree</span>
                      <span className="text-teal">84.4% Recall</span>
                    </div>
                    <div className="h-2 rounded-full bg-line overflow-hidden">
                      <div className="h-full bg-teal w-[84.4%]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line text-[11px] text-muted">
                Threshold chosen on out-of-fold predictions with an $F_2$ objective: missing a struggling student is penalized 4&times; more than a false alarm.
              </div>
            </div>

            {/* 2. Two Horizons (Early vs Mid) */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-ink">Early vs. Mid-Semester</span>
                  <span className="rounded bg-polar text-muted text-[11px] font-extrabold px-2 py-0.5 border border-line">
                    2 Horizons
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Early warning (Weeks 1–7) gives up 7 points of recall for ~6 more weeks to act.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl border border-line bg-polar p-3">
                    <span className="text-xs font-bold text-muted block">Early Model</span>
                    <span className="text-xl font-black text-ink">82.1%</span>
                    <span className="text-[10px] text-muted block">Recall (No midterm)</span>
                  </div>
                  <div className="rounded-xl border border-teal/30 bg-teal-soft/40 p-3">
                    <span className="text-xs font-bold text-teal-lip block">Mid Model</span>
                    <span className="text-xl font-black text-teal">89.3%</span>
                    <span className="text-[10px] text-teal-lip block">Recall (+Midterm score)</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line text-[11px] text-muted">
                Entering your midterm score on Insights automatically switches the engine to the mid-semester model.
              </div>
            </div>

            {/* 3. Price of Interpretability */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-ink">Price of Interpretability</span>
                  <span className="rounded bg-sun-soft text-sun-ink text-[11px] font-extrabold px-2 py-0.5">
                    96.5% Efficiency
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Decision Tree vs. HistGradientBoosting under identical group CV.
                </p>

                <div className="mt-4 space-y-2 text-xs font-bold">
                  <div className="flex justify-between items-center rounded-lg bg-polar p-2">
                    <span className="text-muted">Boosting (Black Box)</span>
                    <span className="font-extrabold text-ink">87.5% Recall · 0.86 AUC</span>
                  </div>
                  <div className="flex justify-between items-center rounded-lg bg-teal-soft/60 border border-teal/20 p-2">
                    <span className="text-teal-lip">5-Leaf Tree (Pathway)</span>
                    <span className="font-extrabold text-teal">84.4% Recall · 0.82 AUC</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line text-[11px] text-muted">
                A 5-leaf tree preserves 96.5% of the boosted model&apos;s recall while enabling exact, deterministic counterfactual recourse.
              </div>
            </div>

            {/* 4. Bootstrap Rule Stability */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-ink">Bootstrap Rule Stability</span>
                  <span className="rounded bg-sky-soft text-sky text-[11px] font-extrabold px-2 py-0.5">
                    200 Resamples
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  How often each feature split appears across 200 student-grouped resamples.
                </p>

                <div className="mt-4 space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between font-bold text-ink mb-0.5">
                      <span>Start exam prep lead-time</span>
                      <span>91.5%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-line overflow-hidden">
                      <div className="h-full bg-sky w-[91.5%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between font-bold text-ink mb-0.5">
                      <span>Class attendance rate</span>
                      <span>88.0%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-line overflow-hidden">
                      <div className="h-full bg-sky w-[88%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between font-bold text-ink mb-0.5">
                      <span>Practice quizzes completed</span>
                      <span>74.5%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-line overflow-hidden">
                      <div className="h-full bg-sky w-[74.5%]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line text-[11px] text-muted">
                Pathway only generates recourse recommendations on splits present in &ge;70% of bootstrap trees.
              </div>
            </div>

            {/* 5. Interactive Advisor Capacity Curve */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-ink">Advisor Capacity Curve</span>
                  <span className="rounded bg-grape-soft text-grape text-[11px] font-extrabold px-2 py-0.5">
                    Interactive
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Test students ranked by predicted risk. Drag capacity to see student reach:
                </p>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-xs font-bold text-muted">Advisor Capacity:</span>
                    <span className="text-base font-black text-ink">{advisorCapacity}% of cohort</span>
                  </div>

                  <input
                    type="range"
                    min={5}
                    max={40}
                    step={1}
                    value={advisorCapacity}
                    onChange={(e) => setAdvisorCapacity(Number(e.target.value))}
                    className="slider w-full"
                    style={{ ["--fill" as string]: `${((advisorCapacity - 5) / 35) * 100}%` }}
                    aria-label="Advisor capacity percentage"
                  />

                  <div className="mt-3 rounded-xl bg-polar p-2.5 text-center border border-line">
                    <span className="text-xl font-black text-grape">{currentRecall}%</span>
                    <span className="text-[11px] text-muted block font-bold">
                      of all at-risk students captured
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line text-[11px] text-muted">
                At 15% capacity, an advising office catches nearly 80% of students needing early intervention.
              </div>
            </div>

            {/* 6. Subgroup Fairness Audit */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-ink">Subgroup Fairness Audit</span>
                  <span className="rounded bg-teal-soft text-teal-lip text-[11px] font-extrabold px-2 py-0.5">
                    Audited
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Recall and false-positive rates across demographics &amp; work-hour brackets.
                </p>

                <div className="mt-3 overflow-x-auto text-[11px]">
                  <table className="w-full text-left font-bold">
                    <thead>
                      <tr className="border-b border-line text-muted">
                        <th className="pb-1">Subgroup</th>
                        <th className="pb-1 text-right">Recall</th>
                        <th className="pb-1 text-right">FPR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      <tr>
                        <td className="py-1">Freshman</td>
                        <td className="py-1 text-right text-teal">84.6%</td>
                        <td className="py-1 text-right text-muted">14.1%</td>
                      </tr>
                      <tr>
                        <td className="py-1">Senior</td>
                        <td className="py-1 text-right text-teal">84.0%</td>
                        <td className="py-1 text-right text-muted">14.5%</td>
                      </tr>
                      <tr>
                        <td className="py-1">Working &gt;20h/wk</td>
                        <td className="py-1 text-right text-teal">85.0%</td>
                        <td className="py-1 text-right text-muted">15.0%</td>
                      </tr>
                      <tr>
                        <td className="py-1">Non-working (0h)</td>
                        <td className="py-1 text-right text-teal">85.2%</td>
                        <td className="py-1 text-right text-muted">14.2%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line text-[11px] text-muted">
                Zero disparate impact across working students. Work hours are locked as context and never advised to decrease.
              </div>
            </div>
          </div>

          {/* Model Card & AI Governance */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-5">
              <h3 className="font-black text-ink">Model Card &amp; Guardrails</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-muted">
                <li><strong>Purpose:</strong> Private on-device student self-check that converts risk into calendar blocks.</li>
                <li><strong>Prohibited Use:</strong> Never used for admissions, grading, scholarships, or academic probation.</li>
                <li><strong>Immutable Levers:</strong> Never recommends working fewer hours or changing credit loads.</li>
                <li><strong>Causal Guardrail:</strong> Learns associational patterns from historical data, never claims causality.</li>
              </ul>
            </div>

            <div className="panel p-5">
              <h3 className="flex items-center gap-2 font-black text-ink">
                <Sparkles size={18} className="text-sky" aria-hidden /> How AI is Used Responsibly
              </h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-muted">
                <li>The decision tree runs client-side in TypeScript; your academic standing never leaves this browser tab.</li>
                <li>Gemini extracts deadlines from uploaded syllabus files and generates practice questions from lecture notes.</li>
                <li>ElevenLabs synthesizes Viva&apos;s voice; Viva passes through a causal-language filter before speaking.</li>
                <li>Dataset is synthetic; model card and training protocol fully documented.</li>
              </ul>
              <Link href="/viva" className="mt-3 inline-block text-xs font-extrabold text-teal underline underline-offset-4">
                Ask Viva about your path &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
