import * as XLSX from 'xlsx';
import type { PoolClient } from 'pg';
import { pool, supabaseAdmin } from '../db.js';
import { extractRawSheets, type RawSheetGrid } from '../adapters/excel/rawGrid.js';
import {
  detectRegionsAndLayouts,
  type DetectedRegion,
} from '../adapters/excel/regionLayout.js';
import {
  extractDictionaryObservations,
  type MetricObservation,
} from '../adapters/excel/metricExtraction.js';
import {
  applyRegionRecipe,
  regionProfileSignature,
  type RegionSourceRecipe,
} from '../adapters/excel/sourceProfile.js';
import { classifyWithGemini } from '../adapters/classify/llm.js';
import { tryLegacyTemplate } from '../adapters/excel/knownSources/legacyTemplate.js';
import type { TemplateRecord } from '../adapters/excel/template.js';

export const EXCEL_INGESTION_VERSIONS = {
  parser: 'excel-parser-v2-foundation',
  taxonomy: '2026-05-01',
  classifier: 'known-source-dictionary-v1',
  prompt: 'none',
} as const;

async function assertKnownMetricKeys(
  client: PoolClient,
  companyId: string,
  records: TemplateRecord[],
) {
  const metricKeys = [...new Set(records.map((r) => r.metric_key))];
  const { rows } = await client.query<{ metric_key: string }>(
    `
    select metric_key
      from public.metric_definitions
     where metric_key = any($1::text[])
    union
    select metric_key
      from public.company_metric_definitions
     where company_id = $2
       and metric_key = any($1::text[])
    `,
    [metricKeys, companyId],
  );

  const known = new Set(rows.map((r) => r.metric_key));
  const unknown = metricKeys.filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new Error(`unknown_metric_keys:${unknown.join(',')}`);
  }
}

async function upsertRawSheets(
  client: PoolClient,
  job: Record<string, any>,
  file: { id: string; company_id: string },
  sheets: RawSheetGrid[],
) {
  const byName = new Map<string, { id: string; sheet: RawSheetGrid }>();
  for (const sheet of sheets) {
    const { rows } = await client.query<{ id: string }>(
      `
      insert into public.raw_workbook_sheets
        (company_id, file_id, job_id, sheet_idx, sheet_name, max_row, max_column, raw_grid)
      values
        ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      on conflict (file_id, sheet_idx)
      do update
         set job_id = excluded.job_id,
             sheet_name = excluded.sheet_name,
             max_row = excluded.max_row,
             max_column = excluded.max_column,
             raw_grid = excluded.raw_grid
      returning id
      `,
      [
        file.company_id,
        file.id,
        job.id,
        sheet.sheet_idx,
        sheet.sheet_name,
        sheet.max_row,
        sheet.max_column,
        JSON.stringify(sheet.raw_grid),
      ],
    );
    byName.set(sheet.sheet_name, { id: rows[0].id, sheet });
  }
  return byName;
}

async function upsertRawRegions(
  client: PoolClient,
  job: Record<string, any>,
  file: { id: string; company_id: string },
  rawSheetByName: Map<string, { id: string; sheet: RawSheetGrid }>,
  regions: DetectedRegion[],
) {
  const byKey = new Map<string, { id: string; region: DetectedRegion }>();
  for (const region of regions) {
    const rawSheet = rawSheetByName.get(region.sheet_name);
    if (!rawSheet) continue;

    const { rows } = await client.query<{ id: string }>(
      `
      insert into public.raw_extractions
        (company_id, file_id, job_id, raw_sheet_id, sheet_idx, sheet_name,
         region_idx, bbox, layout, raw_grid)
      values
        ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
      on conflict (file_id, sheet_idx, region_idx)
      do update
         set job_id = excluded.job_id,
             raw_sheet_id = excluded.raw_sheet_id,
             sheet_name = excluded.sheet_name,
             bbox = excluded.bbox,
             layout = excluded.layout,
             raw_grid = excluded.raw_grid
      returning id
      `,
      [
        file.company_id,
        file.id,
        job.id,
        rawSheet.id,
        region.sheet_idx,
        region.sheet_name,
        region.region_idx,
        region.bbox,
        JSON.stringify(region.layout),
        JSON.stringify(region.raw_grid),
      ],
    );

    byKey.set(`${region.sheet_name}:${region.region_idx}`, { id: rows[0].id, region });
  }
  return byKey;
}

function findLegacyMetricsRegion(
  regionByKey: Map<string, { id: string; region: DetectedRegion }>,
): { id: string; region: DetectedRegion } | null {
  const metricsRegions = [...regionByKey.values()]
    .filter((entry) => entry.region.sheet_name === 'Metrics')
    .sort((a, b) => {
      if (a.region.layout.layout_type === 'long_form' && b.region.layout.layout_type !== 'long_form') return -1;
      if (a.region.layout.layout_type !== 'long_form' && b.region.layout.layout_type === 'long_form') return 1;
      return b.region.layout.confidence - a.region.layout.confidence;
    });
  return metricsRegions[0] ?? null;
}

async function createExtractionRun(
  client: PoolClient,
  job: Record<string, any>,
  file: { id: string; company_id: string },
  regionId: string,
) {
  await client.query(
    `
    update public.extraction_runs
       set is_current = false
     where file_id = $1
       and region_id = $2
       and is_current
    `,
    [file.id, regionId],
  );

  const { rows } = await client.query<{ id: string }>(
    `
    insert into public.extraction_runs
      (company_id, file_id, region_id, job_id, parser_version, taxonomy_version,
       classifier_version, prompt_version, status, is_current)
    values
      ($1, $2, $3, $4, $5, $6, $7, $8, 'running', true)
    on conflict (file_id, region_id, parser_version, taxonomy_version, classifier_version, prompt_version)
    do update
       set job_id = excluded.job_id,
           status = 'running',
           is_current = true,
           error = null,
           completed_at = null
    returning id
    `,
    [
      file.company_id,
      file.id,
      regionId,
      job.id,
      EXCEL_INGESTION_VERSIONS.parser,
      EXCEL_INGESTION_VERSIONS.taxonomy,
      EXCEL_INGESTION_VERSIONS.classifier,
      EXCEL_INGESTION_VERSIONS.prompt,
    ],
  );

  return rows[0].id;
}

async function completeExtractionRun(client: PoolClient, runId: string) {
  await client.query(
    `
    update public.extraction_runs
       set status = 'complete',
           completed_at = now()
     where id = $1
    `,
    [runId],
  );
}

async function insertDecision(
  client: PoolClient,
  companyId: string,
  runId: string,
  observation: MetricObservation,
) {
  const { rows } = await client.query<{ id: string }>(
    `
    insert into public.extraction_decisions
      (company_id, run_id, source_locator, source_label, role, proposed_key,
       final_key, confidence, stage, status, reasoning)
    values
      ($1, $2, $3::jsonb, $4, 'metric', $5, $6, $7, $8, $9, $10)
    returning id
    `,
    [
      companyId,
      runId,
      JSON.stringify(observation.decision_locator),
      observation.source_label,
      observation.metric_key,
      observation.status === 'accepted' ? observation.metric_key : null,
      observation.confidence,
      observation.stage,
      observation.status,
      observation.reasoning,
    ],
  );
  return rows[0].id;
}

export async function promoteObservation(
  client: PoolClient,
  job: Record<string, any>,
  file: { company_id: string; source_id: string },
  runId: string,
  decisionId: string,
  sourceProfileId: string | null,
  observation: MetricObservation,
) {
  if (
    observation.status !== 'accepted' ||
    !observation.metric_key ||
    observation.value === null ||
    !observation.period_start ||
    !observation.period_end
  ) {
    return null;
  }

  const { rows: supersededRows } = await client.query<{ id: string }>(
    `
    update public.normalized_metrics
       set superseded_by = $1
     where company_id = $2
       and source_id = $3
       and metric_key = $4
       and period_start = $5
       and period_end = $6
       and scenario = 'actual'
       and superseded_by is null
       and superseded_by_metric_id is null
       and job_id <> $1
    returning id
    `,
    [
      job.id,
      file.company_id,
      file.source_id,
      observation.metric_key,
      observation.period_start,
      observation.period_end,
    ],
  );

  const { rows: metricRows } = await client.query<{ id: string }>(
    `
    insert into public.normalized_metrics
      (company_id, metric_key, period_start, period_end, value, unit,
       source_id, job_id, run_id, decision_id, source_profile_id,
       confidence, scenario, scale, currency, source_sheet_name,
       source_cell_ref, source_locator)
    values
      ($1, $2, $3, $4, $5::numeric, $6, $7, $8, $9, $10, $11,
       $12, 'actual', $13, $14, $15, $16, $17::jsonb)
    on conflict (company_id, metric_key, period_start, period_end, scenario, source_id)
      where superseded_by is null and superseded_by_metric_id is null
    do update
       set value = excluded.value,
           unit = excluded.unit,
           job_id = excluded.job_id,
           run_id = excluded.run_id,
           decision_id = excluded.decision_id,
           source_profile_id = excluded.source_profile_id,
           confidence = excluded.confidence,
           scale = excluded.scale,
           currency = excluded.currency,
           source_sheet_name = excluded.source_sheet_name,
           source_cell_ref = excluded.source_cell_ref,
           source_locator = excluded.source_locator
    returning id
    `,
    [
      file.company_id,
      observation.metric_key,
      observation.period_start,
      observation.period_end,
      observation.value,
      observation.unit,
      file.source_id,
      job.id,
      runId,
      decisionId,
      sourceProfileId,
      observation.confidence,
      observation.scale,
      observation.currency,
      observation.source_sheet_name,
      observation.source_cell_ref,
      JSON.stringify(observation.value_locator ?? observation.decision_locator),
    ],
  );
  const metricId = metricRows[0].id;

  if (supersededRows.length > 0) {
    await client.query(
      `
      update public.normalized_metrics
         set superseded_by_metric_id = $1
       where id = any($2::uuid[])
      `,
      [metricId, supersededRows.map((r) => r.id)],
    );
  }

  return metricId;
}

async function isKnownMetricKey(client: PoolClient, companyId: string, metricKey: string) {
  const { rows } = await client.query<{ metric_key: string }>(
    `
    select metric_key
      from public.metric_definitions
     where metric_key = $1
    union
    select metric_key
      from public.company_metric_definitions
     where company_id = $2
       and metric_key = $1
    `,
    [metricKey, companyId],
  );
  return rows.length > 0;
}

async function applyGeminiFallback(
  client: PoolClient,
  companyId: string,
  region: DetectedRegion,
  observations: MetricObservation[],
): Promise<MetricObservation[]> {
  const byDecision = new Map<string, MetricObservation[]>();
  for (const observation of observations) {
    if (observation.status !== 'pending_review') continue;
    const key = JSON.stringify(observation.decision_locator);
    byDecision.set(key, [...(byDecision.get(key) ?? []), observation]);
  }
  if (byDecision.size === 0) return observations;

  const replacements = new Map<string, MetricObservation>();
  const siblings = [...new Set(observations.map((o) => o.source_label).filter(Boolean))];

  for (const [decisionKey, group] of byDecision.entries()) {
    const first = group[0];
    try {
      const result = await classifyWithGemini({
        locator: first.decision_locator,
        layout_context: region.layout as unknown as Record<string, unknown>,
        label: first.source_label,
        sample_values: group.map((o) => o.value).filter((v) => v !== null).slice(0, 5),
        siblings,
      });
      if (!result?.target_key) continue;

      const known = await isKnownMetricKey(client, companyId, result.target_key);
      const accepted = result.role === 'metric' && result.confidence >= 0.85 && known;
      replacements.set(decisionKey, {
        ...first,
        metric_key: result.target_key,
        confidence: result.confidence,
        status: accepted ? 'accepted' : 'pending_review',
        stage: 'llm',
        reasoning: result.reasoning ?? `Gemini proposed "${result.target_key}"`,
      });
    } catch (err) {
      console.error('[ingestion] Gemini classification failed', {
        label: first.source_label,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return observations.map((observation) => {
    const replacement = replacements.get(JSON.stringify(observation.decision_locator));
    if (!replacement) return observation;
    return {
      ...observation,
      metric_key: replacement.metric_key,
      confidence: replacement.confidence,
      status: replacement.status,
      stage: replacement.stage,
      reasoning: replacement.reasoning,
    };
  });
}

async function processDictionaryRegion(
  client: PoolClient,
  job: Record<string, any>,
  file: { id: string; company_id: string; source_id: string },
  regionId: string,
  region: DetectedRegion,
) {
  const baseObservations = extractDictionaryObservations(region);
  if (baseObservations.length === 0) return 0;

  const signature = regionProfileSignature(region, baseObservations);
  const { rows: profileRows } = await client.query<{ id: string; recipe: RegionSourceRecipe }>(
    `
    select id, recipe
      from public.source_profiles
     where company_id = $1
       and signature = $2
     limit 1
    `,
    [file.company_id, signature],
  );
  const profile = profileRows[0] ?? null;
  const profiledObservations = applyRegionRecipe(baseObservations, profile?.recipe ?? null);
  const observations = await applyGeminiFallback(client, file.company_id, region, profiledObservations);
  if (observations.length === 0) return 0;

  const runId = await createExtractionRun(client, job, file, regionId);
  let promoted = 0;
  const decisionCache = new Map<string, string>();

  for (const observation of observations) {
    const decisionKey = JSON.stringify({
      locator: observation.decision_locator,
      label: observation.source_label,
      key: observation.metric_key,
      status: observation.status,
    });
    let decisionId = decisionCache.get(decisionKey);
    if (!decisionId) {
      decisionId = await insertDecision(client, file.company_id, runId, observation);
      decisionCache.set(decisionKey, decisionId);
    }

    const metricId = await promoteObservation(client, job, file, runId, decisionId, profile?.id ?? null, observation);
    if (metricId) promoted += 1;
  }

  await completeExtractionRun(client, runId);
  return promoted;
}

export async function normalizeExcel(job: Record<string, any>): Promise<number> {
  const { rows: fileRows } = await pool.query<{
    id: string;
    company_id: string;
    source_id: string;
    storage_path: string;
  }>(
    `
    select id, company_id, source_id, storage_path
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

  const { data: blob, error: downloadErr } = await supabaseAdmin.storage
    .from('ingestion')
    .download(file.storage_path);
  if (downloadErr || !blob) {
    throw new Error('storage_download_failed');
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellStyles: true });
  const rawSheets = extractRawSheets(workbook);
  const detectedRegions = rawSheets.flatMap(detectRegionsAndLayouts);
  const legacy = tryLegacyTemplate(workbook);

  const client = await pool.connect();
  try {
    await client.query('begin');

    const rawSheetByName = await upsertRawSheets(client, job, file, rawSheets);
    const regionByKey = await upsertRawRegions(client, job, file, rawSheetByName, detectedRegions);
    const legacyMetricsRegion = legacy ? findLegacyMetricsRegion(regionByKey) : null;
    let recordCount = 0;

    if (legacy) {
      await assertKnownMetricKeys(client, file.company_id, legacy.records);

      if (!legacyMetricsRegion) {
        throw new Error('metrics_region_missing');
      }

      const { rows: profileRows } = await client.query<{ id: string }>(
        `
        insert into public.source_profiles
          (company_id, signature, name, recipe, last_used_at, use_count)
        values
          ($1, $2, $3, $4::jsonb, now(), 1)
        on conflict (company_id, signature)
        do update
           set recipe = excluded.recipe,
               last_used_at = now(),
               use_count = public.source_profiles.use_count + 1
        returning id
        `,
        [file.company_id, legacy.signature, legacy.name, JSON.stringify(legacy.recipe)],
      );
      const sourceProfileId = profileRows[0].id;
      const regionId = legacyMetricsRegion.id;

      await client.query(
        `
        update public.extraction_runs
           set is_current = false
         where file_id = $1
           and region_id = $2
           and is_current
        `,
        [file.id, regionId],
      );

      const { rows: runRows } = await client.query<{ id: string }>(
        `
        insert into public.extraction_runs
          (company_id, file_id, region_id, job_id, parser_version, taxonomy_version,
           classifier_version, prompt_version, status, is_current)
        values
          ($1, $2, $3, $4, $5, $6, $7, $8, 'running', true)
        on conflict (file_id, region_id, parser_version, taxonomy_version, classifier_version, prompt_version)
        do update
           set job_id = excluded.job_id,
               status = 'running',
               is_current = true,
               error = null,
               completed_at = null
        returning id
        `,
        [
          file.company_id,
          file.id,
          regionId,
          job.id,
          EXCEL_INGESTION_VERSIONS.parser,
          EXCEL_INGESTION_VERSIONS.taxonomy,
          EXCEL_INGESTION_VERSIONS.classifier,
          EXCEL_INGESTION_VERSIONS.prompt,
        ],
      );
      const runId = runRows[0].id;

      for (const record of legacy.records) {
        const { rows: decisionRows } = await client.query<{ id: string }>(
          `
          insert into public.extraction_decisions
            (company_id, run_id, source_locator, source_label, role, proposed_key,
             final_key, confidence, stage, status, reasoning)
          values
            ($1, $2, $3::jsonb, $4, 'metric', $5, $5, 1, 'known_source', 'accepted',
             'Matched FounderOS metrics template')
          returning id
          `,
          [
            file.company_id,
            runId,
            JSON.stringify(record.source_locator),
            record.metric_key,
            record.metric_key,
          ],
        );
        const decisionId = decisionRows[0].id;

        const { rows: supersededRows } = await client.query<{ id: string }>(
          `
          update public.normalized_metrics
             set superseded_by = $1
           where company_id = $2
             and source_id = $3
             and metric_key = $4
             and period_start = $5
             and period_end = $6
             and scenario = 'actual'
             and superseded_by is null
             and superseded_by_metric_id is null
             and job_id <> $1
          returning id
          `,
          [
            job.id,
            file.company_id,
            file.source_id,
            record.metric_key,
            record.period_start,
            record.period_end,
          ],
        );

        const { rows: metricRows } = await client.query<{ id: string }>(
          `
          insert into public.normalized_metrics
            (company_id, metric_key, period_start, period_end, value, unit,
             source_id, job_id, run_id, decision_id, source_profile_id,
             confidence, scenario, scale, currency, source_sheet_name,
             source_cell_ref, source_locator)
          values
            ($1, $2, $3, $4, $5::numeric, $6, $7, $8, $9, $10, $11,
             1, 'actual', 1, $12, $13, $14, $15::jsonb)
          on conflict (company_id, metric_key, period_start, period_end, scenario, source_id)
            where superseded_by is null and superseded_by_metric_id is null
          do update
             set value = excluded.value,
                 unit = excluded.unit,
                 job_id = excluded.job_id,
                 run_id = excluded.run_id,
                 decision_id = excluded.decision_id,
                 source_profile_id = excluded.source_profile_id,
                 confidence = excluded.confidence,
                 scale = excluded.scale,
                 currency = excluded.currency,
                 source_sheet_name = excluded.source_sheet_name,
                 source_cell_ref = excluded.source_cell_ref,
                 source_locator = excluded.source_locator
          returning id
          `,
          [
            file.company_id,
            record.metric_key,
            record.period_start,
            record.period_end,
            record.value,
            record.unit,
            file.source_id,
            job.id,
            runId,
            decisionId,
            sourceProfileId,
            record.unit.toLowerCase() === 'usd' ? 'usd' : null,
            record.source_sheet_name,
            record.source_cell_ref,
            JSON.stringify(record.source_locator),
          ],
        );
        const metricId = metricRows[0].id;

        if (supersededRows.length > 0) {
          await client.query(
            `
            update public.normalized_metrics
               set superseded_by_metric_id = $1
             where id = any($2::uuid[])
            `,
            [metricId, supersededRows.map((r) => r.id)],
          );
        }
      }

      await client.query(
        `
        update public.extraction_runs
           set status = 'complete',
               completed_at = now()
         where id = $1
        `,
        [runId],
      );
      recordCount += legacy.records.length;
    }

    for (const entry of regionByKey.values()) {
      if (legacyMetricsRegion && entry.id === legacyMetricsRegion.id) continue;
      recordCount += await processDictionaryRegion(client, job, file, entry.id, entry.region);
    }

    await client.query(
      `
      update public.data_sources
         set last_sync_at = now()
       where id = $1
      `,
      [file.source_id],
    );

    await client.query('commit');
    return recordCount;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
