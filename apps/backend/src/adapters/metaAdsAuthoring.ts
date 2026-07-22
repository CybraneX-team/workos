import { createHash } from 'node:crypto';
import {
  META_GRAPH_BASE,
  metaAppSecretProof,
} from './metaAds.js';

export interface MetaAuthoringPage {
  pageId: string;
  pageName: string;
  instagramActorId: string | null;
  instagramUsername: string | null;
  /** Meta refuses to create a lead-gen ad set until the Page owner accepts these terms. */
  leadgenTosAccepted: boolean;
}

export interface MetaAuthoringPrerequisites {
  account: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    accountStatus: number;
    disableReason: number | null;
    spendCap: number | null;
    amountSpent: number | null;
    balance: number | null;
  };
  pages: MetaAuthoringPage[];
}

export interface MetaObjectState {
  id: string;
  name: string | null;
  status: string | null;
  effectiveStatus: string | null;
}

export class MetaAuthoringApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly httpStatus: number,
  ) {
    super(message);
  }
}

const fakeStatuses = new Map<string, string>();

function fakeEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.META_AUTHORING_FAKE_META === 'true';
}

function fakeId(kind: string, marker: string): string {
  return `${kind}_${createHash('sha256').update(`${kind}:${marker}`).digest('hex').slice(0, 18)}`;
}

function authParams(accessToken: string): Record<string, string> {
  const proof = metaAppSecretProof(accessToken);
  return { access_token: accessToken, ...(proof ? { appsecret_proof: proof } : {}) };
}

function graphError(status: number, body: unknown): MetaAuthoringApiError {
  const raw = body && typeof body === 'object' && 'error' in body
    ? (body as { error?: { code?: number; error_subcode?: number; message?: string; is_transient?: boolean; type?: string } }).error
    : undefined;
  const code = raw?.error_subcode
    ? `meta_${raw.code ?? status}_${raw.error_subcode}`
    : `meta_${raw?.code ?? status}`;
  const retryable = status === 429 || status >= 500 || raw?.is_transient === true;
  const message = raw?.code === 190 || status === 401
    ? 'Reconnect Meta before continuing.'
    : status === 403 || raw?.code === 10 || raw?.code === 200
      ? 'Meta permissions are insufficient for this operation.'
      : retryable
        ? 'Meta is temporarily unavailable. The operation will retry safely.'
        : 'Meta rejected the requested operation. Review the campaign and account in Ads Manager.';
  return new MetaAuthoringApiError(code, message, retryable, status);
}

async function graphGet<T>(path: string, accessToken: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries({ ...params, ...authParams(accessToken) })) url.searchParams.set(key, value);
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw graphError(response.status, body);
  return body as T;
}

async function graphGetAll<T>(path: string, accessToken: string, params: Record<string, string> = {}): Promise<T[]> {
  const first = new URL(`${META_GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries({ ...params, ...authParams(accessToken) })) first.searchParams.set(key, value);
  let next: string | null = first.toString();
  const rows: T[] = [];
  let pages = 0;
  while (next && pages < 20) {
    const response = await fetch(next);
    const body = await response.json().catch(() => ({})) as { data?: T[]; paging?: { next?: string } };
    if (!response.ok) throw graphError(response.status, body);
    rows.push(...(body.data ?? []));
    next = body.paging?.next ?? null;
    pages += 1;
  }
  return rows;
}

async function graphPost<T>(path: string, accessToken: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ ...params, ...authParams(accessToken) });
  const response = await fetch(`${META_GRAPH_BASE}${path}`, { method: 'POST', body });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw graphError(response.status, value);
  return value as T;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getMetaAuthoringPrerequisites(
  accessToken: string,
  adAccountId: string,
): Promise<MetaAuthoringPrerequisites> {
  if (fakeEnabled()) {
    return {
      account: {
        id: adAccountId,
        name: 'WorkOS Meta sandbox',
        currency: 'USD',
        timezone: 'UTC',
        accountStatus: 1,
        disableReason: null,
        spendCap: 1_000_000,
        amountSpent: 0,
        balance: 0,
      },
      pages: [{ pageId: 'page_workos_fixture', pageName: 'WorkOS Fixture Page', instagramActorId: 'ig_workos_fixture', instagramUsername: 'workos_fixture', leadgenTosAccepted: true }],
    };
  }
  const [account, pages] = await Promise.all([
    graphGet<{
      id: string; name?: string; currency?: string; timezone_name?: string; account_status?: number;
      disable_reason?: number; spend_cap?: string; amount_spent?: string; balance?: string;
    }>(`/${adAccountId}`, accessToken, {
      fields: 'id,name,currency,timezone_name,account_status,disable_reason,spend_cap,amount_spent,balance',
    }),
    graphGetAll<{
      id: string; name?: string; leadgen_tos_accepted?: boolean;
      instagram_business_account?: { id?: string; username?: string; name?: string };
    }>('/me/accounts', accessToken, {
      fields: 'id,name,leadgen_tos_accepted,instagram_business_account{id,username,name}',
      limit: '200',
    }),
  ]);
  return {
    account: {
      id: account.id,
      name: account.name || account.id,
      currency: account.currency || 'USD',
      timezone: account.timezone_name || 'UTC',
      accountStatus: Number(account.account_status ?? 0),
      disableReason: numberOrNull(account.disable_reason),
      spendCap: numberOrNull(account.spend_cap),
      amountSpent: numberOrNull(account.amount_spent),
      balance: numberOrNull(account.balance),
    },
    pages: pages.map((page) => ({
      pageId: page.id,
      pageName: page.name || page.id,
      instagramActorId: page.instagram_business_account?.id ?? null,
      instagramUsername: page.instagram_business_account?.username ?? page.instagram_business_account?.name ?? null,
      leadgenTosAccepted: page.leadgen_tos_accepted === true,
    })),
  };
}

export async function uploadMetaAdImage(input: {
  accessToken: string;
  adAccountId: string;
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<{ hash: string }> {
  if (fakeEnabled()) return { hash: createHash('sha256').update(input.bytes).digest('hex') };
  const form = new FormData();
  for (const [key, value] of Object.entries(authParams(input.accessToken))) form.set(key, value);
  const arrayBuffer = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
  form.set('filename', new Blob([arrayBuffer], { type: input.mimeType }), input.fileName);
  const response = await fetch(`${META_GRAPH_BASE}/${input.adAccountId}/adimages`, { method: 'POST', body: form });
  const body = await response.json().catch(() => ({})) as { images?: Record<string, { hash?: string }> };
  if (!response.ok) throw graphError(response.status, body);
  const hash = Object.values(body.images ?? {})[0]?.hash;
  if (!hash) throw new MetaAuthoringApiError('meta_image_hash_missing', 'Meta accepted the image without returning an image hash.', true, 502);
  return { hash };
}

export async function findMetaObjectByName(input: {
  accessToken: string;
  adAccountId: string;
  edge: 'campaigns' | 'adsets' | 'adcreatives' | 'ads';
  name: string;
}): Promise<MetaObjectState | null> {
  if (fakeEnabled()) {
    const kind = input.edge === 'campaigns' ? 'cmp' : input.edge === 'adsets' ? 'set' : input.edge === 'adcreatives' ? 'crt' : 'ad';
    const id = fakeId(kind, input.name);
    if (!fakeStatuses.has(id)) return null;
    return { id, name: input.name, status: fakeStatuses.get(id) ?? null, effectiveStatus: fakeStatuses.get(id) ?? null };
  }
  const rows = await graphGetAll<{ id: string; name?: string; status?: string; effective_status?: string }>(
    `/${input.adAccountId}/${input.edge}`,
    input.accessToken,
    { fields: 'id,name,status,effective_status', limit: '500' },
  );
  const found = rows.find((row) => row.name === input.name);
  return found ? { id: found.id, name: found.name ?? null, status: found.status ?? null, effectiveStatus: found.effective_status ?? null } : null;
}

async function createNamedObject(
  kind: 'cmp' | 'set' | 'crt' | 'ad' | 'frm',
  path: string,
  accessToken: string,
  name: string,
  params: Record<string, string>,
): Promise<{ id: string }> {
  if (fakeEnabled()) {
    const id = fakeId(kind, name);
    fakeStatuses.set(id, kind === 'crt' ? 'ACTIVE' : 'PAUSED');
    return { id };
  }
  const result = await graphPost<{ id?: string }>(path, accessToken, params);
  if (!result.id) throw new MetaAuthoringApiError('meta_object_id_missing', 'Meta did not return an object id.', true, 502);
  return { id: result.id };
}

export function workosMetaObjectName(draftId: string, version: number, label: string): string {
  const safe = label.trim().replace(/\s+/g, ' ').slice(0, 180);
  return `[WorkOS:${draftId.slice(0, 8)}:v${version}] ${safe}`;
}

/**
 * Lead-form names key off the question-set hash, not the draft, because that is what makes a form
 * reusable across drafts — `findMetaLeadFormByName` is the reuse lookup, so two drafts with the
 * same questions must produce byte-identical names.
 */
export function workosMetaLeadFormName(questionSetHash: string): string {
  return `[WorkOS:form:${questionSetHash.slice(0, 12)}] Lead form`;
}

export function metaTrafficCampaignPayload(input: { name: string }): Record<string, string> {
  return {
    name: input.name,
    objective: 'OUTCOME_TRAFFIC',
    status: 'PAUSED',
    special_ad_categories: '[]',
    // Required by Graph once a campaign carries no campaign-level budget — ours budget at the
    // ad set (`lifetime_budget` in metaTrafficAdSetPayload), so Graph rejects the create with
    // error_subcode 4834011 unless this is stated explicitly. `false` keeps today's behaviour:
    // we publish one ad set per campaign, so there is nothing to share 20% of a budget with.
    is_adset_budget_sharing_enabled: 'false',
  };
}

export async function createMetaTrafficCampaign(input: {
  accessToken: string;
  adAccountId: string;
  name: string;
}): Promise<{ id: string }> {
  return createNamedObject('cmp', `/${input.adAccountId}/campaigns`, input.accessToken, input.name, metaTrafficCampaignPayload(input));
}

export function metaTrafficAdSetPayload(input: {
  name: string;
  campaignId: string;
  lifetimeBudgetMinor: number;
  startTime: string;
  endTime: string;
  countries: string[];
  ageMin: number;
  ageMax: number;
  languageIds: number[];
  dsaBeneficiary?: string;
  dsaPayor?: string;
}): Record<string, string> {
  return {
    name: input.name,
    campaign_id: input.campaignId,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'LINK_CLICKS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    lifetime_budget: String(input.lifetimeBudgetMinor),
    start_time: input.startTime,
    end_time: input.endTime,
    destination_type: 'WEBSITE',
    targeting: JSON.stringify({
      geo_locations: { countries: input.countries },
      age_min: input.ageMin,
      age_max: input.ageMax,
      ...(input.languageIds.length ? { locales: input.languageIds } : {}),
    }),
    ...(input.dsaBeneficiary ? { dsa_beneficiary: input.dsaBeneficiary } : {}),
    ...(input.dsaPayor ? { dsa_payor: input.dsaPayor } : {}),
    status: 'PAUSED',
  };
}

export async function createMetaTrafficAdSet(input: {
  accessToken: string;
  adAccountId: string;
  name: string;
  campaignId: string;
  lifetimeBudgetMinor: number;
  startTime: string;
  endTime: string;
  countries: string[];
  ageMin: number;
  ageMax: number;
  languageIds: number[];
  dsaBeneficiary?: string;
  dsaPayor?: string;
}): Promise<{ id: string }> {
  return createNamedObject('set', `/${input.adAccountId}/adsets`, input.accessToken, input.name, metaTrafficAdSetPayload(input));
}

export function metaSingleImageCreativePayload(input: {
  name: string;
  pageId: string;
  instagramActorId: string | null;
  imageHash: string;
  link: string;
  primaryText: string;
  headline: string;
  description: string;
  callToAction: string;
}): Record<string, string> {
  return {
    name: input.name,
    object_story_spec: JSON.stringify({
      page_id: input.pageId,
      ...(input.instagramActorId ? { instagram_actor_id: input.instagramActorId } : {}),
      link_data: {
        image_hash: input.imageHash,
        link: input.link,
        message: input.primaryText,
        name: input.headline,
        description: input.description,
        call_to_action: { type: input.callToAction, value: { link: input.link } },
      },
    }),
    degrees_of_freedom_spec: JSON.stringify({
      creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } },
    }),
  };
}

export async function createMetaSingleImageCreative(input: {
  accessToken: string;
  adAccountId: string;
  name: string;
  pageId: string;
  instagramActorId: string | null;
  imageHash: string;
  link: string;
  primaryText: string;
  headline: string;
  description: string;
  callToAction: string;
}): Promise<{ id: string }> {
  return createNamedObject('crt', `/${input.adAccountId}/adcreatives`, input.accessToken, input.name, metaSingleImageCreativePayload(input));
}

/* ── Lead-form authoring ──────────────────────────────────────────────────────
 * Every payload shape below was verified against Graph v25 on the Meta sandbox rather than
 * taken from documentation. Notable findings encoded here:
 *  - lead forms are created on the PAGE edge with a PAGE-scoped token, not the ad account;
 *  - `context_card` makes `follow_up_action_url` mandatory (error_subcode 1892085);
 *  - Meta assigns answer keys for standard question types: FIRST_NAME -> `first_name`,
 *    LAST_NAME -> `last_name`, EMAIL -> `email`, PHONE -> `phone_number` (not `phone`);
 *  - CUSTOM questions keep the `key` we supply.
 */

export interface MetaLeadFormQuestionInput {
  type: 'FIRST_NAME' | 'LAST_NAME' | 'EMAIL' | 'PHONE' | 'CUSTOM';
  key: string;
  label: string;
}

export interface MetaLeadFormInput {
  name: string;
  questions: MetaLeadFormQuestionInput[];
  privacyPolicyUrl: string;
  followUpUrl: string;
  contextHeadline: string;
  contextDescription: string;
}

/**
 * Fetch a Page-scoped token. Kept separate from `getMetaAuthoringPrerequisites` on purpose: that
 * result is serialised to the browser, and a Page token must never leave the server.
 */
export async function getMetaPageAccessToken(userAccessToken: string, pageId: string): Promise<string> {
  if (fakeEnabled()) return `fake_page_token_${pageId}`;
  const page = await graphGet<{ access_token?: string }>(`/${pageId}`, userAccessToken, { fields: 'access_token' });
  if (!page.access_token) {
    throw new MetaAuthoringApiError('meta_page_token_unavailable', 'Meta did not return a Page access token. Reconnect Meta and confirm Page access.', false, 403);
  }
  return page.access_token;
}

export function metaLeadFormPayload(input: MetaLeadFormInput): Record<string, string> {
  const hasContextCard = Boolean(input.contextHeadline.trim() || input.contextDescription.trim());
  return {
    name: input.name,
    questions: JSON.stringify(input.questions.map((question) => (
      // Standard types carry their label implicitly; sending `key` for them is rejected because
      // Meta owns that value.
      question.type === 'CUSTOM'
        ? { type: 'CUSTOM', key: question.key, label: question.label }
        : { type: question.type }
    ))),
    privacy_policy: JSON.stringify({ url: input.privacyPolicyUrl, link_text: 'Privacy Policy' }),
    ...(input.followUpUrl.trim() ? { follow_up_action_url: input.followUpUrl.trim() } : {}),
    ...(hasContextCard ? {
      context_card: JSON.stringify({
        title: input.contextHeadline,
        content: [input.contextDescription],
        style: 'PARAGRAPH_STYLE',
        button_text: 'Continue',
      }),
    } : {}),
  };
}

export async function createMetaLeadForm(input: MetaLeadFormInput & {
  pageAccessToken: string;
  pageId: string;
}): Promise<{ id: string }> {
  return createNamedObject('frm', `/${input.pageId}/leadgen_forms`, input.pageAccessToken, input.name, metaLeadFormPayload(input));
}

/**
 * Lead forms live on the Page, not the ad account, so this cannot go through
 * `findMetaObjectByName`. Archived forms are skipped: Meta refuses to delete a form
 * (`error_subcode 33`), so a reused name may still resolve to a retired one.
 */
export async function findMetaLeadFormByName(input: {
  pageAccessToken: string;
  pageId: string;
  name: string;
}): Promise<{ id: string } | null> {
  if (fakeEnabled()) {
    const id = fakeId('frm', input.name);
    return fakeStatuses.has(id) ? { id } : null;
  }
  const rows = await graphGetAll<{ id: string; name?: string; status?: string }>(
    `/${input.pageId}/leadgen_forms`, input.pageAccessToken, { fields: 'id,name,status', limit: '500' },
  );
  const found = rows.find((row) => row.name === input.name && row.status !== 'ARCHIVED');
  return found ? { id: found.id } : null;
}

export function metaLeadCampaignPayload(input: { name: string }): Record<string, string> {
  return {
    name: input.name,
    objective: 'OUTCOME_LEADS',
    status: 'PAUSED',
    special_ad_categories: '[]',
    // Same Graph v25 requirement as the traffic payload — see metaTrafficCampaignPayload.
    is_adset_budget_sharing_enabled: 'false',
  };
}

export async function createMetaLeadCampaign(input: {
  accessToken: string;
  adAccountId: string;
  name: string;
}): Promise<{ id: string }> {
  return createNamedObject('cmp', `/${input.adAccountId}/campaigns`, input.accessToken, input.name, metaLeadCampaignPayload(input));
}

export function metaLeadAdSetPayload(input: {
  name: string;
  campaignId: string;
  pageId: string;
  lifetimeBudgetMinor: number;
  startTime: string;
  endTime: string;
  countries: string[];
  ageMin: number;
  ageMax: number;
  languageIds: number[];
  dsaBeneficiary?: string;
  dsaPayor?: string;
}): Record<string, string> {
  return {
    name: input.name,
    campaign_id: input.campaignId,
    billing_event: 'IMPRESSIONS',
    // Meta's documented OUTCOME_LEADS mapping: destination ON_AD (the instant form),
    // optimization LEAD_GENERATION, and a page_id promoted object.
    optimization_goal: 'LEAD_GENERATION',
    destination_type: 'ON_AD',
    promoted_object: JSON.stringify({ page_id: input.pageId }),
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    lifetime_budget: String(input.lifetimeBudgetMinor),
    start_time: input.startTime,
    end_time: input.endTime,
    targeting: JSON.stringify({
      geo_locations: { countries: input.countries },
      age_min: input.ageMin,
      age_max: input.ageMax,
      ...(input.languageIds.length ? { locales: input.languageIds } : {}),
    }),
    ...(input.dsaBeneficiary ? { dsa_beneficiary: input.dsaBeneficiary } : {}),
    ...(input.dsaPayor ? { dsa_payor: input.dsaPayor } : {}),
    status: 'PAUSED',
  };
}

export async function createMetaLeadAdSet(input: {
  accessToken: string;
  adAccountId: string;
  name: string;
  campaignId: string;
  pageId: string;
  lifetimeBudgetMinor: number;
  startTime: string;
  endTime: string;
  countries: string[];
  ageMin: number;
  ageMax: number;
  languageIds: number[];
  dsaBeneficiary?: string;
  dsaPayor?: string;
}): Promise<{ id: string }> {
  return createNamedObject('set', `/${input.adAccountId}/adsets`, input.accessToken, input.name, metaLeadAdSetPayload(input));
}

export function metaLeadFormCreativePayload(input: {
  name: string;
  pageId: string;
  instagramActorId: string | null;
  imageHash: string;
  leadFormId: string;
  primaryText: string;
  headline: string;
  description: string;
  callToAction: string;
}): Record<string, string> {
  return {
    name: input.name,
    object_story_spec: JSON.stringify({
      page_id: input.pageId,
      ...(input.instagramActorId ? { instagram_actor_id: input.instagramActorId } : {}),
      link_data: {
        image_hash: input.imageHash,
        // An instant-form ad never leaves Meta, but link_data still requires a link; the Page
        // itself is the conventional stand-in, and the CTA value is what actually opens the form.
        link: `https://facebook.com/${input.pageId}`,
        message: input.primaryText,
        name: input.headline,
        description: input.description,
        call_to_action: { type: input.callToAction, value: { lead_gen_form_id: input.leadFormId } },
      },
    }),
    degrees_of_freedom_spec: JSON.stringify({
      creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } },
    }),
  };
}

export async function createMetaLeadFormCreative(input: {
  accessToken: string;
  adAccountId: string;
  name: string;
  pageId: string;
  instagramActorId: string | null;
  imageHash: string;
  leadFormId: string;
  primaryText: string;
  headline: string;
  description: string;
  callToAction: string;
}): Promise<{ id: string }> {
  return createNamedObject('crt', `/${input.adAccountId}/adcreatives`, input.accessToken, input.name, metaLeadFormCreativePayload(input));
}

export async function createMetaPausedAd(input: {
  accessToken: string;
  adAccountId: string;
  name: string;
  adsetId: string;
  creativeId: string;
}): Promise<{ id: string }> {
  return createNamedObject('ad', `/${input.adAccountId}/ads`, input.accessToken, input.name, {
    name: input.name,
    adset_id: input.adsetId,
    creative: JSON.stringify({ creative_id: input.creativeId }),
    status: 'PAUSED',
  });
}

export async function updateMetaObjectStatus(
  accessToken: string,
  objectId: string,
  status: 'ACTIVE' | 'PAUSED',
): Promise<void> {
  if (fakeEnabled()) {
    fakeStatuses.set(objectId, status);
    return;
  }
  const result = await graphPost<{ success?: boolean }>(`/${objectId}`, accessToken, { status });
  if (result.success !== true) throw new MetaAuthoringApiError('meta_status_not_confirmed', 'Meta did not confirm the status update.', true, 502);
}

export async function getMetaObjectState(accessToken: string, objectId: string): Promise<MetaObjectState> {
  if (fakeEnabled()) {
    const status = fakeStatuses.get(objectId) ?? 'PAUSED';
    return { id: objectId, name: null, status, effectiveStatus: status };
  }
  const row = await graphGet<{ id: string; name?: string; status?: string; effective_status?: string }>(
    `/${objectId}`,
    accessToken,
    { fields: 'id,name,status,effective_status' },
  );
  return { id: row.id, name: row.name ?? null, status: row.status ?? null, effectiveStatus: row.effective_status ?? null };
}

export async function getMetaCreativePreview(accessToken: string, creativeId: string): Promise<string | null> {
  if (fakeEnabled()) return `<div data-meta-preview="${creativeId}">WorkOS fixture preview</div>`;
  const response = await graphGet<{ data?: Array<{ body?: string }> }>(`/${creativeId}/previews`, accessToken, {
    ad_format: 'DESKTOP_FEED_STANDARD',
  });
  return response.data?.[0]?.body ?? null;
}
