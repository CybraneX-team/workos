import { DEPT_META } from './bdtCatalog.js';
import { BDT_TAXONOMY, BDT_TAXONOMY_VERSION, type BdtTaxonomyDepartment } from './bdtTaxonomy.js';

export type BdtSeedDepartment = {
  id?: string;
  source_key?: string;
  label: string;
  domain?: string;
  cluster?: string;
  color?: string;
  score?: number;
  metrics?: Record<string, number>;
  internalNodes?: unknown[];
  [key: string]: unknown;
};

function buildSeedDepartment(department: BdtTaxonomyDepartment): BdtSeedDepartment {
  const meta = DEPT_META.find(candidate => candidate.id === department.sourceKey);
  if (!meta) throw new Error(`Missing BDT metadata for ${department.sourceKey}`);
  return {
    id: meta.id,
    source_key: meta.id,
    label: meta.label,
    domain: meta.domain,
    cluster: meta.cluster,
    color: meta.color,
    score: meta.score,
    metrics: meta.metrics,
    internalNodes: department.nodes.map((node, index) => ({
      id: `${department.sourceKey}_v4_${index}`,
      label: node.label,
      type: node.nodeType,
      score: meta.score,
      nodeLevel: 'level1',
      mappedUniversalCategory: node.mappedUniversalCategory,
      branchKind: node.mappedUniversalCategory,
      metadata: {
        sourceKey: node.sourceKey,
        workspaceKind: node.workspaceKind,
        meaning: node.meaning,
        providerCapabilities: node.providerCapabilities,
        taxonomyVersion: BDT_TAXONOMY_VERSION,
        availability: 'active',
        ...(node.presentation ? { presentation: node.presentation } : {}),
      },
      children: [],
    })),
  };
}

/** Default V4 BDT tree for new companies. */
export function buildBdtSeedDepartments(): BdtSeedDepartment[] {
  return BDT_TAXONOMY.map(buildSeedDepartment);
}

export const BDT_SEED_DEPARTMENTS = buildBdtSeedDepartments();
