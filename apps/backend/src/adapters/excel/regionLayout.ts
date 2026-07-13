import * as XLSX from 'xlsx';
import type { RawCell, RawSheetGrid } from './rawGrid.js';

export type LayoutType = 'matrix' | 'long_form' | 'wide' | 'pivot' | 'freeform';
export type LayoutAxis = 'rows' | 'columns' | null;

export interface RegionLayout {
  bbox: string;
  layout_type: LayoutType;
  metric_axis: LayoutAxis;
  period_axis: LayoutAxis;
  header_rows: number[];
  data_range: string | null;
  label_column?: string;
  scale: 1 | 1000 | 1000000;
  currency: string | null;
  merged_header_strategy: 'concat' | 'propagate' | 'ignore';
  excluded_rows: number[];
  excluded_columns: string[];
  confidence: number;
  warnings: string[];
}

export interface DetectedRegion {
  region_idx: number;
  sheet_idx: number;
  sheet_name: string;
  start_row: number;
  end_row: number;
  start_column: number;
  end_column: number;
  bbox: string;
  layout: RegionLayout;
  raw_grid: RawCell[][];
}

interface RegionBounds {
  start_row: number;
  end_row: number;
  start_column: number;
  end_column: number;
}

const MONTH_RE =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s'-]*\d{2,4}\b/i;
const QUARTER_RE = /\bq[1-4][\s'-]*(fy)?\d{2,4}\b|\bfy\d{2,4}\b/i;
const ISO_PERIOD_RE = /\b\d{4}[-/](0?[1-9]|1[0-2])(?:[-/](0?[1-9]|[12]\d|3[01]))?\b/;
const TOTAL_RE = /\b(total|subtotal|sum|grand total|net total)\b/i;

function clampConfidence(value: number): number {
  return Math.max(0.05, Math.min(0.99, Math.round(value * 100) / 100));
}

function cellText(cell: RawCell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  return String(cell.value).trim();
}

function isBlank(cell: RawCell | undefined): boolean {
  return cellText(cell) === '';
}

function isNumericLike(cell: RawCell | undefined): boolean {
  if (!cell || isBlank(cell)) return false;
  if (cell.type === 'number') return Number.isFinite(Number(cell.value));
  if (cell.type === 'formula') return Number.isFinite(Number(cell.value));
  const text = cellText(cell).replace(/[$,()%\s]/g, '');
  if (text === '' || text === '-') return false;
  return Number.isFinite(Number(text));
}

function isTextLike(cell: RawCell | undefined): boolean {
  if (!cell || isBlank(cell)) return false;
  return !isNumericLike(cell) && !isDateLike(cell);
}

function isDateLike(cell: RawCell | undefined): boolean {
  if (!cell || isBlank(cell)) return false;
  if (cell.type === 'date') return true;
  const text = cellText(cell);
  if (MONTH_RE.test(text) || QUARTER_RE.test(text) || ISO_PERIOD_RE.test(text)) return true;
  const format = cell.number_format ?? '';
  return /[ymdq]/i.test(format) && isNumericLike(cell);
}

function columnName(index: number): string {
  return XLSX.utils.encode_col(index);
}

function encodeCell(row: number, column: number): string {
  return XLSX.utils.encode_cell({ r: row, c: column });
}

function encodeRange(bounds: RegionBounds): string {
  return XLSX.utils.encode_range({
    s: { r: bounds.start_row, c: bounds.start_column },
    e: { r: bounds.end_row, c: bounds.end_column },
  });
}

function rowCells(sheet: RawSheetGrid, absoluteRow: number, bounds: Pick<RegionBounds, 'start_column' | 'end_column'>): RawCell[] {
  const relativeRow = absoluteRow - sheet.start_row;
  const row = sheet.raw_grid[relativeRow] ?? [];
  const cells: RawCell[] = [];
  for (let col = bounds.start_column; col <= bounds.end_column; col += 1) {
    cells.push(row[col - sheet.start_column] ?? { value: null, type: 'blank' });
  }
  return cells;
}

function cellAt(sheet: RawSheetGrid, row: number, column: number): RawCell | undefined {
  return sheet.raw_grid[row - sheet.start_row]?.[column - sheet.start_column];
}

function nonBlankColumnsInRow(sheet: RawSheetGrid, absoluteRow: number): number[] {
  const relativeRow = absoluteRow - sheet.start_row;
  const row = sheet.raw_grid[relativeRow] ?? [];
  const columns: number[] = [];
  row.forEach((cell, idx) => {
    if (!isBlank(cell)) columns.push(sheet.start_column + idx);
  });
  return columns;
}

function rowHasData(sheet: RawSheetGrid, absoluteRow: number): boolean {
  return nonBlankColumnsInRow(sheet, absoluteRow).length > 0;
}

function contiguousRuns(values: number[]): Array<[number, number]> {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const value of sorted.slice(1)) {
    if (value === prev + 1) {
      prev = value;
      continue;
    }
    runs.push([start, prev]);
    start = value;
    prev = value;
  }
  runs.push([start, prev]);
  return runs;
}

function candidateBounds(sheet: RawSheetGrid): RegionBounds[] {
  if (sheet.raw_grid.length === 0) return [];

  const usedRows: number[] = [];
  for (let row = sheet.start_row; row < sheet.max_row; row += 1) {
    if (rowHasData(sheet, row)) usedRows.push(row);
  }

  const rowRuns = contiguousRuns(usedRows);
  const regions: RegionBounds[] = [];

  for (const [startRow, endRow] of rowRuns) {
    const columns = new Set<number>();
    for (let row = startRow; row <= endRow; row += 1) {
      for (const col of nonBlankColumnsInRow(sheet, row)) columns.add(col);
    }
    const colRuns = contiguousRuns([...columns]);
    for (const [startColumn, endColumn] of colRuns) {
      const height = endRow - startRow + 1;
      const width = endColumn - startColumn + 1;
      if (height < 2 || width < 2) continue;

      let nonBlank = 0;
      for (let row = startRow; row <= endRow; row += 1) {
        for (let col = startColumn; col <= endColumn; col += 1) {
          if (!isBlank(cellAt(sheet, row, col))) nonBlank += 1;
        }
      }
      if (nonBlank < 4) continue;
      regions.push({ start_row: startRow, end_row: endRow, start_column: startColumn, end_column: endColumn });
    }
  }

  return regions;
}

function rowStats(sheet: RawSheetGrid, row: number, bounds: RegionBounds) {
  const cells = rowCells(sheet, row, bounds);
  return {
    text: cells.filter(isTextLike).length,
    numeric: cells.filter(isNumericLike).length,
    dates: cells.filter(isDateLike).length,
    nonBlank: cells.filter((cell) => !isBlank(cell)).length,
  };
}

function columnStats(sheet: RawSheetGrid, column: number, bounds: RegionBounds) {
  const cells: RawCell[] = [];
  for (let row = bounds.start_row; row <= bounds.end_row; row += 1) {
    cells.push(cellAt(sheet, row, column) ?? { value: null, type: 'blank' });
  }
  return {
    text: cells.filter(isTextLike).length,
    numeric: cells.filter(isNumericLike).length,
    dates: cells.filter(isDateLike).length,
    nonBlank: cells.filter((cell) => !isBlank(cell)).length,
  };
}

function detectHeaderRows(
  sheet: RawSheetGrid,
  bounds: RegionBounds,
  preferredPeriodRow?: { row: number; count: number },
): number[] {
  const preferredStats = preferredPeriodRow
    ? rowStats(sheet, preferredPeriodRow.row, bounds)
    : null;
  if (
    preferredPeriodRow &&
    preferredStats &&
    preferredPeriodRow.count >= 2 &&
    preferredStats.numeric === 0
  ) {
    const previous = preferredPeriodRow.row > bounds.start_row
      ? rowStats(sheet, preferredPeriodRow.row - 1, bounds)
      : null;
    if (previous && previous.nonBlank > 0 && previous.numeric === 0 && previous.text > 0) {
      return [preferredPeriodRow.row, preferredPeriodRow.row + 1];
    }
    return [preferredPeriodRow.row + 1];
  }

  const limit = Math.min(bounds.end_row, bounds.start_row + 5);
  for (let row = bounds.start_row; row <= limit; row += 1) {
    const current = rowStats(sheet, row, bounds);
    const next = row < bounds.end_row ? rowStats(sheet, row + 1, bounds) : null;
    if (
      current.nonBlank > 0 &&
      (current.text + current.dates >= Math.max(1, current.numeric)) &&
      (!next || next.numeric > 0 || next.text > 0)
    ) {
      const previous = row > bounds.start_row ? rowStats(sheet, row - 1, bounds) : null;
      if (previous && previous.nonBlank > 0 && previous.text > 0 && previous.numeric === 0) {
        return [row, row - 1].sort((a, b) => a - b).map((r) => r + 1);
      }
      return [row + 1];
    }
  }
  return [bounds.start_row + 1];
}

function bestPeriodRow(sheet: RawSheetGrid, bounds: RegionBounds): { row: number; count: number } {
  let best = { row: bounds.start_row, count: 0 };
  for (let row = bounds.start_row; row <= Math.min(bounds.end_row, bounds.start_row + 6); row += 1) {
    const stats = rowStats(sheet, row, bounds);
    if (stats.dates > best.count) best = { row, count: stats.dates };
  }
  return best;
}

function bestPeriodColumn(sheet: RawSheetGrid, bounds: RegionBounds): { column: number; count: number } {
  let best = { column: bounds.start_column, count: 0 };
  for (let col = bounds.start_column; col <= bounds.end_column; col += 1) {
    const stats = columnStats(sheet, col, bounds);
    if (stats.dates > best.count) best = { column: col, count: stats.dates };
  }
  return best;
}

function findLabelColumn(sheet: RawSheetGrid, bounds: RegionBounds, firstDataRow: number): number | null {
  let best: { column: number; score: number } | null = null;
  for (let col = bounds.start_column; col <= bounds.end_column; col += 1) {
    let score = 0;
    for (let row = firstDataRow; row <= bounds.end_row; row += 1) {
      if (isTextLike(cellAt(sheet, row, col))) score += 1;
    }
    if (!best || score > best.score) best = { column: col, score };
  }
  return best && best.score > 0 ? best.column : null;
}

function detectScale(sheet: RawSheetGrid, bounds: RegionBounds): RegionLayout['scale'] {
  const text = regionText(sheet, bounds).toLowerCase();
  if (/\b(\$?mm|millions?|in millions)\b/.test(text)) return 1000000;
  if (/(\$000s|\b000s\b|thousands?|in thousands|\bk\b)/.test(text)) return 1000;
  return 1;
}

function detectCurrency(sheet: RawSheetGrid, bounds: RegionBounds): string | null {
  const text = regionText(sheet, bounds);
  if (/\bUSD\b|US\$|\$/.test(text)) return 'usd';
  if (/\bINR\b|₹|Rs\.?/i.test(text)) return 'inr';
  if (/\bEUR\b|€/.test(text)) return 'eur';
  if (/\bGBP\b|£/.test(text)) return 'gbp';

  for (let row = bounds.start_row; row <= bounds.end_row; row += 1) {
    for (let col = bounds.start_column; col <= bounds.end_column; col += 1) {
      const format = cellAt(sheet, row, col)?.number_format ?? '';
      if (/\$/.test(format)) return 'usd';
      if (/₹|Rs/i.test(format)) return 'inr';
      if (/€/.test(format)) return 'eur';
      if (/£/.test(format)) return 'gbp';
    }
  }
  return null;
}

function regionText(sheet: RawSheetGrid, bounds: RegionBounds): string {
  const chunks: string[] = [sheet.sheet_name];
  const contextStartRow = Math.max(sheet.start_row, bounds.start_row - 3);
  for (let row = contextStartRow; row <= bounds.end_row; row += 1) {
    for (let col = bounds.start_column; col <= bounds.end_column; col += 1) {
      const text = cellText(cellAt(sheet, row, col));
      if (text) chunks.push(text);
    }
  }
  return chunks.join(' ');
}

function detectExcludedRows(sheet: RawSheetGrid, bounds: RegionBounds): number[] {
  const excluded: number[] = [];
  for (let row = bounds.start_row; row <= bounds.end_row; row += 1) {
    const label = rowCells(sheet, row, bounds).map(cellText).filter(Boolean).slice(0, 3).join(' ');
    if (TOTAL_RE.test(label)) excluded.push(row + 1);
  }
  return excluded;
}

function hasMergedCells(sheet: RawSheetGrid, bounds: RegionBounds): boolean {
  for (let row = bounds.start_row; row <= bounds.end_row; row += 1) {
    for (let col = bounds.start_column; col <= bounds.end_column; col += 1) {
      if (cellAt(sheet, row, col)?.merged_range) return true;
    }
  }
  return false;
}

function sliceRawGrid(sheet: RawSheetGrid, bounds: RegionBounds): RawCell[][] {
  const rows: RawCell[][] = [];
  for (let row = bounds.start_row; row <= bounds.end_row; row += 1) {
    rows.push(rowCells(sheet, row, bounds));
  }
  return rows;
}

function inferLayout(sheet: RawSheetGrid, bounds: RegionBounds): RegionLayout {
  const width = bounds.end_column - bounds.start_column + 1;
  const height = bounds.end_row - bounds.start_row + 1;
  const warnings: string[] = [];
  const merged = hasMergedCells(sheet, bounds);
  if (merged) warnings.push('merged_cells_detected');

  const periodRow = bestPeriodRow(sheet, bounds);
  const periodColumn = bestPeriodColumn(sheet, bounds);
  const headerRows = detectHeaderRows(sheet, bounds, periodRow);
  const headerRowZero = headerRows[headerRows.length - 1] - 1;
  const firstDataRow = Math.min(bounds.end_row, headerRowZero + 1);
  const labelColumn = findLabelColumn(sheet, bounds, firstDataRow);
  const firstColStats = columnStats(sheet, bounds.start_column, bounds);
  const dataNumericCells = (() => {
    let count = 0;
    for (let row = firstDataRow; row <= bounds.end_row; row += 1) {
      for (let col = bounds.start_column; col <= bounds.end_column; col += 1) {
        if (isNumericLike(cellAt(sheet, row, col))) count += 1;
      }
    }
    return count;
  })();

  let layout_type: LayoutType = 'freeform';
  let metric_axis: LayoutAxis = null;
  let period_axis: LayoutAxis = null;
  let confidence = 0.45;
  const periodRowStats = rowStats(sheet, periodRow.row, bounds);

  if (
    periodRow.count >= 2 &&
    periodRowStats.numeric === 0 &&
    labelColumn !== null &&
    firstColStats.text >= Math.max(2, Math.floor(height / 3)) &&
    dataNumericCells >= 2
  ) {
    layout_type = 'matrix';
    metric_axis = 'rows';
    period_axis = 'columns';
    confidence = 0.82;
  } else if (periodColumn.count >= 2 && dataNumericCells >= 2) {
    layout_type = 'long_form';
    metric_axis = 'columns';
    period_axis = 'rows';
    confidence = 0.76;
  } else if (dataNumericCells >= 2 && headerRows.length > 0) {
    layout_type = width > 4 ? 'wide' : 'long_form';
    metric_axis = 'columns';
    period_axis = periodColumn.count > 0 ? 'rows' : null;
    confidence = 0.65;
  }

  if (dataNumericCells === 0) {
    warnings.push('no_numeric_values_detected');
    confidence -= 0.2;
  }
  if (periodRow.count === 0 && periodColumn.count === 0) {
    warnings.push('period_axis_not_detected');
    confidence -= 0.1;
  }

  const dataStartRow = layout_type === 'matrix' ? Math.min(bounds.end_row, periodRow.row + 1) : firstDataRow;
  const dataStartColumn = layout_type === 'matrix'
    ? Math.min(bounds.end_column, (labelColumn ?? bounds.start_column) + 1)
    : bounds.start_column;
  const dataRange = dataStartRow <= bounds.end_row && dataStartColumn <= bounds.end_column
    ? encodeRange({
        start_row: dataStartRow,
        end_row: bounds.end_row,
        start_column: dataStartColumn,
        end_column: bounds.end_column,
      })
    : null;

  return {
    bbox: encodeRange(bounds),
    layout_type,
    metric_axis,
    period_axis,
    header_rows: headerRows,
    data_range: dataRange,
    ...(labelColumn !== null ? { label_column: columnName(labelColumn) } : {}),
    scale: detectScale(sheet, bounds),
    currency: detectCurrency(sheet, bounds),
    merged_header_strategy: merged ? 'propagate' : 'ignore',
    excluded_rows: detectExcludedRows(sheet, bounds),
    excluded_columns: [],
    confidence: clampConfidence(confidence),
    warnings,
  };
}

export function detectRegionsAndLayouts(sheet: RawSheetGrid): DetectedRegion[] {
  return candidateBounds(sheet).map((bounds, index) => {
    const bbox = encodeRange(bounds);
    return {
      region_idx: index,
      sheet_idx: sheet.sheet_idx,
      sheet_name: sheet.sheet_name,
      start_row: bounds.start_row,
      end_row: bounds.end_row,
      start_column: bounds.start_column,
      end_column: bounds.end_column,
      bbox,
      layout: inferLayout(sheet, bounds),
      raw_grid: sliceRawGrid(sheet, bounds),
    };
  });
}

export function cellRefForValue(sheetName: string, row: number, column: number): string {
  return `${sheetName}!${encodeCell(row, column)}`;
}
