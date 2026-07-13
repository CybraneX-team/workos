// Meta Marketing API adapter
import type { MetaAdsMetrics, MetaAdAccount } from '@cybranex/shared-types';
export type { MetaAdsMetrics, MetaAdAccount };

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v25.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function listMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const data = await graphGet<{ data: Array<{ id: string; name: string; currency: string; account_status: number }> }>(
    '/me/adaccounts',
    { access_token: accessToken, fields: 'id,name,currency,account_status', limit: '200' },
  );
  return (data.data ?? []).map((a) => ({
    id: a.id, name: a.name, currency: a.currency, accountStatus: a.account_status,
  }));
}

// Fetch a single ad account directly by id. Needed for sandbox accounts, which
// are NOT returned by /me/adaccounts but are reachable directly by their act_ id.
export async function getMetaAdAccount(accessToken: string, adAccountId: string): Promise<MetaAdAccount> {
  const a = await graphGet<{ id: string; name: string; currency: string; account_status: number }>(
    `/${adAccountId}`,
    { access_token: accessToken, fields: 'id,name,currency,account_status' },
  );
  return { id: a.id, name: a.name, currency: a.currency, accountStatus: a.account_status };
}

function actionArray(value: unknown): Array<{ action_type: string; value: string }> {
  if (Array.isArray(value)) return value as Array<{ action_type: string; value: string }>;
  if (typeof value !== 'string' || !value) return [];
  try { return JSON.parse(value) as Array<{ action_type: string; value: string }>; } catch { return []; }
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
  const scope = 'ads_read,ads_management,business_management';
  return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&response_type=code`;
}

export async function exchangeMetaCode(code: string): Promise<string> {
  const appId = process.env.META_APP_ID ?? '';
  const appSecret = process.env.META_APP_SECRET ?? '';
  const redirectUri = process.env.META_REDIRECT_URI ?? 'http://localhost:8080/api/integrations/meta/callback';

  const res = await fetch(
    `${GRAPH_BASE}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`,
  );
  if (!res.ok) throw new Error(`Meta token exchange failed: ${await res.text()}`);
  const data = await res.json() as { access_token: string };

  // Exchange short-lived for long-lived token (60 days)
  const longRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${data.access_token}`,
  );
  if (!longRes.ok) return data.access_token; // Fall back to short-lived
  const longData = await longRes.json() as { access_token: string };
  return longData.access_token;
}
