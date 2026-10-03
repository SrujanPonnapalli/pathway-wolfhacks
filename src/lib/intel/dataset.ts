// CSV / dataset -> profile (computed in code, so every number is real) + Gemini insights.
// Handles the WolfHacks student_outcomes.csv and any other tabular file a student uploads.

import { Type, type Schema } from "@google/genai";
import { generateJSON, textPart } from "../gemini";
import { FEATURES } from "../features";

export type ColumnProfile = {
  name: string;
  type: "numeric" | "categorical" | "percent" | "id";
  missing_pct: number;
  distinct: number;
  // numeric / percent
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  // categorical
  top_values?: { value: string; count: number }[];
  // numeric columns only: how much the mean differs between target=1 and target=0
  mean_by_target?: { positive: number; negative: number; lift_pct: number };
};

export type DatasetProfile = {
  rows: number;
  columns: number;
  target: string | null; // detected binary outcome column, if any
  target_rate: number | null;
  column_profiles: ColumnProfile[];
  sample_rows: Record<string, string>[];
  issues: string[]; // things the cleaning step must handle
};

export type DatasetInsights = {
  summary: string;
  strongest_signals: { column: string; finding: string; direction: "higher_is_riskier" | "lower_is_riskier" | "unclear" }[];
  cleaning_steps: string[];
  leakage_risks: string[]; // columns that would leak the outcome
  controllable_features: string[]; // things a student can change this week
  context_only_features: string[]; // things a student cannot or should not change
  never_suggest_features: string[]; // gameable or health-related; the app never suggests these
  modeling_notes: string[];
  plain_language_for_students: string[]; // 3 sentences a freshman could read
};

// ---- CSV parsing (handles quotes, no deps) ---------------------------------------

export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift()?.map((h) => h.trim()) ?? [];
  return { headers, rows };
}

function toNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseFloat(t.replace(/%$/, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function profileDataset(text: string, opts: { target?: string } = {}): DatasetProfile {
  const { headers, rows } = parseCSV(text);
  const n = rows.length;
  const issues: string[] = [];
  const cols = headers.map((_, j) => rows.map((r) => r[j] ?? ""));

  // detect a binary target: user-provided, or a column named like at_risk/label/target with values {0,1}
  let target: string | null = opts.target ?? null;
  if (!target) {
    const cand = headers.findIndex((h, j) => /at_risk|target|label|outcome|fail|pass/i.test(h) && new Set(cols[j].map((v) => v.trim())).size <= 3);
    if (cand >= 0) target = headers[cand];
  }
  const tIdx = target ? headers.indexOf(target) : -1;
  const tVals = tIdx >= 0 ? cols[tIdx].map((v) => (toNum(v) === 1 ? 1 : toNum(v) === 0 ? 0 : null)) : [];
  const targetRate = tIdx >= 0 ? tVals.filter((v) => v === 1).length / Math.max(1, tVals.filter((v) => v !== null).length) : null;

  const profiles: ColumnProfile[] = headers.map((name, j) => {
    const raw = cols[j];
    const nonEmpty = raw.filter((v) => v.trim() !== "");
    const missing = 1 - nonEmpty.length / Math.max(1, n);
    const distinct = new Set(nonEmpty.map((v) => v.trim())).size;
    const nums = nonEmpty.map(toNum);
    const numeric = nums.every((v) => v !== null) && nonEmpty.length > 0;
    const isPct = numeric && nonEmpty.every((v) => v.trim().endsWith("%"));
    const isId = distinct === nonEmpty.length && nonEmpty.length > 20 && !numeric;

    if (missing > 0.05) issues.push(`${name}: ${(missing * 100).toFixed(1)}% missing`);
    if (isPct) issues.push(`${name}: stored as text with % sign, convert to number`);

    const p: ColumnProfile = { name, type: isId ? "id" : isPct ? "percent" : numeric ? "numeric" : "categorical", missing_pct: +(missing * 100).toFixed(1), distinct };
    if (numeric) {
      const xs = nums as number[];
      p.min = Math.min(...xs);
      p.max = Math.max(...xs);
      p.mean = +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3);
      p.median = median(xs);
      if (isPct && p.max! > 100) issues.push(`${name}: percent above 100`);
      if (/attendance|rate|pct/i.test(name) && p.max! > 100) issues.push(`${name}: value above 100%`);
      if (/hours|sessions|count|score/i.test(name) && p.min! < 0) issues.push(`${name}: negative values`);
      if (tIdx >= 0 && j !== tIdx) {
        const pos: number[] = [], neg: number[] = [];
        raw.forEach((v, i) => {
          const x = toNum(v);
          if (x === null) return;
          if (tVals[i] === 1) pos.push(x);
          else if (tVals[i] === 0) neg.push(x);
        });
        if (pos.length && neg.length) {
          const mp = pos.reduce((a, b) => a + b, 0) / pos.length;
          const mn = neg.reduce((a, b) => a + b, 0) / neg.length;
          p.mean_by_target = { positive: +mp.toFixed(3), negative: +mn.toFixed(3), lift_pct: mn ? +(((mp - mn) / Math.abs(mn)) * 100).toFixed(1) : 0 };
        }
      }
    } else {
      const counts = new Map<string, number>();
      nonEmpty.forEach((v) => counts.set(v.trim(), (counts.get(v.trim()) ?? 0) + 1));
      p.top_values = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count }));
    }
    return p;
  });

  // duplicates
  const seen = new Set<string>();
  let dups = 0;
  rows.forEach((r) => (seen.has(r.join("\u0001")) ? dups++ : seen.add(r.join("\u0001"))));
  if (dups) issues.push(`${dups} exact duplicate rows`);

  const sample = rows.slice(0, 5).map((r) => Object.fromEntries(headers.map((h, j) => [h, r[j] ?? ""])));
  return { rows: n, columns: headers.length, target, target_rate: targetRate === null ? null : +targetRate.toFixed(3), column_profiles: profiles, sample_rows: sample, issues };
}

// ---- Gemini interpretation ------------------------------------------------------

const schema: Schema = {
  type: Type.OBJECT,
  required: ["summary", "strongest_signals", "cleaning_steps", "leakage_risks", "controllable_features", "context_only_features", "never_suggest_features", "modeling_notes", "plain_language_for_students"],
  properties: {
    summary: { type: Type.STRING },
    strongest_signals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["column", "finding", "direction"],
        properties: {
          column: { type: Type.STRING },
          finding: { type: Type.STRING },
          direction: { type: Type.STRING, enum: ["higher_is_riskier", "lower_is_riskier", "unclear"] },
        },
      },
    },
    cleaning_steps: { type: Type.ARRAY, items: { type: Type.STRING } },
    leakage_risks: { type: Type.ARRAY, items: { type: Type.STRING } },
    controllable_features: { type: Type.ARRAY, items: { type: Type.STRING } },
    context_only_features: { type: Type.ARRAY, items: { type: Type.STRING } },
    never_suggest_features: { type: Type.ARRAY, items: { type: Type.STRING } },
    modeling_notes: { type: Type.ARRAY, items: { type: Type.STRING } },
    plain_language_for_students: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
};

const SYSTEM = `You are a careful data scientist helping students build an early-warning model from a
tabular dataset. You are given a computed profile (real numbers) and sample rows. Rules:
- Use only the numbers in the profile. Never invent statistics. Quote lift_pct and means when you cite a signal.
- Leakage: flag any column that is derived from the outcome (final grades, "at_risk"-like duplicates, end-of-term totals).
- Feature roles: the app has fixed roles for known columns (given below as "known_roles"). Use them exactly.
  suggest -> controllable_features; context -> context_only_features; never -> never_suggest_features
  (gameable counts like uploads or flashcards reviewed, and health like sleep). For columns not in known_roles,
  decide: controllable = a behavior the student can change this week; context = circumstances; never = gameable or health.
- cleaning_steps must address every item in the profile's issues list.
- Describe patterns with "students with X often ...", never cause and effect.
- plain_language_for_students: three short sentences a freshman could read.`;

export async function interpretDataset(profile: DatasetProfile, question?: string): Promise<DatasetInsights> {
  const compact = { ...profile, sample_rows: profile.sample_rows.slice(0, 3) };
  const knownRoles = Object.fromEntries(profile.column_profiles.filter((c) => FEATURES[c.name]).map((c) => [c.name, FEATURES[c.name].role]));
  return generateJSON<DatasetInsights>({
    parts: [textPart(`Dataset profile:\n${JSON.stringify(compact, null, 1)}\n\nknown_roles:\n${JSON.stringify(knownRoles)}`), textPart(question ? `Question from the student: ${question}` : "Interpret this dataset for an early-warning model.")],
    schema,
    system: SYSTEM,
  });
}
