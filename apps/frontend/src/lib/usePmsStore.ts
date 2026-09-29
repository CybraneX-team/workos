import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupercycleArchetypeId } from './supercycleData';
import { pmsSupercycle, type WireArchetypes } from './db/pmsSupercycle';

export type PmsView = 'gallery' | 'department' | 'org' | 'hypercube';
export type PmsProjectStatus = 'on_track' | 'at_risk' | 'delayed' | 'done';
export type PmsTaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type PmsInstanceStatus = 'active' | 'paused' | 'completed';

export type PmsTask = {
  id: string;
  projectId: string;
  title: string;
  status: PmsTaskStatus;
  assigneeId?: string;
  dueDate?: string;
  blockedByTaskId?: string;
  createdAt: string;
};

export type PmsMilestone = {
  id: string;
  projectId: string;
  title: string;
  dueDate?: string;
  done: boolean;
  dependsOnMilestoneId?: string;
};

export type PmsRisk = {
  id: string;
  projectId: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  mitigated: boolean;
};

export type PmsDecision = {
  id: string;
  projectId: string;
  title: string;
  status: 'open' | 'approved' | 'rejected';
  createdAt: string;
};

export type PmsFileLink = { id: string; projectId: string; label: string; url: string; createdAt: string };
export type PmsMessage = { id: string; projectId: string; authorId: string; body: string; createdAt: string };
export type PmsCycle = {
  id: string;
  archetypeId: SupercycleArchetypeId;
  name: string;
  color: string;
  departmentIds: string[];
  subNodeIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type PmsDepartmentCycle = {
  id: string;
  archetypeId: SupercycleArchetypeId;
  departmentId: string;
  name: string;
  color: string;
  stageIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type PmsProject = {
  id: string;
  name: string;
  description: string;
  departmentId: string;
  ownerId: string;
  memberIds: string[];
  status: PmsProjectStatus;
  liveInstanceId?: string;
  createdAt: string;
};

export type PmsLiveInstance = {
  id: string;
  name: string;
  departmentNodeId: string;
  subNodeId?: string;
  templateId: string;
  stageIndex: number;
  status: PmsInstanceStatus;
  objectType?: 'customer' | 'opportunity' | 'product' | 'programme' | 'contract' | 'campaign';
  objectId?: string;
  createdAt: string;
  updatedAt: string;
};

export type PmsState = {
  version: 1;
  archetypeId: SupercycleArchetypeId;
  projects: PmsProject[];
  tasks: PmsTask[];
  milestones: PmsMilestone[];
  risks: PmsRisk[];
  decisions: PmsDecision[];
  files: PmsFileLink[];
  messages: PmsMessage[];
  instances: PmsLiveInstance[];
  cycles: PmsCycle[];
  departmentCycles: PmsDepartmentCycle[];
  // The company-owned skeleton fetched from the server (Phase 2). Cached in
  // localStorage for instant paint; falls back to the hardcoded catalogue when
  // absent. Never pushed back to the server (read-only through this endpoint).
  archetypes?: WireArchetypes;
};

export type PmsRepository = {
  read(): PmsState;
  write(next: PmsState): void;
  subscribe(listener: () => void): () => void;
};

// Phase 5: default cycles are seeded SERVER-side (ensureCompanyDefaults) from
// the per-company skeleton, so the client no longer generates them from a
// hardcoded catalogue. A fresh browser starts empty and adopts the server's
// seeded cycles on first fetch.
const emptyState = (): PmsState => ({
  version: 1,
  archetypeId: 'b2b_saas',
  projects: [],
  tasks: [],
  milestones: [],
  risks: [],
  decisions: [],
  files: [],
  messages: [],
  instances: [],
  cycles: [],
  departmentCycles: [],
});

// The full slice mirrored to Postgres (per company). Phase 4: this now covers
// the whole PmsState — the supercycle slice AND the execution layer — so the
// server is authoritative for everything and localStorage is only a cache.
function supercycleSlice(state: PmsState) {
  return {
    archetypeId: state.archetypeId,
    cycles: state.cycles,
    departmentCycles: state.departmentCycles,
    instances: state.instances,
    projects: state.projects,
    tasks: state.tasks,
    milestones: state.milestones,
    risks: state.risks,
    decisions: state.decisions,
    files: state.files,
    messages: state.messages,
  };
}

const repositories = new Map<string, PmsRepository>();

function storageRepository(companyId: string): PmsRepository {
  const existing = repositories.get(companyId);
  if (existing) return existing;
  const key = `workos_pms_v1:${companyId}`;
  const eventName = `workos_pms_updated:${companyId}`;
  const read = (): PmsState => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return emptyState();
      return { ...emptyState(), ...JSON.parse(raw), version: 1 };
    } catch {
      return emptyState();
    }
  };
  const repository: PmsRepository = {
    read,
    write(next) {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event(eventName));
    },
    subscribe(listener) {
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) listener();
      };
      window.addEventListener(eventName, listener);
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener(eventName, listener);
        window.removeEventListener('storage', onStorage);
      };
    },
  };
  repositories.set(companyId, repository);
  return repository;
}

// Item 1.1: Postgres is the source of truth for the supercycle slice. Each
// company gets one long-lived sync controller (cached), created lazily by the
// hook. localStorage is only an offline cache so the first paint is instant;
// the server is fetched on mount and re-fetched whenever the window/tab regains
// focus, so a change made in one browser shows up in another. Local edits are
// pushed (debounced) as a full-replace mirror. If the server has never been
// saved for this company it is bootstrapped once from the local defaults.

type SupercycleSync = { refetch: () => void };
const supercycleControllers = new Map<string, SupercycleSync>();

function createSupercycleSync(companyId: string, repository: PmsRepository): SupercycleSync {
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let getInFlight = false;
  // Signature of the slice we last know is in sync with the server, so we don't
  // re-push what we just adopted or re-adopt what we just pushed.
  let lastSynced = '';

  const pushSlice = () => {
    const slice = supercycleSlice(repository.read());
    const sig = JSON.stringify(slice);
    if (sig === lastSynced) return;
    lastSynced = sig;
    pmsSupercycle.save(slice).catch((err) => {
      // Allow a later change (or refetch) to retry instead of silently wedging.
      lastSynced = '';
      console.warn('[pms-supercycle] save failed', err);
    });
  };

  const adopt = (server: Awaited<ReturnType<typeof pmsSupercycle.get>>) => {
    const now = new Date().toISOString();
    const current = repository.read();
    const withStamps = <T,>(rows: T[]) => rows.map((r) => ({
      createdAt: now, updatedAt: now, ...(r as Record<string, unknown>),
    }));
    // No-data-loss backfill: if the server has never stored execution data but
    // this browser has some locally, keep the local copy (it gets pushed up)
    // instead of letting the server's empty arrays clobber it.
    const serverHasExec = (server.projects?.length ?? 0) > 0
      || (server.tasks?.length ?? 0) > 0 || (server.milestones?.length ?? 0) > 0
      || (server.risks?.length ?? 0) > 0 || (server.decisions?.length ?? 0) > 0
      || (server.files?.length ?? 0) > 0 || (server.messages?.length ?? 0) > 0;
    const localHasExec = current.projects.length > 0 || current.tasks.length > 0
      || current.milestones.length > 0 || current.risks.length > 0
      || current.decisions.length > 0 || current.files.length > 0 || current.messages.length > 0;
    const keepLocalExec = !serverHasExec && localHasExec;
    const pick = <T,>(srv: T[] | undefined, loc: T[]) => (keepLocalExec ? loc : (srv ?? loc));

    const merged: PmsState = {
      ...current,
      archetypeId: server.archetypeId ?? current.archetypeId,
      cycles: withStamps(server.cycles) as PmsState['cycles'],
      departmentCycles: withStamps(server.departmentCycles) as PmsState['departmentCycles'],
      instances: withStamps(server.instances) as PmsState['instances'],
      // Execution layer round-trips exactly (own ids/timestamps kept), so adopt
      // it as-is — unless we're backfilling local data into an empty server.
      projects: pick(server.projects, current.projects),
      tasks: pick(server.tasks, current.tasks),
      milestones: pick(server.milestones, current.milestones),
      risks: pick(server.risks, current.risks),
      decisions: pick(server.decisions, current.decisions),
      files: pick(server.files, current.files),
      messages: pick(server.messages, current.messages),
    };
    const mergedSig = JSON.stringify(supercycleSlice(merged));
    // Avoid a redundant write/re-render when the server matches what we have.
    if (JSON.stringify(supercycleSlice(current)) !== mergedSig) repository.write(merged);
    if (keepLocalExec) {
      // Force the kept-local execution up to the empty server.
      lastSynced = '';
      pushSlice();
    } else {
      lastSynced = mergedSig;
    }
  };

  const refetch = () => {
    if (getInFlight) return;
    // A local edit is queued to be saved — don't let a focus refetch clobber it.
    if (pushTimer) return;
    getInFlight = true;
    void (async () => {
      try {
        const server = await pmsSupercycle.get();
        // Always cache the server skeleton (Phase 2). It is server-authoritative
        // and seeded for every company, so adopt it independently of whether the
        // data slice (cycles/instances) has rows yet.
        if (server.archetypes) {
          const current = repository.read();
          if (JSON.stringify(current.archetypes) !== JSON.stringify(server.archetypes)) {
            repository.write({ ...current, archetypes: server.archetypes });
          }
        }
        const hasServer = (server.cycles?.length ?? 0) > 0
          || (server.departmentCycles?.length ?? 0) > 0
          || (server.instances?.length ?? 0) > 0;
        if (hasServer) {
          adopt(server);
        } else {
          // Company has never saved: bootstrap the server from local defaults.
          pushSlice();
        }
      } catch (err) {
        console.warn('[pms-supercycle] refetch failed (using local cache)', err);
      } finally {
        getInFlight = false;
      }
    })();
  };

  repository.subscribe(() => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushSlice();
    }, 600);
  });

  return { refetch };
}

function getSupercycleSync(companyId: string, repository: PmsRepository): SupercycleSync | null {
  if (!companyId || companyId === 'unscoped') return null;
  const existing = supercycleControllers.get(companyId);
  if (existing) return existing;
  const controller = createSupercycleSync(companyId, repository);
  supercycleControllers.set(companyId, controller);
  return controller;
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function projectHealth(projectId: string, state: PmsState): number | null {
  const tasks = state.tasks.filter((task) => task.projectId === projectId);
  const risks = state.risks.filter((risk) => risk.projectId === projectId && !risk.mitigated);
  if (tasks.length === 0 && risks.length === 0) return null;
  const taskScore = tasks.length
    ? tasks.reduce((sum, task) => sum + ({ todo: 20, in_progress: 55, review: 80, done: 100 }[task.status]), 0) / tasks.length
    : 100;
  const riskPenalty = risks.reduce((sum, risk) => sum + ({ low: 5, medium: 12, high: 22 }[risk.severity]), 0);
  return Math.max(0, Math.round(taskScore - riskPenalty));
}

export function instanceHealth(instanceId: string, state: PmsState): number | null {
  const healths = state.projects
    .filter((project) => project.liveInstanceId === instanceId)
    .map((project) => projectHealth(project.id, state))
    .filter((health): health is number => health !== null);
  if (healths.length === 0) return null;
  return Math.round(healths.reduce((sum, health) => sum + health, 0) / healths.length);
}

export function departmentHealth(departmentId: string, state: PmsState): number | null {
  const healths = state.projects
    .filter((project) => project.departmentId === departmentId)
    .map((project) => projectHealth(project.id, state))
    .filter((health): health is number => health !== null);
  if (healths.length === 0) return null;
  return Math.round(healths.reduce((sum, health) => sum + health, 0) / healths.length);
}

export function usePmsStore(companyId: string | null | undefined) {
  const repository = useMemo(() => storageRepository(companyId || 'unscoped'), [companyId]);
  const [state, setState] = useState<PmsState>(() => repository.read());

  useEffect(() => {
    setState(repository.read());
    const unsubscribe = repository.subscribe(() => setState(repository.read()));

    const sync = getSupercycleSync(companyId || 'unscoped', repository);
    if (!sync) return unsubscribe;

    // DB is the source of truth: pull on mount (screen open) and whenever the
    // window/tab regains focus, so changes made in another browser show up here.
    sync.refetch();
    const onFocus = () => sync.refetch();
    const onVisibility = () => { if (document.visibilityState === 'visible') sync.refetch(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [repository, companyId]);

  const update = useCallback((mutate: (current: PmsState) => PmsState) => {
    const next = mutate(repository.read());
    repository.write(next);
  }, [repository]);

  return {
    state,
    // Just switch the active archetype. Its cycles are seeded server-side and
    // arrive via the fetch, so there is nothing to generate client-side.
    setArchetype: useCallback((archetypeId: SupercycleArchetypeId) => update((current) => ({
      ...current,
      archetypeId,
    })), [update]),
    createCycle: useCallback((input: Pick<PmsCycle, 'archetypeId' | 'name' | 'color' | 'departmentIds' | 'subNodeIds'>) => {
      const now = new Date().toISOString();
      const cycle: PmsCycle = { ...input, id: id('cycle'), createdAt: now, updatedAt: now };
      update((current) => ({ ...current, cycles: [...current.cycles, cycle] }));
      return cycle.id;
    }, [update]),
    updateCycle: useCallback((cycleId: string, patch: Partial<Pick<PmsCycle, 'name' | 'color' | 'departmentIds' | 'subNodeIds'>>) => update((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) => cycle.id === cycleId ? { ...cycle, ...patch, updatedAt: new Date().toISOString() } : cycle),
    })), [update]),
    deleteCycle: useCallback((cycleId: string) => update((current) => ({
      ...current,
      cycles: current.cycles.filter((cycle) => cycle.id !== cycleId),
    })), [update]),
    createDepartmentCycle: useCallback((input: Pick<PmsDepartmentCycle, 'archetypeId' | 'departmentId' | 'name' | 'color' | 'stageIds'>) => {
      const now = new Date().toISOString();
      const cycle: PmsDepartmentCycle = { ...input, id: id('department_cycle'), createdAt: now, updatedAt: now };
      update((current) => ({ ...current, departmentCycles: [...current.departmentCycles, cycle] }));
      return cycle.id;
    }, [update]),
    updateDepartmentCycle: useCallback((cycleId: string, patch: Partial<Pick<PmsDepartmentCycle, 'name' | 'color' | 'stageIds'>>) => update((current) => ({
      ...current,
      departmentCycles: current.departmentCycles.map((cycle) => cycle.id === cycleId
        ? { ...cycle, ...patch, updatedAt: new Date().toISOString() }
        : cycle),
    })), [update]),
    deleteDepartmentCycle: useCallback((cycleId: string) => update((current) => ({
      ...current,
      departmentCycles: current.departmentCycles.filter((cycle) => cycle.id !== cycleId),
    })), [update]),
    createInstance: useCallback((input: Omit<PmsLiveInstance, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString();
      const instance = { ...input, id: id('instance'), createdAt: now, updatedAt: now };
      update((current) => ({ ...current, instances: [...current.instances, instance] }));
      return instance.id;
    }, [update]),
    updateInstance: useCallback((instanceId: string, patch: Partial<PmsLiveInstance>) => update((current) => ({
      ...current,
      instances: current.instances.map((instance) => instance.id === instanceId
        ? { ...instance, ...patch, updatedAt: new Date().toISOString() }
        : instance),
    })), [update]),
    createProject: useCallback((input: Omit<PmsProject, 'id' | 'createdAt' | 'status'>) => {
      const project = { ...input, id: id('project'), status: 'on_track' as const, createdAt: new Date().toISOString() };
      update((current) => ({ ...current, projects: [...current.projects, project] }));
      return project.id;
    }, [update]),
    updateProject: useCallback((projectId: string, patch: Partial<PmsProject>) => update((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === projectId ? { ...project, ...patch } : project),
    })), [update]),
    deleteProject: useCallback((projectId: string) => update((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== projectId),
      tasks: current.tasks.filter((task) => task.projectId !== projectId),
      milestones: current.milestones.filter((milestone) => milestone.projectId !== projectId),
      risks: current.risks.filter((risk) => risk.projectId !== projectId),
      decisions: current.decisions.filter((decision) => decision.projectId !== projectId),
      files: current.files.filter((file) => file.projectId !== projectId),
      messages: current.messages.filter((message) => message.projectId !== projectId),
    })), [update]),
    addTask: useCallback((projectId: string, title: string) => update((current) => ({
      ...current,
      tasks: [...current.tasks, { id: id('task'), projectId, title, status: 'todo', createdAt: new Date().toISOString() }],
    })), [update]),
    updateTask: useCallback((taskId: string, patch: Partial<PmsTask>) => update((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task),
    })), [update]),
    addMilestone: useCallback((projectId: string, title: string) => update((current) => ({
      ...current,
      milestones: [...current.milestones, { id: id('milestone'), projectId, title, done: false }],
    })), [update]),
    toggleMilestone: useCallback((milestoneId: string) => update((current) => ({
      ...current,
      milestones: current.milestones.map((milestone) => milestone.id === milestoneId ? { ...milestone, done: !milestone.done } : milestone),
    })), [update]),
    addRisk: useCallback((projectId: string, title: string, severity: PmsRisk['severity']) => update((current) => ({
      ...current,
      risks: [...current.risks, { id: id('risk'), projectId, title, severity, mitigated: false }],
    })), [update]),
    toggleRisk: useCallback((riskId: string) => update((current) => ({
      ...current,
      risks: current.risks.map((risk) => risk.id === riskId ? { ...risk, mitigated: !risk.mitigated } : risk),
    })), [update]),
    addDecision: useCallback((projectId: string, title: string) => update((current) => ({
      ...current,
      decisions: [...current.decisions, { id: id('decision'), projectId, title, status: 'open', createdAt: new Date().toISOString() }],
    })), [update]),
    updateDecision: useCallback((decisionId: string, status: PmsDecision['status']) => update((current) => ({
      ...current,
      decisions: current.decisions.map((decision) => decision.id === decisionId ? { ...decision, status } : decision),
    })), [update]),
    addFileLink: useCallback((projectId: string, label: string, url: string) => update((current) => ({
      ...current,
      files: [...current.files, { id: id('file'), projectId, label, url, createdAt: new Date().toISOString() }],
    })), [update]),
    addMessage: useCallback((projectId: string, authorId: string, body: string) => update((current) => ({
      ...current,
      messages: [...current.messages, { id: id('message'), projectId, authorId, body, createdAt: new Date().toISOString() }],
    })), [update]),
  };
}
