import assert from 'node:assert/strict';
import test from 'node:test';
import { rollupHealth, strategicScore } from '@cybranex/metrics';

// Guards the coupling between the pure formulas in @cybranex/metrics and the SQL
// in src/lib/canonicalMetrics.ts (recomputeCanonicalRollups). Rather than assert
// hardcoded constants, we independently re-implement the SQL arithmetic here and
// require it to agree with the package — two implementations, one formula.

/** SQL: ROUND(SUM(normalized_score * weight) / NULLIF(SUM(weight), 0)) */
function sqlWeightedMean(rows: Array<{ score: number; weight: number }>): number | null {
  const sumW = rows.reduce((a, r) => a + r.weight, 0);
  if (sumW === 0) return null; // NULLIF(sum, 0) → NULL → no row / null health
  const sumSW = rows.reduce((a, r) => a + r.score * r.weight, 0);
  return Math.round(sumSW / sumW);
}

/** SQL: ROUND(AVG(health_score)) over goal rollups */
function sqlAvg(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, s) => a + s, 0) / scores.length);
}

const WEIGHTED_FIXTURES: Array<Array<{ score: number; weight: number }>> = [
  [{ score: 80, weight: 1 }, { score: 40, weight: 1 }],
  [{ score: 90, weight: 3 }, { score: 50, weight: 1 }],
  [{ score: 100, weight: 2 }],
  [],
  [{ score: 73, weight: 2 }, { score: 61, weight: 5 }, { score: 88, weight: 1 }],
  [{ score: 90, weight: 0 }],
];

const AVG_FIXTURES: number[][] = [[80, 60], [90, 90, 91], [], [73, 61, 88], [100]];

test('rollupHealth matches the SQL weighted-mean on fixtures', () => {
  for (const rows of WEIGHTED_FIXTURES) {
    assert.equal(rollupHealth(rows), sqlWeightedMean(rows));
  }
});

test('strategicScore matches SQL AVG-then-ROUND on fixtures', () => {
  for (const scores of AVG_FIXTURES) {
    assert.equal(strategicScore(scores), sqlAvg(scores));
  }
});
