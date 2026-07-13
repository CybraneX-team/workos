import { BRANCH_KINDS, DEPT_LEVEL1_NODES } from '../src/data/bdtCatalog.ts';
import { BDT_SEED_DEPARTMENTS } from '../src/data/bdtSeed.ts';
import { BDT_SPEC_TREE } from '../src/data/bdtSpecTree.ts';

const OLD_LABELS = new Set([
  'Delivery & DevOps',
  'Hiring & Recruiting',
  'Capital & Treasury',
  'CS Performance',
]);

function fail(message: string): never {
  throw new Error(`[bdt-seed] ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

const seedBySourceKey = new Map(BDT_SEED_DEPARTMENTS.map((department) => [department.source_key ?? department.id, department]));

assert(BDT_SPEC_TREE.length === 13, `Expected 13 spec departments, found ${BDT_SPEC_TREE.length}`);
assert(BDT_SEED_DEPARTMENTS.length === 13, `Expected 13 seed departments, found ${BDT_SEED_DEPARTMENTS.length}`);

let specBranchCount = 0;
let seedBranchCount = 0;

for (const specDepartment of BDT_SPEC_TREE) {
  const seedDepartment = seedBySourceKey.get(specDepartment.sourceKey);
  assert(seedDepartment, `Missing seed department ${specDepartment.sourceKey}`);

  const level1Defs = DEPT_LEVEL1_NODES[specDepartment.sourceKey] ?? [];
  assert(level1Defs.length >= 1 && level1Defs.length <= 6, `${specDepartment.sourceKey} should have 1-6 catalog Level-1 nodes`);
  assert(specDepartment.rows.length === level1Defs.length, `${specDepartment.sourceKey} spec/catalog Level-1 count mismatch`);

  const level1Nodes = Array.isArray(seedDepartment.internalNodes) ? seedDepartment.internalNodes as any[] : [];
  assert(level1Nodes.length === level1Defs.length, `${specDepartment.sourceKey} seed/catalog Level-1 count mismatch`);

  for (let level1Index = 0; level1Index < specDepartment.rows.length; level1Index += 1) {
    const specRow = specDepartment.rows[level1Index];
    const catalogDef = level1Defs[level1Index];
    const seedNode = level1Nodes[level1Index];

    assert(catalogDef.label === specRow.level1Label, `${specDepartment.sourceKey} catalog/spec Level-1 mismatch at ${level1Index}`);
    assert(seedNode.label === specRow.level1Label, `${specDepartment.sourceKey} seed/spec Level-1 mismatch at ${level1Index}`);
    assert(seedNode.type === 'branch', `${seedNode.label} should be a branch node`);
    assert(seedNode.nodeLevel === 'level1', `${seedNode.label} should be nodeLevel=level1`);
    assert(seedNode.mappedUniversalCategory === catalogDef.mappedUniversalCategory, `${seedNode.label} mapped category mismatch`);
    assert(!OLD_LABELS.has(seedNode.label), `Old Level-1 label still present: ${seedNode.label}`);

    const branchNodes = Array.isArray(seedNode.children) ? seedNode.children.filter((child: any) => child.type === 'branch') : [];
    assert(branchNodes.length === specRow.branchItems.length, `${seedNode.label} branch count mismatch`);
    specBranchCount += specRow.branchItems.length;
    seedBranchCount += branchNodes.length;

    for (let branchIndex = 0; branchIndex < specRow.branchItems.length; branchIndex += 1) {
      const branch = branchNodes[branchIndex];
      const expectedLabel = specRow.branchItems[branchIndex];
      assert(branch.label === expectedLabel, `${seedNode.label} branch ${branchIndex} mismatch`);
      assert(branch.nodeLevel === 'branch', `${branch.label} should be nodeLevel=branch`);
      assert(BRANCH_KINDS.has(branch.branchKind), `${branch.label} has invalid branchKind=${branch.branchKind}`);
      assert(branch.branchKind === catalogDef.mappedUniversalCategory, `${branch.label} branchKind should inherit parent category`);
      assert(branch.metadata?.branchItem === expectedLabel, `${branch.label} missing spec metadata`);
      assert(typeof branch.metadata?.sourceKey === 'string' && branch.metadata.sourceKey.length > 0, `${branch.label} missing stable metadata.sourceKey`);

      const children = Array.isArray(branch.children) ? branch.children : [];
      const action = children.find((child: any) => child.type === 'action');
      const metric = children.find((child: any) => child.type === 'metric');
      assert(action, `${branch.label} missing action child`);
      assert(metric, `${branch.label} missing metric child`);
      assert(action.nodeLevel === 'action', `${branch.label} action child should be nodeLevel=action`);
      assert(metric.nodeLevel === 'action', `${branch.label} metric child should be nodeLevel=action`);
      assert(action.owner && action.dueDate && action.output && action.metricImpact && action.actionDetails?.stateChange, `${branch.label} action child incomplete`);
      assert(metric.metricKey && metric.metricDetails?.name, `${branch.label} metric child incomplete`);
    }
  }
}

assert(specBranchCount === 428, `Expected 428 spec branch items, found ${specBranchCount}`);
assert(seedBranchCount === 428, `Expected 428 seed branch nodes, found ${seedBranchCount}`);

console.log(`BDT seed validation passed: ${BDT_SEED_DEPARTMENTS.length} departments, ${seedBranchCount} branch nodes.`);
