/**
 * Legacy local goal helpers.
 *
 * Canonical metrics are owned by lib/db/canonicalMetrics.ts. This file is kept
 * only for old local goal constants and compatibility with local project UI.
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'bdt_goals_v2';

export type Horizon = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'round' | '3yr' | 'long_term';
export type MetricScope = 'company' | 'department';
export type Trend = 'up' | 'down' | 'flat';

export interface Metric {
  id: string;
  name: string;
  scope: MetricScope;
  department?: string;
  value: number;
  target: number;
  baseline: number;
  unit: string;          // '$', '%', 'mo', ''
  /** does a higher number mean better? (churn/runway-burn = false) */
  higherIsBetter: boolean;
  trend: Trend;
  alertThreshold?: number; // warn when progress drops below this %
}

/** Tracks estimated vs actual impact of a task/decision on a metric */
export interface MetricImpact {
  id: string;
  metricId: string;
  taskId?: string;
  decisionId?: string;
  projectId: string;
  estimatedDelta: number;    // expected change in metric value (e.g. +5000 MRR)
  estimatedConfidence: number; // 0–100
  actualDelta?: number;      // set when task completes
  variance?: number;         // actualDelta - estimatedDelta
  createdAt: string;
  resolvedAt?: string;
}

/** One data point in a metric's value history */
export interface MetricHistoryPoint {
  metricId: string;
  value: number;
  at: string; // ISO
  reason?: string;
}

export interface Goal {
  id: string;
  title: string;
  horizon: Horizon;
  ownerId?: string;
  metricId?: string;
  createdAt: string;
}

interface GoalsState {
  goals: Goal[];
  metrics: Metric[];
  metricImpacts: MetricImpact[];
}

/* ── labels / order ──────────────────────────────────────────────────────── */

export const HORIZON_ORDER: Horizon[] = ['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'round', '3yr', 'long_term'];

export const HORIZON_META: Record<Horizon, { label: string; color: string }> = {
  daily:     { label: 'Daily',      color: '#94a3b8' },
  weekly:    { label: 'Weekly',     color: '#60a5fa' },
  monthly:   { label: 'Monthly',    color: '#22d3ee' },
  quarterly: { label: 'Quarterly',  color: '#34d399' },
  annual:    { label: 'Annual',     color: '#a78bfa' },
  round:     { label: 'Round-based', color: '#fbbf24' },
  '3yr':     { label: '3-year',     color: '#fb7185' },
  long_term: { label: 'Long-term',  color: '#f472b6' },
};

/* ── seed ────────────────────────────────────────────────────────────────── */

function seed(): GoalsState {
  const iso = new Date().toISOString();
  const metrics: Metric[] = [
    { id: 'mt_mrr', name: 'MRR', scope: 'company', value: 135000, target: 250000, baseline: 120000, unit: '$', higherIsBetter: true, trend: 'up', alertThreshold: 40 },
    { id: 'mt_runway', name: 'Runway', scope: 'company', value: 18, target: 24, baseline: 16, unit: 'mo', higherIsBetter: true, trend: 'down', alertThreshold: 50 },
    { id: 'mt_activation', name: 'Activation rate', scope: 'department', department: 'Product', value: 41, target: 60, baseline: 38, unit: '%', higherIsBetter: true, trend: 'up', alertThreshold: 40 },
    { id: 'mt_churn', name: 'Monthly churn', scope: 'department', department: 'Customer Success', value: 5.2, target: 3, baseline: 6, unit: '%', higherIsBetter: false, trend: 'down', alertThreshold: 30 },
  ];
  const goals: Goal[] = [
    { id: 'g_canvas', title: 'Launch Canvas v2', horizon: 'quarterly', ownerId: 'm_you', metricId: 'mt_activation', createdAt: iso },
    { id: 'g_seed', title: 'Close Seed Round', horizon: 'round', ownerId: 'm_you', metricId: 'mt_runway', createdAt: iso },
    { id: 'g_mrr', title: 'Reach $250k MRR', horizon: 'annual', ownerId: 'm_you', metricId: 'mt_mrr', createdAt: iso },
    { id: 'g_churn', title: 'Cut churn to 3%', horizon: 'monthly', ownerId: 'm_alex', metricId: 'mt_churn', createdAt: iso },
    { id: 'g_daily', title: 'Ship 5 critical tasks today', horizon: 'daily', ownerId: 'm_you', createdAt: iso },
  ];
  return { goals, metrics, metricImpacts: [] };
}

/* ── persistence ─────────────────────────────────────────────────────────── */

function load(): GoalsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { const s = seed(); localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); return s; }
    return JSON.parse(raw) as GoalsState;
  } catch {
    return seed();
  }
}

function persist(state: GoalsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event('goals_updated'));
  } catch { /* quota */ }
}

function uid(p: string) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

/* ── hook ────────────────────────────────────────────────────────────────── */

export function useGoalsStore() {
  const [state, setState] = useState<GoalsState>(() => load());

  useEffect(() => {
    const h = () => setState(load());
    window.addEventListener('goals_updated', h);
    return () => window.removeEventListener('goals_updated', h);
  }, []);

  const update = useCallback((mutate: (s: GoalsState) => GoalsState) => {
    setState(prev => { const next = mutate(prev); persist(next); return next; });
  }, []);

  const createGoal = useCallback((input: { title: string; horizon: Horizon; metricId?: string; ownerId?: string }) => {
    update(s => ({ ...s, goals: [{ id: uid('g'), title: input.title, horizon: input.horizon, metricId: input.metricId, ownerId: input.ownerId, createdAt: new Date().toISOString() }, ...s.goals] }));
  }, [update]);

  const deleteGoal = useCallback((id: string) => {
    update(s => ({ ...s, goals: s.goals.filter(g => g.id !== id) }));
  }, [update]);

  return {
    goals: state.goals,
    createGoal,
    deleteGoal,
  };
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** % of the way from baseline → target. */
export function metricProgress(m: Metric): number {
  const span = m.target - m.baseline;
  if (span === 0) return 100;
  const pct = ((m.value - m.baseline) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
