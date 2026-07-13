import assert from 'node:assert/strict';
import test from 'node:test';
import { selectMetaConversion } from '../src/adapters/metaAds.js';

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
