import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

export interface LatestMetric {
  metric_key: string;
  value: number;
  unit: string;
  period_end: string;
}

interface CanonicalMetricRow {
  id: string;
  company_id: string;
  name: string;
  unit: string;
  direction: 'higher_is_better' | 'lower_is_better' | 'target_band';
  baseline_value: number | string;
  target_value: number | string;
  current_value: number | string;
  normalized_score: number | string;
  status: string;
  created_at: string;
  updated_at: string;
  links?: Array<{
    target_type: 'company' | 'department' | 'bdt_node' | 'goal';
    target_id: string;
  }>;
}

function metricKeyFor(name: string): string {
  const key = name.trim().toLowerCase();
  if (key.includes('mrr') || key.includes('revenue')) return 'revenue';
  if (key.includes('burn')) return 'burn';
  if (key.includes('cash')) return 'cash';
  if (key.includes('headcount') || key.includes('team size') || key.includes('employee')) return 'headcount';
  if (key.includes('sign')) return 'signups';
  if (key.includes('buyer')) return 'buyer_count';
  if (key.includes('conversion')) return 'conversion_rate';
  if (key.includes('order value') || key.includes('aov')) return 'avg_order_value';
  if (key.includes('cogs')) return 'cogs';
  if (key.includes('ltv')) return 'customer_ltv';
  if (key.includes('arpu')) return 'arpu';
  if (key.includes('cac') || key.includes('cpa')) return 'cpa';
  if (key.includes('margin')) return 'contribution_margin';
  return key.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'metric';
}

export function useCompanyMetrics(companyId: string | null | undefined) {
  const [metrics, setMetrics] = useState<Record<string, LatestMetric>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!companyId) {
      queueMicrotask(() => {
        if (cancelled) return;
        setMetrics({});
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    api.get<CanonicalMetricRow[]>(`/api/metrics/${companyId}?target_type=company&target_id=${companyId}&status=active`)
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, LatestMetric> = {};
        for (const r of rows) {
          const metric_key = metricKeyFor(r.name);
          next[metric_key] = {
            metric_key,
            value: Number(r.current_value),
            unit: r.unit,
            period_end: r.updated_at ?? r.created_at,
          };
        }
        setMetrics(next);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { metrics, loading, error };
}

// ── BDT Metrics (goal-aligned, backend-persisted) ─────────────────────────────

export interface BdtMetric {
  id: string;
  company_id: string;
  department_id: string | null;
  name: string;
  metric_key: string | null;
  scope: 'company' | 'department';
  value: number;
  target: number;
  baseline: number;
  unit: string;
  higher_is_better: boolean;
  trend: 'up' | 'down' | 'flat';
  alert_threshold: number | null;
  local_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BdtGoalMetricLink {
  id: string;
  goal_id: string;
  metric_id: string;
  company_id: string;
  contribution_weight: number;
  metric_name?: string;
  value?: number;
  target?: number;
  baseline?: number;
  unit?: string;
  higher_is_better?: boolean;
  trend?: string;
}

export interface BdtGoal {
  id: string;
  company_id: string;
  title: string;
  horizon: string;
  owner_id: string | null;
  local_id: string | null;
  created_at: string;
  updated_at: string;
  links: BdtGoalMetricLink[];
  progress: number | null;
}

export function useBdtMetrics(companyId: string | null | undefined) {
  const [metrics, setMetrics] = useState<BdtMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    api.get<CanonicalMetricRow[]>(`/api/metrics/${companyId}?status=active`)
      .then((rows) => {
        setMetrics(rows.map((row) => {
          const departmentLink = row.links?.find(link => link.target_type === 'department');
          return {
            id: row.id,
            company_id: row.company_id,
            department_id: departmentLink?.target_id ?? null,
            name: row.name,
            metric_key: metricKeyFor(row.name),
            scope: departmentLink ? 'department' : 'company',
            value: Number(row.current_value),
            target: Number(row.target_value),
            baseline: Number(row.baseline_value),
            unit: row.unit,
            higher_is_better: row.direction !== 'lower_is_better',
            trend: 'flat',
            alert_threshold: null,
            local_id: null,
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
        }));
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => { refetch(); }, [refetch]);

  const updateMetricValue = useCallback(async (
    metricId: string,
    newValue: number,
    reason?: string,
  ) => {
    if (!companyId) return;
    await api.post(`/api/metrics/${companyId}/${metricId}/values`, { raw_value: newValue, reason });
    refetch();
  }, [companyId, refetch]);

  return { metrics, loading, error, refetch, updateMetricValue };
}

export function useBdtGoals(companyId: string | null | undefined) {
  const [goals, setGoals] = useState<BdtGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    api.get<BdtGoal[]>(`/api/metrics/${companyId}/goals`)
      .then((rows) => { setGoals(rows); setError(null); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => { refetch(); }, [refetch]);

  const createGoal = useCallback(async (input: {
    title: string; horizon: string; owner_id?: string;
  }) => {
    if (!companyId) return;
    await api.post(`/api/metrics/${companyId}/goals`, input);
    refetch();
  }, [companyId, refetch]);

  const deleteGoal = useCallback(async (goalId: string) => {
    if (!companyId) return;
    await api.delete(`/api/metrics/${companyId}/goals/${goalId}`);
    refetch();
  }, [companyId, refetch]);

  const addMetricLink = useCallback(async (
    goalId: string,
    metricId: string,
    contributionWeight = 1.0,
  ) => {
    if (!companyId) return;
    await api.post(`/api/metrics/${companyId}/goals/${goalId}/links`, {
      metric_id: metricId, contribution_weight: contributionWeight,
    });
    refetch();
  }, [companyId, refetch]);

  return { goals, loading, error, refetch, createGoal, deleteGoal, addMetricLink };
}

// ── BDT helper functions (mirror of useGoalsStore helpers but for BdtMetric) ──

export function bdtMetricProgress(m: BdtMetric): number {
  const span = m.target - m.baseline;
  if (span === 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((m.value - m.baseline) / span) * 100)));
}

export function bdtMetricDisplay(m: BdtMetric): string {
  if (m.unit === '$') return `$${m.value.toLocaleString()}`;
  if (m.unit === '%') return `${m.value}%`;
  if (m.unit === 'mo') return `${m.value} mo`;
  return String(m.value);
}

export function bdtMetricTargetDisplay(m: BdtMetric): string {
  if (m.unit === '$') return `$${m.target.toLocaleString()}`;
  if (m.unit === '%') return `${m.target}%`;
  if (m.unit === 'mo') return `${m.target} mo`;
  return String(m.target);
}

export function bdtMetricAlerts(metrics: BdtMetric[]): { metricId: string; name: string; progress: number; threshold: number }[] {
  return metrics
    .filter(m => m.alert_threshold != null && bdtMetricProgress(m) < m.alert_threshold!)
    .map(m => ({ metricId: m.id, name: m.name, progress: bdtMetricProgress(m), threshold: m.alert_threshold! }));
}
