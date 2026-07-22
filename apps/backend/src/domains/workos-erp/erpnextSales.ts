import { Router } from 'express';
import { getErpNextRecords, type ErpNextCreds, type ErpNextGenericRecord } from '../../adapters/erpnext.js';
import { pool } from '../../db.js';
import {
  erpnextDeskListUrl,
  erpnextDeskNewUrl,
  erpnextDeskRecordUrl,
  type ErpNextDeskAction,
} from '../../lib/erpnextDeskLinks.js';
import { getErpNextNotConfiguredMessage, resolveErpNextCreds } from '../../lib/erpnextConnection.js';
import { authJwt } from '../../middleware/authJwt.js';
import { buildSalesMetricStory, buildSalesRecommendations, type SalesEvidenceAttribute } from './erpnextSalesStories.js';

// Sibling of erpnextOperations.ts — same node-aware summary pattern, adapted for the Sales
// department. Deliberately duplicated rather than sharing an engine with Operations (see
// project plan: avoids any regression risk to the working Operations panel). A generic
// metric-story builder is used for all mappings here (no department-specific story templates
// like Operations has) to keep this file's scope bounded.

export const erpnextSalesRouter = Router();

type ErpNextSalesStatus = 'ready' | 'not_configured' | 'unsupported' | 'partial';
type SalesTemplateKey = 'generic' | 'rollup' | 'unsupported';
type SalesTone = 'good' | 'neutral' | 'warning' | 'critical';

interface SalesMetric {
  label: string;
  value: number | string;
  unit?: string;
}

interface SalesCard {
  id: string;
  title: string;
  subtitle?: string;
  value?: string;
  status?: string;
  sourceDoctype: string;
  sourceId?: string;
  href?: string;
}

interface SalesMetricCard {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  description: string;
  tone: SalesTone;
}

interface SalesBreakdownItem {
  label: string;
  value: number | string;
  unit?: string;
  tone?: SalesTone;
}

interface SalesBreakdown {
  id: string;
  title: string;
  items: SalesBreakdownItem[];
}

interface SalesInsight {
  id: string;
  label: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
}

interface SalesEvidence {
  id: string;
  label: string;
  sourceDoctype: string;
  sourceId: string;
  detail?: string;
  status?: string;
  attributes?: SalesEvidenceAttribute[];
  href?: string;
}

interface SalesChildRollup {
  nodeId: string;
  nodeLabel: string;
  mappingLabel: string;
  status: ErpNextSalesStatus;
  templateKey: SalesTemplateKey;
  healthScore: number | null;
  headline: string;
}

interface SalesRecommendation {
  label: string;
  reason: string;
  severity: 'info' | 'warning' | 'critical';
}

interface ReadDefinition {
  doctype: string;
  fields: string[];
  filters?: unknown[];
}

interface MappingDefinition {
  key: string;
  label: string;
  level1Label: string;
  branchLabel: string;
  sourceDoctypes: string[];
  reads: ReadDefinition[];
  status?: Extract<ErpNextSalesStatus, 'partial' | 'unsupported'>;
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
  status: ErpNextSalesStatus;
  generatedAt: string;
  siteName?: string;
  department: 'Sales';
  nodeId: string;
  nodeLabel: string;
  path: string[];
  mappingKey: string;
  mappingLabel: string;
  templateKey: SalesTemplateKey;
  headline: string;
  healthScore: number | null;
  sourceDoctypes: string[];
  metrics: SalesMetric[];
  metricCards: SalesMetricCard[];
  breakdowns: SalesBreakdown[];
  insights: SalesInsight[];
  cards: SalesCard[];
  evidence: SalesEvidence[];
  childRollups?: SalesChildRollup[];
  erpnextActions?: ErpNextDeskAction[];
  recommendedActions: SalesRecommendation[];
  warnings: string[];
  unsupportedReason?: string;
}

interface SalesLeafRow {
  id: string;
  label: string;
}

const BASE_FIELDS = ['modified', 'creation'];
const STATUS_FIELDS = ['status', ...BASE_FIELDS];
const SUBMITTABLE_FIELDS = ['docstatus', ...BASE_FIELDS];
const SUBMITTABLE_STATUS_FIELDS = ['status', ...SUBMITTABLE_FIELDS];
const BUYING_FILTER = [['docstatus', '<', 2]];

function mapping(
  key: string,
  label: string,
  level1Label: string,
  branchLabel: string,
  sourceDoctypes: string[],
  reads: ReadDefinition[],
  status?: Extract<ErpNextSalesStatus, 'partial'>,
  partialReason?: string,
): MappingDefinition {
  return { key, label, level1Label, branchLabel, sourceDoctypes, reads, status, partialReason };
}

function unsupported(key: string, label: string, level1Label: string, branchLabel: string, unsupportedReason: string): MappingDefinition {
  return { key, label, level1Label, branchLabel, sourceDoctypes: [], reads: [], status: 'unsupported', unsupportedReason };
}

// One mapping entry per branch item under each Sales Level-1 node (bdtSpecTree.ts, dept_sales).
const MAPPINGS: MappingDefinition[] = [
  // Customers & Accounts
  mapping('sales_accounts_accounts', 'Accounts', 'Customers & Accounts', 'Accounts', ['Customer'], [
    { doctype: 'Customer', fields: ['customer_name', 'customer_group', 'territory', 'customer_type', ...BASE_FIELDS] },
  ]),
  mapping('sales_accounts_contacts', 'contacts', 'Customers & Accounts', 'contacts', ['Contact'], [
    { doctype: 'Contact', fields: ['first_name', 'last_name', 'email_id', 'phone', 'company_name', ...BASE_FIELDS] },
  ]),
  unsupported('sales_accounts_icp_segments', 'ICP segments', 'Customers & Accounts', 'ICP segments', 'ICP segmentation is a strategic construct not represented as a WorkOS doctype.'),
  unsupported('sales_accounts_account_plans', 'account plans', 'Customers & Accounts', 'account plans', 'Account plans are typically maintained in a CRM playbook tool, not WorkOS core.'),
  mapping('sales_accounts_customer_history', 'customer history', 'Customers & Accounts', 'customer history', ['Customer', 'Sales Order', 'Sales Invoice'], [
    { doctype: 'Customer', fields: ['customer_name', 'customer_group', 'territory', ...BASE_FIELDS] },
    { doctype: 'Sales Order', fields: ['customer', 'transaction_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Sales Invoice', fields: ['customer', 'posting_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  ], 'partial', 'Customer history is inferred from orders and invoices; full relationship timeline may live in CRM activity logs.'),
  unsupported('sales_accounts_buyer_committees', 'buyer committees', 'Customers & Accounts', 'buyer committees', 'Buyer committee mapping (multi-stakeholder org charts) is not a WorkOS doctype.'),

  // Pipeline & Opportunities
  mapping('sales_pipeline_leads', 'Leads', 'Pipeline & Opportunities', 'Leads', ['CRM Lead'], [
    { doctype: 'CRM Lead', fields: ['lead_name', 'status', 'source', 'organization', 'converted', ...BASE_FIELDS] },
  ]),
  mapping('sales_pipeline_opportunities', 'opportunities', 'Pipeline & Opportunities', 'opportunities', ['CRM Deal'], [
    { doctype: 'CRM Deal', fields: ['organization', 'status', 'deal_value', 'probability', ...BASE_FIELDS] },
  ]),
  mapping('sales_pipeline_deal_stages', 'deal stages', 'Pipeline & Opportunities', 'deal stages', ['CRM Deal'], [
    { doctype: 'CRM Deal', fields: ['status', 'deal_value', 'probability', ...BASE_FIELDS] },
  ], 'partial', 'Deal-stage view reuses CRM Deal.status (Link to CRM Deal Status); custom stage funnels beyond the configured statuses are not modeled.'),
  mapping('sales_pipeline_pipeline_coverage', 'pipeline coverage', 'Pipeline & Opportunities', 'pipeline coverage', ['CRM Deal'], [
    { doctype: 'CRM Deal', fields: ['deal_value', 'expected_deal_value', 'status', 'probability', 'expected_closure_date', ...BASE_FIELDS] },
  ], 'partial', 'Pipeline coverage ratio is approximated from open CRM Deal value; it does not account for external quota targets.'),
  unsupported('sales_pipeline_demos', 'demos', 'Pipeline & Opportunities', 'demos', 'Demo scheduling/tracking is not a native WorkOS CRM doctype.'),
  mapping('sales_pipeline_proposals', 'proposals', 'Pipeline & Opportunities', 'proposals', ['Quotation'], [
    { doctype: 'Quotation', fields: ['party_name', 'transaction_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  ], 'partial', 'WorkOS Quotation is used as a proxy for proposals; free-form proposal documents are not tracked.'),
  unsupported('sales_pipeline_negotiations', 'negotiations', 'Pipeline & Opportunities', 'negotiations', 'Negotiation activity/notes are not represented as a WorkOS doctype beyond Opportunity stage.'),

  // Revenue Operations
  unsupported('sales_revops_forecasting', 'Forecasting', 'Revenue Operations', 'Forecasting', 'Sales forecasting models are not natively stored as a WorkOS doctype in v1.'),
  mapping('sales_revops_territories', 'territories', 'Revenue Operations', 'territories', ['Territory'], [
    { doctype: 'Territory', fields: ['territory_name', 'parent_territory', 'is_group', ...BASE_FIELDS] },
  ]),
  unsupported('sales_revops_quotas', 'quotas', 'Revenue Operations', 'quotas', 'Sales quotas/targets are not a native WorkOS doctype.'),
  unsupported('sales_revops_sales_process', 'sales process', 'Revenue Operations', 'sales process', 'Sales process/playbook definitions are not represented in WorkOS core.'),
  unsupported('sales_revops_crm_hygiene', 'CRM hygiene', 'Revenue Operations', 'CRM hygiene', 'CRM hygiene scoring is a derived/analytics concept, not a WorkOS doctype.'),
  unsupported('sales_revops_sales_enablement', 'sales enablement', 'Revenue Operations', 'sales enablement', 'Sales enablement content is not represented in WorkOS core.'),

  // Partnerships & Channels — no ERPNext partner/channel doctype exists
  unsupported('sales_partnerships_resellers', 'Resellers', 'Partnerships & Channels', 'Resellers', 'WorkOS has no native partner/channel-relationship doctype; this is out of scope for v1.'),
  unsupported('sales_partnerships_distributors', 'distributors', 'Partnerships & Channels', 'distributors', 'WorkOS has no native partner/channel-relationship doctype; this is out of scope for v1.'),
  unsupported('sales_partnerships_channel_partners', 'channel partners', 'Partnerships & Channels', 'channel partners', 'WorkOS has no native partner/channel-relationship doctype; this is out of scope for v1.'),
  unsupported('sales_partnerships_referral_partners', 'referral partners', 'Partnerships & Channels', 'referral partners', 'WorkOS has no native partner/channel-relationship doctype; this is out of scope for v1.'),
  unsupported('sales_partnerships_alliances', 'alliances', 'Partnerships & Channels', 'alliances', 'WorkOS has no native partner/channel-relationship doctype; this is out of scope for v1.'),

  // Sales Performance
  mapping('sales_performance_revenue', 'Revenue', 'Sales Performance', 'Revenue', ['Sales Order', 'Sales Invoice'], [
    { doctype: 'Sales Order', fields: ['customer', 'transaction_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Sales Invoice', fields: ['customer', 'posting_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  ]),
  mapping('sales_performance_bookings', 'bookings', 'Sales Performance', 'bookings', ['Sales Order'], [
    { doctype: 'Sales Order', fields: ['customer', 'transaction_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  ]),
  mapping('sales_performance_win_rate', 'win rate', 'Sales Performance', 'win rate', ['CRM Deal'], [
    { doctype: 'CRM Deal', fields: ['status', 'deal_value', 'lost_reason', ...BASE_FIELDS] },
  ], 'partial', 'Win rate is derived from CRM Deal status counts (Won vs Lost) in the read window, not a lifetime aggregate.'),
  mapping('sales_performance_conversion', 'conversion', 'Sales Performance', 'conversion', ['CRM Lead', 'CRM Deal'], [
    { doctype: 'CRM Lead', fields: ['lead_name', 'status', 'source', 'converted', ...BASE_FIELDS] },
    { doctype: 'CRM Deal', fields: ['status', 'deal_value', ...BASE_FIELDS] },
  ], 'partial', 'Lead-to-deal conversion is approximated by counting records in the read window, not a true cohort funnel.'),
  mapping('sales_performance_sales_cycle', 'sales cycle', 'Sales Performance', 'sales cycle', ['CRM Deal'], [
    { doctype: 'CRM Deal', fields: ['expected_closure_date', 'closed_date', 'status', ...BASE_FIELDS] },
  ], 'partial', 'Sales cycle length is approximated from CRM Deal creation/closing dates in the read window.'),
  unsupported('sales_performance_quota_attainment', 'quota attainment', 'Sales Performance', 'quota attainment', 'Quota targets are not stored in WorkOS; attainment cannot be computed without a target source.'),
  mapping('sales_performance_pipeline_health', 'pipeline health', 'Sales Performance', 'pipeline health', ['CRM Deal'], [
    { doctype: 'CRM Deal', fields: ['status', 'deal_value', 'probability', ...BASE_FIELDS] },
  ], 'partial', 'Pipeline health rolls up open CRM Deal counts/value by status; it does not model velocity trends.'),

  // Sales Resources — no ERPNext enablement-asset doctype exists
  unsupported('sales_resources_decks', 'Decks', 'Sales Resources', 'Decks', 'Sales enablement assets (decks, battlecards, templates) are not represented in WorkOS core; use a DAM/enablement tool integration.'),
  unsupported('sales_resources_case_studies', 'case studies', 'Sales Resources', 'case studies', 'Sales enablement assets (decks, battlecards, templates) are not represented in WorkOS core; use a DAM/enablement tool integration.'),
  unsupported('sales_resources_price_sheets', 'price sheets', 'Sales Resources', 'price sheets', 'Sales enablement assets (decks, battlecards, templates) are not represented in WorkOS core; use a DAM/enablement tool integration.'),
  unsupported('sales_resources_proposal_templates', 'proposal templates', 'Sales Resources', 'proposal templates', 'Sales enablement assets (decks, battlecards, templates) are not represented in WorkOS core; use a DAM/enablement tool integration.'),
  unsupported('sales_resources_battlecards', 'battlecards', 'Sales Resources', 'battlecards', 'Sales enablement assets (decks, battlecards, templates) are not represented in WorkOS core; use a DAM/enablement tool integration.'),
  unsupported('sales_resources_scripts', 'scripts', 'Sales Resources', 'scripts', 'Sales enablement assets (decks, battlecards, templates) are not represented in WorkOS core; use a DAM/enablement tool integration.'),
];

const MAPPING_BY_KEY = new Map(MAPPINGS.map(entry => [entry.key, entry]));
const MAPPING_BY_METRIC_KEY = new Map(MAPPINGS.map(entry => [`spec_dept_sales_${entry.key}`, entry]));

const ACTION_DOCTYPES_BY_MAPPING: Record<string, Array<{ doctype: string; includeNew?: boolean; listLabel?: string; newLabel?: string }>> = {
  sales_accounts_accounts: [
    { doctype: 'Customer', listLabel: 'Open Customer list', newLabel: 'Create Customer' },
  ],
  sales_accounts_contacts: [
    { doctype: 'Contact', listLabel: 'Open Contact list', newLabel: 'Create Contact' },
  ],
  sales_accounts_customer_history: [
    { doctype: 'Customer', includeNew: false, listLabel: 'Open Customers' },
    { doctype: 'Sales Order', includeNew: false, listLabel: 'Open Sales Orders' },
    { doctype: 'Sales Invoice', includeNew: false, listLabel: 'Open Sales Invoices' },
  ],
  sales_pipeline_leads: [
    { doctype: 'CRM Lead', listLabel: 'Open Lead list', newLabel: 'Create Lead' },
  ],
  sales_pipeline_opportunities: [
    { doctype: 'CRM Deal', listLabel: 'Open Deal list', newLabel: 'Create Deal' },
  ],
  sales_pipeline_deal_stages: [
    { doctype: 'CRM Deal', listLabel: 'Open Deal list', newLabel: 'Create Deal' },
  ],
  sales_pipeline_pipeline_coverage: [
    { doctype: 'CRM Deal', listLabel: 'Open Deal list', newLabel: 'Create Deal' },
  ],
  sales_pipeline_proposals: [
    { doctype: 'Quotation', listLabel: 'Open Quotation list', newLabel: 'Create Quotation' },
  ],
  sales_revops_territories: [
    { doctype: 'Territory', listLabel: 'Open Territory list', newLabel: 'Create Territory' },
  ],
  sales_performance_revenue: [
    { doctype: 'Sales Order', listLabel: 'Open Sales Orders', newLabel: 'Create Sales Order' },
    { doctype: 'Sales Invoice', listLabel: 'Open Sales Invoices', newLabel: 'Create Sales Invoice' },
  ],
  sales_performance_bookings: [
    { doctype: 'Sales Order', listLabel: 'Open Sales Order list', newLabel: 'Create Sales Order' },
  ],
  sales_performance_win_rate: [
    { doctype: 'CRM Deal', listLabel: 'Open Deal list', newLabel: 'Create Deal' },
  ],
  sales_performance_conversion: [
    { doctype: 'CRM Lead', listLabel: 'Open Lead list', newLabel: 'Create Lead' },
    { doctype: 'CRM Deal', listLabel: 'Open Deal list', newLabel: 'Create Deal' },
  ],
  sales_performance_sales_cycle: [
    { doctype: 'CRM Deal', listLabel: 'Open Deal list', newLabel: 'Create Deal' },
  ],
  sales_performance_pipeline_health: [
    { doctype: 'CRM Deal', listLabel: 'Open Deal list', newLabel: 'Create Deal' },
  ],
};

// Purely additive: consumed by bdtNodeActivation.ts to resolve which Sales leaves are active.
export const MAPPING_SOURCE_LABELS: Record<string, { level1Label: string; branchLabel: string }> = Object.fromEntries(
  MAPPINGS.map(entry => [entry.key, { level1Label: entry.level1Label, branchLabel: entry.branchLabel }]),
);

// The doctypes each mapping actually queries (not the display labels in
// sourceDoctypes). The story builders in erpnextSalesStories.ts look rows up by
// these exact strings, so a mismatch renders an empty summary rather than an
// error — see the guard in test/salesStories.test.mjs.
export const MAPPING_SOURCE_DOCTYPES: Record<string, string[]> = Object.fromEntries(
  MAPPINGS.map(entry => [entry.key, [...new Set(entry.reads.map(read => read.doctype))]]),
);

export function listActiveBranchKeys(): Array<{ level1Label: string; branchLabel: string }> {
  return MAPPINGS.filter(entry => entry.status !== 'unsupported').map(entry => ({ level1Label: entry.level1Label, branchLabel: entry.branchLabel }));
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.round(next)));
}

function isOpenStatus(status: unknown): boolean {
  if (typeof status !== 'string' || !status) return true;
  return !/closed|cancelled|completed|stopped|delivered|received|billed|resolved|lost|won/i.test(status);
}

function isProblemStatus(status: unknown): boolean {
  return typeof status === 'string' && /fail|reject|cancel|overdue|late|hold|stopped|lost/i.test(status);
}

function displayValue(record: ErpNextGenericRecord): string | undefined {
  // CRM Deal/CRM Lead use their own field names (deal_value, expected_closure_date)
  // rather than the native Opportunity ones, so both sets are listed here.
  const keys = ['posting_date', 'transaction_date', 'schedule_date', 'expected_closing', 'expected_closure_date', 'closed_date', 'modified', 'creation', 'grand_total', 'opportunity_amount', 'deal_value', 'expected_deal_value'];
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return undefined;
}

function normalizeErpNextReadError(doctype: string, message: string): string {
  const fieldMatch = message.match(/Field not permitted in query:\s*([A-Za-z0-9_]+)/i);
  if (fieldMatch?.[1]) {
    return `${doctype}: field "${fieldMatch[1]}" is not readable on this WorkOS site.`;
  }
  if (/DocType.*not found|doctype.*not found/i.test(message)) {
    return `${doctype}: doctype is not installed or not available on this WorkOS site.`;
  }
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
    return {
      ok: true,
      rows: await getErpNextRecords(creds, definition.doctype, definition.fields, limit, definition.filters ?? [], 1000),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const normalized = normalizeErpNextReadError(definition.doctype, message);
    warnings.push(normalized);
    return { ok: false, rows: [], error: normalized };
  }
}

function erpnextActionsFor(creds: ErpNextCreds, mappingDef: MappingDefinition): ErpNextDeskAction[] {
  const rules = ACTION_DOCTYPES_BY_MAPPING[mappingDef.key] ?? mappingDef.sourceDoctypes.map(doctype => ({ doctype }));
  return rules.flatMap(rule => {
    const actions: ErpNextDeskAction[] = [{
      id: `${rule.doctype}:list`,
      label: rule.listLabel ?? `Open ${rule.doctype} list`,
      kind: 'list',
      doctype: rule.doctype,
      href: erpnextDeskListUrl(creds, rule.doctype),
    }];
    if (rule.includeNew !== false) {
      actions.push({
        id: `${rule.doctype}:new`,
        label: rule.newLabel ?? `Create ${rule.doctype}`,
        kind: 'new',
        doctype: rule.doctype,
        href: erpnextDeskNewUrl(creds, rule.doctype),
      });
    }
    return actions;
  });
}

function evidenceRecordDoctype(item: Pick<SalesEvidence, 'sourceDoctype' | 'sourceId'>): string | null {
  if (!item.sourceId) return null;
  if (item.sourceDoctype === 'Customer rollup') return 'Customer';
  return item.sourceDoctype;
}

function linkEvidence(creds: ErpNextCreds, evidence: SalesEvidence[]): SalesEvidence[] {
  return evidence.map(item => {
    const doctype = evidenceRecordDoctype(item);
    if (!doctype) return item;
    return { ...item, href: erpnextDeskRecordUrl(creds, doctype, item.sourceId) };
  });
}

function cardsFor(creds: ErpNextCreds, reads: Array<{ definition: ReadDefinition; result: ReadResult }>): SalesCard[] {
  return reads.flatMap(({ definition, result }) => result.rows.slice(0, 4).map(record => ({
    id: `${definition.doctype}:${record.name}`,
    title: record.name,
    subtitle: String(record.customer_name ?? record.customer ?? record.lead_name ?? record.party_name ?? record.territory_name ?? record.organization ?? record.organization_name ?? definition.doctype),
    value: displayValue(record),
    status: typeof record.status === 'string' ? record.status : (typeof record.sales_stage === 'string' ? record.sales_stage : undefined),
    sourceDoctype: definition.doctype,
    sourceId: record.name,
    href: erpnextDeskRecordUrl(creds, definition.doctype, record.name),
  }))).slice(0, 10);
}

function metricsFor(reads: Array<{ definition: ReadDefinition; result: ReadResult }>): SalesMetric[] {
  const successful = reads.filter(read => read.result.ok);
  const rows = successful.flatMap(read => read.result.rows);
  const openRows = rows.filter(row => isOpenStatus(row.status ?? row.sales_stage));
  const problemRows = rows.filter(row => isProblemStatus(row.status ?? row.sales_stage));
  const metrics: SalesMetric[] = [
    { label: 'WorkOS doctypes read', value: successful.length },
    { label: 'Records returned', value: rows.length },
    { label: 'Open records', value: openRows.length },
  ];
  if (problemRows.length > 0) metrics.push({ label: 'Attention statuses', value: problemRows.length });
  return metrics;
}

function metricCard(id: string, label: string, value: number | string, description: string, tone: SalesTone = 'neutral', unit?: string): SalesMetricCard {
  return { id, label, value, unit, description, tone };
}

async function resolveNodePath(companyId: string, nodeId: string): Promise<NodePathRow[] | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nodeId)) return null;
  const { rows } = await pool.query<NodePathRow>(
    `WITH RECURSIVE node_path AS (
       SELECT n.id,
              n.parent_node_id,
              n.label,
              n.node_type,
              n.node_level,
              n.metadata,
              ml.metric_key,
              0 AS depth,
              d.id AS department_id,
              d.label AS department_label,
              d.source_key AS department_source_key
         FROM public.department_bdt_nodes n
         JOIN public.departments d
           ON d.id = n.department_id
          AND d.company_id = n.company_id
         LEFT JOIN public.department_metric_links ml
           ON ml.node_id = n.id
        WHERE n.id = $1
          AND n.company_id = $2
       UNION ALL
       SELECT parent.id,
              parent.parent_node_id,
              parent.label,
              parent.node_type,
              parent.node_level,
              parent.metadata,
              parent_ml.metric_key,
              child.depth + 1 AS depth,
              child.department_id,
              child.department_label,
              child.department_source_key
         FROM public.department_bdt_nodes parent
         JOIN node_path child
           ON child.parent_node_id = parent.id
         LEFT JOIN public.department_metric_links parent_ml
           ON parent_ml.node_id = parent.id
     )
     SELECT *
       FROM node_path
      ORDER BY depth DESC`,
    [nodeId, companyId],
  );
  return rows.length > 0 ? rows : null;
}

async function listSalesLeaves(companyId: string): Promise<SalesLeafRow[]> {
  const { rows } = await pool.query<SalesLeafRow>(
    `SELECT n.id, n.label
       FROM public.department_bdt_nodes n
       JOIN public.departments d
         ON d.id = n.department_id
        AND d.company_id = n.company_id
      WHERE n.company_id = $1
        AND (d.source_key = 'dept_sales' OR d.label = 'Sales')
        AND NOT EXISTS (
          SELECT 1
            FROM public.department_bdt_nodes child
           WHERE child.parent_node_id = n.id
             AND child.company_id = n.company_id
        )
      ORDER BY n.sort_order ASC, n.label ASC`,
    [companyId],
  );
  return rows;
}

async function listDescendantLeaves(companyId: string, nodeId: string): Promise<SalesLeafRow[]> {
  const { rows } = await pool.query<SalesLeafRow>(
    `WITH RECURSIVE descendants AS (
       SELECT n.id,
              n.label,
              n.parent_node_id,
              n.sort_order
         FROM public.department_bdt_nodes n
        WHERE n.parent_node_id = $1
          AND n.company_id = $2
       UNION ALL
       SELECT child.id,
              child.label,
              child.parent_node_id,
              child.sort_order
         FROM public.department_bdt_nodes child
         JOIN descendants parent
           ON child.parent_node_id = parent.id
        WHERE child.company_id = $2
     )
     SELECT d.id, d.label
       FROM descendants d
      WHERE NOT EXISTS (
        SELECT 1
          FROM public.department_bdt_nodes child
         WHERE child.parent_node_id = d.id
           AND child.company_id = $2
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
  'Customers & Accounts': 'accounts',
  'Pipeline & Opportunities': 'pipeline',
  'Revenue Operations': 'revops',
  'Partnerships & Channels': 'partnerships',
  'Sales Performance': 'performance',
  'Sales Resources': 'resources',
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
  return prefix ? `sales_${prefix}_${slug(branchLabel)}` : null;
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

function buildRollupBreakdowns(childSummaries: NodeSummaryResult[]): SalesBreakdown[] {
  const statusCounts = childSummaries.reduce<Map<ErpNextSalesStatus, number>>((acc, summary) => {
    acc.set(summary.status, (acc.get(summary.status) ?? 0) + 1);
    return acc;
  }, new Map());
  return [
    {
      id: 'child_status',
      title: 'Child node connection status',
      items: [...statusCounts.entries()].map(([label, value]) => ({
        label: label.replace('_', ' '),
        value,
        tone: label === 'ready' ? 'good' : label === 'unsupported' ? 'neutral' : 'warning',
      })),
    },
  ];
}

async function buildRollupSummary(companyId: string, nodeId: string, path: NodePathRow[], leaves: SalesLeafRow[], limit: number): Promise<NodeSummaryResult> {
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
  const status: ErpNextSalesStatus = childSummaries.length === 0
    ? 'unsupported'
    : attentionChildren.length > 0 || unsupportedChildren.length > 0
      ? 'partial'
      : 'ready';

  return {
    status,
    generatedAt,
    siteName: creds?.siteName,
    department: 'Sales',
    nodeId,
    nodeLabel: node.label,
    path: pathLabels,
    mappingKey: `rollup:${nodeId}`,
    mappingLabel: node.label,
    templateKey: 'rollup',
    headline: topRisk
      ? `${topRisk.nodeLabel} needs the most attention inside this Sales branch.`
      : `${readyChildren.length} child Sales leaves are connected and summarized.`,
    healthScore: averageScore,
    sourceDoctypes: [...new Set(childSummaries.flatMap(summary => summary.sourceDoctypes))],
    metrics: [
      { label: 'Child leaves summarized', value: childSummaries.length },
      { label: 'Ready leaves', value: readyChildren.length },
      { label: 'Attention leaves', value: attentionChildren.length },
      { label: 'Unsupported leaves', value: unsupportedChildren.length },
    ],
    metricCards: [
      metricCard('children', 'Child leaves summarized', childSummaries.length, 'Leaf Sales nodes rolled up under this parent.', 'neutral'),
      metricCard('ready', 'Ready leaves', readyChildren.length, 'Children with direct WorkOS metric panels.', readyChildren.length > 0 ? 'good' : 'neutral'),
      metricCard('attention', 'Needs attention', attentionChildren.length, 'Children with partial data, warnings, or lower health.', attentionChildren.length > 0 ? 'warning' : 'good'),
      metricCard('unsupported', 'Not connected yet', unsupportedChildren.length, 'Children intentionally unsupported in WorkOS Sales v1.', unsupportedChildren.length > 0 ? 'neutral' : 'good'),
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
    unsupportedReason: childSummaries.length === 0 ? 'This Sales parent has no descendant leaf nodes to roll up.' : undefined,
  };
}

export async function buildNodeSummary(companyId: string, nodeId: string, limit: number): Promise<NodeSummaryResult | null> {
  const path = await resolveNodePath(companyId, nodeId);
  if (!path) return null;

  const leaf = path[path.length - 1];
  if (!leaf || !(leaf.department_source_key === 'dept_sales' || leaf.department_label === 'Sales')) {
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
    const reason = 'This Sales node does not have a verified WorkOS mapping yet.';
    return {
      status: 'unsupported',
      generatedAt,
      department: 'Sales',
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

  if (mappingDef.status === 'unsupported') {
    const reason = mappingDef.unsupportedReason ?? 'This Sales node is not connected to WorkOS Sales v1.';
    return {
      status: 'unsupported',
      generatedAt,
      department: 'Sales',
      nodeId,
      nodeLabel: leaf.label,
      path: pathLabels,
      mappingKey: mappingDef.key,
      mappingLabel: mappingDef.label,
      ...unsupportedMetricStory(reason),
      sourceDoctypes: mappingDef.sourceDoctypes,
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
      department: 'Sales',
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
  const status: ErpNextSalesStatus = failedCount > 0 || mappingDef.status === 'partial' ? 'partial' : 'ready';
  const story = buildSalesMetricStory(mappingDef, reads);

  return {
    status,
    generatedAt,
    siteName: creds.siteName,
    department: 'Sales',
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
    cards: cardsFor(creds, reads),
    evidence: linkEvidence(creds, story.evidence),
    childRollups: [],
    erpnextActions: erpnextActionsFor(creds, mappingDef),
    recommendedActions: buildSalesRecommendations(mappingDef, reads),
    warnings,
    unsupportedReason: undefined,
  };
}

export async function buildSalesAudit(companyId: string, limit: number) {
  const leaves = await listSalesLeaves(companyId);
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
    department: 'Sales' as const,
    totalLeaves: rows.length,
    statusCounts: rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {}),
    rows,
  };
}

erpnextSalesRouter.get('/node-summary', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const nodeId = typeof req.query.nodeId === 'string' ? req.query.nodeId : '';
  if (!nodeId) return res.status(400).json({ error: 'node_id_required' });

  const limit = boundedNumber(req.query.limit, 500, 1, 1000);
  const summary = await buildNodeSummary(companyId, nodeId, limit);
  if (!summary) return res.status(404).json({ error: 'sales_node_not_found' });

  if (summary.status === 'not_configured') {
    return res.status(503).json({ error: 'erpnext_not_configured', message: summary.warnings[0] ?? 'WorkOS is not configured.' });
  }

  return res.json(summary);
});

erpnextSalesRouter.get('/audit', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const limit = boundedNumber(req.query.limit, 100, 1, 500);
  return res.json(await buildSalesAudit(companyId, limit));
});
