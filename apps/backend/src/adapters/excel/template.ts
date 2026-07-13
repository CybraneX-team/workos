import * as XLSX from 'xlsx';
import type { Locator } from '../classify/types.js';

export interface TemplateRecord {
  metric_key: string;
  period_start: string;
  period_end: string;
  value: number;
  unit: string;
  source_sheet_name: string;
  source_row_number: number;
  source_cell_ref: string;
  source_locator: Locator;
}

const REQUIRED_HEADERS = ['metric_key', 'period_start', 'period_end', 'value'] as const;

function toIsoDate(raw: unknown, rowNum: number, col: string): string {
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }

  const v = String(raw ?? '').trim();
  const isIso = /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (isIso) {
    return v;
  }

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Row ${rowNum}: invalid ${col} "${v}" (expected YYYY-MM-DD)`);
  }
  return d.toISOString().slice(0, 10);
}

function normalizedHeader(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

function findHeaderRow(rows: unknown[][]): { rowIdx: number; headers: Map<string, number> } {
  for (let rowIdx = 0; rowIdx < Math.min(rows.length, 20); rowIdx += 1) {
    const headers = new Map<string, number>();
    rows[rowIdx]?.forEach((value, colIdx) => {
      const header = normalizedHeader(value);
      if (header) headers.set(header, colIdx);
    });
    if (REQUIRED_HEADERS.every((h) => headers.has(h))) {
      return { rowIdx, headers };
    }
  }
  throw new Error('Metrics sheet is missing required headers: metric_key, period_start, period_end, value');
}

function cellValue(row: unknown[] | undefined, headers: Map<string, number>, header: string): unknown {
  const idx = headers.get(header);
  return idx === undefined ? undefined : row?.[idx];
}

export function parseTemplate(workbook: XLSX.WorkBook): TemplateRecord[] {
  const sheetName = 'Metrics';
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('Missing required sheet "Metrics"');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
  if (rows.length === 0) {
    throw new Error('Metrics sheet is empty');
  }

  const { rowIdx: headerRowIdx, headers } = findHeaderRow(rows);
  const metricCol = headers.get('metric_key');
  const valueCol = headers.get('value');
  if (metricCol === undefined || valueCol === undefined) {
    throw new Error('Metrics sheet is missing metric_key or value header');
  }

  const seen = new Set<string>();
  const records: TemplateRecord[] = [];

  for (let idx = headerRowIdx + 1; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const rowNum = idx + 1;
    const metric = String(cellValue(row, headers, 'metric_key') ?? '').trim();
    if (!metric) {
      continue;
    }

    const period_start = toIsoDate(cellValue(row, headers, 'period_start'), rowNum, 'period_start');
    const period_end = toIsoDate(cellValue(row, headers, 'period_end'), rowNum, 'period_end');
    const rawValue = cellValue(row, headers, 'value');
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      throw new Error(`Row ${rowNum}: non-numeric value "${rawValue}"`);
    }

    const unit = String(cellValue(row, headers, 'unit') ?? '').trim() || 'count';
    const dedupeKey = `${metric}|${period_start}|${period_end}`;
    if (seen.has(dedupeKey)) {
      throw new Error(
        `Row ${rowNum}: duplicate metric_key+period combination (${metric}, ${period_start}..${period_end})`,
      );
    }
    seen.add(dedupeKey);

    const source_cell_ref = `${sheetName}!${XLSX.utils.encode_cell({ r: idx, c: valueCol })}`;
    records.push({
      metric_key: metric,
      period_start,
      period_end,
      value,
      unit,
      source_sheet_name: sheetName,
      source_row_number: rowNum,
      source_cell_ref,
      source_locator: {
        type: 'cell',
        sheet_name: sheetName,
        cell_ref: source_cell_ref,
        row_idx: idx,
        column_idx: valueCol,
      },
    });
  }

  if (records.length === 0) {
    throw new Error('Metrics sheet has no metric rows');
  }

  return records;
}
