import { geminiJson, toGeminiSchema } from '../../lib/gemini.js';
import { BROAD_ARCHETYPE_BY_GROUP, DEFAULT_ARCHETYPE, type TaskArchetypeKey } from './archetypes.js';
import { buildClassifierPrompt, CLASSIFIER_SYSTEM } from './prompts.js';
import { CLASSIFICATION_JSON_SCHEMA, ClassificationSchema, type PlaybookRequest } from './schemas.js';

/** Below this the classifier is guessing; the doc says to use a broad archetype rather than a narrow guess. */
export const CONFIDENCE_THRESHOLD = 0.55;

export interface ResolvedClassification {
  archetypes: Array<{ key: TaskArchetypeKey; weight: number }>;
  confidence: number;
  reasoning: string;
  /** True when we replaced the model's narrow pick with the group's broad archetype. */
  broadFallback: boolean;
}

/** Errors that retrying a template cannot fix: missing key, bad key, or exhausted quota. The caller should surface them. */
export function isGeminiUnavailable(error: unknown): boolean {
  return error instanceof Error && /^gemini_(api_key_not_configured|failed:(401|403|429))/.test(error.message);
}

export type JsonFn = (prompt: string, options: Record<string, unknown>) => Promise<unknown>;

const defaultJson: JsonFn = (prompt, options) => geminiJson(prompt, options);

export function resolveClassification(raw: unknown): ResolvedClassification | null {
  const parsed = ClassificationSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { archetypes, confidence, bestGroup, reasoning } = parsed.data;

  if (confidence < CONFIDENCE_THRESHOLD) {
    return { archetypes: [{ key: BROAD_ARCHETYPE_BY_GROUP[bestGroup], weight: 1 }], confidence, reasoning, broadFallback: true };
  }

  const seen = new Set<TaskArchetypeKey>();
  const unique = archetypes.filter((a) => (seen.has(a.key) ? false : (seen.add(a.key), true)));
  const total = unique.reduce((sum, a) => sum + a.weight, 0) || 1;
  const normalised = unique
    .map((a) => ({ key: a.key, weight: Math.round((a.weight / total) * 100) / 100 }))
    .sort((a, b) => b.weight - a.weight);
  return { archetypes: normalised, confidence, reasoning, broadFallback: false };
}

/**
 * Call 1: which archetype(s) is this work? Never throws on bad model output: a failed or invalid
 * classification degrades to the default broad archetype so generation can still proceed.
 * Availability errors (no key, auth, quota) do throw, so the route can answer 503.
 */
export async function classifyTask(req: PlaybookRequest, json: JsonFn = defaultJson): Promise<ResolvedClassification> {
  try {
    const raw = await json(buildClassifierPrompt(req), {
      system: CLASSIFIER_SYSTEM,
      responseSchema: toGeminiSchema(CLASSIFICATION_JSON_SCHEMA),
      temperature: 0,
      maxOutputTokens: 600,
      thinkingBudget: 0,
    });
    const resolved = resolveClassification(raw);
    if (resolved) return resolved;
  } catch (error) {
    if (isGeminiUnavailable(error)) throw error;
  }
  return { archetypes: [{ key: DEFAULT_ARCHETYPE, weight: 1 }], confidence: 0, reasoning: 'classification_failed', broadFallback: true };
}
