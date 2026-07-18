import type { PoolClient } from 'pg';
import {
  createMetaInsightsReport,
  downloadMetaInsightsReport,
  fetchMetaAdMetadata,
  getMetaInsightsReportStatus,
  type MetaAdsDeliveryRow,
} from '../../adapters/metaAds.js';
import { pool } from '../../db.js';
import { evaluateDeepDiagnostics, evaluateDeepPerformanceFindings, type DeepComparison, type DeepWindow } from './deepFindings.js';
import type { FindingCandidate } from './findings.js';

const DEEP_RETENTION_DAYS = 60;

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoDate(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function selectedConversions(actions: Record<string, number> | null | undefined, action: string | null): number {
  return action && actions ? Number(actions[action]) || 0 : 0;
}

function purchaseCount(actions: Record<string, number> | null | undefined): number {
  return Object.entries(actions ?? {}).reduce((sum, [key, value]) => (
    key.toLowerCase() === 'purchase' || key.toLowerCase().endsWith('.purchase') ? sum + (Number(value) || 0) : sum
  ), 0);
}

function adsManagerUrl(accountId: string, input: { campaignId?: string; adsetId?: string | null; adId?: string | null }): string {
  const url = new URL('https://www.facebook.com/adsmanager/manage/campaigns');
  url.searchParams.set('act', accountId.replace(/^act_/, ''));
  if (input.campaignId) url.searchParams.set('selected_campaign_ids', input.campaignId);
  if (input.adsetId) url.searchParams.set('selected_adset_ids', input.adsetId);
  if (input.adId) url.searchParams.set('selected_ad_ids', input.adId);
  return url.toString();
}

export async function prepareMetaAdsDeepSegments(input: {
  runId: string;
  companyId: string;
  accountId: string;
  dataThrough: string;
  initial: boolean;
}) {
  const dailySince = shiftDate(input.dataThrough, input.initial ? -(DEEP_RETENTION_DAYS - 1) : -6);
  const currentStart = shiftDate(input.dataThrough, -6);
  const previousStart = shiftDate(input.dataThrough, -13);
  const previousEnd = shiftDate(input.dataThrough, -7);
  const segments = (['adset', 'ad'] as const).flatMap((level) => [
    { level, kind: 'daily', since: dailySince, until: input.dataThrough },
    { level, kind: 'current_window', since: currentStart, until: input.dataThrough },
    { level, kind: 'previous_window', since: previousStart, until: previousEnd },
  ]);
  for (const segment of segments) {
    await pool.query(
      `INSERT INTO public.meta_ads_sync_segments
         (run_id,company_id,ad_account_id,level,segment_kind,since_date,until_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (run_id,level,segment_kind) DO NOTHING`,
      [input.runId, input.companyId, input.accountId, segment.level, segment.kind, segment.since, segment.until],
    );
  }
}

async function upsertDeliveryRows(client: PoolClient, input: {
  companyId: string;
  accountId: string;
  accountTimezone: string;
  currency: string;
  level: 'adset' | 'ad';
  rows: MetaAdsDeliveryRow[];
  kind: 'daily' | 'current_window' | 'previous_window';
  since: string;
  until: string;
}) {
  const data = input.rows.map((row) => ({
    level: row.level,
    entity_id: row.entityId,
    metric_date: row.date,
    entity_name: row.entityName,
    entity_status: row.campaignStatus ?? 'UNKNOWN',
    campaign_id: row.campaignId,
    campaign_name: row.campaignName,
    adset_id: row.adsetId ?? (row.level === 'adset' ? row.entityId : null),
    adset_name: row.adsetName ?? (row.level === 'adset' ? row.entityName : null),
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    cpc: row.cpc,
    cpm: row.cpm,
    reach: row.reach,
    frequency: row.frequency,
    outbound_clicks: row.outboundClicks,
    landing_page_views: row.landingPageViews,
    purchase_roas: row.purchaseRoas,
    actions: row.actions,
    action_values: row.actionValues,
  }));
  if (input.kind === 'daily') {
    await client.query(
      `DELETE FROM public.meta_ads_delivery_daily
        WHERE company_id=$1 AND ad_account_id=$2 AND level=$3 AND metric_date BETWEEN $4 AND $5`,
      [input.companyId, input.accountId, input.level, input.since, input.until],
    );
    await client.query(
      `DELETE FROM public.meta_ads_delivery_daily
        WHERE company_id=$1 AND ad_account_id=$2 AND metric_date<$3`,
      [input.companyId, input.accountId, shiftDate(input.until, -(DEEP_RETENTION_DAYS - 1))],
    );
    if (!data.length) return;
    await client.query(
      `INSERT INTO public.meta_ads_delivery_daily
         (company_id,ad_account_id,level,entity_id,metric_date,entity_name,entity_status,campaign_id,campaign_name,
          adset_id,adset_name,currency,account_timezone,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,
          outbound_clicks,landing_page_views,purchase_roas,actions,action_values,ingested_at)
       SELECT $1,$2,r.level,r.entity_id,r.metric_date::date,r.entity_name,r.entity_status,r.campaign_id,r.campaign_name,
              r.adset_id,r.adset_name,$3,$4,r.spend,r.impressions,r.clicks,r.ctr,r.cpc,r.cpm,r.reach,r.frequency,
              r.outbound_clicks,r.landing_page_views,r.purchase_roas,r.actions,r.action_values,NOW()
         FROM jsonb_to_recordset($5::jsonb) AS r(
           level text,entity_id text,metric_date text,entity_name text,entity_status text,campaign_id text,campaign_name text,
           adset_id text,adset_name text,spend numeric,impressions bigint,clicks bigint,ctr numeric,cpc numeric,cpm numeric,
           reach bigint,frequency numeric,outbound_clicks bigint,landing_page_views bigint,purchase_roas numeric,actions jsonb,action_values jsonb)
       ON CONFLICT (company_id,ad_account_id,level,entity_id,metric_date) DO UPDATE SET
         entity_name=EXCLUDED.entity_name,entity_status=EXCLUDED.entity_status,campaign_id=EXCLUDED.campaign_id,
         campaign_name=EXCLUDED.campaign_name,adset_id=EXCLUDED.adset_id,adset_name=EXCLUDED.adset_name,
         currency=EXCLUDED.currency,account_timezone=EXCLUDED.account_timezone,spend=EXCLUDED.spend,
         impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,ctr=EXCLUDED.ctr,cpc=EXCLUDED.cpc,cpm=EXCLUDED.cpm,
         reach=EXCLUDED.reach,frequency=EXCLUDED.frequency,outbound_clicks=EXCLUDED.outbound_clicks,
         landing_page_views=EXCLUDED.landing_page_views,purchase_roas=EXCLUDED.purchase_roas,actions=EXCLUDED.actions,
         action_values=EXCLUDED.action_values,ingested_at=NOW()`,
      [input.companyId, input.accountId, input.currency, input.accountTimezone, JSON.stringify(data)],
    );
  } else {
    await client.query(
      `DELETE FROM public.meta_ads_delivery_windows
        WHERE company_id=$1 AND ad_account_id=$2 AND level=$3 AND window_start=$4 AND window_end=$5`,
      [input.companyId, input.accountId, input.level, input.since, input.until],
    );
    if (!data.length) return;
    await client.query(
      `INSERT INTO public.meta_ads_delivery_windows
         (company_id,ad_account_id,level,entity_id,window_start,window_end,entity_name,campaign_id,campaign_name,
          adset_id,adset_name,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,outbound_clicks,
          landing_page_views,purchase_roas,actions,action_values,ingested_at)
       SELECT $1,$2,r.level,r.entity_id,$3::date,$4::date,r.entity_name,r.campaign_id,r.campaign_name,
              r.adset_id,r.adset_name,r.spend,r.impressions,r.clicks,r.ctr,r.cpc,r.cpm,r.reach,r.frequency,
              r.outbound_clicks,r.landing_page_views,r.purchase_roas,r.actions,r.action_values,NOW()
         FROM jsonb_to_recordset($5::jsonb) AS r(
           level text,entity_id text,metric_date text,entity_name text,entity_status text,campaign_id text,campaign_name text,
           adset_id text,adset_name text,spend numeric,impressions bigint,clicks bigint,ctr numeric,cpc numeric,cpm numeric,
           reach bigint,frequency numeric,outbound_clicks bigint,landing_page_views bigint,purchase_roas numeric,actions jsonb,action_values jsonb)
       ON CONFLICT (company_id,ad_account_id,level,entity_id,window_start,window_end) DO UPDATE SET
         entity_name=EXCLUDED.entity_name,campaign_id=EXCLUDED.campaign_id,campaign_name=EXCLUDED.campaign_name,
         adset_id=EXCLUDED.adset_id,adset_name=EXCLUDED.adset_name,spend=EXCLUDED.spend,impressions=EXCLUDED.impressions,
         clicks=EXCLUDED.clicks,ctr=EXCLUDED.ctr,cpc=EXCLUDED.cpc,cpm=EXCLUDED.cpm,reach=EXCLUDED.reach,
         frequency=EXCLUDED.frequency,outbound_clicks=EXCLUDED.outbound_clicks,landing_page_views=EXCLUDED.landing_page_views,
         purchase_roas=EXCLUDED.purchase_roas,actions=EXCLUDED.actions,action_values=EXCLUDED.action_values,ingested_at=NOW()`,
      [input.companyId, input.accountId, input.since, input.until, JSON.stringify(data)],
    );
  }
  await client.query(
    `INSERT INTO public.meta_ads_delivery_entities
       (company_id,ad_account_id,level,entity_id,entity_name,effective_status,campaign_id,campaign_name,adset_id,adset_name,last_seen_at)
     SELECT DISTINCT $1::uuid,$2,r.level,r.entity_id,r.entity_name,r.entity_status,r.campaign_id,r.campaign_name,r.adset_id,r.adset_name,NOW()
       FROM jsonb_to_recordset($3::jsonb) AS r(level text,entity_id text,entity_name text,entity_status text,campaign_id text,campaign_name text,adset_id text,adset_name text)
     ON CONFLICT (company_id,ad_account_id,level,entity_id) DO UPDATE SET
       entity_name=EXCLUDED.entity_name,effective_status=EXCLUDED.effective_status,campaign_id=EXCLUDED.campaign_id,
       campaign_name=EXCLUDED.campaign_name,adset_id=EXCLUDED.adset_id,adset_name=EXCLUDED.adset_name,last_seen_at=NOW()`,
    [input.companyId, input.accountId, JSON.stringify(data)],
  );
}

async function failSegment(segment: Record<string, unknown>, error: unknown) {
  const attempt = Number(segment.attempt) + 1;
  const maxAttempts = Number(segment.max_attempts);
  const retry = attempt < maxAttempts;
  const message = error instanceof Error ? error.message : String(error);
  const code = /429|rate/i.test(message) ? 'meta_rate_limited' : /401|403|oauth|token/i.test(message) ? 'meta_auth_expired' : 'meta_deep_report_failed';
  await pool.query(
    `UPDATE public.meta_ads_sync_segments
        SET status=$2,attempt=$3,report_run_id=NULL,error_code=$4,error_message=$5,
            available_at=CASE WHEN $2='pending' THEN NOW()+LEAST(3600,30*POWER(2,$3-1))*INTERVAL '1 second' ELSE available_at END,
            completed_at=CASE WHEN $2='failed' THEN NOW() ELSE NULL END
      WHERE id=$1`,
    [segment.id, retry ? 'pending' : 'failed', attempt, code, code === 'meta_auth_expired' ? 'Meta authorization expired.' : 'Deep Meta diagnostics could not be refreshed.'],
  );
}

export async function processOneMetaAdsDeepSegment(input: {
  runId: string;
  companyId: string;
  accountId: string;
  accessToken: string;
  timezone: string;
  currency: string;
}): Promise<{ terminal: boolean; coverage: 'current' | 'partial'; warnings: string[] }> {
  const { rows: all } = await pool.query(
    `SELECT * FROM public.meta_ads_sync_segments WHERE run_id=$1 ORDER BY
       CASE status WHEN 'submitted' THEN 0 WHEN 'pending' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END,created_at`,
    [input.runId],
  );
  const segment = all.find((row) => ['pending', 'submitted'].includes(String(row.status)) && new Date(String(row.available_at)).getTime() <= Date.now());
  if (!segment) {
    const terminal = all.length > 0 && all.every((row) => ['complete', 'failed'].includes(String(row.status)));
    return { terminal, coverage: all.some((row) => row.status === 'failed') ? 'partial' : 'current', warnings: all.filter((row) => row.status === 'failed').map(() => 'Some ad-level diagnostics could not be refreshed.') };
  }
  try {
    if (segment.status === 'pending') {
      const report = await createMetaInsightsReport({
        accessToken: input.accessToken,
        adAccountId: input.accountId,
        level: segment.level as 'adset' | 'ad',
        since: isoDate(segment.since_date as string | Date),
        until: isoDate(segment.until_date as string | Date),
        daily: segment.segment_kind === 'daily',
      });
      await pool.query(
        `UPDATE public.meta_ads_sync_segments SET status='submitted',report_run_id=$2,submitted_at=NOW(),attempt=attempt+1,
                available_at=NOW()+($3 || ' seconds')::interval,error_code=NULL,error_message=NULL WHERE id=$1`,
        [segment.id, report.reportRunId, String(Math.max(15, report.retryAfterSeconds))],
      );
    } else {
      const reportRunId = String(segment.report_run_id ?? '');
      if (!reportRunId) throw new Error('meta_async_report_id_missing');
      const status = await getMetaInsightsReportStatus(input.accessToken, reportRunId);
      if (status.status === 'failed') throw new Error('meta_async_report_failed');
      if (status.status === 'pending') {
        await pool.query(`UPDATE public.meta_ads_sync_segments SET available_at=NOW()+INTERVAL '15 seconds' WHERE id=$1`, [segment.id]);
      } else {
        const rows = await downloadMetaInsightsReport(input.accessToken, reportRunId, segment.level as 'adset' | 'ad');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await upsertDeliveryRows(client, {
            companyId: input.companyId, accountId: input.accountId, accountTimezone: input.timezone, currency: input.currency,
            level: segment.level as 'adset' | 'ad',
            rows, kind: segment.segment_kind as 'daily' | 'current_window' | 'previous_window',
            since: isoDate(segment.since_date as string | Date), until: isoDate(segment.until_date as string | Date),
          });
          await client.query(`UPDATE public.meta_ads_sync_segments SET status='complete',completed_at=NOW(),error_code=NULL,error_message=NULL WHERE id=$1`, [segment.id]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    }
  } catch (error) {
    await failSegment(segment, error);
  }
  const { rows: after } = await pool.query(`SELECT status FROM public.meta_ads_sync_segments WHERE run_id=$1`, [input.runId]);
  const terminal = after.length > 0 && after.every((row) => ['complete', 'failed'].includes(String(row.status)));
  return {
    terminal,
    coverage: after.some((row) => row.status === 'failed') ? 'partial' : 'current',
    warnings: after.some((row) => row.status === 'failed') ? ['Some ad-level diagnostics could not be refreshed.'] : [],
  };
}

export async function refreshMetaAdsCreativeMetadata(input: {
  companyId: string;
  accountId: string;
  accessToken: string;
  implicatedAdIds?: string[];
}) {
  const { rows } = await pool.query(
    `WITH top_ads AS (
       SELECT entity_id,SUM(spend)::numeric AS spend
         FROM public.meta_ads_delivery_daily
        WHERE company_id=$1 AND ad_account_id=$2 AND level='ad' AND metric_date>=CURRENT_DATE-29
        GROUP BY entity_id ORDER BY SUM(spend) DESC LIMIT 100
     )
     SELECT entity_id FROM top_ads
     UNION
     SELECT scope_id AS entity_id FROM public.meta_ads_findings
      WHERE company_id=$1 AND ad_account_id=$2 AND scope='ad' AND active=TRUE AND scope_id IS NOT NULL`,
    [input.companyId, input.accountId],
  );
  const adIds = [...new Set([
    ...(input.implicatedAdIds ?? []),
    ...rows.map((row) => String(row.entity_id)),
  ].filter(Boolean))];
  if (!adIds.length) return;
  const metadata = await fetchMetaAdMetadata(input.accessToken, adIds);
  for (const item of metadata) {
    await pool.query(
      `UPDATE public.meta_ads_delivery_entities SET effective_status=$4,creative_id=$5,creative_name=$6,
              creative_format=$7,thumbnail_url=$8,thumbnail_refreshed_at=NOW(),last_seen_at=NOW()
        WHERE company_id=$1 AND ad_account_id=$2 AND level='ad' AND entity_id=$3`,
      [input.companyId, input.accountId, item.adId, item.effectiveStatus, item.creativeId, item.creativeName, item.creativeFormat, item.thumbnailUrl],
    );
  }
}

function windowFromRow(row: Record<string, unknown>, selectedAction: string | null, parent?: Record<string, unknown>): DeepWindow {
  const actions = (row.actions ?? {}) as Record<string, number>;
  const spend = Number(row.spend);
  const conversions = selectedConversions(actions, selectedAction);
  const parentConversions = selectedConversions((parent?.actions ?? {}) as Record<string, number>, selectedAction);
  const parentSpend = Number(parent?.spend ?? spend);
  const level = row.level as 'adset' | 'ad';
  const adsetId = row.adset_id ? String(row.adset_id) : level === 'adset' ? String(row.entity_id) : null;
  const adsetName = row.adset_name ? String(row.adset_name) : level === 'adset' ? String(row.entity_name) : null;
  return {
    start: isoDate(row.window_start as string | Date), end: isoDate(row.window_end as string | Date), level,
    entityId: String(row.entity_id), entityName: String(row.entity_name), campaignId: String(row.campaign_id), campaignName: String(row.campaign_name),
    adsetId, adsetName,
    creativeId: row.creative_id ? String(row.creative_id) : null, creativeName: row.creative_name ? String(row.creative_name) : null,
    creativeFormat: row.creative_format ? String(row.creative_format) : null, thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
    spend: round(spend), impressions: Number(row.impressions), clicks: Number(row.clicks), ctr: round(Number(row.ctr)), cpc: round(Number(row.cpc)),
    cpm: round(Number(row.cpm)), reach: Number(row.reach), frequency: round(Number(row.frequency)), outboundClicks: Number(row.outbound_clicks),
    landingPageViews: Number(row.landing_page_views), purchaseRoas: round(Number(row.purchase_roas)), purchaseCount: purchaseCount(actions),
    selectedConversions: round(conversions), cpa: conversions > 0 ? round(spend / conversions) : null,
    parentSpend: round(parentSpend), parentCpa: parentConversions > 0 ? round(parentSpend / parentConversions) : null,
    adsManagerUrl: adsManagerUrl(String(row.ad_account_id), { campaignId: String(row.campaign_id), adsetId, adId: level === 'ad' ? String(row.entity_id) : null }),
    measurementScopeId: adsetId ?? String(row.campaign_id), measurementScopeName: adsetName ?? String(row.campaign_name),
  };
}

export async function buildDeepFindingCandidates(input: {
  companyId: string;
  accountId: string;
  selectedAction: string | null;
  dataThrough: string;
}): Promise<FindingCandidate[]> {
  const currentStart = shiftDate(input.dataThrough, -6);
  const previousStart = shiftDate(input.dataThrough, -13);
  const previousEnd = shiftDate(input.dataThrough, -7);
  const { rows } = await pool.query(
    `SELECT w.*,e.creative_id,e.creative_name,e.creative_format,e.thumbnail_url
       FROM public.meta_ads_delivery_windows w
       LEFT JOIN public.meta_ads_delivery_entities e ON e.company_id=w.company_id AND e.ad_account_id=w.ad_account_id
        AND e.level=w.level AND e.entity_id=w.entity_id
      WHERE w.company_id=$1 AND w.ad_account_id=$2
        AND ((w.window_start=$3 AND w.window_end=$4) OR (w.window_start=$5 AND w.window_end=$6))`,
    [input.companyId, input.accountId, currentStart, input.dataThrough, previousStart, previousEnd],
  );
  const key = (row: Record<string, unknown>) => `${row.level}:${row.entity_id}:${isoDate(row.window_start as string | Date)}`;
  const byKey = new Map(rows.map((row) => [key(row), row]));
  const parentCurrent = new Map(rows.filter((row) => row.level === 'adset' && isoDate(row.window_start) === currentStart).map((row) => [String(row.entity_id), row]));
  const parentPrevious = new Map(rows.filter((row) => row.level === 'adset' && isoDate(row.window_start) === previousStart).map((row) => [String(row.entity_id), row]));
  const comparisons: DeepComparison[] = [];
  for (const row of rows.filter((value) => isoDate(value.window_start) === currentStart)) {
    const previous = byKey.get(`${row.level}:${row.entity_id}:${previousStart}`);
    const adsetId = row.adset_id ? String(row.adset_id) : String(row.entity_id);
    comparisons.push({
      current: windowFromRow(row, input.selectedAction, row.level === 'ad' ? parentCurrent.get(adsetId) : row),
      previous: previous ? windowFromRow(previous, input.selectedAction, previous.level === 'ad' ? parentPrevious.get(adsetId) : previous) : null,
    });
  }
  return [
    ...evaluateDeepPerformanceFindings({ comparisons, selectedConversionAction: input.selectedAction }),
    ...evaluateDeepDiagnostics({ comparisons }),
  ];
}

export const DEEP_FINDING_KINDS = ['ad_response_decline', 'ad_conversion_outlier', 'delivery_cost_pressure', 'landing_page_loss'];
