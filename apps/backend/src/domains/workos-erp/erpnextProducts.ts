import { Router } from 'express';
import { getErpNextRecords, type ErpNextCreds, type ErpNextGenericRecord } from '../../adapters/erpnext.js';
import { pool } from '../../db.js';
import { getErpNextNotConfiguredMessage, resolveErpNextCreds } from '../../lib/erpnextConnection.js';
import { authJwt } from '../../middleware/authJwt.js';

// Sibling of erpnextOperations.ts / erpnextSales.ts, scoped to the Product department. Only
// the "Products" branch item under "Product Portfolio" is ERPNext-Item-shaped — every other
// Product branch item (PM/roadmap vocabulary) intentionally has no mapping entry.

export const erpnextProductsRouter = Router();

type ErpNextProductsStatus = 'ready' | 'not_configured' | 'unsupported' | 'partial';
type ProductsTemplateKey = 'generic' | 'rollup' | 'unsupported';
type ProductsTone = 'good' | 'neutral' | 'warning' | 'critical';

interface ProductsMetric { label: string; value: number | string; unit?: string; }
interface ProductsCard { id: string; title: string; subtitle?: string; value?: string; status?: string; sourceDoctype: string; sourceId?: string; }
interface ProductsMetricCard { id: string; label: string; value: number | string; unit?: string; description: string; tone: ProductsTone; }
interface ProductsBreakdownItem { label: string; value: number | string; unit?: string; tone?: ProductsTone; }
interface ProductsBreakdown { id: string; title: string; items: ProductsBreakdownItem[]; }
interface ProductsInsight { id: string; label: string; detail: string; severity: 'info' | 'warning' | 'critical'; }
interface ProductsEvidence { id: string; label: string; sourceDoctype: string; sourceId: string; detail?: string; status?: string; }
interface ProductsChildRollup { nodeId: string; nodeLabel: string; mappingLabel: string; status: ErpNextProductsStatus; templateKey: ProductsTemplateKey; healthScore: number | null; headline: string; }
interface ProductsRecommendation { label: string; reason: string; severity: 'info' | 'warning' | 'critical'; }

interface ReadDefinition { doctype: string; fields: string[]; filters?: unknown[]; }

interface MappingDefinition {
  key: string;
  label: string;
  level1Label: string;
  branchLabel: string;
  sourceDoctypes: string[];
  reads: ReadDefinition[];
  status?: Extract<ErpNextProductsStatus, 'partial' | 'unsupported'>;
  unsupportedReason?: string;
  partialReason?: string;
}

interface NodePathRow {
  id: string;
  parent_node_id: string | null;
  label: string;
  node_type: string;
  node_level: string | null;
  metadata: Record<string, unknown> | null;
  metric_key: string | null;
  depth: number;
  department_id: string;
  department_label: string;
  department_source_key: string | null;
}

type ReadResult = { ok: true; rows: ErpNextGenericRecord[] } | { ok: false; rows: []; error: string };

interface NodeSummaryResult {
  status: ErpNextProductsStatus;
  generatedAt: string;
  siteName?: string;
  department: 'Products';
  nodeId: string;
  nodeLabel: string;
  path: string[];
  mappingKey: string;
  mappingLabel: string;
  templateKey: ProductsTemplateKey;
  headline: string;
  healthScore: number | null;
  sourceDoctypes: string[];
  metrics: ProductsMetric[];
  metricCards: ProductsMetricCard[];
  breakdowns: ProductsBreakdown[];
  insights: ProductsInsight[];
  cards: ProductsCard[];
  evidence: ProductsEvidence[];
  childRollups?: ProductsChildRollup[];
  recommendedActions: ProductsRecommendation[];
  warnings: string[];
  unsupportedReason?: string;
}

interface ProductsLeafRow { id: string; label: string; }

const BASE_FIELDS = ['modified', 'creation'];

function mapping(key: string, label: string, level1Label: string, branchLabel: string, sourceDoctypes: string[], reads: ReadDefinition[]): MappingDefinition {
  return { key, label, level1Label, branchLabel, sourceDoctypes, reads };
}

// Only "Products" under "Product Portfolio" is ERPNext-Item-shaped. Every other Product
// branch item (modules, product lines, feature families, ownership map, lifecycle stage, and
// all of Discovery/Roadmaps/Insights/Performance/Resources) has no entry here — mappingKeyFromPath
// returns null for them, and buildNodeSummary falls into the existing "no verified mapping" path.
const MAPPINGS: MappingDefinition[] = [
  mapping('prod_portfolio_products', 'Products', 'Product Portfolio', 'Products', ['Item', 'Item Group', 'Item Price'], [
    { doctype: 'Item', fields: ['item_code', 'item_name', 'item_group', 'stock_uom', 'disabled', ...BASE_FIELDS] },
    { doctype: 'Item Group', fields: ['item_group_name', 'is_group', 'parent_item_group', ...BASE_FIELDS] },
    { doctype: 'Item Price', fields: ['item_code', 'price_list', 'price_list_rate', ...BASE_FIELDS] },
  ]),
];

const MAPPING_BY_KEY = new Map(MAPPINGS.map(entry => [entry.key, entry]));
const MAPPING_BY_METRIC_KEY = new Map(MAPPINGS.map(entry => [`spec_dept_product_${entry.key}`, entry]));

export const MAPPING_SOURCE_LABELS: Record<string, { level1Label: string; branchLabel: string }> = Object.fromEntries(
  MAPPINGS.map(entry => [entry.key, { level1Label: entry.level1Label, branchLabel: entry.branchLabel }]),
);

export function listActiveBranchKeys(): Array<{ level1Label: string; branchLabel: string }> {
  return MAPPINGS.filter(entry => entry.status !== 'unsupported').map(entry => ({ level1Label: entry.level1Label, branchLabel: entry.branchLabel }));
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.round(next)));
}

function isProblemStatus(status: unknown): boolean {
  return typeof status === 'string' && /fail|reject|cancel|overdue|late|hold|stopped|disabled/i.test(status);
}

function isDisabledItem(row: ErpNextGenericRecord): boolean {
  return row.disabled === 1 || row.disabled === '1';
}

function displayValue(record: ErpNextGenericRecord): string | undefined {
  const keys = ['price_list_rate', 'item_group', 'stock_uom', 'modified', 'creation'];
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return undefined;
}

function normalizeErpNextReadError(doctype: string, message: string): string {
  const fieldMatch = message.match(/Field not permitted in query:\s*([A-Za-z0-9_]+)/i);
  if (fieldMatch?.[1]) return `${doctype}: field "${fieldMatch[1]}" is not readable on this WorkOS site.`;
  if (/DocType.*not found|doctype.*not found/i.test(message)) return `${doctype}: doctype is not installed or not available on this WorkOS site.`;
  const jsonStart = message.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(message.slice(jsonStart)) as { exception?: string; exc_type?: string };
      if (parsed.exception) return `${doctype}: ${parsed.exception.replace(/^frappe\.exceptions\./, '')}`;
      if (parsed.exc_type) return `${doctype}: WorkOS ${parsed.exc_type}`;
    } catch {
      // Fall through to the compact generic message below.
    }
  }
  return `${doctype}: ${message.replace(/\s+/g, ' ').slice(0, 180)}`;
}

async function safeRead(creds: ErpNextCreds, definition: ReadDefinition, limit: number, warnings: string[]): Promise<ReadResult> {
  try {
    return { ok: true, rows: await getErpNextRecords(creds, definition.doctype, definition.fields, limit, definition.filters ?? []) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const normalized = normalizeErpNextReadError(definition.doctype, message);
    warnings.push(normalized);
    return { ok: false, rows: [], error: normalized };
  }
}

function cardsFor(reads: Array<{ definition: ReadDefinition; result: ReadResult }>): ProductsCard[] {
  return reads.flatMap(({ definition, result }) => result.rows.slice(0, 4).map(record => ({
    id: `${definition.doctype}:${record.name}`,
    title: record.name,
    subtitle: String(record.item_name ?? record.item_group_name ?? record.item_code ?? definition.doctype),
    value: displayValue(record),
    status: isDisabledItem(record) ? 'disabled' : undefined,
    sourceDoctype: definition.doctype,
    sourceId: record.name,
  }))).slice(0, 10);
}

function metricsFor(reads: Array<{ definition: ReadDefinition; result: ReadResult }>): ProductsMetric[] {
  const successful = reads.filter(read => read.result.ok);
  const rows = successful.flatMap(read => read.result.rows);
  const activeRows = rows.filter(row => !isDisabledItem(row));
  const metrics: ProductsMetric[] = [
    { label: 'WorkOS doctypes read', value: successful.length },
    { label: 'Records returned', value: rows.length },
    { label: 'Active records', value: activeRows.length },
  ];
  return metrics;
}

type ReadBundle = Array<{ definition: ReadDefinition; result: ReadResult }>;

function successfulRows(reads: ReadBundle): ErpNextGenericRecord[] {
  return reads.flatMap(read => read.result.rows);
}

function metricCard(id: string, label: string, value: number | string, description: string, tone: ProductsTone = 'neutral', unit?: string): ProductsMetricCard {
  return { id, label, value, unit, description, tone };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreFromSignals(totalRecords: number, attention: number, partial = false): number {
  const base = totalRecords > 0 ? 86 : 58;
  return clampScore(base - attention * 8 - (partial ? 6 : 0));
}

function breakdownByDoctype(reads: ReadBundle): ProductsBreakdown {
  const items = reads
    .filter(read => read.result.ok)
    .map(read => ({
      label: read.definition.doctype,
      value: read.result.rows.length,
      tone: read.result.rows.some(row => isDisabledItem(row)) ? 'warning' as const : 'neutral' as const,
    }))
    .filter(item => Number(item.value) > 0);
  return { id: 'source_mix', title: 'WorkOS source mix', items };
}

function evidenceFor(reads: ReadBundle): ProductsEvidence[] {
  return reads.flatMap(({ definition, result }) => result.rows.slice(0, 5).map(record => ({
    id: `${definition.doctype}:${record.name}`,
    label: String(record.item_name ?? record.item_group_name ?? record.item_code ?? record.name),
    sourceDoctype: definition.doctype,
    sourceId: record.name,
    detail: displayValue(record),
    status: isDisabledItem(record) ? 'disabled' : undefined,
  }))).slice(0, 24);
}

interface MetricStory {
  templateKey: ProductsTemplateKey;
  headline: string;
  healthScore: number;
  metricCards: ProductsMetricCard[];
  breakdowns: ProductsBreakdown[];
  insights: ProductsInsight[];
  evidence: ProductsEvidence[];
}

function buildMetricStory(mappingDef: MappingDefinition, reads: ReadBundle): MetricStory {
  const total = successfulRows(reads).length;
  const disabled = successfulRows(reads).filter(row => isDisabledItem(row)).length;
  return {
    templateKey: 'generic',
    headline: `${total} WorkOS catalog record(s) are connected to "${mappingDef.label}".`,
    healthScore: scoreFromSignals(total, disabled, mappingDef.status === 'partial'),
    metricCards: [
      metricCard('records', 'Catalog records', total, 'WorkOS Item/Item Group/Item Price records found.', 'neutral'),
      metricCard('disabled', 'Disabled items', disabled, 'Items marked disabled in WorkOS.', disabled > 0 ? 'warning' : 'good'),
    ],
    breakdowns: [breakdownByDoctype(reads)],
    insights: [
      { id: 'connected', label: 'Connected evidence', detail: `${total} WorkOS catalog records were read for this Product node in the current window.`, severity: 'info' },
      ...(disabled > 0 ? [{ id: 'disabled', label: 'Disabled items present', detail: `${disabled} item(s) are marked disabled in WorkOS.`, severity: 'warning' as const }] : []),
    ],
    evidence: evidenceFor(reads),
  };
}

function recommendationsFor(mappingDef: MappingDefinition, reads: Array<{ definition: ReadDefinition; result: ReadResult }>): ProductsRecommendation[] {
  const failed = reads.filter(read => !read.result.ok);
  const rows = reads.flatMap(read => read.result.rows);
  const recommendations: ProductsRecommendation[] = [];
  if (mappingDef.partialReason) recommendations.push({ label: 'Partial WorkOS coverage', reason: mappingDef.partialReason, severity: 'info' });
  if (failed.length > 0) recommendations.push({ label: 'Verify WorkOS doctypes', reason: `${failed.length} mapped doctype(s) could not be read on this site.`, severity: 'warning' });
  if (rows.length === 0 && failed.length === 0) recommendations.push({ label: 'No WorkOS records yet', reason: `No ${mappingDef.label} records were returned for this company site.`, severity: 'info' });
  return recommendations;
}

async function resolveNodePath(companyId: string, nodeId: string): Promise<NodePathRow[] | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nodeId)) return null;
  const { rows } = await pool.query<NodePathRow>(
    `WITH RECURSIVE node_path AS (
       SELECT n.id, n.parent_node_id, n.label, n.node_type, n.node_level, n.metadata, ml.metric_key,
              0 AS depth, d.id AS department_id, d.label AS department_label, d.source_key AS department_source_key
         FROM public.department_bdt_nodes n
         JOIN public.departments d ON d.id = n.department_id AND d.company_id = n.company_id
         LEFT JOIN public.department_metric_links ml ON ml.node_id = n.id
        WHERE n.id = $1 AND n.company_id = $2
       UNION ALL
       SELECT parent.id, parent.parent_node_id, parent.label, parent.node_type, parent.node_level, parent.metadata, parent_ml.metric_key,
              child.depth + 1 AS depth, child.department_id, child.department_label, child.department_source_key
         FROM public.department_bdt_nodes parent
         JOIN node_path child ON child.parent_node_id = parent.id
         LEFT JOIN public.department_metric_links parent_ml ON parent_ml.node_id = parent.id
     )
     SELECT * FROM node_path ORDER BY depth DESC`,
    [nodeId, companyId],
  );
  return rows.length > 0 ? rows : null;
}

async function listProductsLeaves(companyId: string): Promise<ProductsLeafRow[]> {
  const { rows } = await pool.query<ProductsLeafRow>(
    `SELECT n.id, n.label
       FROM public.department_bdt_nodes n
       JOIN public.departments d ON d.id = n.department_id AND d.company_id = n.company_id
      WHERE n.company_id = $1
        AND (d.source_key = 'dept_product' OR d.label = 'Product')
        AND NOT EXISTS (
          SELECT 1 FROM public.department_bdt_nodes child
           WHERE child.parent_node_id = n.id AND child.company_id = n.company_id
        )
      ORDER BY n.sort_order ASC, n.label ASC`,
    [companyId],
  );
  return rows;
}

async function listDescendantLeaves(companyId: string, nodeId: string): Promise<ProductsLeafRow[]> {
  const { rows } = await pool.query<ProductsLeafRow>(
    `WITH RECURSIVE descendants AS (
       SELECT n.id, n.label, n.parent_node_id, n.sort_order
         FROM public.department_bdt_nodes n
        WHERE n.parent_node_id = $1 AND n.company_id = $2
       UNION ALL
       SELECT child.id, child.label, child.parent_node_id, child.sort_order
         FROM public.department_bdt_nodes child
         JOIN descendants parent ON child.parent_node_id = parent.id
        WHERE child.company_id = $2
     )
     SELECT d.id, d.label FROM descendants d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.department_bdt_nodes child
         WHERE child.parent_node_id = d.id AND child.company_id = $2
      )
      ORDER BY d.sort_order ASC, d.label ASC`,
    [nodeId, companyId],
  );
  return rows;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const LEVEL1_PREFIX: Record<string, string> = {
  'Product Portfolio': 'portfolio',
};

function mappingKeyFromPath(path: NodePathRow[]): string | null {
  const leaf = path[path.length - 1];
  if (!leaf) return null;
  if (leaf.metric_key && MAPPING_BY_METRIC_KEY.has(leaf.metric_key)) return MAPPING_BY_METRIC_KEY.get(leaf.metric_key)!.key;
  const level1 = [...path].reverse().find(row => row.node_level === 'level1' || row.metadata?.level1Label);
  const branch = [...path].reverse().find(row => row.node_level === 'branch' || row.metadata?.branchItem);
  const level1Label = typeof leaf.metadata?.level1Label === 'string' ? leaf.metadata.level1Label : level1?.label;
  const branchLabel = typeof leaf.metadata?.branchItem === 'string' ? leaf.metadata.branchItem : branch?.label;
  if (!level1Label || !branchLabel) return null;
  const prefix = LEVEL1_PREFIX[level1Label];
  return prefix ? `prod_${prefix}_${slug(branchLabel)}` : null;
}

function unsupportedMetricStory(reason: string): Pick<NodeSummaryResult, 'templateKey' | 'headline' | 'healthScore' | 'metricCards' | 'breakdowns' | 'insights' | 'evidence'> {
  return {
    templateKey: 'unsupported',
    headline: 'Not connected yet.',
    healthScore: null,
    metricCards: [],
    breakdowns: [],
    insights: [{ id: 'unsupported', label: 'Unsupported in v1', detail: reason, severity: 'info' }],
    evidence: [],
  };
}

function notConfiguredMetricStory(message: string): Pick<NodeSummaryResult, 'templateKey' | 'headline' | 'healthScore' | 'metricCards' | 'breakdowns' | 'insights' | 'evidence'> {
  return {
    templateKey: 'unsupported',
    headline: 'WorkOS is not configured for this company.',
    healthScore: null,
    metricCards: [],
    breakdowns: [],
    insights: [{ id: 'not_configured', label: 'WorkOS not configured', detail: message, severity: 'warning' }],
    evidence: [],
  };
}

function buildRollupBreakdowns(childSummaries: NodeSummaryResult[]): ProductsBreakdown[] {
  const statusCounts = childSummaries.reduce<Map<ErpNextProductsStatus, number>>((acc, summary) => {
    acc.set(summary.status, (acc.get(summary.status) ?? 0) + 1);
    return acc;
  }, new Map());
  return [{
    id: 'child_status',
    title: 'Child node connection status',
    items: [...statusCounts.entries()].map(([label, value]) => ({
      label: label.replace('_', ' '),
      value,
      tone: label === 'ready' ? 'good' : label === 'unsupported' ? 'neutral' : 'warning',
    })),
  }];
}

async function buildRollupSummary(companyId: string, nodeId: string, path: NodePathRow[], leaves: ProductsLeafRow[], limit: number): Promise<NodeSummaryResult> {
  const generatedAt = new Date().toISOString();
  const node = path[path.length - 1];
  const pathLabels = path.map(row => row.label);
  const creds = await resolveErpNextCreds(companyId);
  const childSummaries: NodeSummaryResult[] = [];

  for (const leaf of leaves) {
    const summary = await buildNodeSummary(companyId, leaf.id, limit);
    if (summary) childSummaries.push(summary);
  }

  const scoredChildren = childSummaries.filter(summary => typeof summary.healthScore === 'number');
  const averageScore = scoredChildren.length > 0
    ? Math.round(scoredChildren.reduce((total, summary) => total + (summary.healthScore ?? 0), 0) / scoredChildren.length)
    : null;
  const attentionChildren = childSummaries.filter(summary => summary.status === 'partial' || (summary.healthScore ?? 100) < 70);
  const unsupportedChildren = childSummaries.filter(summary => summary.status === 'unsupported');
  const readyChildren = childSummaries.filter(summary => summary.status === 'ready');
  const topRisk = attentionChildren[0] ?? unsupportedChildren[0];
  const status: ErpNextProductsStatus = childSummaries.length === 0
    ? 'unsupported'
    : attentionChildren.length > 0 || unsupportedChildren.length > 0
      ? 'partial'
      : 'ready';

  return {
    status,
    generatedAt,
    siteName: creds?.siteName,
    department: 'Products',
    nodeId,
    nodeLabel: node.label,
    path: pathLabels,
    mappingKey: `rollup:${nodeId}`,
    mappingLabel: node.label,
    templateKey: 'rollup',
    headline: topRisk
      ? `${topRisk.nodeLabel} needs the most attention inside this Product branch.`
      : `${readyChildren.length} child Product leaves are connected and summarized.`,
    healthScore: averageScore,
    sourceDoctypes: [...new Set(childSummaries.flatMap(summary => summary.sourceDoctypes))],
    metrics: [
      { label: 'Child leaves summarized', value: childSummaries.length },
      { label: 'Ready leaves', value: readyChildren.length },
      { label: 'Attention leaves', value: attentionChildren.length },
      { label: 'Unsupported leaves', value: unsupportedChildren.length },
    ],
    metricCards: [
      metricCard('children', 'Child leaves summarized', childSummaries.length, 'Leaf Product nodes rolled up under this parent.', 'neutral'),
      metricCard('ready', 'Ready leaves', readyChildren.length, 'Children with direct WorkOS metric panels.', readyChildren.length > 0 ? 'good' : 'neutral'),
      metricCard('attention', 'Needs attention', attentionChildren.length, 'Children with partial data, warnings, or lower health.', attentionChildren.length > 0 ? 'warning' : 'good'),
      metricCard('unsupported', 'Not connected yet', unsupportedChildren.length, 'Children intentionally unsupported in WorkOS Product v1.', unsupportedChildren.length > 0 ? 'neutral' : 'good'),
    ],
    breakdowns: buildRollupBreakdowns(childSummaries),
    insights: [
      { id: 'rollup', label: 'Parent rollup', detail: 'This parent panel summarizes descendant leaf metrics instead of reusing one WorkOS record list for every child.', severity: 'info' },
      ...(topRisk ? [{ id: 'top_risk', label: 'Needs attention first', detail: `${topRisk.nodeLabel}: ${topRisk.headline}`, severity: 'warning' as const }] : []),
    ],
    cards: [],
    evidence: [],
    childRollups: childSummaries.map(summary => ({
      nodeId: summary.nodeId,
      nodeLabel: summary.nodeLabel,
      mappingLabel: summary.mappingLabel,
      status: summary.status,
      templateKey: summary.templateKey,
      healthScore: summary.healthScore,
      headline: summary.headline,
    })),
    recommendedActions: topRisk
      ? [{ label: `Review ${topRisk.nodeLabel}`, reason: topRisk.headline, severity: topRisk.status === 'unsupported' ? 'info' : 'warning' }]
      : [],
    warnings: childSummaries.flatMap(summary => summary.warnings.map(warning => `${summary.nodeLabel}: ${warning}`)).slice(0, 8),
    unsupportedReason: childSummaries.length === 0 ? 'This Product parent has no descendant leaf nodes to roll up.' : undefined,
  };
}

export async function buildNodeSummary(companyId: string, nodeId: string, limit: number): Promise<NodeSummaryResult | null> {
  const path = await resolveNodePath(companyId, nodeId);
  if (!path) return null;

  const leaf = path[path.length - 1];
  if (!leaf || !(leaf.department_source_key === 'dept_product' || leaf.department_label === 'Product')) {
    return null;
  }

  const mappingKey = mappingKeyFromPath(path);
  const mappingDef = mappingKey ? MAPPING_BY_KEY.get(mappingKey) : undefined;
  const pathLabels = path.map(row => row.label);
  const generatedAt = new Date().toISOString();
  const descendantLeaves = await listDescendantLeaves(companyId, nodeId);
  if (descendantLeaves.length > 0) {
    return buildRollupSummary(companyId, nodeId, path, descendantLeaves, limit);
  }

  if (!mappingDef) {
    const reason = 'This Product node does not have a verified WorkOS mapping yet.';
    return {
      status: 'unsupported',
      generatedAt,
      department: 'Products',
      nodeId,
      nodeLabel: leaf.label,
      path: pathLabels,
      mappingKey: mappingKey ?? 'unmapped',
      mappingLabel: leaf.label,
      ...unsupportedMetricStory(reason),
      sourceDoctypes: [],
      metrics: [],
      cards: [],
      childRollups: [],
      recommendedActions: [],
      warnings: [],
      unsupportedReason: reason,
    };
  }

  const creds = await resolveErpNextCreds(companyId);
  if (!creds) {
    const message = await getErpNextNotConfiguredMessage(companyId);
    return {
      status: 'not_configured',
      generatedAt,
      department: 'Products',
      nodeId,
      nodeLabel: leaf.label,
      path: pathLabels,
      mappingKey: mappingDef.key,
      mappingLabel: mappingDef.label,
      ...notConfiguredMetricStory(message),
      sourceDoctypes: mappingDef.sourceDoctypes,
      metrics: [],
      cards: [],
      childRollups: [],
      recommendedActions: [],
      warnings: [message],
    };
  }

  const warnings: string[] = [];
  const reads = await Promise.all(mappingDef.reads.map(async definition => ({
    definition,
    result: await safeRead(creds, definition, limit, warnings),
  })));
  const failedCount = reads.filter(read => !read.result.ok).length;
  const status: ErpNextProductsStatus = failedCount > 0 ? 'partial' : 'ready';
  const story = buildMetricStory(mappingDef, reads);

  return {
    status,
    generatedAt,
    siteName: creds.siteName,
    department: 'Products',
    nodeId,
    nodeLabel: leaf.label,
    path: pathLabels,
    mappingKey: mappingDef.key,
    mappingLabel: mappingDef.label,
    templateKey: story.templateKey,
    headline: story.headline,
    healthScore: story.healthScore,
    sourceDoctypes: mappingDef.sourceDoctypes,
    metrics: metricsFor(reads),
    metricCards: story.metricCards,
    breakdowns: story.breakdowns,
    insights: story.insights,
    cards: cardsFor(reads),
    evidence: story.evidence,
    childRollups: [],
    recommendedActions: recommendationsFor(mappingDef, reads),
    warnings,
    unsupportedReason: undefined,
  };
}

export async function buildProductsAudit(companyId: string, limit: number) {
  const leaves = await listProductsLeaves(companyId);
  const summaries = await Promise.all(leaves.map(leaf => buildNodeSummary(companyId, leaf.id, limit)));
  const rows = summaries.filter((summary): summary is NodeSummaryResult => Boolean(summary)).map(summary => ({
    nodeId: summary.nodeId,
    nodeLabel: summary.nodeLabel,
    path: summary.path,
    mappingKey: summary.mappingKey,
    mappingLabel: summary.mappingLabel,
    templateKey: summary.templateKey,
    headline: summary.headline,
    healthScore: summary.healthScore,
    status: summary.status,
    sourceDoctypes: summary.sourceDoctypes,
    metricCards: summary.metricCards,
    recordCount: summary.evidence.length,
    childRollupCount: summary.childRollups?.length ?? 0,
    warningCount: summary.warnings.length,
    warnings: summary.warnings,
    unsupportedReason: summary.unsupportedReason,
  }));

  return {
    generatedAt: new Date().toISOString(),
    department: 'Products' as const,
    totalLeaves: rows.length,
    statusCounts: rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {}),
    rows,
  };
}

erpnextProductsRouter.get('/node-summary', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const nodeId = typeof req.query.nodeId === 'string' ? req.query.nodeId : '';
  if (!nodeId) return res.status(400).json({ error: 'node_id_required' });

  const limit = boundedNumber(req.query.limit, 50, 1, 100);
  const summary = await buildNodeSummary(companyId, nodeId, limit);
  if (!summary) return res.status(404).json({ error: 'products_node_not_found' });

  if (summary.status === 'not_configured') {
    return res.status(503).json({ error: 'erpnext_not_configured', message: summary.warnings[0] ?? 'WorkOS is not configured.' });
  }

  return res.json(summary);
});

erpnextProductsRouter.get('/audit', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const limit = boundedNumber(req.query.limit, 10, 1, 25);
  return res.json(await buildProductsAudit(companyId, limit));
});
