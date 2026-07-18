import { env } from '../config.js';
import { pool } from '../db.js';
import { log } from '../lib/logger.js';
import { handlers } from './handlers.js';
import { processOneReferenceCompanyJob } from './referenceCompanyTwin.js';
import {
  processOneMetaAdsJob,
  processOneMetaAdsRecalculationJob,
  refreshMetaAdsHealthFindings,
  scheduleDailyMetaAdsSyncs,
} from '../domains/meta-ads/service.js';
import {
  processOneMetaAdsCampaignJob,
  processOneMetaAdsCreativeJob,
} from '../domains/meta-ads/authoring.js';

const LOCK_MINUTES = 5;
const POLL_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pickOneJob() {
  const { rows } = await pool.query(
    `
    update public.ingestion_jobs
       set status = 'running',
           attempts = attempts + 1,
           started_at = coalesce(started_at, now()),
           locked_until = now() + ($2 || ' minutes')::interval,
           locked_by = $1
     where id = (
       select id
       from public.ingestion_jobs
        where (
          (status = 'pending' and (locked_until is null or locked_until < now()))
          or (status = 'running' and locked_until is not null and locked_until < now())
        )
        order by created_at
        for update skip locked
        limit 1
     )
     returning *;
    `,
    [env.WORKER_ID, String(LOCK_MINUTES)],
  );
  return rows[0] ?? null;
}

async function finishJobOk(jobId: string, recordCount: number) {
  await pool.query(
    `
    update public.ingestion_jobs
       set status = 'complete',
           record_count = $2,
           completed_at = now(),
           locked_until = null,
           locked_by = null
     where id = $1
    `,
    [jobId, recordCount],
  );
}

async function finishJobErr(job: Record<string, any>, err: Error) {
  const shouldRetry = job.attempts < job.max_attempts;
  const nextStatus = shouldRetry ? 'pending' : 'failed';
  const backoffMs = Math.min(30000, 2000 * 2 ** job.attempts);

  await pool.query(
    `
    update public.ingestion_jobs
       set status = $2,
           last_error = $3,
           locked_until = case
             when $2 = 'pending' then now() + interval '1 millisecond' * $4
             else null
           end,
           locked_by = null
     where id = $1
    `,
    [job.id, nextStatus, err.message.slice(0, 500), backoffMs],
  );
}

export function startWorker() {
  let running = true;
  let nextMetaScheduleCheck = 0;
  let nextMetaHealthCheck = 0;
  process.on('SIGINT', () => {
    running = false;
  });
  process.on('SIGTERM', () => {
    running = false;
  });

  // Detached loop. If a single iteration fails, the loop survives.
  (async () => {
    while (running) {
      try {
        if (Date.now() >= nextMetaScheduleCheck) {
          await scheduleDailyMetaAdsSyncs();
          nextMetaScheduleCheck = Date.now() + 60_000;
        }
        if (Date.now() >= nextMetaHealthCheck) {
          await refreshMetaAdsHealthFindings();
          nextMetaHealthCheck = Date.now() + 60 * 60_000;
        }
        const processedMetaRecalculation = await processOneMetaAdsRecalculationJob();
        if (processedMetaRecalculation) continue;
        const processedMetaCreativeJob = await processOneMetaAdsCreativeJob();
        if (processedMetaCreativeJob) continue;
        const processedMetaCampaignJob = await processOneMetaAdsCampaignJob();
        if (processedMetaCampaignJob) continue;
        const processedMetaJob = await processOneMetaAdsJob();
        if (processedMetaJob) continue;
        const job = await pickOneJob();
        if (!job) {
          const processedReferenceJob = await processOneReferenceCompanyJob();
          if (processedReferenceJob) continue;
          await sleep(POLL_MS);
          continue;
        }

        log.info({ jobId: job.id, kind: job.kind }, 'picked ingestion job');

        try {
          const handler = handlers[job.kind];
          if (!handler) {
            throw new Error(`missing_handler:${job.kind}`);
          }
          const recordCount = await handler(job);
          await finishJobOk(job.id, recordCount);
          log.info({ jobId: job.id, recordCount }, 'ingestion job complete');
        } catch (err: any) {
          await finishJobErr(job, err instanceof Error ? err : new Error(String(err)));
          log.error({ jobId: job.id, err: String(err) }, 'ingestion job failed');
        }
      } catch (err: any) {
        log.error({ err: String(err) }, 'worker loop iteration failed');
        await sleep(POLL_MS);
      }
    }
  })();
}
