import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getMetaAdAccount } from '../src/adapters/metaAds.js';
import { getMetaAuthoringPrerequisites } from '../src/adapters/metaAdsAuthoring.js';
import { pool } from '../src/db.js';
import { encrypt } from '../src/lib/crypto.js';
import { buildMetaAdsBrief, enqueueInitialMetaAdsBackfill, processOneMetaAdsJob } from '../src/domains/meta-ads/service.js';

const liveDescribe = process.env.META_SANDBOX_LIVE_TESTS === '1' ? describe : describe.skip;
const authoringLiveTest = process.env.META_SANDBOX_AUTHORING_LIVE_TESTS === '1' ? test : test.skip;

liveDescribe('real Meta sandbox read-only acceptance', { concurrency: 1 }, () => {
  const token = process.env.META_SANDBOX_ACCESS_TOKEN ?? '';
  const accountId = process.env.META_SANDBOX_AD_ACCOUNT_ID ?? '';
  const suffix = randomUUID().slice(0, 8);
  let companyId = '';

  before(async () => {
    assert.ok(token, 'META_SANDBOX_ACCESS_TOKEN is required');
    assert.ok(accountId, 'META_SANDBOX_AD_ACCOUNT_ID is required');
    const account = await getMetaAdAccount(token, accountId);
    assert.equal(account.id, accountId);
    const { rows } = await pool.query(
      `INSERT INTO public.companies
         (name,slug,stage,country,description,status,is_public,offset_3d)
       VALUES ($1,$2,'Seed','India','Disposable real Meta sandbox acceptance','active',FALSE,'{"x":0,"y":0,"z":0}'::jsonb)
       RETURNING id`,
      [`Meta Sandbox Live ${suffix}`, `meta-sandbox-live-${suffix}`],
    );
    companyId = String(rows[0].id);
    await pool.query(
      `INSERT INTO public.integration_connections
         (company_id,integration_id,account_name,sandbox_mode,access_token_enc,last_synced_at,metadata,connected_at)
       VALUES ($1,'int-meta',$2,TRUE,$3,NULL,$4::jsonb,NOW())`,
      [companyId, `Meta Ads · ${account.name} (sandbox)`, encrypt(token), JSON.stringify({
        ad_account_id: account.id,
        currency: account.currency,
        timezone: account.timezone ?? 'UTC',
        meta_conversion_action_type: 'purchase',
      })],
    );
  });

  after(async () => {
    if (companyId) await pool.query(`DELETE FROM public.companies WHERE id=$1`, [companyId]);
    await pool.end();
  });

  test('discovers the sandbox account, stores 90-day core history, and starts a resumable deep report', async () => {
    const queued = await enqueueInitialMetaAdsBackfill(companyId);
    assert.equal(queued.status, 'pending');
    assert.equal(await processOneMetaAdsJob(companyId), true);
    const { rows: runs } = await pool.query(`SELECT status,error_code,data_through,core_completed_at FROM public.meta_ads_sync_runs WHERE id=$1`, [queued.id]);
    assert.equal(runs[0]?.status, 'pending', runs[0]?.error_code ?? 'sandbox core job did not complete');
    assert.ok(runs[0]?.core_completed_at);
    assert.ok(runs[0]?.data_through);

    assert.equal(await processOneMetaAdsJob(companyId), true);
    const { rows: segments } = await pool.query(
      `SELECT status,report_run_id FROM public.meta_ads_sync_segments WHERE run_id=$1 ORDER BY created_at`,
      [queued.id],
    );
    assert.equal(segments.length, 6);
    assert.ok(segments.some((segment) => segment.status === 'submitted' && segment.report_run_id));

    const { rows: history } = await pool.query(
      `SELECT count(*)::int AS days,MIN(metric_date)::text AS first_day,MAX(metric_date)::text AS last_day
         FROM public.meta_ads_account_daily WHERE company_id=$1 AND ad_account_id=$2`,
      [companyId, accountId],
    );
    assert.equal(history[0]?.days, 90);
    assert.ok(history[0]?.first_day);
    assert.ok(history[0]?.last_day);

    const brief = await buildMetaAdsBrief(companyId);
    assert.equal(brief.connection.accountId, accountId);
    assert.ok(brief.connection.timezone);
    assert.ok(brief.connection.dataThrough);
    assert.ok(['backfilling', 'refreshing', 'no_spend', 'healthy'].includes(brief.connection.state));
    assert.ok(brief.summary.spend >= 0);
  });

  authoringLiveTest('verifies the authoring account and Page identity prerequisites without mutating Meta', async () => {
    const prerequisites = await getMetaAuthoringPrerequisites(token, accountId);
    assert.equal(prerequisites.account.id, accountId);
    assert.equal(prerequisites.account.accountStatus, 1);
    assert.ok(prerequisites.account.currency);
    assert.ok(prerequisites.account.timezone);
    assert.ok(prerequisites.pages.length > 0, 'The Meta sandbox token must have access to at least one test Page before paused publication can be tested.');
  });
});
