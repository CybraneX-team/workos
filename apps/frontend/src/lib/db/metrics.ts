import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

// ── BDT Goals (goal-aligned, backend-persisted) ───────────────────────────────
//
// This module used to also hold a `BdtMetric` client-side shim over the canonical
// metric rows. That shim was lossy (dropped links, hardcoded trend/alert/local_id)
// and drifted from the backend's scoring, so it was removed — all metric reads now
// go through `useCanonicalMetrics` + `CanonicalMetric` in ./canonicalMetrics.ts.
// Goals remain here because they are an independent concern.

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
