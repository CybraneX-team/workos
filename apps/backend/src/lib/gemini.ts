import {
  createGeminiClient,
  parseJsonLoose,
  toGeminiSchema,
  type GeminiOptions,
} from '@cybranex/gemini';
import { env } from '../config.js';

const client = createGeminiClient({ apiKey: env.GEMINI_API_KEY, defaultModel: env.GEMINI_MODEL });

export function geminiText(prompt: string, options: GeminiOptions = {}) {
  return client.text(prompt, options);
}

export function geminiJson(prompt: string, options: GeminiOptions = {}) {
  return client.json(prompt, options);
}

export { parseJsonLoose, toGeminiSchema };
export type { GeminiOptions };
