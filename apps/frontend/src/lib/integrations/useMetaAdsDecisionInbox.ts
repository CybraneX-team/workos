import { useCallback, useEffect, useState } from 'react';
import type { MetaAdsAssignee, MetaAdsDecisionInbox, MetaAdsExperiment } from '@cybranex/shared-types';
import {
  applyMetaAdsExperiment,
  cancelMetaAdsExperiment,
  dismissMetaAdsFinding,
  fetchMetaAdsAssignees,
  fetchMetaAdsDecisionInbox,
  fetchMetaAdsExperiment,
  fetchMetaAdsExperiments,
  startMetaAdsExperiment,
  updateMetaAdsExperiment,
} from './service';

function message(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const match = raw.match(/"error":"([^"]+)"/);
  return (match?.[1] ?? raw).replace(/_/g, ' ');
}

function key() {
  return globalThis.crypto?.randomUUID?.() ?? `meta-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function loadDecisionData() {
  return Promise.all([
    fetchMetaAdsDecisionInbox(),
    fetchMetaAdsExperiments('history'),
  ]);
}

export function useMetaAdsDecisionInbox(enabled = true) {
  const [inbox, setInbox] = useState<MetaAdsDecisionInbox | null>(null);
  const [history, setHistory] = useState<MetaAdsExperiment[]>([]);
  const [assignees, setAssignees] = useState<MetaAdsAssignee[]>([]);
  const [selectedExperiment, setSelectedExperiment] = useState<MetaAdsExperiment | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setError(null);
    try {
      const [nextInbox, nextHistory] = await loadDecisionData();
      setInbox(nextInbox);
      setHistory(nextHistory.items);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadDecisionData()
      .then(([nextInbox, nextHistory]) => {
        if (!active) return;
        setInbox(nextInbox);
        setHistory(nextHistory.items);
      })
      .catch((cause) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [enabled]);

  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      await reload();
      return result;
    } catch (cause) {
      setError(message(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const loadAssignees = useCallback(async () => {
    if (assignees.length) return assignees;
    try {
      const next = await fetchMetaAdsAssignees();
      setAssignees(next);
      return next;
    } catch (cause) {
      setError(message(cause));
      return [];
    }
  }, [assignees]);

  const openExperiment = useCallback(async (experimentId: string) => {
    setBusy(true);
    try {
      const value = await fetchMetaAdsExperiment(experimentId);
      setSelectedExperiment(value);
      return value;
    } catch (cause) {
      setError(message(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    inbox,
    history,
    assignees,
    selectedExperiment,
    setSelectedExperiment,
    loading,
    busy,
    error,
    clearError: () => setError(null),
    reload,
    loadAssignees,
    openExperiment,
    start: (findingId: string, ownerMemberId: string, dueDate: string) => run(() => startMetaAdsExperiment(findingId, { ownerMemberId, dueDate, idempotencyKey: key() })),
    dismiss: (findingId: string, reason: string, note?: string) => run(() => dismissMetaAdsFinding(findingId, { reason, note, idempotencyKey: key() })),
    update: (experimentId: string, input: { ownerMemberId?: string; dueDate?: string }) => run(() => updateMetaAdsExperiment(experimentId, { ...input, idempotencyKey: key() })),
    apply: (experimentId: string, input: { implementationNote: string; confirmedRecommendedChange: boolean; keptBudgetConstant: boolean }) => run(() => applyMetaAdsExperiment(experimentId, { ...input, idempotencyKey: key() })),
    cancel: (experimentId: string, reason: string, note?: string) => run(() => cancelMetaAdsExperiment(experimentId, { reason, note, idempotencyKey: key() })),
  };
}
