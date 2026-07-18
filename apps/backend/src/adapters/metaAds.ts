// Meta Marketing API adapter
import { createHmac } from 'node:crypto';
import type { MetaAdsMetrics, MetaAdAccount } from '@cybranex/shared-types';
export type { MetaAdsMetrics, MetaAdAccount };

export const META_GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v25.0';
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export function metaAppSecretProof(accessToken: string): string | null {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret || !accessToken) return null;
  return createHmac('sha256', secret).update(accessToken).digest('hex');
}

function authenticatedParams(params: Record<string, string>): Record<string, string> {
  const proof = params.access_token ? metaAppSecretProof(params.access_token) : null;
  return proof ? { ...params, appsecret_proof: proof } : params;
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(authenticatedParams(params))) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function graphGetAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const first = new URL(`${META_GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(authenticatedParams(params))) first.searchParams.set(key, value);
  let next: string | null = first.toString();
  const rows: T[] = [];
  while (next) {
    const res = await fetch(next);
    if (!res.ok) throw new Error(`meta_graph_${res.status}`);
    const page = await res.json() as { data?: T[]; paging?: { next?: string } };
    rows.push(...(page.data ?? []));
    next = page.paging?.next ?? null;
  }
  return rows;
}

export async function listMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const data = await graphGet<{ data: Array<{ id: string; name: string; currency: string; account_status: number; timezone_name?: string }> }>(
    '/me/adaccounts',
    { access_token: accessToken, fields: 'id,name,currency,account_status,timezone_name', limit: '200' },
  );
  return (data.data ?? []).map((a) => ({
    id: a.id, name: a.name, currency: a.currency, accountStatus: a.account_status, timezone: a.timezone_name,
  }));
}

// Fetch a single ad account directly by id. Needed for sandbox accounts, which
// are NOT returned by /me/adaccounts but are reachable directly by their act_ id.
export async function getMetaAdAccount(accessToken: string, adAccountId: string): Promise<MetaAdAccount> {
  const a = await graphGet<{ id: string; name: string; currency: string; account_status: number; timezone_name?: string }>(
    `/${adAccountId}`,
    { access_token: accessToken, fields: 'id,name,currency,account_status,timezone_name' },
  );
  return { id: a.id, name: a.name, currency: a.currency, accountStatus: a.account_status, timezone: a.timezone_name };
}

function actionArray(value: unknown): Array<{ action_type: string; value: string }> {
  if (Array.isArray(value)) return value as Array<{ action_type: string; value: string }>;
  if (typeof value !== 'string' || !value) return [];
  try { return JSON.parse(value) as Array<{ action_type: string; value: string }>; } catch { return []; }
}

export function parseMetaActionMap(value: unknown): Record<string, number> {
  return Object.fromEntries(actionArray(value).map((action) => [action.action_type, Number(action.value) || 0]));
}

export interface MetaAdsDailyRow {
  date: string;
  campaignId?: string;
  campaignName?: string;
  campaignStatus?: string;
  adsetId?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach: number;
  frequency: number;
  outboundClicks: number;
  landingPageViews: number;
  purchaseRoas: number;
  actions: Record<string, number>;
  actionValues: Record<string, number>;
}

export interface MetaAdsDeliveryRow extends MetaAdsDailyRow {
  level: 'adset' | 'ad';
  entityId: string;
  entityName: string;
  campaignId: string;
  campaignName: string;
}

export interface MetaAdsCreativeMetadata {
  adId: string;
  adName: string;
  effectiveStatus: string;
  campaignId: string;
  adsetId: string;
  creativeId: string | null;
  creativeName: string | null;
  creativeFormat: string | null;
  thumbnailUrl: string | null;
}

export interface MetaInsightsReportStatus {
  status: 'pending' | 'complete' | 'failed';
  percentComplete: number;
}

export interface MetaAdsHistoricalData {
  account: Required<Pick<MetaAdAccount, 'id' | 'name' | 'currency'>> & { timezone: string };
  accountRows: MetaAdsDailyRow[];
  campaignRows: MetaAdsDailyRow[];
}

function isoDates(since: string, until: string): string[] {
  const values: string[] = [];
  const cursor = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (cursor <= end) {
    values.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return values;
}

function normalizeInsight(row: Record<string, unknown>, status?: string): MetaAdsDailyRow {
  const actions = parseMetaActionMap(row.actions);
  const outboundClicks = Object.values(parseMetaActionMap(row.outbound_clicks)).reduce((sum, value) => sum + value, 0);
  const landingPageViews = Object.entries(actions).reduce((sum, [key, value]) => (
    key === 'landing_page_view' || key.endsWith('.landing_page_view') ? sum + value : sum
  ), 0);
  return {
    date: String(row.date_start ?? ''),
    campaignId: row.campaign_id ? String(row.campaign_id) : undefined,
    campaignName: row.campaign_name ? String(row.campaign_name) : undefined,
    campaignStatus: status,
    adsetId: row.adset_id ? String(row.adset_id) : undefined,
    adsetName: row.adset_name ? String(row.adset_name) : undefined,
    adId: row.ad_id ? String(row.ad_id) : undefined,
    adName: row.ad_name ? String(row.ad_name) : undefined,
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    ctr: Number(row.ctr) || 0,
    cpc: Number(row.cpc) || 0,
    cpm: Number(row.cpm) || 0,
    reach: Number(row.reach) || 0,
    frequency: Number(row.frequency) || 0,
    outboundClicks,
    landingPageViews,
    purchaseRoas: Number(actionArray(row.purchase_roas)[0]?.value) || 0,
    actions,
    actionValues: parseMetaActionMap(row.action_values),
  };
}

export async function fetchMetaAdsHistory(
  accessToken: string,
  adAccountId: string,
  since: string,
  until: string,
): Promise<MetaAdsHistoricalData> {
  const account = await getMetaAdAccount(accessToken, adAccountId);
  const timezone = account.timezone || 'UTC';
  const timeRange = JSON.stringify({ since, until });
  const insightFields = 'date_start,date_stop,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,outbound_clicks,purchase_roas,actions,action_values';
  const [rawAccountRows, rawCampaignRows, campaigns] = await Promise.all([
    graphGetAll<Record<string, unknown>>(`/${adAccountId}/insights`, {
      access_token: accessToken,
      time_range: timeRange,
      time_increment: '1',
      level: 'account',
      fields: insightFields,
      limit: '100',
    }),
    graphGetAll<Record<string, unknown>>(`/${adAccountId}/insights`, {
      access_token: accessToken,
      time_range: timeRange,
      time_increment: '1',
      level: 'campaign',
      fields: `campaign_id,campaign_name,${insightFields}`,
      limit: '500',
    }),
    graphGetAll<{ id: string; name: string; effective_status?: string }>(`/${adAccountId}/campaigns`, {
      access_token: accessToken,
      fields: 'id,name,effective_status',
      limit: '500',
    }),
  ]);
  const statusByCampaign = new Map(campaigns.map((campaign) => [campaign.id, campaign.effective_status ?? 'UNKNOWN']));
  const accountByDate = new Map(rawAccountRows.map((row) => [String(row.date_start), normalizeInsight(row)]));
  const accountRows = isoDates(since, until).map((date) => accountByDate.get(date) ?? {
    date, spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, reach: 0, frequency: 0,
    outboundClicks: 0, landingPageViews: 0, purchaseRoas: 0, actions: {}, actionValues: {},
  });
  const campaignRows = rawCampaignRows.map((row) => normalizeInsight(row, statusByCampaign.get(String(row.campaign_id)) ?? 'UNKNOWN'));
  return {
    account: { id: account.id, name: account.name, currency: account.currency, timezone },
    accountRows,
    campaignRows,
  };
}

const DELIVERY_INSIGHT_FIELDS = [
  'date_start', 'date_stop', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'reach', 'frequency', 'outbound_clicks',
  'purchase_roas', 'actions', 'action_values',
].join(',');

function graphUsageDelaySeconds(headers: Headers): number {
  const values = [headers.get('x-business-use-case-usage'), headers.get('x-app-usage')].filter(Boolean);
  let maximum = 0;
  for (const value of values) {
    try {
      const parsed = JSON.parse(value!) as Record<string, unknown>;
      const inspect = (input: unknown) => {
        if (Array.isArray(input)) input.forEach(inspect);
        else if (input && typeof input === 'object') {
          for (const [key, nested] of Object.entries(input as Record<string, unknown>)) {
            if (key === 'estimated_time_to_regain_access') maximum = Math.max(maximum, Number(nested) || 0);
            else inspect(nested);
          }
        }
      };
      inspect(parsed);
    } catch {
      // Usage headers are advisory; malformed values must not break ingestion.
    }
  }
  return Math.min(3600, maximum);
}

export async function createMetaInsightsReport(input: {
  accessToken: string;
  adAccountId: string;
  level: 'adset' | 'ad';
  since: string;
  until: string;
  daily: boolean;
}): Promise<{ reportRunId: string; retryAfterSeconds: number }> {
  const url = new URL(`${META_GRAPH_BASE}/${input.adAccountId}/insights`);
  const params: Record<string, string> = {
    access_token: input.accessToken,
    level: input.level,
    fields: DELIVERY_INSIGHT_FIELDS,
    time_range: JSON.stringify({ since: input.since, until: input.until }),
    time_increment: input.daily ? '1' : 'all_days',
    action_report_time: 'conversion',
    async: 'true',
  };
  for (const [key, value] of Object.entries(authenticatedParams(params))) url.searchParams.set(key, value);
  const response = await fetch(url, { method: 'POST' });
  const body = await response.text();
  if (!response.ok) throw new Error(`meta_graph_${response.status}:${body.slice(0, 300)}`);
  const parsed = JSON.parse(body) as { report_run_id?: string };
  if (!parsed.report_run_id) throw new Error('meta_async_report_id_missing');
  return { reportRunId: parsed.report_run_id, retryAfterSeconds: graphUsageDelaySeconds(response.headers) };
}

export async function getMetaInsightsReportStatus(accessToken: string, reportRunId: string): Promise<MetaInsightsReportStatus> {
  const value = await graphGet<{ async_status?: string; async_percent_completion?: number; id?: string }>(`/${reportRunId}`, {
    access_token: accessToken,
    fields: 'id,async_status,async_percent_completion',
  });
  const raw = String(value.async_status ?? '').toLowerCase();
  if (raw.includes('complete')) return { status: 'complete', percentComplete: 100 };
  if (raw.includes('fail') || raw.includes('skip')) return { status: 'failed', percentComplete: Number(value.async_percent_completion) || 0 };
  return { status: 'pending', percentComplete: Number(value.async_percent_completion) || 0 };
}

export async function downloadMetaInsightsReport(
  accessToken: string,
  reportRunId: string,
  level: 'adset' | 'ad',
): Promise<MetaAdsDeliveryRow[]> {
  const rows = await graphGetAll<Record<string, unknown>>(`/${reportRunId}/insights`, {
    access_token: accessToken,
    limit: '500',
  });
  return rows.flatMap((row) => {
    const normalized = normalizeInsight(row);
    const entityId = level === 'ad' ? normalized.adId : normalized.adsetId;
    const entityName = level === 'ad' ? normalized.adName : normalized.adsetName;
    if (!entityId || !entityName || !normalized.campaignId || !normalized.campaignName) return [];
    return [{ ...normalized, level, entityId, entityName, campaignId: normalized.campaignId, campaignName: normalized.campaignName }];
  });
}

function safeThumbnail(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    url.searchParams.delete('access_token');
    return url.toString();
  } catch {
    return null;
  }
}

export async function fetchMetaAdMetadata(accessToken: string, adIds: string[]): Promise<MetaAdsCreativeMetadata[]> {
  // Callers order implicated ads before the trailing-spend sample. Keep that
  // priority while bounding a single refresh and batching Graph requests.
  const unique = [...new Set(adIds.filter(Boolean))].slice(0, 200);
  const results: MetaAdsCreativeMetadata[] = [];
  for (let index = 0; index < unique.length; index += 50) {
    const ids = unique.slice(index, index + 50);
    const values = await graphGet<Record<string, {
      id?: string; name?: string; effective_status?: string; campaign_id?: string; adset_id?: string;
      creative?: { id?: string; name?: string; thumbnail_url?: string; object_type?: string };
    }>>('/', {
      access_token: accessToken,
      ids: ids.join(','),
      fields: 'id,name,effective_status,campaign_id,adset_id,creative{id,name,thumbnail_url,object_type}',
    });
    for (const id of ids) {
      const row = values[id];
      if (!row?.id || !row.campaign_id || !row.adset_id) continue;
      results.push({
        adId: row.id,
        adName: row.name || row.id,
        effectiveStatus: row.effective_status || 'UNKNOWN',
        campaignId: row.campaign_id,
        adsetId: row.adset_id,
        creativeId: row.creative?.id ?? null,
        creativeName: row.creative?.name ?? null,
        creativeFormat: row.creative?.object_type ?? null,
        thumbnailUrl: safeThumbnail(row.creative?.thumbnail_url),
      });
    }
  }
  return results;
}

export function selectMetaConversion(
  spend: number,
  actions: Array<{ actionType: string; value: number }>,
  selectedAction: string | null,
): { conversions: number; cpa: number | null } {
  if (!selectedAction) return { conversions: 0, cpa: null };
  const conversions = actions.find(action => action.actionType === selectedAction)?.value ?? 0;
  return {
    conversions,
    cpa: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : null,
  };
}

export async function fetchMetaAdsMetrics(
  accessToken: string,
  adAccountId: string,
  selectedConversionAction?: string | null,
): Promise<MetaAdsMetrics> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const until = new Date().toISOString().split('T')[0];
  const timeRange = JSON.stringify({ since, until });

  // Account-level insights
  const insightsRes = await graphGet<{ data: Array<Record<string, string>> }>(
    `/${adAccountId}/insights`,
    {
      access_token: accessToken,
      time_range: timeRange,
      fields: 'spend,impressions,clicks,ctr,cpc,purchase_roas,actions',
      level: 'account',
    },
  );

  const ins = insightsRes.data?.[0] ?? {};
  const spend30d = parseFloat(ins.spend ?? '0');
  const impressions30d = parseInt(ins.impressions ?? '0');
  const clicks30d = parseInt(ins.clicks ?? '0');
  const ctr = parseFloat(ins.ctr ?? '0');
  const cpc = parseFloat(ins.cpc ?? '0');

  // ROAS from purchase_roas action value
  const roas = parseFloat(actionArray(ins.purchase_roas)[0]?.value ?? '0');
  const conversionActions = actionArray(ins.actions)
    .map(action => ({ actionType: action.action_type, value: Number(action.value) || 0 }))
    .sort((a, b) => a.actionType.localeCompare(b.actionType));
  const selected = selectedConversionAction?.trim() || null;
  const selectedMetrics = selectMetaConversion(spend30d, conversionActions, selected);
  const conversions30d = selectedMetrics.conversions;
  const cpa = selectedMetrics.cpa;

  // Campaign breakdown
  const campaignRes = await graphGet<{ data: Array<Record<string, string>> }>(
    `/${adAccountId}/insights`,
    {
      access_token: accessToken,
      time_range: timeRange,
      fields: 'campaign_name,spend,purchase_roas,actions',
      level: 'campaign',
      limit: '5',
      sort: '["spend_descending"]',
    },
  );

  const topCampaigns = (campaignRes.data ?? []).map((c) => {
    let cr = 0;
    cr = parseFloat(actionArray(c.purchase_roas)[0]?.value ?? '0');
    let cv = 0;
    if (selected) cv = Number(actionArray(c.actions).find(action => action.action_type === selected)?.value ?? 0);
    return { name: c.campaign_name ?? 'Unknown', spend: parseFloat(c.spend ?? '0'), roas: cr, conversions: cv };
  });

  // Active campaign count
  const activeCampaignsRes = await graphGet<{ data: Array<{ id: string }> }>(
    `/${adAccountId}/campaigns`,
    { access_token: accessToken, effective_status: '["ACTIVE"]', limit: '100' },
  );

  const account = await getMetaAdAccount(accessToken, adAccountId);
  return {
    spend30d: Math.round(spend30d * 100) / 100,
    impressions30d,
    clicks30d,
    ctr: Math.round(ctr * 100) / 100,
    cpc: Math.round(cpc * 100) / 100,
    roas: Math.round(roas * 100) / 100,
    conversions30d,
    cpa,
    currency: account.currency,
    selectedConversionAction: selected,
    conversionActions,
    activeCampaigns: activeCampaignsRes.data?.length ?? 0,
    topCampaigns,
  };
}

export function getMetaOAuthUrl(state: string): string {
  const appId = process.env.META_APP_ID ?? '';
  const redirectUri = process.env.META_REDIRECT_URI ?? 'http://localhost:8080/api/integrations/meta/callback';
  const scope = 'ads_read,ads_management,business_management,pages_show_list,pages_read_engagement,pages_manage_ads,instagram_basic';
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&response_type=code`;
}

export interface MetaOAuthToken {
  accessToken: string;
  expiresAt: string | null;
}

function tokenResult(data: { access_token: string; expires_in?: number }): MetaOAuthToken {
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in && data.expires_in > 0
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null,
  };
}

export async function exchangeMetaCode(code: string): Promise<MetaOAuthToken> {
  const appId = process.env.META_APP_ID ?? '';
  const appSecret = process.env.META_APP_SECRET ?? '';
  const redirectUri = process.env.META_REDIRECT_URI ?? 'http://localhost:8080/api/integrations/meta/callback';

  const res = await fetch(
    `${META_GRAPH_BASE}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`,
  );
  if (!res.ok) throw new Error(`Meta token exchange failed: ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in?: number };

  // Exchange short-lived for long-lived token (60 days)
  const longRes = await fetch(
    `${META_GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${data.access_token}`,
  );
  if (!longRes.ok) return tokenResult(data); // Fall back to short-lived.
  const longData = await longRes.json() as { access_token: string; expires_in?: number };
  return tokenResult(longData);
}
