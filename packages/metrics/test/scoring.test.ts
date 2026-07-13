import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreMetric, rollupHealth, strategicScore } from '../src/scoring.js';

test('scores higher-is-better progress from baseline to target', () => {
  assert.equal(scoreMetric(3, 2, 4, 'higher_is_better'), 50);
  assert.equal(scoreMetric(5, 2, 4, 'higher_is_better'), 100);
});

test('scores lower-is-better progress and rejects equal baseline/target', () => {
  assert.equal(scoreMetric(75, 100, 50, 'lower_is_better'), 50);
  assert.equal(scoreMetric(50, 50, 50, 'lower_is_better'), null);
});

test('target_band scores proximity to target', () => {
  assert.equal(scoreMetric(10, 0, 10, 'target_band'), 100);
  assert.equal(scoreMetric(0, 0, 10, 'target_band'), 0);
  assert.equal(scoreMetric(5, 0, 10, 'target_band'), 50);
});

test('null / non-finite raw values are not scorable', () => {
  assert.equal(scoreMetric(null, 0, 10, 'higher_is_better'), null);
  assert.equal(scoreMetric(Number.NaN, 0, 10, 'higher_is_better'), null);
});

test('scores clamp to 0..100', () => {
  assert.equal(scoreMetric(10, 2, 4, 'higher_is_better'), 100);
  assert.equal(scoreMetric(1, 2, 4, 'higher_is_better'), 0);
});

test('rollupHealth is a weight-preserving mean matching the SQL formula', () => {
  // ROUND(SUM(score*weight)/SUM(weight))
  assert.equal(rollupHealth([{ score: 80, weight: 1 }, { score: 40, weight: 1 }]), 60);
  assert.equal(rollupHealth([{ score: 90, weight: 3 }, { score: 50, weight: 1 }]), 80);
  assert.equal(rollupHealth([{ score: 100, weight: 2 }]), 100);
});

test('rollupHealth returns null when total weight is zero (SQL NULLIF)', () => {
  assert.equal(rollupHealth([]), null);
  assert.equal(rollupHealth([{ score: 90, weight: 0 }]), null);
});

test('strategicScore averages goal scores then rounds', () => {
  assert.equal(strategicScore([80, 60]), 70);
  assert.equal(strategicScore([90, 90, 91]), 90);
  assert.equal(strategicScore([]), null);
});
