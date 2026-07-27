import assert from 'node:assert/strict';
import test from 'node:test';
import { DEPT_LEVEL1_NODES } from '../src/data/bdtCatalog.js';
import { BDT_SEED_DEPARTMENTS } from '../src/data/bdtSeed.js';
import { BDT_TAXONOMY, BDT_TAXONOMY_VERSION } from '../src/data/bdtTaxonomy.js';
import { BDT_V1_NODE_DECISIONS } from '../src/data/bdtTaxonomyDecisionLog.js';

type SeedNode = {
  id: string;
  label: string;
  type: string;
  children: SeedNode[];
  metadata?: { sourceKey?: string; specSource?: unknown; taxonomyVersion?: string; availability?: string; conceptKey?: string; meaning?: string; presentation?: string };
  metricKey?: string;
};

const seedDepartments = BDT_SEED_DEPARTMENTS as Array<{ id: string; internalNodes: SeedNode[] }>;
const level1Nodes = seedDepartments.flatMap((department) => department.internalNodes);
const branches = level1Nodes.flatMap((node) => node.children);
const branchDepartmentSourceKeys = new Map(
  seedDepartments.flatMap((department) =>
    department.internalNodes.flatMap((level1) =>
      level1.children.map((branch) => [branch.id, department.id] as const),
    ),
  ),
);

function assertNoDocxProvenance(node: SeedNode): void {
  assert.equal('specSource' in (node.metadata ?? {}), false, `${node.id} contains DOCX provenance`);
  node.children.forEach(assertNoDocxProvenance);
}

test('code-native BDT taxonomy preserves the default tree contract', () => {
  assert.equal(BDT_TAXONOMY.length, 13);
  assert.equal(BDT_TAXONOMY_VERSION, 'v3');
  assert.equal(level1Nodes.length, 54);
  assert.equal(branches.length, 212);

  const stableSourceKeys = new Set<string>();
  const metricKeys = new Set<string>();
  const conceptKeys = new Set<string>();
  for (const [departmentIndex, department] of BDT_TAXONOMY.entries()) {
    const catalogEntries = DEPT_LEVEL1_NODES[department.sourceKey];
    const seedEntries = seedDepartments[departmentIndex]?.internalNodes;
    assert.ok(catalogEntries);
    assert.ok(seedEntries);
    assert.equal(catalogEntries.length, department.capabilities.length);
    assert.equal(seedEntries.length, department.capabilities.length);

    department.capabilities.forEach((capability, index) => {
      assert.equal(stableSourceKeys.has(capability.sourceKey), false, `duplicate Level-1 source key: ${capability.sourceKey}`);
      stableSourceKeys.add(capability.sourceKey);
      assert.deepEqual(catalogEntries[index], {
        sourceKey: capability.sourceKey,
        label: capability.label,
        mappedUniversalCategory: capability.mappedUniversalCategory,
      });
      assert.equal(seedEntries[index]?.metadata?.sourceKey, capability.sourceKey);
      assert.equal(seedEntries[index]?.label, capability.label);
      assert.ok(capability.meaning);
      assert.ok(capability.branches.length >= 3 && capability.branches.length <= 5);
      capability.branches.forEach((taxonomyBranch) => {
        assert.ok(taxonomyBranch.meaning);
        assert.ok(taxonomyBranch.conceptKey);
        assert.ok(taxonomyBranch.availability === 'active' || taxonomyBranch.availability === 'planned');
        assert.equal(conceptKeys.has(taxonomyBranch.conceptKey), false, `duplicate concept key: ${taxonomyBranch.conceptKey}`);
        conceptKeys.add(taxonomyBranch.conceptKey);
      });
    });
  }

  for (const branch of branches) {
    const sourceKey = branch.metadata?.sourceKey;
    assert.ok(sourceKey);
    assert.equal(stableSourceKeys.has(sourceKey), false, `duplicate stable source key: ${sourceKey}`);
    stableSourceKeys.add(sourceKey);
    const isLiveCatalog = branch.metadata?.presentation === 'erpnext_catalog';
    assert.equal(branch.children.length, isLiveCatalog ? 0 : 2, `${branch.id} must have the expected generated children`);
    if (isLiveCatalog) {
      assert.equal(branch.metadata?.sourceKey, 'prod_product_portfolio_product_lines');
      assert.equal(branch.metadata?.taxonomyVersion, 'v3');
      continue;
    }
    assert.deepEqual(branch.children.map((child) => child.type), ['action', 'metric']);
    assert.equal(branch.metadata?.taxonomyVersion, 'v3');
    assert.ok(branch.metadata?.meaning);
    assert.ok(branch.metadata?.conceptKey);
    assert.ok(branch.metadata?.availability === 'active' || branch.metadata?.availability === 'planned');

    const metric = branch.children[1];
    assert.ok(metric.metricKey);
    assert.equal(metric.metricKey, `spec_${branchDepartmentSourceKeys.get(branch.id)}_${sourceKey}`);
    assert.equal(metricKeys.has(metric.metricKey), false, `duplicate metric key: ${metric.metricKey}`);
    metricKeys.add(metric.metricKey);
  }

  assert.equal(stableSourceKeys.size, 266);
  assert.equal(metricKeys.size, 211);
  assert.equal(conceptKeys.size, 212);
  assert.equal(BDT_V1_NODE_DECISIONS.length, 504);
  assert.equal(new Set(BDT_V1_NODE_DECISIONS.map(entry => entry.sourceKey)).size, 504);
  assert.equal(BDT_V1_NODE_DECISIONS.filter(entry => entry.nodeLevel === 'level1').length, 76);
  assert.equal(BDT_V1_NODE_DECISIONS.filter(entry => entry.nodeLevel === 'branch').length, 428);
  BDT_V1_NODE_DECISIONS.forEach(entry => {
    assert.ok(entry.rationale);
    assert.ok(['retain', 'rename', 'merge', 'move', 'prune', 'planned'].includes(entry.disposition));
  });
  const plannedMarketing = BDT_TAXONOMY.find(d => d.sourceKey === 'dept_marketing')!
    .capabilities.filter(c => c.sourceKey !== 'mkt_paid_acquisition')
    .flatMap(c => c.branches);
  assert.ok(plannedMarketing.length > 0);
  plannedMarketing.forEach(branch => {
    assert.equal(branch.availability, 'planned');
    assert.notEqual(branch.label.toLowerCase(), 'not yet connected');
  });
  level1Nodes.forEach(assertNoDocxProvenance);
});
