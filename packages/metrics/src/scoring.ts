import type { MetricDirection } from './types.js';

/**
 * Normalize a raw metric value to a 0–100 score given its baseline/target and
 * direction. Direction-aware: `lower_is_better` inverts, `target_band` measures
 * proximity to target. Returns null when the value is unscorable (missing, or
 * baseline === target for a monotonic direction).
 *
 * This is THE canonical normalization for the whole system — the backend calls
 * it at metric-write time to persist `normalized_score`, and the frontend uses
 * it to render progress. Do not fork this formula.
 */
export function scoreMetric(
  value: number | null,
  baseline: number,
  target: number,
  direction: MetricDirection,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (direction === 'target_band') {
    const span = Math.max(Math.abs(target - baseline), 1);
    return Math.max(0, Math.min(100, Math.round(100 - (Math.abs(value - target) / span) * 100)));
  }
  if (target === baseline) return null;
  const raw = direction === 'lower_is_better'
    ? ((baseline - value) / (baseline - target)) * 100
    : ((value - baseline) / (target - baseline)) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Weighted-mean health for a rollup target (bdt_node / department / goal).
 * Mirrors the SQL in `apps/backend/src/lib/canonicalMetrics.ts`
 * (`ROUND(SUM(score * weight) / NULLIF(SUM(weight), 0))`). Returns null when
 * total weight is zero (SQL: NULLIF → NULL), matching an uncovered target.
 *
 * NOTE: Postgres ROUND and JS Math.round agree on half-up for the non-negative
 * 0–100 domain these scores live in.
 */
export function rollupHealth(items: Array<{ score: number; weight: number }>): number | null {
  let weighted = 0;
  let totalWeight = 0;
  for (const { score, weight } of items) {
    weighted += score * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return Math.round(weighted / totalWeight);
}

/**
 * Company strategic score = ROUND(AVG(goal health scores)). Mirrors the final
 * aggregate in `recomputeCanonicalRollups`. Null when there are no goal rollups.
 */
export function strategicScore(goalScores: number[]): number | null {
  if (goalScores.length === 0) return null;
  const sum = goalScores.reduce((acc, s) => acc + s, 0);
  return Math.round(sum / goalScores.length);
}
