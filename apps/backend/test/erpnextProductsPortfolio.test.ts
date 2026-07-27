import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCatalogPortfolio } from '../src/domains/workos-erp/erpnextProducts.js';

test('ERPNext catalog mapper uses top-level Item Groups, flattens nested groups, and retains exceptions', () => {
  const portfolio = buildCatalogPortfolio(
    [
      { name: 'All Item Groups', item_group_name: 'All Item Groups' },
      { name: 'Platform', item_group_name: 'Platform', parent_item_group: 'All Item Groups' },
      { name: 'Platform Add-ons', item_group_name: 'Platform Add-ons', parent_item_group: 'Platform' },
    ],
    [
      { name: 'CORE', item_code: 'CORE', item_name: 'Core', item_group: 'Platform', disabled: 0 },
      { name: 'ADDON', item_code: 'ADDON', item_name: 'Add-on', item_group: 'Platform Add-ons', disabled: 1 },
      { name: 'ORPHAN', item_code: 'ORPHAN', item_name: 'Orphan', item_group: 'Missing Group', disabled: 0 },
      { name: 'ROOT', item_code: 'ROOT', item_name: 'Root item', item_group: 'All Item Groups', disabled: 0 },
    ],
    [{ name: 'PRICE-CORE', item_code: 'CORE', price_list_rate: 10 }],
  );
  assert.equal(portfolio.status, 'ready');
  const platform = portfolio.lines.find(line => line.identity === 'Platform')!;
  assert.deepEqual(platform.products.map(product => product.identity), ['ADDON', 'CORE']);
  assert.equal(platform.products.find(product => product.identity === 'ADDON')?.disabled, true);
  assert.equal(platform.products.find(product => product.identity === 'CORE')?.priced, true);
  const unclassified = portfolio.lines.find(line => line.unclassified)!;
  assert.deepEqual(unclassified.products.map(product => product.identity), ['ORPHAN', 'ROOT']);
});
