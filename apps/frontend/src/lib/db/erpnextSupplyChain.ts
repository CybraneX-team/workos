import { api } from '../api';

export type SupplyChainStatus = 'ready' | 'provisioning' | 'failed' | 'not_configured';
export type SupplyChainBranchKey =
  | 'inventory'
  | 'logistics'
  | 'shipping'
  | 'warehousing'
  | 'routing'
  | 'procurement_flow';

export interface SupplyChainCard {
  id: string;
  title: string;
  subtitle?: string;
  value?: string;
  status?: string;
  sourceDoctype: string;
  sourceId?: string;
}

export interface SupplyChainMetric {
  label: string;
  value: number | string;
  unit?: string;
}

export interface SupplyChainRecommendation {
  label: string;
  reason: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface SupplyChainBranch {
  key: SupplyChainBranchKey;
  label: string;
  connected: boolean;
  sourceDoctypes: string[];
  cards: SupplyChainCard[];
  metrics: SupplyChainMetric[];
  recommendedActions: SupplyChainRecommendation[];
}

export interface SupplyChainSummary {
  status: SupplyChainStatus;
  generatedAt: string;
  siteName?: string;
  warnings: string[];
  branches: SupplyChainBranch[];
}

export type ErpNextOpsStatus = 'ready' | 'not_configured' | 'unsupported' | 'partial';
export type ErpNextOpsTemplateKey =
  | 'procurement'
  | 'inventory_warehousing'
  | 'logistics_shipping'
  | 'service_delivery'
  | 'quality'
  | 'manufacturing_lean'
  | 'assets_resources'
  | 'rollup'
  | 'unsupported';
export type ErpNextOpsTone = 'good' | 'neutral' | 'warning' | 'critical';

export interface ErpNextOpsMetric {
  label: string;
  value: number | string;
  unit?: string;
}

export interface ErpNextOpsCard {
  id: string;
  title: string;
  subtitle?: string;
  value?: string;
  status?: string;
  sourceDoctype: string;
  sourceId?: string;
}

export interface ErpNextOpsMetricCard {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  description: string;
  tone: ErpNextOpsTone;
}

export interface ErpNextOpsBreakdown {
  id: string;
  title: string;
  items: Array<{
    label: string;
    value: number | string;
    unit?: string;
    tone?: ErpNextOpsTone;
  }>;
}

export interface ErpNextOpsInsight {
  id: string;
  label: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ErpNextOpsEvidence {
  id: string;
  label: string;
  sourceDoctype: string;
  sourceId: string;
  detail?: string;
  status?: string;
  attributes?: Array<{
    label: string;
    value: string | number;
    tone?: ErpNextOpsTone;
  }>;
}

export interface ErpNextOpsChildRollup {
  nodeId: string;
  nodeLabel: string;
  mappingLabel: string;
  status: ErpNextOpsStatus;
  templateKey: ErpNextOpsTemplateKey;
  healthScore: number | null;
  headline: string;
}

export interface ErpNextOpsRecommendation {
  label: string;
  reason: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ErpNextOpsNodeSummary {
  status: ErpNextOpsStatus;
  generatedAt: string;
  siteName?: string;
  department: 'Operations';
  nodeId: string;
  nodeLabel: string;
  path: string[];
  mappingKey: string;
  mappingLabel: string;
  templateKey: ErpNextOpsTemplateKey;
  headline: string;
  healthScore: number | null;
  sourceDoctypes: string[];
  metrics: ErpNextOpsMetric[];
  metricCards: ErpNextOpsMetricCard[];
  breakdowns: ErpNextOpsBreakdown[];
  insights: ErpNextOpsInsight[];
  cards: ErpNextOpsCard[];
  evidence: ErpNextOpsEvidence[];
  childRollups?: ErpNextOpsChildRollup[];
  recommendedActions: ErpNextOpsRecommendation[];
  warnings: string[];
  unsupportedReason?: string;
}

export function fetchSupplyChainSummary(options?: {
  lowStockThreshold?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (options?.lowStockThreshold !== undefined) {
    params.set('low_stock_threshold', String(options.lowStockThreshold));
  }
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return api.get<SupplyChainSummary>(`/api/erpnext/supply-chain/summary${suffix}`);
}

export function fetchErpNextOperationsNodeSummary(nodeId: string, options?: {
  limit?: number;
}) {
  const params = new URLSearchParams({ nodeId });
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  return api.get<ErpNextOpsNodeSummary>(`/api/erpnext/operations/node-summary?${params.toString()}`);
}
