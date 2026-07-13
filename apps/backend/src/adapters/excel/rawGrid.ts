import * as XLSX from 'xlsx';

export interface RawCell {
  value: unknown;
  type: 'number' | 'string' | 'date' | 'blank' | 'formula' | 'boolean' | 'error';
  formula?: string;
  number_format?: string;
  fill?: string;
  font_bold?: boolean;
  indent?: number;
  merged_range?: string;
}

export interface RawSheetGrid {
  sheet_idx: number;
  sheet_name: string;
  start_row: number;
  start_column: number;
  max_row: number;
  max_column: number;
  range: string;
  raw_grid: RawCell[][];
}

function cellType(cell: XLSX.CellObject | undefined): RawCell['type'] {
  if (!cell) return 'blank';
  if (cell.f) return 'formula';
  if ((cell as any).t === 'str') return 'string';
  switch (cell.t) {
    case 'n':
      return 'number';
    case 's':
      return 'string';
    case 'd':
      return 'date';
    case 'b':
      return 'boolean';
    case 'e':
      return 'error';
    default:
      return 'blank';
  }
}

function mergedRangeForCell(merges: XLSX.Range[] | undefined, row: number, col: number): string | undefined {
  const merge = merges?.find(
    (r) => row >= r.s.r && row <= r.e.r && col >= r.s.c && col <= r.e.c,
  );
  return merge ? XLSX.utils.encode_range(merge) : undefined;
}

function styleValue(cell: XLSX.CellObject | undefined, path: string): unknown {
  const style = (cell as any)?.s;
  if (!style) return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, style);
}

function rawCell(sheet: XLSX.WorkSheet, row: number, col: number): RawCell {
  const ref = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[ref] as XLSX.CellObject | undefined;
  const type = cellType(cell);
  const merged_range = mergedRangeForCell(sheet['!merges'], row, col);
  const fill = styleValue(cell, 'fgColor.rgb') ?? styleValue(cell, 'fill.fgColor.rgb');
  const bold = styleValue(cell, 'font.bold');
  const indent = styleValue(cell, 'alignment.indent');

  const result: RawCell = {
    value: cell?.v ?? null,
    type,
    ...(cell?.f ? { formula: cell.f } : {}),
    ...(cell?.z ? { number_format: String(cell.z) } : {}),
    ...(typeof fill === 'string' ? { fill } : {}),
    ...(bold === true ? { font_bold: true } : {}),
    ...(typeof indent === 'number' ? { indent } : {}),
    ...(merged_range ? { merged_range } : {}),
  };
  return result;
}

export function extractRawSheets(workbook: XLSX.WorkBook): RawSheetGrid[] {
  return workbook.SheetNames.map((sheetName, sheetIdx) => {
    const sheet = workbook.Sheets[sheetName];
    const range = sheet?.['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
    if (!sheet || !range) {
      return {
        sheet_idx: sheetIdx,
        sheet_name: sheetName,
        start_row: 0,
        start_column: 0,
        max_row: 0,
        max_column: 0,
        range: '',
        raw_grid: [],
      };
    }

    const raw_grid: RawCell[][] = [];
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const cells: RawCell[] = [];
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        cells.push(rawCell(sheet, row, col));
      }
      raw_grid.push(cells);
    }

    return {
      sheet_idx: sheetIdx,
      sheet_name: sheetName,
      start_row: range.s.r,
      start_column: range.s.c,
      max_row: range.e.r + 1,
      max_column: range.e.c + 1,
      range: XLSX.utils.encode_range(range),
      raw_grid,
    };
  });
}
