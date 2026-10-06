import { z } from 'zod';
import { TASK_ARCHETYPE_KEYS, ARCHETYPE_GROUPS } from './archetypes.js';

// Mirrors apps/frontend/src/pages/NewPMS/object-space/types.ts so generated steps drop straight into
// ImplementationTask.steps. Keep both in sync.
export const STEP_TYPES = ['checklist', 'script_viewer', 'input_form', 'connector_action'] as const;
export const CONNECTOR_TYPES = [
  'gmail_sender', 'whatsapp_chat', 'google_calendar', 'google_meet', 'custom_link', 'crm_dialer',
  'github_pr', 'figma', 'meta_ads', 'native_sales', 'docusign', 'web_cms', 'analytics',
] as const;
export const FORM_FIELD_TYPES = ['number', 'text', 'select', 'counter'] as const;

export const MIN_STEPS = 3;
export const MAX_STEPS = 8;

// ───────────── Request ─────────────

const text = (max: number) => z.string().trim().max(max);

export const PlaybookRequestSchema = z.object({
  /** The client's task id. Used only to correlate logs; the backend stores nothing keyed by it. */
  taskKey: text(120).min(1),
  title: text(300).min(1),
  goal: text(2000).optional().default(''),
  labels: z.array(text(60)).max(12).optional().default([]),
  objectType: text(60).optional(),
  /** Team task = more than one person contributes. Personal task = one person owns all the steps. */
  isTeamTask: z.boolean().optional().default(false),
  collaborators: z.array(z.object({ name: text(120), jobTitle: text(120).optional() })).max(10).optional().default([]),
  assignee: z.object({
    name: text(120).min(1),
    jobTitle: text(120).min(1),
    role: text(60).optional(),
  }),
  department: z.object({
    key: text(60).optional(),
    name: text(160).min(1),
    category: text(160).optional(),
  }),
  dueLabel: text(80).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  estimatedMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
});
export type PlaybookRequest = z.infer<typeof PlaybookRequestSchema>;

// ───────────── Classifier output ─────────────

export const ClassificationSchema = z.object({
  archetypes: z
    .array(z.object({ key: z.enum(TASK_ARCHETYPE_KEYS), weight: z.number().min(0).max(1) }))
    .min(1)
    .max(2),
  confidence: z.number().min(0).max(1),
  /** Only used when confidence is low, to choose the broad fallback archetype. */
  bestGroup: z.enum(ARCHETYPE_GROUPS),
  reasoning: z.string().max(400).optional().default(''),
});
export type Classification = z.infer<typeof ClassificationSchema>;

/** JSON Schema handed to Gemini (through toGeminiSchema). */
export const CLASSIFICATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    archetypes: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      description: 'The one or two archetypes that best describe the work, most important first.',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', enum: [...TASK_ARCHETYPE_KEYS] },
          weight: { type: 'number', description: 'Relative importance 0 to 1.' },
        },
        required: ['key', 'weight'],
      },
    },
    confidence: { type: 'number', description: 'How sure you are, 0 (guess) to 1 (certain).' },
    bestGroup: { type: 'string', enum: [...ARCHETYPE_GROUPS], description: 'The archetype group the work most belongs to, even if unsure of the exact archetype.' },
    reasoning: { type: 'string', description: 'One short sentence on why.' },
  },
  required: ['archetypes', 'confidence', 'bestGroup', 'reasoning'],
} as const;

// ───────────── Generator output ─────────────

// Lenient on purpose: the model returns optional keys as null/empty. normalize.ts repairs or drops bad
// pieces; zod here only guarantees the overall shape.
const nullableText = (max: number) => z.string().max(max).nullish().transform((v) => (v ?? '').trim());

export const GeneratedStepSchema = z.object({
  title: z.string().trim().min(1).max(140),
  type: z.enum(STEP_TYPES),
  instructions: nullableText(600),
  checklistItems: z.array(z.object({ label: z.string().trim().min(1).max(200), notes: nullableText(240) })).nullish().transform((v) => v ?? []),
  scriptContent: nullableText(3000),
  objectionCheats: z
    .array(z.object({ title: z.string().trim().min(1).max(80), trigger: nullableText(200), rebuttal: nullableText(500) }))
    .nullish()
    .transform((v) => v ?? []),
  formFields: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        type: z.enum(FORM_FIELD_TYPES),
        options: z.array(z.string().trim().max(80)).nullish().transform((v) => v ?? []),
        unit: nullableText(24),
        target: z.number().nullish().transform((v) => v ?? undefined),
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
  connector: z
    .object({
      type: z.enum(CONNECTOR_TYPES),
      label: z.string().trim().min(1).max(80),
      description: nullableText(240),
      payload: z
        .object({
          recipient: nullableText(200),
          phoneNumber: nullableText(40),
          subject: nullableText(200),
          body: nullableText(3000),
          eventTitle: nullableText(160),
          eventDate: nullableText(20),
          eventTime: nullableText(10),
          customUrl: nullableText(300),
        })
        .nullish()
        .transform((v) => v ?? undefined),
    })
    .nullish()
    .transform((v) => v ?? undefined),
});
export type GeneratedStep = z.infer<typeof GeneratedStepSchema>;

export const GeneratedPlaybookSchema = z.object({
  steps: z.array(GeneratedStepSchema).min(1).max(MAX_STEPS + 4),
});
export type GeneratedPlaybook = z.infer<typeof GeneratedPlaybookSchema>;

const str = (description: string) => ({ type: 'string', description });

/** JSON Schema handed to Gemini. Flat: each step fills only the fields its `type` needs. */
export const PLAYBOOK_JSON_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      minItems: MIN_STEPS,
      maxItems: MAX_STEPS,
      description: 'Ordered steps. Step 1 is the first thing the person does.',
      items: {
        type: 'object',
        properties: {
          title: str('Short imperative title, 3 to 8 words.'),
          type: { type: 'string', enum: [...STEP_TYPES] },
          instructions: str('One or two sentences telling the person what to do and what "done" looks like for this step.'),
          checklistItems: {
            type: 'array',
            description: 'ONLY for type=checklist: 3 to 6 concrete, verifiable actions.',
            items: { type: 'object', properties: { label: str('One action, starting with a verb.'), notes: str('Optional tip or detail.') }, required: ['label'] },
          },
          scriptContent: str('ONLY for type=script_viewer: the actual text to use (message draft, talk track or brief), ready to read or send. Use line breaks.'),
          objectionCheats: {
            type: 'array',
            description: 'ONLY for type=script_viewer when the person may face pushback: 2 to 4 likely objections with a response.',
            items: { type: 'object', properties: { title: str('Short objection label.'), trigger: str('What the other side says.'), rebuttal: str('How to respond.') }, required: ['title', 'trigger', 'rebuttal'] },
          },
          formFields: {
            type: 'array',
            description: 'ONLY for type=input_form: 2 to 5 fields to capture outcomes or numbers.',
            items: {
              type: 'object',
              properties: {
                label: str('Field label.'),
                type: { type: 'string', enum: [...FORM_FIELD_TYPES] },
                options: { type: 'array', items: { type: 'string' }, description: 'Only for type=select.' },
                unit: str('Optional unit such as "calls" or "USD".'),
                target: { type: 'number', description: 'Optional target value for number/counter fields.' },
              },
              required: ['label', 'type'],
            },
          },
          connector: {
            type: 'object',
            description: 'ONLY for type=connector_action: the tool this step opens, pre-filled for the task.',
            properties: {
              type: { type: 'string', enum: [...CONNECTOR_TYPES] },
              label: str('Button label, e.g. "Send intro email".'),
              description: str('What this action accomplishes.'),
              payload: {
                type: 'object',
                properties: {
                  recipient: str('Only if an email address is given in the task. Otherwise empty.'),
                  phoneNumber: str('Only if a phone number is given in the task. Otherwise empty.'),
                  subject: str('Email subject.'),
                  body: str('Full message or event description, ready to send.'),
                  eventTitle: str('Calendar event title.'),
                  eventDate: str('YYYY-MM-DD, only if a date is known.'),
                  eventTime: str('HH:MM 24h, only if a time is known.'),
                  customUrl: str('Only for custom_link, and only a URL given in the task.'),
                },
              },
            },
            required: ['type', 'label'],
          },
        },
        required: ['title', 'type', 'instructions'],
      },
    },
  },
  required: ['steps'],
} as const;

// ───────────── Response ─────────────

export interface PlaybookResponseMeta {
  model: string;
  promptVersion: string;
  archetypeVersion: string;
  /** True when the deterministic template was used instead of (or to repair) model output. */
  fallback: boolean;
  latencyMs: number;
}
