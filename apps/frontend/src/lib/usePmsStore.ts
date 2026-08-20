import { useCallback, useEffect, useMemo, useState } from 'react';
import { SUPERCYCLE_ARCHETYPES, type SupercycleArchetypeId } from './supercycleData';

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
};

export type PmsRepository = {
  read(): PmsState;
  write(next: PmsState): void;
  subscribe(listener: () => void): () => void;
};

function defaultCycle(archetypeId: SupercycleArchetypeId): PmsCycle {
  const now = new Date().toISOString();
  return {
    id: `cycle_default_${archetypeId}`,
    archetypeId,
    name: 'Revenue & Growth',
    color: '#4fd8ff',
    departmentIds: SUPERCYCLE_ARCHETYPES[archetypeId].nodes.map((node) => node.id),
    createdAt: now,
    updatedAt: now,
  };
}

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
  cycles: [defaultCycle('b2b_saas')],
});

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
    return repository.subscribe(() => setState(repository.read()));
  }, [repository]);

  const update = useCallback((mutate: (current: PmsState) => PmsState) => {
    const next = mutate(repository.read());
    repository.write(next);
  }, [repository]);

  return {
    state,
    setArchetype: useCallback((archetypeId: SupercycleArchetypeId) => update((current) => ({
      ...current,
      archetypeId,
      cycles: current.cycles.some((cycle) => cycle.archetypeId === archetypeId)
        ? current.cycles
        : [...current.cycles, defaultCycle(archetypeId)],
    })), [update]),
    createCycle: useCallback((input: Pick<PmsCycle, 'archetypeId' | 'name' | 'color' | 'departmentIds'>) => {
      const now = new Date().toISOString();
      const cycle: PmsCycle = { ...input, id: id('cycle'), createdAt: now, updatedAt: now };
      update((current) => ({ ...current, cycles: [...current.cycles, cycle] }));
      return cycle.id;
    }, [update]),
    updateCycle: useCallback((cycleId: string, patch: Partial<Pick<PmsCycle, 'name' | 'color' | 'departmentIds'>>) => update((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) => cycle.id === cycleId ? { ...cycle, ...patch, updatedAt: new Date().toISOString() } : cycle),
    })), [update]),
    deleteCycle: useCallback((cycleId: string) => update((current) => ({
      ...current,
      cycles: current.cycles.filter((cycle) => cycle.id !== cycleId),
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
