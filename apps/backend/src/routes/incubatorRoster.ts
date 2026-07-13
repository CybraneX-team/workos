import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { authJwt } from '../middleware/authJwt.js';
import { requireIncubator } from '../middleware/requireIncubator.js';
import { supabaseAdmin, supabaseForUser } from '../db.js';
import { TRACKABLE_METRIC_COLUMNS, mapRosterStageToEnum, type RosterRow } from '../adapters/excel/rosterExtraction.js';

export const incubatorRosterRouter = Router();
incubatorRosterRouter.use(authJwt, requireIncubator);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ok = name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
    if (!ok) return cb(new Error('only .xlsx, .xls, or .csv accepted'));
    return cb(null, true);
  },
});

function toSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') +
    '-' +
    Math.random().toString(36).slice(2, 6)
  );
}

incubatorRosterRouter.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const auth = req.auth!;
    const incubatorId = req.incubator!.id;
    if (!req.file) {
      return res.status(400).json({ error: 'no_file' });
    }

    const sb = supabaseForUser(auth.jwt);

    const { data: source, error: sourceErr } = await sb
      .from('data_sources')
      .upsert(
        {
          incubator_id: incubatorId,
          type: 'roster',
          name: 'Incubator roster uploads',
          created_by: auth.userId,
        },
        { onConflict: 'incubator_id,type' },
      )
      .select('id')
      .single();

    if (sourceErr || !source) {
      console.error('[incubatorRoster] source upsert failed', sourceErr);
      return res.status(500).json({ error: 'source_upsert_failed' });
    }

    const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    // ingestion_files has a pre-existing UNIQUE(source_id, checksum) constraint
    // (from the original company-metrics upload flow) — re-uploading identical
    // file content would otherwise 500 on that constraint. Reuse the existing
    // file + its most recent job instead of re-inserting/re-uploading to storage.
    const { data: existingFile, error: existingFileErr } = await sb
      .from('ingestion_files')
      .select('id')
      .eq('source_id', source.id)
      .eq('checksum', checksum)
      .maybeSingle();
    if (existingFileErr) {
      console.error('[incubatorRoster] existing file lookup failed', existingFileErr);
      return res.status(500).json({ error: 'existing_file_lookup_failed' });
    }

    if (existingFile) {
      const { data: existingJob, error: existingJobErr } = await sb
        .from('ingestion_jobs')
        .select('id, status')
        .eq('file_id', existingFile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingJobErr) {
        console.error('[incubatorRoster] existing job lookup failed', existingJobErr);
        return res.status(500).json({ error: 'existing_job_lookup_failed' });
      }
      // Reuse the existing job unless it's a dead end (failed) — otherwise a
      // permanently-failed job for this exact file content would be returned
      // forever with no way to retry.
      if (existingJob && existingJob.status !== 'failed') {
        return res.json({ jobId: existingJob.id, dedup: true });
      }

      const { data: job, error: jobErr } = await sb
        .from('ingestion_jobs')
        .insert({ incubator_id: incubatorId, file_id: existingFile.id, kind: 'roster' })
        .select('id')
        .single();
      if (jobErr || !job) {
        console.error('[incubatorRoster] job insert failed (dedup path)', jobErr);
        return res.status(500).json({ error: 'job_insert_failed' });
      }
      return res.json({ jobId: job.id, dedup: true, retried: !!existingJob });
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ext = req.file.originalname.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
    const storagePath = `incubator/${incubatorId}/${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;

    const { error: storageErr } = await supabaseAdmin.storage
      .from('ingestion')
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });
    if (storageErr) {
      console.error('[incubatorRoster] storage upload failed', storageErr);
      return res.status(500).json({ error: 'storage_upload_failed' });
    }

    const { data: file, error: fileErr } = await sb
      .from('ingestion_files')
      .insert({
        incubator_id: incubatorId,
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
      console.error('[incubatorRoster] file insert failed', fileErr);
      return res.status(500).json({ error: 'file_insert_failed' });
    }

    const { data: job, error: jobErr } = await sb
      .from('ingestion_jobs')
      .insert({
        incubator_id: incubatorId,
        file_id: file.id,
        kind: 'roster',
      })
      .select('id')
      .single();

    if (jobErr || !job) {
      console.error('[incubatorRoster] job insert failed', jobErr);
      return res.status(500).json({ error: 'job_insert_failed' });
    }

    return res.json({ jobId: job.id, dedup: false });
  } catch (err) {
    console.error('[incubatorRoster] upload failed', err);
    return res.status(500).json({ error: 'upload_unexpected_error' });
  }
});

incubatorRosterRouter.get('/jobs/:jobId', async (req, res) => {
  try {
    const auth = req.auth!;
    const sb = supabaseForUser(auth.jwt);

    const { data, error } = await sb
      .from('ingestion_jobs')
      .select('id,status,record_count,last_error,payload,started_at,completed_at,created_at,incubator_id')
      .eq('id', req.params.jobId)
      .single();

    if (error || !data || data.incubator_id !== req.incubator!.id) {
      return res.status(404).json({ error: 'not_found' });
    }

    const { payload, ...rest } = data as Record<string, any>;
    return res.json({
      ...rest,
      rosterStaging: payload?.roster_staging ?? null,
    });
  } catch (err) {
    console.error('[incubatorRoster] job status failed', err);
    return res.status(500).json({ error: 'job_status_unexpected_error' });
  }
});

interface CommitRowInput extends Partial<RosterRow> {
  name: string;
}

incubatorRosterRouter.post('/:jobId/commit', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    const auth = req.auth!;
    const sb = supabaseForUser(auth.jwt);

    const { data: job, error: jobErr } = await sb
      .from('ingestion_jobs')
      .select('id,status,payload,incubator_id')
      .eq('id', req.params.jobId)
      .single();

    if (jobErr || !job || job.incubator_id !== incubatorId) {
      return res.status(404).json({ error: 'job_not_found' });
    }
    if (job.status !== 'complete') {
      return res.status(400).json({ error: 'job_not_complete', status: job.status });
    }

    const body = (req.body ?? {}) as { cohortId?: string; rows?: CommitRowInput[] };
    const rosterStaging = (job.payload as any)?.roster_staging;
    const sourceRows: CommitRowInput[] = Array.isArray(body.rows)
      ? body.rows
      : (rosterStaging?.rows ?? []);

    if (sourceRows.length === 0) {
      return res.status(400).json({ error: 'no_rows_to_commit' });
    }

    let cohortId: string | null = null;
    if (body.cohortId) {
      const { data: cohort, error: cohortErr } = await supabaseAdmin
        .from('cohorts')
        .select('id')
        .eq('id', body.cohortId)
        .eq('incubator_id', incubatorId)
        .maybeSingle();
      if (cohortErr || !cohort) {
        return res.status(400).json({ error: 'invalid_cohort' });
      }
      cohortId = cohort.id;
    }

    const { data: existingCompanies, error: existingErr } = await supabaseAdmin
      .from('companies')
      .select('name')
      .eq('managed_by_incubator_id', incubatorId);
    if (existingErr) {
      console.error('[incubatorRoster] existing lookup failed', existingErr);
      return res.status(500).json({ error: 'existing_lookup_failed' });
    }
    const existingNames = new Set((existingCompanies ?? []).map((c) => c.name.trim().toLowerCase()));

    const { data: industryRows } = await supabaseAdmin.from('industries').select('id,label');
    const industryByLabel = new Map(
      (industryRows ?? []).map((row: any) => [String(row.label ?? '').toLowerCase(), row.id]),
    );

    let imported = 0;
    let missingName = 0;
    let duplicatesSkipped = 0;
    const companyIds: string[] = [];

    for (const row of sourceRows) {
      const name = (row.name ?? '').trim();
      if (!name) {
        missingName += 1;
        continue;
      }
      if (existingNames.has(name.toLowerCase())) {
        duplicatesSkipped += 1;
        continue;
      }

      const insertRow: Record<string, unknown> = {
        name,
        slug: toSlug(name),
        kind: 'provisional',
        managed_by_incubator_id: incubatorId,
        source: 'incubator_roster',
      };
      // companies.stage is a funding-round enum (company_stage); roster stages
      // are product-maturity labels ("Idea Stage", "MVP in Market", ...). Store
      // the incubator's exact wording in the free-text stage_label, and map to
      // the nearest enum value for stage. mapRosterStageToEnum always resolves
      // to a real value — 'Others' when there's no confident match — so the
      // insert never silently falls back to the column's DEFAULT 'Seed'.
      const rawStage = (row.stage ?? '').trim();
      if (rawStage) {
        insertRow.stage_label = rawStage;
        insertRow.stage = mapRosterStageToEnum(rawStage).value;
      }
      if (row.country) insertRow.country = row.country;
      if (row.foundedYear) insertRow.founded_year = row.foundedYear;
      if (row.website) insertRow.website = row.website;
      if (row.sector) {
        // Preserve the incubator's own sector label as free text; the global
        // industries taxonomy rarely covers it. industry_id stays a best-effort
        // catalog link on top of the raw value rather than a gate that drops it.
        insertRow.sector = row.sector.trim();
        const industryId = industryByLabel.get(row.sector.toLowerCase());
        if (industryId) insertRow.industry_id = industryId;
      }
      if (row.contactEmail) insertRow.roster_contact_email = row.contactEmail;
      if (row.contactName) insertRow.roster_contact_name = row.contactName;

      // Recognized seed metrics (ARR, headcount, burn, ...) are also written
      // onto their matching companies column, not just metric_snapshots —
      // otherwise roster-seeded numbers wouldn't show up in the portfolio
      // list, dashboard aggregate MRR, or cohort goal tracking, all of which
      // read companies' own columns rather than metric_snapshots.
      if (row.seedMetrics) {
        for (const [key, value] of Object.entries(row.seedMetrics)) {
          const column = TRACKABLE_METRIC_COLUMNS[key.toLowerCase()];
          if (column && insertRow[column] === undefined) insertRow[column] = value;
        }
      }

      const { data: company, error: companyErr } = await supabaseAdmin
        .from('companies')
        .insert(insertRow)
        .select('id')
        .single();

      if (companyErr || !company) {
        console.error('[incubatorRoster] company insert failed', companyErr, { name });
        continue;
      }

      existingNames.add(name.toLowerCase());
      companyIds.push(company.id);
      imported += 1;

      if (row.seedMetrics && Object.keys(row.seedMetrics).length > 0) {
        const { error: metricErr } = await supabaseAdmin.from('metric_snapshots').insert({
          company_id: company.id,
          integration_id: 'incubator_roster',
          metrics: row.seedMetrics,
        });
        if (metricErr) {
          console.error('[incubatorRoster] metric snapshot insert failed', metricErr, { companyId: company.id });
        }
      }

      if (cohortId) {
        const { error: memberErr } = await supabaseAdmin.from('cohort_members').insert({
          cohort_id: cohortId,
          company_id: company.id,
        });
        if (memberErr) {
          console.error('[incubatorRoster] cohort member insert failed', memberErr, { companyId: company.id });
        }
      }
    }

    return res.json({
      imported,
      missingName,
      duplicatesSkipped,
      companyIds,
    });
  } catch (err) {
    console.error('[incubatorRoster] commit failed', err);
    return res.status(500).json({ error: 'commit_unexpected_error' });
  }
});
