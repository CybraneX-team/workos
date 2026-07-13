import { useState, useCallback } from 'react';
import type { ContextInsight } from './productWorkspaceData';
import type { WorkspaceZoneId } from './productWorkspaceData';

const STORAGE_KEY = 'bdt_product_workspace_v1';

export interface PinnedInsight extends ContextInsight {
  pinnedAt: number;
  zoneId: WorkspaceZoneId;
}

interface WorkspaceState {
  pins: PinnedInsight[];
}

function load(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { pins: [] };
    return JSON.parse(raw) as WorkspaceState;
  } catch {
    return { pins: [] };
  }
}

function save(state: WorkspaceState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useProductWorkspaceStore() {
  const [pins, setPins] = useState<PinnedInsight[]>(() => load().pins);

  const persist = useCallback((next: PinnedInsight[]) => {
    setPins(next);
    save({ pins: next });
  }, []);

  const pinInsight = useCallback((insight: ContextInsight, zoneId: WorkspaceZoneId) => {
    const entry: PinnedInsight = {
      ...insight,
      zoneId,
      pinnedAt: Date.now(),
    };
    persist([entry, ...pins.filter(p => p.id !== insight.id)]);
  }, [pins, persist]);

  const unpinInsight = useCallback((id: string) => {
    persist(pins.filter(p => p.id !== id));
  }, [pins, persist]);

  const movePin = useCallback((id: string, zoneId: WorkspaceZoneId) => {
    persist(pins.map(p => (p.id === id ? { ...p, zoneId } : p)));
  }, [pins, persist]);

  const pinsForZone = useCallback(
    (zoneId: WorkspaceZoneId) => pins.filter(p => p.zoneId === zoneId),
    [pins],
  );

  return { pins, pinInsight, unpinInsight, movePin, pinsForZone };
}
