// BDT node/catalog enums and metadata shapes. The backend's src/data/bdtCatalog.ts remains
// the source of truth for the actual DATA (DEPT_META, DEPT_LEVEL1_NODES, DEPT_SIZE_CONFIGS,
// the runtime Sets, and the enum-to-label maps) and for validation — this file only carries
// the pure TYPE contracts both repos need to agree on, previously hand-duplicated:
//   - backend: startup_digital_twin_backend/src/data/bdtCatalog.ts
//   - frontend: Startup_Digital_Twin/src/lib/bdtCatalog.ts (as CatalogDeptMeta/CatalogLevel1Def/
//     CatalogSizeConfig) and, separately and more riskily, re-declared inline in
//     Startup_Digital_Twin/src/lib/bdtPolytopeData.ts (UInternalNode.type, UBranchKind, etc.)
//     with values that had already drifted from the backend's — left as-is per this migration's
//     scope (infra only, no behavior changes), but now both sides should import from here.

export type Domain = 'direction' | 'build' | 'delivery' | 'market' | 'control' | 'people';

/** Node kinds — must match department_bdt_nodes.node_type CHECK (migration 020). */
export type NodeType =
  | 'team' | 'process' | 'project' | 'resource' | 'decision'
  | 'risk' | 'metric' | 'branch' | 'action' | 'signal';

/** The 8 universal branch types every department maps onto (hidden AI/analytics taxonomy). */
export type BranchKind =
  | 'purpose_scope'
  | 'objectives_okrs'
  | 'core_workstreams'
  | 'metrics_health'
  | 'resources_capacity'
  | 'dependencies'
  | 'risks_controls'
  | 'decision_queue';

/** Position in the BDT hierarchy — must match department_bdt_nodes.node_level CHECK (migration 028). */
export type NodeLevel = 'level1' | 'branch' | 'internal' | 'action';

/** Company size variant — controls how many department roots are visible. */
export type CompanySize = 'micro' | 'msme' | 'standard' | 'enterprise';

export interface DeptLevel1Def {
  sourceKey: string;
  label: string;
  mappedUniversalCategory: BranchKind;
}

export interface DeptMeta {
  id: string;
  label: string;
  domain: Domain;
  cluster: string;
  score: number;
  color: string;
  metrics: { performance: number; efficiency: number; capacity: number; alignment: number; risk: number };
}

export interface SizeConfig {
  label: string;
  rootCount: number;
  visibleDeptIds: string[];
  mergedGroups?: Record<string, string[]>;
}
