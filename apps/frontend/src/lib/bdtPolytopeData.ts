// ─────────────────────────────────────────────────────────────────────────────
// Universal Polytope Data — Real Departments with Health Scores & Workflows
// ─────────────────────────────────────────────────────────────────────────────

export type UDomain = 'direction' | 'build' | 'delivery' | 'market' | 'control' | 'people' | 'inactive';

// ── BDT structural types (Company Department spec) ────────────────────────────

/** The 8 universal branch types every department must have. */
export type UBranchKind =
  | 'purpose_scope'
  | 'objectives_okrs'
  | 'core_workstreams'
  | 'metrics_health'
  | 'resources_capacity'
  | 'dependencies'
  | 'risks_controls'
  | 'decision_queue';

export const U_BRANCH_KIND_LABELS: Record<UBranchKind, string> = {
  purpose_scope:      'Purpose & Scope',
  objectives_okrs:    'Objectives / OKRs',
  core_workstreams:   'Core Workstreams',
  metrics_health:     'Metrics & Health',
  resources_capacity: 'Resources & Capacity',
  dependencies:       'Dependencies',
  risks_controls:     'Risks & Controls',
  decision_queue:     'Decision Queue',
};

export const U_BRANCH_KINDS: UBranchKind[] = [
  'purpose_scope', 'objectives_okrs', 'core_workstreams', 'metrics_health',
  'resources_capacity', 'dependencies', 'risks_controls', 'decision_queue',
];

/** Position in the BDT hierarchy. 'level1' is the dept-specific named layer (max 6 per dept). */
export type UNodeLevel = 'level1' | 'department' | 'branch' | 'internal' | 'action';

/** Sub-kind for internal nodes (the 4th level, between branch and action). */
export type UInternalKind = 'team' | 'process' | 'tool' | 'system' | 'resource' | 'person';

/** Company size variant — controls how many department roots are visible. */
export type UCompanySize = 'micro' | 'msme' | 'standard' | 'enterprise';

export const U_DOMAIN_COLOR: Record<UDomain, string> = {
  direction: '#fde047',
  build:     '#8b5cf6',
  delivery:  '#06b6d4',
  market:    '#f97316',
  control:   '#10b981',
  people:    '#0ea5e9',
  inactive:  '#334155',
};

/** Accent color for a department/root — prefers explicit color, then domain palette. */
export function getExternalNodeColor(dept: Pick<UExternalNode, 'domain' | 'color'>): string {
  if (dept.color) return dept.color;
  return U_DOMAIN_COLOR[dept.domain] ?? '#8b5cf6';
}

export interface TeamMember {
  name: string;
  role: string;
  avatarUrl?: string;
  companyMemberId?: string;
  userId?: string;
  assignmentId?: string;
}

export interface ProjectDetails {
  description?: string;
  status?: string;
  deadline?: string;
  budget?: string;
  owner?: string;
  progress?: number;
  milestones?: { label: string; done: boolean }[];
  risks?: string[];
}

export interface SignalDetails {
  summary: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  detectedAt?: string;
  suggestedAction?: string;
}

export interface DecisionOption {
  id: string;
  label: string;
  description: string;
  impact: string;
}

export interface DecisionDetails {
  question: string;
  context: string;
  options: DecisionOption[];
  recommendation?: string;
}

export interface MetricDetails {
  name: string;
  value: number | string;
  target: number | string;
  unit?: string;
  trend: 'up' | 'down' | 'flat';
  status: 'healthy' | 'warning' | 'critical';
}

export interface ActionDetails {
  verb: string;
  description: string;
  checklist?: string[];
  /** How the company graph changes after this action completes (spec requirement). */
  stateChange?: string;
}

export interface UInternalNode {
  id: string;
  /** Positional catalog key from department_bdt_nodes.source_key — shifts if the tree is reordered. */
  sourceKey?: string;
  /** Content-derived key from department_bdt_nodes.metadata.sourceKey — stable across reorders. */
  stableSourceKey?: string;
  label: string;
  type: 'team' | 'process' | 'project' | 'resource' | 'decision' | 'risk' | 'metric' | 'branch' | 'action' | 'signal';
  score: number;
  manualScore?: number;
  computedScore?: number | null;
  scoreSource?: 'manual' | 'computed';
  metricCoverage?: { metricCount: number; coveredNodeCount: number; eligibleNodeCount: number; calculatedAt: string } | null;
  children?: UInternalNode[];
  memberCount?: number;
  members?: TeamMember[];
  projectDetails?: ProjectDetails;
  owner?: string;
  dueDate?: string;
  status?: 'Open' | 'In Progress' | 'Blocked' | 'Completed';
  output?: string;
  metricImpact?: string;
  stateChange?: string;
  dependencies?: string[];
  workflowSteps?: string[];
  interrelatedDepartments?: string[];
  signalDetails?: SignalDetails;
  decisionDetails?: DecisionDetails;
  metricDetails?: MetricDetails;
  actionDetails?: ActionDetails;
  /** Which of the 8 universal branch types this node belongs to (set on branch-level nodes). */
  branchKind?: UBranchKind;
  /** Position in the BDT hierarchy. */
  nodeLevel?: UNodeLevel;
  /** Sub-kind for internal nodes (4th level between branch and leaf). */
  internalKind?: UInternalKind;
  /** Hidden AI/analytics taxonomy — set only on nodeLevel='level1' nodes. Maps dept-specific label to universal category. */
  mappedUniversalCategory?: UBranchKind;
}

/** Leaf types that open the BDT action workspace — not team/project/process containers. */
export const BDT_ACTION_LEAF_TYPES = ['metric', 'signal', 'decision', 'action'] as const;

export function isActionLeafNode(node: Pick<UInternalNode, 'type'> | null | undefined): boolean {
  if (!node) return false;
  return (BDT_ACTION_LEAF_TYPES as readonly string[]).includes(node.type);
}

export function isProjectLeafNode(node: Pick<UInternalNode, 'type' | 'projectDetails' | 'children'> | null | undefined): boolean {
  if (!node) return false;
  return node.type === 'project' && !!node.projectDetails && (!node.children || node.children.length === 0);
}

/** Opens BDT action / project workspace — Level-1 container nodes never open the workspace. */
export function isBdtWorkspaceLeafNode(node: Pick<UInternalNode, 'type' | 'nodeLevel' | 'projectDetails' | 'children'> | null | undefined): boolean {
  if (!node || node.nodeLevel === 'level1') return false;
  return isActionLeafNode(node) || isProjectLeafNode(node);
}

/**
 * Whether a leaf has any wired-up data panel (real ERPNext data or intentional Marketing demo
 * data) — used to dim/block unwired leaves in the 3D graph and the sidebar node list.
 *
 * Matching happens against the nearest BRANCH ancestor's label, not the leaf's own label — the
 * BDT tree is Level-1 → branch (e.g. "contracts") → optional team/process/project nodes →
 * action/metric leaves (e.g. "review vendor performance", "contracts health"), and the backend's
 * mapping keys are branch-level (`ops_vendors_contracts`), not per-individual-leaf. Callers must
 * therefore thread the nearest known branch ancestor label down to the leaf; for a path-walking
 * consumer (e.g. the sidebar) that's the nearest node with `nodeLevel === 'branch'`.
 *
 * When `activeKeys`/`departmentSourceKey` aren't passed (e.g. the unrelated reference-company
 * planet view, or the Twin route whose legacy departments never set `sourceKey`), this returns
 * true — "fully active" — so unrelated callers keep working unchanged.
 */
export function isBdtNodeActive(
  branchSourceKey: string | undefined,
  branchLabel: string | undefined,
  level1Label: string | undefined,
  departmentSourceKey: string | undefined,
  activeKeys: Set<string> | undefined,
): boolean {
  // No departmentSourceKey means this caller never opted into gating (e.g. the Twin/
  // reference-company planet view) — always active there, regardless of whether the
  // separate BDT store happens to have activeKeys loaded elsewhere in the session.
  if (!departmentSourceKey) return true;
  // Active-nodes not loaded yet (e.g. still fetching) — don't block prematurely.
  if (!activeKeys) return true;
  if (branchSourceKey && activeKeys.has(`${departmentSourceKey}::${branchSourceKey}`)) return true;
  if (!level1Label || !branchLabel) return false;
  return activeKeys.has(`${departmentSourceKey}::${level1Label}::${branchLabel}`);
}

export interface UExternalNode {
  id: string;
  /** Catalog key from DB source_key column (e.g. "dept_engineering") — used for size-based visibility filtering */
  sourceKey?: string;
  label: string;
  domain: UDomain;
  cluster: string;
  score: number;
  manualScore?: number;
  computedScore?: number | null;
  scoreSource?: 'manual' | 'computed';
  metricCoverage?: { metricCount: number; coveredNodeCount: number; eligibleNodeCount: number; calculatedAt: string } | null;
  metrics: {
    performance: number;
    efficiency: number;
    capacity: number;
    alignment: number;
    risk: number;
  };
  internalNodes: UInternalNode[];
  /** Planet root accent — when set, overrides U_DOMAIN_COLOR for visualization. */
  color?: string;
  access?: {
    read: boolean;
    write: boolean;
    delete: boolean;
    manage: boolean;
  };
  /** Transient flag — draft nodes are rendered in-scene but not persisted */
  isDraft?: boolean;
  /** Active company size variant — controls visible root count. */
  companySize?: UCompanySize;
}

/** When access is missing (seed/cache), allow CRUD if the user has global manage rights. */
export function resolveDepartmentWrite(canManage: boolean, dept?: UExternalNode | null): boolean {
  if (!canManage || !dept) return false;
  if (dept.access === undefined) return true;
  return dept.access.write;
}

export function resolveDepartmentDelete(canManage: boolean, dept?: UExternalNode | null): boolean {
  if (!canManage || !dept) return false;
  if (dept.access === undefined) return true;
  return dept.access.delete;
}

const POLYTOPE_TARGETS = [12, 20, 30, 42, 56, 72, 90, 110, 132];

export function resolvePolytopeNodeCount(deptCount: number): {
  totalNodes: number;
  inactiveCount: number;
} {
  const minTotal = deptCount + 4;
  const target = POLYTOPE_TARGETS.find(t => t >= minTotal) ??
    Math.ceil(minTotal / 12) * 12;
  return { totalNodes: target, inactiveCount: target - deptCount };
}
