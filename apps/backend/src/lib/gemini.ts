import { env } from '../config.js';

/**
 * Minimal Gemini (Google Generative Language) REST helper.
 * Mirrors the pattern already used in adapters/classify/llm.ts so the backend
 * has a single place to call Gemini for text / JSON generation instead of OpenAI.
 */

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  usageMetadata?: { thoughtsTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

export interface GeminiOptions {
  /** System instruction (persona / rules). */
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask Gemini for application/json output. Cannot be combined with webSearch. */
  json?: boolean;
  /**
   * Gemini-dialect response schema (see toGeminiSchema). Constrains decoding so the
   * model cannot emit structurally invalid JSON. Implies `json`.
   */
  responseSchema?: unknown;
  /**
   * Cap on thinking tokens. On 2.5 models these are drawn from the SAME
   * maxOutputTokens budget as the answer, so an uncapped thinker can starve the
   * output and truncate it mid-JSON. Keep > 0: 2.5 Pro rejects 0.
   */
  thinkingBudget?: number;
  /** Enable Google Search grounding (live web research). Returns text, not JSON. */
  webSearch?: boolean;
  /** Override the default model (env.GEMINI_MODEL). */
  model?: string;
}

/** Transient upstream states worth retrying — 503 in particular is common on 2.5-flash. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Value-range and string-format constraints are dropped when building Gemini's
 * `responseSchema`. Gemini compiles the schema into a decoding state machine and
 * rejects anything too large with:
 *   "The specified schema produces a constraint that has too many states for serving"
 * naming numeric min/max bounds and long/nested array limits as the usual causes.
 * These are only shape hints for the model — callers still validate the parsed
 * result (e.g. validateGeneratedTwin), which is what actually enforces them.
 */
const UNSUPPORTED_SCHEMA_KEYS = new Set([
  'additionalProperties', '$defs', '$schema',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'pattern', 'format',
  'minItems', 'maxItems', 'uniqueItems',
]);

/**
 * Convert a JSON Schema to the OpenAPI subset Gemini's `responseSchema` accepts:
 * inline `$ref`/`$defs`, drop unsupported/oversized keywords, and rewrite
 * `type: ['string','null']` as `nullable`. Anything else causes a 400.
 */
export function toGeminiSchema(schema: unknown): unknown {
  const defs = (schema as Record<string, any>)?.$defs ?? {};

  const convert = (node: any): any => {
    if (Array.isArray(node)) return node.map(convert);
    if (!node || typeof node !== 'object') return node;

    if (typeof node.$ref === 'string') {
      const key = node.$ref.replace('#/$defs/', '');
      return convert(defs[key] ?? {});
    }

    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(node)) {
      if (UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
      if (key === 'type' && Array.isArray(value)) {
        const types = value.filter((t) => t !== 'null');
        out.type = types[0] ?? 'string';
        if (types.length !== value.length) out.nullable = true;
        continue;
      }
      out[key] = convert(value);
    }

    // Carry the dropped bounds over as prose. `description` is supported and costs
    // no decoder states, but without it the model has to guess the range — a
    // `minimum: 0, maximum: 100` field silently came back on a 0-10 scale.
    const hints: string[] = [];
    if (node.minimum != null || node.maximum != null) {
      hints.push(`between ${node.minimum ?? '-inf'} and ${node.maximum ?? 'inf'} inclusive`);
    }
    if (node.minItems != null || node.maxItems != null) {
      hints.push(node.minItems === node.maxItems
        ? `exactly ${node.minItems} items`
        : `between ${node.minItems ?? 0} and ${node.maxItems ?? 'any'} items`);
    }
    if (node.maxLength != null) hints.push(`at most ${node.maxLength} characters`);
    if (hints.length > 0) {
      out.description = [node.description, `Must be ${hints.join(', ')}.`].filter(Boolean).join(' ');
    }

    return out;
  };

  return convert(schema);
}

export async function geminiText(prompt: string, opts: GeminiOptions = {}): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new Error('gemini_api_key_not_configured');

  const model = opts.model ?? env.GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const generationConfig: Record<string, unknown> = {};
  if (opts.temperature != null) generationConfig.temperature = opts.temperature;
  if (opts.maxOutputTokens != null) generationConfig.maxOutputTokens = opts.maxOutputTokens;
  if (opts.json || opts.responseSchema) generationConfig.responseMimeType = 'application/json';
  if (opts.responseSchema) generationConfig.responseSchema = opts.responseSchema;
  if (opts.thinkingBudget != null) generationConfig.thinkingConfig = { thinkingBudget: opts.thinkingBudget };

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
  if (opts.webSearch) body.tools = [{ google_search: {} }];

  let json: GeminiResponse | null = null;
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(body),
    });
    json = (await response.json().catch(() => null)) as GeminiResponse | null;
    if (response.ok) break;
    // 2.5-flash returns 503 "high demand" often enough that without this a burst of
    // overload exhausts the caller's whole job-level retry budget.
    if (!RETRYABLE_STATUS.has(response.status) || attempt >= MAX_ATTEMPTS) {
      throw new Error(`gemini_failed:${response.status}:${json?.error?.message ?? response.statusText}`);
    }
    await sleep(Math.min(16_000, 1_000 * 2 ** attempt));
  }

  const candidate = json?.candidates?.[0];
  // Drop thought parts: with includeThoughts they arrive alongside the answer and
  // would corrupt JSON if concatenated into it.
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  // Checked before the empty test: a truncated or blocked response is a distinct
  // failure from "model returned nothing", and reporting MAX_TOKENS as invalid JSON
  // sends you debugging the parser instead of the token budget.
  const finishReason = candidate?.finishReason;
  if (finishReason && finishReason !== 'STOP') {
    // Truncated *prose* is still usable (the web-research step returns a report, and
    // losing its tail beats failing the whole job). Truncated JSON never is.
    const wantsJson = Boolean(opts.json || opts.responseSchema);
    const truncated = finishReason === 'MAX_TOKENS';
    if (wantsJson || !truncated || !text) {
      const thoughts = json?.usageMetadata?.thoughtsTokenCount ?? 0;
      throw new Error(
        `gemini_finish_${finishReason.toLowerCase()}:model=${model} maxOutputTokens=${opts.maxOutputTokens ?? 'default'} thoughtsTokens=${thoughts} outputChars=${text.length}`,
      );
    }
    console.warn('[gemini] output truncated at maxOutputTokens; using partial text', {
      model, maxOutputTokens: opts.maxOutputTokens, outputChars: text.length,
    });
  }
  if (!text) throw new Error('gemini_empty_output');
  return text;
}

export function parseJsonLoose(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(trimmed);
}

/** Generate JSON with Gemini (responseMimeType application/json) and parse it. */
export async function geminiJson(prompt: string, opts: GeminiOptions = {}): Promise<unknown> {
  const text = await geminiText(prompt, { temperature: 0, ...opts, json: true });
  try {
    return parseJsonLoose(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`gemini_invalid_json:${message}`);
  }
}
