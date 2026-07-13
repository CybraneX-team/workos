import { useEffect, useState } from 'react';
import { api } from './api';

// Health-overlay logic + types now live in @cybranex/metrics (shared with the
// backend). Re-export so existing consumers can keep importing from here.
export { computeHealth, KPI_TO_METRIC } from '@cybranex/metrics';
export type { NodeStatus, HealthOverlay } from '@cybranex/metrics';

/**
 * Latest company metric snapshot (revenue/burn/headcount/runway/…), sourced from
 * the metrics-onboarding endpoint — the single source of truth for company-level
 * figures. Shape is a flat `Record<string, number>` ready for `computeHealth`.
 */
export function useCompanyLatestMetrics(companyId: string | null | undefined): Record<string, number> {
  const [metrics, setMetrics] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!companyId) {
      setMetrics({});
      return;
    }
    let cancelled = false;
    api.get<Record<string, number> | null>(`/api/metrics-onboarding/${companyId}/latest`)
      .then((m) => { if (!cancelled) setMetrics(m ?? {}); })
      .catch(() => { if (!cancelled) setMetrics({}); });
    return () => { cancelled = true; };
  }, [companyId]);

  return metrics;
}
