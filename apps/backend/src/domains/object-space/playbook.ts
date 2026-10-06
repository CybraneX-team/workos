import { geminiJson, toGeminiSchema } from '../../lib/gemini.js';
import { env } from '../../config.js';
import { TASK_ARCHETYPE_VERSION, type TaskArchetypeKey } from './archetypes.js';
import { classifyTask, isGeminiUnavailable, type JsonFn, type ResolvedClassification } from './classify.js';
import { fallbackPlaybook } from './fallback.js';
import { normalizePlaybook, type OutputStep } from './normalize.js';
import { buildGeneratorPrompt, GENERATOR_SYSTEM, PLAYBOOK_PROMPT_VERSION } from './prompts.js';
import { PLAYBOOK_JSON_SCHEMA, type PlaybookRequest, type PlaybookResponseMeta } from './schemas.js';

export interface PlaybookResult {
  archetypes: ResolvedClassification['archetypes'];
  confidence: number;
  steps: OutputStep[];
  meta: PlaybookResponseMeta & { fallbackReason?: string; broadClassification: boolean };
}

export interface PlaybookDeps {
  json?: JsonFn;
  model?: string;
}

const defaultJson: JsonFn = (prompt, options) => geminiJson(prompt, options);

async function generateSteps(req: PlaybookRequest, keys: TaskArchetypeKey[], json: JsonFn): Promise<OutputStep[]> {
  let retryNote: string | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await json(buildGeneratorPrompt(req, keys, retryNote), {
        system: GENERATOR_SYSTEM,
        responseSchema: toGeminiSchema(PLAYBOOK_JSON_SCHEMA),
        temperature: attempt === 0 ? 0.4 : 0.2,
        maxOutputTokens: 8000,
        thinkingBudget: 1024,
      });
      return normalizePlaybook(raw, req);
    } catch (error) {
      if (isGeminiUnavailable(error)) throw error;
      lastError = error;
      retryNote =
        'Your previous answer was unusable. Return 3 to 6 complete steps. Each step must fill the fields required by its type (checklist: checklistItems; script_viewer: full scriptContent; input_form: formFields; connector_action: connector).';
    }
  }
  throw lastError;
}

/**
 * Classify the work, then generate its playbook. Availability errors (no key, auth, quota) propagate so the caller can answer 503; every other
 * failure degrades to a deterministic archetype-based template flagged `fallback`.
 */
export async function buildPlaybook(req: PlaybookRequest, deps: PlaybookDeps = {}): Promise<PlaybookResult> {
  const started = Date.now();
  const json = deps.json ?? defaultJson;
  const classification = await classifyTask(req, json);
  const keys = classification.archetypes.map((a) => a.key);

  let steps: OutputStep[];
  let fallbackReason: string | undefined;
  try {
    steps = await generateSteps(req, keys, json);
  } catch (error) {
    if (isGeminiUnavailable(error)) throw error;
    fallbackReason = error instanceof Error ? error.message.slice(0, 160) : 'unknown';
    steps = fallbackPlaybook(req, keys);
  }

  return {
    archetypes: classification.archetypes,
    confidence: classification.confidence,
    steps,
    meta: {
      model: deps.model ?? env.GEMINI_MODEL,
      promptVersion: PLAYBOOK_PROMPT_VERSION,
      archetypeVersion: TASK_ARCHETYPE_VERSION,
      fallback: fallbackReason !== undefined,
      ...(fallbackReason ? { fallbackReason } : {}),
      broadClassification: classification.broadFallback,
      latencyMs: Date.now() - started,
    },
  };
}
