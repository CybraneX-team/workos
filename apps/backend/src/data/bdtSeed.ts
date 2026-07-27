import { DEPT_META } from './bdtCatalog.js';
import {
  BDT_TAXONOMY,
  BDT_TAXONOMY_VERSION,
  type BdtTaxonomyBranch,
  type BdtTaxonomyCapability,
  type BdtTaxonomyDepartment,
} from './bdtTaxonomy.js';

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

const DEPT_PREFIX: Record<string, string> = {
  dept_engineering: 'eng', dept_product: 'prd', dept_sales: 'sal',
  dept_marketing: 'mkt', dept_hr: 'hr', dept_finance: 'fin',
  dept_operations: 'ops', dept_data: 'dat', dept_design: 'des',
  dept_security: 'sec', dept_customer_success: 'cs', dept_legal: 'leg',
  dept_strategy: 'str',
};

function branchMetadata(
  department: BdtTaxonomyDepartment,
  capability: BdtTaxonomyCapability,
  branch: BdtTaxonomyBranch,
) {
  return {
    departmentLabel: department.departmentLabel,
    level1Label: capability.label,
    branchItem: branch.label,
    meaning: branch.meaning,
    conceptKey: branch.conceptKey,
    availability: branch.availability,
    presentation: branch.presentation,
    actionExamples: branch.actionExamples,
    integrations: branch.integrations,
    metricImpacts: branch.metricImpacts,
    sourceKey: branch.sourceKey,
    taxonomyVersion: BDT_TAXONOMY_VERSION,
  };
}

function buildSeedDepartment(department: BdtTaxonomyDepartment): BdtSeedDepartment {
  const meta = DEPT_META.find((candidate) => candidate.id === department.sourceKey);
  const prefix = DEPT_PREFIX[department.sourceKey];
  if (!meta || !prefix) throw new Error(`Missing BDT metadata for ${department.sourceKey}`);

  return {
    id: meta.id, source_key: meta.id, label: meta.label, domain: meta.domain,
    cluster: meta.cluster, color: meta.color, score: meta.score, metrics: meta.metrics,
    internalNodes: department.capabilities.map((capability, level1Index) => {
      const level1Id = `${prefix}_l1_${level1Index}`;
      return {
        id: level1Id, label: capability.label, type: 'branch', score: meta.score,
        nodeLevel: 'level1', mappedUniversalCategory: capability.mappedUniversalCategory,
        metadata: { sourceKey: capability.sourceKey, meaning: capability.meaning, taxonomyVersion: BDT_TAXONOMY_VERSION },
        children: capability.branches.map((branch, branchIndex) => {
          const actionLabel = branch.actionExamples[0] ?? `Review ${branch.label}`;
          const metricImpact = branch.metricImpacts[0] ?? `${branch.label} health`;
          const metadata = branchMetadata(department, capability, branch);
          const branchId = `${level1Id}_b${branchIndex}`;
          const workflowSteps = ['Gather context', actionLabel, 'Document outcome', 'Update related metrics'];
          return {
            id: branchId, label: branch.label, type: 'branch', score: meta.score,
            nodeLevel: 'branch', branchKind: capability.mappedUniversalCategory, metadata,
            children: branch.presentation === 'erpnext_catalog' ? [] : [
              {
                id: `${branchId}_a0`, label: actionLabel, type: 'action', score: meta.score,
                nodeLevel: 'action', owner: 'Department Head', dueDate: 'Next 7 days',
                status: 'Open', output: `${actionLabel} completion evidence`, metricImpact,
                workflowSteps, metadata,
                actionDetails: {
                  verb: actionLabel.split(/\s+/)[0] || 'Execute',
                  description: `${actionLabel} for ${department.departmentLabel} / ${capability.label} / ${branch.label}`,
                  stateChange: `${branch.label} updated in ${department.departmentLabel}`,
                  checklist: workflowSteps,
                },
                children: [],
              },
              {
                id: `${branchId}_m0`, label: `${branch.label} health`, type: 'metric', score: meta.score,
                // Preserve the legacy action nodeLevel expected by existing import consumers.
                nodeLevel: 'action', owner: 'Metrics Owner', status: 'Open',
                output: `${branch.label} metric report`, metricImpact,
                metricKey: `spec_${department.sourceKey}_${branch.sourceKey}`,
                metadata,
                metricDetails: { name: metricImpact, value: 0, target: 100, unit: '%', trend: 'flat', status: 'warning' },
                children: [],
              },
            ],
          };
        }),
      };
    }),
  };
}

/** Default BDT tree for new companies, derived from the code-native taxonomy. */
export function buildBdtSeedDepartments(): BdtSeedDepartment[] {
  return BDT_TAXONOMY.map(buildSeedDepartment);
}

export const BDT_SEED_DEPARTMENTS = buildBdtSeedDepartments();
