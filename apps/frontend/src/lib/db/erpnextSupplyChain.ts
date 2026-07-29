import { api } from '../api';
import type { CanonicalMetric } from '@cybranex/metrics';

/** Server-validated read-only evidence for the Operations V4 control tower. */
export type ErpNextOperationsSnapshotStatus = 'ready' | 'partial' | 'not_configured';
export type ErpNextOperationsDomainKey =
  | 'supply_procurement'
  | 'fulfilment_logistics'
  | 'production_capacity'
  | 'service_quality';
export type ErpNextOperationsSeverity = 'info' | 'warning' | 'critical';

export interface ErpNextOperationsDeskLink {
  id: string;
  label: string;
  sourceDoctype: string;
  href: string;
}

export interface ErpNextOperationsQueue extends ErpNextOperationsDeskLink {
  value: number;
}

export interface ErpNextOperationsEvidence {
  id: string;
  label: string;
  sourceDoctype: string;
  href?: string;
  detail?: string;
  sourceId?: string;
  status?: string;
}

export interface ErpNextOperationsException extends ErpNextOperationsEvidence {
  severity: ErpNextOperationsSeverity;
}

export interface ErpNextOperationsRecommendation {
  id: string;
  label: string;
  reason: string;
  severity: ErpNextOperationsSeverity;
}

export interface ErpNextOperationsSnapshotGroup {
  key: ErpNextOperationsDomainKey;
  label: string;
  status: 'ready' | 'partial';
  queues: ErpNextOperationsQueue[];
  exceptions: ErpNextOperationsException[];
  evidence: ErpNextOperationsEvidence[];
  recommendations: ErpNextOperationsRecommendation[];
  actions: ErpNextOperationsDeskLink[];
}

export interface ErpNextOperationsSnapshot {
  status: ErpNextOperationsSnapshotStatus;
  generatedAt: string;
  siteName?: string;
  nodeId: string;
  nodeLabel: string;
  groups: ErpNextOperationsSnapshotGroup[];
  warnings: string[];
  message?: string;
}

export function fetchErpNextOperationsSnapshot(nodeId: string) {
  return api.get<ErpNextOperationsSnapshot>(`/api/erpnext/operations/snapshot?${new URLSearchParams({ nodeId })}`);
}

export type ErpNextOperationsMetricKey =
  | 'open_material_requests'
  | 'open_purchase_orders'
  | 'low_stock_positions'
  | 'open_work_orders'
  | 'work_order_completion_percent'
  | 'failed_quality_checks';

export function fetchErpNextOperationsMetrics(companyId: string) {
  return api.get<CanonicalMetric[]>(`/api/metrics/${encodeURIComponent(companyId)}/integrations/erpnext-operations`);
}

export function bootstrapErpNextOperationsMetrics(companyId: string) {
  return api.post<CanonicalMetric[]>(`/api/metrics/${encodeURIComponent(companyId)}/integrations/erpnext-operations`, {});
}

export function refreshErpNextOperationsMetrics(companyId: string) {
  return api.post<CanonicalMetric[]>(`/api/metrics/${encodeURIComponent(companyId)}/integrations/erpnext-operations/refresh`, {});
}

export function configureErpNextOperationsMetric(companyId: string, metricKey: ErpNextOperationsMetricKey, input: {
  target: number;
  ownerMemberId: string;
  weight?: number;
  lowStockThreshold?: number;
}) {
  return api.put<CanonicalMetric[]>(`/api/metrics/${encodeURIComponent(companyId)}/integrations/erpnext-operations/${encodeURIComponent(metricKey)}`, input);
}
