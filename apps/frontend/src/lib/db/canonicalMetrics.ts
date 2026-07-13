import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export type MetricValueType = 'number' | 'currency' | 'percent' | 'duration' | 'count' | 'ratio';
export type MetricDirection = 'higher_is_better' | 'lower_is_better' | 'target_band';
export type MetricStatus = 'active' | 'draft' | 'archived';
export type MetricSourceType = 'manual' | 'integration';
export type MetricTargetType = 'company' | 'department' | 'bdt_node' | 'goal';
export type MetricLinkRelation = 'owns' | 'measures' | 'drives' | 'health_component';

export interface MetricLink {
  id: string;
  metric_id: string;
  company_id: string;
  target_type: MetricTargetType;
  target_id: string;
  relation: MetricLinkRelation;
  weight: number;
  is_core: boolean;
  created_by: string | null;
  created_at: string;
}

export interface MetricSource {
  id: string;
  metric_id: string;
  company_id: string;
  source_type: MetricSourceType;
  label: string;
  config: Record<string, unknown>;
  confidence: number;
  created_by: string | null;
  created_at: string;
}

export interface MetricValue {
  id: string;
  metric_id: string;
  company_id: string;
  raw_value: number;
  normalized_score: number;
  period_start: string | null;
  period_end: string | null;
  source_type: MetricSourceType;
  source_id: string | null;
  source_confidence: number;
  reason: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface CanonicalMetric {
  id: string;
  company_id: string;
  name: string;
  description: string;
  unit: string;
  value_type: MetricValueType;
  direction: MetricDirection;
  baseline_value: number;
  target_value: number;
  current_value: number | null;
  normalized_score: number | null;
  owner_member_id: string | null;
  cadence: string;
  status: MetricStatus;
  source_confidence: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  links: MetricLink[];
  sources: MetricSource[];
  values?: MetricValue[];
}

export interface MetricRollup {
  id: string;
  company_id: string;
  target_type: MetricTargetType;
  target_id: string;
  health_score: number;
  metric_count: number;
  source_confidence: number;
  calculated_at: string;
}

export interface CreateMetricInput {
  name: string;
  description: string;
  unit: string;
  value_type: MetricValueType;
  direction: MetricDirection;
  baseline_value: number;
  target_value: number;
  current_value?: number;
  owner_member_id: string;
  cadence: string;
  source_type: 'manual';
  source_label?: string;
  source_confidence: number;
  links: Array<{
    target_type: MetricTargetType;
    target_id: string;
    relation: MetricLinkRelation;
    weight: number;
    is_core: boolean;
  }>;
}

export type MetricDraftField =
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

export interface MetricDraftInput {
  name: string;
  description: string;
  unit: string;
  value_type: MetricValueType | null;
  direction: MetricDirection | null;
  baseline_value: number | null;
  target_value: number | null;
  current_value: number | null;
  owner_member_id?: string | null;
  cadence: string;
  source_type: MetricSourceType | null;
  source_label?: string;
  source_confidence: number | null;
  links: Array<{
    target_type: MetricTargetType;
    target_id: string;
    relation: MetricLinkRelation;
    weight: number;
    is_core: boolean;
  }>;
}

export interface MetricDraftResponse {
  draft: MetricDraftInput;
  assumptions: string[];
  warnings: string[];
  missing_fields: MetricDraftField[];
  confidence: number;
  field_states: Array<{
    field: MetricDraftField;
    status: 'inferred' | 'assumed' | 'unresolved';
    message: string;
  }>;
  resolved_target?: {
    target_type: MetricTargetType;
    target_id: string;
    label: string;
    inferred: boolean;
  };
  resolved_owner?: {
    owner_member_id: string;
    label: string;
    inferred: boolean;
  };
}

export function formatMetricValue(metric: Pick<CanonicalMetric, 'unit' | 'current_value' | 'value_type'>): string {
  const value = Number(metric.current_value ?? 0);
  if (metric.unit === '$' || metric.value_type === 'currency') return `$${value.toLocaleString()}`;
  if (metric.unit === '%' || metric.value_type === 'percent') return `${value}%`;
  return metric.unit ? `${value} ${metric.unit}` : String(value);
}

export function formatMetricTarget(metric: Pick<CanonicalMetric, 'unit' | 'target_value' | 'value_type'>): string {
  const value = Number(metric.target_value ?? 0);
  if (metric.unit === '$' || metric.value_type === 'currency') return `$${value.toLocaleString()}`;
  if (metric.unit === '%' || metric.value_type === 'percent') return `${value}%`;
  return metric.unit ? `${value} ${metric.unit}` : String(value);
}

export function isMetricAdmin(role: string | null | undefined): boolean {
  return ['super_admin', 'founder', 'co_founder', 'admin'].includes(String(role ?? ''));
}

export function useCanonicalMetrics(companyId: string | null | undefined, filters?: {
  target_type?: MetricTargetType;
  target_id?: string;
  is_core?: boolean;
  status?: MetricStatus;
  search?: string;
}) {
  const [metrics, setMetrics] = useState<CanonicalMetric[]>([]);
  const [rollups, setRollups] = useState<MetricRollup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = new URLSearchParams();
  if (filters?.target_type) query.set('target_type', filters.target_type);
  if (filters?.target_id) query.set('target_id', filters.target_id);
  if (filters?.is_core !== undefined) query.set('is_core', String(filters.is_core));
  if (filters?.status) query.set('status', filters.status);
  if (filters?.search) query.set('search', filters.search);
  const queryString = query.toString();

  const refetch = useCallback(() => {
    if (!companyId) {
      setMetrics([]);
      setRollups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      api.get<CanonicalMetric[]>(`/api/metrics/${companyId}${queryString ? `?${queryString}` : ''}`),
      api.get<MetricRollup[]>(`/api/metrics/${companyId}/rollups`),
    ])
      .then(([metricRows, rollupRows]) => {
        setMetrics(metricRows);
        setRollups(rollupRows);
        setError(null);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [companyId, queryString]);

  useEffect(() => { refetch(); }, [refetch]);

  const createMetric = useCallback(async (input: CreateMetricInput) => {
    if (!companyId) return null;
    const result = await api.post<CanonicalMetric>(`/api/metrics/${companyId}`, input);
    refetch();
    return result;
  }, [companyId, refetch]);

  const createDraft = useCallback(async (input: {
    prompt: string;
    target_type?: MetricTargetType;
    target_id?: string;
  }) => {
    if (!companyId) return null;
    return api.post<MetricDraftResponse>(`/api/metrics/${companyId}/draft`, input);
  }, [companyId]);

  const updateMetricValue = useCallback(async (metricId: string, rawValue: number, reason?: string) => {
    if (!companyId) return null;
    const result = await api.post<CanonicalMetric>(`/api/metrics/${companyId}/${metricId}/values`, {
      raw_value: rawValue,
      reason,
      source_type: 'manual',
    });
    refetch();
    return result;
  }, [companyId, refetch]);

  return { metrics, rollups, loading, error, refetch, createMetric, createDraft, updateMetricValue };
}
