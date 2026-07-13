/**
 * Industry OS — Saved Workflows Store
 *
 * Persists user-bookmarked workflow items in localStorage.
 * Items are keyed by a stable UUID and grouped by role → company.
 */

import { useState, useCallback, useEffect } from 'react';
import { Swords, Target, Handshake } from 'lucide-react';
import type { UserPlanetRole } from '../data/companyPlanetRoots';

const STORAGE_KEY = 'industry_os_saved_workflows_v1';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SavedItemLevel = 'planet' | 'root' | 'branch' | 'action';

export type CompanyTag = 'competitor' | 'customer' | 'collaborator';

export const COMPANY_TAG_LABELS: Record<CompanyTag, string> = {
  competitor: 'Competitor',
  customer: 'Customer',
  collaborator: 'Collaborator',
};

export const COMPANY_TAG_ICONS: Record<CompanyTag, any> = {
  competitor: Swords,
  customer: Target,
  collaborator: Handshake,
};

export const COMPANY_TAG_COLORS: Record<CompanyTag, string> = {
  competitor: '#ef4444',
  customer: '#10b981',
  collaborator: '#3b82f6',
};

export type CardSyncStatus = 'draft' | 'proposed' | 'approved' | 'synced';

export const SYNC_STATUS_META: Record<CardSyncStatus, { label: string; color: string }> = {
  draft:    { label: 'Draft',    color: '#94a3b8' },
  proposed: { label: 'Proposed', color: '#fbbf24' },
  approved: { label: 'Approved', color: '#60a5fa' },
  synced:   { label: 'Synced',   color: '#34d399' },
};

export const SYNC_STATUS_ORDER: CardSyncStatus[] = ['draft', 'proposed', 'approved', 'synced'];

export type CardConnectionType = 'dependency' | 'evidence' | 'conflict' | 'opportunity' | 'risk' | 'goal_link';

export const CONNECTION_TYPE_META: Record<CardConnectionType, { label: string; color: string }> = {
  dependency:  { label: 'Depends on',   color: '#a78bfa' },
  evidence:    { label: 'Supports',     color: '#34d399' },
  conflict:    { label: 'Conflicts',    color: '#fb7185' },
  opportunity: { label: 'Opportunity',  color: '#fbbf24' },
  risk:        { label: 'Risk for',     color: '#f97316' },
  goal_link:   { label: 'Goal link',    color: '#60a5fa' },
};

export interface CardConnection {
  fromId: string;
  toId: string;
  type: CardConnectionType;
  createdAt: string;
}

export interface SavedWorkflowItem {
  id: string;
  savedAt: string;         // ISO timestamp
  level: SavedItemLevel;   // which level was saved

  // Context
  companyId: string;
  companyName: string;
  role: UserPlanetRole;
  roleLabel: string;
  referenceCompanyId?: string;
  planetTag?: CompanyTag | null;

  // Root
  rootId?: string;
  rootLabel?: string;
  rootColor?: string;
  rootDescription?: string;

  // Branch (optional — only when level is 'branch' or 'action')
  branchId?: string;
  branchLabel?: string;

  // Action (optional — only when level is 'action')
  actionId?: string;
  actionLabel?: string;
  actionHint?: string;

  // User note
  note?: string;

  // Sync status — tracks proposal/approval lifecycle back to the twin
  syncStatus?: CardSyncStatus;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return `swf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadFromStorage(): SavedWorkflowItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedWorkflowItem[];
  } catch {
    return [];
  }
}

function saveToStorage(items: SavedWorkflowItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event('workflows_updated'));
  } catch {
    // storage quota exceeded — silently ignore
  }
}

/** Build a stable lookup key for deduplication */
function buildKey(item: Omit<SavedWorkflowItem, 'id' | 'savedAt' | 'note'>): string {
  if (item.level === 'planet') {
    return ['planet', item.companyId, item.role].join('::');
  }
  return [
    item.companyId,
    item.role,
    item.rootId ?? '',
    item.branchId ?? '',
    item.actionId ?? '',
  ].join('::');
}

// ── Grouped view helpers ──────────────────────────────────────────────────────

export interface SavedWorkflowGroup {
  role: UserPlanetRole;
  roleLabel: string;
  roleColor: string;
  companies: SavedWorkflowCompanyGroup[];
}

export interface SavedWorkflowCompanyGroup {
  companyId: string;
  companyName: string;
  items: SavedWorkflowItem[];
}

export const ROLE_COLORS: Record<UserPlanetRole, string> = {
  career: '#60a5fa',
  founder: '#f97316',
  vc: '#22d3ee',
  investor: '#34d399',
};

export const ROLE_ORDER: UserPlanetRole[] = ['career', 'founder', 'vc', 'investor'];

export function groupSavedItems(items: SavedWorkflowItem[]): SavedWorkflowGroup[] {
  const byRole: Map<UserPlanetRole, Map<string, SavedWorkflowItem[]>> = new Map();

  for (const item of items) {
    if (!byRole.has(item.role)) byRole.set(item.role, new Map());
    const companyMap = byRole.get(item.role)!;
    if (!companyMap.has(item.companyId)) companyMap.set(item.companyId, []);
    companyMap.get(item.companyId)!.push(item);
  }

  return ROLE_ORDER
    .filter(role => byRole.has(role))
    .map(role => {
      const companyMap = byRole.get(role)!;
      const companies: SavedWorkflowCompanyGroup[] = [];
      companyMap.forEach((roleItems, companyId) => {
        companies.push({
          companyId,
          companyName: roleItems[0].companyName,
          items: roleItems.sort(
            (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
          ),
        });
      });
      return {
        role,
        roleLabel: roleItems(role, items),
        roleColor: ROLE_COLORS[role],
        companies: companies.sort((a, b) => a.companyName.localeCompare(b.companyName)),
      };
    });
}

function roleItems(role: UserPlanetRole, items: SavedWorkflowItem[]): string {
  return items.find(i => i.role === role)?.roleLabel ?? role;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const CONNECTIONS_KEY = 'workspace_card_connections_v1';

function loadConnections(): CardConnection[] {
  try { return JSON.parse(localStorage.getItem(CONNECTIONS_KEY) ?? '[]'); } catch { return []; }
}
function saveConnections(conns: CardConnection[]) {
  try { localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(conns)); } catch { /* quota */ }
}

export interface UseSavedWorkflowsReturn {
  items: SavedWorkflowItem[];
  totalCount: number;
  save: (item: Omit<SavedWorkflowItem, 'id' | 'savedAt'>) => SavedWorkflowItem;
  remove: (id: string) => void;
  updateNote: (id: string, note: string) => void;
  updateItem: (id: string, updates: Partial<Pick<SavedWorkflowItem, 'syncStatus' | 'note'>>) => void;
  has: (lookup: Pick<SavedWorkflowItem, 'companyId' | 'role'> & { rootId?: string; branchId?: string; actionId?: string }) => boolean;
  getId: (lookup: Pick<SavedWorkflowItem, 'companyId' | 'role'> & { rootId?: string; branchId?: string; actionId?: string }) => string | null;
  clear: () => void;
  grouped: SavedWorkflowGroup[];
  connections: CardConnection[];
  addConnection: (fromId: string, toId: string, type: CardConnectionType) => void;
  removeConnection: (fromId: string, toId: string) => void;
}

export function useSavedWorkflows(): UseSavedWorkflowsReturn {
  const [items, setItems] = useState<SavedWorkflowItem[]>(() => loadFromStorage());
  const [connections, setConnections] = useState<CardConnection[]>(() => loadConnections());

  useEffect(() => {
    const handleUpdate = () => setItems(loadFromStorage());
    window.addEventListener('workflows_updated', handleUpdate);
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) handleUpdate();
    });
    return () => {
      window.removeEventListener('workflows_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const save = useCallback((item: Omit<SavedWorkflowItem, 'id' | 'savedAt'>): SavedWorkflowItem => {
    const lookupKey = buildKey(item);
    const current = loadFromStorage();
    
    const existing = current.find(p => buildKey(p) === lookupKey);
    if (existing) {
      return existing;
    }

    const newItem: SavedWorkflowItem = {
      ...item,
      id: generateId(),
      savedAt: new Date().toISOString(),
    };
    const newItems = [newItem, ...current];
    
    saveToStorage(newItems);
    setItems(newItems);

    return newItem;
  }, []);

  const remove = useCallback((id: string) => {
    const current = loadFromStorage();
    const newItems = current.filter(p => p.id !== id);
    saveToStorage(newItems);
    setItems(newItems);
  }, []);

  const updateNote = useCallback((id: string, note: string) => {
    const current = loadFromStorage();
    const newItems = current.map(p => (p.id === id ? { ...p, note } : p));
    saveToStorage(newItems);
    setItems(newItems);
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<Pick<SavedWorkflowItem, 'syncStatus' | 'note'>>) => {
    const current = loadFromStorage();
    const newItems = current.map(p => (p.id === id ? { ...p, ...updates } : p));
    saveToStorage(newItems);
    setItems(newItems);
  }, []);

  const addConnection = useCallback((fromId: string, toId: string, type: CardConnectionType) => {
    const current = loadConnections();
    const exists = current.some(c => c.fromId === fromId && c.toId === toId);
    if (exists) return;
    const next = [...current, { fromId, toId, type, createdAt: new Date().toISOString() }];
    saveConnections(next);
    setConnections(next);
  }, []);

  const removeConnection = useCallback((fromId: string, toId: string) => {
    const next = loadConnections().filter(c => !(c.fromId === fromId && c.toId === toId) && !(c.fromId === toId && c.toId === fromId));
    saveConnections(next);
    setConnections(next);
  }, []);

  const has = useCallback((
    lookup: Pick<SavedWorkflowItem, 'companyId' | 'role'> & { rootId?: string; branchId?: string; actionId?: string }
  ): boolean => {
    const level: SavedItemLevel = !lookup.rootId ? 'planet' : lookup.actionId ? 'action' : lookup.branchId ? 'branch' : 'root';
    const key = buildKey({
      companyId: lookup.companyId,
      role: lookup.role,
      roleLabel: '',
      companyName: '',
      rootId: lookup.rootId,
      rootLabel: '',
      rootColor: '',
      level,
      branchId: lookup.branchId,
      actionId: lookup.actionId,
    });
    return items.some(p => buildKey(p) === key);
  }, [items]);

  const getId = useCallback((
    lookup: Pick<SavedWorkflowItem, 'companyId' | 'role'> & { rootId?: string; branchId?: string; actionId?: string }
  ): string | null => {
    const level: SavedItemLevel = !lookup.rootId ? 'planet' : lookup.actionId ? 'action' : lookup.branchId ? 'branch' : 'root';
    const key = buildKey({
      companyId: lookup.companyId,
      role: lookup.role,
      roleLabel: '',
      companyName: '',
      rootId: lookup.rootId,
      rootLabel: '',
      rootColor: '',
      level,
      branchId: lookup.branchId,
      actionId: lookup.actionId,
    });
    const item = items.find(p => buildKey(p) === key);
    return item ? item.id : null;
  }, [items]);

  const clear = useCallback(() => {
    saveToStorage([]);
    setItems([]);
  }, []);

  const grouped = groupSavedItems(items);

  return {
    items,
    totalCount: items.length,
    save,
    remove,
    updateNote,
    updateItem,
    has,
    getId,
    clear,
    grouped,
    connections,
    addConnection,
    removeConnection,
  };
}
