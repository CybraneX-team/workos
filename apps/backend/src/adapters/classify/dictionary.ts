import type { ClassificationOutput } from './types.js';
import { classifyWithFuzzy } from './fuzzy.js';

const SYNONYMS: Record<string, string> = {
  revenue: 'revenue',
  revenues: 'revenue',
  sales: 'revenue',
  'net sales': 'revenue',
  'total revenue': 'revenue',
  'top line': 'revenue',
  mrr: 'mrr',
  arr: 'arr',
  burn: 'burn',
  'burn rate': 'burn',
  'net burn': 'burn',
  cash: 'cash',
  'cash balance': 'cash',
  'ending cash': 'cash',
  headcount: 'headcount',
  employees: 'headcount',
  'team size': 'headcount',
  'ad spend': 'ad_spend',
  'marketing spend': 'ad_spend',
  signups: 'signups',
  'new signups': 'signups',
  cac: 'cac',
  ltv: 'ltv',
  cogs: 'cost_of_goods_sold',
  'cost of goods sold': 'cost_of_goods_sold',
  'cost of revenue': 'cost_of_goods_sold',
  opex: 'operating_expenses',
  'operating expenses': 'operating_expenses',
  'gross margin %': 'gross_margin_pct',
  'gross margin pct': 'gross_margin_pct',
  'gross margin percentage': 'gross_margin_pct',
};

export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9% ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyWithDictionary(label: string): ClassificationOutput {
  const normalized = normalizeLabel(label);
  if (!normalized) {
    return { role: 'exclude', target_key: null, confidence: 0.1 };
  }

  if (SYNONYMS[normalized]) {
    return {
      role: 'metric',
      target_key: SYNONYMS[normalized],
      confidence: 0.95,
      reasoning: `Dictionary matched "${normalized}"`,
    };
  }

  const fuzzy = classifyWithFuzzy(label);
  if (fuzzy) return fuzzy;

  const snake = normalized.replace(/\s+/g, '_');
  if (/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)?$/.test(snake)) {
    return {
      role: 'metric',
      target_key: snake,
      confidence: 0.75,
      reasoning: `Normalized label to "${snake}"`,
    };
  }

  return {
    role: 'metric',
    target_key: null,
    confidence: 0.35,
    reasoning: `No dictionary match for "${normalized}"`,
  };
}
