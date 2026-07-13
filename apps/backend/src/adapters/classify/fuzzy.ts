import type { ClassificationOutput } from './types.js';

const CANONICAL_LABELS: Record<string, string> = {
  revenue: 'revenue',
  mrr: 'mrr',
  arr: 'arr',
  burn: 'burn',
  cash: 'cash',
  headcount: 'headcount',
  'ad spend': 'ad_spend',
  signups: 'signups',
  cac: 'cac',
  ltv: 'ltv',
  cogs: 'cost_of_goods_sold',
  opex: 'operating_expenses',
  'operating expenses': 'operating_expenses',
  'gross margin': 'gross_margin_pct',
};

function normalizeFuzzyLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9% ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

export function classifyWithFuzzy(label: string): ClassificationOutput | null {
  const normalized = normalizeFuzzyLabel(label);
  if (normalized.length < 3) return null;

  let best: { label: string; key: string; score: number } | null = null;
  for (const [candidate, key] of Object.entries(CANONICAL_LABELS)) {
    const dist = editDistance(normalized, candidate);
    const score = 1 - dist / Math.max(normalized.length, candidate.length);
    if (!best || score > best.score) best = { label: candidate, key, score };
  }

  if (!best || best.score < 0.82) return null;
  return {
    role: 'metric',
    target_key: best.key,
    confidence: Math.min(0.9, Math.round(best.score * 100) / 100),
    reasoning: `Fuzzy matched "${normalized}" to "${best.label}"`,
  };
}
