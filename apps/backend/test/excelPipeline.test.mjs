import assert from 'node:assert/strict';
import * as XLSX from '../node_modules/xlsx/xlsx.mjs';
import { extractRawSheets } from '../dist/adapters/excel/rawGrid.js';
import { detectRegionsAndLayouts } from '../dist/adapters/excel/regionLayout.js';
import { extractDictionaryObservations } from '../dist/adapters/excel/metricExtraction.js';

function regionsFor(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const parsed = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellStyles: true });
  return extractRawSheets(parsed).flatMap(detectRegionsAndLayouts);
}

{
  const regions = regionsFor({
    'Messy PL': [
      ['', '', '', ''],
      ['P&L ($000s)', '', '', ''],
      ['', '', '', ''],
      ['Account', 'Jan 2025', 'Oct 2025', 'Dec 2025'],
      ['Revenue', 100, 120, 130],
      ['COGS', 30, 35, 37],
      ['Operating Expenses', 50, 55, 60],
      ['Total expenses', 80, 90, 97],
      ['Magic Score', 7, 8, 9],
      ['123 KPI', 1, 2, 3],
    ],
  });

  assert.equal(regions.length, 1);
  assert.equal(regions[0].layout.layout_type, 'matrix');
  assert.equal(regions[0].layout.metric_axis, 'rows');
  assert.equal(regions[0].layout.period_axis, 'columns');
  assert.equal(regions[0].layout.scale, 1000);
  assert.equal(regions[0].layout.currency, 'usd');
  assert.deepEqual(regions[0].layout.excluded_rows, [8]);

  const observations = extractDictionaryObservations(regions[0]);
  const revenue = observations.find((o) => o.metric_key === 'revenue' && o.period_start === '2025-01-01');
  assert.equal(revenue?.value, 100000);
  assert.equal(revenue?.source_cell_ref, 'Messy PL!B5');
  assert.equal(revenue?.status, 'accepted');
  assert.ok(observations.find((o) => o.metric_key === 'revenue' && o.period_start === '2025-10-01' && o.period_end === '2025-10-31'));
  assert.ok(observations.find((o) => o.metric_key === 'revenue' && o.period_start === '2025-12-01' && o.period_end === '2025-12-31'));

  const custom = observations.find((o) => o.source_label === 'Magic Score');
  assert.equal(custom?.metric_key, 'magic_score');
  assert.equal(custom?.status, 'pending_review');

  const unclassified = observations.filter((o) => o.source_label === '123 KPI');
  assert.equal(unclassified.length, 3);
  assert.equal(unclassified[0].metric_key, null);
  assert.equal(unclassified[0].status, 'pending_review');
  assert.equal(unclassified[2].value, 3000);
}

{
  const regions = regionsFor({
    KPIs: [
      ['Metric', 'Period', 'Value', 'Unit'],
      ['Revnue', 'Jan 2025', 100, 'usd'],
      ['Cash', '2025-01-31', 500, 'usd'],
      ['Activation Score', 'Jan 2025', 72, 'percent'],
      ['Headcount', new Date(Date.UTC(2025, 9, 15)), 14, 'count'],
    ],
  });

  assert.equal(regions[0].layout.layout_type, 'long_form');
  const observations = extractDictionaryObservations(regions[0]);
  assert.equal(observations[0].metric_key, 'revenue');
  assert.equal(observations[0].status, 'accepted');
  assert.equal(observations[1].period_start, '2025-01-31');
  assert.equal(observations[1].period_end, '2025-01-31');
  assert.equal(observations[2].status, 'pending_review');
  assert.equal(observations[3].period_start, '2025-10-15');
  assert.equal(observations[3].period_end, '2025-10-15');
}

console.log('excel pipeline tests passed');
