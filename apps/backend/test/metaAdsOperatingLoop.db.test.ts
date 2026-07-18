import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool, supabaseAdmin } from '../src/db.js';
import { encrypt } from '../src/lib/crypto.js';
import {
  buildMetaAdsBrief,
  claimOneMetaAdsJob,
  enqueueMetaAdsSync,
  processOneMetaAdsRecalculationJob,
  recalculateMetaAdsFromStoredHistory,
  recordMetaAdsRunFailure,
  scheduleDailyMetaAdsSyncs,
} from '../src/domains/meta-ads/service.js';
import { setMetaConversionAction } from '../src/lib/metaMetricEngine.js';
import {
  applyMetaAdsExperiment,
  buildMetaAdsDecisionInbox,
  evaluateMeasuringMetaAdsExperiments,
  getMetaAdsExperiment,
  reconcileDetachedMetaAdsExperiments,
  reconcileRemovedMetaAdsExperimentOwners,
  startMetaAdsExperiment,
} from '../src/domains/meta-ads/decisionInbox.js';
import { prepareMetaAdsDeepSegments, processOneMetaAdsDeepSegment } from '../src/domains/meta-ads/deepSync.js';

const dbDescribe = process.env.META_ADS_DB_TESTS === '1' ? describe : describe.skip;

dbDescribe('Meta Ads operating loop database behavior', { concurrency: 1 }, () => {
  const suffix = randomUUID().slice(0, 8);
  let companyA = '';
  let companyB = '';
  let userId = '';
  let memberId = '';
  const sharedAccount = `act_meta_db_${suffix}`;

  async function createCompany(label: string) {
    const { rows } = await pool.query(
      `INSERT INTO public.companies
         (name,slug,stage,country,description,status,is_public,offset_3d)
       VALUES ($1,$2,'Seed','India','Disposable Meta Ads DB test','active',FALSE,'{"x":0,"y":0,"z":0}'::jsonb)
       RETURNING id`,
      [`Meta Ads DB ${label} ${suffix}`, `meta-ads-db-${label.toLowerCase()}-${suffix}`],
    );
    return String(rows[0].id);
  }

  async function connect(companyId: string, accountId: string, selectedAction = 'lead') {
    await pool.query(
      `INSERT INTO public.integration_connections
         (company_id,integration_id,account_name,sandbox_mode,access_token_enc,last_synced_at,metadata,connected_at)
       VALUES ($1,'int-meta',$2,TRUE,$3,NOW(),$4::jsonb,NOW())
       ON CONFLICT (company_id,integration_id) DO UPDATE SET
         account_name=EXCLUDED.account_name,access_token_enc=EXCLUDED.access_token_enc,
         last_synced_at=EXCLUDED.last_synced_at,metadata=EXCLUDED.metadata`,
      [companyId, `Meta Ads · ${accountId}`, encrypt('db-test-read-only-token'), JSON.stringify({
        ad_account_id: accountId,
        currency: 'USD',
        timezone: 'UTC',
        meta_conversion_action_type: selectedAction,
      })],
    );
  }

  async function clearRuns() {
    await pool.query(`DELETE FROM public.meta_ads_sync_runs WHERE company_id=ANY($1::uuid[])`, [[companyA, companyB]]);
  }

  before(async () => {
    companyA = await createCompany('A');
    companyB = await createCompany('B');
    await connect(companyA, sharedAccount);
    await connect(companyB, sharedAccount);
    const auth = await supabaseAdmin.auth.admin.createUser({
      email: `meta-ads-db+${suffix}@example.com`, password: `Meta-${suffix}-safe-123!`, email_confirm: true,
      user_metadata: { first_name: 'Meta', last_name: 'Analyst' },
    });
    if (auth.error || !auth.data.user) throw new Error(`failed_to_create_meta_test_user:${auth.error?.message ?? 'missing_user'}`);
    userId = auth.data.user.id;
    await pool.query(
      `INSERT INTO public.user_profiles (id,company_id,role,first_name,last_name,onboarding_completed)
       VALUES ($1,$2,'analyst','Meta','Analyst',TRUE)
       ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id,role=EXCLUDED.role,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name`,
      [userId, companyA],
    );
    const membership = await pool.query(
      `INSERT INTO public.company_members (company_id,user_id,role,status,approved_at)
       VALUES ($1,$2,'analyst','active',NOW()) RETURNING id`,
      [companyA, userId],
    );
    memberId = String(membership.rows[0].id);
  });

  after(async () => {
    if (companyA || companyB) {
      await pool.query(`DELETE FROM public.companies WHERE id=ANY($1::uuid[])`, [[companyA, companyB]]);
    }
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
    await pool.end();
  });

  test('manual jobs coalesce per company and remain tenant-isolated', async () => {
    await clearRuns();
    const first = await enqueueMetaAdsSync(companyA, 'manual');
    const duplicate = await enqueueMetaAdsSync(companyA, 'manual');
    const otherTenant = await enqueueMetaAdsSync(companyB, 'manual');
    assert.equal(duplicate.id, first.id);
    assert.notEqual(otherTenant.id, first.id);
    const { rows } = await pool.query(
      `SELECT company_id,count(*)::int AS count FROM public.meta_ads_sync_runs
        WHERE company_id=ANY($1::uuid[]) AND status IN ('pending','running') GROUP BY company_id`,
      [[companyA, companyB]],
    );
    assert.deepEqual(new Map(rows.map((row) => [String(row.company_id), Number(row.count)])), new Map([[companyA, 1], [companyB, 1]]));
  });

  test('daily scheduling starts at 01:30 UTC and creates one company-scoped run per day', async () => {
    await clearRuns();
    assert.equal(await scheduleDailyMetaAdsSyncs(new Date('2026-07-14T01:29:59Z'), companyA), 0);
    assert.equal(await scheduleDailyMetaAdsSyncs(new Date('2026-07-14T01:30:00Z'), companyA), 1);
    assert.equal(await scheduleDailyMetaAdsSyncs(new Date('2026-07-14T23:59:59Z'), companyA), 0);
    const { rows } = await pool.query(
      `SELECT company_id,reason,schedule_date::text FROM public.meta_ads_sync_runs WHERE company_id=ANY($1::uuid[])`,
      [[companyA, companyB]],
    );
    assert.deepEqual(rows, [{ company_id: companyA, reason: 'daily', schedule_date: '2026-07-14' }]);
  });

  test('development fixture connections are not scheduled or claimed by the live worker', async () => {
    await clearRuns();
    await pool.query(
      `UPDATE public.integration_connections
          SET metadata=metadata || '{"fixture_scenario":"healthy"}'::jsonb
        WHERE company_id=$1 AND integration_id='int-meta'`,
      [companyA],
    );
    await enqueueMetaAdsSync(companyA, 'manual');
    assert.equal(await claimOneMetaAdsJob(companyA), null);
    assert.equal(await scheduleDailyMetaAdsSyncs(new Date('2026-07-15T01:30:00Z'), companyA), 0);
    await clearRuns();
    await connect(companyA, sharedAccount);
  });

  test('job claiming locks once, recovers expired locks, and applies bounded retries', async () => {
    await clearRuns();
    const queued = await enqueueMetaAdsSync(companyA, 'manual');
    await pool.query(`UPDATE public.meta_ads_sync_runs SET max_attempts=2 WHERE id=$1`, [queued.id]);
    const firstClaim = await claimOneMetaAdsJob(companyA);
    assert.equal(String(firstClaim?.id), queued.id);
    assert.equal(await claimOneMetaAdsJob(companyA), null);

    await recordMetaAdsRunFailure(firstClaim!, new Error('network timeout'));
    let { rows } = await pool.query(`SELECT status,attempt,error_code,available_at>NOW() AS backed_off FROM public.meta_ads_sync_runs WHERE id=$1`, [queued.id]);
    assert.deepEqual(rows[0], { status: 'pending', attempt: 1, error_code: 'meta_temporarily_unavailable', backed_off: true });

    await pool.query(`UPDATE public.meta_ads_sync_runs SET available_at=NOW(),locked_until=NOW()-INTERVAL '1 second' WHERE id=$1`, [queued.id]);
    const secondClaim = await claimOneMetaAdsJob(companyA);
    assert.equal(String(secondClaim?.id), queued.id);
    assert.equal(Number(secondClaim?.attempt), 2);
    await recordMetaAdsRunFailure(secondClaim!, new Error('network timeout'));
    ({ rows } = await pool.query(`SELECT status,attempt,error_code FROM public.meta_ads_sync_runs WHERE id=$1`, [queued.id]));
    assert.deepEqual(rows[0], { status: 'failed', attempt: 2, error_code: 'meta_temporarily_unavailable' });
  });

  test('conversion changes coalesce and an expired worker lock resumes stored recalculation', async () => {
    await clearRuns();
    await connect(companyA, sharedAccount, 'lead');
    await pool.query(`DELETE FROM public.meta_ads_recalculation_jobs WHERE company_id=$1`, [companyA]);
    await pool.query(`DELETE FROM public.meta_ads_account_daily WHERE company_id=$1`, [companyA]);
    await pool.query(
      `INSERT INTO public.meta_ads_account_daily
         (company_id,ad_account_id,metric_date,account_name,currency,account_timezone,spend,impressions,clicks,ctr,cpc,purchase_roas,actions,action_values,ingested_at)
       SELECT $1,$2,d::date,'Recalculation account','USD','UTC',100,1000,100,10,1,3,
              '{"lead":10,"purchase":2}'::jsonb,'{"purchase":300}'::jsonb,NOW()
         FROM generate_series(CURRENT_DATE-13,CURRENT_DATE,INTERVAL '1 day') d`,
      [companyA, sharedAccount],
    );
    const staleFinding = await pool.query(
      `INSERT INTO public.meta_ads_findings
         (company_id,ad_account_id,fingerprint,kind,severity,scope,title,explanation,evidence,
          estimated_spend_exposure,action_kind,action_label,action_href,detection_count,active,episode)
       VALUES ($1,$2,$3,'missing_conversion_configuration','warning','integration','Choose a conversion event',
         'This alert must disappear as soon as a valid event is stored.','{}',100,'configure_conversion','Configure conversion event',
         '/twin/data?integration=int-meta',1,TRUE,1) RETURNING id`,
      [companyA, sharedAccount, `db-stale-conversion-${suffix}`],
    );

    await setMetaConversionAction(companyA, 'lead');
    const invalidated = await pool.query(`SELECT active,resolved_at IS NOT NULL AS resolved FROM public.meta_ads_findings WHERE id=$1`, [staleFinding.rows[0].id]);
    assert.deepEqual(invalidated.rows[0], { active: false, resolved: true });
    await setMetaConversionAction(companyA, 'purchase');
    let { rows } = await pool.query(
      `SELECT status,generation,selected_action FROM public.meta_ads_recalculation_jobs WHERE company_id=$1 AND ad_account_id=$2`,
      [companyA, sharedAccount],
    );
    assert.deepEqual(rows[0], { status: 'pending', generation: 2, selected_action: 'purchase' });

    await pool.query(
      `UPDATE public.meta_ads_recalculation_jobs
          SET status='running',locked_until=NOW()-INTERVAL '1 second',locked_by='crashed-worker'
        WHERE company_id=$1 AND ad_account_id=$2`,
      [companyA, sharedAccount],
    );
    assert.equal(await processOneMetaAdsRecalculationJob(companyA), true);
    ({ rows } = await pool.query(
      `SELECT status,generation,attempt,error_code FROM public.meta_ads_recalculation_jobs WHERE company_id=$1 AND ad_account_id=$2`,
      [companyA, sharedAccount],
    ));
    assert.deepEqual(rows[0], { status: 'complete', generation: 2, attempt: 1, error_code: null });
    const brief = await buildMetaAdsBrief(companyA);
    assert.equal(brief.selectedConversionAction, 'purchase');
    assert.equal(brief.summary.selectedConversions, 28);
    assert.equal(brief.summary.cpa, 50);
  });

  test('asynchronous deep reports resume from the persisted report id after a worker restart', async () => {
    await clearRuns();
    const { rows } = await pool.query(
      `INSERT INTO public.meta_ads_sync_runs
         (company_id,ad_account_id,reason,status,requested_at,started_at,core_completed_at,data_through,attempt,diagnostic_coverage)
       VALUES ($1,$2,'manual','running',NOW(),NOW(),NOW(),CURRENT_DATE-1,1,'preparing') RETURNING id`,
      [companyA, sharedAccount],
    );
    const runId = String(rows[0].id);
    const through = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await prepareMetaAdsDeepSegments({ runId, companyId: companyA, accountId: sharedAccount, dataThrough: through, initial: true });
    const originalFetch = globalThis.fetch;
    let creates = 0;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST') {
        creates += 1;
        return new Response(JSON.stringify({ report_run_id: 'persisted-report-id' }), { status: 200 });
      }
      if (url.includes('/persisted-report-id/insights')) {
        return new Response(JSON.stringify({ data: [{
          date_start: through, campaign_id: 'campaign-resume', campaign_name: 'Resume campaign',
          adset_id: 'adset-resume', adset_name: 'Resume audience', ad_id: 'ad-resume', ad_name: 'Resume creative',
          spend: '20', impressions: '1000', clicks: '20',
          ctr: '2', cpc: '1', cpm: '20', reach: '800', frequency: '1.25', outbound_clicks: [], actions: [], purchase_roas: [], action_values: [],
        }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'persisted-report-id', async_status: 'Job Completed', async_percent_completion: 100 }), { status: 200 });
    };
    try {
      const submitted = await processOneMetaAdsDeepSegment({ runId, companyId: companyA, accountId: sharedAccount, accessToken: 'read-token', timezone: 'UTC', currency: 'USD' });
      assert.equal(submitted.terminal, false);
      const persisted = await pool.query(`SELECT id,status,report_run_id,attempt FROM public.meta_ads_sync_segments WHERE run_id=$1 ORDER BY created_at LIMIT 1`, [runId]);
      const persistedSegmentId = String(persisted.rows[0].id);
      assert.deepEqual(
        { status: persisted.rows[0].status, report_run_id: persisted.rows[0].report_run_id, attempt: persisted.rows[0].attempt },
        { status: 'submitted', report_run_id: 'persisted-report-id', attempt: 1 },
      );
      await pool.query(`UPDATE public.meta_ads_sync_segments SET available_at=NOW() WHERE run_id=$1 AND report_run_id='persisted-report-id'`, [runId]);
      await processOneMetaAdsDeepSegment({ runId, companyId: companyA, accountId: sharedAccount, accessToken: 'read-token', timezone: 'UTC', currency: 'USD' });
      assert.equal(creates, 1);
      const completed = await pool.query(`SELECT status,report_run_id,error_code,error_message FROM public.meta_ads_sync_segments WHERE id=$1`, [persistedSegmentId]);
      assert.equal(completed.rows[0]?.status, 'complete', JSON.stringify(completed.rows[0]));
      const delivery = await pool.query(`SELECT count(*)::int AS count FROM public.meta_ads_delivery_daily WHERE company_id=$1 AND ad_account_id=$2 AND entity_id IN ('adset-resume','ad-resume')`, [companyA, sharedAccount]);
      assert.equal(delivery.rows[0].count, 1);
    } finally {
      globalThis.fetch = originalFetch;
      await pool.query(`DELETE FROM public.meta_ads_sync_runs WHERE id=$1`, [runId]);
    }
  });

  test('decision workflow is idempotent, tenant-isolated, measurable, and freezes its result', async () => {
    await clearRuns();
    await connect(companyA, sharedAccount, 'lead');
    await pool.query(`DELETE FROM public.meta_ads_account_daily WHERE company_id=$1`, [companyA]);
    await pool.query(`DELETE FROM public.meta_ads_delivery_daily WHERE company_id=$1`, [companyA]);
    await pool.query(`DELETE FROM public.meta_ads_findings WHERE company_id=$1`, [companyA]);
    await pool.query(
      `INSERT INTO public.meta_ads_account_daily
         (company_id,ad_account_id,metric_date,account_name,currency,account_timezone,spend,impressions,clicks,ctr,cpc,purchase_roas,actions,action_values,ingested_at)
       SELECT $1,$2,d::date,'Decision Inbox account','USD','UTC',100,1000,20,2,5,2,'{"lead":10,"purchase":3}'::jsonb,'{}'::jsonb,NOW()
         FROM generate_series(CURRENT_DATE-30,CURRENT_DATE-1,INTERVAL '1 day') d`,
      [companyA, sharedAccount],
    );
    await pool.query(
      `INSERT INTO public.meta_ads_delivery_daily
         (company_id,ad_account_id,level,entity_id,metric_date,entity_name,entity_status,campaign_id,campaign_name,
          adset_id,adset_name,currency,account_timezone,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,
          outbound_clicks,landing_page_views,purchase_roas,actions,action_values,ingested_at)
       SELECT $1,$2,'adset','adset-decision',d::date,'Decision audience','ACTIVE','campaign-decision','Decision campaign',
              'adset-decision','Decision audience','USD','UTC',100,1000,20,2,5,100,800,1.25,18,16,2,
              '{"lead":10,"purchase":3}'::jsonb,'{}'::jsonb,NOW()
         FROM generate_series(CURRENT_DATE-30,CURRENT_DATE-1,INTERVAL '1 day') d`,
      [companyA, sharedAccount],
    );
    const diagnosis = {
      kind: 'ad_response_decline', summary: 'The ad lost response.', likelyDriver: 'The ad is the strongest observed driver.', confidence: 'high',
      affectedObject: { scope: 'ad', id: 'ad-decision', name: 'Decision creative', campaignId: 'campaign-decision', campaignName: 'Decision campaign', adsetId: 'adset-decision', adsetName: 'Decision audience' },
      evidence: { currentCtr: 1.5, previousCtr: 2.5 },
    };
    const recommendation = {
      kind: 'rotate_creative', hypothesis: 'A controlled creative rotation should recover response.', change: 'Rotate one creative.',
      keepConstant: ['Ad-set audience', 'Placements', 'Ad-set budget'], primaryMetric: 'ctr', primaryDirection: 'higher', guardrailMetric: 'cpc',
      measurementScope: 'adset', measurementScopeId: 'adset-decision', measurementScopeName: 'Decision audience',
      adsManagerUrl: 'https://www.facebook.com/adsmanager/manage/campaigns?act=1&selected_ad_ids=ad-decision',
    };
    const finding = await pool.query(
      `INSERT INTO public.meta_ads_findings
         (company_id,ad_account_id,fingerprint,kind,severity,scope,scope_id,title,explanation,period_start,period_end,
          evidence,estimated_spend_exposure,action_kind,action_label,action_href,detection_count,active,episode,episode_started_at,
          diagnosis,recommendation,confidence)
       VALUES ($1,$2,'db-ad-response','ad_response_decline','warning','ad','ad-decision','Decision creative is losing response',
         'CTR fell across two complete windows.',CURRENT_DATE-7,CURRENT_DATE-1,'{"currentCtr":1.5,"previousCtr":2.5}',700,
         'open_ads_manager','Open ad','https://www.facebook.com/adsmanager',2,TRUE,1,NOW(),$3::jsonb,$4::jsonb,'high') RETURNING id`,
      [companyA, sharedAccount, JSON.stringify(diagnosis), JSON.stringify(recommendation)],
    );
    const due = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const input = { companyId: companyA, userId, findingId: String(finding.rows[0].id), ownerMemberId: memberId, dueDate: due, idempotencyKey: `start-${suffix}` };
    const started = await startMetaAdsExperiment(input);
    const repeated = await startMetaAdsExperiment(input);
    assert.equal(repeated.id, started.id);
    await pool.query(
      `INSERT INTO public.meta_ads_account_daily
         (company_id,ad_account_id,metric_date,account_name,currency,account_timezone,spend,impressions,clicks,ctr,cpc,purchase_roas,actions,action_values)
       VALUES ($1,$2,CURRENT_DATE-1,'Other tenant','USD','UTC',10,100,2,2,5,1,'{"lead":1,"purchase":1}','{}')
       ON CONFLICT (company_id,ad_account_id,metric_date) DO NOTHING`,
      [companyB, sharedAccount],
    );
    await assert.rejects(
      () => startMetaAdsExperiment({ ...input, companyId: companyB, idempotencyKey: `tenant-${suffix}` }),
      /finding_not_found/,
    );

    const applied = await applyMetaAdsExperiment({
      companyId: companyA, userId, experimentId: started.id, implementationNote: 'Rotated one creative and kept audience, placements and budget unchanged.',
      confirmedRecommendedChange: true, keptBudgetConstant: true, idempotencyKey: `apply-${suffix}`,
    });
    assert.equal(applied.status, 'measuring');
    assert.equal(applied.baseline7?.ctr, 2);
    assert.equal(applied.baseline14?.selectedConversions, 140);

    await pool.query(
      `UPDATE public.meta_ads_delivery_daily SET clicks=30,ctr=3,cpc=3.333333
        WHERE company_id=$1 AND ad_account_id=$2 AND level='adset' AND entity_id='adset-decision'
          AND metric_date BETWEEN CURRENT_DATE-7 AND CURRENT_DATE-1`,
      [companyA, sharedAccount],
    );
    await pool.query(
      `UPDATE public.meta_ads_experiments SET applied_local_date=CURRENT_DATE-8,evaluation_start=CURRENT_DATE-7,
              evaluation_due_7=CURRENT_DATE-1,evaluation_due_14=CURRENT_DATE+6,evaluation_days=7 WHERE id=$1`,
      [started.id],
    );
    const through = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await evaluateMeasuringMetaAdsExperiments(companyA, sharedAccount, through);
    const completed = await getMetaAdsExperiment(companyA, started.id);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.outcome, 'improved');
    assert.equal(completed.resultMetrics?.ctr, 3);
    assert.deepEqual(completed.events?.map((event) => event.type), ['started', 'applied', 'evaluated']);

    await pool.query(
      `UPDATE public.meta_ads_delivery_daily SET clicks=5,ctr=0.5
        WHERE company_id=$1 AND ad_account_id=$2 AND level='adset' AND entity_id='adset-decision' AND metric_date=CURRENT_DATE-1`,
      [companyA, sharedAccount],
    );
    const frozen = await getMetaAdsExperiment(companyA, started.id);
    assert.equal(frozen.resultMetrics?.ctr, 3);

    await pool.query(`UPDATE public.meta_ads_findings SET active=FALSE,resolved_at=NOW() WHERE id=$1`, [finding.rows[0].id]);
    await pool.query(`UPDATE public.meta_ads_findings SET active=TRUE,episode=2,resolved_at=NULL WHERE id=$1`, [finding.rows[0].id]);
    const reopened = await buildMetaAdsDecisionInbox(companyA);
    assert.equal(reopened.findings.some((item) => item.id === String(finding.rows[0].id) && item.episode === 2), true);

    const measuringBeforeSwitch = await startMetaAdsExperiment({
      ...input,
      idempotencyKey: `switch-measuring-start-${suffix}`,
    });
    await applyMetaAdsExperiment({
      companyId: companyA,
      userId,
      experimentId: measuringBeforeSwitch.id,
      implementationNote: 'Applied the second controlled creative rotation before changing accounts.',
      confirmedRecommendedChange: true,
      keptBudgetConstant: true,
      idempotencyKey: `switch-measuring-apply-${suffix}`,
    });
    const plannedFinding = await pool.query(
      `INSERT INTO public.meta_ads_findings
         (company_id,ad_account_id,fingerprint,kind,severity,scope,scope_id,title,explanation,period_start,period_end,
          evidence,estimated_spend_exposure,action_kind,action_label,action_href,detection_count,active,episode,episode_started_at,
          diagnosis,recommendation,confidence)
       VALUES ($1,$2,$3,'ad_response_decline','warning','ad','ad-planned-switch','A second creative is losing response',
         'CTR fell across two complete windows.',CURRENT_DATE-7,CURRENT_DATE-1,'{"currentCtr":1.4,"previousCtr":2.4}',500,
         'open_ads_manager','Open ad','https://www.facebook.com/adsmanager',2,TRUE,1,NOW(),$4::jsonb,$5::jsonb,'high') RETURNING id`,
      [companyA, sharedAccount, `db-planned-switch-${suffix}`, JSON.stringify({
        ...diagnosis,
        affectedObject: { ...diagnosis.affectedObject, id: 'ad-planned-switch', name: 'Planned switch creative' },
      }), JSON.stringify(recommendation)],
    );
    const plannedBeforeSwitch = await startMetaAdsExperiment({
      companyId: companyA,
      userId,
      findingId: String(plannedFinding.rows[0].id),
      ownerMemberId: memberId,
      dueDate: due,
      idempotencyKey: `switch-planned-start-${suffix}`,
    });

    await pool.query(`UPDATE public.company_members SET status='removed' WHERE id=$1`, [memberId]);
    assert.equal(await reconcileRemovedMetaAdsExperimentOwners(companyA), 2);
    assert.equal((await getMetaAdsExperiment(companyA, plannedBeforeSwitch.id)).owner.missing, true);
    await pool.query(`UPDATE public.company_members SET status='active' WHERE id=$1`, [memberId]);

    const replacementAccount = `act_meta_replacement_${suffix}`;
    await pool.query(
      `UPDATE public.integration_connections SET metadata=metadata || jsonb_build_object('ad_account_id',$2::text)
        WHERE company_id=$1 AND integration_id='int-meta'`,
      [companyA, replacementAccount],
    );
    await reconcileDetachedMetaAdsExperiments(companyA, replacementAccount);
    const detachedMeasuring = await getMetaAdsExperiment(companyA, measuringBeforeSwitch.id);
    const detachedPlanned = await getMetaAdsExperiment(companyA, plannedBeforeSwitch.id);
    assert.equal(detachedMeasuring.status, 'completed');
    assert.equal(detachedMeasuring.outcome, 'inconclusive');
    assert.equal(detachedMeasuring.formerAccount, true);
    assert.equal(detachedPlanned.status, 'cancelled');
    assert.equal(detachedPlanned.cancelReason, 'account_changed');
    assert.equal(detachedPlanned.formerAccount, true);
  });

  test('account switching never mixes history and conversion selection recalculates stored rows', async () => {
    await clearRuns();
    const oldAccount = `act_meta_old_${suffix}`;
    const currentAccount = `act_meta_current_${suffix}`;
    const date = '2026-07-13';
    await pool.query(`DELETE FROM public.meta_ads_account_daily WHERE company_id=ANY($1::uuid[])`, [[companyA, companyB]]);
    await pool.query(
      `INSERT INTO public.meta_ads_account_daily
         (company_id,ad_account_id,metric_date,account_name,currency,account_timezone,spend,impressions,clicks,ctr,cpc,purchase_roas,actions,action_values,ingested_at)
       VALUES
         ($1,$2,$4,'Old account','USD','UTC',900,9000,900,10,1,1,'{"lead":90,"purchase":9}','{}',NOW()-INTERVAL '1 hour'),
         ($1,$3,$4,'Current account','USD','UTC',100,1000,100,10,1,3,'{"lead":10,"purchase":2}','{"purchase":300}',NOW()),
         ($5,$3,$4,'Other tenant','USD','UTC',999,9999,999,10,1,9,'{"lead":999,"purchase":99}','{}',NOW())`,
      [companyA, oldAccount, currentAccount, date, companyB],
    );
    await connect(companyA, currentAccount, 'lead');
    await connect(companyB, currentAccount, 'lead');

    const leadBrief = await buildMetaAdsBrief(companyA);
    assert.equal(leadBrief.connection.accountId, currentAccount);
    assert.equal(leadBrief.summary.spend, 100);
    assert.equal(leadBrief.summary.selectedConversions, 10);
    const before = await pool.query(
      `SELECT ingested_at FROM public.meta_ads_account_daily WHERE company_id=$1 AND ad_account_id=$2 AND metric_date=$3`,
      [companyA, currentAccount, date],
    );

    await pool.query(
      `UPDATE public.integration_connections SET metadata=metadata || '{"meta_conversion_action_type":"purchase"}'::jsonb
        WHERE company_id=$1 AND integration_id='int-meta'`,
      [companyA],
    );
    const purchaseBrief = await recalculateMetaAdsFromStoredHistory(companyA);
    assert.equal('summary' in purchaseBrief, true);
    if (!('summary' in purchaseBrief)) throw new Error('expected stored brief');
    assert.equal(purchaseBrief.summary.selectedConversions, 2);
    assert.equal(purchaseBrief.summary.cpa, 50);
    const after = await pool.query(
      `SELECT ingested_at FROM public.meta_ads_account_daily WHERE company_id=$1 AND ad_account_id=$2 AND metric_date=$3`,
      [companyA, currentAccount, date],
    );
    assert.equal(new Date(after.rows[0].ingested_at).toISOString(), new Date(before.rows[0].ingested_at).toISOString());

    await pool.query(`DELETE FROM public.integration_connections WHERE company_id=$1 AND integration_id='int-meta'`, [companyA]);
    const historical = await buildMetaAdsBrief(companyA);
    assert.equal(historical.connection.state, 'historical');
    assert.equal(historical.connection.accountId, currentAccount);
    assert.equal(historical.summary.spend, 100);
  });
});
