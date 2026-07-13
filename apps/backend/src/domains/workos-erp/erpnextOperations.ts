import { Router } from 'express';
import { getErpNextRecords, type ErpNextCreds, type ErpNextGenericRecord } from '../../adapters/erpnext.js';
import { pool } from '../../db.js';
import { getErpNextNotConfiguredMessage, resolveErpNextCreds } from '../../lib/erpnextConnection.js';
import { authJwt } from '../../middleware/authJwt.js';

export const erpnextOperationsRouter = Router();

type ErpNextOpsStatus = 'ready' | 'not_configured' | 'unsupported' | 'partial';
type OpsTemplateKey =
  | 'procurement'
  | 'inventory_warehousing'
  | 'logistics_shipping'
  | 'service_delivery'
  | 'quality'
  | 'manufacturing_lean'
  | 'assets_resources'
  | 'rollup'
  | 'unsupported';
type OpsTone = 'good' | 'neutral' | 'warning' | 'critical';

interface OpsMetric {
  label: string;
  value: number | string;
  unit?: string;
}

interface OpsCard {
  id: string;
  title: string;
  subtitle?: string;
  value?: string;
  status?: string;
  sourceDoctype: string;
  sourceId?: string;
}

interface OpsMetricCard {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  description: string;
  tone: OpsTone;
}

interface OpsBreakdownItem {
  label: string;
  value: number | string;
  unit?: string;
  tone?: OpsTone;
}

interface OpsBreakdown {
  id: string;
  title: string;
  items: OpsBreakdownItem[];
}

interface OpsInsight {
  id: string;
  label: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
}

interface OpsEvidence {
  id: string;
  label: string;
  sourceDoctype: string;
  sourceId: string;
  detail?: string;
  status?: string;
}

interface OpsChildRollup {
  nodeId: string;
  nodeLabel: string;
  mappingLabel: string;
  status: ErpNextOpsStatus;
  templateKey: OpsTemplateKey;
  healthScore: number | null;
  headline: string;
}

interface OpsRecommendation {
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
  sourceDoctypes: string[];
  reads: ReadDefinition[];
  status?: Extract<ErpNextOpsStatus, 'partial' | 'unsupported'>;
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
  status: ErpNextOpsStatus;
  generatedAt: string;
  siteName?: string;
  department: 'Operations';
  nodeId: string;
  nodeLabel: string;
  path: string[];
  mappingKey: string;
  mappingLabel: string;
  templateKey: OpsTemplateKey;
  headline: string;
  healthScore: number | null;
  sourceDoctypes: string[];
  metrics: OpsMetric[];
  metricCards: OpsMetricCard[];
  breakdowns: OpsBreakdown[];
  insights: OpsInsight[];
  cards: OpsCard[];
  evidence: OpsEvidence[];
  childRollups?: OpsChildRollup[];
  recommendedActions: OpsRecommendation[];
  warnings: string[];
  unsupportedReason?: string;
}

interface OperationsLeafRow {
  id: string;
  label: string;
}

const BASE_FIELDS = ['modified', 'creation'];
const STATUS_FIELDS = ['status', ...BASE_FIELDS];
const SUBMITTABLE_FIELDS = ['docstatus', ...BASE_FIELDS];
const SUBMITTABLE_STATUS_FIELDS = ['status', ...SUBMITTABLE_FIELDS];
const BUYING_FILTER = [['docstatus', '<', 2]];

const SUPPLY_CHAIN_READS = {
  deliveryNotes: { doctype: 'Delivery Note', fields: ['customer', 'posting_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  pickLists: { doctype: 'Pick List', fields: ['purpose', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  shipments: { doctype: 'Shipment', fields: STATUS_FIELDS },
  deliveryTrips: { doctype: 'Delivery Trip', fields: ['departure_time', 'driver', 'vehicle', ...STATUS_FIELDS] },
  stockEntries: { doctype: 'Stock Entry', fields: ['stock_entry_type', 'posting_date', ...SUBMITTABLE_FIELDS], filters: BUYING_FILTER },
  materialRequests: { doctype: 'Material Request', fields: ['material_request_type', 'transaction_date', 'schedule_date', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  purchaseOrders: { doctype: 'Purchase Order', fields: ['supplier', 'transaction_date', 'schedule_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  purchaseReceipts: { doctype: 'Purchase Receipt', fields: ['supplier', 'posting_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
} satisfies Record<string, ReadDefinition>;

const MAPPINGS: MappingDefinition[] = [
  mapping('ops_delivery_delivery_processes', 'Delivery processes', ['Sales Order', 'Delivery Note', 'Pick List', 'Shipment'], [
    { doctype: 'Sales Order', fields: ['customer', 'transaction_date', 'delivery_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    SUPPLY_CHAIN_READS.deliveryNotes,
    SUPPLY_CHAIN_READS.pickLists,
    SUPPLY_CHAIN_READS.shipments,
  ]),
  mapping('ops_delivery_slas', 'SLAs', ['Service Level Agreement', 'Issue'], [
    { doctype: 'Service Level Agreement', fields: ['enabled', 'default_service_level_agreement', ...BASE_FIELDS] },
    { doctype: 'Issue', fields: ['priority', 'issue_type', 'opening_date', ...STATUS_FIELDS] },
  ]),
  mapping('ops_delivery_service_requests', 'service requests', ['Issue', 'Warranty Claim', 'Maintenance Visit'], [
    { doctype: 'Issue', fields: ['priority', 'issue_type', 'opening_date', ...STATUS_FIELDS] },
    { doctype: 'Warranty Claim', fields: ['customer', 'complaint_date', ...STATUS_FIELDS] },
    { doctype: 'Maintenance Visit', fields: ['customer', 'mntc_date', ...STATUS_FIELDS] },
  ], 'partial', 'WorkOS support/service records are available, but field-ops context may live in external service tools.'),
  mapping('ops_delivery_fulfillment', 'fulfillment', ['Sales Order', 'Delivery Note', 'Pick List', 'Shipment'], [
    { doctype: 'Sales Order', fields: ['customer', 'transaction_date', 'delivery_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    SUPPLY_CHAIN_READS.deliveryNotes,
    SUPPLY_CHAIN_READS.pickLists,
    SUPPLY_CHAIN_READS.shipments,
  ]),
  mapping('ops_delivery_field_operations', 'field operations', ['Delivery Trip', 'Maintenance Visit', 'Maintenance Schedule'], [
    SUPPLY_CHAIN_READS.deliveryTrips,
    { doctype: 'Maintenance Visit', fields: ['customer', 'mntc_date', ...STATUS_FIELDS] },
    { doctype: 'Maintenance Schedule', fields: ['customer', 'transaction_date', ...STATUS_FIELDS] },
  ], 'partial', 'Field work can be represented in WorkOS, but route optimization and field-force tools may be external.'),

  mapping('ops_supply_chain_inventory', 'Inventory', ['Item', 'Bin', 'Stock Entry', 'Stock Reconciliation', 'Stock Reservation', 'Batch', 'Serial Number', 'Quality Inspection'], [
    { doctype: 'Item', fields: ['item_code', 'item_name', 'stock_uom', ...BASE_FIELDS] },
    { doctype: 'Bin', fields: ['item_code', 'warehouse', 'actual_qty', ...BASE_FIELDS] },
    SUPPLY_CHAIN_READS.stockEntries,
    { doctype: 'Stock Reconciliation', fields: ['purpose', 'posting_date', ...SUBMITTABLE_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Stock Reservation Entry', fields: ['item_code', 'warehouse', 'voucher_type', ...STATUS_FIELDS] },
    { doctype: 'Batch', fields: ['item', 'expiry_date', ...BASE_FIELDS] },
    { doctype: 'Serial No', fields: ['item_code', 'warehouse', ...STATUS_FIELDS] },
    { doctype: 'Quality Inspection', fields: ['inspection_type', 'reference_type', 'reference_name', ...STATUS_FIELDS] },
  ]),
  mapping('ops_supply_chain_logistics', 'logistics', ['Delivery Note', 'Pick List', 'Shipment', 'Delivery Trip', 'Stock Entry'], [
    SUPPLY_CHAIN_READS.deliveryNotes,
    SUPPLY_CHAIN_READS.pickLists,
    SUPPLY_CHAIN_READS.shipments,
    SUPPLY_CHAIN_READS.deliveryTrips,
    SUPPLY_CHAIN_READS.stockEntries,
  ]),
  mapping('ops_supply_chain_shipping', 'shipping', ['Delivery Note', 'Shipment', 'Delivery Trip'], [
    SUPPLY_CHAIN_READS.deliveryNotes,
    SUPPLY_CHAIN_READS.shipments,
    SUPPLY_CHAIN_READS.deliveryTrips,
  ]),
  mapping('ops_supply_chain_warehousing', 'warehousing', ['Warehouse', 'Bin', 'Stock Entry', 'Stock Reconciliation', 'Stock Reservation'], [
    { doctype: 'Warehouse', fields: ['warehouse_name', 'is_group', 'disabled', ...BASE_FIELDS] },
    { doctype: 'Bin', fields: ['item_code', 'warehouse', 'actual_qty', ...BASE_FIELDS] },
    SUPPLY_CHAIN_READS.stockEntries,
    { doctype: 'Stock Reconciliation', fields: ['purpose', 'posting_date', ...SUBMITTABLE_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Stock Reservation Entry', fields: ['item_code', 'warehouse', 'voucher_type', ...STATUS_FIELDS] },
  ]),
  mapping('ops_supply_chain_routing', 'routing', ['Delivery Trip'], [SUPPLY_CHAIN_READS.deliveryTrips], 'partial', 'WorkOS Delivery Trip is read directly; route optimization itself is not inferred in v1.'),
  mapping('ops_supply_chain_procurement_flow', 'procurement flow', ['Material Request', 'Purchase Order', 'Purchase Receipt', 'Request for Quotation', 'Supplier Quotation'], [
    SUPPLY_CHAIN_READS.materialRequests,
    SUPPLY_CHAIN_READS.purchaseOrders,
    SUPPLY_CHAIN_READS.purchaseReceipts,
    { doctype: 'Request for Quotation', fields: ['transaction_date', 'schedule_date', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Supplier Quotation', fields: ['supplier', 'transaction_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  ]),

  mapping('ops_vendors_vendor_onboarding', 'Vendor onboarding', ['Supplier', 'Supplier Group', 'Contact', 'Address'], [
    { doctype: 'Supplier', fields: ['supplier_name', 'supplier_group', 'disabled', ...BASE_FIELDS] },
    { doctype: 'Supplier Group', fields: ['is_group', ...BASE_FIELDS] },
    { doctype: 'Contact', fields: ['first_name', 'last_name', 'email_id', 'phone', ...BASE_FIELDS] },
    { doctype: 'Address', fields: ['address_title', 'address_type', 'city', 'country', ...BASE_FIELDS] },
  ], 'partial', 'Supplier masters are visible, but onboarding workflow completeness may depend on custom fields.'),
  mapping('ops_vendors_pos', 'POs', ['Purchase Order', 'Purchase Receipt', 'Purchase Invoice'], [
    SUPPLY_CHAIN_READS.purchaseOrders,
    SUPPLY_CHAIN_READS.purchaseReceipts,
    { doctype: 'Purchase Invoice', fields: ['supplier', 'posting_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  ]),
  mapping('ops_vendors_contracts', 'contracts', ['Supplier Quotation', 'Blanket Order', 'Purchase Order'], [
    { doctype: 'Supplier Quotation', fields: ['supplier', 'transaction_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Blanket Order', fields: ['supplier', 'from_date', 'to_date', ...SUBMITTABLE_FIELDS], filters: BUYING_FILTER },
    SUPPLY_CHAIN_READS.purchaseOrders,
  ], 'partial', 'WorkOS can expose quotations, blanket orders, and POs; contract lifecycle semantics may be custom.'),
  mapping('ops_vendors_quality', 'quality', ['Quality Inspection', 'Purchase Receipt', 'Supplier Scorecard'], [
    { doctype: 'Quality Inspection', fields: ['inspection_type', 'reference_type', 'reference_name', ...STATUS_FIELDS] },
    SUPPLY_CHAIN_READS.purchaseReceipts,
    { doctype: 'Supplier Scorecard', fields: ['supplier', ...STATUS_FIELDS] },
  ], 'partial', 'Supplier quality is inferred from inspections and scorecards where those records exist.'),
  mapping('ops_vendors_service_levels', 'service levels', ['Supplier Scorecard'], [
    { doctype: 'Supplier Scorecard', fields: ['supplier', ...STATUS_FIELDS] },
  ], 'partial', 'WorkOS supplier scorecards are available, but explicit service-level agreements may be external or custom.'),
  mapping('ops_vendors_renewals', 'renewals', ['Blanket Order', 'Purchase Order', 'Supplier'], [
    { doctype: 'Blanket Order', fields: ['supplier', 'from_date', 'to_date', ...SUBMITTABLE_FIELDS], filters: BUYING_FILTER },
    SUPPLY_CHAIN_READS.purchaseOrders,
    { doctype: 'Supplier', fields: ['supplier_name', 'supplier_group', 'disabled', ...BASE_FIELDS] },
  ], 'partial', 'Renewals are inferred from supplier and order records unless a contract renewal doctype exists.'),

  unsupported('ops_process_sops', 'SOPs', ['Docs', 'BPM tools'], 'SOPs are better suited to docs or BPM integrations than WorkOS core.'),
  unsupported('ops_process_automation', 'automation', ['RPA', 'workflow platforms'], 'Automation is better suited to workflow/RPA integrations than WorkOS core.'),
  mapping('ops_process_quality_improvement', 'quality improvement', ['Quality Inspection', 'Issue'], [
    { doctype: 'Quality Inspection', fields: ['inspection_type', 'reference_type', 'reference_name', ...STATUS_FIELDS] },
    { doctype: 'Issue', fields: ['priority', 'issue_type', ...STATUS_FIELDS] },
  ], 'partial', 'Corrective actions may require custom WorkOS doctypes; v1 shows inspections and issues only.'),
  mapping('ops_process_bottlenecks', 'bottlenecks', ['Work Order', 'Job Card'], [
    { doctype: 'Work Order', fields: ['production_item', 'qty', 'produced_qty', 'planned_start_date', 'planned_end_date', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Job Card', fields: ['work_order', 'operation', 'for_quantity', 'total_completed_qty', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  ], 'partial', 'Manufacturing bottlenecks are shown only when WorkOS manufacturing doctypes are installed and populated.'),
  unsupported('ops_process_workflows', 'workflows', ['Frappe Workflow'], 'Generic workflow state is not connected in v1; use a BPM/workflow integration or verified Frappe Workflow metadata.'),
  mapping('ops_process_lean_processes', 'lean processes', ['Work Order', 'Job Card', 'Quality Inspection'], [
    { doctype: 'Work Order', fields: ['production_item', 'qty', 'produced_qty', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Job Card', fields: ['work_order', 'operation', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Quality Inspection', fields: ['inspection_type', 'reference_type', 'reference_name', ...STATUS_FIELDS] },
  ], 'partial', 'Lean-process health is inferred from manufacturing and quality records only.'),

  mapping('ops_performance_sla_adherence', 'SLA adherence', ['Service Level Agreement', 'Issue', 'Delivery Note'], [
    { doctype: 'Service Level Agreement', fields: ['enabled', 'default_service_level_agreement', ...BASE_FIELDS] },
    { doctype: 'Issue', fields: ['priority', 'opening_date', ...STATUS_FIELDS] },
    SUPPLY_CHAIN_READS.deliveryNotes,
  ]),
  mapping('ops_performance_cost', 'cost', ['Purchase Order', 'Purchase Receipt', 'Purchase Invoice', 'Landed Cost Voucher'], [
    SUPPLY_CHAIN_READS.purchaseOrders,
    SUPPLY_CHAIN_READS.purchaseReceipts,
    { doctype: 'Purchase Invoice', fields: ['supplier', 'posting_date', 'grand_total', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Landed Cost Voucher', fields: ['posting_date', 'total_taxes_and_charges', ...SUBMITTABLE_FIELDS], filters: BUYING_FILTER },
  ], 'partial', 'Cost analytics may overlap Finance; v1 only surfaces Operations-adjacent purchasing and landed-cost records.'),
  mapping('ops_performance_quality', 'quality', ['Quality Inspection', 'Issue', 'Supplier Scorecard'], [
    { doctype: 'Quality Inspection', fields: ['inspection_type', 'reference_type', 'reference_name', ...STATUS_FIELDS] },
    { doctype: 'Issue', fields: ['priority', 'issue_type', ...STATUS_FIELDS] },
    { doctype: 'Supplier Scorecard', fields: ['supplier', ...STATUS_FIELDS] },
  ]),
  mapping('ops_performance_throughput', 'throughput', ['Delivery Note', 'Pick List', 'Purchase Receipt', 'Work Order'], [
    SUPPLY_CHAIN_READS.deliveryNotes,
    SUPPLY_CHAIN_READS.pickLists,
    SUPPLY_CHAIN_READS.purchaseReceipts,
    { doctype: 'Work Order', fields: ['production_item', 'qty', 'produced_qty', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  ], 'partial', 'Throughput uses available delivery, receipt, and manufacturing records without writing rollups back to WorkOS.'),
  mapping('ops_performance_cycle_time', 'cycle time', ['Material Request', 'Purchase Order', 'Purchase Receipt', 'Delivery Note', 'Work Order'], [
    SUPPLY_CHAIN_READS.materialRequests,
    SUPPLY_CHAIN_READS.purchaseOrders,
    SUPPLY_CHAIN_READS.purchaseReceipts,
    SUPPLY_CHAIN_READS.deliveryNotes,
    { doctype: 'Work Order', fields: ['planned_start_date', 'planned_end_date', 'actual_start_date', 'actual_end_date', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
  ], 'partial', 'Cycle time is approximated from available transaction dates in v1.'),
  mapping('ops_performance_utilization', 'utilization', ['Work Order', 'Job Card', 'Asset'], [
    { doctype: 'Work Order', fields: ['production_item', 'qty', 'produced_qty', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Job Card', fields: ['work_order', 'operation', 'total_completed_qty', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Asset', fields: ['asset_name', 'location', ...STATUS_FIELDS] },
  ], 'partial', 'Utilization requires manufacturing or asset records; empty WorkOS sites will show no utilization records.'),
  mapping('ops_performance_error_rate', 'error rate', ['Quality Inspection', 'Issue', 'Delivery Note', 'Purchase Receipt'], [
    { doctype: 'Quality Inspection', fields: ['inspection_type', 'reference_type', 'reference_name', ...STATUS_FIELDS] },
    { doctype: 'Issue', fields: ['priority', 'issue_type', ...STATUS_FIELDS] },
    SUPPLY_CHAIN_READS.deliveryNotes,
    SUPPLY_CHAIN_READS.purchaseReceipts,
  ], 'partial', 'Error rate is inferred from failed/cancelled statuses and quality issues in v1.'),

  mapping('ops_resources_facilities', 'Facilities', ['Asset', 'Location', 'Maintenance Schedule'], [
    { doctype: 'Asset', fields: ['asset_name', 'location', ...STATUS_FIELDS] },
    { doctype: 'Location', fields: ['location_name', 'parent_location', ...BASE_FIELDS] },
    { doctype: 'Maintenance Schedule', fields: ['customer', 'transaction_date', ...STATUS_FIELDS] },
  ], 'partial', 'Facilities may require facility-specific tools or custom WorkOS locations.'),
  mapping('ops_resources_equipment', 'equipment', ['Asset', 'Asset Maintenance', 'Maintenance Schedule', 'Maintenance Visit'], [
    { doctype: 'Asset', fields: ['asset_name', 'location', ...STATUS_FIELDS] },
    { doctype: 'Asset Maintenance', fields: ['asset_name', ...BASE_FIELDS] },
    { doctype: 'Maintenance Schedule', fields: ['customer', 'transaction_date', ...STATUS_FIELDS] },
    { doctype: 'Maintenance Visit', fields: ['customer', 'mntc_date', ...STATUS_FIELDS] },
  ]),
  mapping('ops_resources_tools', 'tools', ['Asset', 'Item', 'Serial No'], [
    { doctype: 'Asset', fields: ['asset_name', 'location', ...STATUS_FIELDS] },
    { doctype: 'Item', fields: ['item_code', 'item_name', 'stock_uom', ...BASE_FIELDS] },
    { doctype: 'Serial No', fields: ['item_code', 'warehouse', ...STATUS_FIELDS] },
  ], 'partial', 'Tools may be modeled as assets, items, or serial numbers depending on the WorkOS setup.'),
  mapping('ops_resources_assets', 'assets', ['Asset', 'Asset Movement', 'Asset Repair', 'Asset Maintenance'], [
    { doctype: 'Asset', fields: ['asset_name', 'location', ...STATUS_FIELDS] },
    { doctype: 'Asset Movement', fields: ['purpose', 'transaction_date', ...SUBMITTABLE_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Asset Repair', fields: ['asset', 'repair_status', 'failure_date', 'completion_date', ...BASE_FIELDS] },
    { doctype: 'Asset Maintenance', fields: ['asset_name', ...BASE_FIELDS] },
  ]),
  unsupported('ops_resources_budgets', 'budgets', ['Finance'], 'Budgets are out of Operations WorkOS v1 and should be mapped through Finance/accounting scope.'),
  mapping('ops_resources_licenses', 'licenses', ['Asset', 'Item'], [
    { doctype: 'Asset', fields: ['asset_name', 'location', ...STATUS_FIELDS] },
    { doctype: 'Item', fields: ['item_code', 'item_name', 'stock_uom', ...BASE_FIELDS] },
  ], 'partial', 'Licenses are only visible if this site models them as Assets or Items.'),
  mapping('ops_resources_operating_capacity', 'operating capacity', ['Asset', 'Work Order', 'Job Card', 'Maintenance Schedule'], [
    { doctype: 'Asset', fields: ['asset_name', 'location', ...STATUS_FIELDS] },
    { doctype: 'Work Order', fields: ['production_item', 'qty', 'produced_qty', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Job Card', fields: ['work_order', 'operation', 'total_completed_qty', ...SUBMITTABLE_STATUS_FIELDS], filters: BUYING_FILTER },
    { doctype: 'Maintenance Schedule', fields: ['customer', 'transaction_date', ...STATUS_FIELDS] },
  ], 'partial', 'Capacity is inferred from assets, manufacturing, and maintenance records when available.'),
];

const MAPPING_BY_KEY = new Map(MAPPINGS.map(entry => [entry.key, entry]));
const MAPPING_BY_METRIC_KEY = new Map(MAPPINGS.map(entry => [`spec_dept_operations_${entry.key}`, entry]));

function mapping(
  key: string,
  label: string,
  sourceDoctypes: string[],
  reads: ReadDefinition[],
  status?: Extract<ErpNextOpsStatus, 'partial'>,
  partialReason?: string,
): MappingDefinition {
  return { key, label, sourceDoctypes, reads, status, partialReason };
}

function unsupported(key: string, label: string, sourceDoctypes: string[], unsupportedReason: string): MappingDefinition {
  return { key, label, sourceDoctypes, reads: [], status: 'unsupported', unsupportedReason };
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.round(next)));
}

function isOpenStatus(status: unknown): boolean {
  if (typeof status !== 'string' || !status) return true;
  return !/closed|cancelled|completed|stopped|delivered|received|billed|resolved/i.test(status);
}

function isProblemStatus(status: unknown): boolean {
  return typeof status === 'string' && /fail|reject|cancel|overdue|late|hold|stopped/i.test(status);
}

function displayValue(record: ErpNextGenericRecord): string | undefined {
  const keys = ['posting_date', 'transaction_date', 'schedule_date', 'delivery_date', 'modified', 'creation', 'grand_total'];
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
      rows: await getErpNextRecords(creds, definition.doctype, definition.fields, limit, definition.filters ?? []),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const normalized = normalizeErpNextReadError(definition.doctype, message);
    warnings.push(normalized);
    return { ok: false, rows: [], error: normalized };
  }
}

function cardsFor(reads: Array<{ definition: ReadDefinition; result: ReadResult }>): OpsCard[] {
  return reads.flatMap(({ definition, result }) => result.rows.slice(0, 4).map(record => ({
    id: `${definition.doctype}:${record.name}`,
    title: record.name,
    subtitle: String(record.supplier ?? record.customer ?? record.item_name ?? record.item_code ?? record.warehouse ?? definition.doctype),
    value: displayValue(record),
    status: typeof record.status === 'string' ? record.status : undefined,
    sourceDoctype: definition.doctype,
    sourceId: record.name,
  }))).slice(0, 10);
}

function metricsFor(reads: Array<{ definition: ReadDefinition; result: ReadResult }>): OpsMetric[] {
  const successful = reads.filter(read => read.result.ok);
  const rows = successful.flatMap(read => read.result.rows);
  const openRows = rows.filter(row => isOpenStatus(row.status));
  const problemRows = rows.filter(row => isProblemStatus(row.status));
  const metrics: OpsMetric[] = [
    { label: 'WorkOS doctypes read', value: successful.length },
    { label: 'Records returned', value: rows.length },
    { label: 'Open records', value: openRows.length },
  ];
  if (problemRows.length > 0) metrics.push({ label: 'Attention statuses', value: problemRows.length });
  return metrics;
}

type ReadBundle = Array<{ definition: ReadDefinition; result: ReadResult }>;

interface MetricStory {
  templateKey: OpsTemplateKey;
  headline: string;
  healthScore: number;
  metricCards: OpsMetricCard[];
  breakdowns: OpsBreakdown[];
  insights: OpsInsight[];
  evidence: OpsEvidence[];
}

function successfulRows(reads: ReadBundle): ErpNextGenericRecord[] {
  return reads.flatMap(read => read.result.rows);
}

function rowsFor(reads: ReadBundle, doctype: string): ErpNextGenericRecord[] {
  return reads.filter(read => read.definition.doctype === doctype).flatMap(read => read.result.rows);
}

function countRows(reads: ReadBundle, doctype: string): number {
  return rowsFor(reads, doctype).length;
}

function openRows(reads: ReadBundle, doctype: string): number {
  return rowsFor(reads, doctype).filter(row => isOpenStatus(row.status)).length;
}

function problemRows(reads: ReadBundle, doctype?: string): ErpNextGenericRecord[] {
  const rows = doctype ? rowsFor(reads, doctype) : successfulRows(reads);
  return rows.filter(row => isProblemStatus(row.status));
}

function sumField(reads: ReadBundle, doctype: string, field: string): number {
  return rowsFor(reads, doctype).reduce((total, row) => {
    const value = Number(row[field]);
    return Number.isFinite(value) ? total + value : total;
  }, 0);
}

function metricCard(id: string, label: string, value: number | string, description: string, tone: OpsTone = 'neutral', unit?: string): OpsMetricCard {
  return { id, label, value, unit, description, tone };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreFromSignals(totalRecords: number, attention: number, partial = false): number {
  const base = totalRecords > 0 ? 86 : 58;
  return clampScore(base - attention * 8 - (partial ? 6 : 0));
}

function breakdownByDoctype(reads: ReadBundle): OpsBreakdown {
  const items = reads
    .filter(read => read.result.ok)
    .map(read => ({
      label: read.definition.doctype,
      value: read.result.rows.length,
      tone: read.result.rows.some(row => isProblemStatus(row.status)) ? 'warning' as const : 'neutral' as const,
    }))
    .filter(item => Number(item.value) > 0);
  return { id: 'source_mix', title: 'WorkOS source mix', items };
}

function breakdownByStatus(reads: ReadBundle): OpsBreakdown | null {
  const counts = new Map<string, number>();
  for (const row of successfulRows(reads)) {
    const status = typeof row.status === 'string' && row.status ? row.status : 'No status';
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const items = [...counts.entries()].map(([label, value]) => ({
    label,
    value,
    tone: isProblemStatus(label) ? 'warning' as const : 'neutral' as const,
  }));
  return items.length > 0 ? { id: 'status_mix', title: 'Status mix', items } : null;
}

function evidenceFor(reads: ReadBundle): OpsEvidence[] {
  return reads.flatMap(({ definition, result }) => result.rows.slice(0, 5).map(record => ({
    id: `${definition.doctype}:${record.name}`,
    label: String(record.supplier ?? record.customer ?? record.item_name ?? record.item_code ?? record.warehouse ?? record.name),
    sourceDoctype: definition.doctype,
    sourceId: record.name,
    detail: displayValue(record),
    status: typeof record.status === 'string' ? record.status : undefined,
  }))).slice(0, 24);
}

function templateForMapping(mappingKey: string): OpsTemplateKey {
  if (
    mappingKey.includes('procurement_flow') ||
    mappingKey.includes('vendors_pos') ||
    mappingKey.includes('contracts') ||
    mappingKey.includes('renewals') ||
    mappingKey.includes('service_levels') ||
    mappingKey.includes('cost')
  ) return 'procurement';
  if (mappingKey.includes('inventory') || mappingKey.includes('warehousing') || mappingKey.includes('tools') || mappingKey.includes('licenses')) return 'inventory_warehousing';
  if (mappingKey.includes('logistics') || mappingKey.includes('shipping') || mappingKey.includes('routing')) return 'logistics_shipping';
  if (mappingKey.includes('delivery') || mappingKey.includes('slas') || mappingKey.includes('sla_adherence') || mappingKey.includes('fulfillment') || mappingKey.includes('field_operations') || mappingKey.includes('service_requests')) return 'service_delivery';
  if (mappingKey.includes('quality') || mappingKey.includes('error_rate')) return 'quality';
  if (mappingKey.includes('bottlenecks') || mappingKey.includes('lean_processes') || mappingKey.includes('throughput') || mappingKey.includes('cycle_time') || mappingKey.includes('utilization')) return 'manufacturing_lean';
  if (mappingKey.includes('facilities') || mappingKey.includes('equipment') || mappingKey.includes('assets') || mappingKey.includes('operating_capacity')) return 'assets_resources';
  return 'unsupported';
}

function buildProcurementStory(mappingDef: MappingDefinition, reads: ReadBundle): Omit<MetricStory, 'templateKey' | 'evidence'> {
  const mrs = openRows(reads, 'Material Request');
  const pos = openRows(reads, 'Purchase Order');
  const receipts = openRows(reads, 'Purchase Receipt');
  const rfqs = openRows(reads, 'Request for Quotation');
  const quotes = openRows(reads, 'Supplier Quotation');
  const invoices = openRows(reads, 'Purchase Invoice');
  const blankets = countRows(reads, 'Blanket Order');
  const scorecards = countRows(reads, 'Supplier Scorecard');
  const suppliers = new Set(successfulRows(reads).map(row => row.supplier).filter(Boolean)).size;
  const total = successfulRows(reads).length;
  const attention = problemRows(reads).length;
  const cards = mappingDef.key.includes('vendors_pos')
    ? [
        metricCard('open_pos', 'Open purchase orders', pos, 'Purchase orders still waiting for receipt or billing.', pos > 0 ? 'warning' : 'good'),
        metricCard('pending_receipts', 'Pending receipts', receipts, 'Purchase receipts still in the procurement flow.', receipts > 0 ? 'warning' : 'good'),
        metricCard('invoice_queue', 'Invoice queue', invoices, 'Purchase invoices visible for this vendor/procurement lane.', 'neutral'),
        metricCard('supplier_count', 'Suppliers involved', suppliers, 'Distinct suppliers represented in this node.', 'neutral'),
      ]
    : mappingDef.key.includes('renewals') || mappingDef.key.includes('contracts')
      ? [
          metricCard('contracts', 'Blanket orders', blankets, 'Longer-running supplier agreements available as renewal/contract evidence.', blankets > 0 ? 'good' : 'warning'),
          metricCard('open_pos', 'Related POs', pos, 'Purchase orders tied to renewal or contract activity.', 'neutral'),
          metricCard('suppliers', 'Suppliers covered', suppliers, 'Vendors represented in the contract/renewal view.', 'neutral'),
          metricCard('scorecards', 'Supplier scorecards', scorecards, 'Supplier performance records available for service-level context.', scorecards > 0 ? 'good' : 'warning'),
        ]
      : [
          metricCard('material_requests', 'Material requests', mrs, 'Requests that start procurement demand.', mrs > 0 ? 'warning' : 'good'),
          metricCard('open_pos', 'Open POs', pos, 'Purchase orders in flight.', pos > 0 ? 'warning' : 'good'),
          metricCard('pending_receipts', 'Pending receipts', receipts, 'Goods or services still awaiting receipt.', receipts > 0 ? 'warning' : 'good'),
          metricCard('quote_coverage', 'Quotes/RFQs', rfqs + quotes, 'RFQs and supplier quotations supporting the buying decision.', rfqs + quotes > 0 ? 'good' : 'warning'),
        ];
  return {
    headline: mappingDef.key.includes('vendors_pos')
      ? `${pos} purchase orders and ${receipts} receipts need procurement follow-through.`
      : mappingDef.key.includes('renewals') || mappingDef.key.includes('contracts')
        ? `${blankets} supplier agreements and ${pos} related purchase orders are visible.`
        : `${mrs} material requests, ${pos} purchase orders, and ${receipts} receipts are in the procurement pipeline.`,
    healthScore: scoreFromSignals(total, attention, mappingDef.status === 'partial'),
    metricCards: cards,
    breakdowns: [breakdownByDoctype(reads), breakdownByStatus(reads)].filter((item): item is OpsBreakdown => Boolean(item)),
    insights: [
      { id: 'pipeline', label: 'Procurement pipeline', detail: `${total} WorkOS procurement records are summarized into demand, quote, order, and receipt stages.`, severity: 'info' },
      ...(attention > 0 ? [{ id: 'attention', label: 'Attention needed', detail: `${attention} procurement records have failed, rejected, overdue, or held statuses.`, severity: 'warning' as const }] : []),
    ],
  };
}

function buildInventoryStory(mappingDef: MappingDefinition, reads: ReadBundle): Omit<MetricStory, 'templateKey' | 'evidence'> {
  const items = countRows(reads, 'Item');
  const bins = rowsFor(reads, 'Bin');
  const warehouses = countRows(reads, 'Warehouse');
  const stocked = bins.filter(row => Number(row.actual_qty) > 0).length;
  const lowStock = bins.filter(row => Number(row.actual_qty) > 0 && Number(row.actual_qty) <= 10).length;
  const reservations = openRows(reads, 'Stock Reservation Entry');
  const adjustments = countRows(reads, 'Stock Entry') + countRows(reads, 'Stock Reconciliation');
  const attention = problemRows(reads).length + lowStock;
  return {
    headline: mappingDef.key.includes('warehousing')
      ? `${stocked} stocked positions across ${warehouses} warehouses, with ${reservations} reservations.`
      : `${items} items and ${stocked} stocked positions are visible from WorkOS inventory.`,
    healthScore: scoreFromSignals(successfulRows(reads).length, attention, mappingDef.status === 'partial'),
    metricCards: [
      metricCard('stocked_items', 'Stocked positions', stocked, 'Item/warehouse positions with available quantity.', stocked > 0 ? 'good' : 'warning'),
      metricCard('low_stock', 'Low-stock positions', lowStock, 'Stocked positions at or below the v1 low-stock threshold.', lowStock > 0 ? 'warning' : 'good'),
      metricCard('warehouses', 'Warehouses', warehouses, 'Warehouses connected to this Operations node.', warehouses > 0 ? 'good' : 'neutral'),
      metricCard('reservations', 'Reserved stock', reservations, 'Stock reservations that may constrain fulfillment.', reservations > 0 ? 'warning' : 'neutral'),
      metricCard('adjustments', 'Stock movements/adjustments', adjustments, 'Receipts, transfers, and reconciliation activity.', 'neutral'),
    ],
    breakdowns: [breakdownByDoctype(reads), { id: 'inventory_exceptions', title: 'Inventory exceptions', items: [
      { label: 'Low stock', value: lowStock, tone: lowStock > 0 ? 'warning' : 'good' },
      { label: 'Reserved positions', value: reservations, tone: reservations > 0 ? 'warning' : 'neutral' },
      { label: 'Stocked positions', value: stocked, tone: 'good' },
    ] }],
    insights: [
      { id: 'inventory_context', label: 'Inventory context', detail: `${bins.length} item/warehouse balances are summarized instead of showing raw bin rows.`, severity: 'info' },
      ...(lowStock > 0 ? [{ id: 'low_stock', label: 'Low stock watch', detail: `${lowStock} stocked positions are close to depletion and may affect fulfillment.`, severity: 'warning' as const }] : []),
    ],
  };
}

function buildLogisticsStory(mappingDef: MappingDefinition, reads: ReadBundle): Omit<MetricStory, 'templateKey' | 'evidence'> {
  const deliveryNotes = openRows(reads, 'Delivery Note');
  const picks = openRows(reads, 'Pick List');
  const shipments = openRows(reads, 'Shipment');
  const trips = openRows(reads, 'Delivery Trip');
  const movements = countRows(reads, 'Stock Entry');
  const attention = problemRows(reads).length;
  return {
    headline: mappingDef.key.includes('routing')
      ? `${trips} delivery trips are available for route/dispatch visibility.`
      : `${deliveryNotes} delivery notes, ${picks} pick lists, and ${shipments} shipments are in outbound flow.`,
    healthScore: scoreFromSignals(successfulRows(reads).length, attention, mappingDef.status === 'partial'),
    metricCards: [
      metricCard('delivery_notes', 'Open deliveries', deliveryNotes, 'Delivery notes still moving through outbound operations.', deliveryNotes > 0 ? 'warning' : 'good'),
      metricCard('pick_lists', 'Open pick lists', picks, 'Warehouse picking work waiting to complete.', picks > 0 ? 'warning' : 'good'),
      metricCard('shipments', 'Shipments', shipments, 'Shipment records connected to this node.', 'neutral'),
      metricCard('delivery_trips', 'Delivery trips', trips, 'Trips available for routing or field dispatch.', trips > 0 ? 'good' : 'neutral'),
      metricCard('stock_movements', 'Stock movements', movements, 'Stock entries that support logistics flow.', 'neutral'),
    ],
    breakdowns: [breakdownByDoctype(reads), breakdownByStatus(reads)].filter((item): item is OpsBreakdown => Boolean(item)),
    insights: [
      { id: 'outbound_flow', label: 'Outbound flow', detail: 'The panel groups pick, ship, delivery, and trip work instead of listing WorkOS document numbers.', severity: 'info' },
    ],
  };
}

function buildServiceStory(mappingDef: MappingDefinition, reads: ReadBundle): Omit<MetricStory, 'templateKey' | 'evidence'> {
  const issues = openRows(reads, 'Issue');
  const warranties = openRows(reads, 'Warranty Claim');
  const visits = openRows(reads, 'Maintenance Visit');
  const schedules = openRows(reads, 'Maintenance Schedule');
  const slas = countRows(reads, 'Service Level Agreement');
  const fulfillment = openRows(reads, 'Sales Order') + openRows(reads, 'Delivery Note') + openRows(reads, 'Pick List') + openRows(reads, 'Shipment');
  const attention = problemRows(reads).length;
  return {
    headline: mappingDef.key.includes('slas') || mappingDef.key.includes('sla_adherence')
      ? `${issues} open service issues are covered by ${slas} SLA definitions.`
      : `${fulfillment} fulfillment records and ${visits + schedules} field-service records are active.`,
    healthScore: scoreFromSignals(successfulRows(reads).length, attention, mappingDef.status === 'partial'),
    metricCards: [
      metricCard('issues', 'Open issues', issues, 'Customer/service issues still open.', issues > 0 ? 'warning' : 'good'),
      metricCard('sla_defs', 'SLA definitions', slas, 'WorkOS SLA records available for service adherence.', slas > 0 ? 'good' : 'neutral'),
      metricCard('warranty_claims', 'Warranty claims', warranties, 'Warranty/service claims in the support flow.', warranties > 0 ? 'warning' : 'neutral'),
      metricCard('field_work', 'Field work', visits + schedules, 'Maintenance visits and schedules connected to field operations.', visits + schedules > 0 ? 'warning' : 'good'),
      metricCard('fulfillment_backlog', 'Fulfillment backlog', fulfillment, 'Orders, deliveries, picks, and shipments still in progress.', fulfillment > 0 ? 'warning' : 'good'),
    ],
    breakdowns: [breakdownByDoctype(reads), breakdownByStatus(reads)].filter((item): item is OpsBreakdown => Boolean(item)),
    insights: [
      { id: 'service_story', label: 'Service delivery story', detail: 'Issues, claims, fulfillment, and field work are summarized as service load instead of raw WorkOS rows.', severity: 'info' },
    ],
  };
}

function buildQualityStory(mappingDef: MappingDefinition, reads: ReadBundle): Omit<MetricStory, 'templateKey' | 'evidence'> {
  const inspections = countRows(reads, 'Quality Inspection');
  const failedInspections = rowsFor(reads, 'Quality Inspection').filter(row => isProblemStatus(row.status) || /reject|fail/i.test(String(row.status ?? ''))).length;
  const issues = openRows(reads, 'Issue');
  const scorecards = countRows(reads, 'Supplier Scorecard');
  const receipts = countRows(reads, 'Purchase Receipt');
  const attention = problemRows(reads).length + failedInspections;
  return {
    headline: `${inspections} inspections, ${issues} quality issues, and ${scorecards} supplier scorecards are summarized.`,
    healthScore: scoreFromSignals(successfulRows(reads).length, attention, mappingDef.status === 'partial'),
    metricCards: [
      metricCard('inspections', 'Quality inspections', inspections, 'Inspection records linked to supplier, stock, or delivery quality.', inspections > 0 ? 'good' : 'warning'),
      metricCard('failed_inspections', 'Failed/rejected checks', failedInspections, 'Inspections or quality records needing attention.', failedInspections > 0 ? 'warning' : 'good'),
      metricCard('quality_issues', 'Open quality issues', issues, 'Issues categorized into quality/error follow-up.', issues > 0 ? 'warning' : 'good'),
      metricCard('scorecards', 'Supplier scorecards', scorecards, 'Supplier performance evidence available.', scorecards > 0 ? 'good' : 'neutral'),
      metricCard('receipt_context', 'Receipt context', receipts, 'Purchase receipts providing supplier-quality context.', 'neutral'),
    ],
    breakdowns: [breakdownByDoctype(reads), breakdownByStatus(reads)].filter((item): item is OpsBreakdown => Boolean(item)),
    insights: [
      ...(failedInspections > 0 ? [{ id: 'quality_attention', label: 'Quality attention', detail: `${failedInspections} records indicate a rejected, failed, or attention status.`, severity: 'warning' as const }] : [{ id: 'quality_clear', label: 'Quality coverage', detail: 'Quality evidence exists and no failed/rejected status was found in this read window.', severity: 'info' as const }]),
    ],
  };
}

function buildManufacturingStory(mappingDef: MappingDefinition, reads: ReadBundle): Omit<MetricStory, 'templateKey' | 'evidence'> {
  const workOrders = openRows(reads, 'Work Order');
  const jobCards = openRows(reads, 'Job Card');
  const inspections = countRows(reads, 'Quality Inspection');
  const deliveries = openRows(reads, 'Delivery Note') + openRows(reads, 'Pick List') + openRows(reads, 'Purchase Receipt');
  const produced = sumField(reads, 'Work Order', 'produced_qty');
  const planned = sumField(reads, 'Work Order', 'qty');
  const completion = planned > 0 ? Math.round((produced / planned) * 100) : 0;
  const attention = problemRows(reads).length;
  return {
    headline: `${workOrders} work orders and ${jobCards} job cards are active, with ${completion}% produced vs planned.`,
    healthScore: scoreFromSignals(successfulRows(reads).length, attention + (completion < 30 && workOrders > 0 ? 2 : 0), mappingDef.status === 'partial'),
    metricCards: [
      metricCard('work_orders', 'Open work orders', workOrders, 'Manufacturing or operational work orders still active.', workOrders > 0 ? 'warning' : 'good'),
      metricCard('job_cards', 'Open job cards', jobCards, 'Execution steps under active work orders.', jobCards > 0 ? 'warning' : 'good'),
      metricCard('completion', 'Completion ratio', completion, 'Produced quantity divided by planned quantity in the read window.', completion < 50 && workOrders > 0 ? 'warning' : 'good', '%'),
      metricCard('throughput_context', 'Throughput records', deliveries, 'Delivery, pick, receipt, and production records used for throughput/cycle views.', 'neutral'),
      metricCard('quality_checks', 'Quality checks', inspections, 'Quality inspections linked to lean/manufacturing health.', inspections > 0 ? 'good' : 'neutral'),
    ],
    breakdowns: [breakdownByDoctype(reads), breakdownByStatus(reads)].filter((item): item is OpsBreakdown => Boolean(item)),
    insights: [
      { id: 'lean_flow', label: 'Lean/process flow', detail: 'Work orders, job cards, and quality checks are grouped into execution health instead of raw manufacturing IDs.', severity: 'info' },
    ],
  };
}

function buildAssetsStory(mappingDef: MappingDefinition, reads: ReadBundle): Omit<MetricStory, 'templateKey' | 'evidence'> {
  const assets = countRows(reads, 'Asset');
  const repairs = openRows(reads, 'Asset Repair');
  const maintenance = countRows(reads, 'Asset Maintenance') + openRows(reads, 'Maintenance Schedule') + openRows(reads, 'Maintenance Visit');
  const movements = countRows(reads, 'Asset Movement');
  const locations = countRows(reads, 'Location');
  const tools = countRows(reads, 'Item') + countRows(reads, 'Serial No');
  const attention = problemRows(reads).length + repairs;
  return {
    headline: assets > 0
      ? `${assets} assets, ${maintenance} maintenance records, and ${repairs} repairs are visible for resources.`
      : `${maintenance} maintenance records, ${repairs} repairs, and ${tools} tool/item records are visible for resources.`,
    healthScore: scoreFromSignals(successfulRows(reads).length, attention, mappingDef.status === 'partial'),
    metricCards: [
      metricCard('assets', 'Assets tracked', assets, 'WorkOS assets connected to this resource node.', assets > 0 ? 'good' : 'neutral'),
      metricCard('repairs', 'Assets under repair', repairs, 'Repair records that may reduce operational capacity.', repairs > 0 ? 'warning' : 'good'),
      metricCard('maintenance', 'Maintenance records', maintenance, 'Schedules, visits, or maintenance records available.', maintenance > 0 ? 'warning' : 'good'),
      metricCard('locations', 'Facilities/locations', locations, 'Locations or facilities represented in WorkOS.', locations > 0 ? 'good' : 'neutral'),
      metricCard('tools', 'Tools/licenses/items', tools, 'Items or serial numbers used as tools, licenses, or operating resources.', tools > 0 ? 'good' : 'neutral'),
      metricCard('asset_movements', 'Asset movements', movements, 'Movement records indicating allocation or transfer activity.', 'neutral'),
    ],
    breakdowns: [breakdownByDoctype(reads), breakdownByStatus(reads)].filter((item): item is OpsBreakdown => Boolean(item)),
    insights: [
      { id: 'resource_story', label: 'Resource coverage', detail: 'Assets, locations, repairs, maintenance, and tools are summarized as operating capacity evidence.', severity: 'info' },
    ],
  };
}

function buildMetricStory(mappingDef: MappingDefinition, reads: ReadBundle): MetricStory {
  const templateKey = templateForMapping(mappingDef.key);
  const base = templateKey === 'procurement' ? buildProcurementStory(mappingDef, reads)
    : templateKey === 'inventory_warehousing' ? buildInventoryStory(mappingDef, reads)
      : templateKey === 'logistics_shipping' ? buildLogisticsStory(mappingDef, reads)
        : templateKey === 'service_delivery' ? buildServiceStory(mappingDef, reads)
          : templateKey === 'quality' ? buildQualityStory(mappingDef, reads)
            : templateKey === 'manufacturing_lean' ? buildManufacturingStory(mappingDef, reads)
              : templateKey === 'assets_resources' ? buildAssetsStory(mappingDef, reads)
                : {
                    headline: `${successfulRows(reads).length} WorkOS records are connected to this Operations node.`,
                    healthScore: scoreFromSignals(successfulRows(reads).length, problemRows(reads).length, mappingDef.status === 'partial'),
                    metricCards: [metricCard('records', 'Connected records', successfulRows(reads).length, 'WorkOS records found for this node.', 'neutral')],
                    breakdowns: [breakdownByDoctype(reads)],
                    insights: [{ id: 'generic', label: 'Connected evidence', detail: 'WorkOS evidence is available, but this node does not yet have a specialized metric template.', severity: 'info' as const }],
                  };
  return { ...base, templateKey, evidence: evidenceFor(reads) };
}

function recommendationsFor(mappingDef: MappingDefinition, reads: Array<{ definition: ReadDefinition; result: ReadResult }>): OpsRecommendation[] {
  const failed = reads.filter(read => !read.result.ok);
  const rows = reads.flatMap(read => read.result.rows);
  const problemRows = rows.filter(row => isProblemStatus(row.status));
  const recommendations: OpsRecommendation[] = [];
  if (mappingDef.partialReason) {
    recommendations.push({ label: 'Partial WorkOS coverage', reason: mappingDef.partialReason, severity: 'info' });
  }
  if (failed.length > 0) {
    recommendations.push({ label: 'Verify WorkOS doctypes', reason: `${failed.length} mapped doctype(s) could not be read on this site.`, severity: 'warning' });
  }
  if (problemRows.length > 0) {
    recommendations.push({ label: 'Review attention statuses', reason: `${problemRows.length} WorkOS record(s) have failed, cancelled, overdue, or held statuses.`, severity: 'warning' });
  }
  if (rows.length === 0 && failed.length === 0) {
    recommendations.push({ label: 'No WorkOS records yet', reason: `No ${mappingDef.label} records were returned for this company site.`, severity: 'info' });
  }
  return recommendations;
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

async function listOperationsLeaves(companyId: string): Promise<OperationsLeafRow[]> {
  const { rows } = await pool.query<OperationsLeafRow>(
    `SELECT n.id, n.label
       FROM public.department_bdt_nodes n
       JOIN public.departments d
         ON d.id = n.department_id
        AND d.company_id = n.company_id
      WHERE n.company_id = $1
        AND (d.source_key = 'dept_operations' OR d.label = 'Operations')
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

async function listDescendantLeaves(companyId: string, nodeId: string): Promise<OperationsLeafRow[]> {
  const { rows } = await pool.query<OperationsLeafRow>(
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

function mappingKeyFromPath(path: NodePathRow[]): string | null {
  const leaf = path[path.length - 1];
  if (!leaf) return null;
  if (leaf.metric_key && MAPPING_BY_METRIC_KEY.has(leaf.metric_key)) return MAPPING_BY_METRIC_KEY.get(leaf.metric_key)!.key;
  const level1 = [...path].reverse().find(row => row.node_level === 'level1' || row.metadata?.level1Label);
  const branch = [...path].reverse().find(row => row.node_level === 'branch' || row.metadata?.branchItem);
  const level1Label = typeof leaf.metadata?.level1Label === 'string' ? leaf.metadata.level1Label : level1?.label;
  const branchLabel = typeof leaf.metadata?.branchItem === 'string' ? leaf.metadata.branchItem : branch?.label;
  if (!level1Label || !branchLabel) return null;
  const prefix = level1Label === 'Supply Chain & Logistics' ? 'supply_chain'
    : level1Label === 'Service Delivery' ? 'delivery'
      : level1Label === 'Vendors & Procurement' ? 'vendors'
        : level1Label === 'Process Excellence' ? 'process'
          : level1Label === 'Operational Performance' ? 'performance'
            : level1Label === 'Operational Resources' ? 'resources'
              : null;
  return prefix ? `ops_${prefix}_${slug(branchLabel)}` : null;
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

function buildRollupBreakdowns(childSummaries: NodeSummaryResult[]): OpsBreakdown[] {
  const statusCounts = childSummaries.reduce<Map<ErpNextOpsStatus, number>>((acc, summary) => {
    acc.set(summary.status, (acc.get(summary.status) ?? 0) + 1);
    return acc;
  }, new Map());
  const templateCounts = childSummaries.reduce<Map<OpsTemplateKey, number>>((acc, summary) => {
    acc.set(summary.templateKey, (acc.get(summary.templateKey) ?? 0) + 1);
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
    {
      id: 'template_mix',
      title: 'Operational story mix',
      items: [...templateCounts.entries()].map(([label, value]) => ({
        label: label.replace(/_/g, ' '),
        value,
        tone: label === 'unsupported' ? 'neutral' : 'good',
      })),
    },
  ];
}

async function buildRollupSummary(companyId: string, nodeId: string, path: NodePathRow[], leaves: OperationsLeafRow[], limit: number): Promise<NodeSummaryResult> {
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
  const status: ErpNextOpsStatus = childSummaries.length === 0
    ? 'unsupported'
    : attentionChildren.length > 0 || unsupportedChildren.length > 0
      ? 'partial'
      : 'ready';

  return {
    status,
    generatedAt,
    siteName: creds?.siteName,
    department: 'Operations',
    nodeId,
    nodeLabel: node.label,
    path: pathLabels,
    mappingKey: `rollup:${nodeId}`,
    mappingLabel: node.label,
    templateKey: 'rollup',
    headline: topRisk
      ? `${topRisk.nodeLabel} needs the most attention inside this Operations branch.`
      : `${readyChildren.length} child Operations leaves are connected and summarized.`,
    healthScore: averageScore,
    sourceDoctypes: [...new Set(childSummaries.flatMap(summary => summary.sourceDoctypes))],
    metrics: [
      { label: 'Child leaves summarized', value: childSummaries.length },
      { label: 'Ready leaves', value: readyChildren.length },
      { label: 'Attention leaves', value: attentionChildren.length },
      { label: 'Unsupported leaves', value: unsupportedChildren.length },
    ],
    metricCards: [
      metricCard('children', 'Child leaves summarized', childSummaries.length, 'Leaf Operations nodes rolled up under this parent.', 'neutral'),
      metricCard('ready', 'Ready leaves', readyChildren.length, 'Children with direct WorkOS metric panels.', readyChildren.length > 0 ? 'good' : 'neutral'),
      metricCard('attention', 'Needs attention', attentionChildren.length, 'Children with partial data, warnings, or lower health.', attentionChildren.length > 0 ? 'warning' : 'good'),
      metricCard('unsupported', 'Not connected yet', unsupportedChildren.length, 'Children intentionally unsupported in WorkOS Operations v1.', unsupportedChildren.length > 0 ? 'neutral' : 'good'),
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
    unsupportedReason: childSummaries.length === 0 ? 'This Operations parent has no descendant leaf nodes to roll up.' : undefined,
  };
}

export async function buildNodeSummary(companyId: string, nodeId: string, limit: number): Promise<NodeSummaryResult | null> {
  const path = await resolveNodePath(companyId, nodeId);
  if (!path) return null;

  const leaf = path[path.length - 1];
  if (!leaf || !(leaf.department_source_key === 'dept_operations' || leaf.department_label === 'Operations')) {
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
    const reason = 'This Operations node does not have a verified WorkOS mapping yet.';
    return {
      status: 'unsupported',
      generatedAt,
      department: 'Operations',
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
    const reason = mappingDef.unsupportedReason ?? 'This Operations node is not connected to WorkOS Operations v1.';
    return {
      status: 'unsupported',
      generatedAt,
      department: 'Operations',
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
      department: 'Operations',
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
  const status: ErpNextOpsStatus = failedCount > 0 || mappingDef.status === 'partial' ? 'partial' : 'ready';
  const story = buildMetricStory(mappingDef, reads);

  return {
    status,
    generatedAt,
    siteName: creds.siteName,
    department: 'Operations',
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

export async function buildOperationsAudit(companyId: string, limit: number) {
  const leaves = await listOperationsLeaves(companyId);
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
    department: 'Operations' as const,
    totalLeaves: rows.length,
    statusCounts: rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {}),
    rows,
  };
}

erpnextOperationsRouter.get('/node-summary', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const nodeId = typeof req.query.nodeId === 'string' ? req.query.nodeId : '';
  if (!nodeId) return res.status(400).json({ error: 'node_id_required' });

  const limit = boundedNumber(req.query.limit, 50, 1, 100);
  const summary = await buildNodeSummary(companyId, nodeId, limit);
  if (!summary) return res.status(404).json({ error: 'operations_node_not_found' });

  if (summary.status === 'not_configured') {
    return res.status(503).json({ error: 'erpnext_not_configured', message: summary.warnings[0] ?? 'WorkOS is not configured.' });
  }

  return res.json(summary);
});

erpnextOperationsRouter.get('/audit', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const limit = boundedNumber(req.query.limit, 10, 1, 25);
  return res.json(await buildOperationsAudit(companyId, limit));
});

// Purely additive — consumed by bdtNodeActivation.ts to resolve which Operations leaves are
// active. Hand-written parallel table (not derived by reverse-parsing the key format) so it
// can't drift silently if slug()/key naming changes; mirrors MAPPINGS 1:1 by key.
export const MAPPING_SOURCE_LABELS: Record<string, { level1Label: string; branchLabel: string }> = {
  ops_delivery_delivery_processes: { level1Label: 'Service Delivery', branchLabel: 'Delivery processes' },
  ops_delivery_slas: { level1Label: 'Service Delivery', branchLabel: 'SLAs' },
  ops_delivery_service_requests: { level1Label: 'Service Delivery', branchLabel: 'service requests' },
  ops_delivery_fulfillment: { level1Label: 'Service Delivery', branchLabel: 'fulfillment' },
  ops_delivery_field_operations: { level1Label: 'Service Delivery', branchLabel: 'field operations' },
  ops_supply_chain_inventory: { level1Label: 'Supply Chain & Logistics', branchLabel: 'Inventory' },
  ops_supply_chain_logistics: { level1Label: 'Supply Chain & Logistics', branchLabel: 'logistics' },
  ops_supply_chain_shipping: { level1Label: 'Supply Chain & Logistics', branchLabel: 'shipping' },
  ops_supply_chain_warehousing: { level1Label: 'Supply Chain & Logistics', branchLabel: 'warehousing' },
  ops_supply_chain_routing: { level1Label: 'Supply Chain & Logistics', branchLabel: 'routing' },
  ops_supply_chain_procurement_flow: { level1Label: 'Supply Chain & Logistics', branchLabel: 'procurement flow' },
  ops_vendors_vendor_onboarding: { level1Label: 'Vendors & Procurement', branchLabel: 'Vendor onboarding' },
  ops_vendors_pos: { level1Label: 'Vendors & Procurement', branchLabel: 'POs' },
  ops_vendors_contracts: { level1Label: 'Vendors & Procurement', branchLabel: 'contracts' },
  ops_vendors_quality: { level1Label: 'Vendors & Procurement', branchLabel: 'quality' },
  ops_vendors_service_levels: { level1Label: 'Vendors & Procurement', branchLabel: 'service levels' },
  ops_vendors_renewals: { level1Label: 'Vendors & Procurement', branchLabel: 'renewals' },
  ops_process_sops: { level1Label: 'Process Excellence', branchLabel: 'SOPs' },
  ops_process_automation: { level1Label: 'Process Excellence', branchLabel: 'automation' },
  ops_process_quality_improvement: { level1Label: 'Process Excellence', branchLabel: 'quality improvement' },
  ops_process_bottlenecks: { level1Label: 'Process Excellence', branchLabel: 'bottlenecks' },
  ops_process_workflows: { level1Label: 'Process Excellence', branchLabel: 'workflows' },
  ops_process_lean_processes: { level1Label: 'Process Excellence', branchLabel: 'lean processes' },
  ops_performance_sla_adherence: { level1Label: 'Operational Performance', branchLabel: 'SLA adherence' },
  ops_performance_cost: { level1Label: 'Operational Performance', branchLabel: 'cost' },
  ops_performance_quality: { level1Label: 'Operational Performance', branchLabel: 'quality' },
  ops_performance_throughput: { level1Label: 'Operational Performance', branchLabel: 'throughput' },
  ops_performance_cycle_time: { level1Label: 'Operational Performance', branchLabel: 'cycle time' },
  ops_performance_utilization: { level1Label: 'Operational Performance', branchLabel: 'utilization' },
  ops_performance_error_rate: { level1Label: 'Operational Performance', branchLabel: 'error rate' },
  ops_resources_facilities: { level1Label: 'Operational Resources', branchLabel: 'Facilities' },
  ops_resources_equipment: { level1Label: 'Operational Resources', branchLabel: 'equipment' },
  ops_resources_tools: { level1Label: 'Operational Resources', branchLabel: 'tools' },
  ops_resources_assets: { level1Label: 'Operational Resources', branchLabel: 'assets' },
  ops_resources_budgets: { level1Label: 'Operational Resources', branchLabel: 'budgets' },
  ops_resources_licenses: { level1Label: 'Operational Resources', branchLabel: 'licenses' },
  ops_resources_operating_capacity: { level1Label: 'Operational Resources', branchLabel: 'operating capacity' },
};

export function listActiveBranchKeys(): Array<{ level1Label: string; branchLabel: string }> {
  return Object.entries(MAPPING_SOURCE_LABELS)
    .filter(([key]) => MAPPING_BY_KEY.get(key)?.status !== 'unsupported')
    .map(([, v]) => v);
}
