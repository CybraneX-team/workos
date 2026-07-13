import { create } from 'zustand';
import { U_NODES as TWIN_DEFAULT_NODES } from './universalPolytopeData';
import type { UExternalNode, UInternalNode, UDomain, UCompanySize } from './bdtPolytopeData';
import { U_DOMAIN_COLOR, isActionLeafNode, isBdtWorkspaceLeafNode } from './bdtPolytopeData';
import { api } from './api';
import { normalizeDepartmentsFromApi } from './bdtDepartmentApiMapper';
import { getSizeConfigs, loadBdtCatalog } from './bdtCatalog';
import { fetchActiveBdtNodeKeys, buildActiveKeySet } from './db/bdtNodeActivation';

/** Twin (/3d company polytope) and BDT (/universal) use separate graphs and caches. */
export type PolytopeStoreScope = 'twin' | 'bdt';

/** Drop seeded/mock team members (those without a real companyMemberId) from a node tree. */
function stripSeededTeamMembers(nodes: UInternalNode[]): UInternalNode[] {
  return nodes.map(node => {
    const children = node.children?.length ? stripSeededTeamMembers(node.children) : node.children;
    if (node.type !== 'team') return { ...node, children };
    const members = (node.members ?? []).filter(m => Boolean(m.companyMemberId));
    return { ...node, members, memberCount: members.length, children };
  });
}

const TWIN_CACHE_KEY = 'polytope_departments_twin_v2';
const BDT_CACHE_KEY = 'polytope_departments_bdt_v5';
const LEGACY_STORAGE_KEY = 'polytope_departments_v1';

export type { UExternalNode, UInternalNode, UDomain };
export { U_DOMAIN_COLOR, isActionLeafNode, isBdtWorkspaceLeafNode };

const TWIN_DEFAULT_DEPARTMENTS = TWIN_DEFAULT_NODES.filter(n => n.domain !== 'inactive');
const BDT_DEFAULT_DEPARTMENTS: UExternalNode[] = [];

function persistCache(storageKey: string, departments: UExternalNode[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(departments));
  } catch (err) {
    console.warn('[departments] cache write failed', err);
  }
}

function loadCachedDepartments(
  storageKey: string,
  defaults: UExternalNode[],
  options?: { onboardingFallback?: boolean },
): UExternalNode[] | null {
  try {
    let raw = localStorage.getItem(storageKey);
    if (!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as UExternalNode[];

    if (!options?.onboardingFallback) return null;

    const onboardingRaw = localStorage.getItem('onboarding_departments');
    if (!onboardingRaw) return null;
    const selectedNames = JSON.parse(onboardingRaw);
    if (!Array.isArray(selectedNames) || selectedNames.length === 0) return null;

    const domains: UDomain[] = ['build', 'delivery', 'market', 'control', 'people', 'direction'];
    return selectedNames
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      .map((name, index) => {
        const matched = defaults.find(n =>
          n.label.toLowerCase() === name.toLowerCase() ||
          n.label.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(n.label.toLowerCase())
        );
        if (matched) return matched;
        const domain = domains[index % domains.length];
        return {
          id: `local_${index}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          label: name,
          domain,
          cluster: domain.charAt(0).toUpperCase() + domain.slice(1),
          score: 80,
          metrics: { performance: 80, efficiency: 80, capacity: 80, alignment: 80, risk: 20 },
          internalNodes: [],
        };
      });
  } catch (err) {
    console.error('Failed to load cached departments', err);
    return null;
  }
}

function addNodeToTree(nodes: UInternalNode[], path: string[], newNode: UInternalNode): UInternalNode[] {
  if (path.length === 0) return [...nodes, newNode];
  const [head, ...tail] = path;
  return nodes.map(node =>
    node.id === head
      ? { ...node, children: addNodeToTree(node.children ?? [], tail, newNode) }
      : node
  );
}

function updateNodeInTree(nodes: UInternalNode[], nodeId: string, updates: Partial<Omit<UInternalNode, 'id' | 'children'>>): UInternalNode[] {
  return nodes.map(node => {
    if (node.id === nodeId) return { ...node, ...updates };
    if (node.children?.length) {
      return { ...node, children: updateNodeInTree(node.children, nodeId, updates) };
    }
    return node;
  });
}

function deleteNodeFromTree(nodes: UInternalNode[], nodeId: string): UInternalNode[] {
  return nodes
    .filter(node => node.id !== nodeId)
    .map(node => node.children?.length
      ? { ...node, children: deleteNodeFromTree(node.children, nodeId) }
      : node
    );
}

function findPathParentNodeId(dept: UExternalNode | undefined, path: string[]): string | undefined {
  if (!dept || path.length === 0) return undefined;
  return path[path.length - 1];
}

function flattenNodes(nodes: UInternalNode[]): UInternalNode[] {
  return nodes.flatMap(node => [node, ...flattenNodes(node.children ?? [])]);
}

/** Fill missing internal trees from seed when API/cache returns department shells only. */
function findSeedDepartment(dept: UExternalNode, seedActive: UExternalNode[]): UExternalNode | undefined {
  const norm = dept.label.toLowerCase().trim();
  return (
    seedActive.find(s => s.id === dept.id) ??
    seedActive.find(s => s.label.toLowerCase().trim() === norm) ??
    seedActive.find(s => {
      const seedNorm = s.label.toLowerCase().trim();
      return norm.includes(seedNorm) || seedNorm.includes(norm);
    })
  );
}

function countInternalTree(nodes: UInternalNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countInternalTree(n.children ?? []), 0);
}

function enrichInternalNodes(nodes: UInternalNode[], seedNodes: UInternalNode[]): UInternalNode[] {
  return nodes.map(node => {
    const seedMatch = seedNodes.find(s => s.id === node.id || s.label === node.label);
    if (!seedMatch) {
      if (node.children?.length) {
        return {
          ...node,
          children: enrichInternalNodes(node.children, seedNodes),
        };
      }
      return node;
    }

    return {
      ...node,
      interrelatedDepartments: node.interrelatedDepartments?.length
        ? node.interrelatedDepartments
        : seedMatch.interrelatedDepartments,
      workflowSteps: node.workflowSteps?.length
        ? node.workflowSteps
        : seedMatch.workflowSteps,
      projectDetails: node.projectDetails || seedMatch.projectDetails,
      signalDetails: node.signalDetails || seedMatch.signalDetails,
      decisionDetails: node.decisionDetails || seedMatch.decisionDetails,
      metricDetails: node.metricDetails || seedMatch.metricDetails,
      actionDetails: node.actionDetails || seedMatch.actionDetails,
      members: node.type === 'team' ? (node.members ?? []) : node.members,
      memberCount: node.type === 'team' ? (node.members?.length ?? 0) : node.memberCount,
      children: enrichInternalNodes(node.children ?? [], seedMatch.children ?? []),
    };
  });
}

function enrichDepartmentsFromSeed(
  departments: UExternalNode[],
  seed: UExternalNode[],
): UExternalNode[] {
  const seedActive = seed.filter(d => d.domain !== 'inactive');

  return departments.map(dept => {
    const match = findSeedDepartment(dept, seedActive);
    if (!match) {
      return { ...dept, internalNodes: stripSeededTeamMembers(dept.internalNodes ?? []) };
    }

    const apiCount = countInternalTree(dept.internalNodes ?? []);
    const seedCount = countInternalTree(match.internalNodes ?? []);
    const needsInternal = Boolean(match.internalNodes?.length && (apiCount === 0 || seedCount > apiCount));
    const color = dept.color ?? match.color;
    const domain = dept.domain ?? match.domain;
    const cluster = dept.cluster ?? match.cluster;

    let internalNodes = dept.internalNodes ?? [];
    if (needsInternal) {
      internalNodes = match.internalNodes ?? [];
    } else if (match.internalNodes?.length) {
      internalNodes = enrichInternalNodes(internalNodes, match.internalNodes);
    }

    if (!needsInternal && color === dept.color && domain === dept.domain && cluster === dept.cluster && internalNodes === dept.internalNodes) {
      return { ...dept, internalNodes: stripSeededTeamMembers(dept.internalNodes ?? []) };
    }

    return {
      ...dept,
      ...(color !== dept.color ? { color } : {}),
      ...(domain !== dept.domain ? { domain } : {}),
      ...(cluster !== dept.cluster ? { cluster } : {}),
      internalNodes: stripSeededTeamMembers(internalNodes),
    };
  });
}

export interface PolytopeStoreState {
  departments: UExternalNode[];
  lockedDepartments: UExternalNode[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** BDT-scope only — which (departmentSourceKey::level1Label::branchLabel) leaves have a
   * wired-up panel. Undefined in the Twin scope, where gating doesn't apply. */
  activeKeys?: Set<string>;
  erpConnected?: boolean;
  loadDepartments: () => Promise<void>;
  setCompanySize: (size: UCompanySize | null | undefined) => void;
  addDepartment: (dept: Omit<UExternalNode, 'id' | 'internalNodes'>) => Promise<UExternalNode>;
  updateDepartment: (id: string, updates: Partial<Omit<UExternalNode, 'id' | 'internalNodes'>>) => Promise<void>;
  deleteDepartment: (id: string) => Promise<void>;
  addNode: (deptId: string, node: Omit<UInternalNode, 'id' | 'children'>, path?: string[]) => Promise<UInternalNode>;
  updateNode: (deptId: string, nodeId: string, updates: Partial<Omit<UInternalNode, 'id' | 'children'>>) => Promise<void>;
  deleteNode: (deptId: string, nodeId: string) => Promise<void>;
  addNodeMember: (nodeId: string, memberId: string) => Promise<void>;
  removeNodeMember: (nodeId: string, memberId: string) => Promise<void>;
}

interface StoreConfig {
  storageKey: string;
  defaultDepartments: UExternalNode[];
  onboardingFallback?: boolean;
}

function createLocalPolytopeStore({ storageKey, defaultDepartments, onboardingFallback }: StoreConfig) {
  return create<PolytopeStoreState>((set, get) => ({
    lockedDepartments: [],
    setCompanySize: () => {},
    departments: enrichDepartmentsFromSeed(
      loadCachedDepartments(storageKey, defaultDepartments, { onboardingFallback }) ?? defaultDepartments,
      defaultDepartments,
    ),
    loading: false,
    loaded: false,
    error: null,

    loadDepartments: async () => {
      if (get().loading) return;
      set({ loading: true, error: null });
      const cached = loadCachedDepartments(storageKey, defaultDepartments, { onboardingFallback });
      const cachedOrLocal = cached ?? (get().departments.length ? get().departments : defaultDepartments);
      const departments = enrichDepartmentsFromSeed(cachedOrLocal, defaultDepartments);
      persistCache(storageKey, departments);
      set({ departments, loading: false, loaded: true, error: null });
    },

    addDepartment: async (dept) => {
      const newDept: UExternalNode = {
        ...dept,
        id: `dept_${Date.now()}`,
        internalNodes: [],
      };
      set(state => {
        const next = [...state.departments, newDept];
        persistCache(storageKey, next);
        return { departments: next };
      });
      return newDept;
    },

    updateDepartment: async (id, updates) => {
      set(state => {
        const next = state.departments.map(d => d.id === id ? { ...d, ...updates } : d);
        persistCache(storageKey, next);
        return { departments: next };
      });
    },

    deleteDepartment: async (id) => {
      set(state => {
        const next = state.departments.filter(d => d.id !== id);
        persistCache(storageKey, next);
        return { departments: next };
      });
    },

    addNode: async (deptId, node, path = []) => {
      const newNode: UInternalNode = { ...node, id: `node_${Date.now()}`, children: [] };
      set(state => {
        const next = state.departments.map(d =>
          d.id === deptId ? { ...d, internalNodes: addNodeToTree(d.internalNodes, path, newNode) } : d
        );
        persistCache(storageKey, next);
        return { departments: next };
      });
      return newNode;
    },

    updateNode: async (deptId, nodeId, updates) => {
      set(state => {
        const next = state.departments.map(d =>
          d.id === deptId ? { ...d, internalNodes: updateNodeInTree(d.internalNodes, nodeId, updates) } : d
        );
        persistCache(storageKey, next);
        return { departments: next };
      });
    },

    deleteNode: async (deptId, nodeId) => {
      set(state => {
        const next = state.departments.map(d =>
          d.id === deptId ? { ...d, internalNodes: deleteNodeFromTree(d.internalNodes, nodeId) } : d
        );
        persistCache(storageKey, next);
        return { departments: next };
      });
    },

    addNodeMember: async () => {},

    removeNodeMember: async () => {},
  }));
}

export function createApiPolytopeStore({ storageKey, defaultDepartments, onboardingFallback }: StoreConfig) {
  let _allDepts: UExternalNode[] = [];

  function splitBySize(all: UExternalNode[], size: UCompanySize | null | undefined) {
    if (!size) return { visible: all, locked: [] as UExternalNode[] };
    const config = getSizeConfigs()[size];
    // Catalog not loaded yet → show everything rather than crash; re-split once loaded.
    if (!config) return { visible: all, locked: [] as UExternalNode[] };
    const visibleKeys = new Set(config.visibleDeptIds);
    const visible = all.filter(d => !d.sourceKey || visibleKeys.has(d.sourceKey));
    const locked = all.filter(d => {
      const sourceKey = d.sourceKey;
      return typeof sourceKey === 'string' && !visibleKeys.has(sourceKey);
    });
    return { visible, locked };
  }

  return create<PolytopeStoreState>((set, get) => ({
    departments: loadCachedDepartments(storageKey, defaultDepartments) ?? defaultDepartments,
    lockedDepartments: [],
    loading: false,
    loaded: false,
    error: null,
    // Undefined means activation has not been verified yet. It must not be treated as
    // an empty, authoritative result: that would incorrectly lock every BDT leaf.
    activeKeys: undefined,
    erpConnected: false,

    setCompanySize: (size) => {
      const all = _allDepts.length ? _allDepts : [...get().departments, ...get().lockedDepartments];
      _allDepts = all;
      const { visible, locked } = splitBySize(all, size);
      set({ departments: visible, lockedDepartments: locked });
    },

    loadDepartments: async () => {
      if (get().loading) return;
      set({ loading: true, error: null });
      try {
        await loadBdtCatalog().catch(() => { /* size-config split degrades gracefully */ });
        const [response, activeNodes] = await Promise.all([
          api.get<{ departments: UExternalNode[] }>('/api/departments'),
          // A capability-check failure must leave leaves usable. Only an explicit backend
          // response may lock a node; retry on the next department load.
          fetchActiveBdtNodeKeys().catch(() => undefined),
        ]);
        const departments = normalizeDepartmentsFromApi(response.departments ?? []);
        _allDepts = departments;
        persistCache(storageKey, departments);
        set({
          departments,
          lockedDepartments: [],
          loading: false,
          loaded: true,
          error: null,
          activeKeys: activeNodes ? buildActiveKeySet(activeNodes) : undefined,
          erpConnected: activeNodes?.erpConnected ?? false,
        });
      } catch (err) {
        console.error('[departments] load failed', err);
        const cached = loadCachedDepartments(storageKey, defaultDepartments, { onboardingFallback });
        const fallback = cached ?? (get().departments.length ? get().departments : defaultDepartments);
        set({
          departments: fallback,
          loading: false,
          loaded: true,
          error: err instanceof Error ? err.message : 'Failed to load departments',
        });
      }
    },

    addDepartment: async (dept) => {
      const optimistic: UExternalNode = {
        ...dept,
        id: `pending_dept_${Date.now()}`,
        internalNodes: [],
      };
      set(state => ({ departments: [...state.departments, optimistic] }));
      try {
        const response = await api.post<{ department: UExternalNode }>('/api/departments', dept);
        const saved = response.department;
        set(state => {
          const next = state.departments.map(d => d.id === optimistic.id ? saved : d);
          persistCache(storageKey, next);
          return { departments: next };
        });
        return saved;
      } catch (err) {
        set(state => ({ departments: state.departments.filter(d => d.id !== optimistic.id) }));
        throw err;
      }
    },

    updateDepartment: async (id, updates) => {
      const previous = get().departments;
      set(state => ({ departments: state.departments.map(d => d.id === id ? { ...d, ...updates } : d) }));
      try {
        const response = await api.patch<{ department: UExternalNode }>(`/api/departments/${id}`, updates);
        set(state => {
          const next = state.departments.map(d => d.id === id ? response.department : d);
          persistCache(storageKey, next);
          return { departments: next };
        });
      } catch (err) {
        set({ departments: previous });
        throw err;
      }
    },

    deleteDepartment: async (id) => {
      const previous = get().departments;
      set(state => ({ departments: state.departments.filter(d => d.id !== id) }));
      try {
        const response = await api.delete<{ departments: UExternalNode[] }>(`/api/departments/${id}`);
        const departments = normalizeDepartmentsFromApi(response.departments ?? []);
        persistCache(storageKey, departments);
        set({ departments });
      } catch (err) {
        set({ departments: previous });
        throw err;
      }
    },

    addNode: async (deptId, node, path = []) => {
      if (node.nodeLevel === 'level1') {
        const existing = get().departments.find(d => d.id === deptId)
          ?.internalNodes?.filter(n => n.nodeLevel === 'level1') ?? [];
        if (existing.length >= 6) throw new Error('Department cannot have more than 6 Level-1 nodes');
      }
      const dept = get().departments.find(d => d.id === deptId);
      const optimistic: UInternalNode = { ...node, id: `pending_node_${Date.now()}`, children: [] };
      set(state => ({
        departments: state.departments.map(d =>
          d.id === deptId ? { ...d, internalNodes: addNodeToTree(d.internalNodes, path, optimistic) } : d
        ),
      }));

      try {
        const response = await api.post<{ departments: UExternalNode[] }>(`/api/departments/${deptId}/nodes`, {
          ...node,
          parentNodeId: findPathParentNodeId(dept, path),
        });
        persistCache(storageKey, response.departments);
        set({ departments: response.departments });
        const savedDept = response.departments.find(d => d.id === deptId);
        return flattenNodes(savedDept?.internalNodes ?? []).find(n => n.label === node.label && n.type === node.type) ?? optimistic;
      } catch (err) {
        set(state => ({
          departments: state.departments.map(d =>
            d.id === deptId ? { ...d, internalNodes: deleteNodeFromTree(d.internalNodes, optimistic.id) } : d
          ),
        }));
        throw err;
      }
    },

    updateNode: async (deptId, nodeId, updates) => {
      const previous = get().departments;
      const currentNode = flattenNodes(previous.find(d => d.id === deptId)?.internalNodes ?? []).find(n => n.id === nodeId);
      const payload = currentNode ? { ...currentNode, ...updates } : updates;
      set(state => ({
        departments: state.departments.map(d =>
          d.id === deptId ? { ...d, internalNodes: updateNodeInTree(d.internalNodes, nodeId, updates) } : d
        ),
      }));
      try {
        const response = await api.patch<{ departments: UExternalNode[] }>(`/api/departments/nodes/${nodeId}`, payload);
        persistCache(storageKey, response.departments);
        set({ departments: response.departments });
      } catch (err) {
        set({ departments: previous });
        throw err;
      }
    },

    deleteNode: async (deptId, nodeId) => {
      const previous = get().departments;
      set(state => ({
        departments: state.departments.map(d =>
          d.id === deptId ? { ...d, internalNodes: deleteNodeFromTree(d.internalNodes, nodeId) } : d
        ),
      }));
      try {
        const response = await api.delete<{ departments: UExternalNode[] }>(`/api/departments/nodes/${nodeId}`);
        const departments = normalizeDepartmentsFromApi(response.departments ?? []);
        persistCache(storageKey, departments);
        set({ departments });
      } catch (err) {
        set({ departments: previous });
        throw err;
      }
    },

    addNodeMember: async (nodeId, memberId) => {
      const response = await api.post<{ departments: UExternalNode[] }>(`/api/departments/nodes/${nodeId}/members`, { memberId });
      const departments = response.departments ?? [];
      persistCache(storageKey, departments);
      set({ departments });
    },

    removeNodeMember: async (nodeId, memberId) => {
      const response = await api.delete<{ departments: UExternalNode[] }>(`/api/departments/nodes/${nodeId}/members/${memberId}`);
      const departments = response.departments ?? [];
      persistCache(storageKey, departments);
      set({ departments });
    },
  }));
}

const useTwinPolytopeStore = createLocalPolytopeStore({
  storageKey: TWIN_CACHE_KEY,
  defaultDepartments: TWIN_DEFAULT_DEPARTMENTS,
  onboardingFallback: true,
});

const useBdtPolytopeStore = createApiPolytopeStore({
  storageKey: BDT_CACHE_KEY,
  defaultDepartments: BDT_DEFAULT_DEPARTMENTS,
  onboardingFallback: true,
});

export function primeBdtDepartmentCache(departments: UExternalNode[]) {
  persistCache(BDT_CACHE_KEY, departments);
  useBdtPolytopeStore.setState({ departments, loaded: true, loading: false, error: null });
}

export function primeTwinDepartmentCache(departments: UExternalNode[]) {
  persistCache(TWIN_CACHE_KEY, departments);
  useTwinPolytopeStore.setState({ departments, loaded: true, loading: false, error: null });
}

export function usePolytopeStore(scope: PolytopeStoreScope = 'bdt') {
  return scope === 'twin' ? useTwinPolytopeStore() : useBdtPolytopeStore();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === TWIN_CACHE_KEY || event.key === LEGACY_STORAGE_KEY) {
      try {
        const next = event.newValue ? JSON.parse(event.newValue) : null;
        useTwinPolytopeStore.setState({ departments: next ?? TWIN_DEFAULT_DEPARTMENTS });
      } catch (e) {
        console.error('Error syncing twin department cache:', e);
      }
    }
    if (event.key === BDT_CACHE_KEY) {
      try {
        const next = event.newValue ? JSON.parse(event.newValue) : null;
        useBdtPolytopeStore.setState({ departments: next ?? BDT_DEFAULT_DEPARTMENTS });
      } catch (e) {
        console.error('Error syncing BDT department cache:', e);
      }
    }
  });
}
