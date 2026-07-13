import { api } from '../api';
import type { IntegrationConnection, IntegrationMetrics, MetaAdAccountOption } from './types';

// Returned by connectOAuth when Meta finds more than one ad account and the
// caller must show a picker before the connection can be finalized.
export interface MetaAccountSelectionNeeded {
  needsSelection: true;
  accounts: MetaAdAccountOption[];
  ticket: string;
}

// Integrations that have real backend support
export const LIVE_SUPPORTED = new Set(['int-stripe', 'int-ga', 'int-meta', 'int-razorpay', 'int-sf', 'int-hubspot', 'int-qb', 'int-jira', 'int-slack']);

// ─── Fetch all connections for the current company ────────────────────────────

export async function fetchConnections(): Promise<Record<string, IntegrationConnection>> {
  const list = await api.get<IntegrationConnection[]>('/api/integrations/connections');
  return Object.fromEntries(list.map((c) => [c.integrationId, c]));
}

// ─── Connect ──────────────────────────────────────────────────────────────────

export async function connectStripe(secretKey: string): Promise<IntegrationConnection> {
  const result = await api.post<IntegrationConnection>('/api/integrations/stripe/connect', { secretKey });
  return result;
}

export async function connectRazorpay(keyId: string, keySecret: string): Promise<IntegrationConnection> {
  return api.post<IntegrationConnection>('/api/integrations/razorpay/connect', { keyId, keySecret });
}

export async function connectHubSpot(accessToken: string): Promise<IntegrationConnection> {
  return api.post<IntegrationConnection>('/api/integrations/hubspot/connect', { accessToken });
}

export async function connectJira(domain: string, email: string, apiToken: string): Promise<IntegrationConnection> {
  return api.post<IntegrationConnection>('/api/integrations/jira/connect', { domain, email, apiToken });
}

export async function connectSlack(botToken: string): Promise<IntegrationConnection> {
  return api.post<IntegrationConnection>('/api/integrations/slack/connect', { botToken });
}

export async function connectOAuth(integrationId: string): Promise<IntegrationConnection | MetaAccountSelectionNeeded> {
  const endpointMap: Record<string, string> = {
    'int-ga':   '/api/integrations/google/auth-url',
    'int-meta': '/api/integrations/meta/auth-url',
    'int-sf':   '/api/integrations/salesforce/auth-url',
    'int-qb':   '/api/integrations/quickbooks/auth-url',
  };
  const endpoint = endpointMap[integrationId];
  if (!endpoint) throw new Error(`OAuth not supported for ${integrationId}`);

  const { url } = await api.get<{ url: string }>(endpoint);
  const result = await openOAuthPopup(url);

  if (result.kind === 'select_account') {
    return { needsSelection: true, accounts: result.accounts, ticket: result.ticket };
  }

  return {
    integrationId: result.integrationId || integrationId,
    connectedAt: new Date().toISOString(),
    lastSynced: new Date().toISOString(),
    accountName: result.accountName || integrationId,
    sandboxMode: false,
  };
}

// ─── Meta Ads: finalize connection after the user picks an ad account ─────────

export async function finalizeMetaAdAccount(ticket: string, adAccountId: string): Promise<IntegrationConnection> {
  return api.post<IntegrationConnection>('/api/integrations/meta/finalize', { ticket, adAccountId });
}

// ─── Meta Ads: sandbox connect (dev only) ─────────────────────────────────────

export async function checkMetaSandboxAvailable(): Promise<boolean> {
  try {
    const { available } = await api.get<{ available: boolean }>('/api/integrations/meta/sandbox-available');
    return available;
  } catch {
    return false;
  }
}

export async function connectMetaSandbox(): Promise<IntegrationConnection> {
  return api.post<IntegrationConnection>('/api/integrations/meta/connect-sandbox', {});
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnectIntegration(integrationId: string): Promise<void> {
  await api.delete(`/api/integrations/${integrationId}/disconnect`);
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export async function fetchMetrics(integrationId: string): Promise<IntegrationMetrics> {
  return api.get<IntegrationMetrics>(`/api/integrations/${integrationId}/metrics`);
}

export interface MetaCanonicalMetricRow {
  id: string;
  name: string;
  current_value: number | string | null;
  baseline_value: number | string;
  target_value: number | string;
  normalized_score: number | string | null;
  unit: string;
  source_key: 'roas_30d' | 'cost_per_conversion_30d' | 'selected_conversions_30d';
  source_status: 'active' | 'disconnected' | 'needs_configuration';
  last_synced_at: string | null;
  last_error: string | null;
}

export interface MetaMetricSyncResult {
  fresh: boolean;
  deduplicated: boolean;
  syncedAt: string | null;
  accountId: string;
  preview: import('./types').MetaAdsMetrics | null;
  metrics: MetaCanonicalMetricRow[];
  syncError?: string;
}

let metaSyncForPageLoad: Promise<MetaMetricSyncResult> | null = null;

export function syncMetaMetricsOnce(): Promise<MetaMetricSyncResult> {
  if (!metaSyncForPageLoad) {
    metaSyncForPageLoad = api.post<MetaMetricSyncResult>('/api/integrations/meta/sync', {});
  }
  return metaSyncForPageLoad;
}

export function setMetaConversionEvent(companyId: string, actionType: string): Promise<MetaMetricSyncResult> {
  metaSyncForPageLoad = null;
  return api.put<MetaMetricSyncResult>(`/api/metrics/${companyId}/integrations/meta/conversion-event`, { actionType });
}

export function configureMetaMetric(companyId: string, metricKey: string, input: {
  target: number;
  ownerMemberId: string;
  weight: number;
  goalLinks: Array<{ goalId: string; weight: number }>;
}): Promise<MetaCanonicalMetricRow[]> {
  return api.put<MetaCanonicalMetricRow[]>(`/api/metrics/${companyId}/integrations/meta/${metricKey}`, input);
}

// ─── Analytics data: TrackedMetric[] derived from all stored snapshots ────────

export interface AnalyticsTrackedMetric {
  id: string;
  name: string;
  category: 'Growth' | 'Product' | 'Sales' | 'Finance' | 'Ops/People';
  value: number;
  unit: string;
  change: number;
  dataSource: 'auto-ingested';
  integration: string;
  trend: number[];
  description: string;
}

export interface AnalyticsData {
  metrics: AnalyticsTrackedMetric[];
  connectedIntegrations: string[];
  lastUpdated: string | null;
}

export async function fetchAnalyticsData(): Promise<AnalyticsData> {
  return api.get<AnalyticsData>('/api/integrations/analytics-data');
}

// ─── OAuth popup helper ───────────────────────────────────────────────────────

type OAuthPopupResult =
  | { kind: 'connected'; integrationId: string; accountName: string }
  | { kind: 'select_account'; integrationId: string; accounts: MetaAdAccountOption[]; ticket: string };

function openOAuthPopup(url: string): Promise<OAuthPopupResult> {
  return new Promise((resolve, reject) => {
    const popup = window.open(url, 'oauth_connect', 'width=520,height=640,scrollbars=yes,resizable=yes');
    if (!popup) {
      reject(new Error('Popup blocked — please allow popups for this site and try again'));
      return;
    }

    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'oauth_success') {
        cleanup();
        resolve({ kind: 'connected', integrationId: e.data.integrationId ?? '', accountName: e.data.accountName ?? '' });
      }
      if (e.data?.type === 'oauth_select_account') {
        cleanup();
        resolve({ kind: 'select_account', integrationId: e.data.integrationId ?? '', accounts: e.data.accounts ?? [], ticket: e.data.ticket ?? '' });
      }
      if (e.data?.type === 'oauth_error') {
        cleanup();
        reject(new Error(e.data.error ?? 'OAuth failed'));
      }
    };

    const poll = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Authorization window closed before completing'));
      }
    }, 500);

    const cleanup = () => {
      window.removeEventListener('message', handler);
      clearInterval(poll);
      if (!popup.closed) popup.close();
    };

    window.addEventListener('message', handler);
  });
}
