import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type {
  MetricTargetType,
  MetricStatus,
  CanonicalMetric,
  MetricRollup,
  CreateMetricInput,
  MetricDraftResponse,
} from '@cybranex/metrics';

// Types + pure format/permission helpers are owned by @cybranex/metrics (single
// source of truth shared with the backend). Re-export so existing consumers can
// keep importing them from this module.
export type {
  MetricValueType,
  MetricDirection,
  MetricStatus,
  MetricSourceType,
  MetricTargetType,
  MetricLinkRelation,
  MetricLink,
  MetricSource,
  MetricValue,
  CanonicalMetric,
  MetricRollup,
  CreateMetricInput,
  MetricDraftField,
  MetricDraftInput,
  MetricDraftResponse,
} from '@cybranex/metrics';
export { formatMetricValue, formatMetricTarget, isMetricAdmin, scoreMetric } from '@cybranex/metrics';

/** Company vs. department scope, derived from the metric's links. */
export function metricScope(m: CanonicalMetric): 'company' | 'department' {
  return m.links.some((l) => l.target_type === 'department') ? 'department' : 'company';
}

/**
 * Direction-aware 0–100 progress for display. Uses the server-computed
 * `normalized_score` (produced by the canonical `scoreMetric`), so the UI can no
 * longer disagree with the backend the way the old `bdtMetricProgress` did.
 */
export function metricProgress(m: CanonicalMetric): number {
  return Math.max(0, Math.min(100, Math.round(m.normalized_score ?? 0)));
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
