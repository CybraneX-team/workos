export type NodeStatus = 'healthy' | 'warning' | 'critical';

export interface HealthOverlay {
  nodeStatus: Record<string, NodeStatus>;
  nodeMetrics: Record<string, Record<string, number>>;
}

export const KPI_TO_METRIC: Record<string, string> = {
  'kpi-growth-cac': 'cac',
};

/**
 * Derive a company-node health overlay (runway status + surfaced figures) from a
 * flat map of latest company metric values (as returned by the
 * `metrics-onboarding /latest` endpoint). Runway is taken directly when present
 * (the onboarding snapshot stores it), else derived from cash / burn. Status:
 * <3mo critical, <6mo warning, else healthy.
 */
export function computeHealth(
  metrics: Record<string, number>,
  myCompanyNodeId: string | null,
): HealthOverlay {
  const nodeStatus: Record<string, NodeStatus> = {};
  const nodeMetrics: Record<string, Record<string, number>> = {};

  const cash = metrics.cash ?? null;
  const burn = metrics.burn ?? null;
  const revenue = metrics.revenue ?? null;
  const headcount = metrics.headcount ?? null;
  const explicitRunway = metrics.runway ?? null;

  if (myCompanyNodeId) {
    const runway = explicitRunway !== null
      ? explicitRunway
      : cash !== null && burn !== null && burn > 0 ? cash / burn : null;
    if (runway !== null) {
      nodeStatus[myCompanyNodeId] = runway < 3 ? 'critical' : runway < 6 ? 'warning' : 'healthy';
    }

    const merged: Record<string, number> = {};
    if (revenue !== null) merged.mrr = Number(revenue);
    if (headcount !== null) merged.team = Number(headcount);
    if (runway !== null) merged.runway_months = Math.round(runway * 10) / 10;
    if (Object.keys(merged).length > 0) {
      nodeMetrics[myCompanyNodeId] = merged;
    }
  }

  for (const [kpiId, metricKey] of Object.entries(KPI_TO_METRIC)) {
    const value = metrics[metricKey];
    if (value == null) continue;
    nodeMetrics[kpiId] = { value: Number(value) };
  }

  return { nodeStatus, nodeMetrics };
}
