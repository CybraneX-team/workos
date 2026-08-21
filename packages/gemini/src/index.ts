export interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  usageMetadata?: { thoughtsTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

export interface GeminiOptions {
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  json?: boolean;
  responseSchema?: unknown;
  thinkingBudget?: number;
  webSearch?: boolean;
  model?: string;
}

export interface GeminiClientConfig {
  apiKey?: string;
  defaultModel: string;
  fetchImpl?: typeof fetch;
}

export interface GeminiClient {
  text(prompt: string, options?: GeminiOptions): Promise<string>;
  json(prompt: string, options?: GeminiOptions): Promise<unknown>;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const UNSUPPORTED_SCHEMA_KEYS = new Set([
  'additionalProperties', '$defs', '$schema',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'pattern', 'format',
  'minItems', 'maxItems', 'uniqueItems',
]);

/** Convert JSON Schema into the constrained schema subset Gemini accepts. */
export function toGeminiSchema(schema: unknown): unknown {
  const defs = (schema as Record<string, unknown>)?.$defs as Record<string, unknown> | undefined ?? {};
  const convert = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(convert);
    if (!node || typeof node !== 'object') return node;
    const input = node as Record<string, any>;
    if (typeof input.$ref === 'string') {
      const key = input.$ref.replace('#/$defs/', '');
      return convert(defs[key] ?? {});
    }
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
      if (key === 'type' && Array.isArray(value)) {
        const types = value.filter((type) => type !== 'null');
        output.type = types[0] ?? 'string';
        if (types.length !== value.length) output.nullable = true;
      } else {
        output[key] = convert(value);
      }
    }
    const hints: string[] = [];
    if (input.minimum != null || input.maximum != null) hints.push(`between ${input.minimum ?? '-inf'} and ${input.maximum ?? 'inf'} inclusive`);
    if (input.minItems != null || input.maxItems != null) {
      hints.push(input.minItems === input.maxItems
        ? `exactly ${input.minItems} items`
        : `between ${input.minItems ?? 0} and ${input.maxItems ?? 'any'} items`);
    }
    if (input.maxLength != null) hints.push(`at most ${input.maxLength} characters`);
    if (hints.length) output.description = [input.description, `Must be ${hints.join(', ')}.`].filter(Boolean).join(' ');
    return output;
  };
  return convert(schema);
}

export function parseJsonLoose(text: string): unknown {
  return JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim());
}

export function createGeminiClient(config: GeminiClientConfig): GeminiClient {
  const request = config.fetchImpl ?? fetch;

  async function text(prompt: string, options: GeminiOptions = {}): Promise<string> {
    if (!config.apiKey) throw new Error('gemini_api_key_not_configured');
    const model = options.model ?? config.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const generationConfig: Record<string, unknown> = {};
    if (options.temperature != null) generationConfig.temperature = options.temperature;
    if (options.maxOutputTokens != null) generationConfig.maxOutputTokens = options.maxOutputTokens;
    if (options.json || options.responseSchema) generationConfig.responseMimeType = 'application/json';
    if (options.responseSchema) generationConfig.responseSchema = options.responseSchema;
    if (options.thinkingBudget != null) generationConfig.thinkingConfig = { thinkingBudget: options.thinkingBudget };
    const body: Record<string, unknown> = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    if (options.system) body.systemInstruction = { parts: [{ text: options.system }] };
    if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
    if (options.webSearch) body.tools = [{ google_search: {} }];

    let payload: GeminiResponse | null = null;
    for (let attempt = 1; ; attempt += 1) {
      const response = await request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
        body: JSON.stringify(body),
      });
      payload = await response.json().catch(() => null) as GeminiResponse | null;
      if (response.ok) break;
      if (!RETRYABLE_STATUS.has(response.status) || attempt >= MAX_ATTEMPTS) {
        throw new Error(`gemini_failed:${response.status}:${payload?.error?.message ?? response.statusText}`);
      }
      await sleep(Math.min(16_000, 1_000 * 2 ** attempt));
    }

    const candidate = payload?.candidates?.[0];
    const output = (candidate?.content?.parts ?? []).filter((part) => !part.thought).map((part) => part.text ?? '').join('').trim();
    const finishReason = candidate?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      const wantsJson = Boolean(options.json || options.responseSchema);
      const truncated = finishReason === 'MAX_TOKENS';
      if (wantsJson || !truncated || !output) {
        throw new Error(`gemini_finish_${finishReason.toLowerCase()}:model=${model} maxOutputTokens=${options.maxOutputTokens ?? 'default'} thoughtsTokens=${payload?.usageMetadata?.thoughtsTokenCount ?? 0} outputChars=${output.length}`);
      }
    }
    if (!output) throw new Error('gemini_empty_output');
    return output;
  }

  async function json(prompt: string, options: GeminiOptions = {}): Promise<unknown> {
    const output = await text(prompt, { temperature: 0, ...options, json: true });
    try {
      return parseJsonLoose(output);
    } catch (error) {
      throw new Error(`gemini_invalid_json:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { text, json };
}
