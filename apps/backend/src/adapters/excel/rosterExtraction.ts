import type { RawCell, RawSheetGrid } from './rawGrid.js';

// Roster spreadsheets are a fundamentally simpler shape than the metrics
// pipeline's messy financial statements (regionLayout.ts's matrix/long_form/
// pivot detection doesn't apply here) — this is "one header row, one row per
// startup". This module is a purpose-built, lightweight table detector +
// column mapper for that shape.

export type RosterFieldKey =
  | 'name'
  | 'contactEmail'
  | 'contactName'
  | 'website'
  | 'stage'
  | 'sector'
  | 'country'
  | 'foundedYear';

export type RosterHeaderTarget = RosterFieldKey | 'metric' | null;
export type MappingSource = 'dictionary' | 'fuzzy' | 'llm' | 'unmapped';

// Single source of truth for "which seedMetrics/goal metric_key synonyms map
// to which companies column" — used both when committing a roster (so seeded
// numbers like ARR are immediately visible in the portfolio/dashboard/cohort
// aggregates, not just tucked away in metric_snapshots) and when computing
// cohort goal progress in incubatorCohorts.ts.
export const TRACKABLE_METRIC_COLUMNS: Record<string, string> = {
  mrr_usd: 'mrr_usd',
  mrr: 'mrr_usd',
  employees: 'employees',
  headcount: 'employees',
  team_size: 'employees',
  burn_rate_usd: 'burn_rate_usd',
  burn: 'burn_rate_usd',
  runway_months: 'runway_months',
  runway: 'runway_months',
  annual_revenue: 'annual_revenue',
  revenue: 'annual_revenue',
  arr: 'annual_revenue',
};

export interface RosterColumnMapping {
  columnIdx: number;
  header: string;
  target: RosterHeaderTarget;
  source: MappingSource;
  /** 0-1 confidence in the header→field mapping itself (not the cell value). */
  mappingConfidence: number;
  /** slugified key used when target === 'metric' */
  metricKey?: string;
}

export interface RosterSheetHeaders {
  sheetName: string;
  sheetIdx: number;
  headerRowIndex: number; // -1 if no header-like row was found
  dataStartRow: number;
  dataEndRow: number; // exclusive
  columns: RosterColumnMapping[];
  /** header texts that dictionary+fuzzy could not resolve and aren't clearly numeric metrics */
  unresolvedHeaders: string[];
}

export interface RosterRow {
  sheetName: string;
  rowIndex: number; // absolute row index within raw_grid, for addressing in a future review UI
  name: string | null;
  contactEmail: string | null;
  contactName: string | null;
  website: string | null;
  stage: string | null;
  sector: string | null;
  country: string | null;
  foundedYear: number | null;
  seedMetrics: Record<string, number>;
  confidence: Record<RosterFieldKey, number>;
  emailRecoveredByRegexSweep: boolean;
}

export interface RosterParseResult {
  sheets: RosterSheetHeaders[];
  rows: RosterRow[];
  warnings: string[];
}

// The ACTUAL values permitted by the Postgres `company_stage` enum. This is a
// funding-round taxonomy and is narrower than STAGE_VALUES above — anything not
// in this list will 22P02 on insert/update into companies.stage. Keep in sync
// with the enum (migration baseline_schema + company_stage_add_others) and the
// frontend COMPANY_STAGE_ENUM. 'Others' is the explicit fallback bucket.
export const COMPANY_STAGE_ENUM = [
  'Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D+',
  'Pre-IPO', 'Public', 'PSU', 'Bootstrapped', 'Others',
] as const;

const UNKNOWN_STAGE_LABELS = new Set(['other', 'others', 'unknown', 'n a', 'na', 'tbd', 'none']);

// Concepts that are real and unambiguous but aren't a funding round at all —
// mapping these into a funding-round bucket would misclassify them, so they
// go straight to 'Others' (matched: true — we're confident this ISN'T a
// funding stage, as opposed to the low-confidence fuzzy/fallback case below).
const NOT_A_FUNDING_STAGE = ['private', 'acquired', 'subsidiary', 'mature', 'established'];

export interface StageMapping {
  value: (typeof COMPANY_STAGE_ENUM)[number];
  /** true when this is a confident real-world match (exact/alias/regex); false when it's the last-resort 'Others' guess. */
  matched: boolean;
}

// Roster stages are product-maturity labels ("Idea Stage", "MVP in Market",
// "Prototype Developed", "Scaling / Growth Stage") — a different axis from the
// funding-round enum. Best-effort map them to the nearest enum value; when
// there's no confident match at all (regex heuristics nor a close fuzzy match
// against the enum's own labels), fall back to the explicit 'Others' value
// rather than silently letting the column default to 'Seed'. The incubator's
// exact wording is preserved separately in companies.stage_label, so this
// mapping is lossy by design without being data-lossy.
export function mapRosterStageToEnum(raw: string): StageMapping {
  const n = raw.trim().toLowerCase().replace(/[\s_/-]+/g, ' ').trim();
  if (!n) return { value: 'Others', matched: false };
  if (UNKNOWN_STAGE_LABELS.has(n)) return { value: 'Others', matched: true };

  // Exact / near-exact match against a real enum value first.
  const direct = COMPANY_STAGE_ENUM.find(
    (s) => s.toLowerCase() === n || s.toLowerCase().replace(/[\s+-]/g, '') === n.replace(/[\s+]/g, ''),
  );
  if (direct) return { value: direct, matched: true };

  // Series letter (E/F/G... collapse into the enum's top bucket "Series D+").
  const series = n.match(/series\s*([a-z])\+?/);
  if (series) {
    const letter = series[1];
    if (letter === 'a') return { value: 'Series A', matched: true };
    if (letter === 'b') return { value: 'Series B', matched: true };
    if (letter === 'c') return { value: 'Series C', matched: true };
    return { value: 'Series D+', matched: true }; // d and beyond
  }

  if (NOT_A_FUNDING_STAGE.some((k) => n.includes(k))) return { value: 'Others', matched: true };

  if (/\bpre[\s-]*seed\b/.test(n) || n.includes('pre seed')) return { value: 'Pre-seed', matched: true };
  if (n.includes('angel') || n.includes('friends and family') || n === 'f&f') return { value: 'Pre-seed', matched: true };
  if (/\bpre[\s-]*ipo\b/.test(n) || n.includes('pre ipo')) return { value: 'Pre-IPO', matched: true };
  if (n.includes('psu')) return { value: 'PSU', matched: true };
  if (n.includes('bootstrap')) return { value: 'Bootstrapped', matched: true };
  if (n.includes('public') || n.includes('listed') || /\bipo\b/.test(n)) return { value: 'Public', matched: true };

  if (n.includes('idea') || n.includes('ideation') || n.includes('concept')) return { value: 'Idea', matched: true };
  if (n.includes('prototype') || n.includes('poc') || n.includes('proof of concept') || n.includes('pre revenue')) {
    return { value: 'Pre-seed', matched: true };
  }
  if (
    n.includes('mvp') || n.includes('minimum viable') || n.includes('pilot') ||
    n.includes('beta') || n.includes('early traction') || n.includes('validation') ||
    n.includes('in market') || n.includes('early stage')
  ) {
    return { value: 'Seed', matched: true };
  }
  if (n.includes('scal') || n.includes('growth') || n.includes('expansion')) return { value: 'Series A', matched: true };

  // Last resort: fuzzy match against the enum's own labels — catches typos
  // and minor rewording ("Seires A", "Pre Seedd") the heuristics above miss.
  // Threshold is tight (30% of the longer string) to avoid guessing wildly on
  // short, ambiguous input.
  let best: { label: (typeof COMPANY_STAGE_ENUM)[number]; distance: number; len: number } | null = null;
  for (const label of COMPANY_STAGE_ENUM) {
    if (label === 'Others') continue;
    const target = label.toLowerCase();
    const distance = levenshtein(n, target);
    const len = Math.max(n.length, target.length);
    if (!best || distance / len < best.distance / best.len) best = { label, distance, len };
  }
  if (best && best.len > 0 && best.distance / best.len <= 0.3) {
    return { value: best.label, matched: true };
  }

  return { value: 'Others', matched: false };
}

const HEADER_DICTIONARY: Record<RosterFieldKey, string[]> = {
  name: ['startup', 'startup name', 'company', 'company name', 'name', 'organisation', 'organization'],
  contactEmail: ['email', 'contact email', 'founder email', 'e mail', 'email address', 'poc email'],
  contactName: ['founder', 'founder name', 'contact', 'contact name', 'point of contact', 'poc', 'poc name'],
  website: ['website', 'url', 'site', 'domain', 'web site'],
  stage: ['stage', 'round', 'funding stage', 'funding round'],
  sector: ['sector', 'industry', 'vertical', 'category', 'domain area'],
  country: ['country', 'location', 'hq', 'hq country', 'headquarters'],
  foundedYear: ['founded', 'founded year', 'year founded', 'incorporation year', 'year of incorporation'],
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function normalizeHeaderText(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[_\-/]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellText(cell: RawCell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  return String(cell.value).trim();
}

function isBlankCell(cell: RawCell | undefined): boolean {
  return cellText(cell) === '';
}

function isRowBlank(row: RawCell[] | undefined): boolean {
  if (!row) return true;
  return row.every(isBlankCell);
}

function isNumericLike(cell: RawCell | undefined): boolean {
  if (!cell || isBlankCell(cell)) return false;
  if (cell.type === 'number' || cell.type === 'formula') return Number.isFinite(Number(cell.value));
  const text = cellText(cell).replace(/[$,()%\s]/g, '');
  return text !== '' && text !== '-' && Number.isFinite(Number(text));
}

function nonBlankCells(row: RawCell[]): RawCell[] {
  return row.filter((c) => !isBlankCell(c));
}

function looksLikeHeaderRow(row: RawCell[]): boolean {
  const nonBlank = nonBlankCells(row);
  if (nonBlank.length < 2) return false;
  const textCount = nonBlank.filter((c) => !isNumericLike(c)).length;
  return textCount / nonBlank.length >= 0.6;
}

/** Levenshtein distance, small strings only (header text comparisons). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j += 1) prev[j] = curr[j];
  }
  return prev[n];
}

// Row-index / serial-number columns ("Sr. No.", "S/N", "#") are numeric but
// carry no business meaning — they must not be promoted to metric columns, or
// every roster seeds a junk `sr_no` metric onto its companies.
const ORDINAL_HEADERS = new Set([
  'sr no', 'srno', 'sr', 'sl no', 'slno', 'serial', 'serial no', 'serial number',
  's no', 'sno', 's n', 'no', 'number', 'index', 'idx', 'rank', 'row', 'row no',
]);

function isOrdinalHeader(header: string): boolean {
  const raw = header.trim();
  if (raw === '#') return true;
  return ORDINAL_HEADERS.has(normalizeHeaderText(header));
}

function slugifyMetricKey(header: string): string {
  const slug = header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'metric';
}

function mapHeader(rawHeader: string): { target: RosterHeaderTarget; source: MappingSource; confidence: number } {
  const normalized = normalizeHeaderText(rawHeader);
  if (!normalized) return { target: null, source: 'unmapped', confidence: 0 };

  for (const [field, synonyms] of Object.entries(HEADER_DICTIONARY) as [RosterFieldKey, string[]][]) {
    if (synonyms.includes(normalized)) {
      return { target: field, source: 'dictionary', confidence: 1 };
    }
  }

  // Fuzzy: shortest normalized edit distance against any synonym, scaled to length.
  let best: { field: RosterFieldKey; distance: number; len: number } | null = null;
  for (const [field, synonyms] of Object.entries(HEADER_DICTIONARY) as [RosterFieldKey, string[]][]) {
    for (const synonym of synonyms) {
      const distance = levenshtein(normalized, synonym);
      const len = Math.max(normalized.length, synonym.length);
      if (!best || distance / len < best.distance / best.len) {
        best = { field, distance, len };
      }
    }
  }
  if (best && best.len > 0 && best.distance / best.len <= 0.25) {
    const confidence = Math.max(0.6, 1 - best.distance / best.len);
    return { target: best.field, source: 'fuzzy', confidence };
  }

  return { target: null, source: 'unmapped', confidence: 0 };
}

function detectSheetHeaders(sheet: RawSheetGrid): RosterSheetHeaders {
  const grid = sheet.raw_grid;
  let headerRowIndex = -1;
  for (let i = 0; i < grid.length; i += 1) {
    if (!looksLikeHeaderRow(grid[i])) continue;
    // Skip an apparent header that's actually a title banner followed by a
    // blank separator row and a *better* header-like row shortly after.
    if (isRowBlank(grid[i + 1]) && grid[i + 2] && looksLikeHeaderRow(grid[i + 2])) {
      continue;
    }
    headerRowIndex = i;
    break;
  }

  if (headerRowIndex === -1) {
    return {
      sheetName: sheet.sheet_name,
      sheetIdx: sheet.sheet_idx,
      headerRowIndex: -1,
      dataStartRow: -1,
      dataEndRow: -1,
      columns: [],
      unresolvedHeaders: [],
    };
  }

  const headerRow = grid[headerRowIndex];
  const columns: RosterColumnMapping[] = [];
  const unresolvedHeaders: string[] = [];

  headerRow.forEach((cell, columnIdx) => {
    const header = cellText(cell);
    if (!header) return;
    const { target, source, confidence } = mapHeader(header);
    columns.push({ columnIdx, header, target, source, mappingConfidence: confidence });
  });

  // Find data range: starts right after the header, ends at the first run of
  // two consecutive fully-blank rows (or end of sheet).
  let dataEndRow = grid.length;
  for (let i = headerRowIndex + 1; i < grid.length; i += 1) {
    if (isRowBlank(grid[i]) && isRowBlank(grid[i + 1])) {
      dataEndRow = i;
      break;
    }
  }

  // Unmapped, mostly-numeric columns become candidate metric columns instead
  // of being discarded — a roster often carries seed metrics (ARR, team size).
  const dataRows = grid.slice(headerRowIndex + 1, dataEndRow);
  for (const col of columns) {
    if (col.target !== null) continue;
    // Ignore row-index columns entirely — not a metric, not worth an LLM round-trip.
    if (isOrdinalHeader(col.header)) continue;
    const values = dataRows.map((row) => row[col.columnIdx]).filter((c) => c && !isBlankCell(c));
    if (values.length === 0) {
      unresolvedHeaders.push(col.header);
      continue;
    }
    const numericCount = values.filter((c) => isNumericLike(c)).length;
    if (numericCount / values.length >= 0.6) {
      col.target = 'metric';
      col.source = 'dictionary';
      col.mappingConfidence = 1;
      col.metricKey = slugifyMetricKey(col.header);
    } else {
      unresolvedHeaders.push(col.header);
    }
  }

  return {
    sheetName: sheet.sheet_name,
    sheetIdx: sheet.sheet_idx,
    headerRowIndex,
    dataStartRow: headerRowIndex + 1,
    dataEndRow,
    columns,
    unresolvedHeaders,
  };
}

export function detectRosterHeaders(sheets: RawSheetGrid[]): RosterSheetHeaders[] {
  return sheets.map(detectSheetHeaders);
}

/**
 * Merge externally-resolved headers (e.g. from a Gemini classification pass)
 * back into the detected sheet headers. `resolutions` maps the raw header
 * text (case-sensitive, as it appeared in the sheet) to a resolved field.
 */
export function applyHeaderResolutions(
  sheetHeaders: RosterSheetHeaders[],
  resolutions: Record<string, RosterHeaderTarget>,
): RosterSheetHeaders[] {
  if (Object.keys(resolutions).length === 0) return sheetHeaders;
  return sheetHeaders.map((sheet) => ({
    ...sheet,
    columns: sheet.columns.map((col) => {
      if (col.target !== null || !(col.header in resolutions)) return col;
      const resolved = resolutions[col.header];
      if (!resolved) return col;
      return {
        ...col,
        target: resolved,
        source: 'llm' as MappingSource,
        mappingConfidence: 0.6,
        ...(resolved === 'metric' ? { metricKey: slugifyMetricKey(col.header) } : {}),
      };
    }),
    unresolvedHeaders: sheet.unresolvedHeaders.filter((h) => !(h in resolutions) || !resolutions[h]),
  }));
}

function normalizeSector(raw: string, knownSectors: string[]): { value: string; matched: boolean } {
  const normalized = raw.trim().toLowerCase();
  const exact = knownSectors.find((s) => s.toLowerCase() === normalized);
  if (exact) return { value: exact, matched: true };
  let best: { sector: string; distance: number } | null = null;
  for (const sector of knownSectors) {
    const distance = levenshtein(normalized, sector.toLowerCase());
    if (!best || distance < best.distance) best = { sector, distance };
  }
  if (best && best.distance <= 2) return { value: best.sector, matched: true };
  return { value: raw.trim(), matched: false };
}

function parseFoundedYear(raw: string): number | null {
  const n = Number(raw.trim().slice(0, 4));
  const currentYear = new Date().getUTCFullYear();
  return Number.isInteger(n) && n >= 1900 && n <= currentYear + 1 ? n : null;
}

export interface ExtractRosterRowsOptions {
  knownSectors: string[];
}

export function extractRosterRows(
  sheets: RawSheetGrid[],
  sheetHeaders: RosterSheetHeaders[],
  options: ExtractRosterRowsOptions,
): { rows: RosterRow[]; warnings: string[] } {
  const rows: RosterRow[] = [];
  const warnings: string[] = [];
  const byIdx = new Map(sheets.map((s) => [s.sheet_idx, s]));

  for (const header of sheetHeaders) {
    if (header.headerRowIndex === -1) {
      warnings.push(`${header.sheetName}: no header row detected, sheet skipped`);
      continue;
    }
    const sheet = byIdx.get(header.sheetIdx);
    if (!sheet) continue;

    const nameCol = header.columns.find((c) => c.target === 'name');
    if (!nameCol) {
      warnings.push(`${header.sheetName}: no "name" column resolved, rows skipped`);
      continue;
    }

    const emailCol = header.columns.find((c) => c.target === 'contactEmail');
    const contactNameCol = header.columns.find((c) => c.target === 'contactName');
    const websiteCol = header.columns.find((c) => c.target === 'website');
    const stageCol = header.columns.find((c) => c.target === 'stage');
    const sectorCol = header.columns.find((c) => c.target === 'sector');
    const countryCol = header.columns.find((c) => c.target === 'country');
    const foundedCol = header.columns.find((c) => c.target === 'foundedYear');
    const metricCols = header.columns.filter((c) => c.target === 'metric');

    let consecutiveBlank = 0;
    for (let r = header.dataStartRow; r < header.dataEndRow; r += 1) {
      const row = sheet.raw_grid[r];
      if (!row || isRowBlank(row)) {
        consecutiveBlank += 1;
        if (consecutiveBlank >= 2) break;
        continue;
      }
      consecutiveBlank = 0;

      const name = cellText(row[nameCol.columnIdx]) || null;
      if (!name) continue; // no name, no row — reject silently per the extraction contract

      let contactEmail = emailCol ? cellText(row[emailCol.columnIdx]) || null : null;
      let emailRecoveredByRegexSweep = false;
      if (!contactEmail) {
        const rowText = row.map((c) => cellText(c)).join(' ');
        const match = rowText.match(EMAIL_RE);
        if (match) {
          contactEmail = match[0];
          emailRecoveredByRegexSweep = true;
        }
      }

      const contactName = contactNameCol ? cellText(row[contactNameCol.columnIdx]) || null : null;
      const website = websiteCol ? cellText(row[websiteCol.columnIdx]) || null : null;
      const countryRaw = countryCol ? cellText(row[countryCol.columnIdx]) : '';
      const country = countryRaw || null;

      const stageRaw = stageCol ? cellText(row[stageCol.columnIdx]) : '';
      const stageResult = stageRaw ? mapRosterStageToEnum(stageRaw) : null;
      const stage = stageResult ? stageResult.value : null;

      const sectorRaw = sectorCol ? cellText(row[sectorCol.columnIdx]) : '';
      const sectorResult = sectorRaw ? normalizeSector(sectorRaw, options.knownSectors) : null;
      const sector = sectorResult ? sectorResult.value : null;

      const foundedRaw = foundedCol ? cellText(row[foundedCol.columnIdx]) : '';
      const foundedYear = foundedRaw ? parseFoundedYear(foundedRaw) : null;

      const seedMetrics: Record<string, number> = {};
      for (const col of metricCols) {
        const cell = row[col.columnIdx];
        if (!col.metricKey || !cell || isBlankCell(cell)) continue;
        const text = cellText(cell).replace(/[$,()%\s]/g, '');
        const value = Number(text);
        if (Number.isFinite(value)) seedMetrics[col.metricKey] = value;
      }

      const confidence: Record<RosterFieldKey, number> = {
        name: nameCol.mappingConfidence,
        contactEmail: contactEmail
          ? (emailRecoveredByRegexSweep ? 0.9 : (emailCol?.mappingConfidence ?? 0))
          : 0,
        contactName: contactName ? (contactNameCol?.mappingConfidence ?? 0) : 0,
        website: website ? (websiteCol?.mappingConfidence ?? 0) : 0,
        // matched: false means mapRosterStageToEnum couldn't find a confident
        // match and fell back to 'Others' — surface that as a low (red)
        // confidence dot so the reviewer notices and can hand-pick the stage,
        // rather than the previous behavior of silently defaulting to 'Seed'.
        stage: stage ? (stageCol!.mappingConfidence * (stageResult?.matched ? 1 : 0.3)) : 0,
        sector: sector ? (sectorCol!.mappingConfidence * (sectorResult?.matched ? 1 : 0.5)) : 0,
        country: country ? (countryCol?.mappingConfidence ?? 0) : 0,
        foundedYear: foundedYear !== null ? (foundedCol?.mappingConfidence ?? 0) : 0,
      };

      rows.push({
        sheetName: header.sheetName,
        rowIndex: r,
        name,
        contactEmail,
        contactName,
        website,
        stage,
        sector,
        country,
        foundedYear,
        seedMetrics,
        confidence,
        emailRecoveredByRegexSweep,
      });
    }
  }

  return { rows, warnings };
}

export function parseRoster(sheets: RawSheetGrid[], options: ExtractRosterRowsOptions): RosterParseResult {
  const sheetHeaders = detectRosterHeaders(sheets);
  const { rows, warnings } = extractRosterRows(sheets, sheetHeaders, options);
  return { sheets: sheetHeaders, rows, warnings };
}
