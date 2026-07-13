import * as XLSX from 'xlsx';
import type { ClassificationStage, Locator } from '../classify/types.js';
import { classifyWithDictionary } from '../classify/dictionary.js';
import type { DetectedRegion } from './regionLayout.js';
import type { RawCell } from './rawGrid.js';

export interface MetricObservation {
  metric_key: string | null;
  source_label: string;
  confidence: number;
  reasoning: string | null;
  stage: ClassificationStage;
  status: 'accepted' | 'pending_review';
  period_start: string | null;
  period_end: string | null;
  value: number | null;
  unit: string;
  currency: string | null;
  scale: number;
  source_sheet_name: string;
  source_cell_ref: string | null;
  decision_locator: Locator;
  value_locator: Locator | null;
}

function cellText(cell: RawCell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  if (cell.value instanceof Date) return isoDate(cell.value);
  return String(cell.value).trim();
}

function numericValue(cell: RawCell | undefined): number | null {
  if (!cell || cell.value === null || cell.value === undefined || cellText(cell) === '') return null;
  if (typeof cell.value === 'number') return Number.isFinite(cell.value) ? cell.value : null;
  const text = String(cell.value).replace(/[$,%\s]/g, '').replace(/,/g, '');
  if (text === '' || text === '-') return null;
  const value = Number(text.replace(/[()]/g, ''));
  if (!Number.isFinite(value)) return null;
  return /[(]/.test(text) && /[)]/.test(text) ? -value : value;
}

function cellAt(region: DetectedRegion, row: number, column: number): RawCell | undefined {
  return region.raw_grid[row - region.start_row]?.[column - region.start_column];
}

function cellRef(region: DetectedRegion, row: number, column: number): string {
  return `${region.sheet_name}!${XLSX.utils.encode_cell({ r: row, c: column })}`;
}

function columnIndex(columnName: string | undefined): number | null {
  if (!columnName) return null;
  try {
    return XLSX.utils.decode_col(columnName);
  } catch {
    return null;
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthRange(year: number, monthZeroBased: number) {
  const start = new Date(Date.UTC(year, monthZeroBased, 1));
  const end = new Date(Date.UTC(year, monthZeroBased + 1, 0));
  return { period_start: isoDate(start), period_end: isoDate(end) };
}

function parsePeriod(raw: string): { period_start: string; period_end: string } | null {
  const text = raw.trim();
  if (!text) return null;

  const iso = text.match(/\b(\d{4})[-/](0?[1-9]|1[0-2])(?:[-/](0?[1-9]|[12]\d|3[01]))?\b/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]) - 1;
    if (iso[3]) {
      const d = new Date(Date.UTC(year, month, Number(iso[3])));
      return { period_start: isoDate(d), period_end: isoDate(d) };
    }
    return monthRange(year, month);
  }

  const monthNumbers: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    sept: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const monthMatch = text.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s'-]*(\d{2,4})\b/);
  if (monthMatch) {
    const month = monthNumbers[monthMatch[1]];
    const rawYear = Number(monthMatch[2]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return monthRange(year, month);
  }

  const quarter = text.toLowerCase().match(/\bq([1-4])[\s'-]*(?:fy)?(\d{2,4})\b/);
  if (quarter) {
    const q = Number(quarter[1]);
    const rawYear = Number(quarter[2]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const startMonth = (q - 1) * 3;
    return {
      period_start: isoDate(new Date(Date.UTC(year, startMonth, 1))),
      period_end: isoDate(new Date(Date.UTC(year, startMonth + 3, 0))),
    };
  }

  return null;
}

function headerTextForColumn(region: DetectedRegion, column: number): string {
  return region.layout.header_rows
    .map((rowOneBased) => cellText(cellAt(region, rowOneBased - 1, column)))
    .filter(Boolean)
    .join(' ');
}

function headers(region: DetectedRegion): Map<string, number> {
  const headerRow = (region.layout.header_rows.at(-1) ?? region.start_row + 1) - 1;
  const result = new Map<string, number>();
  for (let col = region.start_column; col <= region.end_column; col += 1) {
    const text = cellText(cellAt(region, headerRow, col)).toLowerCase().replace(/[^a-z0-9_ ]+/g, '').trim();
    if (text) result.set(text, col);
  }
  return result;
}

function findHeader(headersMap: Map<string, number>, names: string[]): number | null {
  for (const name of names) {
    const hit = headersMap.get(name);
    if (hit !== undefined) return hit;
  }
  return null;
}

export function extractDictionaryObservations(region: DetectedRegion): MetricObservation[] {
  if (region.layout.layout_type === 'matrix') return extractMatrix(region);
  if (region.layout.layout_type === 'long_form' || region.layout.layout_type === 'wide') {
    return extractLongForm(region);
  }
  return [];
}

function extractMatrix(region: DetectedRegion): MetricObservation[] {
  const labelColumn = columnIndex(region.layout.label_column) ?? region.start_column;
  const excludedRows = new Set(region.layout.excluded_rows.map((row) => row - 1));
  const headerRow = (region.layout.header_rows.at(-1) ?? region.start_row + 1) - 1;
  const observations: MetricObservation[] = [];

  const periods = new Map<number, { period_start: string; period_end: string }>();
  for (let col = region.start_column; col <= region.end_column; col += 1) {
    if (col === labelColumn) continue;
    const period = parsePeriod(headerTextForColumn(region, col));
    if (period) periods.set(col, period);
  }

  for (let row = Math.max(region.start_row, headerRow + 1); row <= region.end_row; row += 1) {
    if (excludedRows.has(row)) continue;
    const sourceLabel = cellText(cellAt(region, row, labelColumn));
    if (!sourceLabel) continue;

    const classification = classifyWithDictionary(sourceLabel);
    const status = classification.confidence >= 0.85 && classification.target_key ? 'accepted' : 'pending_review';
    const decision_locator: Locator = {
      type: 'row',
      sheet_name: region.sheet_name,
      row_idx: row,
    };

    if (periods.size === 0) {
      observations.push({
        metric_key: classification.target_key,
        source_label: sourceLabel,
        confidence: classification.confidence,
        reasoning: classification.reasoning ?? null,
        stage: classification.reasoning?.startsWith('Fuzzy matched') ? 'fuzzy' : 'dictionary',
        status,
        period_start: null,
        period_end: null,
        value: null,
        unit: region.layout.currency ?? 'count',
        currency: region.layout.currency,
        scale: region.layout.scale,
        source_sheet_name: region.sheet_name,
        source_cell_ref: null,
        decision_locator,
        value_locator: null,
      });
      continue;
    }

    for (const [col, period] of periods) {
      const rawValue = numericValue(cellAt(region, row, col));
      if (rawValue === null) continue;
      const sourceCellRef = cellRef(region, row, col);
      observations.push({
        metric_key: classification.target_key,
        source_label: sourceLabel,
        confidence: classification.confidence,
        reasoning: classification.reasoning ?? null,
        stage: classification.reasoning?.startsWith('Fuzzy matched') ? 'fuzzy' : 'dictionary',
        status,
        period_start: period.period_start,
        period_end: period.period_end,
        value: rawValue * region.layout.scale,
        unit: region.layout.currency ?? 'count',
        currency: region.layout.currency,
        scale: region.layout.scale,
        source_sheet_name: region.sheet_name,
        source_cell_ref: sourceCellRef,
        decision_locator,
        value_locator: {
          type: 'cell',
          sheet_name: region.sheet_name,
          cell_ref: sourceCellRef,
          row_idx: row,
          column_idx: col,
        },
      });
    }
  }

  return observations;
}

export function countPromotableObservationsForLocator(region: DetectedRegion, locator: Locator): number {
  return extractDictionaryObservations(region).filter((observation) => (
    sameLocator(observation.decision_locator, locator) &&
    observation.value !== null &&
    observation.period_start !== null &&
    observation.period_end !== null
  )).length;
}

function sameLocator(left: Locator, right: Locator): boolean {
  if (left.type !== right.type) return false;
  if (left.sheet_name !== right.sheet_name) return false;
  switch (left.type) {
    case 'row':
      return left.row_idx === (right as Extract<Locator, { type: 'row' }>).row_idx;
    case 'column':
      return left.column_idx === (right as Extract<Locator, { type: 'column' }>).column_idx;
    case 'cell':
      return left.cell_ref === (right as Extract<Locator, { type: 'cell' }>).cell_ref;
    default:
      return JSON.stringify(left) === JSON.stringify(right);
  }
}

function extractLongForm(region: DetectedRegion): MetricObservation[] {
  const headersMap = headers(region);
  const metricCol = findHeader(headersMap, ['metric_key', 'metric', 'account', 'kpi', 'label']);
  const valueCol = findHeader(headersMap, ['value', 'amount', 'actual', 'total']);
  const periodStartCol = findHeader(headersMap, ['period_start', 'period start', 'start']);
  const periodEndCol = findHeader(headersMap, ['period_end', 'period end', 'end']);
  const periodCol = findHeader(headersMap, ['period', 'month', 'date']);
  const unitCol = findHeader(headersMap, ['unit', 'currency']);
  const headerRow = (region.layout.header_rows.at(-1) ?? region.start_row + 1) - 1;

  if (metricCol === null || valueCol === null) return [];

  const observations: MetricObservation[] = [];
  for (let row = headerRow + 1; row <= region.end_row; row += 1) {
    const sourceLabel = cellText(cellAt(region, row, metricCol));
    if (!sourceLabel) continue;

    const classification = classifyWithDictionary(sourceLabel);
    const status = classification.confidence >= 0.85 && classification.target_key ? 'accepted' : 'pending_review';
    const directRange = periodStartCol !== null && periodEndCol !== null
      ? {
          period_start: parsePeriod(cellText(cellAt(region, row, periodStartCol)))?.period_start ?? null,
          period_end: parsePeriod(cellText(cellAt(region, row, periodEndCol)))?.period_end ?? null,
        }
      : null;
    const inferredRange = periodCol !== null ? parsePeriod(cellText(cellAt(region, row, periodCol))) : null;
    const period_start = directRange?.period_start ?? inferredRange?.period_start ?? null;
    const period_end = directRange?.period_end ?? inferredRange?.period_end ?? null;
    const rawValue = numericValue(cellAt(region, row, valueCol));
    const sourceCellRef = cellRef(region, row, valueCol);

    observations.push({
      metric_key: classification.target_key,
      source_label: sourceLabel,
      confidence: classification.confidence,
      reasoning: classification.reasoning ?? null,
      stage: classification.reasoning?.startsWith('Fuzzy matched') ? 'fuzzy' : 'dictionary',
      status,
      period_start,
      period_end,
      value: rawValue === null ? null : rawValue * region.layout.scale,
      unit: unitCol !== null ? cellText(cellAt(region, row, unitCol)) || region.layout.currency || 'count' : region.layout.currency ?? 'count',
      currency: region.layout.currency,
      scale: region.layout.scale,
      source_sheet_name: region.sheet_name,
      source_cell_ref: rawValue === null ? null : sourceCellRef,
      decision_locator: {
        type: 'row',
        sheet_name: region.sheet_name,
        row_idx: row,
      },
      value_locator: rawValue === null
        ? null
        : {
            type: 'cell',
            sheet_name: region.sheet_name,
            cell_ref: sourceCellRef,
            row_idx: row,
            column_idx: valueCol,
          },
    });
  }
  return observations;
}
