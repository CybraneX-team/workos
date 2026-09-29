import { api } from '../api';
import type { SupercycleArchetype, SupercycleArchetypeId } from '../supercycleData';
import type {
  PmsCycle, PmsDepartmentCycle, PmsLiveInstance,
  PmsProject, PmsTask, PmsMilestone, PmsRisk, PmsDecision, PmsFileLink, PmsMessage,
} from '../usePmsStore';

// Client for the company-scoped Supercycle store (Item 1.1).
// The server round-trips the supercycle slice but does not persist the
// client-side createdAt/updatedAt timestamps, so the wire types omit them; the
// store fills them back in when it adopts server data.

export type WireCycle = Omit<PmsCycle, 'createdAt' | 'updatedAt'>;
export type WireDepartmentCycle = Omit<PmsDepartmentCycle, 'createdAt' | 'updatedAt'>;
export type WireInstance = Omit<PmsLiveInstance, 'createdAt' | 'updatedAt'>;

export type PmsSupercycleSlice = {
  archetypeId: SupercycleArchetypeId;
  cycles: WireCycle[];
  departmentCycles: WireDepartmentCycle[];
  instances: WireInstance[];
  // Execution layer (Phase 4). Mirrored to Postgres as JSONB, round-tripped
  // exactly (their own ids/timestamps kept), so these carry no omitted fields.
  projects: PmsProject[];
  tasks: PmsTask[];
  milestones: PmsMilestone[];
  risks: PmsRisk[];
  decisions: PmsDecision[];
  files: PmsFileLink[];
  messages: PmsMessage[];
};

// The company-owned, editable skeleton, keyed by archetype. This is now the
// ONLY source of the node/sub-node/stage structure (Phase 5 removed the
// hardcoded catalogue). Shaped as SupercycleArchetype; the server also attaches
// slot colours / node slot indices as extra fields consumers may ignore.
export type WireArchetypes = Partial<Record<SupercycleArchetypeId, SupercycleArchetype>>;

// GET returns the slice plus the skeleton; PUT only ever sends the slice (the
// skeleton is not client-writable through this endpoint).
export type PmsSupercycleResponse = PmsSupercycleSlice & { archetypes?: WireArchetypes };

// ── Phase 3: per-level (lazy) drill-down reads ──────────────────────────────
export type WireStage = { id: string; label: string; index: number };
export type WireSubNode = { id: string; label: string };

export type NodeDetail = {
  archetypeId: SupercycleArchetypeId;
  node: { id: string; label: string; color: string; slot: number; subCycleLabel: string };
  subNodes: WireSubNode[];
  stages: WireStage[];
  departmentCycles: WireDepartmentCycle[];
  instances: WireInstance[];
  cycles: WireCycle[];
  projects: PmsProject[];
};
export type SubNodeDetail = {
  archetypeId: SupercycleArchetypeId;
  nodeId: string;
  subNode: WireSubNode;
  stages: WireStage[];
  instances: WireInstance[];
};
export type StageDetail = {
  archetypeId: SupercycleArchetypeId;
  nodeId: string;
  stage: WireStage;
  instances: WireInstance[];
  projects: PmsProject[];
};

const enc = encodeURIComponent;

export const pmsSupercycle = {
  get: () => api.get<PmsSupercycleResponse>('/api/pms/supercycle'),
  save: (body: PmsSupercycleSlice) => api.put<PmsSupercycleResponse>('/api/pms/supercycle', body),

  // Drill level 1: one planet/department node.
  getNode: (archetypeId: SupercycleArchetypeId, nodeId: string) =>
    api.get<NodeDetail>(`/api/pms/supercycle/nodes/${enc(archetypeId)}/${enc(nodeId)}`),
  // Drill level 2: one sub-node inside a node.
  getSubNode: (archetypeId: SupercycleArchetypeId, nodeId: string, subNodeId: string) =>
    api.get<SubNodeDetail>(`/api/pms/supercycle/nodes/${enc(archetypeId)}/${enc(nodeId)}/subnodes/${enc(subNodeId)}`),
  // Drill level 3: one stage (e.g. "Build") — the execution entry point.
  getStage: (archetypeId: SupercycleArchetypeId, nodeId: string, stageId: string) =>
    api.get<StageDetail>(`/api/pms/supercycle/nodes/${enc(archetypeId)}/${enc(nodeId)}/stages/${enc(stageId)}`),
};
