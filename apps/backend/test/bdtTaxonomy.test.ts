import assert from 'node:assert/strict';
import test from 'node:test';
import { DEPT_LEVEL1_NODES } from '../src/data/bdtCatalog.js';
import { BDT_SEED_DEPARTMENTS } from '../src/data/bdtSeed.js';
import { BDT_TAXONOMY, BDT_TAXONOMY_VERSION } from '../src/data/bdtTaxonomy.js';

test('V4 BDT taxonomy seeds five shallow workspace nodes per canonical department', () => {
  assert.equal(BDT_TAXONOMY_VERSION, 'v4');
  assert.equal(BDT_TAXONOMY.length, 13);
  assert.equal(BDT_SEED_DEPARTMENTS.length, 13);

  const keys = new Set<string>();
  for (const [index, department] of BDT_TAXONOMY.entries()) {
    assert.equal(department.nodes.length, 5);
    assert.equal(DEPT_LEVEL1_NODES[department.sourceKey].length, 5);
    const seed = BDT_SEED_DEPARTMENTS[index];
    assert.equal((seed.internalNodes as any[]).length, 5);
    const kinds = department.nodes.map(node => node.workspaceKind);
    assert.deepEqual(kinds, ['team', 'systems', 'metrics', 'projects', 'focus']);
    for (const node of department.nodes) {
      assert.equal(keys.has(node.sourceKey), false, `duplicate node key ${node.sourceKey}`);
      keys.add(node.sourceKey);
    }
    for (const node of seed.internalNodes as any[]) {
      assert.equal(node.nodeLevel, 'level1');
      assert.deepEqual(node.children, []);
      assert.equal(node.metadata.taxonomyVersion, 'v4');
      assert.equal(node.metadata.availability, 'active');
    }
  }

  const product = BDT_TAXONOMY.find(department => department.sourceKey === 'dept_product')!;
  assert.equal(product.nodes.find(node => node.workspaceKind === 'focus')?.presentation, 'erpnext_catalog');

  const expectedProviders: Record<string, string[]> = {
    dept_product: ['erpnext_products'],
    dept_sales: ['erpnext_sales'],
    dept_operations: ['erpnext_operations'],
    dept_marketing: ['meta_ads'],
  };
  for (const department of BDT_TAXONOMY) {
    const expected = expectedProviders[department.sourceKey] ?? [];
    assert.deepEqual(department.nodes.find(node => node.workspaceKind === 'systems')?.providerCapabilities, expected);
    assert.deepEqual(department.nodes.find(node => node.workspaceKind === 'focus')?.providerCapabilities, expected);
  }
});
