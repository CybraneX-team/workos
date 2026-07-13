import { useState, useCallback, useEffect } from 'react';
import type { BdtWorkflowTrailSession } from './useWorkflowTrail';

const STORAGE_KEY = 'bdt_saved_trails_v1';

export interface SavedBdtTrail {
  id: string;
  scope: 'bdt';
  savedAt: string;
  companyId: string;
  userId?: string;
  title: string;
  note?: string;
  anchor: BdtWorkflowTrailSession['anchor'];
  stops: BdtWorkflowTrailSession['stops'];
}

function loadFromStorage(): SavedBdtTrail[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedBdtTrail[];
  } catch {
    return [];
  }
}

function saveToStorage(items: SavedBdtTrail[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event('bdt_saved_trails_updated'));
  } catch {
    // silently ignore quota issues
  }
}

export function useBdtSavedTrails() {
  const [savedTrails, setSavedTrails] = useState<SavedBdtTrail[]>(() => loadFromStorage());

  useEffect(() => {
    const handleUpdate = () => setSavedTrails(loadFromStorage());
    window.addEventListener('bdt_saved_trails_updated', handleUpdate);
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) handleUpdate();
    });
    return () => {
      window.removeEventListener('bdt_saved_trails_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const saveTrail = useCallback((session: BdtWorkflowTrailSession, title?: string, note?: string) => {
    const current = loadFromStorage();
    const trailTitle = title || `${session.anchor.nodeLabel} path`;

    const newTrail: SavedBdtTrail = {
      id: `trail_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      scope: 'bdt',
      savedAt: new Date().toISOString(),
      companyId: session.companyId,
      userId: session.userId,
      title: trailTitle,
      note,
      anchor: session.anchor,
      stops: session.stops,
    };

    const newTrails = [newTrail, ...current];
    saveToStorage(newTrails);
    setSavedTrails(newTrails);
    return newTrail;
  }, []);

  const removeTrail = useCallback((id: string) => {
    const current = loadFromStorage();
    const newTrails = current.filter(t => t.id !== id);
    saveToStorage(newTrails);
    setSavedTrails(newTrails);
  }, []);

  const updateNote = useCallback((id: string, note: string) => {
    const current = loadFromStorage();
    const newTrails = current.map(t => (t.id === id ? { ...t, note } : t));
    saveToStorage(newTrails);
    setSavedTrails(newTrails);
  }, []);

  const clear = useCallback(() => {
    saveToStorage([]);
    setSavedTrails([]);
  }, []);

  const getTrail = useCallback((id: string): SavedBdtTrail | undefined => {
    return savedTrails.find(t => t.id === id);
  }, [savedTrails]);

  return {
    savedTrails,
    saveTrail,
    removeTrail,
    updateNote,
    clear,
    getTrail,
    totalCount: savedTrails.length,
  };
}
