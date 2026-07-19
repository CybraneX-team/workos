import { env } from '../config.js';

/**
 * Minimal Gemini (Google Generative Language) REST helper.
 * Mirrors the pattern already used in adapters/classify/llm.ts so the backend
 * has a single place to call Gemini for text / JSON generation instead of OpenAI.
 */

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

export interface GeminiOptions {
  /** System instruction (persona / rules). */
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask Gemini for application/json output. Cannot be combined with webSearch. */
  json?: boolean;
  /** Enable Google Search grounding (live web research). Returns text, not JSON. */
  webSearch?: boolean;
  /** Override the default model (env.GEMINI_MODEL). */
  model?: string;
}

export async function geminiText(prompt: string, opts: GeminiOptions = {}): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new Error('gemini_api_key_not_configured');

  const model = opts.model ?? env.GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const generationConfig: Record<string, unknown> = {};
  if (opts.temperature != null) generationConfig.temperature = opts.temperature;
  if (opts.maxOutputTokens != null) generationConfig.maxOutputTokens = opts.maxOutputTokens;
  if (opts.json) generationConfig.responseMimeType = 'application/json';

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
  if (opts.webSearch) body.tools = [{ google_search: {} }];

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => null)) as GeminiResponse | null;
  if (!response.ok) {
    throw new Error(`gemini_failed:${json?.error?.message ?? response.statusText}`);
  }
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
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
