import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import type { PoolClient } from 'pg';
import { authJwt } from '../middleware/authJwt.js';
import { requirePermission } from '../rbac.js';
import { pool, supabaseAdmin, supabaseForUser } from '../db.js';
import { EXCEL_INGESTION_VERSIONS, promoteObservation } from '../jobs/normalizeExcel.js';
import {
  countPromotableObservationsForLocator,
  extractDictionaryObservations,
  type MetricObservation,
} from '../adapters/excel/metricExtraction.js';
import {
  mergeLabelMapping,
  regionProfileSignature,
} from '../adapters/excel/sourceProfile.js';
import type { DetectedRegion, RegionLayout } from '../adapters/excel/regionLayout.js';
import type { RawCell } from '../adapters/excel/rawGrid.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isXlsx =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.originalname.toLowerCase().endsWith('.xlsx');
    if (!isXlsx) return cb(new Error('only .xlsx accepted'));
    return cb(null, true);
  },
});

export const ingestionRouter = Router();
ingestionRouter.use(authJwt);

function normalizeMetricKey(raw: unknown): string | null {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/[^a-z0-9_.]/g, '');
  return /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)?$/.test(key) ? key : null;
}

async function ensureMetricKey(
  client: PoolClient,
  companyId: string,
  metricKey: string,
  displayName: string,
) {
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
  if (rows.length > 0) return;

  await client.query(
    `
    insert into public.company_metric_definitions
      (company_id, metric_key, display_name, metric_kind, aggregation_method, unit_default)
    values
      ($1, $2, $3, 'flow', 'sum', 'count')
    on conflict (company_id, metric_key) do nothing
    `,
    [companyId, metricKey, displayName || metricKey],
  );
}

function dbRegionToDetected(row: {
  id: string;
  sheet_idx: number;
  sheet_name: string;
  bbox: string | null;
  layout: RegionLayout;
  raw_grid: RawCell[][];
}): DetectedRegion {
  const range = XLSX.utils.decode_range(row.bbox ?? row.layout.bbox);
  return {
    region_idx: 0,
    sheet_idx: row.sheet_idx,
    sheet_name: row.sheet_name,
    start_row: range.s.r,
    end_row: range.e.r,
    start_column: range.s.c,
    end_column: range.e.c,
    bbox: row.bbox ?? row.layout.bbox,
    layout: row.layout,
    raw_grid: row.raw_grid,
  };
}

function sameDecisionLocator(observation: MetricObservation, decisionLocator: any) {
  const locator = observation.decision_locator as any;
  if (!locator || !decisionLocator || locator.type !== decisionLocator.type) return false;
  if (locator.type === 'row') return locator.row_idx === decisionLocator.row_idx;
  if (locator.type === 'column') return locator.column_idx === decisionLocator.column_idx;
  if (locator.type === 'cell') return locator.cell_ref === decisionLocator.cell_ref;
  return JSON.stringify(locator) === JSON.stringify(decisionLocator);
}

ingestionRouter.post(
  '/excel/upload',
  requirePermission('data', 'write'),
  upload.single('file'),
  async (req, res) => {
    try {
      const auth = req.auth;
      if (!auth) {
        return res.status(401).json({ error: 'missing_auth_context' });
      }
      if (!auth.companyId) {
        return res.status(400).json({ error: 'no_company' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'no_file' });
      }

      const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      const sb = supabaseForUser(auth.jwt);

      const { data: source, error: sourceErr } = await sb
        .from('data_sources')
        .upsert(
          {
            company_id: auth.companyId,
            type: 'excel',
            name: 'Excel uploads',
            created_by: auth.userId,
          },
          { onConflict: 'company_id,type' },
        )
        .select('id')
        .single();

      if (sourceErr || !source) {
        return res.status(500).json({ error: 'source_upsert_failed' });
      }

      const { data: existingFile } = await sb
        .from('ingestion_files')
        .select('id')
        .eq('source_id', source.id)
        .eq('checksum', checksum)
        .maybeSingle();

      if (existingFile) {
        const { data: activeJob } = await sb
          .from('ingestion_jobs')
          .select('id, status')
          .eq('file_id', existingFile.id)
          .in('status', ['pending', 'running'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeJob) {
          return res.json({ jobId: activeJob.id, dedup: true });
        }

        const { data: currentRun } = await sb
          .from('extraction_runs')
          .select('job_id')
          .eq('file_id', existingFile.id)
          .eq('parser_version', EXCEL_INGESTION_VERSIONS.parser)
          .eq('taxonomy_version', EXCEL_INGESTION_VERSIONS.taxonomy)
          .eq('classifier_version', EXCEL_INGESTION_VERSIONS.classifier)
          .eq('prompt_version', EXCEL_INGESTION_VERSIONS.prompt)
          .eq('status', 'complete')
          .eq('is_current', true)
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (currentRun?.job_id) {
          return res.json({ jobId: currentRun.job_id, dedup: true, upToDate: true });
        }

        const { data: reprocessJob, error: reprocessErr } = await sb
          .from('ingestion_jobs')
          .insert({
            company_id: auth.companyId,
            file_id: existingFile.id,
            kind: 'normalize',
            payload: {
              reason: 'version_reprocess',
              versions: EXCEL_INGESTION_VERSIONS,
            },
          })
          .select('id')
          .single();

        if (reprocessErr || !reprocessJob) {
          return res.status(500).json({ error: 'reprocess_job_insert_failed' });
        }

        return res.json({ jobId: reprocessJob.id, dedup: true, reprocess: true });
      }

      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const storagePath = `${auth.companyId}/${yyyy}/${mm}/${crypto.randomUUID()}.xlsx`;

      const { error: storageErr } = await supabaseAdmin.storage
        .from('ingestion')
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });
      if (storageErr) {
        return res.status(500).json({ error: 'storage_upload_failed' });
      }

      const { data: file, error: fileErr } = await sb
        .from('ingestion_files')
        .insert({
          company_id: auth.companyId,
          source_id: source.id,
          storage_path: storagePath,
          checksum,
          byte_size: req.file.size,
          original_name: req.file.originalname,
          uploaded_by: auth.userId,
        })
        .select('id')
        .single();

      if (fileErr || !file) {
        return res.status(500).json({ error: 'file_insert_failed' });
      }

      const { data: job, error: jobErr } = await sb
        .from('ingestion_jobs')
        .insert({
          company_id: auth.companyId,
          file_id: file.id,
          kind: 'normalize',
        })
        .select('id')
        .single();

      if (jobErr || !job) {
        return res.status(500).json({ error: 'job_insert_failed' });
      }

      return res.json({ jobId: job.id, dedup: false });
    } catch (err) {
      console.error('[ingestion] upload failed', err);
      return res.status(500).json({ error: 'upload_unexpected_error' });
    }
  },
);

ingestionRouter.get('/jobs/:jobId', async (req, res) => {
  try {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: 'missing_auth_context' });
    }
    const sb = supabaseForUser(auth.jwt);

    const { data, error } = await sb
      .from('ingestion_jobs')
      .select('id,status,record_count,last_error,started_at,completed_at,created_at')
      .eq('id', req.params.jobId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'not_found' });
    }
    return res.json(data);
  } catch (err) {
    console.error('[ingestion] job status failed', err);
    return res.status(500).json({ error: 'job_status_unexpected_error' });
  }
});

ingestionRouter.get('/decisions/pending', async (req, res) => {
  try {
    const auth = req.auth;
    if (!auth?.companyId) {
      return res.status(400).json({ error: 'no_company' });
    }

    const requestedLimit = Number(req.query.limit ?? 25);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100)
      : 25;
    const { rows } = await pool.query<{
      id: string;
      run_id: string;
      source_label: string | null;
      proposed_key: string | null;
      final_key: string | null;
      confidence: string | number | null;
      stage: string;
      status: string;
      reasoning: string | null;
      source_locator: any;
      created_at: string;
      file_id: string;
      region_id: string;
      sheet_idx: number;
      sheet_name: string;
      bbox: string | null;
      layout: RegionLayout;
      raw_grid: RawCell[][];
      original_name: string | null;
      promoted_count: number;
    }>(
      `
      select
        ed.id,
        ed.run_id,
        ed.source_label,
        ed.proposed_key,
        ed.final_key,
        ed.confidence,
        ed.stage,
        ed.status,
        ed.reasoning,
        ed.source_locator,
        ed.created_at,
        er.file_id,
        er.region_id,
        re.sheet_idx,
        re.sheet_name,
        re.bbox,
        re.layout,
        re.raw_grid,
        f.original_name,
        (
          select count(*)
            from public.normalized_metrics nm
           where nm.decision_id = ed.id
             and nm.superseded_by is null
             and nm.superseded_by_metric_id is null
        )::int as promoted_count
      from public.extraction_decisions ed
      join public.extraction_runs er on er.id = ed.run_id
      join public.raw_extractions re on re.id = er.region_id
      join public.ingestion_files f on f.id = er.file_id
      where ed.company_id = $1
        and ed.status = 'pending_review'
      order by ed.created_at desc
      limit $2
      `,
      [auth.companyId, limit],
    );

    const decisions = rows.map((row) => {
      const { raw_grid, sheet_idx, ...publicRow } = row;
      let impactValueCount = 0;
      try {
        impactValueCount = countPromotableObservationsForLocator(
          dbRegionToDetected({
            id: row.region_id,
            sheet_idx,
            sheet_name: row.sheet_name,
            bbox: row.bbox,
            layout: row.layout,
            raw_grid,
          }),
          row.source_locator,
        );
      } catch (err) {
        console.warn('[ingestion] impact count failed', {
          decisionId: row.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return {
        ...publicRow,
        impact_value_count: impactValueCount,
      };
    });

    return res.json(decisions);
  } catch (err) {
    console.error('[ingestion] pending decisions failed', err);
    return res.status(500).json({ error: 'pending_decisions_unexpected_error' });
  }
});

ingestionRouter.get('/runs/:runId/decisions', async (req, res) => {
  try {
    const auth = req.auth;
    if (!auth?.companyId) {
      return res.status(400).json({ error: 'no_company' });
    }

    const { rows } = await pool.query(
      `
      select
        ed.id,
        ed.run_id,
        ed.source_label,
        ed.proposed_key,
        ed.final_key,
        ed.confidence,
        ed.stage,
        ed.status,
        ed.reasoning,
        ed.source_locator,
        ed.created_at,
        re.sheet_name,
        re.bbox,
        re.layout,
        f.original_name
      from public.extraction_decisions ed
      join public.extraction_runs er on er.id = ed.run_id
      join public.raw_extractions re on re.id = er.region_id
      join public.ingestion_files f on f.id = er.file_id
      where ed.company_id = $1
        and ed.run_id = $2
      order by ed.created_at desc
      `,
      [auth.companyId, req.params.runId],
    );

    return res.json(rows);
  } catch (err) {
    console.error('[ingestion] run decisions failed', err);
    return res.status(500).json({ error: 'run_decisions_unexpected_error' });
  }
});

ingestionRouter.post(
  '/decisions/:decisionId/override',
  requirePermission('data', 'write'),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const auth = req.auth;
      if (!auth?.companyId) {
        return res.status(400).json({ error: 'no_company' });
      }

      const action = String((req.body as any)?.action ?? 'override');
      if (!['accept', 'override', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'invalid_action' });
      }

      await client.query('begin');

      const { rows } = await client.query<{
        decision_id: string;
        company_id: string;
        run_id: string;
        source_label: string | null;
        proposed_key: string | null;
        source_locator: any;
        file_id: string;
        source_id: string;
        job_id: string;
        region_id: string;
        sheet_idx: number;
        sheet_name: string;
        bbox: string | null;
        layout: RegionLayout;
        raw_grid: RawCell[][];
      }>(
        `
        select
          ed.id as decision_id,
          ed.company_id,
          ed.run_id,
          ed.source_label,
          ed.proposed_key,
          ed.source_locator,
          er.file_id,
          f.source_id,
          er.job_id,
          er.region_id,
          re.sheet_idx,
          re.sheet_name,
          re.bbox,
          re.layout,
          re.raw_grid
        from public.extraction_decisions ed
        join public.extraction_runs er on er.id = ed.run_id
        join public.ingestion_files f on f.id = er.file_id
        join public.raw_extractions re on re.id = er.region_id
        where ed.id = $1
          and ed.company_id = $2
        for update of ed
        `,
        [req.params.decisionId, auth.companyId],
      );

      const decision = rows[0];
      if (!decision) {
        await client.query('rollback');
        return res.status(404).json({ error: 'decision_not_found' });
      }

      if (action === 'reject') {
        await client.query(
          `
          update public.extraction_decisions
             set status = 'rejected',
                 final_key = null,
                 overridden_by = $2,
                 overridden_at = now()
           where id = $1
          `,
          [decision.decision_id, auth.userId],
        );
        await client.query('commit');
        return res.json({ promoted: 0, status: 'rejected' });
      }

      const requestedKey = action === 'accept'
        ? decision.proposed_key
        : (req.body as any)?.finalKey;
      const finalKey = normalizeMetricKey(requestedKey);
      if (!finalKey) {
        await client.query('rollback');
        return res.status(400).json({ error: 'invalid_metric_key' });
      }

      await ensureMetricKey(client, auth.companyId, finalKey, decision.source_label ?? finalKey);

      const status = action === 'accept' ? 'accepted' : 'overridden';
      await client.query(
        `
        update public.extraction_decisions
           set status = $2,
               final_key = $3,
               overridden_by = $4,
               overridden_at = now()
         where id = $1
        `,
        [decision.decision_id, status, finalKey, auth.userId],
      );

      const region = dbRegionToDetected({
        id: decision.region_id,
        sheet_idx: decision.sheet_idx,
        sheet_name: decision.sheet_name,
        bbox: decision.bbox,
        layout: decision.layout,
        raw_grid: decision.raw_grid,
      });
      const observations = extractDictionaryObservations(region)
        .filter((observation) => sameDecisionLocator(observation, decision.source_locator))
        .map((observation) => ({
          ...observation,
          metric_key: finalKey,
          status: 'accepted' as const,
          confidence: action === 'accept' ? observation.confidence : 1,
          stage: action === 'accept' ? observation.stage : 'manual',
          reasoning: action === 'accept'
            ? observation.reasoning
            : `Manually mapped to "${finalKey}"`,
        }));

      const allRegionObservations = extractDictionaryObservations(region);
      const signature = regionProfileSignature(region, allRegionObservations);
      const { rows: profileRows } = await client.query<{ id: string; recipe: unknown }>(
        `
        select id, recipe
          from public.source_profiles
         where company_id = $1
           and signature = $2
         limit 1
        `,
        [auth.companyId, signature],
      );
      const profileRecipe = mergeLabelMapping(
        profileRows[0]?.recipe,
        decision.source_label ?? finalKey,
        finalKey,
        region.layout.layout_type,
      );

      const { rows: upsertedProfiles } = await client.query<{ id: string }>(
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
        [
          auth.companyId,
          signature,
          `${region.sheet_name} reviewed mappings`,
          JSON.stringify(profileRecipe),
        ],
      );
      const sourceProfileId = upsertedProfiles[0]?.id ?? profileRows[0]?.id ?? null;

      let promoted = 0;
      for (const observation of observations) {
        const metricId = await promoteObservation(
          client,
          { id: decision.job_id },
          {
            company_id: auth.companyId,
            source_id: decision.source_id,
          },
          decision.run_id,
          decision.decision_id,
          sourceProfileId,
          observation,
        );
        if (metricId) promoted += 1;
      }

      await client.query('commit');
      return res.json({ promoted, status, finalKey });
    } catch (err) {
      await client.query('rollback');
      console.error('[ingestion] decision override failed', err);
      return res.status(500).json({ error: 'decision_override_unexpected_error' });
    } finally {
      client.release();
    }
  },
);
