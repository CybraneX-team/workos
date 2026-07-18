import { api } from '../api';
import type { IntegrationConnection, IntegrationMetrics, MetaAdAccountOption } from './types';
import type {
  MetaAdsAssignee,
  MetaAdsAttention,
  MetaAdsDecisionInbox,
  MetaAdsExperiment,
  MetaAdsOperatingBrief,
  MetaAdsSyncRun,
  MetaAdsAuthoringReadiness,
  MetaAdsBrandKit,
  MetaAdsCampaignDraft,
  MetaAdsCampaignDraftContent,
  MetaAdsCampaignJob,
  MetaAdsCampaignPreflight,
  MetaAdsCreativeAsset,
  MetaAdsCreativeGenerationJob,
  MetaAdsErpProductContext,
} from '@cybranex/shared-types';

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
    lastSynced: null,
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

export function fetchMetaAdsBrief(): Promise<MetaAdsOperatingBrief> {
  return api.get<MetaAdsOperatingBrief>('/api/integrations/meta/brief');
}

export function fetchMetaAdsAttention(): Promise<MetaAdsAttention> {
  return api.get<MetaAdsAttention>('/api/integrations/meta/attention');
}

export function requestMetaAdsRefresh(): Promise<MetaAdsSyncRun> {
  return api.post<MetaAdsSyncRun>('/api/integrations/meta/refresh', {});
}

export function fetchMetaAdsSyncRun(runId: string): Promise<MetaAdsSyncRun> {
  return api.get<MetaAdsSyncRun>(`/api/integrations/meta/sync-runs/${encodeURIComponent(runId)}`);
}

export function fetchMetaAdsDecisionInbox(): Promise<MetaAdsDecisionInbox> {
  return api.get<MetaAdsDecisionInbox>('/api/integrations/meta/inbox');
}

export function fetchMetaAdsExperiments(view: 'active' | 'history', cursor?: string) {
  const params = new URLSearchParams({ view });
  if (cursor) params.set('cursor', cursor);
  return api.get<{ items: MetaAdsExperiment[]; nextCursor: string | null }>(`/api/integrations/meta/experiments?${params}`);
}

export function fetchMetaAdsExperiment(experimentId: string): Promise<MetaAdsExperiment> {
  return api.get<MetaAdsExperiment>(`/api/integrations/meta/experiments/${encodeURIComponent(experimentId)}`);
}

export function fetchMetaAdsAssignees(): Promise<MetaAdsAssignee[]> {
  return api.get<MetaAdsAssignee[]>('/api/integrations/meta/assignees');
}

export function startMetaAdsExperiment(findingId: string, input: { ownerMemberId: string; dueDate: string; idempotencyKey: string }) {
  return api.post<MetaAdsExperiment>(`/api/integrations/meta/findings/${encodeURIComponent(findingId)}/experiments`, input);
}

export function dismissMetaAdsFinding(findingId: string, input: { reason: string; note?: string; idempotencyKey: string }) {
  return api.post<{ id: string; decidedAt: string }>(`/api/integrations/meta/findings/${encodeURIComponent(findingId)}/dismiss`, input);
}

export function updateMetaAdsExperiment(experimentId: string, input: { ownerMemberId?: string; dueDate?: string; idempotencyKey: string }) {
  return api.patch<MetaAdsExperiment>(`/api/integrations/meta/experiments/${encodeURIComponent(experimentId)}`, input);
}

export function applyMetaAdsExperiment(experimentId: string, input: {
  implementationNote: string;
  confirmedRecommendedChange: boolean;
  keptBudgetConstant: boolean;
  idempotencyKey: string;
}) {
  return api.post<MetaAdsExperiment>(`/api/integrations/meta/experiments/${encodeURIComponent(experimentId)}/apply`, input);
}

export function cancelMetaAdsExperiment(experimentId: string, input: { reason: string; note?: string; idempotencyKey: string }) {
  return api.post<MetaAdsExperiment>(`/api/integrations/meta/experiments/${encodeURIComponent(experimentId)}/cancel`, input);
}

export function fetchMetaAdsAuthoringReadiness(): Promise<MetaAdsAuthoringReadiness> {
  return api.get('/api/integrations/meta/authoring/readiness');
}

export function fetchMetaAdsBrandKit(): Promise<MetaAdsBrandKit> {
  return api.get('/api/integrations/meta/brand-kit');
}

export function saveMetaAdsBrandKit(input: Omit<MetaAdsBrandKit, 'updatedAt'>): Promise<MetaAdsBrandKit> {
  return api.put('/api/integrations/meta/brand-kit', input);
}

export function fetchMetaAdsCreativeAssets(): Promise<MetaAdsCreativeAsset[]> {
  return api.get('/api/integrations/meta/creative-assets');
}

export function uploadMetaAdsCreative(file: File): Promise<MetaAdsCreativeAsset> {
  const body = new FormData();
  body.set('file', file);
  return api.post('/api/integrations/meta/creative-assets', body);
}

export function deleteMetaAdsCreative(assetId: string): Promise<void> {
  return api.delete(`/api/integrations/meta/creative-assets/${encodeURIComponent(assetId)}`);
}

export function fetchMetaAdsProductContext(itemCode: string): Promise<MetaAdsErpProductContext> {
  return api.get(`/api/integrations/meta/product-context?itemCode=${encodeURIComponent(itemCode)}`);
}

export function fetchMetaAdsCampaignDrafts(): Promise<MetaAdsCampaignDraft[]> {
  return api.get('/api/integrations/meta/campaign-drafts');
}

export function createMetaAdsCampaignDraft(name?: string): Promise<MetaAdsCampaignDraft> {
  return api.post('/api/integrations/meta/campaign-drafts', { name });
}

export function fetchMetaAdsCampaignDraft(draftId: string): Promise<MetaAdsCampaignDraft> {
  return api.get(`/api/integrations/meta/campaign-drafts/${encodeURIComponent(draftId)}`);
}

export function updateMetaAdsCampaignDraft(
  draftId: string,
  expectedVersion: number,
  patch: Partial<MetaAdsCampaignDraftContent>,
): Promise<MetaAdsCampaignDraft> {
  return api.patch(`/api/integrations/meta/campaign-drafts/${encodeURIComponent(draftId)}`, { expectedVersion, patch });
}

export function generateMetaAdsCreative(
  draftId: string,
  input: { expectedVersion: number; replaceConceptId?: string; idempotencyKey: string },
): Promise<MetaAdsCreativeGenerationJob> {
  return api.post(`/api/integrations/meta/campaign-drafts/${encodeURIComponent(draftId)}/generate`, input);
}

export function preflightMetaAdsCampaign(draftId: string): Promise<MetaAdsCampaignPreflight> {
  return api.post(`/api/integrations/meta/campaign-drafts/${encodeURIComponent(draftId)}/preflight`, {});
}

export function submitMetaAdsCampaign(draftId: string, expectedVersion: number): Promise<MetaAdsCampaignDraft> {
  return api.post(`/api/integrations/meta/campaign-drafts/${encodeURIComponent(draftId)}/submit`, { expectedVersion });
}

export function approveMetaAdsCampaignPublish(draftId: string, input: { note?: string; idempotencyKey: string }) {
  return api.post<{ draft: MetaAdsCampaignDraft; job: MetaAdsCampaignJob }>(`/api/integrations/meta/campaign-drafts/${encodeURIComponent(draftId)}/approve-publish`, input);
}

export function approveMetaAdsCampaignLaunch(draftId: string, input: { note?: string; idempotencyKey: string }) {
  return api.post<{ draft: MetaAdsCampaignDraft; job: MetaAdsCampaignJob }>(`/api/integrations/meta/campaign-drafts/${encodeURIComponent(draftId)}/approve-launch`, input);
}

export function pauseMetaAdsPublishedCampaign(draftId: string, idempotencyKey: string) {
  return api.post<{ draft: MetaAdsCampaignDraft; job: MetaAdsCampaignJob | null }>(`/api/integrations/meta/campaign-drafts/${encodeURIComponent(draftId)}/pause`, { idempotencyKey });
}

export function cloneMetaAdsCampaign(draftId: string): Promise<MetaAdsCampaignDraft> {
  return api.post(`/api/integrations/meta/campaign-drafts/${encodeURIComponent(draftId)}/clone`, {});
}

export function cancelMetaAdsCampaign(draftId: string, input: { reason: string; note?: string; idempotencyKey: string }): Promise<MetaAdsCampaignDraft> {
  return api.post(`/api/integrations/meta/campaign-drafts/${encodeURIComponent(draftId)}/cancel`, input);
}

export function fetchMetaAdsCreativeJob(jobId: string): Promise<MetaAdsCreativeGenerationJob> {
  return api.get(`/api/integrations/meta/creative-jobs/${encodeURIComponent(jobId)}`);
}

export function fetchMetaAdsCampaignJob(jobId: string): Promise<MetaAdsCampaignJob> {
  return api.get(`/api/integrations/meta/campaign-jobs/${encodeURIComponent(jobId)}`);
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

export function setMetaConversionEvent(companyId: string, actionType: string): Promise<MetaAdsOperatingBrief> {
  metaSyncForPageLoad = null;
  return api.put<MetaAdsOperatingBrief>(`/api/metrics/${companyId}/integrations/meta/conversion-event`, { actionType });
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
