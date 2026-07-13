import * as XLSX from 'xlsx';
import { pool, supabaseAdmin } from '../db.js';
import { extractRawSheets } from '../adapters/excel/rawGrid.js';
import {
  detectRosterHeaders,
  applyHeaderResolutions,
  extractRosterRows,
} from '../adapters/excel/rosterExtraction.js';
import { classifyRosterHeaders } from '../adapters/classify/rosterColumns.js';

export async function normalizeRoster(job: Record<string, any>): Promise<number> {
  const { rows: fileRows } = await pool.query<{
    id: string;
    incubator_id: string | null;
    storage_path: string;
  }>(
    `
    select id, incubator_id, storage_path
      from public.ingestion_files
     where id = $1
     limit 1
    `,
    [job.file_id],
  );
  const file = fileRows[0];
  if (!file) {
    throw new Error('file_row_missing');
  }
  if (!file.incubator_id) {
    throw new Error('roster_file_missing_incubator');
  }

  const { data: blob, error: downloadErr } = await supabaseAdmin.storage
    .from('ingestion')
    .download(file.storage_path);
  if (downloadErr || !blob) {
    throw new Error('storage_download_failed');
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellStyles: true });
  const rawSheets = extractRawSheets(workbook);

  const { rows: sectorRows } = await pool.query<{ label: string }>(
    `select label from public.industries where label is not null`,
  );
  const knownSectors = sectorRows.map((r) => r.label);

  let sheetHeaders = detectRosterHeaders(rawSheets);

  const unresolvedHeaders = [...new Set(sheetHeaders.flatMap((s) => s.unresolvedHeaders))];
  if (unresolvedHeaders.length > 0) {
    const sampleRows = (rawSheets[0]?.raw_grid ?? [])
      .slice(1, 6)
      .map((row) => row.map((cell) => (cell.value == null ? '' : String(cell.value))));
    const resolutions = await classifyRosterHeaders(unresolvedHeaders, sampleRows).catch((err) => {
      console.warn(
        '[normalizeRoster] gemini classification failed',
        err instanceof Error ? err.message : String(err),
      );
      return {};
    });
    sheetHeaders = applyHeaderResolutions(sheetHeaders, resolutions);
  }

  const { rows, warnings } = extractRosterRows(rawSheets, sheetHeaders, { knownSectors });

  await pool.query(
    `
    update public.ingestion_jobs
       set payload = payload || jsonb_build_object('roster_staging', $2::jsonb)
     where id = $1
    `,
    [
      job.id,
      JSON.stringify({
        rows,
        warnings,
        parsedAt: new Date().toISOString(),
      }),
    ],
  );

  return rows.length;
}
