import assert from 'node:assert/strict';
import test from 'node:test';
import { selectMetaConversion } from '../src/adapters/metaAds.js';
import { META_PAID_ACQUISITION_FOCUS_SOURCE_KEY } from '../src/lib/metaMetricEngine.js';
import { OPERATIONS_METRIC_KEYS, operationsMetricDefinition } from '../src/lib/operationsMetricEngine.js';
import { BDT_TAXONOMY } from '../src/data/bdtTaxonomy.js';

// scoreMetric coverage lives in packages/metrics/test/scoring.test.ts (its home
// after extraction). This file now only covers Meta-adapter conversion logic.

test('conversion count and CPA use the same selected Meta action', () => {
  const actions = [
    { actionType: 'lead', value: 4 },
    { actionType: 'purchase', value: 2 },
  ];
  assert.deepEqual(selectMetaConversion(100, actions, 'lead'), { conversions: 4, cpa: 25 });
  assert.deepEqual(selectMetaConversion(100, actions, 'purchase'), { conversions: 2, cpa: 50 });
});

test('zero or absent selected conversions produce undefined CPA', () => {
  assert.deepEqual(selectMetaConversion(100, [{ actionType: 'lead', value: 0 }], 'lead'), { conversions: 0, cpa: null });
  assert.deepEqual(selectMetaConversion(100, [], null), { conversions: 0, cpa: null });
});

test('Meta canonical metrics target the V4 Paid Acquisition focus, not a legacy child', () => {
  const marketing = BDT_TAXONOMY.find(department => department.sourceKey === 'dept_marketing');
  const paidAcquisition = marketing?.nodes.find(node => node.sourceKey === META_PAID_ACQUISITION_FOCUS_SOURCE_KEY);
  assert.ok(paidAcquisition);
  assert.equal(paidAcquisition.nodeType, 'branch');
  assert.equal(paidAcquisition.workspaceKind, 'focus');
  assert.equal(paidAcquisition.providerCapabilities.includes('meta_ads'), true);
  assert.equal(marketing?.nodes.some(node => node.sourceKey.includes('ad_performance')), false);
});

test('Operations canonical metrics are the six direct V4 department measures', () => {
  assert.deepEqual(OPERATIONS_METRIC_KEYS, [
    'open_material_requests',
    'open_purchase_orders',
    'low_stock_positions',
    'open_work_orders',
    'work_order_completion_percent',
    'failed_quality_checks',
  ]);
  assert.equal(operationsMetricDefinition('low_stock_positions').needsLowStockThreshold, true);
  assert.equal(operationsMetricDefinition('work_order_completion_percent').direction, 'higher_is_better');
  for (const key of OPERATIONS_METRIC_KEYS.filter(key => key !== 'work_order_completion_percent')) {
    assert.equal(operationsMetricDefinition(key).direction, 'lower_is_better');
  }
});
