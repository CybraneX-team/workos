import { Router } from 'express';
import type { RecordQuery } from '@cybranex/erpnext-contracts';
import type { ErpNextCreds, ErpNextGenericRecord } from '../../adapters/erpnext.js';
import { pool } from '../../db.js';
import { getErpNextNotConfiguredMessage, resolveErpNextCreds } from '../../lib/erpnextConnection.js';
import { queryRecords } from '../../lib/erpnextControlPlane.js';
import { erpnextDeskListUrl, erpnextDeskRecordUrl } from '../../lib/erpnextDeskLinks.js';
import { authJwt } from '../../middleware/authJwt.js';

/**
 * V4 Operations is intentionally one shallow, provider-backed focus workspace.
 * The control-plane remains the only Frappe caller; this module only asks it for
 * an allowlisted, bounded record batch and turns those records into safe Desk links.
 */
export const erpnextOperationsRouter = Router();

export type OperationsSnapshotStatus = 'ready' | 'partial' | 'not_configured';
export type OperationsGroupKey =
  | 'supply_procurement'
  | 'fulfilment_logistics'
  | 'production_capacity'
  | 'service_quality';

type Severity = 'info' | 'warning' | 'critical';
type ReadId =
  | 'material_requests'
  | 'purchase_orders'
  | 'stockouts'
  | 'delivery_notes'
  | 'pick_lists'
  | 'shipments'
  | 'delivery_trips'
  | 'work_orders'
  | 'job_cards'
  | 'maintenance_schedules'
  | 'issues'
  | 'quality_inspections'
  | 'warranty_claims';

export interface OperationsDeskAction {
  id: string;
  label: string;
  sourceDoctype: string;
  href: string;
}

export interface OperationsEvidence {
  id: string;
  label: string;
  detail?: string;
  sourceDoctype: string;
  sourceId?: string;
  status?: string;
  href?: string;
}

export interface OperationsException extends OperationsEvidence {
  severity: Severity;
}

export interface OperationsQueue {
  id: string;
  label: string;
  value: number;
  sourceDoctype: string;
  href: string;
}

export interface OperationsRecommendation {
  id: string;
  label: string;
  reason: string;
  severity: Severity;
}

export interface OperationsSnapshotGroup {
  key: OperationsGroupKey;
  label: string;
  status: 'ready' | 'partial';
  queues: OperationsQueue[];
  exceptions: OperationsException[];
  evidence: OperationsEvidence[];
  recommendations: OperationsRecommendation[];
  actions: OperationsDeskAction[];
}

export interface OperationsSnapshot {
  status: OperationsSnapshotStatus;
  generatedAt: string;
  siteName?: string;
  nodeId: string;
  nodeLabel: string;
  groups: OperationsSnapshotGroup[];
  warnings: string[];
  message?: string;
}

type FocusNodeRow = { id: string; label: string };
type QueryRows = Partial<Record<ReadId, ErpNextGenericRecord[]>>;
type QueryFailure = Partial<Record<ReadId, string>>;

/** Raw, unscored ERPNext inputs for the six Operations KPIs.
 * Targets and activation live in the metrics domain; this boundary never invents them. */
export interface OperationsMetricInputs {
  openMaterialRequests: number;
  openPurchaseOrders: number;
  stockPositions: Array<{ itemCode: string; warehouse: string; actualQty: number }>;
  openWorkOrders: number;
  workOrderCompletion: { plannedQty: number; producedQty: number; percent: number | null };
  failedOrRejectedQualityChecks: number;
  warnings: string[];
}

/** Stable server-only value contract for the Operations metrics bootstrap/refresh path. */
export interface OperationsMetricSnapshot {
  openMaterialRequests: number;
  openPurchaseOrders: number;
  /** Null until a user supplies their own low-stock threshold. */
  lowStockPositions: number | null;
  openWorkOrders: number;
  workOrderCompletionPercent: number | null;
  failedQualityChecks: number;
  warnings: string[];
}

const MAX_RECORDS_PER_QUERY = 40;
const MAX_EVIDENCE_PER_GROUP = 8;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const queries: Array<RecordQuery & { id: ReadId }> = [
  { id: 'material_requests', doctype: 'Material Request', fields: ['status', 'material_request_type', 'transaction_date', 'schedule_date', 'modified'], filters: [['docstatus', '<', 2]], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
  { id: 'purchase_orders', doctype: 'Purchase Order', fields: ['status', 'supplier', 'transaction_date', 'schedule_date', 'grand_total', 'modified'], filters: [['docstatus', '<', 2]], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
  // A stockout is objective evidence. "Low stock" requires a user-configured threshold and is deliberately not invented here.
  { id: 'stockouts', doctype: 'Bin', fields: ['item_code', 'warehouse', 'actual_qty', 'modified'], filters: [['actual_qty', '<=', 0]], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
  { id: 'delivery_notes', doctype: 'Delivery Note', fields: ['status', 'customer', 'posting_date', 'modified'], filters: [['docstatus', '<', 2]], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
  { id: 'pick_lists', doctype: 'Pick List', fields: ['status', 'purpose', 'modified'], filters: [['docstatus', '<', 2]], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
  { id: 'shipments', doctype: 'Shipment', fields: ['status', 'modified'], filters: [], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
  { id: 'delivery_trips', doctype: 'Delivery Trip', fields: ['status', 'departure_time', 'driver', 'vehicle', 'modified'], filters: [], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
  { id: 'work_orders', doctype: 'Work Order', fields: ['status', 'production_item', 'qty', 'produced_qty', 'planned_start_date', 'modified'], filters: [['docstatus', '<', 2]], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
  { id: 'job_cards', doctype: 'Job Card', fields: ['status', 'work_order', 'operation', 'for_quantity', 'total_completed_qty', 'modified'], filters: [['docstatus', '<', 2]], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
  { id: 'maintenance_schedules', doctype: 'Maintenance Schedule', fields: ['status', 'transaction_date', 'modified'], filters: [], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
  { id: 'issues', doctype: 'Issue', fields: ['status', 'priority', 'subject', 'opening_date', 'modified'], filters: [], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
  { id: 'quality_inspections', doctype: 'Quality Inspection', fields: ['status', 'inspection_type', 'reference_type', 'reference_name', 'modified'], filters: [], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
  { id: 'warranty_claims', doctype: 'Warranty Claim', fields: ['status', 'customer', 'complaint_date', 'modified'], filters: [], limit: MAX_RECORDS_PER_QUERY, pageSize: MAX_RECORDS_PER_QUERY },
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function isOpen(status: unknown): boolean {
  const value = text(status);
  return !value || !/closed|cancelled|completed|stopped|delivered|received|billed|submitted|resolved/i.test(value);
}

function isFailedQuality(status: unknown): boolean {
  return /reject|fail|not accepted/i.test(text(status));
}

function labelFor(row: ErpNextGenericRecord, fallback: string): string {
  return text(row.subject) || text(row.item_code) || text(row.production_item) || text(row.name) || fallback;
}

function detailFor(row: ErpNextGenericRecord, fields: string[]): string | undefined {
  const parts = fields.map(field => text(row[field])).filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

function recordEvidence(creds: ErpNextCreds, doctype: string, row: ErpNextGenericRecord, detailFields: string[] = []): OperationsEvidence | null {
  const sourceId = text(row.name);
  if (!sourceId) return null;
  return {
    id: `${doctype}:${sourceId}`,
    label: labelFor(row, sourceId),
    detail: detailFor(row, detailFields),
    sourceDoctype: doctype,
    sourceId,
    status: text(row.status) || undefined,
    href: erpnextDeskRecordUrl(creds, doctype, sourceId),
  };
}

function rowsFor(rows: QueryRows, id: ReadId): ErpNextGenericRecord[] {
  return rows[id] ?? [];
}

function failuresFor(failures: QueryFailure, ids: ReadId[]): string[] {
  return ids.flatMap(id => failures[id] ? [`${id.replace(/_/g, ' ')}: ${failures[id]}`] : []);
}

function buildGroup(
  key: OperationsGroupKey,
  label: string,
  sourceDoctypes: string[],
  failedReads: string[],
  queues: OperationsQueue[],
  exceptions: OperationsException[],
  evidence: OperationsEvidence[],
  recommendations: OperationsRecommendation[],
  creds: ErpNextCreds,
): OperationsSnapshotGroup {
  return {
    key,
    label,
    status: failedReads.length ? 'partial' : 'ready',
    queues,
    exceptions,
    evidence: evidence.slice(0, MAX_EVIDENCE_PER_GROUP),
    recommendations,
    actions: sourceDoctypes.map(doctype => ({ id: `list:${doctype}`, label: `Open ${doctype}`, sourceDoctype: doctype, href: erpnextDeskListUrl(creds, doctype) })),
  };
}

function snapshotGroups(creds: ErpNextCreds, rows: QueryRows, failures: QueryFailure): OperationsSnapshotGroup[] {
  const materialRequests = rowsFor(rows, 'material_requests').filter(row => isOpen(row.status));
  const purchaseOrders = rowsFor(rows, 'purchase_orders').filter(row => isOpen(row.status));
  const stockouts = rowsFor(rows, 'stockouts');
  const deliveryNotes = rowsFor(rows, 'delivery_notes').filter(row => isOpen(row.status));
  const pickLists = rowsFor(rows, 'pick_lists').filter(row => isOpen(row.status));
  const shipments = rowsFor(rows, 'shipments').filter(row => isOpen(row.status));
  const deliveryTrips = rowsFor(rows, 'delivery_trips').filter(row => isOpen(row.status));
  const workOrders = rowsFor(rows, 'work_orders').filter(row => isOpen(row.status));
  const jobCards = rowsFor(rows, 'job_cards').filter(row => isOpen(row.status));
  const maintenanceSchedules = rowsFor(rows, 'maintenance_schedules').filter(row => isOpen(row.status));
  const issues = rowsFor(rows, 'issues').filter(row => isOpen(row.status));
  const failedQuality = rowsFor(rows, 'quality_inspections').filter(row => isFailedQuality(row.status));
  const warrantyClaims = rowsFor(rows, 'warranty_claims').filter(row => isOpen(row.status));

  const supplyExceptions = stockouts.map(row => recordEvidence(creds, 'Bin', row, ['warehouse', 'actual_qty'])).filter((item): item is OperationsEvidence => Boolean(item)).map(item => ({ ...item, severity: 'critical' as const }));
  const fulfilmentExceptions = [
    ...deliveryNotes.map(row => recordEvidence(creds, 'Delivery Note', row, ['customer', 'posting_date'])),
    ...pickLists.map(row => recordEvidence(creds, 'Pick List', row, ['purpose'])),
    ...shipments.map(row => recordEvidence(creds, 'Shipment', row)),
    ...deliveryTrips.map(row => recordEvidence(creds, 'Delivery Trip', row, ['driver', 'vehicle'])),
  ].filter((item): item is OperationsEvidence => Boolean(item)).slice(0, MAX_EVIDENCE_PER_GROUP).map(item => ({ ...item, severity: 'warning' as const }));
  const productionExceptions = [
    ...workOrders.map(row => recordEvidence(creds, 'Work Order', row, ['production_item', 'planned_start_date'])),
    ...jobCards.map(row => recordEvidence(creds, 'Job Card', row, ['operation', 'work_order'])),
    ...maintenanceSchedules.map(row => recordEvidence(creds, 'Maintenance Schedule', row, ['transaction_date'])),
  ].filter((item): item is OperationsEvidence => Boolean(item)).slice(0, MAX_EVIDENCE_PER_GROUP).map(item => ({ ...item, severity: 'warning' as const }));
  const serviceExceptions = [
    ...issues.map(row => recordEvidence(creds, 'Issue', row, ['priority', 'opening_date'])),
    ...failedQuality.map(row => recordEvidence(creds, 'Quality Inspection', row, ['inspection_type', 'reference_type', 'reference_name'])),
    ...warrantyClaims.map(row => recordEvidence(creds, 'Warranty Claim', row, ['customer', 'complaint_date'])),
  ].filter((item): item is OperationsEvidence => Boolean(item)).slice(0, MAX_EVIDENCE_PER_GROUP).map(item => ({ ...item, severity: item.sourceDoctype === 'Quality Inspection' ? 'critical' as const : 'warning' as const }));

  return [
    buildGroup(
      'supply_procurement', 'Supply & procurement', ['Material Request', 'Purchase Order', 'Bin'],
      failuresFor(failures, ['material_requests', 'purchase_orders', 'stockouts']),
      [
        { id: 'open_material_requests', label: 'Open material requests', value: materialRequests.length, sourceDoctype: 'Material Request', href: erpnextDeskListUrl(creds, 'Material Request') },
        { id: 'open_purchase_orders', label: 'Open purchase orders', value: purchaseOrders.length, sourceDoctype: 'Purchase Order', href: erpnextDeskListUrl(creds, 'Purchase Order') },
        { id: 'stockouts', label: 'Stockout positions', value: stockouts.length, sourceDoctype: 'Bin', href: erpnextDeskListUrl(creds, 'Bin') },
      ],
      supplyExceptions,
      [...materialRequests, ...purchaseOrders].map(row => recordEvidence(creds, text(row.supplier) ? 'Purchase Order' : 'Material Request', row, ['supplier', 'schedule_date', 'material_request_type'])).filter((item): item is OperationsEvidence => Boolean(item)),
      stockouts.length ? [{ id: 'resolve_stockouts', label: 'Resolve stockouts', reason: `${stockouts.length} inventory position(s) have zero or negative quantity in ERPNext.`, severity: 'critical' }] : [],
      creds,
    ),
    buildGroup(
      'fulfilment_logistics', 'Fulfilment & logistics', ['Delivery Note', 'Pick List', 'Shipment', 'Delivery Trip'],
      failuresFor(failures, ['delivery_notes', 'pick_lists', 'shipments', 'delivery_trips']),
      [
        { id: 'open_delivery_notes', label: 'Open delivery notes', value: deliveryNotes.length, sourceDoctype: 'Delivery Note', href: erpnextDeskListUrl(creds, 'Delivery Note') },
        { id: 'open_pick_lists', label: 'Open pick lists', value: pickLists.length, sourceDoctype: 'Pick List', href: erpnextDeskListUrl(creds, 'Pick List') },
        { id: 'open_shipments', label: 'Open shipments', value: shipments.length, sourceDoctype: 'Shipment', href: erpnextDeskListUrl(creds, 'Shipment') },
      ],
      fulfilmentExceptions,
      [...deliveryNotes, ...pickLists, ...shipments, ...deliveryTrips].map(row => {
        const doctype = row.customer ? 'Delivery Note' : row.purpose ? 'Pick List' : row.driver ? 'Delivery Trip' : 'Shipment';
        return recordEvidence(creds, doctype, row, ['customer', 'purpose', 'posting_date', 'departure_time']);
      }).filter((item): item is OperationsEvidence => Boolean(item)),
      fulfilmentExceptions.length ? [{ id: 'review_outbound_work', label: 'Review outbound work', reason: `${fulfilmentExceptions.length} delivery, picking, shipment, or trip record(s) are still open.`, severity: 'warning' }] : [],
      creds,
    ),
    buildGroup(
      'production_capacity', 'Production & capacity', ['Work Order', 'Job Card', 'Maintenance Schedule'],
      failuresFor(failures, ['work_orders', 'job_cards', 'maintenance_schedules']),
      [
        { id: 'open_work_orders', label: 'Open work orders', value: workOrders.length, sourceDoctype: 'Work Order', href: erpnextDeskListUrl(creds, 'Work Order') },
        { id: 'open_job_cards', label: 'Open job cards', value: jobCards.length, sourceDoctype: 'Job Card', href: erpnextDeskListUrl(creds, 'Job Card') },
        { id: 'open_maintenance_schedules', label: 'Open maintenance schedules', value: maintenanceSchedules.length, sourceDoctype: 'Maintenance Schedule', href: erpnextDeskListUrl(creds, 'Maintenance Schedule') },
      ],
      productionExceptions,
      [...workOrders, ...jobCards, ...maintenanceSchedules].map(row => {
        const doctype = row.production_item ? 'Work Order' : row.operation ? 'Job Card' : 'Maintenance Schedule';
        return recordEvidence(creds, doctype, row, ['production_item', 'operation', 'planned_start_date', 'transaction_date']);
      }).filter((item): item is OperationsEvidence => Boolean(item)),
      productionExceptions.length ? [{ id: 'review_capacity_queue', label: 'Review production queue', reason: `${productionExceptions.length} production, job-card, or maintenance record(s) are open in ERPNext.`, severity: 'warning' }] : [],
      creds,
    ),
    buildGroup(
      'service_quality', 'Service & quality', ['Issue', 'Quality Inspection', 'Warranty Claim'],
      failuresFor(failures, ['issues', 'quality_inspections', 'warranty_claims']),
      [
        { id: 'open_issues', label: 'Open issues', value: issues.length, sourceDoctype: 'Issue', href: erpnextDeskListUrl(creds, 'Issue') },
        { id: 'failed_quality_checks', label: 'Failed or rejected inspections', value: failedQuality.length, sourceDoctype: 'Quality Inspection', href: erpnextDeskListUrl(creds, 'Quality Inspection') },
        { id: 'open_warranty_claims', label: 'Open warranty claims', value: warrantyClaims.length, sourceDoctype: 'Warranty Claim', href: erpnextDeskListUrl(creds, 'Warranty Claim') },
      ],
      serviceExceptions,
      [...issues, ...failedQuality, ...warrantyClaims].map(row => {
        const doctype = row.subject ? 'Issue' : row.inspection_type ? 'Quality Inspection' : 'Warranty Claim';
        return recordEvidence(creds, doctype, row, ['priority', 'inspection_type', 'customer', 'complaint_date']);
      }).filter((item): item is OperationsEvidence => Boolean(item)),
      failedQuality.length ? [{ id: 'review_quality_failures', label: 'Review quality failures', reason: `${failedQuality.length} quality inspection(s) are failed or rejected in ERPNext.`, severity: 'critical' }] : issues.length || warrantyClaims.length ? [{ id: 'triage_service_queue', label: 'Triage service queue', reason: `${issues.length + warrantyClaims.length} open issue or warranty record(s) need review.`, severity: 'warning' }] : [],
      creds,
    ),
  ];
}

async function resolveProcessCapacityNode(companyId: string, nodeId: string): Promise<FocusNodeRow | null> {
  if (!UUID_PATTERN.test(nodeId)) return null;
  const { rows } = await pool.query<FocusNodeRow>(
    `SELECT n.id, n.label
       FROM public.department_bdt_nodes n
       JOIN public.departments d ON d.id = n.department_id AND d.company_id = n.company_id
      WHERE n.id = $1
        AND n.company_id = $2
        AND d.source_key = 'dept_operations'
        AND n.metadata->>'sourceKey' = 'ops_process_capacity'
        AND n.metadata->>'taxonomyVersion' = 'v4'
      LIMIT 1`,
    [nodeId, companyId],
  );
  return rows[0] ?? null;
}

async function readOperations(companyId: string): Promise<{ rows: QueryRows; failures: QueryFailure }> {
  const rows: QueryRows = {};
  const failures: QueryFailure = {};
  let results: Awaited<ReturnType<typeof queryRecords>>;
  try {
    results = await queryRecords(companyId, queries);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const query of queries) failures[query.id] = message;
    return { rows, failures };
  }
  for (const result of results) {
    const id = result.id as ReadId;
    if (!queries.some(query => query.id === id)) continue;
    if (result.ok) rows[id] = result.rows as ErpNextGenericRecord[];
    else failures[id] = result.error.message;
  }
  // A malformed/incomplete batch response is partial evidence, never an empty success state.
  for (const query of queries) {
    if (!(query.id in rows) && !(query.id in failures)) failures[query.id] = 'No result returned by ERPNext.';
  }
  return { rows, failures };
}

/**
 * Metric bootstrap/refresh helper. It deliberately performs a separate, bounded
 * batch read because low-stock is a user-defined rule and cannot be inferred from
 * the focus snapshot's objective stockout exception list.
 */
export async function readOperationsMetricInputs(companyId: string, traceId?: string): Promise<OperationsMetricInputs> {
  const metricQueries: Array<RecordQuery & { id: string }> = [
    queries.find(query => query.id === 'material_requests')!,
    queries.find(query => query.id === 'purchase_orders')!,
    queries.find(query => query.id === 'work_orders')!,
    queries.find(query => query.id === 'quality_inspections')!,
    { id: 'stock_positions', doctype: 'Bin', fields: ['item_code', 'warehouse', 'actual_qty'], filters: [], limit: 1000, pageSize: 1000 },
  ];
  let results: Awaited<ReturnType<typeof queryRecords>>;
  try {
    results = await queryRecords(companyId, metricQueries, { traceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      openMaterialRequests: 0, openPurchaseOrders: 0, stockPositions: [], openWorkOrders: 0,
      workOrderCompletion: { plannedQty: 0, producedQty: 0, percent: null }, failedOrRejectedQualityChecks: 0,
      warnings: [`ERPNext: ${message}`],
    };
  }
  const byId = new Map(results.map(result => [result.id, result]));
  const failed = (id: string) => {
    const result = byId.get(id);
    return !result || !result.ok ? `${id.replace(/_/g, ' ')}: ${result && !result.ok ? result.error.message : 'No result returned by ERPNext.'}` : null;
  };
  const rows = (id: string): ErpNextGenericRecord[] => {
    const result = byId.get(id);
    return result?.ok ? result.rows as ErpNextGenericRecord[] : [];
  };
  const workOrders = rows('work_orders');
  const plannedQty = workOrders.reduce((sum, row) => sum + (Number(row.qty) || 0), 0);
  const producedQty = workOrders.reduce((sum, row) => sum + (Number(row.produced_qty) || 0), 0);
  return {
    openMaterialRequests: rows('material_requests').filter(row => isOpen(row.status)).length,
    openPurchaseOrders: rows('purchase_orders').filter(row => isOpen(row.status)).length,
    stockPositions: rows('stock_positions').map(row => ({ itemCode: text(row.item_code), warehouse: text(row.warehouse), actualQty: Number(row.actual_qty) || 0 })).filter(row => row.itemCode && row.warehouse),
    openWorkOrders: workOrders.filter(row => isOpen(row.status)).length,
    workOrderCompletion: { plannedQty, producedQty, percent: plannedQty > 0 ? Math.round((producedQty / plannedQty) * 10000) / 100 : null },
    failedOrRejectedQualityChecks: rows('quality_inspections').filter(row => isFailedQuality(row.status)).length,
    warnings: metricQueries.map(query => failed(query.id)).filter((warning): warning is string => Boolean(warning)),
  };
}

export async function readOperationsMetricSnapshot(
  companyId: string,
  options: { lowStockThreshold?: number; traceId?: string } = {},
): Promise<OperationsMetricSnapshot> {
  const inputs = await readOperationsMetricInputs(companyId, options.traceId);
  const threshold = options.lowStockThreshold;
  const lowStockPositions = typeof threshold === 'number' && Number.isFinite(threshold)
    ? inputs.stockPositions.filter(position => position.actualQty < threshold).length
    : null;
  return {
    openMaterialRequests: inputs.openMaterialRequests,
    openPurchaseOrders: inputs.openPurchaseOrders,
    lowStockPositions,
    openWorkOrders: inputs.openWorkOrders,
    workOrderCompletionPercent: inputs.workOrderCompletion.percent,
    failedQualityChecks: inputs.failedOrRejectedQualityChecks,
    warnings: inputs.warnings,
  };
}

export async function buildOperationsSnapshot(companyId: string, nodeId: string): Promise<OperationsSnapshot | null> {
  const node = await resolveProcessCapacityNode(companyId, nodeId);
  if (!node) return null;

  const generatedAt = new Date().toISOString();
  const creds = await resolveErpNextCreds(companyId);
  if (!creds) {
    return {
      status: 'not_configured', generatedAt, nodeId: node.id, nodeLabel: node.label, groups: [], warnings: [],
      message: await getErpNextNotConfiguredMessage(companyId),
    };
  }

  const { rows, failures } = await readOperations(companyId);
  const groups = snapshotGroups(creds, rows, failures);
  const warnings = Object.entries(failures).map(([id, message]) => `${id.replace(/_/g, ' ')}: ${message}`);
  return {
    status: warnings.length ? 'partial' : 'ready', generatedAt, siteName: creds.siteName,
    nodeId: node.id, nodeLabel: node.label, groups, warnings,
  };
}

erpnextOperationsRouter.get('/snapshot', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  const nodeId = typeof req.query.nodeId === 'string' ? req.query.nodeId : '';
  if (!nodeId) return res.status(400).json({ error: 'node_id_required' });

  const snapshot = await buildOperationsSnapshot(companyId, nodeId);
  if (!snapshot) return res.status(404).json({ error: 'operations_focus_not_found' });
  if (snapshot.status === 'not_configured') {
    return res.status(503).json({ error: 'erpnext_not_configured', message: snapshot.message });
  }
  return res.json(snapshot);
});
