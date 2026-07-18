import { pool } from '../src/db.js';
import { encrypt } from '../src/lib/crypto.js';
import { recalculateMetaAdsFromStoredHistory } from '../src/domains/meta-ads/service.js';
import {
  applyMetaAdsExperiment,
  evaluateMeasuringMetaAdsExperiments,
  startMetaAdsExperiment,
} from '../src/domains/meta-ads/decisionInbox.js';

const scenarios = new Set([
  'disconnected',
  'backfilling',
  'healthy',
  'no-spend',
  'missing-conversion',
  'deteriorating',
  'refreshing',
  'stale',
  'failed-sync',
  'historical',
  'ad-response-decline',
  'conversion-outlier',
  'landing-page-loss',
  'planned-experiment',
  'overdue-experiment',
  'measuring-experiment',
  'improved',
  'worsened',
  'no-clear-change',
  'day-7-low-volume',
  'day-14-inconclusive',
]);
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const companyId = args.get('company-id') ?? '';
const scenario = args.get('scenario') ?? 'healthy';
const execute = args.get('execute') === 'true';
const accountId = args.get('account-id') ?? 'act_workos_fixture_demo';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (process.env.NODE_ENV === 'production') throw new Error('fixture_seeding_disabled_in_production');
if (!uuid.test(companyId)) throw new Error('Pass --company-id=<uuid>.');
if (!scenarios.has(scenario)) throw new Error(`Unknown scenario "${scenario}". Use: ${[...scenarios].join(', ')}.`);

console.log(JSON.stringify({
  dryRun: !execute,
  companyId,
  accountId,
  scenario,
  warning: 'Execution replaces the current Meta connection for this development company with a deterministic fixture connection.',
}, null, 2));

if (!execute) {
  console.log('Dry run only. Re-run with --execute after verifying the company and account.');
  await pool.end();
  process.exit(0);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

const throughDate = new Date();
throughDate.setUTCHours(0, 0, 0, 0);
throughDate.setUTCDate(throughDate.getUTCDate() - 1);
const now = new Date();
const lastSyncedAt = scenario === 'backfilling'
  ? null
  : scenario === 'stale'
    ? new Date(now.getTime() - 50 * 60 * 60 * 1000)
    : now;
const selectedAction = scenario === 'missing-conversion' ? null : 'lead';
const writesHistory = scenario !== 'backfilling';
const noSpend = scenario === 'no-spend';
const responseScenario = new Set([
  'ad-response-decline', 'planned-experiment', 'overdue-experiment', 'measuring-experiment',
  'improved', 'worsened', 'no-clear-change', 'day-7-low-volume', 'day-14-inconclusive',
]).has(scenario);
const conversionOutlierScenario = scenario === 'conversion-outlier';
const landingPageScenario = scenario === 'landing-page-loss';
const workflowScenario = new Set([
  'planned-experiment', 'overdue-experiment', 'measuring-experiment', 'improved', 'worsened',
  'no-clear-change', 'day-7-low-volume', 'day-14-inconclusive',
]).has(scenario);

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const company = await client.query('SELECT 1 FROM public.companies WHERE id=$1', [companyId]);
  if (!company.rowCount) throw new Error('company_not_found');

  if (scenario === 'disconnected') {
    await client.query(`DELETE FROM public.integration_connections WHERE company_id=$1 AND integration_id='int-meta'`, [companyId]);
    await client.query('DELETE FROM public.meta_ads_findings WHERE company_id=$1', [companyId]);
    await client.query('DELETE FROM public.meta_ads_sync_runs WHERE company_id=$1', [companyId]);
    await client.query('DELETE FROM public.meta_ads_campaign_daily WHERE company_id=$1', [companyId]);
    await client.query('DELETE FROM public.meta_ads_account_daily WHERE company_id=$1', [companyId]);
    await client.query('DELETE FROM public.meta_ads_delivery_daily WHERE company_id=$1', [companyId]);
    await client.query('DELETE FROM public.meta_ads_delivery_windows WHERE company_id=$1', [companyId]);
    await client.query('DELETE FROM public.meta_ads_delivery_entities WHERE company_id=$1', [companyId]);
  } else {
    await client.query(
      `INSERT INTO public.integration_connections
         (company_id,integration_id,account_name,sandbox_mode,access_token_enc,last_synced_at,metadata,connected_at)
       VALUES ($1,'int-meta',$2,TRUE,$3,$4,$5::jsonb,NOW())
       ON CONFLICT (company_id,integration_id) DO UPDATE SET
         account_name=EXCLUDED.account_name,sandbox_mode=TRUE,access_token_enc=EXCLUDED.access_token_enc,
         last_synced_at=EXCLUDED.last_synced_at,metadata=EXCLUDED.metadata`,
      [
        companyId,
        'Northstar Commerce · Meta Ads',
        encrypt('fixture-read-only-token'),
        lastSyncedAt?.toISOString() ?? null,
        JSON.stringify({
          ad_account_id: accountId,
          currency: 'USD',
          timezone: 'America/Los_Angeles',
          ...(writesHistory ? { data_through: isoDate(throughDate) } : {}),
          ...(selectedAction ? { meta_conversion_action_type: selectedAction } : {}),
          fixture_scenario: scenario,
        }),
      ],
    );

    await client.query('DELETE FROM public.meta_ads_findings WHERE company_id=$1 AND ad_account_id=$2', [companyId, accountId]);
    await client.query('DELETE FROM public.meta_ads_sync_runs WHERE company_id=$1 AND ad_account_id=$2', [companyId, accountId]);
    await client.query('DELETE FROM public.meta_ads_campaign_daily WHERE company_id=$1 AND ad_account_id=$2', [companyId, accountId]);
    await client.query('DELETE FROM public.meta_ads_account_daily WHERE company_id=$1 AND ad_account_id=$2', [companyId, accountId]);
    await client.query('DELETE FROM public.meta_ads_delivery_daily WHERE company_id=$1 AND ad_account_id=$2', [companyId, accountId]);
    await client.query('DELETE FROM public.meta_ads_delivery_windows WHERE company_id=$1 AND ad_account_id=$2', [companyId, accountId]);
    await client.query('DELETE FROM public.meta_ads_delivery_entities WHERE company_id=$1 AND ad_account_id=$2', [companyId, accountId]);

    if (writesHistory) {
      const accountMetrics: Array<Record<string, unknown>> = [];
      const campaignMetrics: Array<Record<string, unknown>> = [];
      for (let offset = 89; offset >= 0; offset -= 1) {
        const date = new Date(throughDate);
        date.setUTCDate(date.getUTCDate() - offset);
        const metricDate = isoDate(date);
        const inCurrentSeven = offset <= 6;
        const inPreviousSeven = offset >= 7 && offset <= 13;
        let spend = noSpend ? 0 : 700;
        let impressions = noSpend ? 0 : 50_000;
        let clicks = noSpend ? 0 : 1_500;
        let roas = noSpend ? 0 : 3.2;
        let leads = noSpend ? 0 : 18;
        if (scenario === 'deteriorating') {
          if (inPreviousSeven) {
            spend = 1_000; impressions = 50_000; clicks = 1_500; roas = 4; leads = 20;
          } else if (inCurrentSeven) {
            spend = 1_000; impressions = 50_000; clicks = 750; roas = 2; leads = 10;
          }
        }
        const actions = { lead: leads, purchase: noSpend ? 0 : 8, link_click: clicks };
        const actionValues = { purchase: spend * roas };
        accountMetrics.push({
          metricDate,
          spend,
          impressions,
          clicks,
          ctr: impressions ? (clicks / impressions) * 100 : 0,
          cpc: clicks ? spend / clicks : 0,
          purchaseRoas: roas,
          actions,
          actionValues,
        });

        const campaigns = [
          { id: 'fixture_prospecting', name: 'US Prospecting', share: 0.55, roas: scenario === 'deteriorating' && inCurrentSeven ? 0.9 : roas * 0.8, status: 'ACTIVE' },
          { id: 'fixture_retargeting', name: 'Retargeting', share: 0.30, roas: roas * 1.35, status: 'ACTIVE' },
          { id: 'fixture_brand', name: 'Brand Awareness', share: 0.15, roas, status: 'PAUSED' },
        ];
        for (const campaign of campaigns) {
          const campaignSpend = spend * campaign.share;
          const campaignClicks = Math.round(clicks * campaign.share);
          const campaignImpressions = Math.round(impressions * campaign.share);
          campaignMetrics.push({
            campaignId: campaign.id,
            metricDate,
            campaignName: campaign.name,
            campaignStatus: campaign.status,
            spend: campaignSpend,
            impressions: campaignImpressions,
            clicks: campaignClicks,
            ctr: campaignImpressions ? (campaignClicks / campaignImpressions) * 100 : 0,
            cpc: campaignClicks ? campaignSpend / campaignClicks : 0,
            purchaseRoas: campaign.roas,
            actions: { lead: leads * campaign.share, purchase: (noSpend ? 0 : 8) * campaign.share },
            actionValues: { purchase: campaignSpend * campaign.roas },
          });
        }
      }
      await client.query(
        `INSERT INTO public.meta_ads_account_daily
           (company_id,ad_account_id,metric_date,account_name,currency,account_timezone,spend,impressions,clicks,ctr,cpc,purchase_roas,actions,action_values)
         SELECT $1,$2,row.metric_date,'Northstar Commerce · Meta Ads','USD','America/Los_Angeles',
                row.spend,row.impressions,row.clicks,row.ctr,row.cpc,row.purchase_roas,row.actions,row.action_values
           FROM jsonb_to_recordset($3::jsonb) AS row(
             metric_date date,spend numeric,impressions bigint,clicks bigint,ctr numeric,cpc numeric,
             purchase_roas numeric,actions jsonb,action_values jsonb
           )`,
        [companyId, accountId, JSON.stringify(accountMetrics.map((row) => ({
          metric_date: row.metricDate,
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
          ctr: row.ctr,
          cpc: row.cpc,
          purchase_roas: row.purchaseRoas,
          actions: row.actions,
          action_values: row.actionValues,
        })))],
      );
      await client.query(
        `INSERT INTO public.meta_ads_campaign_daily
           (company_id,ad_account_id,campaign_id,metric_date,campaign_name,campaign_status,currency,account_timezone,spend,impressions,clicks,ctr,cpc,purchase_roas,actions,action_values)
         SELECT $1,$2,row.campaign_id,row.metric_date,row.campaign_name,row.campaign_status,'USD','America/Los_Angeles',
                row.spend,row.impressions,row.clicks,row.ctr,row.cpc,row.purchase_roas,row.actions,row.action_values
           FROM jsonb_to_recordset($3::jsonb) AS row(
             campaign_id text,metric_date date,campaign_name text,campaign_status text,spend numeric,
             impressions bigint,clicks bigint,ctr numeric,cpc numeric,purchase_roas numeric,actions jsonb,action_values jsonb
           )`,
        [companyId, accountId, JSON.stringify(campaignMetrics.map((row) => ({
          campaign_id: row.campaignId,
          metric_date: row.metricDate,
          campaign_name: row.campaignName,
          campaign_status: row.campaignStatus,
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
          ctr: row.ctr,
          cpc: row.cpc,
          purchase_roas: row.purchaseRoas,
          actions: row.actions,
          action_values: row.actionValues,
        })))],
      );

      const deepDaily: Array<Record<string, unknown>> = [];
      for (let offset = 59; offset >= 0; offset -= 1) {
        const date = new Date(throughDate);
        date.setUTCDate(date.getUTCDate() - offset);
        const metricDate = isoDate(date);
        deepDaily.push({
          level: 'adset', entity_id: 'fixture_adset_founders', metric_date: metricDate, entity_name: 'Founder audience',
          entity_status: 'ACTIVE', campaign_id: 'fixture_prospecting', campaign_name: 'US Prospecting',
          adset_id: 'fixture_adset_founders', adset_name: 'Founder audience', spend: 100, impressions: 1_000,
          clicks: 20, ctr: 2, cpc: 5, cpm: 100, reach: 800, frequency: 1.25, outbound_clicks: 18,
          landing_page_views: 16, purchase_roas: 2, actions: { lead: 10, purchase: 3 }, action_values: { purchase: 200 },
        });
        deepDaily.push({
          level: 'ad', entity_id: 'fixture_ad_founder_video', metric_date: metricDate, entity_name: 'Founder video',
          entity_status: 'ACTIVE', campaign_id: 'fixture_prospecting', campaign_name: 'US Prospecting',
          adset_id: 'fixture_adset_founders', adset_name: 'Founder audience', spend: 30, impressions: 400,
          clicks: 8, ctr: 2, cpc: 3.75, cpm: 75, reach: 320, frequency: 1.25, outbound_clicks: 7,
          landing_page_views: 6, purchase_roas: 2, actions: { lead: 3, purchase: 1 }, action_values: { purchase: 60 },
        });
      }
      await client.query(
        `INSERT INTO public.meta_ads_delivery_daily
           (company_id,ad_account_id,level,entity_id,metric_date,entity_name,entity_status,campaign_id,campaign_name,
            adset_id,adset_name,currency,account_timezone,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,
            outbound_clicks,landing_page_views,purchase_roas,actions,action_values)
         SELECT $1,$2,row.level,row.entity_id,row.metric_date,row.entity_name,row.entity_status,row.campaign_id,row.campaign_name,
                row.adset_id,row.adset_name,'USD','America/Los_Angeles',row.spend,row.impressions,row.clicks,row.ctr,row.cpc,
                row.cpm,row.reach,row.frequency,row.outbound_clicks,row.landing_page_views,row.purchase_roas,row.actions,row.action_values
           FROM jsonb_to_recordset($3::jsonb) AS row(
             level text,entity_id text,metric_date date,entity_name text,entity_status text,campaign_id text,campaign_name text,
             adset_id text,adset_name text,spend numeric,impressions bigint,clicks bigint,ctr numeric,cpc numeric,cpm numeric,
             reach bigint,frequency numeric,outbound_clicks bigint,landing_page_views bigint,purchase_roas numeric,actions jsonb,action_values jsonb)`,
        [companyId, accountId, JSON.stringify(deepDaily)],
      );

      const currentStart = new Date(throughDate); currentStart.setUTCDate(currentStart.getUTCDate() - 6);
      const previousStart = new Date(throughDate); previousStart.setUTCDate(previousStart.getUTCDate() - 13);
      const previousEnd = new Date(throughDate); previousEnd.setUTCDate(previousEnd.getUTCDate() - 7);
      const deepWindows: Array<Record<string, unknown>> = [];
      for (const period of [
        { current: false, start: isoDate(previousStart), end: isoDate(previousEnd) },
        { current: true, start: isoDate(currentStart), end: isoDate(throughDate) },
      ]) {
        const parentOutbound = 200;
        const parentLanding = landingPageScenario && period.current ? 100 : 180;
        deepWindows.push({
          level: 'adset', entity_id: 'fixture_adset_founders', window_start: period.start, window_end: period.end,
          entity_name: 'Founder audience', campaign_id: 'fixture_prospecting', campaign_name: 'US Prospecting',
          adset_id: 'fixture_adset_founders', adset_name: 'Founder audience', spend: 1_000, impressions: 10_000,
          clicks: 300, ctr: 3, cpc: 3.33, cpm: 100, reach: 8_000, frequency: 1.25,
          outbound_clicks: parentOutbound, landing_page_views: parentLanding, purchase_roas: 2,
          actions: { lead: 30, purchase: 5 }, action_values: { purchase: 2_000 },
        });
        const adCtr = responseScenario ? (period.current ? 1.5 : 2.5) : 2.2;
        const adClicks = conversionOutlierScenario && period.current ? 60 : Math.round(4_000 * adCtr / 100);
        const adLeads = conversionOutlierScenario && period.current ? 0 : 10;
        deepWindows.push({
          level: 'ad', entity_id: 'fixture_ad_founder_video', window_start: period.start, window_end: period.end,
          entity_name: 'Founder video', campaign_id: 'fixture_prospecting', campaign_name: 'US Prospecting',
          adset_id: 'fixture_adset_founders', adset_name: 'Founder audience', spend: 300, impressions: 4_000,
          clicks: adClicks, ctr: adCtr, cpc: adClicks ? 300 / adClicks : 0, cpm: 75, reach: 3_000,
          frequency: responseScenario && period.current ? 2.8 : 2, outbound_clicks: Math.max(0, adClicks - 5),
          landing_page_views: Math.max(0, adClicks - 10), purchase_roas: 2,
          actions: { lead: adLeads, purchase: 3 }, action_values: { purchase: 600 },
        });
      }
      await client.query(
        `INSERT INTO public.meta_ads_delivery_windows
           (company_id,ad_account_id,level,entity_id,window_start,window_end,entity_name,campaign_id,campaign_name,
            adset_id,adset_name,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,outbound_clicks,
            landing_page_views,purchase_roas,actions,action_values)
         SELECT $1,$2,row.level,row.entity_id,row.window_start,row.window_end,row.entity_name,row.campaign_id,row.campaign_name,
                row.adset_id,row.adset_name,row.spend,row.impressions,row.clicks,row.ctr,row.cpc,row.cpm,row.reach,row.frequency,
                row.outbound_clicks,row.landing_page_views,row.purchase_roas,row.actions,row.action_values
           FROM jsonb_to_recordset($3::jsonb) AS row(
             level text,entity_id text,window_start date,window_end date,entity_name text,campaign_id text,campaign_name text,
             adset_id text,adset_name text,spend numeric,impressions bigint,clicks bigint,ctr numeric,cpc numeric,cpm numeric,
             reach bigint,frequency numeric,outbound_clicks bigint,landing_page_views bigint,purchase_roas numeric,actions jsonb,action_values jsonb)`,
        [companyId, accountId, JSON.stringify(deepWindows)],
      );
      await client.query(
        `INSERT INTO public.meta_ads_delivery_entities
           (company_id,ad_account_id,level,entity_id,entity_name,effective_status,campaign_id,campaign_name,adset_id,adset_name,
            creative_id,creative_name,creative_format,thumbnail_url,last_seen_at)
         VALUES
           ($1,$2,'adset','fixture_adset_founders','Founder audience','ACTIVE','fixture_prospecting','US Prospecting',
            'fixture_adset_founders','Founder audience',NULL,NULL,NULL,NULL,NOW()),
           ($1,$2,'ad','fixture_ad_founder_video','Founder video','ACTIVE','fixture_prospecting','US Prospecting',
            'fixture_adset_founders','Founder audience','fixture_creative_founder','Founder video','VIDEO',
            'https://images.example.com/meta-fixture-founder-video.jpg',NOW())`,
        [companyId, accountId],
      );
    }

    if (scenario === 'backfilling') {
      await client.query(
        `INSERT INTO public.meta_ads_sync_runs
           (company_id,ad_account_id,reason,status,requested_at,available_at,attempt,diagnostic_coverage)
         VALUES ($1,$2,'initial_backfill','pending',$3,$3,0,'preparing')`,
        [companyId, accountId, now.toISOString()],
      );
    } else {
      const completedRunAt = scenario === 'refreshing' || scenario === 'failed-sync'
        ? new Date(now.getTime() - 10 * 60_000).toISOString()
        : lastSyncedAt?.toISOString() ?? now.toISOString();
      await client.query(
        `INSERT INTO public.meta_ads_sync_runs
           (company_id,ad_account_id,reason,status,requested_at,started_at,core_completed_at,completed_at,data_through,attempt,diagnostic_coverage)
         VALUES ($1,$2,'manual','complete',$3,$3,$3,$3,$4,1,'current')`,
        [companyId, accountId, completedRunAt, isoDate(throughDate)],
      );
    }

    if (scenario === 'refreshing') {
      await client.query(
        `INSERT INTO public.meta_ads_sync_runs
           (company_id,ad_account_id,reason,status,requested_at,available_at,started_at,core_completed_at,locked_at,locked_until,locked_by,attempt,diagnostic_coverage,data_through)
         VALUES ($1,$2,'manual','running',$3,$3,$3,$3,$3,$4,'demo-recorder',1,'preparing',$5)`,
        [companyId, accountId, now.toISOString(), new Date(now.getTime() + 30 * 60_000).toISOString(), isoDate(throughDate)],
      );
    }
    if (scenario === 'failed-sync') {
      for (let index = 0; index < 3; index += 1) {
        const failedAt = new Date(now.getTime() - index * 60_000);
        await client.query(
          `INSERT INTO public.meta_ads_sync_runs
             (company_id,ad_account_id,reason,status,requested_at,started_at,completed_at,attempt,max_attempts,error_code,error_message)
           VALUES ($1,$2,'manual','failed',$3,$3,$3,5,5,'meta_sync_failed','Development fixture refresh failure')`,
          [companyId, accountId, failedAt.toISOString()],
        );
      }
    }
    if (scenario === 'historical') {
      await client.query(`DELETE FROM public.integration_connections WHERE company_id=$1 AND integration_id='int-meta'`, [companyId]);
    }
  }

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}

if (scenario !== 'disconnected' && scenario !== 'historical') {
  await recalculateMetaAdsFromStoredHistory(companyId);
  await recalculateMetaAdsFromStoredHistory(companyId);
}

if (workflowScenario) {
  const { rows: owners } = await pool.query(
    `SELECT id,user_id FROM public.company_members WHERE company_id=$1 AND status='active' ORDER BY joined_at LIMIT 1`,
    [companyId],
  );
  if (!owners[0]) throw new Error('workflow_fixture_requires_active_company_member');
  const { rows: findings } = await pool.query(
    `SELECT id FROM public.meta_ads_findings
      WHERE company_id=$1 AND ad_account_id=$2 AND active=TRUE AND recommendation IS NOT NULL
      ORDER BY estimated_spend_exposure DESC LIMIT 1`,
    [companyId, accountId],
  );
  if (!findings[0]) throw new Error('workflow_fixture_actionable_finding_missing');
  const dueDate = new Date(now); dueDate.setUTCDate(dueDate.getUTCDate() + 3);
  const experiment = await startMetaAdsExperiment({
    companyId,
    userId: String(owners[0].user_id),
    findingId: String(findings[0].id),
    ownerMemberId: String(owners[0].id),
    dueDate: isoDate(dueDate),
    idempotencyKey: `fixture-start-${scenario}-${accountId}`,
  });

  if (scenario === 'overdue-experiment') {
    const overdue = new Date(now); overdue.setUTCDate(overdue.getUTCDate() - 1);
    await pool.query(`UPDATE public.meta_ads_experiments SET due_date=$2 WHERE id=$1`, [experiment.id, isoDate(overdue)]);
  } else if (scenario !== 'planned-experiment') {
    await applyMetaAdsExperiment({
      companyId,
      userId: String(owners[0].user_id),
      experimentId: experiment.id,
      implementationNote: 'Fixture: rotated one creative while preserving audience, placements, and ad-set budget.',
      confirmedRecommendedChange: true,
      keptBudgetConstant: true,
      idempotencyKey: `fixture-apply-${scenario}-${accountId}`,
    });

    if (scenario !== 'measuring-experiment') {
      const through = isoDate(throughDate);
      const start7 = new Date(throughDate); start7.setUTCDate(start7.getUTCDate() - 6);
      const applied7 = new Date(throughDate); applied7.setUTCDate(applied7.getUTCDate() - 7);
      const due14 = new Date(throughDate); due14.setUTCDate(due14.getUTCDate() + 7);
      let impressions = 1_000;
      let clicks = 20;
      if (scenario === 'improved') clicks = 30;
      if (scenario === 'worsened') clicks = 10;
      if (scenario === 'no-clear-change') clicks = 21;
      if (scenario === 'day-7-low-volume' || scenario === 'day-14-inconclusive') { impressions = 100; clicks = 2; }
      const updateStart = scenario === 'day-14-inconclusive'
        ? (() => { const value = new Date(throughDate); value.setUTCDate(value.getUTCDate() - 13); return isoDate(value); })()
        : isoDate(start7);
      await pool.query(
        `UPDATE public.meta_ads_delivery_daily
            SET impressions=$4,clicks=$5,ctr=CASE WHEN $4>0 THEN ($5::numeric/$4::numeric)*100 ELSE 0 END,
                cpc=CASE WHEN $5>0 THEN spend/$5::numeric ELSE 0 END
          WHERE company_id=$1 AND ad_account_id=$2 AND level='adset' AND entity_id='fixture_adset_founders'
            AND metric_date BETWEEN $3 AND $6`,
        [companyId, accountId, updateStart, impressions, clicks, through],
      );
      if (scenario === 'day-14-inconclusive') {
        const applied14 = new Date(throughDate); applied14.setUTCDate(applied14.getUTCDate() - 14);
        const start14 = new Date(throughDate); start14.setUTCDate(start14.getUTCDate() - 13);
        const due7 = new Date(throughDate); due7.setUTCDate(due7.getUTCDate() - 7);
        await pool.query(
          `UPDATE public.meta_ads_experiments SET applied_local_date=$2,evaluation_start=$3,evaluation_due_7=$4,
                  evaluation_due_14=$5,evaluation_days=14 WHERE id=$1`,
          [experiment.id, isoDate(applied14), isoDate(start14), isoDate(due7), through],
        );
      } else {
        await pool.query(
          `UPDATE public.meta_ads_experiments SET applied_local_date=$2,evaluation_start=$3,evaluation_due_7=$4,
                  evaluation_due_14=$5,evaluation_days=7 WHERE id=$1`,
          [experiment.id, isoDate(applied7), isoDate(start7), through, isoDate(due14)],
        );
      }
      await evaluateMeasuringMetaAdsExperiments(companyId, accountId, through);
    }
  }
}
console.log(`Seeded Meta Ads "${scenario}" fixture for ${companyId}. Open /universal?focus=mkt_paid_acquisition&openHub=1`);
await pool.end();
