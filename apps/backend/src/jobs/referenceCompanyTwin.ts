import type { PoolClient } from 'pg';
import { env } from '../config.js';
import { pool } from '../db.js';
import { log } from '../lib/logger.js';
import { geminiJson, geminiText, toGeminiSchema } from '../lib/gemini.js';

const LOCK_MINUTES = 10;
const MAX_PAGE_TEXT = 60_000;

// 6 fixed roots — always generated for every company planet
const ROOT_ONTOLOGY = [
  { label: 'Identity',           color: '#60a5fa' },
  { label: 'Product & Tech',     color: '#a78bfa' },
  { label: 'Market Position',    color: '#34d399' },
  { label: 'Commercial Signals', color: '#fbbf24' },
  { label: 'People & Access',    color: '#f472b6' },
  { label: 'Engagement History', color: '#22d3ee' },
] as const;

const ROOT_LABELS = new Set<string>(ROOT_ONTOLOGY.map((root) => root.label));

// 4 dynamic roots per classification — generated on demand when user tags the planet
type Classification = 'competitor' | 'customer' | 'collaborator';

const DYNAMIC_ROOTS: Record<Classification, { label: string; color: string }[]> = {
  competitor: [
    { label: 'ICP Overlap',       color: '#f87171' },
    { label: 'Product Delta',     color: '#fb923c' },
    { label: 'GTM & Win/Loss',    color: '#facc15' },
    { label: 'Velocity & Threat', color: '#ef4444' },
  ],
  customer: [
    { label: 'ICP Fit',        color: '#4ade80' },
    { label: 'Buyer Map',      color: '#38bdf8' },
    { label: 'Pain & Trigger', color: '#a78bfa' },
    { label: 'Stack Intel',    color: '#f59e0b' },
    { label: 'Deal Urgency',   color: '#34d399' },
  ],
  collaborator: [
    { label: 'Complementary Gaps', color: '#60a5fa' },
    { label: 'Integration Fit',    color: '#818cf8' },
    { label: 'Value Split',        color: '#c084fc' },
    { label: 'Conflict Risk',      color: '#f472b6' },
  ],
};

const BRANCH_TYPES = ['information', 'metric', 'signal', 'relationship', 'evidence', 'decision'] as const;
type BranchType = (typeof BRANCH_TYPES)[number];

type Citation = {
  url: string;
  title?: string | null;
  snippet?: string | null;
};

type GeneratedAction = {
  label: string;
  summary: string;
  hint: string;
  confidence: number;
  nextSteps: string[];
  citations: Citation[];
};

type GeneratedBranch = {
  label: string;
  summary: string;
  nodeType: BranchType;
  relevance: number;
  confidence: number;
  citations: Citation[];
  actions: GeneratedAction[];
};

type GeneratedRoot = {
  label: string;
  description: string;
  relevance: number;
  confidence: number;
  citations: Citation[];
  branches: GeneratedBranch[];
};

type GeneratedTwin = {
  company: { name: string; canonicalUrl: string; summary: string };
  roots: GeneratedRoot[];
};

type GeneratedDynamicSet = {
  roots: GeneratedRoot[];
};

// ── JSON schema helpers ──────────────────────────────────────────────────────

const CITATION_DEF = {
  type: 'object',
  additionalProperties: false,
  required: ['url', 'title', 'snippet'],
  properties: {
    url: { type: 'string' },
    title: { type: ['string', 'null'], maxLength: 100 },
    snippet: { type: ['string', 'null'], maxLength: 120 },
  },
};

function branchItemSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['label', 'summary', 'nodeType', 'relevance', 'confidence', 'citations', 'actions'],
    properties: {
      label: { type: 'string', maxLength: 60 },
      summary: { type: 'string', maxLength: 140 },
      nodeType: { type: 'string', enum: BRANCH_TYPES },
      relevance: { type: 'integer', minimum: 0, maximum: 100 },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      citations: { type: 'array', minItems: 1, maxItems: 1, items: { $ref: '#/$defs/citation' } },
      actions: {
        type: 'array',
        minItems: 1,
        maxItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'summary', 'hint', 'confidence', 'nextSteps', 'citations'],
          properties: {
            label: { type: 'string', maxLength: 60 },
            summary: { type: 'string', maxLength: 120 },
            hint: { type: 'string', maxLength: 80 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            nextSteps: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', maxLength: 80 } },
            citations: { type: 'array', minItems: 1, maxItems: 1, items: { $ref: '#/$defs/citation' } },
          },
        },
      },
    },
  };
}

function rootItemSchema(labelEnum: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['label', 'description', 'relevance', 'confidence', 'citations', 'branches'],
    properties: {
      label: { type: 'string', enum: labelEnum },
      description: { type: 'string', maxLength: 160 },
      relevance: { type: 'integer', minimum: 0, maximum: 100 },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      citations: { type: 'array', minItems: 1, maxItems: 1, items: { $ref: '#/$defs/citation' } },
      branches: { type: 'array', minItems: 4, maxItems: 4, items: branchItemSchema() },
    },
  };
}

const GENERATED_TWIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['company', 'roots'],
  properties: {
    company: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'canonicalUrl', 'summary'],
      properties: {
        name: { type: 'string', maxLength: 120 },
        canonicalUrl: { type: 'string', maxLength: 300 },
        summary: { type: 'string', maxLength: 220 },
      },
    },
    roots: {
      type: 'array',
      minItems: ROOT_ONTOLOGY.length,
      maxItems: ROOT_ONTOLOGY.length,
      items: rootItemSchema(ROOT_ONTOLOGY.map((r) => r.label)),
    },
  },
  $defs: { citation: CITATION_DEF },
};

function buildDynamicSchema(classification: Classification) {
  const ontology = DYNAMIC_ROOTS[classification];
  const labels = ontology.map((r) => r.label);
  const count = ontology.length;
  return {
    type: 'object',
    additionalProperties: false,
    required: ['roots'],
    properties: {
      roots: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: rootItemSchema(labels),
      },
    },
    $defs: { citation: CITATION_DEF },
  };
}

// ── Validation helpers ───────────────────────────────────────────────────────

function clampPercent(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function clampConfidence(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, Math.round(number * 100) / 100));
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeCitationList(value: unknown, path: string): Citation[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`missing_citations:${path}`);
  }
  const citations = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const url = stringValue((item as any).url);
      if (!/^https?:\/\//i.test(url)) return null;
      return {
        url,
        title: stringValue((item as any).title, null as any),
        snippet: stringValue((item as any).snippet, null as any),
      };
    })
    .filter(Boolean) as Citation[];
  if (citations.length === 0) throw new Error(`invalid_citations:${path}`);
  return citations.slice(0, 8);
}

function parseRootList(rootsRaw: any[], allowedLabels: Set<string>, context: string): GeneratedRoot[] {
  const seen = new Set<string>();
  return rootsRaw.map((rootRaw: any, rootIndex: number): GeneratedRoot => {
    const label = stringValue(rootRaw?.label);
    if (!allowedLabels.has(label)) throw new Error(`invalid_root_label:${label || rootIndex}:${context}`);
    if (seen.has(label)) throw new Error(`duplicate_root_label:${label}:${context}`);
    seen.add(label);

    const branchesRaw = Array.isArray(rootRaw.branches) ? rootRaw.branches : [];
    if (branchesRaw.length === 0) throw new Error(`missing_branches:${label}`);

    return {
      label,
      description: stringValue(rootRaw.description),
      relevance: clampPercent(rootRaw.relevance, 75),
      confidence: clampConfidence(rootRaw.confidence, 0.7),
      citations: normalizeCitationList(rootRaw.citations, label),
      branches: branchesRaw.map((branchRaw: any, bi: number): GeneratedBranch => {
        const branchLabel = stringValue(branchRaw?.label, `Branch ${bi + 1}`);
        const nodeType = BRANCH_TYPES.includes(branchRaw?.nodeType) ? branchRaw.nodeType : 'information';
        const actionsRaw = Array.isArray(branchRaw.actions) ? branchRaw.actions : [];
        if (actionsRaw.length === 0) throw new Error(`missing_actions:${label}/${branchLabel}`);
        return {
          label: branchLabel,
          summary: stringValue(branchRaw.summary),
          nodeType,
          relevance: clampPercent(branchRaw.relevance, 70),
          confidence: clampConfidence(branchRaw.confidence, 0.7),
          citations: normalizeCitationList(branchRaw.citations, `${label}/${branchLabel}`),
          actions: actionsRaw.map((actionRaw: any, ai: number): GeneratedAction => {
            const actionLabel = stringValue(actionRaw?.label, `Action ${ai + 1}`);
            return {
              label: actionLabel,
              summary: stringValue(actionRaw.summary),
              hint: stringValue(actionRaw.hint, actionLabel),
              confidence: clampConfidence(actionRaw.confidence, 0.7),
              nextSteps: Array.isArray(actionRaw.nextSteps)
                ? actionRaw.nextSteps.map((s: unknown) => stringValue(s)).filter(Boolean).slice(0, 5)
                : [],
              citations: normalizeCitationList(actionRaw.citations, `${label}/${branchLabel}/${actionLabel}`),
            };
          }),
        };
      }),
    };
  });
}

function validateGeneratedTwin(value: unknown): GeneratedTwin {
  if (!value || typeof value !== 'object') throw new Error('invalid_llm_output');
  const raw = value as any;
  if (!raw.company || typeof raw.company !== 'object') throw new Error('missing_company');

  const rootsRaw = Array.isArray(raw.roots) ? raw.roots : [];
  const roots = parseRootList(rootsRaw, ROOT_LABELS, 'fixed');

  for (const required of ROOT_ONTOLOGY) {
    if (!roots.find((r) => r.label === required.label)) {
      throw new Error(`missing_required_root:${required.label}`);
    }
  }

  return {
    company: {
      name: stringValue(raw.company.name, 'Reference company'),
      canonicalUrl: stringValue(raw.company.canonicalUrl),
      summary: stringValue(raw.company.summary),
    },
    roots: ROOT_ONTOLOGY.map((o) => roots.find((r) => r.label === o.label)!),
  };
}

function validateDynamicSet(value: unknown, classification: Classification): GeneratedDynamicSet {
  if (!value || typeof value !== 'object') throw new Error('invalid_llm_output');
  const raw = value as any;
  const dynamicOntology = DYNAMIC_ROOTS[classification];
  const allowedLabels = new Set(dynamicOntology.map((r) => r.label));
  const rootsRaw = Array.isArray(raw.roots) ? raw.roots : [];
  const roots = parseRootList(rootsRaw, allowedLabels, classification);
  for (const required of dynamicOntology) {
    if (!roots.find((r) => r.label === required.label)) {
      throw new Error(`missing_dynamic_root:${required.label}`);
    }
  }
  return { roots: dynamicOntology.map((o) => roots.find((r) => r.label === o.label)!) };
}

// ── Web fetch ────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPublicPage(url: string): Promise<{ finalUrl: string; text: string; status: number | null }> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'User-Agent': 'FounderOS-ReferenceTwinResearch/1.0',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
    });
    const contentType = response.headers.get('content-type') ?? '';
    const raw = await response.text();
    const text = contentType.includes('html') ? stripHtml(raw) : raw.replace(/\s+/g, ' ').trim();
    return { finalUrl: response.url || url, text: text.slice(0, MAX_PAGE_TEXT), status: response.status };
  } catch (err) {
    return {
      finalUrl: url,
      text: `Direct fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      status: null,
    };
  }
}

// ── LLM helpers ──────────────────────────────────────────────────────────────

/**
 * Thinking tokens share the maxOutputTokens budget on Gemini 2.5. This output is
 * large (6 roots x 4 branches x action x citation), so thinking is capped to leave
 * room for it — uncapped, it consumed up to ~4.3k tokens in testing and truncated
 * the JSON mid-structure.
 */
const STRUCTURED_THINKING_BUDGET = 1024;

async function callOpenAi(params: {
  instructions: string;
  prompt: string;
  schema: object;
  schemaName: string;
  maxTokens: number;
}): Promise<unknown> {
  const composedPrompt = [
    params.instructions,
    '',
    `Return ONLY a valid JSON object named "${params.schemaName}".`,
    '',
    params.prompt,
  ].join('\n');
  // The schema is passed natively rather than pasted into the prompt: Gemini
  // constrains decoding to it, so the model cannot emit structurally invalid JSON,
  // and it no longer costs prompt tokens to restate.
  return geminiJson(composedPrompt, {
    maxOutputTokens: params.maxTokens,
    responseSchema: toGeminiSchema(params.schema),
    thinkingBudget: STRUCTURED_THINKING_BUDGET,
  });
}

// ── Step 1: web research ─────────────────────────────────────────────────────

async function gatherWebResearch(input: {
  sourceUrl: string;
  fetchedUrl: string;
  fetchedText: string;
  industryLabel: string | null;
  subdomainLabel: string | null;
}): Promise<string> {
  const ontologyText = ROOT_ONTOLOGY.map((root, i) => `${i + 1}. ${root.label}`).join('\n');
  const instructions = [
    'You are a B2B market researcher. Produce a comprehensive factual research report about the submitted company.',
    'Use web search to gather current, public information. Do not invent private data, financials, or relationships.',
    'Cover all 6 research topics listed in the prompt. Include inline source citations (URLs) for each finding.',
    'Be thorough — this report will be used by a structured extraction step, so completeness matters over brevity.',
  ].join('\n');

  const prompt = [
    `Company URL: ${input.sourceUrl}`,
    `Fetched URL: ${input.fetchedUrl}`,
    `Context: ${input.industryLabel ?? 'Unknown industry'} > ${input.subdomainLabel ?? 'Unknown subdomain'}`,
    '',
    'Research topics to cover:',
    ontologyText,
    '',
    'Direct page text:',
    input.fetchedText || 'Not available.',
    '',
    'Write a structured research report covering each topic above with inline citations.',
  ].join('\n');

  const result = await geminiText(prompt, {
    system: instructions,
    webSearch: true,
    maxOutputTokens: env.OPENAI_RESPONSES_MAX_RESEARCH_TOKENS,
  });
  if (!result) throw new Error('gemini_empty_research_output');
  return result;
}

// ── Step 2: fixed root generation ────────────────────────────────────────────

async function generateStructuredTwin(input: {
  sourceUrl: string;
  fetchedUrl: string;
  fetchedText: string;
  industryLabel: string | null;
  subdomainLabel: string | null;
  researchReport: string;
}): Promise<GeneratedTwin> {
  const instructions = [
    'You create structured company twin JSON from a research report. Follow the schema exactly.',
    'The roots array MUST contain exactly 6 objects in this exact order: 1. Identity 2. Product & Tech 3. Market Position 4. Commercial Signals 5. People & Access 6. Engagement History.',
    'Each label MUST appear exactly once. Never repeat a label.',
    'Return exactly 4 branches per root, exactly 1 action per branch, and exactly 1 citation per node.',
    'Do not invent data not present in the research report or page text.',
  ].join('\n');

  const prompt = [
    `Company URL: ${input.sourceUrl}`,
    `Fetched URL: ${input.fetchedUrl}`,
    `Context: ${input.industryLabel ?? 'Unknown industry'} > ${input.subdomainLabel ?? 'Unknown subdomain'}`,
    '',
    'Research report:',
    input.researchReport,
    '',
    'Direct page text:',
    input.fetchedText || 'Not available.',
  ].join('\n');

  const raw = await callOpenAi({
    instructions,
    prompt,
    schema: GENERATED_TWIN_SCHEMA,
    schemaName: 'reference_company_twin',
    maxTokens: env.OPENAI_RESPONSES_MAX_OUTPUT_TOKENS,
  });
  return validateGeneratedTwin(raw);
}

async function callOpenAiForTwin(input: {
  sourceUrl: string;
  fetchedUrl: string;
  fetchedText: string;
  industryLabel: string | null;
  subdomainLabel: string | null;
}): Promise<GeneratedTwin> {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
  const researchReport = await gatherWebResearch(input);
  log.info({ researchLength: researchReport.length }, 'research gathered');
  return generateStructuredTwin({ ...input, researchReport });
}

// ── Dynamic root generation (classify job) ───────────────────────────────────

async function generateDynamicRoots(input: {
  companyName: string;
  canonicalUrl: string | null;
  sourceUrl: string;
  classification: Classification;
  fixedRootSummaries: { label: string; summary: string }[];
}): Promise<GeneratedDynamicSet> {
  const dynamicOntology = DYNAMIC_ROOTS[input.classification];
  const classificationLabel =
    input.classification === 'competitor' ? 'Competitor'
    : input.classification === 'customer' ? 'Customer'
    : 'Collaborator';

  const rootListText = dynamicOntology.map((r, i) => `${i + 1}. ${r.label}`).join('\n');
  const fixedContext = input.fixedRootSummaries
    .map((r) => `${r.label}: ${r.summary}`)
    .join('\n');

  const rootCount = dynamicOntology.length;

  const instructions = [
    `You generate ${classificationLabel} intelligence nodes for a company planet. Follow the schema exactly.`,
    `The roots array MUST contain exactly ${rootCount} objects in this exact order:\n${rootListText}`,
    'Each label MUST appear exactly once. Never repeat a label.',
    'Return exactly 4 branches per root, exactly 1 action per branch, and exactly 1 citation per node.',
    'Base your analysis on the existing research context provided. Focus on the classification lens.',
    'Do not invent data. Action node labels must be verbs (e.g. "Run ICP analysis", "Map feature gap").',
  ].join('\n');

  const prompt = [
    `Company: ${input.companyName}`,
    `URL: ${input.canonicalUrl ?? input.sourceUrl}`,
    `Classification lens: ${classificationLabel}`,
    '',
    'Existing research context (fixed roots):',
    fixedContext,
    '',
    `Generate ${classificationLabel}-specific intelligence for the ${rootCount} dynamic roots listed above.`,
  ].join('\n');

  const schema = buildDynamicSchema(input.classification);
  const raw = await callOpenAi({
    instructions,
    prompt,
    schema,
    schemaName: 'dynamic_roots',
    maxTokens: env.OPENAI_RESPONSES_MAX_OUTPUT_TOKENS,
  });
  return validateDynamicSet(raw, input.classification);
}

// ── DB write helpers ─────────────────────────────────────────────────────────

async function insertSources(
  client: PoolClient,
  referenceCompanyId: string,
  nodeId: string,
  citations: Citation[],
  retrievedAt: Date,
) {
  for (const citation of citations) {
    await client.query(
      `INSERT INTO public.reference_company_sources
         (reference_company_id, node_id, url, title, snippet, retrieved_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [referenceCompanyId, nodeId, citation.url, citation.title ?? null, citation.snippet ?? null, retrievedAt.toISOString()],
    );
  }
}

async function insertRootTree(
  client: PoolClient,
  referenceCompanyId: string,
  root: GeneratedRoot,
  ontologyColor: string,
  sortOrder: number,
  isDynamic: boolean,
  retrievedAt: Date,
): Promise<number> {
  let count = 0;
  const { rows: rootRows } = await client.query<{ id: string }>(
    `INSERT INTO public.reference_company_nodes
       (reference_company_id, node_kind, label, summary, relevance, confidence, color, sort_order, is_dynamic, metadata)
     VALUES ($1, 'root', $2, $3, $4, $5, $6, $7, $8, '{}'::jsonb)
     RETURNING id`,
    [referenceCompanyId, root.label, root.description, root.relevance, root.confidence, ontologyColor, sortOrder, isDynamic],
  );
  count += 1;
  const rootId = rootRows[0].id;
  await insertSources(client, referenceCompanyId, rootId, root.citations, retrievedAt);

  for (let bi = 0; bi < root.branches.length; bi++) {
    const branch = root.branches[bi];
    const { rows: branchRows } = await client.query<{ id: string }>(
      `INSERT INTO public.reference_company_nodes
         (reference_company_id, parent_node_id, node_kind, label, summary, node_type, relevance, confidence, sort_order, is_dynamic, metadata)
       VALUES ($1, $2, 'branch', $3, $4, $5, $6, $7, $8, $9, '{}'::jsonb)
       RETURNING id`,
      [referenceCompanyId, rootId, branch.label, branch.summary, branch.nodeType, branch.relevance, branch.confidence, bi, isDynamic],
    );
    count += 1;
    const branchId = branchRows[0].id;
    await insertSources(client, referenceCompanyId, branchId, branch.citations, retrievedAt);

    for (let ai = 0; ai < branch.actions.length; ai++) {
      const action = branch.actions[ai];
      const { rows: actionRows } = await client.query<{ id: string }>(
        `INSERT INTO public.reference_company_nodes
           (reference_company_id, parent_node_id, node_kind, label, summary, relevance, confidence, sort_order, is_dynamic,
            metadata)
         VALUES ($1, $2, 'action', $3, $4, $5, $6, $7, $8,
           jsonb_build_object('hint', $9::text, 'nextSteps', $10::jsonb))
         RETURNING id`,
        [referenceCompanyId, branchId, action.label, action.summary, branch.relevance, action.confidence, ai, isDynamic, action.hint, JSON.stringify(action.nextSteps)],
      );
      count += 1;
      await insertSources(client, referenceCompanyId, actionRows[0].id, action.citations, retrievedAt);
    }
  }
  return count;
}

// ── generate job (fixed 6 roots) ─────────────────────────────────────────────

async function replaceReferenceCompanyTree(
  generated: GeneratedTwin,
  job: Record<string, any>,
  fetchResult: { finalUrl: string; text: string; status: number | null },
): Promise<number> {
  const client = await pool.connect();
  const retrievedAt = new Date();
  let nodeCount = 0;
  try {
    await client.query('BEGIN');
    // Only delete AI-generated nodes/sources — manual nodes (source = 'manual')
    // are user-authored and must survive generate/refresh regeneration.
    await client.query(
      `DELETE FROM public.reference_company_sources
        WHERE reference_company_id = $1
          AND (
            node_id IS NULL
            OR node_id IN (
              SELECT id FROM public.reference_company_nodes
               WHERE reference_company_id = $1 AND source = 'ai'
            )
          )`,
      [job.reference_company_id],
    );
    await client.query(
      `DELETE FROM public.reference_company_nodes WHERE reference_company_id = $1 AND source = 'ai'`,
      [job.reference_company_id],
    );
    await client.query(
      `UPDATE public.reference_companies
          SET name = $2, canonical_url = NULLIF($3, ''), description = $4,
              status = 'ready', last_error = NULL, generated_at = NOW(), updated_at = NOW(),
              metadata = jsonb_strip_nulls(jsonb_build_object(
                'model', $5::text,
                'lastFetch', jsonb_build_object('finalUrl', $6::text, 'status', $7::int, 'textChars', $8::int)
              ))
        WHERE id = $1`,
      [job.reference_company_id, generated.company.name, generated.company.canonicalUrl, generated.company.summary,
       env.OPENAI_RESPONSES_MODEL, fetchResult.finalUrl, fetchResult.status, fetchResult.text.length],
    );

    for (let i = 0; i < generated.roots.length; i++) {
      const root = generated.roots[i];
      const ontology = ROOT_ONTOLOGY.find((o) => o.label === root.label);
      nodeCount += await insertRootTree(client, job.reference_company_id, root, ontology?.color ?? '#C1AEFF', i, false, retrievedAt);
    }

    await client.query('COMMIT');
    return nodeCount;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function runReferenceCompanyJob(job: Record<string, any>): Promise<number> {
  const { rows } = await pool.query<{
    id: string; source_url: string; name: string | null;
    industry_label: string | null; subdomain_label: string | null;
  }>(
    `SELECT rc.id, rc.source_url, rc.name,
            i.label AS industry_label, s.label AS subdomain_label
       FROM public.reference_companies rc
       LEFT JOIN public.industries i ON i.id = rc.industry_id
       LEFT JOIN public.subdomains s ON s.id = rc.subdomain_id
      WHERE rc.id = $1 AND rc.company_id = $2`,
    [job.reference_company_id, job.company_id],
  );
  const referenceCompany = rows[0];
  if (!referenceCompany) throw new Error('reference_company_not_found');

  await pool.query(
    `UPDATE public.reference_companies SET status = 'running', last_error = NULL, updated_at = NOW() WHERE id = $1`,
    [job.reference_company_id],
  );

  const fetchResult = await fetchPublicPage(referenceCompany.source_url);
  const generated = await callOpenAiForTwin({
    sourceUrl: referenceCompany.source_url,
    fetchedUrl: fetchResult.finalUrl,
    fetchedText: fetchResult.text,
    industryLabel: referenceCompany.industry_label,
    subdomainLabel: referenceCompany.subdomain_label,
  });

  return replaceReferenceCompanyTree(generated, job, fetchResult);
}

// ── classify job (4 dynamic roots) ───────────────────────────────────────────

function computeScore(roots: GeneratedRoot[]): number {
  if (roots.length === 0) return 0;
  const avg = roots.reduce((sum, r) => sum + r.relevance * r.confidence, 0) / roots.length;
  return Math.round(Math.min(100, avg));
}

async function runClassifyJob(job: Record<string, any>): Promise<number> {
  const classification = job.payload?.classification as Classification | undefined;
  if (!classification || !DYNAMIC_ROOTS[classification]) {
    throw new Error(`invalid_classification:${classification}`);
  }

  const { rows } = await pool.query<{
    id: string; source_url: string; canonical_url: string | null; name: string | null;
  }>(
    `SELECT id, source_url, canonical_url, name FROM public.reference_companies
      WHERE id = $1 AND company_id = $2`,
    [job.reference_company_id, job.company_id],
  );
  const rc = rows[0];
  if (!rc) throw new Error('reference_company_not_found');

  const { rows: fixedRoots } = await pool.query<{ label: string; summary: string }>(
    `SELECT label, summary FROM public.reference_company_nodes
      WHERE reference_company_id = $1 AND node_kind = 'root' AND is_dynamic = false
      ORDER BY sort_order`,
    [job.reference_company_id],
  );

  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
  const dynamicSet = await generateDynamicRoots({
    companyName: rc.name ?? 'Reference company',
    canonicalUrl: rc.canonical_url,
    sourceUrl: rc.source_url,
    classification,
    fixedRootSummaries: fixedRoots,
  });
  log.info({ jobId: job.id, classification, rootCount: dynamicSet.roots.length }, 'dynamic roots generated');

  const score = computeScore(dynamicSet.roots);
  const scoreKey =
    classification === 'competitor' ? 'threatScore'
    : classification === 'customer' ? 'customerPriority'
    : 'partnerPotential';

  const client = await pool.connect();
  const retrievedAt = new Date();
  let nodeCount = 0;
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM public.reference_company_sources
        WHERE reference_company_id = $1
          AND node_id IN (
            SELECT id FROM public.reference_company_nodes
             WHERE reference_company_id = $1 AND is_dynamic = true
          )`,
      [job.reference_company_id],
    );
    await client.query(
      `DELETE FROM public.reference_company_nodes WHERE reference_company_id = $1 AND is_dynamic = true`,
      [job.reference_company_id],
    );

    const dynamicOntology = DYNAMIC_ROOTS[classification];
    for (let i = 0; i < dynamicSet.roots.length; i++) {
      const root = dynamicSet.roots[i];
      const ontology = dynamicOntology.find((o) => o.label === root.label);
      nodeCount += await insertRootTree(client, job.reference_company_id, root, ontology?.color ?? '#C1AEFF', 100 + i, true, retrievedAt);
    }

    await client.query(
      `UPDATE public.reference_companies
          SET classification = $2,
              scores = scores || jsonb_build_object($3::text, $4::int),
              updated_at = NOW()
        WHERE id = $1`,
      [job.reference_company_id, classification, scoreKey, score],
    );

    await client.query('COMMIT');
    return nodeCount;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Job runner ───────────────────────────────────────────────────────────────

async function pickOneReferenceCompanyJob() {
  const { rows } = await pool.query(
    `UPDATE public.reference_company_jobs
        SET status = 'running',
            attempts = attempts + 1,
            started_at = COALESCE(started_at, NOW()),
            locked_until = NOW() + ($2 || ' minutes')::interval,
            locked_by = $1
      WHERE id = (
        SELECT id FROM public.reference_company_jobs
         WHERE (
           (status = 'pending' AND (locked_until IS NULL OR locked_until < NOW()))
           OR (status = 'running' AND locked_until IS NOT NULL AND locked_until < NOW())
         )
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING *;`,
    [env.WORKER_ID, String(LOCK_MINUTES)],
  );
  return rows[0] ?? null;
}

async function finishReferenceCompanyJobOk(jobId: string, recordCount: number) {
  await pool.query(
    `UPDATE public.reference_company_jobs
        SET status = 'complete', completed_at = NOW(), locked_until = NULL, locked_by = NULL,
            payload = payload || jsonb_build_object('recordCount', $2::int)
      WHERE id = $1`,
    [jobId, recordCount],
  );
}

async function finishReferenceCompanyJobErr(job: Record<string, any>, err: Error) {
  const shouldRetry = job.attempts < job.max_attempts;
  const nextStatus = shouldRetry ? 'pending' : 'failed';
  const backoffMs = Math.min(120_000, 5_000 * 2 ** job.attempts);
  const message = err.message.slice(0, 1000);

  await pool.query(
    `UPDATE public.reference_company_jobs
        SET status = $2, last_error = $3,
            locked_until = CASE WHEN $2 = 'pending' THEN NOW() + interval '1 millisecond' * $4 ELSE NULL END,
            locked_by = NULL
      WHERE id = $1`,
    [job.id, nextStatus, message, backoffMs],
  );

  // Only mark company failed for generate/refresh jobs; classify failures don't reset company status
  if (job.kind !== 'classify') {
    await pool.query(
      `UPDATE public.reference_companies
          SET status = $2, last_error = $3, updated_at = NOW()
        WHERE id = $1`,
      [job.reference_company_id, shouldRetry ? 'pending' : 'failed', message],
    );
  }
}

export async function processOneReferenceCompanyJob(): Promise<boolean> {
  const job = await pickOneReferenceCompanyJob();
  if (!job) return false;

  log.info({ jobId: job.id, kind: job.kind, referenceCompanyId: job.reference_company_id }, 'picked reference company job');

  try {
    let recordCount: number;
    if (job.kind === 'classify') {
      recordCount = await runClassifyJob(job);
      log.info({ jobId: job.id, recordCount }, 'classify job complete');
    } else {
      recordCount = await runReferenceCompanyJob(job);

      // Auto-queue classify job if classification was set at research time
      const { rows: rcRows } = await pool.query<{ classification: string | null }>(
        `SELECT classification FROM public.reference_companies WHERE id = $1`,
        [job.reference_company_id],
      );
      if (rcRows[0]?.classification) {
        await pool.query(
          `INSERT INTO public.reference_company_jobs
             (reference_company_id, company_id, kind, payload)
           VALUES ($1, $2, 'classify', jsonb_build_object('classification', $3::text))`,
          [job.reference_company_id, job.company_id, rcRows[0].classification],
        );
        log.info({ referenceCompanyId: job.reference_company_id, classification: rcRows[0].classification }, 'auto-queued classify job');
      }

      log.info({ jobId: job.id, recordCount }, 'reference company job complete');
    }
    await finishReferenceCompanyJobOk(job.id, recordCount);
  } catch (err: any) {
    const error = err instanceof Error ? err : new Error(String(err));
    await finishReferenceCompanyJobErr(job, error);
    log.error({ jobId: job.id, kind: job.kind, err: error.message }, 'reference company job failed');
  }

  return true;
}
