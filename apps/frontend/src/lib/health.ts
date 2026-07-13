import type { LatestMetric } from './db/metrics';

export type NodeStatus = 'healthy' | 'warning' | 'critical';

export interface HealthOverlay {
  nodeStatus: Record<string, NodeStatus>;
  nodeMetrics: Record<string, Record<string, number>>;
}

export const KPI_TO_METRIC: Record<string, string> = {
  'kpi-growth-cac': 'cac',
};

export function computeHealth(
  metrics: Record<string, LatestMetric>,
  myCompanyNodeId: string | null,
): HealthOverlay {
  const nodeStatus: Record<string, NodeStatus> = {};
  const nodeMetrics: Record<string, Record<string, number>> = {};

  const cash = metrics.cash?.value ?? null;
  const burn = metrics.burn?.value ?? null;
  const revenue = metrics.revenue?.value ?? null;
  const headcount = metrics.headcount?.value ?? null;

  if (myCompanyNodeId) {
    const runway = cash !== null && burn !== null && burn > 0 ? cash / burn : null;
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
    const metric = metrics[metricKey];
    if (!metric) continue;
    nodeMetrics[kpiId] = { value: Number(metric.value) };
  }

  return { nodeStatus, nodeMetrics };
}

