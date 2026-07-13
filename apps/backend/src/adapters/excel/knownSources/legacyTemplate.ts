import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import { parseTemplate, type TemplateRecord } from '../template.js';

export const LEGACY_TEMPLATE_SIGNATURE = 'known_source:legacy_founderos_metrics_template:v1';

export interface LegacyTemplateExtraction {
  signature: string;
  name: string;
  records: TemplateRecord[];
  layout: Record<string, unknown>;
  recipe: Record<string, unknown>;
}

export function tryLegacyTemplate(workbook: XLSX.WorkBook): LegacyTemplateExtraction | null {
  if (!workbook.Sheets.Metrics) {
    return null;
  }

  const records = parseTemplate(workbook);
  const metricKeys = [...new Set(records.map((r) => r.metric_key))].sort();
  const signature = `${LEGACY_TEMPLATE_SIGNATURE}:${crypto
    .createHash('sha256')
    .update(metricKeys.join('|'))
    .digest('hex')
    .slice(0, 16)}`;

  return {
    signature,
    name: 'FounderOS metrics template',
    records,
    layout: {
      bbox: 'Metrics',
      layout_type: 'long_form',
      metric_axis: 'columns',
      period_axis: 'columns',
      header_rows: [1],
      data_range: 'Metrics',
      scale: 1,
      currency: records.find((r) => r.unit.toLowerCase() === 'usd') ? 'usd' : null,
      confidence: 1,
      warnings: [],
      known_source: 'legacy_template',
    },
    recipe: {
      source: 'legacy_template',
      layout_type: 'long_form',
      column_roles: {
        metric_key: { role: 'metric' },
        period_start: { role: 'period_start' },
        period_end: { role: 'period_end' },
        value: { role: 'value_field' },
        unit: { role: 'unit_label' },
      },
      metric_keys: metricKeys,
    },
  };
}
