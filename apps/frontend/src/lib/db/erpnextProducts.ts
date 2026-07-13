import { api } from '../api';

export type ErpNextProductsStatus = 'ready' | 'not_configured' | 'unsupported' | 'partial';
export type ErpNextProductsTemplateKey = 'generic' | 'rollup' | 'unsupported';
export type ErpNextProductsTone = 'good' | 'neutral' | 'warning' | 'critical';

export interface ErpNextProductsMetric {
  label: string;
  value: number | string;
  unit?: string;
}

export interface ErpNextProductsCard {
  id: string;
  title: string;
  subtitle?: string;
  value?: string;
  status?: string;
  sourceDoctype: string;
  sourceId?: string;
}

export interface ErpNextProductsMetricCard {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  description: string;
  tone: ErpNextProductsTone;
}

export interface ErpNextProductsBreakdown {
  id: string;
  title: string;
  items: Array<{
    label: string;
    value: number | string;
    unit?: string;
    tone?: ErpNextProductsTone;
  }>;
}

export interface ErpNextProductsInsight {
  id: string;
  label: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ErpNextProductsEvidence {
  id: string;
  label: string;
  sourceDoctype: string;
  sourceId: string;
  detail?: string;
  status?: string;
}

export interface ErpNextProductsChildRollup {
  nodeId: string;
  nodeLabel: string;
  mappingLabel: string;
  status: ErpNextProductsStatus;
  templateKey: ErpNextProductsTemplateKey;
  healthScore: number | null;
  headline: string;
}

export interface ErpNextProductsRecommendation {
  label: string;
  reason: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ErpNextProductsNodeSummary {
  status: ErpNextProductsStatus;
  generatedAt: string;
  siteName?: string;
  department: 'Products';
  nodeId: string;
  nodeLabel: string;
  path: string[];
  mappingKey: string;
  mappingLabel: string;
  templateKey: ErpNextProductsTemplateKey;
  headline: string;
  healthScore: number | null;
  sourceDoctypes: string[];
  metrics: ErpNextProductsMetric[];
  metricCards: ErpNextProductsMetricCard[];
  breakdowns: ErpNextProductsBreakdown[];
  insights: ErpNextProductsInsight[];
  cards: ErpNextProductsCard[];
  evidence: ErpNextProductsEvidence[];
  childRollups?: ErpNextProductsChildRollup[];
  recommendedActions: ErpNextProductsRecommendation[];
  warnings: string[];
  unsupportedReason?: string;
}

export function fetchErpNextProductsNodeSummary(nodeId: string, options?: { limit?: number }) {
  const params = new URLSearchParams({ nodeId });
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  return api.get<ErpNextProductsNodeSummary>(`/api/erpnext/products/node-summary?${params.toString()}`);
}
