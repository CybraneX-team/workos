import { api } from '../api';

export type ErpNextSalesStatus = 'ready' | 'not_configured' | 'unsupported' | 'partial';
export type ErpNextSalesTemplateKey = 'generic' | 'rollup' | 'unsupported';
export type ErpNextSalesTone = 'good' | 'neutral' | 'warning' | 'critical';

export interface ErpNextSalesMetric {
  label: string;
  value: number | string;
  unit?: string;
}

export interface ErpNextSalesCard {
  id: string;
  title: string;
  subtitle?: string;
  value?: string;
  status?: string;
  sourceDoctype: string;
  sourceId?: string;
  href?: string;
}

export interface ErpNextSalesMetricCard {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  description: string;
  tone: ErpNextSalesTone;
}

export interface ErpNextSalesBreakdown {
  id: string;
  title: string;
  items: Array<{
    label: string;
    value: number | string;
    unit?: string;
    tone?: ErpNextSalesTone;
  }>;
}

export interface ErpNextSalesInsight {
  id: string;
  label: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ErpNextSalesEvidence {
  id: string;
  label: string;
  sourceDoctype: string;
  sourceId: string;
  detail?: string;
  status?: string;
  href?: string;
  attributes?: Array<{
    label: string;
    value: string | number;
    tone?: ErpNextSalesTone;
  }>;
}

export interface ErpNextSalesChildRollup {
  nodeId: string;
  nodeLabel: string;
  mappingLabel: string;
  status: ErpNextSalesStatus;
  templateKey: ErpNextSalesTemplateKey;
  healthScore: number | null;
  headline: string;
}

export interface ErpNextSalesRecommendation {
  label: string;
  reason: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ErpNextSalesDeskAction {
  id: string;
  label: string;
  kind: 'list' | 'new' | 'record';
  doctype: string;
  href: string;
}

export interface ErpNextSalesNodeSummary {
  status: ErpNextSalesStatus;
  generatedAt: string;
  siteName?: string;
  department: 'Sales';
  nodeId: string;
  nodeLabel: string;
  path: string[];
  mappingKey: string;
  mappingLabel: string;
  templateKey: ErpNextSalesTemplateKey;
  headline: string;
  healthScore: number | null;
  sourceDoctypes: string[];
  metrics: ErpNextSalesMetric[];
  metricCards: ErpNextSalesMetricCard[];
  breakdowns: ErpNextSalesBreakdown[];
  insights: ErpNextSalesInsight[];
  cards: ErpNextSalesCard[];
  evidence: ErpNextSalesEvidence[];
  childRollups?: ErpNextSalesChildRollup[];
  erpnextActions?: ErpNextSalesDeskAction[];
  recommendedActions: ErpNextSalesRecommendation[];
  warnings: string[];
  unsupportedReason?: string;
}

export function fetchErpNextSalesNodeSummary(nodeId: string, options?: { limit?: number }) {
  const params = new URLSearchParams({ nodeId });
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  return api.get<ErpNextSalesNodeSummary>(`/api/erpnext/sales/node-summary?${params.toString()}`);
}
