// Thin wrapper over @google/genai. Every Gemini call in the app goes through here so
// the model name, JSON mode, and file handling live in one place.

import { GoogleGenAI, ThinkingLevel, type Part, type Schema, type Content, type FunctionDeclaration } from "@google/genai";

// Two tiers. FAST answers chat in under a second (no thinking). HEAVY reads documents.
// Measured 2026-10-03 on a free key: 3.5-flash-lite ~0.9 s; 3.8-flash better at PDFs but
// hits quota / "high demand" often, so everything falls back down the chain.
export const FAST_MODEL = process.env.GEMINI_MODEL_FAST ?? "gemini-3.5-flash-lite";
export const HEAVY_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
export const MODEL = HEAVY_MODEL;
const FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-flash-latest"];

let _ai: GoogleGenAI | null = null;
export function ai() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set (see .env.example).");
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _ai;
}

/** A file as an inline part. Gemini reads PDFs, images, and plain text natively (up to ~20MB). */
export function filePart(bytes: Buffer | Uint8Array, mimeType: string): Part {
  return { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } };
}

export function textPart(text: string): Part {
  return { text };
}

type GenArgs = Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cooling = new Map<string, number>(); // model -> timestamp until which it is skipped
const COOL_MS = 120_000;

/** How long a model should sit out after an error: a daily quota ("retry in 20h52m") for that long, anything else two minutes. */
function coolFor(e: unknown): number {
  const msg = `${(e as Error).message ?? ""}`;
  const m = msg.match(/retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
  if (m && /per ?day|PerDay|daily/i.test(msg)) {
    const ms = ((+(m[1] ?? 0) * 60 + +(m[2] ?? 0)) * 60 + +(m[3] ?? 0)) * 1000;
    if (ms > COOL_MS) return Math.min(ms, 24 * 3600_000);
  }
  return COOL_MS;
}

const isTransient = (e: unknown) => {
  const status = (e as { status?: number }).status ?? 0;
  return status === 429 || status === 503 || /high demand|UNAVAILABLE|RESOURCE_EXHAUSTED|quota|abort|timeout/i.test(`${(e as Error).name} ${(e as Error).message ?? ""}`);
};

/** generateContent with a model fallback chain, per-model circuit breakers and one second pass. Every call goes through here. */
export async function generate(args: GenArgs, tier: "fast" | "heavy" = "heavy") {
  const primary = tier === "fast" ? FAST_MODEL : HEAVY_MODEL;
  // Documents fall back to the bigger 3.5 first (reads PDFs well, ~2 s); chat falls back to it too
  // because it is still fast enough. One try per model per pass: the chain itself is the retry.
  const all = [...new Set([primary, "gemini-3.5-flash", ...FALLBACK_MODELS])];
  // A model that hangs under load is worse than a fallback: cap each attempt and move down the chain.
  const timeoutMs = tier === "fast" ? 15_000 : 20_000;
  let lastErr: unknown;
  for (let pass = 0; pass < 2; pass++) {
    // Circuit breaker: a model that just timed out or hit a limit sits out (two minutes, or the rest of
    // the day for a daily quota), so one failure costs one call, not every call after it.
    const now = Date.now();
    const ready = all.filter((m) => (cooling.get(m) ?? 0) < now);
    const models = ready.length ? ready : all;
    for (const model of models) {
      try {
        const res = await ai().models.generateContent({ ...args, config: { ...args.config, abortSignal: AbortSignal.timeout(timeoutMs) }, model });
        return Object.assign(res, { modelUsed: model });
      } catch (first) {
        let e = first;
        lastErr = e;
        // A model that rejects the requested thinking level: retry it once without the setting (same timeout).
        // What happens next depends on how that retry failed, not on the original 400.
        if (/thinking/i.test((e as Error).message ?? "") && args.config?.thinkingConfig) {
          const { thinkingConfig: _drop, ...rest } = args.config;
          void _drop;
          try {
            return Object.assign(await ai().models.generateContent({ ...args, config: { ...rest, abortSignal: AbortSignal.timeout(timeoutMs) }, model }), { modelUsed: model });
          } catch (e2) {
            e = e2;
            lastErr = e2;
          }
        }
        if (!isTransient(e)) throw e;
        const cool = coolFor(e);
        cooling.set(model, Date.now() + cool);
        console.warn(`[gemini] ${model} unavailable (${String((e as Error).message ?? e).slice(0, 80).replace(/\s+/g, " ")}), sitting out ${Math.round(cool / 60_000)} min`);
      }
    }
    if (pass === 0) await sleep(1500); // everything was busy at once: one more pass after a breath
  }
  throw lastErr;
}

/**
 * One fast call, no tools, no thinking: the whole context goes in the prompt and the model
 * answers from it alone. This is what the coach uses; ~1 s instead of 5 to 10.
 */
export async function answerFast(opts: { system: string; context: string; history: Content[]; message: string; maxTokens?: number }): Promise<string> {
  const contents: Content[] = [
    ...opts.history,
    { role: "user", parts: [{ text: `CONTEXT (the only facts you may use):\n${opts.context}\n\nSTUDENT: ${opts.message}` }] },
  ];
  const res = await generate(
    {
      contents,
      config: { systemInstruction: opts.system, temperature: 0.4, maxOutputTokens: opts.maxTokens ?? 400, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
    },
    "fast",
  );
  return res.text ?? "";
}

export type CallMeta = { model: string; usage: { input: number; output: number }; ms: number };

/** Structured output with telemetry: which model answered, tokens, and time. */
export async function generateJSONMeta<T>(opts: { parts: Part[]; schema: Schema; system?: string; temperature?: number; tier?: "fast" | "heavy" }): Promise<{ data: T; meta: CallMeta }> {
  const t0 = Date.now();
  const res = await generate(
    {
      contents: [{ role: "user", parts: opts.parts }],
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        responseSchema: opts.schema,
        temperature: opts.temperature ?? 0.2,
      },
    },
    opts.tier ?? "heavy",
  );
  const text = res.text ?? "";
  const u = res.usageMetadata;
  const meta: CallMeta = { model: (res as { modelUsed?: string }).modelUsed ?? MODEL, usage: { input: u?.promptTokenCount ?? 0, output: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0) }, ms: Date.now() - t0 };
  try {
    return { data: JSON.parse(text) as T, meta };
  } catch {
    throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
  }
}

/** Structured output: the model must return JSON matching `schema`. */
export async function generateJSON<T>(opts: { parts: Part[]; schema: Schema; system?: string; temperature?: number; tier?: "fast" | "heavy" }): Promise<T> {
  return (await generateJSONMeta<T>(opts)).data;
}

/** Plain text answer. */
export async function generateText(opts: { parts: Part[]; system?: string; temperature?: number }): Promise<string> {
  const res = await generate({
    contents: [{ role: "user", parts: opts.parts }],
    config: { systemInstruction: opts.system, temperature: opts.temperature ?? 0.4 },
  });
  return res.text ?? "";
}

/**
 * Function-calling loop. `tools` maps a name to its declaration and implementation.
 * Runs until the model stops calling tools (max `maxTurns`). Returns the final text
 * and every tool call made, so the UI can show "every number traced to a tool".
 */
export async function runWithTools(opts: {
  history: Content[];
  system: string;
  tools: Record<string, { decl: FunctionDeclaration; run: (args: Record<string, unknown>) => Promise<unknown> | unknown }>;
  maxTurns?: number;
}): Promise<{ text: string; calls: { name: string; args: unknown; result: unknown }[] }> {
  const contents: Content[] = [...opts.history];
  const calls: { name: string; args: unknown; result: unknown }[] = [];
  const declarations = Object.values(opts.tools).map((t) => t.decl);

  for (let turn = 0; turn < (opts.maxTurns ?? 6); turn++) {
    const res = await generate({
      contents,
      config: { systemInstruction: opts.system, tools: [{ functionDeclarations: declarations }], temperature: 0.3 },
    });
    const fcs = res.functionCalls ?? [];
    if (fcs.length === 0) return { text: res.text ?? "", calls };

    // echo the model turn, then answer each call
    const modelParts = res.candidates?.[0]?.content?.parts ?? fcs.map((fc) => ({ functionCall: fc }));
    contents.push({ role: "model", parts: modelParts });
    const responses: Part[] = [];
    for (const fc of fcs) {
      const name = fc.name ?? "";
      const tool = opts.tools[name];
      let result: unknown;
      try {
        result = tool ? await tool.run((fc.args ?? {}) as Record<string, unknown>) : { error: `unknown tool ${name}` };
      } catch (e) {
        result = { error: (e as Error).message };
      }
      calls.push({ name, args: fc.args, result });
      responses.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return { text: "I ran out of steps. Try a narrower question.", calls };
}
