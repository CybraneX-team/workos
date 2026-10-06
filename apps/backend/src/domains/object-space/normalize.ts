import { randomUUID } from 'node:crypto';
import { GeneratedPlaybookSchema, MAX_STEPS, MIN_STEPS, type GeneratedStep, type PlaybookRequest } from './schemas.js';

// Output shape identical to the frontend's TaskStep (object-space/types.ts).
export interface OutputStep {
  id: string;
  stepOrder: number;
  title: string;
  type: 'checklist' | 'script_viewer' | 'input_form' | 'connector_action';
  isCompleted: false;
  instructions?: string;
  checklistItems?: Array<{ id: string; label: string; checked: false; notes?: string }>;
  scriptContent?: string;
  objectionCheats?: Array<{ id: string; title: string; trigger: string; rebuttal: string }>;
  formFields?: Array<{ id: string; label: string; type: 'number' | 'text' | 'select' | 'counter'; value: string | number; options?: string[]; unit?: string; target?: number }>;
  connector?: { type: string; label: string; description?: string; payload?: Record<string, string> };
}

const shortId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;
const EMAIL = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const PHONE = /\+?\d[\d\s().-]{6,}\d/g;

type Known = ReturnType<typeof knownContacts>;

/** Contact details the person actually wrote into the task. Anything else the model emits is invented. */
export function knownContacts(req: PlaybookRequest) {
  const source = [req.title, req.goal, ...req.labels].join('\n');
  return {
    emails: new Set((source.match(EMAIL) ?? []).map((e) => e.toLowerCase())),
    urls: new Set(source.match(URL_RE) ?? []),
    phones: new Set((source.match(PHONE) ?? []).map((p) => p.replace(/[^\d+]/g, ''))),
  };
}

function cleanPayload(step: GeneratedStep, known: Known): Record<string, string> | undefined {
  const p = step.connector?.payload;
  if (!p) return undefined;
  const out: Record<string, string> = {};
  if (p.subject) out.subject = p.subject;
  if (p.body) out.body = p.body;
  if (p.eventTitle) out.eventTitle = p.eventTitle;
  if (p.recipient && known.emails.has(p.recipient.toLowerCase())) out.recipient = p.recipient;
  if (p.phoneNumber && known.phones.has(p.phoneNumber.replace(/[^\d+]/g, ''))) out.phoneNumber = p.phoneNumber;
  if (p.customUrl && known.urls.has(p.customUrl)) out.customUrl = p.customUrl;
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.eventDate)) out.eventDate = p.eventDate;
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(p.eventTime)) out.eventTime = p.eventTime;
  return Object.keys(out).length ? out : undefined;
}

function toOutputStep(step: GeneratedStep, known: Known): Omit<OutputStep, 'stepOrder'> | null {
  const base = {
    id: shortId('step'),
    title: step.title,
    type: step.type,
    isCompleted: false as const,
    ...(step.instructions ? { instructions: step.instructions } : {}),
  };
  switch (step.type) {
    case 'checklist': {
      const items = step.checklistItems.slice(0, 8);
      if (!items.length) return null;
      return {
        ...base,
        checklistItems: items.map((i) => ({ id: shortId('c'), label: i.label, checked: false as const, ...(i.notes ? { notes: i.notes } : {}) })),
      };
    }
    case 'script_viewer': {
      if (step.scriptContent.length < 20) return null;
      const cheats = step.objectionCheats.slice(0, 5).filter((c) => c.trigger && c.rebuttal);
      return {
        ...base,
        scriptContent: step.scriptContent,
        ...(cheats.length ? { objectionCheats: cheats.map((c) => ({ id: shortId('o'), title: c.title, trigger: c.trigger, rebuttal: c.rebuttal })) } : {}),
      };
    }
    case 'input_form': {
      const fields = step.formFields.slice(0, 6).flatMap((f) => {
        const options = f.options.filter(Boolean);
        if (f.type === 'select' && options.length < 2) return [];
        const numeric = f.type === 'number' || f.type === 'counter';
        return [{
          id: shortId('f'),
          label: f.label,
          type: f.type,
          value: numeric ? 0 : '',
          ...(f.type === 'select' ? { options } : {}),
          ...(f.unit ? { unit: f.unit } : {}),
          ...(numeric && f.target != null ? { target: f.target } : {}),
        }];
      });
      if (!fields.length) return null;
      return { ...base, formFields: fields };
    }
    case 'connector_action': {
      if (!step.connector) return null;
      const payload = cleanPayload(step, known);
      return {
        ...base,
        connector: {
          type: step.connector.type,
          label: step.connector.label,
          ...(step.connector.description ? { description: step.connector.description } : {}),
          ...(payload ? { payload } : {}),
        },
      };
    }
  }
}

/**
 * A message connector with no body should open pre-filled with the draft from the nearest earlier
 * script step, so the person never has to copy and paste between steps.
 */
function fillMessageBodies(steps: Omit<OutputStep, 'stepOrder'>[]): void {
  let lastScript: string | undefined;
  for (const step of steps) {
    if (step.type === 'script_viewer' && step.scriptContent) lastScript = step.scriptContent;
    const c = step.connector;
    if (step.type !== 'connector_action' || !c || !lastScript) continue;
    if (c.type !== 'gmail_sender' && c.type !== 'whatsapp_chat') continue;
    if (c.payload?.body) continue;
    const lines = lastScript.split('\n');
    const subjectLine = lines.find((l) => /^subject:\s*/i.test(l));
    const body = lines.filter((l) => l !== subjectLine).join('\n').trim();
    c.payload = {
      ...(c.payload ?? {}),
      body,
      ...(!c.payload?.subject && subjectLine && c.type === 'gmail_sender' ? { subject: subjectLine.replace(/^subject:\s*/i, '').trim() } : {}),
    };
  }
}

export class PlaybookValidationError extends Error {}

/**
 * Turns raw model output into trusted steps: validates shape, drops steps whose payload does not match
 * their type, removes invented contact details, assigns ids and order. Throws PlaybookValidationError
 * if fewer than MIN_STEPS usable steps remain so the caller can retry or fall back.
 */
export function normalizePlaybook(raw: unknown, req: PlaybookRequest): OutputStep[] {
  const parsed = GeneratedPlaybookSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new PlaybookValidationError(`invalid_shape:${issue?.path.join('.')}:${issue?.message}`);
  }
  const known = knownContacts(req);
  const steps = parsed.data.steps
    .map((s) => toOutputStep(s, known))
    .filter((s): s is Omit<OutputStep, 'stepOrder'> => s !== null)
    .slice(0, MAX_STEPS)
    .map((s, i) => ({ ...s, stepOrder: i + 1 }));
  fillMessageBodies(steps);
  if (steps.length < MIN_STEPS) throw new PlaybookValidationError(`too_few_usable_steps:${steps.length}`);
  return steps;
}
