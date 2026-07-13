import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreMetric } from '../src/lib/canonicalMetrics.js';
import { selectMetaConversion } from '../src/adapters/metaAds.js';

test('scores higher-is-better progress from baseline to target', () => {
  assert.equal(scoreMetric(3, 2, 4, 'higher_is_better'), 50);
  assert.equal(scoreMetric(5, 2, 4, 'higher_is_better'), 100);
});

test('scores lower-is-better progress and rejects equal baseline/target', () => {
  assert.equal(scoreMetric(75, 100, 50, 'lower_is_better'), 50);
  assert.equal(scoreMetric(50, 50, 50, 'lower_is_better'), null);
});

test('null raw values are not scorable', () => {
  assert.equal(scoreMetric(null, 0, 10, 'higher_is_better'), null);
});

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
