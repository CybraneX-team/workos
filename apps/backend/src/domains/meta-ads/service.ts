import type {
  MetaAdsAttention,
  MetaAdsCampaignSummary,
  MetaAdsConnectionHealth,
  MetaAdsFinding,
  MetaAdsGoalContext,
  MetaAdsMetrics,
  MetaAdsOperatingBrief,
  MetaAdsSeriesPoint,
  MetaAdsSummary,
  MetaAdsSummaryValues,
  MetaAdsSyncReason,
  MetaAdsSyncRun,
} from '@cybranex/shared-types';
import type { PoolClient } from 'pg';
import { fetchMetaAdsHistory, getMetaAdAccount, type MetaAdsDailyRow } from '../../adapters/metaAds.js';
import { env } from '../../config.js';
import { pool } from '../../db.js';
import { decrypt } from '../../lib/crypto.js';
import { applyStoredMetaCanonicalMetrics } from '../../lib/metaMetricEngine.js';
import {
  buildDeepFindingCandidates,
  DEEP_FINDING_KINDS,
  prepareMetaAdsDeepSegments,
  processOneMetaAdsDeepSegment,
  refreshMetaAdsCreativeMetadata,
} from './deepSync.js';
import {
  evaluateMeasuringMetaAdsExperiments,
  getMetaAdsDecisionAttention,
  reconcileDetachedMetaAdsExperiments,
  reconcileRemovedMetaAdsExperimentOwners,
} from './decisionInbox.js';
import {
  evaluatePerformanceFindings,
  evaluateTargetMovementFindings,
  nextFindingLifecycle,
  percentageChange,
  staleDataFinding,
  syncFailureFinding,
  type CampaignFindingInput,
  type FindingCandidate,
  type FindingWindow,
  type TargetMovementInput,
} from './findings.js';

const RETENTION_DAYS = 90;
const ATTRIBUTION_REFRESH_DAYS = 7;
const META_SCHEDULE_HOUR_UTC = 1;
const META_SCHEDULE_MINUTE_UTC = 30;

export type MetaAdsStoredDailyRecord = {
  metric_date: string | Date;
  campaign_id?: string;
  campaign_name?: string;
  campaign_status?: string;
  spend: string | number;
  impressions: string | number;
  clicks: string | number;
  cpm?: string | number;
  reach?: string | number;
  frequency?: string | number;
  outbound_clicks?: string | number;
  landing_page_views?: string | number;
  purchase_roas: string | number;
  actions: Record<string, number> | null;
};

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function isoDate(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDate(now: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function latestCompleteDate(now: Date, timezone: string): string {
  return shiftDate(localDate(now, timezone), -1);
}

function actionTotal(actions: Record<string, number> | null | undefined, action: string | null): number {
  if (!action || !actions) return 0;
  return Number(actions[action]) || 0;
}

function purchaseCount(actions: Record<string, number> | null | undefined): number {
  if (!actions) return 0;
  return Object.entries(actions).reduce((total, [key, value]) => {
    const normalized = key.toLowerCase();
    return normalized === 'purchase' || normalized.endsWith('.purchase') ? total + (Number(value) || 0) : total;
  }, 0);
}

export function aggregateMetaDailyRows(rows: MetaAdsStoredDailyRecord[], selectedAction: string | null): FindingWindow {
  const spend = rows.reduce((sum, row) => sum + Number(row.spend || 0), 0);
  const impressions = rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
  const clicks = rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0);
  const selectedConversions = rows.reduce((sum, row) => sum + actionTotal(row.actions, selectedAction), 0);
  const weightedRoas = rows.reduce((sum, row) => sum + Number(row.purchase_roas || 0) * Number(row.spend || 0), 0);
  const dates = rows.map((row) => isoDate(row.metric_date)).sort();
  return {
    start: dates[0] ?? null,
    end: dates.at(-1) ?? null,
    spend: round(spend),
    impressions,
    clicks,
    ctr: impressions > 0 ? round((clicks / impressions) * 100) : 0,
    purchaseRoas: spend > 0 ? round(weightedRoas / spend) : 0,
    selectedConversions: round(selectedConversions),
    cpa: selectedConversions > 0 ? round(spend / selectedConversions) : null,
    purchaseCount: rows.reduce((sum, row) => sum + purchaseCount(row.actions), 0),
  };
}

function publicValues(window: FindingWindow): MetaAdsSummaryValues {
  return {
    spend: window.spend,
    impressions: window.impressions,
    clicks: window.clicks,
    ctr: window.ctr,
    cpc: window.clicks > 0 ? round(window.spend / window.clicks) : 0,
    purchaseRoas: window.purchaseRoas,
    selectedConversions: window.selectedConversions,
    cpa: window.cpa,
  };
}

export function metaAdsManagerUrl(adAccountId: string, campaignId?: string): string {
  const account = adAccountId.replace(/^act_/, '');
  const url = new URL('https://www.facebook.com/adsmanager/manage/campaigns');
  url.searchParams.set('act', account);
  if (campaignId) url.searchParams.set('selected_campaign_ids', campaignId);
  return url.toString();
}

function safeError(error: unknown): { code: string; message: string; retryable: boolean } {
  const raw = error instanceof Error ? error.message : String(error);
  if (/401|403|oauth|token|permission/i.test(raw)) return { code: 'meta_auth_expired', message: 'Meta authorization expired. Reconnect Meta Ads.', retryable: false };
  if (/429|rate/i.test(raw)) return { code: 'meta_rate_limited', message: 'Meta temporarily rate-limited the refresh.', retryable: true };
  if (/timeout|fetch|network|5\d\d/i.test(raw)) return { code: 'meta_temporarily_unavailable', message: 'Meta Ads is temporarily unavailable.', retryable: true };
  if (/account_changed|configuration_changed/i.test(raw)) return { code: 'meta_account_changed', message: 'The connected Meta configuration changed before this refresh ran.', retryable: false };
  if (/meta_not_connected|meta_account_missing|meta_graph_4\d\d/i.test(raw)) return { code: 'meta_configuration_invalid', message: 'The Meta Ads connection needs attention.', retryable: false };
  return { code: 'meta_sync_failed', message: 'Meta Ads data could not be refreshed.', retryable: true };
}

function shapeSyncRun(row: Record<string, unknown>): MetaAdsSyncRun {
  return {
    id: String(row.id),
    accountId: String(row.ad_account_id),
    reason: row.reason as MetaAdsSyncReason,
    status: row.status as MetaAdsSyncRun['status'],
    requestedAt: new Date(String(row.requested_at)).toISOString(),
    startedAt: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    error: row.error_message ? String(row.error_message) : null,
    dataThrough: row.data_through ? isoDate(row.data_through as string | Date) : null,
    diagnosticCoverage: (row.diagnostic_coverage ?? 'not_started') as MetaAdsSyncRun['diagnosticCoverage'],
    warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
  };
}

export async function enqueueMetaAdsSync(
  companyId: string,
  reason: MetaAdsSyncReason,
  requestedBy?: string,
  scheduleDate?: string,
): Promise<MetaAdsSyncRun> {
  const { rows: connections } = await pool.query(
    `SELECT metadata FROM public.integration_connections WHERE company_id=$1 AND integration_id='int-meta'`,
    [companyId],
  );
  if (!connections.length) throw new Error('meta_not_connected');
  const adAccountId = String((connections[0].metadata ?? {}).ad_account_id ?? '');
  if (!adAccountId) throw new Error('meta_account_missing');
  const { rows } = await pool.query(
    `INSERT INTO public.meta_ads_sync_runs
       (company_id, ad_account_id, reason, schedule_date, requested_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (company_id, ad_account_id) WHERE status IN ('pending','running')
     DO UPDATE SET requested_at=NOW(),
                   reason=CASE WHEN meta_ads_sync_runs.reason IN ('initial_backfill','daily') THEN meta_ads_sync_runs.reason ELSE EXCLUDED.reason END,
                   schedule_date=COALESCE(meta_ads_sync_runs.schedule_date,EXCLUDED.schedule_date),
                   requested_by=COALESCE(EXCLUDED.requested_by, meta_ads_sync_runs.requested_by)
     RETURNING *`,
    [companyId, adAccountId, reason, scheduleDate ?? null, requestedBy ?? null],
  );
  return shapeSyncRun(rows[0]);
}

export async function enqueueInitialMetaAdsBackfill(companyId: string, requestedBy?: string) {
  return enqueueMetaAdsSync(companyId, 'initial_backfill', requestedBy);
}

export async function getMetaAdsSyncRun(companyId: string, runId: string): Promise<MetaAdsSyncRun | null> {
  const { rows } = await pool.query(
    `SELECT * FROM public.meta_ads_sync_runs WHERE id=$1 AND company_id=$2`, [runId, companyId],
  );
  return rows[0] ? shapeSyncRun(rows[0]) : null;
}

async function upsertHistory(client: PoolClient, input: {
  companyId: string;
  account: { id: string; name: string; currency: string; timezone: string };
  accountRows: MetaAdsDailyRow[];
  campaignRows: MetaAdsDailyRow[];
  dataThrough: string;
}) {
  await client.query(
    `INSERT INTO public.meta_ads_account_daily
       (company_id,ad_account_id,metric_date,account_name,currency,account_timezone,spend,impressions,clicks,ctr,cpc,cpm,
        reach,frequency,outbound_clicks,landing_page_views,purchase_roas,actions,action_values,ingested_at)
     SELECT $1,$2,r.date::date,$3,$4,$5,r.spend,r.impressions,r.clicks,r.ctr,r.cpc,r.cpm,
            r.reach,r.frequency,r.outbound_clicks,r.landing_page_views,r.purchase_roas,r.actions,r.action_values,NOW()
       FROM jsonb_to_recordset($6::jsonb) AS r(date text,spend numeric,impressions bigint,clicks bigint,ctr numeric,cpc numeric,
         cpm numeric,reach bigint,frequency numeric,outbound_clicks bigint,landing_page_views bigint,purchase_roas numeric,
         actions jsonb,action_values jsonb)
     ON CONFLICT (company_id,ad_account_id,metric_date) DO UPDATE SET
       account_name=EXCLUDED.account_name,currency=EXCLUDED.currency,account_timezone=EXCLUDED.account_timezone,
       spend=EXCLUDED.spend,impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,ctr=EXCLUDED.ctr,cpc=EXCLUDED.cpc,
       cpm=EXCLUDED.cpm,reach=EXCLUDED.reach,frequency=EXCLUDED.frequency,outbound_clicks=EXCLUDED.outbound_clicks,
       landing_page_views=EXCLUDED.landing_page_views,purchase_roas=EXCLUDED.purchase_roas,actions=EXCLUDED.actions,
       action_values=EXCLUDED.action_values,ingested_at=NOW()`,
    [input.companyId, input.account.id, input.account.name, input.account.currency, input.account.timezone,
      JSON.stringify(input.accountRows.map((row) => ({
        ...row,
        action_values: row.actionValues,
        purchase_roas: row.purchaseRoas,
        outbound_clicks: row.outboundClicks,
        landing_page_views: row.landingPageViews,
      })))],
  );
  if (input.campaignRows.length) {
    await client.query(
      `INSERT INTO public.meta_ads_campaign_daily
         (company_id,ad_account_id,campaign_id,metric_date,campaign_name,campaign_status,currency,account_timezone,spend,impressions,
          clicks,ctr,cpc,cpm,reach,frequency,outbound_clicks,landing_page_views,purchase_roas,actions,action_values,ingested_at)
       SELECT $1,$2,r.campaign_id,r.date::date,r.campaign_name,r.campaign_status,$3,$4,r.spend,r.impressions,r.clicks,r.ctr,r.cpc,
              r.cpm,r.reach,r.frequency,r.outbound_clicks,r.landing_page_views,r.purchase_roas,r.actions,r.action_values,NOW()
         FROM jsonb_to_recordset($5::jsonb) AS r(date text,campaign_id text,campaign_name text,campaign_status text,spend numeric,
           impressions bigint,clicks bigint,ctr numeric,cpc numeric,cpm numeric,reach bigint,frequency numeric,outbound_clicks bigint,
           landing_page_views bigint,purchase_roas numeric,actions jsonb,action_values jsonb)
       ON CONFLICT (company_id,ad_account_id,campaign_id,metric_date) DO UPDATE SET
         campaign_name=EXCLUDED.campaign_name,campaign_status=EXCLUDED.campaign_status,currency=EXCLUDED.currency,
         account_timezone=EXCLUDED.account_timezone,spend=EXCLUDED.spend,impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,
         ctr=EXCLUDED.ctr,cpc=EXCLUDED.cpc,cpm=EXCLUDED.cpm,reach=EXCLUDED.reach,frequency=EXCLUDED.frequency,
         outbound_clicks=EXCLUDED.outbound_clicks,landing_page_views=EXCLUDED.landing_page_views,
         purchase_roas=EXCLUDED.purchase_roas,actions=EXCLUDED.actions,action_values=EXCLUDED.action_values,ingested_at=NOW()`,
      [input.companyId, input.account.id, input.account.currency, input.account.timezone,
        JSON.stringify(input.campaignRows.map((row) => ({
          ...row,
          campaign_id: row.campaignId,
          campaign_name: row.campaignName,
          campaign_status: row.campaignStatus,
          action_values: row.actionValues,
          purchase_roas: row.purchaseRoas,
          outbound_clicks: row.outboundClicks,
          landing_page_views: row.landingPageViews,
        })))],
    );
  }
  const retentionStart = shiftDate(input.dataThrough, -(RETENTION_DAYS - 1));
  await client.query(`DELETE FROM public.meta_ads_account_daily WHERE company_id=$1 AND ad_account_id=$2 AND metric_date<$3`, [input.companyId, input.account.id, retentionStart]);
  await client.query(`DELETE FROM public.meta_ads_campaign_daily WHERE company_id=$1 AND ad_account_id=$2 AND metric_date<$3`, [input.companyId, input.account.id, retentionStart]);
  await client.query(
    `UPDATE public.integration_connections
        SET metadata=metadata || jsonb_build_object('timezone',$3::text,'currency',$4::text,'data_through',$5::text)
      WHERE company_id=$1 AND integration_id='int-meta' AND metadata->>'ad_account_id'=$2`,
    [input.companyId, input.account.id, input.account.timezone, input.account.currency, input.dataThrough],
  );
}

async function dailyRows(companyId: string, accountId: string, from: string, through: string): Promise<MetaAdsStoredDailyRecord[]> {
  const { rows } = await pool.query(
    `SELECT metric_date,spend,impressions,clicks,purchase_roas,actions
       FROM public.meta_ads_account_daily
      WHERE company_id=$1 AND ad_account_id=$2 AND metric_date BETWEEN $3 AND $4 ORDER BY metric_date`,
    [companyId, accountId, from, through],
  );
  return rows;
}

async function createCanonicalPreview(companyId: string, accountId: string, selectedAction: string | null, dataThrough: string): Promise<MetaAdsMetrics> {
  const rows = await dailyRows(companyId, accountId, shiftDate(dataThrough, -29), dataThrough);
  const aggregate = aggregateMetaDailyRows(rows, selectedAction);
  const actionTotals: Record<string, number> = {};
  for (const row of rows) for (const [key, value] of Object.entries(row.actions ?? {})) actionTotals[key] = (actionTotals[key] ?? 0) + Number(value || 0);
  const { rows: campaignRows } = await pool.query(
    `SELECT campaign_name,SUM(spend)::numeric AS spend,
            CASE WHEN SUM(spend)>0 THEN SUM(purchase_roas*spend)/SUM(spend) ELSE 0 END AS roas,
            jsonb_agg(actions) AS action_sets,
            bool_or(campaign_status='ACTIVE') AS active
       FROM public.meta_ads_campaign_daily
      WHERE company_id=$1 AND ad_account_id=$2 AND metric_date BETWEEN $3 AND $4
      GROUP BY campaign_id,campaign_name ORDER BY SUM(spend) DESC LIMIT 20`,
    [companyId, accountId, shiftDate(dataThrough, -29), dataThrough],
  );
  const topCampaigns = campaignRows.slice(0, 5).map((row) => ({
    name: String(row.campaign_name), spend: round(Number(row.spend)), roas: round(Number(row.roas)),
    conversions: (row.action_sets as Array<Record<string, number>> ?? []).reduce((sum, actions) => sum + actionTotal(actions, selectedAction), 0),
  }));
  const { rows: accountRows } = await pool.query(
    `SELECT currency FROM public.meta_ads_account_daily WHERE company_id=$1 AND ad_account_id=$2 ORDER BY metric_date DESC LIMIT 1`,
    [companyId, accountId],
  );
  return {
    spend30d: aggregate.spend, impressions30d: aggregate.impressions, clicks30d: aggregate.clicks,
    ctr: aggregate.ctr, cpc: aggregate.clicks > 0 ? round(aggregate.spend / aggregate.clicks) : 0,
    roas: aggregate.purchaseRoas, conversions30d: aggregate.selectedConversions, cpa: aggregate.cpa,
    currency: String(accountRows[0]?.currency ?? ''), selectedConversionAction: selectedAction,
    conversionActions: Object.entries(actionTotals).sort(([a], [b]) => a.localeCompare(b)).map(([actionType, value]) => ({ actionType, value: round(value) })),
    activeCampaigns: campaignRows.filter((row) => row.active).length, topCampaigns,
  };
}

const PERFORMANCE_KINDS = ['missing_conversion_configuration', 'zero_selected_conversions', 'roas_decline', 'cpa_increase', 'ctr_decline', 'campaign_underperformance', 'target_gap_widening'];

async function persistCandidates(companyId: string, accountId: string, candidates: FindingCandidate[], managedKinds: string[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query(
      `SELECT * FROM public.meta_ads_findings WHERE company_id=$1 AND ad_account_id=$2 AND kind=ANY($3::text[]) FOR UPDATE`,
      [companyId, accountId, managedKinds],
    );
    const byFingerprint = new Map(existing.map((row) => [String(row.fingerprint), row]));
    const seen = new Set<string>();
    for (const candidate of candidates) {
      seen.add(candidate.fingerprint);
      const previous = byFingerprint.get(candidate.fingerprint);
      const lifecycle = nextFindingLifecycle(previous ? {
        active: Boolean(previous.active), detectionCount: Number(previous.detection_count), clearCount: Number(previous.clear_count),
      } : null, true, Boolean(candidate.immediate));
      const openingEpisode = lifecycle.active && !Boolean(previous?.active);
      const previousEpisode = Number(previous?.episode ?? 0);
      const episode = openingEpisode
        ? Math.max(1, previousEpisode + 1)
        : lifecycle.active ? Math.max(1, previousEpisode) : previousEpisode;
      await client.query(
        `INSERT INTO public.meta_ads_findings
           (company_id,ad_account_id,fingerprint,kind,severity,scope,scope_id,title,explanation,period_start,period_end,
            evidence,estimated_spend_exposure,action_kind,action_label,action_href,detection_count,clear_count,active,
            episode,episode_started_at,diagnosis,recommendation,confidence,first_detected_at,last_detected_at,resolved_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,0,$18,$19,
                 CASE WHEN $20 THEN NOW() ELSE NULL END,$21::jsonb,$22::jsonb,$23,NOW(),NOW(),NULL,NOW())
         ON CONFLICT (company_id,ad_account_id,fingerprint) DO UPDATE SET
           kind=EXCLUDED.kind,severity=EXCLUDED.severity,scope=EXCLUDED.scope,scope_id=EXCLUDED.scope_id,title=EXCLUDED.title,
           explanation=EXCLUDED.explanation,period_start=EXCLUDED.period_start,period_end=EXCLUDED.period_end,evidence=EXCLUDED.evidence,
           estimated_spend_exposure=EXCLUDED.estimated_spend_exposure,action_kind=EXCLUDED.action_kind,action_label=EXCLUDED.action_label,
           action_href=EXCLUDED.action_href,detection_count=$17,clear_count=0,active=$18,episode=$19,
           episode_started_at=CASE WHEN $20 THEN NOW() ELSE meta_ads_findings.episode_started_at END,
           diagnosis=EXCLUDED.diagnosis,recommendation=EXCLUDED.recommendation,confidence=EXCLUDED.confidence,
           last_detected_at=NOW(),resolved_at=NULL,updated_at=NOW()`,
        [companyId, accountId, candidate.fingerprint, candidate.kind, candidate.severity, candidate.scope, candidate.scopeId ?? null,
          candidate.title, candidate.explanation, candidate.periodStart, candidate.periodEnd, JSON.stringify(candidate.evidence),
          candidate.estimatedSpendExposure, candidate.actionKind, candidate.actionLabel, candidate.actionHref, lifecycle.detectionCount,
          lifecycle.active, episode, openingEpisode, candidate.diagnosis ? JSON.stringify(candidate.diagnosis) : null,
          candidate.recommendation ? JSON.stringify(candidate.recommendation) : null, candidate.confidence ?? null],
      );
    }
    for (const row of existing) {
      if (seen.has(String(row.fingerprint))) continue;
      const immediate = row.kind === 'sync_failure' || row.kind === 'stale_data' || row.kind === 'missing_conversion_configuration';
      const lifecycle = nextFindingLifecycle({ active: Boolean(row.active), detectionCount: Number(row.detection_count), clearCount: Number(row.clear_count) }, false, immediate);
      await client.query(
        `UPDATE public.meta_ads_findings SET clear_count=$2,detection_count=CASE WHEN $3 THEN 0 ELSE detection_count END,
                active=CASE WHEN $3 THEN FALSE ELSE active END,resolved_at=CASE WHEN $3 THEN NOW() ELSE resolved_at END,updated_at=NOW()
          WHERE id=$1`,
        [row.id, lifecycle.clearCount, lifecycle.resolved],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function evaluateStoredPerformance(companyId: string, accountId: string, selectedAction: string | null, dataThrough: string) {
  const rows = await dailyRows(companyId, accountId, shiftDate(dataThrough, -13), dataThrough);
  const current = aggregateMetaDailyRows(rows.filter((row) => isoDate(row.metric_date) >= shiftDate(dataThrough, -6)), selectedAction);
  const previous = aggregateMetaDailyRows(rows.filter((row) => isoDate(row.metric_date) < shiftDate(dataThrough, -6)), selectedAction);
  const { rows: campaignRows } = await pool.query(
    `SELECT campaign_id,campaign_name,MIN(metric_date) AS first_date,MAX(metric_date) AS last_date,SUM(spend)::numeric AS spend,
            SUM(impressions)::bigint AS impressions,SUM(clicks)::bigint AS clicks,
            CASE WHEN SUM(spend)>0 THEN SUM(purchase_roas*spend)/SUM(spend) ELSE 0 END AS purchase_roas,
            jsonb_agg(actions) AS action_sets
       FROM public.meta_ads_campaign_daily
      WHERE company_id=$1 AND ad_account_id=$2 AND metric_date BETWEEN $3 AND $4
      GROUP BY campaign_id,campaign_name`,
    [companyId, accountId, shiftDate(dataThrough, -6), dataThrough],
  );
  const campaigns: CampaignFindingInput[] = campaignRows.map((row) => {
    const actions = (row.action_sets as Array<Record<string, number>> ?? []);
    const conversions = actions.reduce((sum, value) => sum + actionTotal(value, selectedAction), 0);
    const spend = Number(row.spend);
    const impressions = Number(row.impressions);
    const clicks = Number(row.clicks);
    return {
      campaignId: String(row.campaign_id), campaignName: String(row.campaign_name), start: isoDate(row.first_date), end: isoDate(row.last_date),
      spend, impressions, clicks, ctr: impressions ? round((clicks / impressions) * 100) : 0,
      purchaseRoas: round(Number(row.purchase_roas)), selectedConversions: conversions, cpa: conversions ? round(spend / conversions) : null,
      purchaseCount: actions.reduce((sum, value) => sum + purchaseCount(value), 0), spendShare: current.spend ? spend / current.spend : 0,
      accountPurchaseRoas: current.purchaseRoas, accountPurchaseCount: current.purchaseCount,
      adsManagerUrl: metaAdsManagerUrl(accountId, String(row.campaign_id)),
    };
  });
  const sixtyDayRows = await dailyRows(companyId, accountId, shiftDate(dataThrough, -59), dataThrough);
  const currentThirty = aggregateMetaDailyRows(sixtyDayRows.filter((row) => isoDate(row.metric_date) >= shiftDate(dataThrough, -29)), selectedAction);
  const previousThirty = aggregateMetaDailyRows(sixtyDayRows.filter((row) => isoDate(row.metric_date) < shiftDate(dataThrough, -29)), selectedAction);
  const { rows: configuredTargets } = await pool.query(
    `SELECT s.source_key,m.name,m.unit,m.target_value,m.direction,
            (SELECT ml.target_id::text FROM public.metric_links ml
              JOIN public.bdt_goals g ON g.id=ml.target_id AND g.company_id=m.company_id
             WHERE ml.metric_id=m.id AND ml.target_type='goal' LIMIT 1) AS goal_id
       FROM public.metrics m JOIN public.metric_sources s ON s.metric_id=m.id
      WHERE m.company_id=$1 AND s.integration_id='int-meta' AND m.target_value IS NOT NULL`,
    [companyId],
  );
  const targetValueFor = (key: string, window: FindingWindow): number | null => {
    if (key === 'roas_30d') return window.purchaseRoas;
    if (key === 'cost_per_conversion_30d') return window.cpa;
    if (key === 'selected_conversions_30d') return window.selectedConversions;
    return null;
  };
  const targetInputs: TargetMovementInput[] = currentThirty.spend > 0 && previousThirty.spend > 0
    ? configuredTargets.map((row) => ({
      metricKey: String(row.source_key), label: String(row.name), unit: String(row.unit ?? ''),
      direction: row.direction as TargetMovementInput['direction'], targetValue: Number(row.target_value),
      currentValue: targetValueFor(String(row.source_key), currentThirty),
      previousValue: targetValueFor(String(row.source_key), previousThirty),
      periodStart: currentThirty.start, periodEnd: currentThirty.end,
      goalId: row.goal_id ? String(row.goal_id) : null,
    }))
    : [];
  const candidates = [
    ...evaluatePerformanceFindings({ selectedConversionAction: selectedAction, current, previous, campaigns, accountAdsManagerUrl: metaAdsManagerUrl(accountId) }),
    ...evaluateTargetMovementFindings(targetInputs),
  ];
  await persistCandidates(companyId, accountId, candidates, PERFORMANCE_KINDS);
}

async function updateHealthFindings(companyId: string, accountId: string, lastSuccessfulSyncAt: string | null) {
  const { rows: statuses } = await pool.query(
    `SELECT status,attempt,error_code FROM public.meta_ads_sync_runs WHERE company_id=$1 AND ad_account_id=$2 ORDER BY requested_at DESC LIMIT 10`,
    [companyId, accountId],
  );
  let failures = 0;
  if (statuses[0]?.error_code && statuses[0].status === 'pending') {
    failures = Math.max(1, Number(statuses[0].attempt));
  } else {
    for (const row of statuses) {
      if (row.status !== 'failed') break;
      failures += 1;
    }
    if (statuses[0]?.status === 'failed') failures = Math.max(failures, Number(statuses[0].attempt));
  }
  const failure = syncFailureFinding(failures);
  await persistCandidates(companyId, accountId, failure ? [failure] : [], ['sync_failure']);
  const ageHours = lastSuccessfulSyncAt ? (Date.now() - new Date(lastSuccessfulSyncAt).getTime()) / 3_600_000 : 0;
  const stale = lastSuccessfulSyncAt ? staleDataFinding(ageHours) : null;
  await persistCandidates(companyId, accountId, stale ? [stale] : [], ['stale_data']);
}

export async function recordMetaAdsRunFailure(run: Record<string, unknown>, error: unknown) {
  const safe = safeError(error);
  const attempt = Number(run.attempt);
  const maxAttempts = Number(run.max_attempts);
  const retry = safe.retryable && attempt < maxAttempts;
  const backoffSeconds = Math.min(3600, 30 * (2 ** Math.max(0, attempt - 1)));
  await pool.query(
    `UPDATE public.meta_ads_sync_runs SET status=$2,error_code=$3,error_message=$4,locked_at=NULL,locked_until=NULL,locked_by=NULL,
            available_at=CASE WHEN $2='pending' THEN NOW()+($5 || ' seconds')::interval ELSE available_at END,
            completed_at=CASE WHEN $2='failed' THEN NOW() ELSE NULL END
      WHERE id=$1`,
    [run.id, retry ? 'pending' : 'failed', safe.code, safe.message, String(backoffSeconds)],
  );
  const failure = syncFailureFinding(attempt);
  if (failure) await persistCandidates(String(run.company_id), String(run.ad_account_id), [failure], ['sync_failure']);
}

async function claimOneMetaAdsRecalculationJob(onlyCompanyId?: string): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(
    `UPDATE public.meta_ads_recalculation_jobs SET status='running',attempt=attempt+1,
            started_at=COALESCE(started_at,NOW()),locked_at=NOW(),
            locked_until=NOW()+INTERVAL '10 minutes',locked_by=$1,error_code=NULL,error_message=NULL
      WHERE id=(
        SELECT id FROM public.meta_ads_recalculation_jobs
         WHERE available_at<=NOW() AND ($2::uuid IS NULL OR company_id=$2::uuid)
           AND (status='pending' OR (status='running' AND locked_until<NOW()))
         ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT 1
      ) RETURNING *`,
    [env.WORKER_ID, onlyCompanyId ?? null],
  );
  return rows[0] ?? null;
}

async function releaseSupersededMetaAdsRecalculation(job: Record<string, unknown>) {
  await pool.query(
    `UPDATE public.meta_ads_recalculation_jobs
        SET status='pending',available_at=NOW(),locked_at=NULL,locked_until=NULL,locked_by=NULL
      WHERE id=$1 AND generation<>$2`,
    [job.id, job.generation],
  );
}

export async function processOneMetaAdsRecalculationJob(onlyCompanyId?: string): Promise<boolean> {
  const job = await claimOneMetaAdsRecalculationJob(onlyCompanyId);
  if (!job) return false;
  try {
    const { rows } = await pool.query(
      `SELECT metadata FROM public.integration_connections
        WHERE company_id=$1 AND integration_id='int-meta'`,
      [job.company_id],
    );
    if (!rows.length) throw new Error('meta_not_connected');
    const metadata = (rows[0].metadata ?? {}) as Record<string, unknown>;
    if (String(metadata.ad_account_id ?? '') !== String(job.ad_account_id)) throw new Error('account_changed');
    if (String(metadata.meta_conversion_action_type ?? '') !== String(job.selected_action)) {
      throw new Error('configuration_changed');
    }

    await recalculateMetaAdsDerivedState(String(job.company_id));
    const completed = await pool.query(
      `UPDATE public.meta_ads_recalculation_jobs
          SET status='complete',completed_at=NOW(),locked_at=NULL,locked_until=NULL,locked_by=NULL,
              error_code=NULL,error_message=NULL
        WHERE id=$1 AND generation=$2 RETURNING id`,
      [job.id, job.generation],
    );
    if (!completed.rowCount) await releaseSupersededMetaAdsRecalculation(job);
  } catch (error) {
    const safe = safeError(error);
    const retry = safe.retryable && Number(job.attempt) < Number(job.max_attempts);
    const backoffSeconds = Math.min(3600, 30 * (2 ** Math.max(0, Number(job.attempt) - 1)));
    const updated = await pool.query(
      `UPDATE public.meta_ads_recalculation_jobs
          SET status=$3,error_code=$4,error_message=$5,locked_at=NULL,locked_until=NULL,locked_by=NULL,
              available_at=CASE WHEN $3='pending' THEN NOW()+($6 || ' seconds')::interval ELSE available_at END,
              completed_at=CASE WHEN $3='failed' THEN NOW() ELSE NULL END
        WHERE id=$1 AND generation=$2 RETURNING id`,
      [job.id, job.generation, retry ? 'pending' : 'failed', safe.code, safe.message, String(backoffSeconds)],
    );
    if (!updated.rowCount) await releaseSupersededMetaAdsRecalculation(job);
    console.error('[meta-ads] stored configuration recalculation failed', {
      companyId: String(job.company_id), jobId: String(job.id), code: safe.code, retry,
    });
  }
  return true;
}

export async function claimOneMetaAdsJob(onlyCompanyId?: string): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(
    `UPDATE public.meta_ads_sync_runs SET status='running',
            attempt=attempt+CASE WHEN core_completed_at IS NULL THEN 1 ELSE 0 END,
            started_at=COALESCE(started_at,NOW()),
            locked_at=NOW(),locked_until=NOW()+INTERVAL '10 minutes',locked_by=$1,error_code=NULL,error_message=NULL
      WHERE id=(
        SELECT id FROM public.meta_ads_sync_runs
         WHERE available_at<=NOW() AND ($2::uuid IS NULL OR company_id=$2::uuid)
           AND (status='pending' OR (status='running' AND locked_until<NOW()))
           AND NOT EXISTS (
             SELECT 1 FROM public.integration_connections fixture_connection
              WHERE fixture_connection.company_id=meta_ads_sync_runs.company_id
                AND fixture_connection.integration_id='int-meta'
                AND fixture_connection.metadata ? 'fixture_scenario'
           )
         ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT 1
      ) RETURNING *`,
    [env.WORKER_ID, onlyCompanyId ?? null],
  );
  return rows[0] ?? null;
}

export async function processOneMetaAdsJob(onlyCompanyId?: string): Promise<boolean> {
  const run = await claimOneMetaAdsJob(onlyCompanyId);
  if (!run) return false;
  try {
    const { rows: connections } = await pool.query(
      `SELECT * FROM public.integration_connections WHERE company_id=$1 AND integration_id='int-meta'`, [run.company_id],
    );
    if (!connections.length) throw new Error('meta_not_connected');
    const connection = connections[0];
    const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
    if (String(metadata.ad_account_id ?? '') !== String(run.ad_account_id)) throw new Error('account_changed');
    const accessToken = decrypt(String(connection.access_token_enc));
    const account = await getMetaAdAccount(accessToken, String(run.ad_account_id));
    const timezone = account.timezone || String(metadata.timezone ?? 'UTC');
    const selectedAction = typeof metadata.meta_conversion_action_type === 'string' ? metadata.meta_conversion_action_type : null;
    const companyId = String(run.company_id);
    const accountId = String(run.ad_account_id);

    if (!run.core_completed_at) {
      const dataThrough = latestCompleteDate(new Date(), timezone);
      const { rows: existing } = await pool.query(
        `SELECT MAX(metric_date) AS max_date FROM public.meta_ads_account_daily WHERE company_id=$1 AND ad_account_id=$2`,
        [companyId, accountId],
      );
      const initial = !existing[0]?.max_date;
      const since = initial
        ? shiftDate(dataThrough, -(RETENTION_DAYS - 1))
        : shiftDate(dataThrough, -(ATTRIBUTION_REFRESH_DAYS - 1));
      const history = await fetchMetaAdsHistory(accessToken, accountId, since, dataThrough);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await upsertHistory(client, { companyId, ...history, dataThrough });
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      const preview = await createCanonicalPreview(companyId, accountId, selectedAction, dataThrough);
      const syncedAt = new Date().toISOString();
      await applyStoredMetaCanonicalMetrics(companyId, accountId, preview, syncedAt, dataThrough);
      await evaluateStoredPerformance(companyId, accountId, selectedAction, dataThrough);
      await reconcileDetachedMetaAdsExperiments(companyId, accountId);
      await prepareMetaAdsDeepSegments({ runId: String(run.id), companyId, accountId, dataThrough, initial });
      await pool.query(
        `UPDATE public.meta_ads_sync_runs SET status='pending',core_completed_at=NOW(),data_through=$2,
                diagnostic_coverage='preparing',warnings='[]'::jsonb,available_at=NOW(),error_code=NULL,error_message=NULL,
                locked_at=NULL,locked_until=NULL,locked_by=NULL WHERE id=$1`,
        [run.id, dataThrough],
      );
      await updateHealthFindings(companyId, accountId, syncedAt);
      return true;
    }

    const dataThrough = run.data_through ? isoDate(run.data_through as string | Date) : latestCompleteDate(new Date(), timezone);
    const deep = await processOneMetaAdsDeepSegment({
      runId: String(run.id), companyId, accountId, accessToken, timezone, currency: account.currency,
    });
    if (!deep.terminal) {
      await pool.query(
        `UPDATE public.meta_ads_sync_runs SET status='pending',
                available_at=COALESCE((SELECT MIN(available_at) FROM public.meta_ads_sync_segments
                  WHERE run_id=$1 AND status IN ('pending','submitted')),NOW()+INTERVAL '15 seconds'),
                locked_at=NULL,locked_until=NULL,locked_by=NULL WHERE id=$1`,
        [run.id],
      );
      return true;
    }

    let coverage = deep.coverage;
    const warnings = [...deep.warnings];
    let deepCandidates = coverage === 'current'
      ? await buildDeepFindingCandidates({ companyId, accountId, selectedAction, dataThrough })
      : [];
    try {
      await refreshMetaAdsCreativeMetadata({
        companyId,
        accountId,
        accessToken,
        implicatedAdIds: deepCandidates
          .filter((candidate) => candidate.scope === 'ad' && candidate.scopeId)
          .map((candidate) => candidate.scopeId!),
      });
      if (coverage === 'current') {
        deepCandidates = await buildDeepFindingCandidates({ companyId, accountId, selectedAction, dataThrough });
      }
    } catch (error) {
      warnings.push('Creative thumbnails and metadata could not be refreshed.');
      console.warn('[meta-ads] creative metadata refresh failed', {
        runId: String(run.id), companyId, message: error instanceof Error ? error.message : String(error),
      });
    }
    if (coverage === 'current') {
      await persistCandidates(companyId, accountId, deepCandidates, DEEP_FINDING_KINDS);
      await evaluateMeasuringMetaAdsExperiments(companyId, accountId, dataThrough);
    }
    await pool.query(
      `UPDATE public.meta_ads_sync_runs SET status='complete',completed_at=NOW(),diagnostic_coverage=$2,warnings=$3::jsonb,
              error_code=NULL,error_message=NULL,locked_at=NULL,locked_until=NULL,locked_by=NULL WHERE id=$1`,
      [run.id, coverage, JSON.stringify([...new Set(warnings)])],
    );
    return true;
  } catch (error) {
    console.error('[meta-ads] durable sync failed', {
      runId: String(run.id),
      companyId: String(run.company_id),
      message: error instanceof Error ? error.message : String(error),
    });
    await recordMetaAdsRunFailure(run, error);
    return true;
  }
}

export async function scheduleDailyMetaAdsSyncs(now = new Date(), onlyCompanyId?: string) {
  if (now.getUTCHours() < META_SCHEDULE_HOUR_UTC || (now.getUTCHours() === META_SCHEDULE_HOUR_UTC && now.getUTCMinutes() < META_SCHEDULE_MINUTE_UTC)) return 0;
  const scheduleDate = now.toISOString().slice(0, 10);
  const coalesced = await pool.query(
    `UPDATE public.meta_ads_sync_runs r SET reason=CASE WHEN r.reason='initial_backfill' THEN r.reason ELSE 'daily' END,schedule_date=$1::date
      FROM public.integration_connections c
     WHERE r.company_id=c.company_id AND r.ad_account_id=c.metadata->>'ad_account_id'
       AND c.integration_id='int-meta' AND ($2::uuid IS NULL OR c.company_id=$2::uuid) AND r.status IN ('pending','running')
       AND NOT (c.metadata ? 'fixture_scenario')
       AND NOT EXISTS (
         SELECT 1 FROM public.meta_ads_sync_runs d
          WHERE d.company_id=r.company_id AND d.ad_account_id=r.ad_account_id AND d.reason='daily' AND d.schedule_date=$1::date
       )`,
    [scheduleDate, onlyCompanyId ?? null],
  );
  const { rows } = await pool.query(
    `INSERT INTO public.meta_ads_sync_runs (company_id,ad_account_id,reason,schedule_date)
     SELECT c.company_id,c.metadata->>'ad_account_id','daily',$1::date
       FROM public.integration_connections c
      WHERE c.integration_id='int-meta' AND ($2::uuid IS NULL OR c.company_id=$2::uuid)
        AND NULLIF(c.metadata->>'ad_account_id','') IS NOT NULL
        AND NOT (c.metadata ? 'fixture_scenario')
        AND NOT EXISTS (
          SELECT 1 FROM public.meta_ads_sync_runs existing
           WHERE existing.company_id=c.company_id
             AND existing.ad_account_id=c.metadata->>'ad_account_id'
             AND existing.schedule_date=$1::date
        )
     ON CONFLICT DO NOTHING RETURNING id`,
    [scheduleDate, onlyCompanyId ?? null],
  );
  return rows.length + (coalesced.rowCount ?? 0);
}

export async function refreshMetaAdsHealthFindings() {
  const { rows } = await pool.query(
    `SELECT company_id,metadata->>'ad_account_id' AS ad_account_id,last_synced_at
       FROM public.integration_connections
      WHERE integration_id='int-meta' AND NULLIF(metadata->>'ad_account_id','') IS NOT NULL`,
  );
  for (const row of rows) {
    await updateHealthFindings(String(row.company_id), String(row.ad_account_id), row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null);
  }
  const { rows: workflowCompanies } = await pool.query(
    `SELECT DISTINCT e.company_id,c.metadata->>'ad_account_id' AS current_account_id
       FROM public.meta_ads_experiments e
       LEFT JOIN public.integration_connections c ON c.company_id=e.company_id AND c.integration_id='int-meta'
      WHERE e.status IN ('planned','measuring')`,
  );
  for (const row of workflowCompanies) {
    await reconcileRemovedMetaAdsExperimentOwners(String(row.company_id));
    await reconcileDetachedMetaAdsExperiments(String(row.company_id), row.current_account_id ? String(row.current_account_id) : null);
  }
  return rows.length + workflowCompanies.length;
}

function findingFromRow(row: Record<string, unknown>): MetaAdsFinding {
  return {
    id: String(row.id), fingerprint: String(row.fingerprint), severity: row.severity as MetaAdsFinding['severity'],
    scope: row.scope as MetaAdsFinding['scope'], kind: String(row.kind), title: String(row.title), explanation: String(row.explanation),
    affectedPeriod: { start: row.period_start ? isoDate(row.period_start as string | Date) : null, end: row.period_end ? isoDate(row.period_end as string | Date) : null },
    evidence: (row.evidence ?? {}) as MetaAdsFinding['evidence'], estimatedSpendExposure: Number(row.estimated_spend_exposure),
    action: { kind: row.action_kind as MetaAdsFinding['action']['kind'], label: String(row.action_label), href: String(row.action_href) },
    firstDetectedAt: new Date(String(row.first_detected_at)).toISOString(), lastDetectedAt: new Date(String(row.last_detected_at)).toISOString(),
    episode: Number(row.episode ?? 0), confidence: (row.confidence ?? null) as MetaAdsFinding['confidence'],
    diagnosis: (row.diagnosis ?? null) as MetaAdsFinding['diagnosis'],
    recommendation: (row.recommendation ?? null) as MetaAdsFinding['recommendation'],
    workflowState: (row.workflow_state ?? 'open') as MetaAdsFinding['workflowState'],
  };
}

async function loadGoalContext(companyId: string): Promise<MetaAdsGoalContext[]> {
  const { rows } = await pool.query(
    `SELECT m.id,m.name,m.unit,m.current_value,m.target_value,m.normalized_score,s.source_key,
            cm.id AS owner_id,TRIM(CONCAT(up.first_name,' ',up.last_name)) AS owner_name,
            COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id',g.id,'title',g.title)) FILTER (WHERE g.id IS NOT NULL),'[]') AS goals
       FROM public.metrics m JOIN public.metric_sources s ON s.metric_id=m.id
       LEFT JOIN public.company_members cm ON cm.id=m.owner_member_id
       LEFT JOIN public.user_profiles up ON up.id=cm.user_id
       LEFT JOIN public.metric_links ml ON ml.metric_id=m.id AND ml.target_type='goal'
       LEFT JOIN public.bdt_goals g ON g.id=ml.target_id AND g.company_id=m.company_id
      WHERE m.company_id=$1 AND s.integration_id='int-meta'
      GROUP BY m.id,s.source_key,cm.id,up.first_name,up.last_name ORDER BY s.source_key`,
    [companyId],
  );
  return rows.map((row) => ({
    metricId: String(row.id), metricKey: String(row.source_key), label: String(row.name), unit: String(row.unit),
    currentValue: row.current_value == null ? null : Number(row.current_value), targetValue: row.target_value == null ? null : Number(row.target_value),
    healthScore: row.normalized_score == null ? null : Number(row.normalized_score),
    owner: row.owner_id ? { id: String(row.owner_id), name: String(row.owner_name || 'Unassigned') } : null,
    goals: (row.goals ?? []) as Array<{ id: string; title: string }>,
  }));
}

function emptySummary(currency: string | null): MetaAdsSummary {
  return {
    periodStart: null, periodEnd: null, currency, spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0,
    purchaseRoas: 0, selectedConversions: 0, cpa: null, previous: null,
    deltas: { spendPct: null, ctrPct: null, purchaseRoasPct: null, selectedConversionsPct: null, cpaPct: null },
  };
}

export async function buildMetaAdsBrief(companyId: string): Promise<MetaAdsOperatingBrief> {
  const { rows: connections } = await pool.query(
    `SELECT * FROM public.integration_connections WHERE company_id=$1 AND integration_id='int-meta'`, [companyId],
  );
  const connection = connections[0] ?? null;
  let accountId = connection ? String((connection.metadata ?? {}).ad_account_id ?? '') : '';
  let historical = false;
  if (!accountId) {
    const { rows } = await pool.query(
      `SELECT ad_account_id FROM public.meta_ads_account_daily WHERE company_id=$1 ORDER BY ingested_at DESC LIMIT 1`, [companyId],
    );
    accountId = rows[0]?.ad_account_id ? String(rows[0].ad_account_id) : '';
    historical = Boolean(accountId);
  }
  const selectedAction = connection && typeof connection.metadata?.meta_conversion_action_type === 'string'
    ? String(connection.metadata.meta_conversion_action_type) : null;
  const { rows: accountRows } = accountId ? await pool.query(
    `SELECT * FROM public.meta_ads_account_daily WHERE company_id=$1 AND ad_account_id=$2 ORDER BY metric_date`, [companyId, accountId],
  ) : { rows: [] };
  const dataThrough = accountRows.length ? isoDate(accountRows.at(-1).metric_date) : null;
  const currency = accountRows.at(-1)?.currency ? String(accountRows.at(-1).currency) : connection?.metadata?.currency ? String(connection.metadata.currency) : null;
  const timezone = accountRows.at(-1)?.account_timezone ? String(accountRows.at(-1).account_timezone) : connection?.metadata?.timezone ? String(connection.metadata.timezone) : null;
  const current30Rows = dataThrough ? accountRows.filter((row) => isoDate(row.metric_date) >= shiftDate(dataThrough, -29)) : [];
  const previous30Rows = dataThrough ? accountRows.filter((row) => isoDate(row.metric_date) >= shiftDate(dataThrough, -59) && isoDate(row.metric_date) < shiftDate(dataThrough, -29)) : [];
  const current30 = aggregateMetaDailyRows(current30Rows, selectedAction);
  const previous30 = aggregateMetaDailyRows(previous30Rows, selectedAction);
  const summary: MetaAdsSummary = dataThrough ? {
    ...publicValues(current30), periodStart: current30.start, periodEnd: current30.end, currency,
    previous: previous30Rows.length ? publicValues(previous30) : null,
    deltas: {
      spendPct: percentageChange(current30.spend, previous30Rows.length ? previous30.spend : null),
      ctrPct: percentageChange(current30.ctr, previous30Rows.length ? previous30.ctr : null),
      purchaseRoasPct: percentageChange(current30.purchaseRoas, previous30Rows.length ? previous30.purchaseRoas : null),
      selectedConversionsPct: percentageChange(current30.selectedConversions, previous30Rows.length ? previous30.selectedConversions : null),
      cpaPct: percentageChange(current30.cpa, previous30Rows.length ? previous30.cpa : null),
    },
  } : emptySummary(currency);
  const series: MetaAdsSeriesPoint[] = current30Rows.map((row) => ({ date: isoDate(row.metric_date), ...publicValues(aggregateMetaDailyRows([row], selectedAction)) }));

  const { rows: rawCampaigns } = accountId && dataThrough ? await pool.query(
    `SELECT campaign_id,campaign_name,(array_agg(campaign_status ORDER BY metric_date DESC))[1] AS campaign_status,
            SUM(spend)::numeric AS spend,SUM(impressions)::bigint AS impressions,SUM(clicks)::bigint AS clicks,
            CASE WHEN SUM(spend)>0 THEN SUM(purchase_roas*spend)/SUM(spend) ELSE 0 END AS purchase_roas,jsonb_agg(actions) AS action_sets,
            CASE WHEN SUM(spend) FILTER (WHERE metric_date BETWEEN $5 AND $4)>0
                 THEN SUM(purchase_roas*spend) FILTER (WHERE metric_date BETWEEN $5 AND $4)/SUM(spend) FILTER (WHERE metric_date BETWEEN $5 AND $4) END AS current_week_roas,
            CASE WHEN SUM(spend) FILTER (WHERE metric_date BETWEEN $6 AND $7)>0
                 THEN SUM(purchase_roas*spend) FILTER (WHERE metric_date BETWEEN $6 AND $7)/SUM(spend) FILTER (WHERE metric_date BETWEEN $6 AND $7) END AS previous_week_roas
       FROM public.meta_ads_campaign_daily WHERE company_id=$1 AND ad_account_id=$2 AND metric_date BETWEEN $3 AND $4
      GROUP BY campaign_id,campaign_name ORDER BY SUM(spend) DESC LIMIT 50`,
    [companyId, accountId, shiftDate(dataThrough, -29), dataThrough, shiftDate(dataThrough, -6), shiftDate(dataThrough, -13), shiftDate(dataThrough, -7)],
  ) : { rows: [] };
  const campaigns: MetaAdsCampaignSummary[] = rawCampaigns.map((row) => {
    const spend = Number(row.spend); const impressions = Number(row.impressions); const clicks = Number(row.clicks);
    const conversions = (row.action_sets as Array<Record<string, number>> ?? []).reduce((sum, actions) => sum + actionTotal(actions, selectedAction), 0);
    const roas = round(Number(row.purchase_roas));
    return {
      campaignId: String(row.campaign_id), campaignName: String(row.campaign_name), status: String(row.campaign_status),
      spend: round(spend), impressions, clicks, ctr: impressions ? round((clicks / impressions) * 100) : 0,
      cpc: clicks ? round(spend / clicks) : 0, purchaseRoas: roas, selectedConversions: round(conversions), cpa: conversions ? round(spend / conversions) : null,
      spendShare: current30.spend ? round(spend / current30.spend, 4) : 0,
      purchaseRoasDeltaPct: percentageChange(row.current_week_roas == null ? null : Number(row.current_week_roas), row.previous_week_roas == null ? null : Number(row.previous_week_roas)),
      adsManagerUrl: metaAdsManagerUrl(accountId, String(row.campaign_id)),
    };
  });
  const { rows: runs } = accountId ? await pool.query(
    `SELECT * FROM public.meta_ads_sync_runs WHERE company_id=$1 AND ad_account_id=$2 ORDER BY requested_at DESC LIMIT 1`, [companyId, accountId],
  ) : { rows: [] };
  const latestRun = runs[0] ? shapeSyncRun(runs[0]) : null;
  const lastSuccessfulSyncAt = connection?.last_synced_at ? new Date(connection.last_synced_at).toISOString() : null;
  const { rows: findingRows } = accountId ? await pool.query(
    `SELECT f.*,'open' AS workflow_state FROM public.meta_ads_findings f
      WHERE f.company_id=$1 AND f.ad_account_id=$2 AND f.active=TRUE
        AND NOT EXISTS (SELECT 1 FROM public.meta_ads_finding_decisions d WHERE d.finding_id=f.id AND d.finding_episode=f.episode)
        AND NOT EXISTS (SELECT 1 FROM public.meta_ads_experiments e WHERE e.finding_id=f.id AND e.finding_episode=f.episode)
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,estimated_spend_exposure DESC,last_detected_at DESC`,
    [companyId, accountId],
  ) : { rows: [] };
  const findings = findingRows.map(findingFromRow);
  const availableActions: Record<string, number> = {};
  for (const row of current30Rows) {
    for (const [actionType, value] of Object.entries((row.actions ?? {}) as Record<string, number>)) {
      availableActions[actionType] = (availableActions[actionType] ?? 0) + Number(value || 0);
    }
  }
  const dataAgeHours = lastSuccessfulSyncAt ? round((Date.now() - new Date(lastSuccessfulSyncAt).getTime()) / 3_600_000, 1) : null;
  let state: MetaAdsConnectionHealth['state'] = 'disconnected';
  if (historical) state = 'historical';
  else if (connection && !dataThrough && latestRun && ['pending', 'running'].includes(latestRun.status)) state = 'backfilling';
  else if (connection && dataThrough && latestRun && ['pending', 'running'].includes(latestRun.status)) state = 'refreshing';
  else if (connection && latestRun?.status === 'failed') state = 'failed';
  else if (connection && dataAgeHours != null && dataAgeHours >= 36) state = 'stale';
  else if (connection && summary.spend > 0 && !selectedAction) state = 'needs_configuration';
  else if (connection && dataThrough && summary.spend === 0) state = 'no_spend';
  else if (connection && dataThrough) state = 'healthy';
  else if (connection) state = 'backfilling';
  const health: MetaAdsConnectionHealth = {
    connected: Boolean(connection), state, accountId: accountId || null,
    accountName: accountRows.at(-1)?.account_name ? String(accountRows.at(-1).account_name) : connection?.account_name ? String(connection.account_name).replace(/^Meta Ads · /, '') : null,
    currency, timezone, dataThrough, lastSuccessfulSyncAt,
    lastAttemptedAt: latestRun?.startedAt ?? latestRun?.requestedAt ?? null, dataAgeHours,
    error: latestRun?.status === 'failed' ? latestRun.error : null, adsManagerUrl: accountId ? metaAdsManagerUrl(accountId) : null,
  };
  return {
    connection: health, summary, series, campaigns, goalContext: await loadGoalContext(companyId), findings, topFindings: findings.slice(0, 3),
    selectedConversionAction: selectedAction,
    availableConversionActions: Object.entries(availableActions).sort(([a], [b]) => a.localeCompare(b)).map(([actionType, value]) => ({ actionType, value: round(value) })),
    latestSyncRun: latestRun,
  };
}

export async function buildMetaAdsAttention(companyId: string): Promise<MetaAdsAttention> {
  const [{ rows }, decisions, authoring] = await Promise.all([
    pool.query(
      `SELECT f.*,c.last_synced_at FROM public.meta_ads_findings f
         JOIN public.integration_connections c ON c.company_id=f.company_id AND c.integration_id='int-meta' AND c.metadata->>'ad_account_id'=f.ad_account_id
        WHERE f.company_id=$1 AND f.active=TRUE AND f.severity IN ('warning','critical')
          AND (
            f.kind IN ('sync_failure','stale_data','missing_conversion_configuration')
            OR (
              NOT EXISTS (SELECT 1 FROM public.meta_ads_finding_decisions d WHERE d.finding_id=f.id AND d.finding_episode=f.episode)
              AND NOT EXISTS (SELECT 1 FROM public.meta_ads_experiments e WHERE e.finding_id=f.id AND e.finding_episode=f.episode)
            )
          )
        ORDER BY CASE f.severity WHEN 'critical' THEN 0 ELSE 1 END,f.estimated_spend_exposure DESC,f.last_detected_at DESC`,
      [companyId],
    ),
    getMetaAdsDecisionAttention(companyId),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE d.status IN ('submitted','published_paused'))::int AS approval_count,
         COUNT(*) FILTER (WHERE d.status='failed')::int AS failure_count
       FROM public.meta_ads_campaign_drafts d
       JOIN public.integration_connections c
         ON c.company_id=d.company_id
        AND c.integration_id='int-meta'
        AND c.metadata->>'ad_account_id'=d.ad_account_id
       WHERE d.company_id=$1`,
      [companyId],
    ),
  ]);
  const lastSync = rows[0]?.last_synced_at ? new Date(rows[0].last_synced_at).getTime() : null;
  return {
    count: rows.length, warningCount: rows.filter((row) => row.severity === 'warning').length,
    criticalCount: rows.filter((row) => row.severity === 'critical').length,
    highestPriorityFinding: rows[0] ? findingFromRow(rows[0]) : null,
    dataAgeHours: lastSync ? round((Date.now() - lastSync) / 3_600_000, 1) : null,
    decisionCount: decisions.decisionCount,
    overdueCount: decisions.overdueCount,
    authoringApprovalCount: Number(authoring.rows[0]?.approval_count ?? 0),
    authoringFailureCount: Number(authoring.rows[0]?.failure_count ?? 0),
  };
}

async function recalculateMetaAdsDerivedState(companyId: string): Promise<{ ready: true } | { ready: false; run: MetaAdsSyncRun }> {
  const { rows } = await pool.query(
    `SELECT metadata FROM public.integration_connections WHERE company_id=$1 AND integration_id='int-meta'`, [companyId],
  );
  if (!rows.length) throw new Error('meta_not_connected');
  const metadata = rows[0].metadata ?? {};
  const accountId = String(metadata.ad_account_id ?? '');
  const selectedAction = typeof metadata.meta_conversion_action_type === 'string' ? metadata.meta_conversion_action_type : null;
  const { rows: latest } = await pool.query(
    `SELECT MAX(metric_date) AS data_through FROM public.meta_ads_account_daily WHERE company_id=$1 AND ad_account_id=$2`, [companyId, accountId],
  );
  if (!latest[0]?.data_through) return { ready: false, run: await enqueueMetaAdsSync(companyId, 'initial_backfill') };
  const dataThrough = isoDate(latest[0].data_through);
  const preview = await createCanonicalPreview(companyId, accountId, selectedAction, dataThrough);
  await applyStoredMetaCanonicalMetrics(companyId, accountId, preview, new Date().toISOString(), dataThrough, false);
  await evaluateStoredPerformance(companyId, accountId, selectedAction, dataThrough);
  const { rows: coverageRows } = await pool.query(
    `SELECT diagnostic_coverage FROM public.meta_ads_sync_runs WHERE company_id=$1 AND ad_account_id=$2 ORDER BY requested_at DESC LIMIT 1`,
    [companyId, accountId],
  );
  if (coverageRows[0]?.diagnostic_coverage === 'current') {
    await persistCandidates(companyId, accountId, await buildDeepFindingCandidates({ companyId, accountId, selectedAction, dataThrough }), DEEP_FINDING_KINDS);
    await evaluateMeasuringMetaAdsExperiments(companyId, accountId, dataThrough);
  }
  return { ready: true };
}

export async function recalculateMetaAdsFromStoredHistory(companyId: string) {
  const result = await recalculateMetaAdsDerivedState(companyId);
  if (!result.ready) return result.run;
  return buildMetaAdsBrief(companyId);
}

export async function getStoredMetaCanonicalContext(companyId: string): Promise<{ preview: MetaAdsMetrics; accountId: string }> {
  const { rows } = await pool.query(
    `SELECT metadata FROM public.integration_connections WHERE company_id=$1 AND integration_id='int-meta'`, [companyId],
  );
  if (!rows.length) throw new Error('meta_not_connected');
  const metadata = rows[0].metadata ?? {};
  const accountId = String(metadata.ad_account_id ?? '');
  const selectedAction = typeof metadata.meta_conversion_action_type === 'string' ? metadata.meta_conversion_action_type : null;
  const { rows: latest } = await pool.query(
    `SELECT MAX(metric_date) AS data_through FROM public.meta_ads_account_daily WHERE company_id=$1 AND ad_account_id=$2`, [companyId, accountId],
  );
  if (!latest[0]?.data_through) throw new Error('meta_history_not_ready');
  return { preview: await createCanonicalPreview(companyId, accountId, selectedAction, isoDate(latest[0].data_through)), accountId };
}
