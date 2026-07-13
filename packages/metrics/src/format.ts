import type { CanonicalMetric } from './types.js';

export function formatMetricValue(
  metric: Pick<CanonicalMetric, 'unit' | 'current_value' | 'value_type'>,
): string {
  const value = Number(metric.current_value ?? 0);
  if (metric.unit === '$' || metric.value_type === 'currency') return `$${value.toLocaleString()}`;
  if (metric.unit === '%' || metric.value_type === 'percent') return `${value}%`;
  return metric.unit ? `${value} ${metric.unit}` : String(value);
}

export function formatMetricTarget(
  metric: Pick<CanonicalMetric, 'unit' | 'target_value' | 'value_type'>,
): string {
  const value = Number(metric.target_value ?? 0);
  if (metric.unit === '$' || metric.value_type === 'currency') return `$${value.toLocaleString()}`;
  if (metric.unit === '%' || metric.value_type === 'percent') return `${value}%`;
  return metric.unit ? `${value} ${metric.unit}` : String(value);
}

export function isMetricAdmin(role: string | null | undefined): boolean {
  return ['super_admin', 'founder', 'co_founder', 'admin'].includes(String(role ?? ''));
}
