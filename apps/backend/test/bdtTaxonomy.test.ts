import assert from 'node:assert/strict';
import test from 'node:test';
import { DEPT_LEVEL1_NODES } from '../src/data/bdtCatalog.js';
import { BDT_SEED_DEPARTMENTS } from '../src/data/bdtSeed.js';
import { BDT_TAXONOMY, BDT_TAXONOMY_VERSION } from '../src/data/bdtTaxonomy.js';

test('V5 BDT taxonomy seeds fixed commercial capability nodes for Product and Sales', () => {
  assert.equal(BDT_TAXONOMY_VERSION, 'v5');
  assert.equal(BDT_TAXONOMY.length, 13);
  assert.equal(BDT_SEED_DEPARTMENTS.length, 13);

  const keys = new Set<string>();
  for (const [index, department] of BDT_TAXONOMY.entries()) {
    const expectedCount = department.sourceKey === 'dept_product' ? 3 : department.sourceKey === 'dept_sales' ? 6 : 5;
    assert.equal(department.nodes.length, expectedCount);
    assert.equal(DEPT_LEVEL1_NODES[department.sourceKey].length, expectedCount);
    const seed = BDT_SEED_DEPARTMENTS[index];
    assert.equal((seed.internalNodes as any[]).length, expectedCount);
    if (!['dept_product', 'dept_sales'].includes(department.sourceKey)) {
      assert.deepEqual(department.nodes.map(node => node.workspaceKind), ['team', 'systems', 'metrics', 'projects', 'focus']);
    }
    for (const node of department.nodes) {
      assert.equal(keys.has(node.sourceKey), false, `duplicate node key ${node.sourceKey}`);
      keys.add(node.sourceKey);
    }
    for (const node of seed.internalNodes as any[]) {
      assert.equal(node.nodeLevel, 'level1');
      assert.deepEqual(node.children, []);
      assert.equal(node.metadata.taxonomyVersion, 'v5');
      assert.equal(node.metadata.availability, 'active');
    }
  }

  const product = BDT_TAXONOMY.find(department => department.sourceKey === 'dept_product')!;
  assert.deepEqual(product.nodes.map(node => [node.sourceKey, node.nodeType]), [
    ['prod_product_catalogue', 'resource'], ['prod_pricing_management', 'decision'], ['prod_inventory_readiness', 'signal'],
  ]);
  const sales = BDT_TAXONOMY.find(department => department.sourceKey === 'dept_sales')!;
  assert.deepEqual(sales.nodes.map(node => node.sourceKey), ['sales_customers_contacts','sales_lead_management','sales_deal_management','sales_quotations','sales_orders_invoices','sales_collections']);

  const expectedProviders: Record<string, string[]> = {
    dept_marketing: ['meta_ads'],
  };
  for (const department of BDT_TAXONOMY) {
    const expected = expectedProviders[department.sourceKey] ?? [];
    if (!['dept_product', 'dept_sales'].includes(department.sourceKey)) {
      assert.deepEqual(department.nodes.find(node => node.workspaceKind === 'systems')?.providerCapabilities, expected);
      assert.deepEqual(department.nodes.find(node => node.workspaceKind === 'focus')?.providerCapabilities, expected);
    }
  }
});
