import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { env } from '../config.js';
import { authJwt } from '../middleware/authJwt.js';
import { requirePermission } from '../rbac.js';
import { recomputeCanonicalRollups } from '../lib/canonicalMetrics.js';
import { scoreMetric } from '@cybranex/metrics';
import { configureMetaMetric, isMetaMetricKey, setMetaConversionAction } from '../lib/metaMetricEngine.js';
import { buildMetaAdsBrief, getStoredMetaCanonicalContext } from '../domains/meta-ads/service.js';

export const metricsRouter = Router();
metricsRouter.use(authJwt);

const ADMIN_ROLES = new Set(['super_admin', 'founder', 'co_founder', 'admin']);
const TARGET_TYPES = ['company', 'department', 'bdt_node', 'goal'] as const;
const DIRECTIONS = ['higher_is_better', 'lower_is_better', 'target_band'] as const;
const VALUE_TYPES = ['number', 'currency', 'percent', 'duration', 'count', 'ratio'] as const;
const SOURCE_TYPES = ['manual', 'integration'] as const;
const RELATIONS = ['owns', 'measures', 'drives', 'health_component'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TargetType = typeof TARGET_TYPES[number];
type Direction = typeof DIRECTIONS[number];
type ValueType = typeof VALUE_TYPES[number];
type SourceType = typeof SOURCE_TYPES[number];
type Relation = typeof RELATIONS[number];
type DraftField =
  | 'name'
  | 'description'
  | 'unit'
  | 'value_type'
  | 'direction'
  | 'baseline_value'
  | 'current_value'
  | 'target_value'
  | 'cadence'
  | 'source_type'
  | 'owner_member_id'
  | 'target';

type MetricDraftPayload = {
  name: string | null;
  description: string | null;
  unit: string | null;
  value_type: ValueType | null;
  direction: Direction | null;
  baseline_value: number | null;
  current_value: number | null;
  target_value: number | null;
  cadence: string | null;
  source_type: SourceType | null;
  source_label: string | null;
  source_confidence: number | null;
  owner_member_id: string | null;
  target_type: TargetType | null;
  target_id: string | null;
  relation: Relation | null;
  is_core: boolean | null;
  weight: number | null;
  assumptions: string[];
  warnings: string[];
  confidence: number | null;
};

type DraftContextMember = {
  id: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: null;
};

type DraftContextDepartment = {
  id: string;
  label: string;
  domain: string | null;
};

type DraftContextGoal = {
  id: string;
  title: string;
  horizon: string | null;
};

type DraftContextNode = {
  id: string;
  label: string;
  department_id: string;
  department_label: string;
  node_type: string;
};

type DraftContext = {
  company: {
    id: string;
    name: string;
  };
  members: DraftContextMember[];
  departments: DraftContextDepartment[];
  goals: DraftContextGoal[];
  bdt_nodes: DraftContextNode[];
  entry_target: {
    target_type: TargetType;
    target_id: string;
  };
};

type MetricDraftResponseBody = {
  draft: Omit<CreateMetricResponseShape, 'owner_member_id'> & { owner_member_id?: string };
  assumptions: string[];
  warnings: string[];
  missing_fields: DraftField[];
  confidence: number;
  field_states: Array<{
    field: DraftField;
    status: 'inferred' | 'assumed' | 'unresolved';
    message: string;
  }>;
  resolved_target?: {
    target_type: TargetType;
    target_id: string;
    label: string;
    inferred: boolean;
  };
  resolved_owner?: {
    owner_member_id: string;
    label: string;
    inferred: boolean;
  };
};

type CreateMetricResponseShape = {
  name: string;
  description: string;
  unit: string;
  value_type: ValueType;
  direction: Direction;
  baseline_value: number;
  target_value: number;
  current_value: number;
  owner_member_id: string;
  cadence: string;
  source_type: SourceType;
  source_label?: string;
  source_confidence: number;
  links: Array<{
    target_type: TargetType;
    target_id: string;
    relation: Relation;
    weight: number;
    is_core: boolean;
  }>;
};

type DraftFieldState = MetricDraftResponseBody['field_states'][number];

type DraftLlmLink = {
  target_type: TargetType | null;
  target_id: string | null;
  relation: Relation | null;
  weight: number | null;
  is_core: boolean | null;
};

type DraftLlmOutput = {
  name: string | null;
  description: string | null;
  unit: string | null;
  value_type: ValueType | null;
  direction: Direction | null;
  baseline_value: number | null;
  current_value: number | null;
  target_value: number | null;
  cadence: string | null;
  source_type: SourceType | null;
  source_label: string | null;
  source_confidence: number | null;
  owner_member_id: string | null;
  links: DraftLlmLink[];
  assumptions: string[];
  warnings: string[];
  confidence: number | null;
};

function assertCompany(req: any, res: any, companyId: string): boolean {
  if (req.auth?.companyId !== companyId) {
    res.status(403).json({ error: 'forbidden' });
    return false;
  }
  return true;
}

function requireMetricAdmin(req: any, res: any): boolean {
  if (!ADMIN_ROLES.has(String(req.auth?.role ?? ''))) {
    res.status(403).json({ error: 'metric_admin_required' });
    return false;
  }
  return true;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

// Delegates to the canonical @cybranex/metrics normalization. This route needs a
// non-null score for the NOT-NULL write path; baseline === target (unscorable →
// null) preserves the historical behavior of returning 100.
function scoreFor(value: number, baseline: number, target: number, direction: Direction): number {
  return scoreMetric(value, baseline, target, direction) ?? 100;
}

async function validateTarget(client: any, companyId: string, targetType: TargetType, targetId: string) {
  if (targetType === 'company') {
    if (targetId !== companyId) throw new Error('invalid_company_target');
    const { rows } = await client.query(`SELECT 1 FROM public.companies WHERE id = $1`, [companyId]);
    if (!rows.length) throw new Error('target_not_found');
    return;
  }
  const table = targetType === 'department'
    ? 'departments'
    : targetType === 'bdt_node'
      ? 'department_bdt_nodes'
      : 'bdt_goals';
  const { rows } = await client.query(`SELECT 1 FROM public.${table} WHERE id = $1 AND company_id = $2`, [targetId, companyId]);
  if (!rows.length) throw new Error('target_not_found');
}

async function validateOwnerMember(client: any, companyId: string, ownerMemberId: string) {
  const { rows } = await client.query(
    `SELECT 1
       FROM public.company_members
      WHERE id = $1
        AND company_id = $2
        AND status = 'active'`,
    [ownerMemberId, companyId],
  );
  if (!rows.length) throw new Error('invalid_owner_member');
}

async function shapeMetric(client: any, metricId: string, companyId: string) {
  const { rows } = await client.query(
    `SELECT * FROM public.metrics WHERE id = $1 AND company_id = $2`,
    [metricId, companyId],
  );
  if (!rows.length) return null;
  const metric = rows[0];
  const [{ rows: links }, { rows: sources }, { rows: values }] = await Promise.all([
    client.query(`SELECT * FROM public.metric_links WHERE metric_id = $1 ORDER BY created_at ASC`, [metricId]),
    client.query(`SELECT * FROM public.metric_sources WHERE metric_id = $1 ORDER BY created_at ASC`, [metricId]),
    client.query(`SELECT * FROM public.metric_values WHERE metric_id = $1 ORDER BY created_at DESC LIMIT 20`, [metricId]),
  ]);
  return { ...metric, links, sources, values };
}

function getOutputText(responseBody: any): string {
  if (typeof responseBody?.output_text === 'string') return responseBody.output_text;
  const chunks: string[] = [];
  for (const output of responseBody?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
      if (typeof content?.output_text === 'string') chunks.push(content.output_text);
    }
  }
  return chunks.join('').trim();
}

function parseStructuredOutput(responseBody: any): unknown {
  for (const output of responseBody?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (content && typeof content === 'object' && 'json' in content && content.json != null) {
        return content.json;
      }
    }
  }
  const outputText = getOutputText(responseBody);
  if (!outputText) throw new Error('openai_empty_output');
  try {
    return JSON.parse(outputText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`openai_invalid_json:${message}`);
  }
}

async function callOpenAi(params: {
  instructions: string;
  prompt: string;
  schema: object;
  schemaName: string;
  maxTokens: number;
}): Promise<unknown> {
  if (!env.OPENAI_API_KEY) throw new Error('metric_copilot_unavailable');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_RESPONSES_MODEL,
      max_output_tokens: params.maxTokens,
      instructions: params.instructions,
      input: params.prompt,
      text: {
        format: {
          type: 'json_schema',
          name: params.schemaName,
          strict: true,
          schema: params.schema,
        },
      },
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const details = body?.error?.message ?? JSON.stringify(body)?.slice(0, 500) ?? response.statusText;
    throw new Error(`openai_responses_failed:${details}`);
  }
  return parseStructuredOutput(body);
}

const DRAFT_LLM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'description',
    'unit',
    'value_type',
    'direction',
    'baseline_value',
    'current_value',
    'target_value',
    'cadence',
    'source_type',
    'source_label',
    'source_confidence',
    'owner_member_id',
    'links',
    'assumptions',
    'warnings',
    'confidence',
  ],
  properties: {
    name: { type: ['string', 'null'] },
    description: { type: ['string', 'null'] },
    unit: { type: ['string', 'null'] },
    value_type: { type: ['string', 'null'], enum: [...VALUE_TYPES, null] },
    direction: { type: ['string', 'null'], enum: [...DIRECTIONS, null] },
    baseline_value: { type: ['number', 'null'] },
    current_value: { type: ['number', 'null'] },
    target_value: { type: ['number', 'null'] },
    cadence: { type: ['string', 'null'] },
    source_type: { type: ['string', 'null'], enum: [...SOURCE_TYPES, null] },
    source_label: { type: ['string', 'null'] },
    source_confidence: { type: ['number', 'null'] },
    owner_member_id: { type: ['string', 'null'] },
    links: {
      type: 'array',
      minItems: 0,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['target_type', 'target_id', 'relation', 'weight', 'is_core'],
        properties: {
          target_type: { type: ['string', 'null'], enum: [...TARGET_TYPES, null] },
          target_id: { type: ['string', 'null'] },
          relation: { type: ['string', 'null'], enum: [...RELATIONS, null] },
          weight: { type: ['number', 'null'] },
          is_core: { type: ['boolean', 'null'] },
        },
      },
    },
    assumptions: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    confidence: { type: ['number', 'null'] },
  },
} as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeConfidence(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

function normalizeUnit(raw: unknown, textContext: string): string | null {
  const value = String(raw ?? '').trim();
  if (value === '%') return '%';
  if (value === '$' || /^usd$/i.test(value) || /dollar/i.test(value)) return '$';
  if (/^(days?|day)$/i.test(value)) return 'days';
  if (/^(hours?|hrs?)$/i.test(value)) return 'hours';
  if (/^(minutes?|mins?)$/i.test(value)) return 'minutes';
  if (value) return value;

  if (/(retention|rate|conversion|activation|utilization|margin|uptime|churn|ctr|csat|nps|quality score)/i.test(textContext)) return '%';
  if (/(revenue|mrr|arr|cash|burn|cost|profit|pipeline|budget|treasury|spend)/i.test(textContext)) return '$';
  if (/(downtime|latency|cycle time|lead time|time to|duration)/i.test(textContext)) return 'days';
  return null;
}

function normalizeValueType(raw: unknown, unit: string | null, textContext: string): ValueType | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (VALUE_TYPES.includes(value as ValueType)) return value as ValueType;
  if (unit === '%') return 'percent';
  if (unit === '$') return 'currency';
  if (unit === 'days' || unit === 'hours' || unit === 'minutes') return 'duration';
  if (/(count|tickets|incidents|customers|users|releases|bugs)/i.test(textContext)) return 'count';
  if (unit) return 'number';
  return null;
}

function normalizeDirection(raw: unknown, textContext: string): Direction | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (DIRECTIONS.includes(value as Direction)) return value as Direction;
  if (/(churn|cost|burn|downtime|latency|bugs|time to|cycle time|lead time|error rate)/i.test(textContext)) return 'lower_is_better';
  if (/(target band|band|range|between|within)/i.test(textContext)) return 'target_band';
  if (textContext.trim()) return 'higher_is_better';
  return null;
}

function normalizeCadence(raw: unknown, textContext: string): string | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'annual'].includes(value)) {
    return value === 'annual' ? 'yearly' : value;
  }
  if (/\bdaily\b/.test(textContext)) return 'daily';
  if (/\bweekly\b/.test(textContext)) return 'weekly';
  if (/\bquarterly\b/.test(textContext)) return 'quarterly';
  if (/\bmonthly\b/.test(textContext) || /(mrr|arr|retention|revenue)/i.test(textContext)) return 'monthly';
  return null;
}

function normalizeRelation(raw: unknown, isCore: boolean): Relation {
  const value = String(raw ?? '').trim().toLowerCase();
  if (RELATIONS.includes(value as Relation)) return value as Relation;
  return isCore ? 'health_component' : 'measures';
}

function readNumericSignal(text: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function buildMemberLabel(member: DraftContextMember): string {
  const name = [member.first_name, member.last_name].filter(Boolean).join(' ').trim();
  return name || member.title?.trim() || member.role;
}

function targetLabel(targetType: TargetType, targetId: string, context: DraftContext): string {
  if (targetType === 'company') return context.company.name;
  if (targetType === 'department') return context.departments.find(d => d.id === targetId)?.label ?? targetId;
  if (targetType === 'goal') return context.goals.find(g => g.id === targetId)?.title ?? targetId;
  const node = context.bdt_nodes.find(n => n.id === targetId);
  return node ? `${node.department_label} / ${node.label}` : targetId;
}

function explicitScope(prompt: string): TargetType | null {
  if (/\bcompany\b|\bcompany-level\b/.test(prompt)) return 'company';
  if (/\bdepartment\b/.test(prompt)) return 'department';
  if (/\bgoal\b/.test(prompt)) return 'goal';
  if (/\bnode\b|\bund(er)?\b/.test(prompt)) return 'bdt_node';
  return null;
}

function resolveOwner(promptText: string, rawOwnerId: string | null, context: DraftContext) {
  if (rawOwnerId && context.members.some(member => member.id === rawOwnerId)) {
    const owner = context.members.find(member => member.id === rawOwnerId)!;
    return { owner_member_id: owner.id, label: buildMemberLabel(owner), inferred: false, warning: null, assumption: null };
  }

  const prompt = promptText.toLowerCase();
  const candidates = context.members.filter((member) => {
    const name = buildMemberLabel(member).toLowerCase();
    return (
      (member.role && prompt.includes(member.role.toLowerCase()))
      || (member.title && prompt.includes(member.title.toLowerCase()))
      || (name && prompt.includes(name))
      || (prompt.includes('founder') && /founder/.test(member.role))
      || (prompt.includes('admin') && /admin/.test(member.role))
    );
  });

  if (candidates.length === 1) {
    return {
      owner_member_id: candidates[0].id,
      label: buildMemberLabel(candidates[0]),
      inferred: true,
      warning: null,
      assumption: `Owner inferred as ${buildMemberLabel(candidates[0])}.`,
    };
  }
  if (candidates.length > 1) {
    return {
      owner_member_id: candidates[0].id,
      label: buildMemberLabel(candidates[0]),
      inferred: true,
      warning: `Multiple owner candidates matched; selected ${buildMemberLabel(candidates[0])}.`,
      assumption: null,
    };
  }
  return null;
}

function resolveTarget(promptText: string, rawLinks: DraftLlmLink[], context: DraftContext) {
  const validLink = rawLinks.find((link) =>
    link.target_type
    && link.target_id
    && (
      (link.target_type === 'company' && link.target_id === context.company.id)
      || (link.target_type === 'department' && context.departments.some(dept => dept.id === link.target_id))
      || (link.target_type === 'goal' && context.goals.some(goal => goal.id === link.target_id))
      || (link.target_type === 'bdt_node' && context.bdt_nodes.some(node => node.id === link.target_id))
    ),
  );
  if (validLink?.target_type && validLink.target_id) {
    return {
      target_type: validLink.target_type,
      target_id: validLink.target_id,
      inferred: false,
      warning: null as string | null,
      assumption: null as string | null,
    };
  }

  const prompt = promptText.toLowerCase();
  const scope = explicitScope(prompt);
  const departmentMatches = context.departments.filter(dept => prompt.includes(dept.label.toLowerCase()));
  const goalMatches = context.goals.filter(goal => prompt.includes(goal.title.toLowerCase()));
  const nodeMatches = context.bdt_nodes.filter((node) =>
    prompt.includes(node.label.toLowerCase())
    || prompt.includes(`${node.department_label.toLowerCase()} ${node.label.toLowerCase()}`),
  );

  if (nodeMatches.length === 1) {
    return {
      target_type: 'bdt_node' as const,
      target_id: nodeMatches[0].id,
      inferred: true,
      warning: context.entry_target.target_id !== nodeMatches[0].id ? `Prompt target overrides the UI entrypoint and will attach to ${nodeMatches[0].label}.` : null,
      assumption: `Target inferred as BDT node ${nodeMatches[0].label}.`,
    };
  }
  if (departmentMatches.length === 1) {
    return {
      target_type: 'department' as const,
      target_id: departmentMatches[0].id,
      inferred: true,
      warning: context.entry_target.target_id !== departmentMatches[0].id ? `Prompt target overrides the UI entrypoint and will attach to ${departmentMatches[0].label}.` : null,
      assumption: `Target inferred as department ${departmentMatches[0].label}.`,
    };
  }
  if (goalMatches.length === 1) {
    return {
      target_type: 'goal' as const,
      target_id: goalMatches[0].id,
      inferred: true,
      warning: context.entry_target.target_id !== goalMatches[0].id ? `Prompt target overrides the UI entrypoint and will attach to goal ${goalMatches[0].title}.` : null,
      assumption: `Target inferred as goal ${goalMatches[0].title}.`,
    };
  }
  if (scope === 'company') {
    return {
      target_type: 'company' as const,
      target_id: context.company.id,
      inferred: true,
      warning: context.entry_target.target_type !== 'company' ? 'Prompt requested a company-level metric, overriding the UI entrypoint target.' : null,
      assumption: 'Target inferred as the company.',
    };
  }
  if (scope && scope !== context.entry_target.target_type) {
    return {
      target_type: null,
      target_id: null,
      inferred: true,
      warning: `Prompt requested a ${scope.replace('_', ' ')} metric, but no valid backend entity could be resolved from the current company data.`,
      assumption: null,
    };
  }
  return {
    target_type: context.entry_target.target_type,
    target_id: context.entry_target.target_id,
    inferred: true,
    warning: null,
    assumption: `Using the UI entrypoint target ${targetLabel(context.entry_target.target_type, context.entry_target.target_id, context)}.`,
  };
}

async function buildDraftContext(client: any, companyId: string, entryTarget: { target_type: TargetType; target_id: string }): Promise<DraftContext> {
  const [{ rows: companyRows }, { rows: memberRows }, { rows: departmentRows }, { rows: goalRows }, { rows: nodeRows }] = await Promise.all([
    client.query(`SELECT id, name FROM public.companies WHERE id = $1 LIMIT 1`, [companyId]),
    client.query(
      `SELECT cm.id, cm.role, up.first_name, up.last_name, up.title
         FROM public.company_members cm
         LEFT JOIN public.user_profiles up ON up.id = cm.user_id
        WHERE cm.company_id = $1
          AND cm.status = 'active'
        ORDER BY cm.joined_at ASC`,
      [companyId],
    ),
    client.query(
      `SELECT id, label, domain
         FROM public.departments
        WHERE company_id = $1
        ORDER BY created_at ASC NULLS LAST, label ASC`,
      [companyId],
    ),
    client.query(
      `SELECT id, title, horizon
         FROM public.bdt_goals
        WHERE company_id = $1
        ORDER BY created_at ASC NULLS LAST, title ASC`,
      [companyId],
    ),
    client.query(
      `SELECT n.id, n.label, n.department_id, n.node_type, d.label AS department_label
         FROM public.department_bdt_nodes n
         JOIN public.departments d ON d.id = n.department_id
        WHERE n.company_id = $1
        ORDER BY d.label ASC, n.label ASC`,
      [companyId],
    ),
  ]);

  if (!companyRows.length) throw new Error('company_not_found');

  return {
    company: {
      id: companyRows[0].id,
      name: companyRows[0].name,
    },
    members: memberRows.map((row: Omit<DraftContextMember, 'email'>) => ({ ...row, email: null })),
    departments: departmentRows,
    goals: goalRows,
    bdt_nodes: nodeRows,
    entry_target: entryTarget,
  };
}

function validateDraftLlmOutput(raw: unknown): DraftLlmOutput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid_draft_payload');
  const data = raw as Record<string, unknown>;
  const linksRaw = Array.isArray(data.links) ? data.links : [];
  return {
    name: typeof data.name === 'string' ? data.name : null,
    description: typeof data.description === 'string' ? data.description : null,
    unit: typeof data.unit === 'string' ? data.unit : null,
    value_type: VALUE_TYPES.includes(data.value_type as ValueType) ? data.value_type as ValueType : null,
    direction: DIRECTIONS.includes(data.direction as Direction) ? data.direction as Direction : null,
    baseline_value: isFiniteNumber(data.baseline_value) ? data.baseline_value : null,
    current_value: isFiniteNumber(data.current_value) ? data.current_value : null,
    target_value: isFiniteNumber(data.target_value) ? data.target_value : null,
    cadence: typeof data.cadence === 'string' ? data.cadence : null,
    source_type: SOURCE_TYPES.includes(data.source_type as SourceType) ? data.source_type as SourceType : null,
    source_label: typeof data.source_label === 'string' ? data.source_label : null,
    source_confidence: isFiniteNumber(data.source_confidence) ? data.source_confidence : null,
    owner_member_id: typeof data.owner_member_id === 'string' ? data.owner_member_id : null,
    links: linksRaw.map((link): DraftLlmLink => {
      const item = typeof link === 'object' && link && !Array.isArray(link) ? link as Record<string, unknown> : {};
      return {
        target_type: TARGET_TYPES.includes(item.target_type as TargetType) ? item.target_type as TargetType : null,
        target_id: typeof item.target_id === 'string' ? item.target_id : null,
        relation: RELATIONS.includes(item.relation as Relation) ? item.relation as Relation : null,
        weight: isFiniteNumber(item.weight) ? item.weight : null,
        is_core: typeof item.is_core === 'boolean' ? item.is_core : null,
      };
    }),
    assumptions: Array.isArray(data.assumptions) ? data.assumptions.filter((item): item is string => typeof item === 'string') : [],
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((item): item is string => typeof item === 'string') : [],
    confidence: isFiniteNumber(data.confidence) ? data.confidence : null,
  };
}

async function generateMetricDraft(client: any, companyId: string, prompt: string, entryTarget: { target_type: TargetType; target_id: string }): Promise<MetricDraftResponseBody> {
  const context = await buildDraftContext(client, companyId, entryTarget);
  const instructions = [
    'You generate draft business metrics for a production metric system.',
    'Return JSON only and follow the schema exactly.',
    'Never persist anything. This is a draft proposal for an admin review flow.',
    'Choose exactly one primary metric target for v1 from company, department, goal, or bdt_node.',
    'Only use IDs present in the provided context. If you cannot resolve a required field safely, return null for that field and explain it in warnings.',
    'Do not copy the user prompt into both name and description. Infer a concise metric name and a useful description.',
    'Prefer realistic business defaults for unit, direction, cadence, and value type when the prompt strongly implies them.',
  ].join('\n');

  const promptBody = [
    `Company: ${context.company.name} (${context.company.id})`,
    `UI entrypoint target: ${entryTarget.target_type}:${entryTarget.target_id} (${targetLabel(entryTarget.target_type, entryTarget.target_id, context)})`,
    '',
    'Active members (owner candidates):',
    ...context.members.map(member => `- ${member.id} | ${buildMemberLabel(member)} | role=${member.role}${member.title ? ` | title=${member.title}` : ''}`),
    '',
    'Departments:',
    ...context.departments.map(dept => `- ${dept.id} | ${dept.label}${dept.domain ? ` | domain=${dept.domain}` : ''}`),
    '',
    'Goals:',
    ...context.goals.map(goal => `- ${goal.id} | ${goal.title}${goal.horizon ? ` | horizon=${goal.horizon}` : ''}`),
    '',
    'BDT nodes:',
    ...context.bdt_nodes.slice(0, 120).map(node => `- ${node.id} | ${node.department_label} / ${node.label} | type=${node.node_type}`),
    '',
    `User request: ${prompt}`,
  ].join('\n');

  const raw = await callOpenAi({
    instructions,
    prompt: promptBody,
    schema: DRAFT_LLM_SCHEMA,
    schemaName: 'metric_copilot_draft',
    maxTokens: env.OPENAI_RESPONSES_MAX_OUTPUT_TOKENS,
  });
  const llm = validateDraftLlmOutput(raw);
  const combinedText = [prompt, llm.name, llm.description, llm.source_label].filter(Boolean).join(' ').toLowerCase();
  const assumptions = [...llm.assumptions];
  const warnings = [...llm.warnings];
  const fieldStates: DraftFieldState[] = [];

  const ownerResolution = resolveOwner(combinedText, llm.owner_member_id, context);
  if (ownerResolution?.warning) warnings.push(ownerResolution.warning);
  if (ownerResolution?.assumption) assumptions.push(ownerResolution.assumption);

  const targetResolution = resolveTarget(combinedText, llm.links, context);
  if (targetResolution.warning) warnings.push(targetResolution.warning);
  if (targetResolution.assumption) assumptions.push(targetResolution.assumption);

  const unit = normalizeUnit(llm.unit, combinedText);
  const valueType = normalizeValueType(llm.value_type, unit, combinedText);
  const direction = normalizeDirection(llm.direction, combinedText);
  const cadence = normalizeCadence(llm.cadence, combinedText);
  const sourceType: SourceType = 'manual';
  const baselineValue = llm.baseline_value ?? readNumericSignal(prompt, 'baseline');
  const currentValue = llm.current_value ?? readNumericSignal(prompt, 'current');
  const targetValue = llm.target_value ?? readNumericSignal(prompt, 'target');
  const isCore = llm.links[0]?.is_core ?? /\bcore\b|\bhealth\b/.test(combinedText);
  const weight = isFiniteNumber(llm.links[0]?.weight) ? Math.max(0.1, Number(llm.links[0]?.weight)) : (isCore ? 1 : 1);
  const relation = normalizeRelation(llm.links[0]?.relation, isCore);
  const sourceConfidence = normalizeConfidence(llm.source_confidence, sourceType === 'manual' ? 0.7 : 0.6);
  const confidence = normalizeConfidence(llm.confidence, 0.65);

  const draft: MetricDraftResponseBody['draft'] = {
    name: llm.name?.trim() || '',
    description: llm.description?.trim() || '',
    unit: unit ?? '',
    value_type: valueType ?? 'number',
    direction: direction ?? 'higher_is_better',
    baseline_value: baselineValue ?? 0,
    current_value: currentValue ?? baselineValue ?? 0,
    target_value: targetValue ?? 0,
    owner_member_id: ownerResolution?.owner_member_id,
    cadence: cadence ?? '',
    source_type: sourceType,
    source_label: llm.source_label?.trim() || (sourceType === 'manual' ? 'Manual entry' : sourceType),
    source_confidence: sourceConfidence,
    links: targetResolution.target_type && targetResolution.target_id
      ? [{
          target_type: targetResolution.target_type,
          target_id: targetResolution.target_id,
          relation,
          weight,
          is_core: isCore,
        }]
      : [],
  };

  const missingFields: DraftField[] = [];
  const noteField = (field: DraftField, status: DraftFieldState['status'], message: string) => {
    fieldStates.push({ field, status, message });
    if (status === 'unresolved') missingFields.push(field);
  };

  noteField('name', draft.name ? (llm.name ? 'inferred' : 'assumed') : 'unresolved', draft.name ? 'Draft metric name prepared.' : 'Metric name still needs to be defined.');
  noteField('description', draft.description ? (llm.description ? 'inferred' : 'assumed') : 'unresolved', draft.description ? 'Description drafted from the prompt and company context.' : 'Description still needs to be written.');
  noteField('unit', unit ? (llm.unit ? 'inferred' : 'assumed') : 'unresolved', unit ? `Unit resolved as ${unit}.` : 'Unit could not be resolved safely.');
  noteField('value_type', valueType ? (llm.value_type ? 'inferred' : 'assumed') : 'unresolved', valueType ? `Value type resolved as ${valueType}.` : 'Value type could not be resolved safely.');
  noteField('direction', direction ? (llm.direction ? 'inferred' : 'assumed') : 'unresolved', direction ? `Direction resolved as ${direction}.` : 'Direction could not be resolved safely.');
  noteField('baseline_value', baselineValue != null ? (llm.baseline_value != null ? 'inferred' : 'assumed') : 'unresolved', baselineValue != null ? `Baseline resolved as ${baselineValue}.` : 'Baseline is still required.');
  noteField('current_value', currentValue != null ? (llm.current_value != null ? 'inferred' : 'assumed') : 'unresolved', currentValue != null ? `Current value resolved as ${currentValue}.` : 'Current value is still unresolved.');
  noteField('target_value', targetValue != null ? (llm.target_value != null ? 'inferred' : 'assumed') : 'unresolved', targetValue != null ? `Target resolved as ${targetValue}.` : 'Target is still required.');
  noteField('cadence', cadence ? (llm.cadence ? 'inferred' : 'assumed') : 'unresolved', cadence ? `Cadence resolved as ${cadence}.` : 'Cadence could not be resolved safely.');
  noteField('source_type', sourceType ? (llm.source_type ? 'inferred' : 'assumed') : 'unresolved', sourceType ? `Source type resolved as ${sourceType}.` : 'Source type is required.');
  noteField('owner_member_id', ownerResolution ? (ownerResolution.inferred ? 'assumed' : 'inferred') : 'unresolved', ownerResolution ? `Owner resolved as ${ownerResolution.label}.` : 'Owner could not be matched to an active company member.');
  noteField('target', draft.links.length ? (targetResolution.inferred ? 'assumed' : 'inferred') : 'unresolved', draft.links.length ? `Metric will attach to ${targetLabel(draft.links[0].target_type, draft.links[0].target_id, context)}.` : 'No valid backend metric target could be resolved.');

  return {
    draft,
    assumptions: Array.from(new Set(assumptions)),
    warnings: Array.from(new Set(warnings)),
    missing_fields: Array.from(new Set(missingFields)),
    confidence,
    field_states: fieldStates,
    resolved_target: draft.links.length ? {
      target_type: draft.links[0].target_type,
      target_id: draft.links[0].target_id,
      label: targetLabel(draft.links[0].target_type, draft.links[0].target_id, context),
      inferred: targetResolution.inferred,
    } : undefined,
    resolved_owner: ownerResolution ? {
      owner_member_id: ownerResolution.owner_member_id,
      label: ownerResolution.label,
      inferred: ownerResolution.inferred,
    } : undefined,
  };
}

const linkSchema = z.object({
  target_type: z.enum(TARGET_TYPES),
  target_id: z.string().uuid(),
  relation: z.enum(RELATIONS).default('measures'),
  weight: z.coerce.number().positive().default(1),
  is_core: z.boolean().default(false),
});

const metricInputSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().default(''),
  unit: z.string().trim().min(1),
  value_type: z.enum(VALUE_TYPES).default('number'),
  direction: z.enum(DIRECTIONS),
  baseline_value: z.coerce.number(),
  target_value: z.coerce.number(),
  current_value: z.coerce.number().optional(),
  owner_member_id: z.string().uuid(),
  cadence: z.string().trim().min(1).default('weekly'),
  source_type: z.literal('manual').default('manual'),
  source_label: z.string().trim().optional(),
  source_confidence: z.coerce.number().min(0).max(1).default(0.7),
  links: z.array(linkSchema).min(1),
});

metricsRouter.get('/:companyId', requirePermission('twin', 'read'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  const companyId = req.params.companyId;
  const { target_type, target_id, is_core, status, source_type, search } = req.query;
  if (target_type && !TARGET_TYPES.includes(String(target_type) as TargetType)) {
    return res.status(400).json({ error: 'invalid_target_type' });
  }
  if (target_id && !isUuid(String(target_id))) {
    return res.json([]);
  }
  if (source_type && !SOURCE_TYPES.includes(String(source_type) as typeof SOURCE_TYPES[number])) {
    return res.status(400).json({ error: 'invalid_source_type' });
  }
  const params: any[] = [companyId];
  const where = [`m.company_id = $1`];
  if (status) where.push(`m.status = $${params.push(status)}`);
  if (search) where.push(`m.name ILIKE $${params.push(`%${search}%`)}`);
  if (target_type) where.push(`EXISTS (SELECT 1 FROM public.metric_links fl WHERE fl.metric_id = m.id AND fl.target_type = $${params.push(target_type)}${target_id ? ` AND fl.target_id = $${params.push(target_id)}::uuid` : ''}${is_core !== undefined ? ` AND fl.is_core = $${params.push(String(is_core) === 'true')}` : ''})`);
  if (source_type) where.push(`EXISTS (SELECT 1 FROM public.metric_sources fs WHERE fs.metric_id = m.id AND fs.source_type = $${params.push(source_type)})`);
  try {
    const { rows } = await pool.query(
      `SELECT m.*,
              COALESCE(jsonb_agg(DISTINCT to_jsonb(ml)) FILTER (WHERE ml.id IS NOT NULL), '[]'::jsonb) AS links,
              COALESCE(jsonb_agg(DISTINCT to_jsonb(ms)) FILTER (WHERE ms.id IS NOT NULL), '[]'::jsonb) AS sources
         FROM public.metrics m
         LEFT JOIN public.metric_links ml ON ml.metric_id = m.id
         LEFT JOIN public.metric_sources ms ON ms.metric_id = m.id
        WHERE ${where.join(' AND ')}
        GROUP BY m.id
        ORDER BY m.created_at DESC`,
      params,
    );
    return res.json(rows);
  } catch (err) {
    console.error('[metrics] list failed', err);
    return res.status(500).json({ error: 'list_metrics_failed' });
  }
});

metricsRouter.get('/:companyId/rollups', requirePermission('twin', 'read'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  const { rows } = await pool.query(
    `SELECT * FROM public.metric_rollups WHERE company_id = $1 ORDER BY target_type, calculated_at DESC`,
    [req.params.companyId],
  );
  return res.json(rows);
});

const metaConfigSchema = z.object({
  target: z.coerce.number(),
  ownerMemberId: z.string().uuid(),
  weight: z.coerce.number().positive().default(1),
  goalLinks: z.array(z.object({ goalId: z.string().uuid(), weight: z.coerce.number().positive() })).default([]),
});

metricsRouter.put('/:companyId/integrations/meta/conversion-event', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId) || !requireMetricAdmin(req, res)) return;
  try {
    await setMetaConversionAction(req.params.companyId, String(req.body?.actionType ?? ''));
    return res.json(await buildMetaAdsBrief(req.params.companyId));
  } catch (error: any) {
    return res.status(400).json({ error: error?.message ?? 'meta_conversion_event_failed' });
  }
});

metricsRouter.put('/:companyId/integrations/meta/:metricKey', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId) || !requireMetricAdmin(req, res)) return;
  if (!isMetaMetricKey(req.params.metricKey)) return res.status(400).json({ error: 'invalid_meta_metric_key' });
  const parsed = metaConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_meta_metric_config', details: parsed.error.flatten() });
  try {
    const stored = await getStoredMetaCanonicalContext(req.params.companyId);
    return res.json(await configureMetaMetric(req.params.companyId, req.auth.userId, req.params.metricKey, parsed.data, stored));
  } catch (error: any) {
    return res.status(400).json({ error: error?.message ?? 'meta_metric_config_failed' });
  }
});

metricsRouter.get('/:companyId/goals', requirePermission('twin', 'read'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  const { rows } = await pool.query(
    `SELECT g.*, r.health_score AS progress,
            COALESCE(jsonb_agg(to_jsonb(ml) || jsonb_build_object('metric_name',m.name,'value',m.current_value,'target',m.target_value,'baseline',m.baseline_value,'unit',m.unit)) FILTER (WHERE ml.id IS NOT NULL), '[]') AS links
       FROM public.bdt_goals g
       LEFT JOIN public.metric_rollups r ON r.company_id=g.company_id AND r.target_type='goal' AND r.target_id=g.id
       LEFT JOIN public.metric_links ml ON ml.company_id=g.company_id AND ml.target_type='goal' AND ml.target_id=g.id
       LEFT JOIN public.metrics m ON m.id=ml.metric_id
      WHERE g.company_id=$1 GROUP BY g.id,r.health_score ORDER BY g.created_at`,
    [req.params.companyId],
  );
  return res.json(rows);
});

metricsRouter.post('/:companyId/goals', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  const title = String(req.body?.title ?? '').trim();
  if (!title) return res.status(400).json({ error: 'goal_title_required' });
  const { rows } = await pool.query(
    `INSERT INTO public.bdt_goals(company_id,title,horizon,owner_id,created_by,local_id)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.companyId, title, req.body?.horizon ?? 'quarterly', req.body?.owner_id ?? null, req.auth.userId, req.body?.local_id ?? null],
  );
  return res.status(201).json(rows[0]);
});

metricsRouter.patch('/:companyId/goals/:goalId', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  const { rows } = await pool.query(
    `UPDATE public.bdt_goals SET title=COALESCE($3,title),horizon=COALESCE($4,horizon),owner_id=COALESCE($5,owner_id),updated_at=NOW()
      WHERE id=$1 AND company_id=$2 RETURNING *`,
    [req.params.goalId, req.params.companyId, req.body?.title ?? null, req.body?.horizon ?? null, req.body?.owner_id ?? null],
  );
  return rows.length ? res.json(rows[0]) : res.status(404).json({ error: 'goal_not_found' });
});

metricsRouter.delete('/:companyId/goals/:goalId', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  await pool.query(`DELETE FROM public.bdt_goals WHERE id=$1 AND company_id=$2`, [req.params.goalId, req.params.companyId]);
  const client = await pool.connect();
  try { await recomputeCanonicalRollups(client, req.params.companyId); } finally { client.release(); }
  return res.json({ ok: true });
});

metricsRouter.post('/:companyId/goals/:goalId/links', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO public.metric_links(metric_id,company_id,target_type,target_id,relation,weight,is_core,created_by)
       SELECT m.id,$2,'goal',g.id,'drives',$4,true,$5
         FROM public.bdt_goals g JOIN public.metrics m ON m.id=$1 AND m.company_id=$2
        WHERE g.id=$3 AND g.company_id=$2
       ON CONFLICT(metric_id,target_type,target_id,relation) DO UPDATE SET weight=EXCLUDED.weight,is_core=true RETURNING *`,
      [req.body?.metric_id, req.params.companyId, req.params.goalId, Number(req.body?.contribution_weight ?? 1), req.auth.userId],
    );
    if (!rows.length) throw new Error('goal_not_found');
    await recomputeCanonicalRollups(client, req.params.companyId);
    await client.query('COMMIT');
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    return res.status(400).json({ error: error?.message ?? 'goal_link_failed' });
  } finally { client.release(); }
});

metricsRouter.delete('/:companyId/goals/:goalId/links/:metricId', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  await pool.query(`DELETE FROM public.metric_links WHERE company_id=$1 AND target_type='goal' AND target_id=$2 AND metric_id=$3`, [req.params.companyId, req.params.goalId, req.params.metricId]);
  const client = await pool.connect();
  try { await recomputeCanonicalRollups(client, req.params.companyId); } finally { client.release(); }
  return res.json({ ok: true });
});

metricsRouter.get('/:companyId/strategic-score', requirePermission('twin', 'read'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  const { rows } = await pool.query(`SELECT strategic_score FROM public.companies WHERE id=$1`, [req.params.companyId]);
  return res.json({ strategic_score: rows[0]?.strategic_score ?? null });
});

metricsRouter.get('/:companyId/:metricId', requirePermission('twin', 'read'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  const shaped = await shapeMetric(pool, req.params.metricId, req.params.companyId);
  if (!shaped) return res.status(404).json({ error: 'metric_not_found' });
  return res.json(shaped);
});

metricsRouter.post('/:companyId/draft', requirePermission('twin', 'read'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  const prompt = String(req.body?.prompt ?? '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt_required' });
  const targetType = TARGET_TYPES.includes(req.body?.target_type) ? req.body.target_type : 'company';
  const targetId = String(req.body?.target_id ?? req.params.companyId);
  const client = await pool.connect();
  try {
    const draft = await generateMetricDraft(client, req.params.companyId, prompt, {
      target_type: targetType,
      target_id: targetId,
    });
    return res.json(draft);
  } catch (err: any) {
    console.error('[metrics] draft failed', err);
    const message = String(err?.message ?? '');
    if (message === 'metric_copilot_unavailable') {
      return res.status(503).json({ error: 'metric_copilot_unavailable' });
    }
    if (message.startsWith('openai_')) {
      return res.status(502).json({ error: 'metric_copilot_failed', details: message });
    }
    if (message === 'company_not_found') {
      return res.status(404).json({ error: 'company_not_found' });
    }
    return res.status(500).json({ error: 'metric_draft_failed' });
  } finally {
    client.release();
  }
});

metricsRouter.post('/:companyId', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  if (!requireMetricAdmin(req, res)) return;
  const companyId = req.params.companyId;
  const parsed = metricInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_metric_input', details: parsed.error.flatten() });
  const input = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await validateOwnerMember(client, companyId, input.owner_member_id);
    for (const link of input.links) {
      await validateTarget(client, companyId, link.target_type, link.target_id);
    }
    const value = Number(input.current_value ?? input.baseline_value);
    const score = scoreFor(value, input.baseline_value, input.target_value, input.direction);
    const { rows } = await client.query(
      `INSERT INTO public.metrics
         (company_id, name, description, unit, value_type, direction,
          baseline_value, target_value, current_value, normalized_score,
          owner_member_id, cadence, status, source_confidence, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',$13,$14,$14)
       RETURNING *`,
      [companyId, input.name, input.description, input.unit, input.value_type, input.direction,
       input.baseline_value, input.target_value, value, score, input.owner_member_id,
       input.cadence, input.source_confidence, req.auth.userId],
    );
    const metric = rows[0];
    await client.query(
      `INSERT INTO public.metric_sources
         (metric_id, company_id, source_type, label, confidence, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [metric.id, companyId, input.source_type, input.source_label ?? input.source_type, input.source_confidence, req.auth.userId],
    );
    await client.query(
      `INSERT INTO public.metric_values
         (metric_id, company_id, raw_value, normalized_score, source_type, source_confidence, reason, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [metric.id, companyId, value, score, input.source_type, input.source_confidence, 'Initial metric value', req.auth.userId],
    );
    for (const link of input.links) {
      await client.query(
        `INSERT INTO public.metric_links
           (metric_id, company_id, target_type, target_id, relation, weight, is_core, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [metric.id, companyId, link.target_type, link.target_id, link.relation, link.weight, link.is_core, req.auth.userId],
      );
    }
    await recomputeCanonicalRollups(client, companyId);
    await client.query('COMMIT');
    return res.status(201).json(await shapeMetric(pool, metric.id, companyId));
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[metrics] create failed', err);
    return res.status(400).json({ error: err.message ?? 'create_metric_failed' });
  } finally {
    client.release();
  }
});

metricsRouter.patch('/:companyId/:metricId', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  if (!requireMetricAdmin(req, res)) return;
  const allowed = ['name', 'description', 'unit', 'value_type', 'direction', 'baseline_value', 'target_value', 'owner_member_id', 'cadence', 'status', 'source_confidence'];
  const patch = Object.fromEntries(Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'empty_metric_patch' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query(
      `SELECT * FROM public.metrics WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [req.params.metricId, req.params.companyId],
    );
    if (!existing.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'metric_not_found' });
    }
    if (typeof patch.owner_member_id === 'string') {
      await validateOwnerMember(client, req.params.companyId, patch.owner_member_id);
    }
    const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 3}`);
    await client.query(
      `UPDATE public.metrics SET ${sets.join(', ')}, updated_by = $${Object.keys(patch).length + 3}, updated_at = NOW()
        WHERE id = $1 AND company_id = $2`,
      [req.params.metricId, req.params.companyId, ...Object.values(patch), req.auth.userId],
    );
    const next = { ...existing[0], ...patch };
    const nextScore = scoreFor(
      Number(next.current_value),
      Number(next.baseline_value),
      Number(next.target_value),
      next.direction,
    );
    await client.query(
      `UPDATE public.metrics SET normalized_score = $3 WHERE id = $1 AND company_id = $2`,
      [req.params.metricId, req.params.companyId, nextScore],
    );
    await recomputeCanonicalRollups(client, req.params.companyId);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[metrics] patch failed', err);
    return res.status(500).json({ error: 'patch_metric_failed' });
  } finally {
    client.release();
  }
  return res.json(await shapeMetric(pool, req.params.metricId, req.params.companyId));
});

metricsRouter.post('/:companyId/:metricId/values', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  if (!requireMetricAdmin(req, res)) return;
  const value = Number(req.body?.raw_value);
  if (!Number.isFinite(value)) return res.status(400).json({ error: 'raw_value_required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM public.metrics WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [req.params.metricId, req.params.companyId],
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'metric_not_found' });
    }
    const metric = rows[0];
    const { rowCount: integrationSourceCount } = await client.query(
      `SELECT 1 FROM public.metric_sources WHERE metric_id=$1 AND company_id=$2 AND source_type='integration'`,
      [req.params.metricId, req.params.companyId],
    );
    if (integrationSourceCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'integration_metrics_are_sync_only' });
    }
    const score = scoreFor(value, Number(metric.baseline_value), Number(metric.target_value), metric.direction);
    await client.query(
      `INSERT INTO public.metric_values
         (metric_id, company_id, raw_value, normalized_score, period_start, period_end,
          source_type, source_confidence, reason, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [req.params.metricId, req.params.companyId, value, score, req.body?.period_start ?? null, req.body?.period_end ?? null,
       'manual', req.body?.source_confidence ?? metric.source_confidence, req.body?.reason ?? null, req.auth.userId],
    );
    await client.query(
      `UPDATE public.metrics
          SET current_value = $1, normalized_score = $2, updated_by = $3, updated_at = NOW()
        WHERE id = $4 AND company_id = $5`,
      [value, score, req.auth.userId, req.params.metricId, req.params.companyId],
    );
    await recomputeCanonicalRollups(client, req.params.companyId);
    await client.query('COMMIT');
    return res.json(await shapeMetric(pool, req.params.metricId, req.params.companyId));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[metrics] value update failed', err);
    return res.status(500).json({ error: 'metric_value_update_failed' });
  } finally {
    client.release();
  }
});

metricsRouter.post('/:companyId/:metricId/links', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  if (!requireMetricAdmin(req, res)) return;
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_metric_link', details: parsed.error.flatten() });
  const link = parsed.data;
  const client = await pool.connect();
  try {
    await validateTarget(client, req.params.companyId, link.target_type, link.target_id);
    const { rows } = await client.query(
      `INSERT INTO public.metric_links
         (metric_id, company_id, target_type, target_id, relation, weight, is_core, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (metric_id, target_type, target_id, relation)
       DO UPDATE SET weight = EXCLUDED.weight, is_core = EXCLUDED.is_core
       RETURNING *`,
      [req.params.metricId, req.params.companyId, link.target_type, link.target_id, link.relation, link.weight, link.is_core, req.auth.userId],
    );
    await recomputeCanonicalRollups(client, req.params.companyId);
    return res.status(201).json(rows[0]);
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'create_link_failed' });
  } finally {
    client.release();
  }
});

metricsRouter.delete('/:companyId/:metricId/links/:linkId', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  if (!requireMetricAdmin(req, res)) return;
  await pool.query(`DELETE FROM public.metric_links WHERE id = $1 AND metric_id = $2 AND company_id = $3`, [
    req.params.linkId,
    req.params.metricId,
    req.params.companyId,
  ]);
  const client = await pool.connect();
  try {
    await recomputeCanonicalRollups(client, req.params.companyId);
  } finally {
    client.release();
  }
  return res.json({ ok: true });
});

metricsRouter.post('/:companyId/recompute', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!assertCompany(req, res, req.params.companyId)) return;
  if (!requireMetricAdmin(req, res)) return;
  const client = await pool.connect();
  try {
    await recomputeCanonicalRollups(client, req.params.companyId);
    return res.json({ ok: true });
  } finally {
    client.release();
  }
});
