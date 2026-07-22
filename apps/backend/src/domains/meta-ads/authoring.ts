import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type {
  MetaAdsAuthoringMode,
  MetaAdsAuthoringReadiness,
  MetaAdsBrandKit,
  MetaAdsCampaignDraft,
  MetaAdsCampaignDraftContent,
  MetaAdsCampaignEvent,
  MetaAdsCampaignJob,
  MetaAdsCampaignJobKind,
  MetaAdsCampaignPreflight,
  MetaAdsCreativeAsset,
  MetaAdsCreativeGenerationJob,
  MetaAdsErpProductContext,
  MetaAdsLeadFormSpec,
  MetaAdsPreflightIssue,
} from '@cybranex/shared-types';
import { env, provisionEnv } from '../../config.js';
import { pool, supabaseAdmin } from '../../db.js';
import { decrypt } from '../../lib/crypto.js';
import { configureTenantLeadSync, queryRecords } from '../../lib/erpnextControlPlane.js';
import {
  createMetaLeadAdSet,
  createMetaLeadCampaign,
  createMetaLeadForm,
  createMetaLeadFormCreative,
  createMetaPausedAd,
  createMetaSingleImageCreative,
  createMetaTrafficAdSet,
  createMetaTrafficCampaign,
  findMetaLeadFormByName,
  findMetaObjectByName,
  getMetaAuthoringPrerequisites,
  getMetaPageAccessToken,
  getMetaObjectState,
  MetaAuthoringApiError,
  updateMetaObjectStatus,
  uploadMetaAdImage,
  workosMetaLeadFormName,
  workosMetaObjectName,
} from '../../adapters/metaAdsAuthoring.js';
import {
  downloadMetaCreativeAsset,
  generateMetaCreativeConcepts,
  persistMetaCreativeAsset,
  signedMetaCreativeAsset,
} from './creativeGeneration.js';

const BUCKET = 'meta-ads-creatives';
const EDITABLE_STATUSES = new Set(['draft']);
const EEA_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO',
]);

type ConnectionContext = {
  companyId: string;
  accountId: string;
  accountName: string;
  sandbox: boolean;
  accessToken: string;
  tokenExpiresAt: string | null;
  metadata: Record<string, unknown>;
};

export class MetaAdsAuthoringError extends Error {
  constructor(public readonly status: number, message: string, public readonly retryable = false) {
    super(message);
  }
}

function fail(status: number, code: string, retryable = false): never {
  throw new MetaAdsAuthoringError(status, code, retryable);
}

function normalizedAuthoringFailure(error: unknown, fallbackCode: string): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof MetaAuthoringApiError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof MetaAdsAuthoringError) {
    const code = /^[a-z0-9_]+$/i.test(error.message) ? error.message : fallbackCode;
    return { code, message: code.replace(/_/g, ' '), retryable: error.retryable };
  }
  const raw = error instanceof Error ? error.message : '';
  const code = /^[a-z0-9_]+$/i.test(raw) ? raw : fallbackCode;
  return { code, message: code.replace(/_/g, ' '), retryable: true };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, canonical(nested)]));
  }
  return value;
}

export function metaAdsDraftSnapshotHash(content: MetaAdsCampaignDraftContent): string {
  return createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex');
}

/**
 * Identity of a lead form for reuse purposes. Two drafts that hash equal can publish against the
 * same Meta form, which matters because Frappe CRM permits exactly one enabled `Lead Sync Source`
 * per form — a form per campaign would multiply sync sources and their polling.
 *
 * `crmField` is part of the identity even though Meta never sees it: the question-to-CRM mapping
 * is stored on the shared form, so drafts that map the same questions differently cannot share one.
 */
export function metaAdsLeadFormQuestionSetHash(leadForm: MetaAdsLeadFormSpec): string {
  return createHash('sha256').update(JSON.stringify(canonical({
    questions: leadForm.questions.map((question) => ({
      key: question.key, type: question.type, label: question.label, crmField: question.crmField,
    })),
    privacyPolicyUrl: leadForm.privacyPolicyUrl,
    followUpUrl: leadForm.followUpUrl,
    contextHeadline: leadForm.contextHeadline,
    contextDescription: leadForm.contextDescription,
  }))).digest('hex');
}

function allowedAccountIds(): Set<string> {
  return new Set(env.META_AUTHORING_ALLOWED_ACCOUNT_IDS.split(',').map((value) => value.trim()).filter(Boolean));
}

export function isMetaAuthoringAccountPermitted(input: {
  mode: MetaAdsAuthoringMode;
  sandbox: boolean;
  accountId: string;
  allowlistedAccountIds: Set<string>;
}): boolean {
  if (input.mode === 'disabled') return false;
  if (input.mode === 'sandbox_only') {
    return input.sandbox && (input.allowlistedAccountIds.size === 0 || input.allowlistedAccountIds.has(input.accountId));
  }
  // Real-account writes fail closed. Enabling the mode without naming an
  // account must never grant write access to every connected real account.
  return input.allowlistedAccountIds.has(input.accountId);
}

async function connectionContext(companyId: string): Promise<ConnectionContext | null> {
  const { rows } = await pool.query(
    `SELECT company_id,account_name,sandbox_mode,access_token_enc,token_expires_at,metadata
       FROM public.integration_connections WHERE company_id=$1 AND integration_id='int-meta'`,
    [companyId],
  );
  const row = rows[0];
  const metadata = (row?.metadata ?? {}) as Record<string, unknown>;
  const accountId = String(metadata.ad_account_id ?? '');
  if (!row?.access_token_enc || !accountId) return null;
  return {
    companyId,
    accountId,
    accountName: String(row.account_name ?? accountId).replace(/^Meta Ads · /, ''),
    sandbox: Boolean(row.sandbox_mode),
    accessToken: decrypt(String(row.access_token_enc)),
    tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at).toISOString() : null,
    metadata,
  };
}

export async function getMetaAdsAuthoringReadiness(companyId: string): Promise<MetaAdsAuthoringReadiness> {
  const mode = env.META_AUTHORING_MODE;
  const connection = await connectionContext(companyId);
  const base: MetaAdsAuthoringReadiness = {
    mode,
    connected: Boolean(connection),
    permitted: false,
    launchEnabled: env.META_AUTHORING_LAUNCH_ENABLED,
    accountId: connection?.accountId ?? null,
    accountName: connection?.accountName ?? null,
    currency: connection ? String(connection.metadata.currency ?? '') || null : null,
    timezone: connection ? String(connection.metadata.timezone ?? '') || null : null,
    sandbox: connection?.sandbox ?? false,
    tokenExpiresAt: connection?.tokenExpiresAt ?? null,
    accountStatus: null,
    pages: [],
    maxLifetimeBudgetMinor: env.META_MAX_LIFETIME_BUDGET_MINOR,
    blockers: [],
    warnings: [],
  };
  if (!connection) {
    base.blockers.push({ code: 'meta_not_connected', message: 'Connect a Meta ad account before creating a campaign.' });
    return base;
  }
  if (mode === 'disabled') {
    base.blockers.push({ code: 'meta_authoring_disabled', message: 'Campaign authoring is disabled for this environment.' });
    return base;
  }
  if (!isMetaAuthoringAccountPermitted({ mode, sandbox: connection.sandbox, accountId: connection.accountId, allowlistedAccountIds: allowedAccountIds() })) {
    base.blockers.push({ code: 'meta_account_not_allowed', message: 'This Meta ad account is outside the configured authoring boundary.' });
    return base;
  }
  if (connection.tokenExpiresAt) {
    const remaining = new Date(connection.tokenExpiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      base.blockers.push({ code: 'meta_token_expired', message: 'Reconnect Meta because the access token has expired.' });
      return base;
    }
    if (remaining < 7 * 86_400_000) base.warnings.push({ code: 'meta_token_expires_soon', message: 'The Meta token expires within seven days.' });
  }
  try {
    const prerequisites = await getMetaAuthoringPrerequisites(connection.accessToken, connection.accountId);
    base.accountName = prerequisites.account.name;
    base.currency = prerequisites.account.currency;
    base.timezone = prerequisites.account.timezone;
    base.accountStatus = prerequisites.account.accountStatus;
    base.pages = prerequisites.pages;
    if (prerequisites.account.accountStatus !== 1) base.blockers.push({ code: 'meta_account_inactive', message: 'The connected Meta ad account is not active.' });
    if (prerequisites.account.disableReason) base.blockers.push({ code: 'meta_account_disabled', message: 'Meta reports that the ad account is disabled.' });
    if (prerequisites.pages.length === 0) base.blockers.push({ code: 'meta_page_required', message: 'Grant access to at least one Facebook Page to publish an ad.' });
    // Per Meta's Ad Account reference, spend_cap of 0 means "no cap set" — not
    // a real cap of zero. Treating 0 as a real value made this fire for every
    // account that has never had an explicit cap configured (the common case).
    if (
      prerequisites.account.spendCap != null && prerequisites.account.spendCap > 0 &&
      prerequisites.account.amountSpent != null && prerequisites.account.amountSpent >= prerequisites.account.spendCap
    ) {
      base.blockers.push({ code: 'meta_spend_cap_reached', message: 'The Meta ad account spend cap has been reached.' });
    }
  } catch (error) {
    base.blockers.push({ code: 'meta_prerequisites_unavailable', message: error instanceof Error ? error.message : 'Meta prerequisites could not be checked.' });
  }
  base.permitted = base.blockers.length === 0;
  return base;
}

function defaultBrandKit(): MetaAdsBrandKit {
  return {
    businessName: '', brandVoice: '', valueProposition: '', targetAudience: '',
    primaryColor: null, secondaryColor: null, logoAssetId: null,
    requiredPhrases: [], prohibitedPhrases: [], updatedAt: null,
  };
}

function brandFromRow(row: Record<string, unknown> | undefined): MetaAdsBrandKit {
  if (!row) return defaultBrandKit();
  return {
    businessName: String(row.business_name ?? ''),
    brandVoice: String(row.brand_voice ?? ''),
    valueProposition: String(row.value_proposition ?? ''),
    targetAudience: String(row.target_audience ?? ''),
    primaryColor: row.primary_color ? String(row.primary_color) : null,
    secondaryColor: row.secondary_color ? String(row.secondary_color) : null,
    logoAssetId: row.logo_asset_id ? String(row.logo_asset_id) : null,
    requiredPhrases: Array.isArray(row.required_phrases) ? row.required_phrases.map(String) : [],
    prohibitedPhrases: Array.isArray(row.prohibited_phrases) ? row.prohibited_phrases.map(String) : [],
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
  };
}

export async function getMetaAdsBrandKit(companyId: string): Promise<MetaAdsBrandKit> {
  const { rows } = await pool.query(`SELECT * FROM public.meta_ads_brand_kits WHERE company_id=$1`, [companyId]);
  return brandFromRow(rows[0]);
}

export async function putMetaAdsBrandKit(companyId: string, userId: string, input: Omit<MetaAdsBrandKit, 'updatedAt'>): Promise<MetaAdsBrandKit> {
  if (input.logoAssetId) {
    const logo = await pool.query(`SELECT id FROM public.meta_ads_creative_assets WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL`, [input.logoAssetId, companyId]);
    if (!logo.rowCount) fail(400, 'brand_logo_not_found');
  }
  const { rows } = await pool.query(
    `INSERT INTO public.meta_ads_brand_kits
      (company_id,business_name,brand_voice,value_proposition,target_audience,primary_color,secondary_color,logo_asset_id,required_phrases,prohibited_phrases,updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
     ON CONFLICT (company_id) DO UPDATE SET business_name=EXCLUDED.business_name,brand_voice=EXCLUDED.brand_voice,
       value_proposition=EXCLUDED.value_proposition,target_audience=EXCLUDED.target_audience,primary_color=EXCLUDED.primary_color,
       secondary_color=EXCLUDED.secondary_color,logo_asset_id=EXCLUDED.logo_asset_id,required_phrases=EXCLUDED.required_phrases,
       prohibited_phrases=EXCLUDED.prohibited_phrases,updated_by=EXCLUDED.updated_by,updated_at=NOW()
     RETURNING *`,
    [companyId, input.businessName.trim(), input.brandVoice.trim(), input.valueProposition.trim(), input.targetAudience.trim(),
      input.primaryColor, input.secondaryColor, input.logoAssetId, JSON.stringify(input.requiredPhrases), JSON.stringify(input.prohibitedPhrases), userId],
  );
  return brandFromRow(rows[0]);
}

export async function listMetaAdsCreativeAssets(companyId: string): Promise<MetaAdsCreativeAsset[]> {
  const { rows } = await pool.query(
    `SELECT * FROM public.meta_ads_creative_assets WHERE company_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500`,
    [companyId],
  );
  return Promise.all(rows.map((row) => signedMetaCreativeAsset(row)));
}

export async function uploadMetaAdsCreativeAsset(input: {
  companyId: string; userId: string; bytes: Buffer; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; fileName: string;
}): Promise<MetaAdsCreativeAsset> {
  const id = await persistMetaCreativeAsset({ ...input, source: 'upload', provenance: { source: 'user_upload' } });
  const { rows } = await pool.query(`SELECT * FROM public.meta_ads_creative_assets WHERE id=$1 AND company_id=$2`, [id, input.companyId]);
  return signedMetaCreativeAsset(rows[0]);
}

export async function deleteMetaAdsCreativeAsset(companyId: string, assetId: string): Promise<void> {
  const { rows: referenced } = await pool.query(
    `SELECT 1 FROM public.meta_ads_campaign_drafts
       WHERE company_id=$1 AND status NOT IN ('cancelled') AND content::text LIKE $2
     UNION ALL
     SELECT 1 FROM public.meta_ads_brand_kits WHERE company_id=$1 AND logo_asset_id=$3
     LIMIT 1`,
    [companyId, `%${assetId}%`, assetId],
  );
  if (referenced.length) fail(409, 'creative_asset_in_use');
  const { rows } = await pool.query(
    `UPDATE public.meta_ads_creative_assets SET deleted_at=NOW() WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL RETURNING storage_path`,
    [assetId, companyId],
  );
  if (!rows[0]) fail(404, 'creative_asset_not_found');
  await supabaseAdmin.storage.from(BUCKET).remove([String(rows[0].storage_path)]);
}

function defaultDraftContent(name: string): MetaAdsCampaignDraftContent {
  const start = new Date(Date.now() + 60 * 60_000);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  return {
    name,
    destination: 'website',
    leadForm: null,
    brief: { goal: '', offer: '', proofPoints: [], targetCustomer: '', landingPageUrl: '', callToAction: 'LEARN_MORE', regulatedCategory: 'none' },
    identity: null,
    audience: { countries: [], ageMin: 18, ageMax: 65, languageIds: [] },
    lifetimeBudgetMinor: 0,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    specialAdCategories: [],
    dsaBeneficiary: '',
    dsaPayor: '',
    productContext: null,
    concepts: [],
    ads: [],
  };
}

/**
 * Drafts stored before lead-form support have no `destination` or `leadForm` key in their JSONB.
 * Normalising on every read keeps `undefined` out of validation and payload builders, which would
 * otherwise silently skip the website-only checks rather than failing loudly.
 */
function draftContent(raw: unknown): MetaAdsCampaignDraftContent {
  const content = raw as MetaAdsCampaignDraftContent;
  return {
    ...content,
    destination: content.destination === 'lead_form' ? 'lead_form' : 'website',
    leadForm: content.leadForm ?? null,
  };
}

async function actorName(userId: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT NULLIF(TRIM(CONCAT(first_name,' ',last_name)),'') AS name FROM public.user_profiles WHERE id=$1`,
    [userId],
  );
  return String(rows[0]?.name || 'Team member');
}

async function addEvent(input: {
  companyId: string; draftId: string; type: string; userId?: string | null; actor?: string | null;
  payload?: Record<string, unknown>; idempotencyKey?: string | null;
}, client: PoolClient | typeof pool = pool): Promise<boolean> {
  const name = input.actor ?? (input.userId ? await actorName(input.userId) : null);
  const result = await client.query(
    `INSERT INTO public.meta_ads_campaign_events
      (company_id,draft_id,event_type,actor_user_id,actor_name_snapshot,payload,idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT DO NOTHING`,
    [input.companyId, input.draftId, input.type, input.userId ?? null, name, JSON.stringify(input.payload ?? {}), input.idempotencyKey ?? null],
  );
  return result.rowCount === 1;
}

function mergeContent(current: MetaAdsCampaignDraftContent, patch: Partial<MetaAdsCampaignDraftContent>): MetaAdsCampaignDraftContent {
  const leadForm = patch.leadForm === undefined ? current.leadForm : patch.leadForm;
  return {
    ...current,
    ...patch,
    brief: { ...current.brief, ...(patch.brief ?? {}) },
    audience: { ...current.audience, ...(patch.audience ?? {}) },
    identity: patch.identity === undefined ? current.identity : patch.identity,
    productContext: patch.productContext === undefined ? current.productContext : patch.productContext,
    concepts: patch.concepts ?? current.concepts,
    ads: patch.ads ?? current.ads,
    // Always recomputed here rather than trusted from the client: the hash decides which Meta
    // form a publish reuses, so a caller-supplied value could bind a draft to someone else's form.
    leadForm: leadForm ? { ...leadForm, questionSetHash: metaAdsLeadFormQuestionSetHash(leadForm) } : null,
  };
}

async function campaignJobFromRow(row: Record<string, unknown> | undefined): Promise<MetaAdsCampaignJob | null> {
  if (!row) return null;
  const { rows: steps } = await pool.query(
    `SELECT step_key,status,meta_object_id,error_code,error_message FROM public.meta_ads_campaign_job_steps WHERE job_id=$1 ORDER BY created_at,id`,
    [row.id],
  );
  return {
    id: String(row.id), draftId: String(row.draft_id), kind: row.job_kind as MetaAdsCampaignJobKind,
    status: row.status as MetaAdsCampaignJob['status'], attempt: Number(row.attempt), maxAttempts: Number(row.max_attempts),
    error: row.error_message ? String(row.error_message) : row.error_code ? String(row.error_code) : null,
    requestedAt: new Date(String(row.requested_at)).toISOString(),
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    steps: steps.map((step) => ({
      key: String(step.step_key), status: step.status, metaObjectId: step.meta_object_id ? String(step.meta_object_id) : null,
      error: step.error_message ? String(step.error_message) : step.error_code ? String(step.error_code) : null,
    })),
  };
}

async function shapeDraft(row: Record<string, unknown>, includeEvents = false): Promise<MetaAdsCampaignDraft> {
  const [approvals, jobs, mappings, events] = await Promise.all([
    pool.query(`SELECT * FROM public.meta_ads_campaign_approvals WHERE draft_id=$1 ORDER BY approved_at`, [row.id]),
    pool.query(`SELECT * FROM public.meta_ads_campaign_jobs WHERE draft_id=$1 ORDER BY requested_at DESC LIMIT 1`, [row.id]),
    pool.query(`SELECT object_kind,local_key,meta_object_id FROM public.meta_ads_entity_mappings WHERE draft_id=$1 AND version=$2`, [row.id, row.current_version]),
    includeEvents ? pool.query(`SELECT * FROM public.meta_ads_campaign_events WHERE draft_id=$1 ORDER BY created_at,id`, [row.id]) : Promise.resolve({ rows: [] }),
  ]);
  const mapping = mappings.rows;
  const campaignId = mapping.find((item) => item.object_kind === 'campaign')?.meta_object_id ?? null;
  const adsetId = mapping.find((item) => item.object_kind === 'adset')?.meta_object_id ?? null;
  return {
    id: String(row.id), accountId: String(row.ad_account_id), status: row.status as MetaAdsCampaignDraft['status'],
    version: Number(row.current_version), content: draftContent(row.content),
    preflight: (row.preflight as MetaAdsCampaignPreflight | null) ?? null,
    approvals: approvals.rows.map((approval) => ({
      id: String(approval.id), kind: approval.approval_kind, approvedBy: approval.approved_by ? String(approval.approved_by) : null,
      approvedByName: String(approval.approver_name_snapshot), version: Number(approval.version), snapshotHash: String(approval.snapshot_hash),
      note: approval.note ? String(approval.note) : null, approvedAt: new Date(approval.approved_at).toISOString(),
    })),
    latestJob: await campaignJobFromRow(jobs.rows[0]),
    metaObjects: {
      campaignId: campaignId ? String(campaignId) : null,
      adsetId: adsetId ? String(adsetId) : null,
      creativeIds: mapping.filter((item) => item.object_kind === 'creative').map((item) => String(item.meta_object_id)),
      adIds: mapping.filter((item) => item.object_kind === 'ad').map((item) => String(item.meta_object_id)),
    },
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    ...(includeEvents ? { events: events.rows.map((event): MetaAdsCampaignEvent => ({
      id: String(event.id), type: String(event.event_type), actorName: event.actor_name_snapshot ? String(event.actor_name_snapshot) : null,
      payload: (event.payload ?? {}) as Record<string, unknown>, createdAt: new Date(event.created_at).toISOString(),
    })) } : {}),
  };
}

export async function listMetaAdsCampaignDrafts(companyId: string): Promise<MetaAdsCampaignDraft[]> {
  const { rows } = await pool.query(`SELECT * FROM public.meta_ads_campaign_drafts WHERE company_id=$1 ORDER BY updated_at DESC LIMIT 100`, [companyId]);
  return Promise.all(rows.map((row) => shapeDraft(row)));
}

export async function getMetaAdsCampaignDraft(companyId: string, draftId: string): Promise<MetaAdsCampaignDraft> {
  const { rows } = await pool.query(`SELECT * FROM public.meta_ads_campaign_drafts WHERE id=$1 AND company_id=$2`, [draftId, companyId]);
  if (!rows[0]) fail(404, 'campaign_draft_not_found');
  return shapeDraft(rows[0], true);
}

export async function createMetaAdsCampaignDraft(input: { companyId: string; userId: string; name?: string }): Promise<MetaAdsCampaignDraft> {
  const readiness = await getMetaAdsAuthoringReadiness(input.companyId);
  if (!readiness.permitted || !readiness.accountId) fail(409, readiness.blockers[0]?.code ?? 'meta_authoring_not_ready');
  const content = defaultDraftContent(input.name?.trim() || 'New website traffic campaign');
  const hash = metaAdsDraftSnapshotHash(content);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO public.meta_ads_campaign_drafts
        (company_id,ad_account_id,status,current_version,content,snapshot_hash,created_by,updated_by)
       VALUES ($1,$2,'draft',1,$3::jsonb,$4,$5,$5) RETURNING *`,
      [input.companyId, readiness.accountId, JSON.stringify(content), hash, input.userId],
    );
    await client.query(
      `INSERT INTO public.meta_ads_campaign_draft_versions
        (draft_id,company_id,version,content,snapshot_hash,reason,created_by) VALUES ($1,$2,1,$3::jsonb,$4,'created',$5)`,
      [rows[0].id, input.companyId, JSON.stringify(content), hash, input.userId],
    );
    await addEvent({ companyId: input.companyId, draftId: String(rows[0].id), type: 'draft_created', userId: input.userId }, client);
    await client.query('COMMIT');
    return shapeDraft(rows[0], true);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function draftRow(companyId: string, draftId: string): Promise<Record<string, unknown>> {
  const { rows } = await pool.query(`SELECT * FROM public.meta_ads_campaign_drafts WHERE id=$1 AND company_id=$2`, [draftId, companyId]);
  if (!rows[0]) fail(404, 'campaign_draft_not_found');
  return rows[0];
}

export async function patchMetaAdsCampaignDraft(input: {
  companyId: string; userId: string; draftId: string; patch: Partial<MetaAdsCampaignDraftContent>; expectedVersion: number;
}): Promise<MetaAdsCampaignDraft> {
  const row = await draftRow(input.companyId, input.draftId);
  if (!EDITABLE_STATUSES.has(String(row.status))) fail(409, 'campaign_draft_immutable_clone_required');
  if (Number(row.current_version) !== input.expectedVersion) fail(409, 'campaign_draft_version_conflict');
  const content = mergeContent(draftContent(row.content), input.patch);
  const version = Number(row.current_version) + 1;
  const hash = metaAdsDraftSnapshotHash(content);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE public.meta_ads_campaign_drafts SET content=$4::jsonb,current_version=$5,snapshot_hash=$6,preflight=NULL,updated_by=$7,updated_at=NOW()
        WHERE id=$1 AND company_id=$2 AND current_version=$3 AND status='draft' RETURNING *`,
      [input.draftId, input.companyId, input.expectedVersion, JSON.stringify(content), version, hash, input.userId],
    );
    if (!updated.rowCount) fail(409, 'campaign_draft_version_conflict');
    await client.query(
      `INSERT INTO public.meta_ads_campaign_draft_versions
        (draft_id,company_id,version,content,snapshot_hash,reason,created_by) VALUES ($1,$2,$3,$4::jsonb,$5,'edited',$6)`,
      [input.draftId, input.companyId, version, JSON.stringify(content), hash, input.userId],
    );
    await addEvent({ companyId: input.companyId, draftId: input.draftId, type: 'draft_updated', userId: input.userId, payload: { version } }, client);
    await client.query('COMMIT');
    return shapeDraft(updated.rows[0], true);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function resolveMetaAdsErpProduct(companyId: string, itemCode: string): Promise<MetaAdsErpProductContext> {
  const code = itemCode.trim();
  if (!code) fail(400, 'item_code_required');
  const results = await queryRecords(companyId, [
    { id: 'item', doctype: 'Item', fields: ['name','item_code','item_name','disabled'], filters: [['item_code', '=', code]], limit: 1, pageSize: 100 },
    { id: 'price', doctype: 'Item Price', fields: ['item_code','price_list','price_list_rate','currency','valid_from'], filters: [['item_code', '=', code]], limit: 20, pageSize: 100 },
    { id: 'stock', doctype: 'Bin', fields: ['item_code','warehouse','actual_qty'], filters: [['item_code', '=', code]], limit: 100, pageSize: 100 },
  ]);
  const itemResult = results.find((result) => result.id === 'item');
  if (!itemResult?.ok || !itemResult.rows[0]) fail(404, 'erp_item_not_found');
  const item = itemResult.rows[0];
  const priceRows = results.find((result) => result.id === 'price');
  const stockRows = results.find((result) => result.id === 'stock');
  const price = priceRows?.ok ? priceRows.rows.find((row) => Number(row.price_list_rate) > 0) : undefined;
  const stockQuantity = stockRows?.ok ? stockRows.rows.reduce((sum, row) => sum + (Number(row.actual_qty) || 0), 0) : null;
  const disabled = item.disabled === true || item.disabled === 1 || String(item.disabled).toLowerCase() === 'true';
  return {
    itemCode: String(item.item_code ?? item.name ?? code),
    itemName: String(item.item_name ?? item.item_code ?? item.name ?? code),
    disabled,
    currency: price?.currency ? String(price.currency) : null,
    price: price ? Number(price.price_list_rate) || null : null,
    stockQuantity,
    source: 'erpnext',
    confirmedAt: new Date().toISOString(),
  };
}

function issue(code: string, message: string, field: string | null = null, severity: 'blocking' | 'warning' = 'blocking'): MetaAdsPreflightIssue {
  return { code, message, field, severity };
}

function safeLandingPage(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1') return false;
    if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
    return host.includes('.');
  } catch {
    return false;
  }
}

const REGULATED_TERMS = /\b(casino|betting|gambling|tobacco|cigarette|vape|weapon|firearm|crypto(?:currency)?|credit|loan|mortgage|employment|recruit(?:ing|ment)?|hiring|job opening|housing|real estate|apartment|prescription|diagnose|cure|politic(?:al|s)?|adult content)\b/i;

/** SHOP_NOW makes no sense on a form that collects contact details rather than selling. */
const LEAD_FORM_CALL_TO_ACTIONS = new Set<MetaAdsCampaignDraftContent['brief']['callToAction']>([
  'SIGN_UP', 'GET_QUOTE', 'CONTACT_US', 'LEARN_MORE',
]);

export function evaluateMetaAdsCampaignDraft(input: {
  content: MetaAdsCampaignDraftContent;
  readiness: MetaAdsAuthoringReadiness;
  availableAssetIds: Set<string>;
  brand: MetaAdsBrandKit;
  now?: Date;
  phase?: 'draft' | 'launch';
}): MetaAdsCampaignPreflight {
  const { content, readiness, brand } = input;
  const now = input.now ?? new Date();
  const issues: MetaAdsPreflightIssue[] = readiness.blockers.map((blocker) => issue(blocker.code, blocker.message));
  issues.push(...readiness.warnings.map((warning) => issue(warning.code, warning.message, null, 'warning')));
  if (!content.name.trim()) issues.push(issue('campaign_name_required', 'Add a campaign name.', 'name'));
  if (!content.brief.goal.trim() || !content.brief.offer.trim() || !content.brief.targetCustomer.trim()) {
    issues.push(issue('campaign_brief_incomplete', 'Goal, offer, and target customer are required.', 'brief'));
  }
  // Lead-form ads keep people inside Meta's instant form, so there is no landing page to check.
  // Tested against `!== 'lead_form'` rather than `=== 'website'` so a draft whose JSONB predates
  // this field still gets the website checks instead of silently skipping them.
  if (content.destination !== 'lead_form' && !safeLandingPage(content.brief.landingPageUrl)) {
    issues.push(issue('landing_page_url_invalid', 'Use a public HTTPS landing-page URL.', 'brief.landingPageUrl'));
  }
  if (content.destination === 'lead_form') {
    const leadForm = content.leadForm;
    if (!leadForm) {
      issues.push(issue('lead_form_missing', 'Configure the lead form for this campaign.', 'leadForm'));
    } else {
      // Meta rejects a leadgen form without one, so fail here rather than mid-publish.
      if (!safeLandingPage(leadForm.privacyPolicyUrl)) {
        issues.push(issue('lead_form_privacy_policy_invalid', 'Meta requires a public HTTPS privacy-policy URL on every lead form.', 'leadForm.privacyPolicyUrl'));
      }
      if (leadForm.followUpUrl.trim() && !safeLandingPage(leadForm.followUpUrl)) {
        issues.push(issue('lead_form_follow_up_invalid', 'Use a public HTTPS URL for the follow-up page.', 'leadForm.followUpUrl'));
      }
      // Verified against Graph v25: supplying a context card without a follow-up URL fails the
      // create with error_subcode 1892085 ("Missing field(s): FollowUpActionURL").
      if ((leadForm.contextHeadline.trim() || leadForm.contextDescription.trim()) && !leadForm.followUpUrl.trim()) {
        issues.push(issue('lead_form_follow_up_required', 'Meta requires a follow-up URL when the form shows an intro card.', 'leadForm.followUpUrl'));
      }
      if (leadForm.questions.length === 0) {
        issues.push(issue('lead_form_questions_required', 'Add at least one question to the lead form.', 'leadForm.questions'));
      }
      // Frappe CRM's facebook_lead_form.py throws unless first_name is mapped; catching it here
      // keeps the failure in preflight instead of halfway through a publish job.
      if (leadForm.questions.filter((question) => question.crmField === 'first_name').length !== 1) {
        issues.push(issue('lead_form_first_name_required', 'Exactly one question must map to the CRM first name field.', 'leadForm.questions'));
      }
      const duplicateKeys = new Set<string>();
      for (const question of leadForm.questions) {
        if (duplicateKeys.has(question.key)) issues.push(issue('lead_form_duplicate_question', 'Each lead-form question must be unique.', 'leadForm.questions'));
        duplicateKeys.add(question.key);
        if (!question.label.trim()) issues.push(issue('lead_form_question_label_required', 'Every lead-form question needs a label.', 'leadForm.questions'));
      }
      if (!LEAD_FORM_CALL_TO_ACTIONS.has(content.brief.callToAction)) {
        issues.push(issue('lead_form_cta_invalid', 'Choose a lead-appropriate call to action.', 'brief.callToAction'));
      }
    }
  }
  if (content.specialAdCategories.length > 0) issues.push(issue('special_ad_category_blocked', 'Special Ad Category campaigns must be created in Ads Manager.', 'specialAdCategories'));
  const policyText = [content.name, content.brief.goal, content.brief.offer, content.brief.targetCustomer, ...content.brief.proofPoints,
    ...content.ads.flatMap((ad) => [ad.primaryText, ad.headline, ad.description])].join(' ');
  if (content.brief.regulatedCategory !== 'none' || REGULATED_TERMS.test(policyText)) {
    issues.push(issue('regulated_campaign_blocked', 'This campaign appears regulated or high risk and must be created in Ads Manager.', 'brief.regulatedCategory'));
  }
  const accessibleIdentity = content.identity?.pageId
    ? readiness.pages.find((page) => page.pageId === content.identity?.pageId)
    : null;
  if (!accessibleIdentity) {
    issues.push(issue('meta_page_invalid', 'Choose an accessible Facebook Page identity.', 'identity'));
  } else if (content.identity?.instagramActorId !== accessibleIdentity.instagramActorId) {
    issues.push(issue('meta_instagram_identity_invalid', 'Choose the Instagram identity attached to the selected Facebook Page.', 'identity'));
  }
  // Meta rejects the ad set — not the form or campaign — with "You can't run lead ads until your
  // Facebook Page accepts Facebook's Lead Generation Terms of Service." Checked against live
  // readiness rather than the stored identity, and only when it is knowably false, so a Page the
  // API declines to report on does not block publishing. Acceptance is manual in Page settings;
  // no API can do it for the user.
  if (content.destination === 'lead_form' && accessibleIdentity?.leadgenTosAccepted === false) {
    issues.push(issue('meta_leadgen_tos_required', `Accept Meta's Lead Generation Terms for the ${accessibleIdentity.pageName} Page before publishing a lead form.`, 'identity'));
  }
  if (content.audience.countries.length === 0 || content.audience.countries.some((country) => !/^[A-Z]{2}$/.test(country))) {
    issues.push(issue('audience_location_invalid', 'Choose at least one two-letter country code.', 'audience.countries'));
  }
  if (content.audience.ageMin < 18 || content.audience.ageMax > 65 || content.audience.ageMin > content.audience.ageMax) {
    issues.push(issue('audience_age_invalid', 'Age must stay between 18 and 65.', 'audience'));
  }
  if (content.audience.languageIds.some((value) => !Number.isInteger(value) || value <= 0)) issues.push(issue('audience_language_invalid', 'Meta language IDs must be positive integers.', 'audience.languageIds'));
  if (!Number.isInteger(content.lifetimeBudgetMinor) || content.lifetimeBudgetMinor <= 0 || content.lifetimeBudgetMinor > readiness.maxLifetimeBudgetMinor) {
    issues.push(issue('lifetime_budget_invalid', `Lifetime budget must be between 1 and ${readiness.maxLifetimeBudgetMinor} minor currency units.`, 'lifetimeBudgetMinor'));
  }
  const start = new Date(content.startTime);
  const end = new Date(content.endTime);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) issues.push(issue('schedule_invalid', 'Choose a valid start and end time.', 'startTime'));
  else {
    if (input.phase !== 'launch' && start.getTime() < now.getTime() + 5 * 60_000) issues.push(issue('schedule_start_too_soon', 'Start time must be at least five minutes in the future.', 'startTime'));
    if (end.getTime() <= now.getTime()) issues.push(issue('schedule_ended', 'The campaign end time has already passed.', 'endTime'));
    if (end.getTime() - start.getTime() > 90 * 86_400_000) issues.push(issue('schedule_too_long', 'V1 campaigns may run for at most 90 days.', 'endTime'));
  }
  if (content.audience.countries.some((country) => EEA_COUNTRIES.has(country)) && (!content.dsaBeneficiary.trim() || !content.dsaPayor.trim())) {
    issues.push(issue('dsa_disclosure_required', 'EU/EEA targeting requires beneficiary and payer disclosures.', 'dsaBeneficiary'));
  }
  if (content.ads.length < 1 || content.ads.length > 3) issues.push(issue('ad_count_invalid', 'Select between one and three single-image ads.', 'ads'));
  const duplicateAdIds = new Set<string>();
  for (const ad of content.ads) {
    if (duplicateAdIds.has(ad.id)) issues.push(issue('duplicate_ad', 'Each selected ad must be unique.', 'ads'));
    duplicateAdIds.add(ad.id);
    if (!input.availableAssetIds.has(ad.assetId)) issues.push(issue('creative_asset_missing', `The image for ${ad.name || 'an ad'} is unavailable.`, 'ads'));
    if (!ad.primaryText.trim() || !ad.headline.trim() || ad.primaryText.length > 500 || ad.headline.length > 100 || ad.description.length > 150) {
      issues.push(issue('ad_copy_invalid', `Copy for ${ad.name || 'an ad'} is missing or too long.`, 'ads'));
    }
  }
  const normalized = policyText.toLowerCase();
  for (const phrase of brand.requiredPhrases) if (phrase.trim() && !normalized.includes(phrase.trim().toLowerCase())) issues.push(issue('required_brand_phrase_missing', `Required phrase is missing: ${phrase}`, 'ads'));
  for (const phrase of brand.prohibitedPhrases) if (phrase.trim() && normalized.includes(phrase.trim().toLowerCase())) issues.push(issue('prohibited_brand_phrase_used', `Prohibited phrase is present: ${phrase}`, 'ads'));
  if (content.productContext?.disabled) issues.push(issue('erp_item_disabled', 'The selected ERPNext item is disabled.', 'productContext'));
  if (content.productContext?.stockQuantity != null && content.productContext.stockQuantity <= 0) issues.push(issue('erp_item_out_of_stock', 'The selected ERPNext item is out of stock.', 'productContext'));
  return {
    checkedAt: now.toISOString(),
    ready: issues.every((item) => item.severity !== 'blocking'),
    snapshotHash: metaAdsDraftSnapshotHash(content),
    issues,
  };
}

export async function preflightMetaAdsCampaign(companyId: string, draftId: string, phase: 'draft' | 'launch' = 'draft'): Promise<MetaAdsCampaignPreflight> {
  const row = await draftRow(companyId, draftId);
  const content = draftContent(row.content);
  const [readiness, brand, assets] = await Promise.all([
    getMetaAdsAuthoringReadiness(companyId),
    getMetaAdsBrandKit(companyId),
    pool.query(`SELECT id FROM public.meta_ads_creative_assets WHERE company_id=$1 AND deleted_at IS NULL`, [companyId]),
  ]);
  if (readiness.accountId && readiness.accountId !== String(row.ad_account_id)) {
    readiness.blockers.push({ code: 'meta_account_changed', message: 'The connected Meta account changed; clone this draft for the new account.' });
  }
  let evaluatedContent = content;
  if (content.productContext) {
    try {
      const freshProduct = await resolveMetaAdsErpProduct(companyId, content.productContext.itemCode);
      evaluatedContent = { ...content, productContext: freshProduct };
      const prior = content.productContext;
      if (freshProduct.disabled !== prior.disabled || freshProduct.price !== prior.price || freshProduct.currency !== prior.currency || freshProduct.stockQuantity !== prior.stockQuantity) {
        readiness.blockers.push({ code: 'erp_product_changed', message: 'ERPNext price, availability, or item state changed. Reconfirm the item in the editable draft.' });
      }
    } catch (error) {
      readiness.blockers.push({ code: 'erp_product_verification_failed', message: error instanceof Error ? error.message : 'ERP product could not be verified.' });
    }
  }
  const result = evaluateMetaAdsCampaignDraft({ content: evaluatedContent, readiness, brand, availableAssetIds: new Set(assets.rows.map((asset) => String(asset.id))), phase });
  result.snapshotHash = metaAdsDraftSnapshotHash(content);
  await pool.query(`UPDATE public.meta_ads_campaign_drafts SET preflight=$3::jsonb,updated_at=NOW() WHERE id=$1 AND company_id=$2`,
    [draftId, companyId, JSON.stringify(result)]);
  return result;
}

export async function submitMetaAdsCampaignDraft(input: { companyId: string; userId: string; draftId: string; expectedVersion: number }): Promise<MetaAdsCampaignDraft> {
  const row = await draftRow(input.companyId, input.draftId);
  if (row.status !== 'draft') fail(409, 'invalid_campaign_transition');
  if (Number(row.current_version) !== input.expectedVersion) fail(409, 'campaign_draft_version_conflict');
  const preflight = await preflightMetaAdsCampaign(input.companyId, input.draftId);
  if (!preflight.ready) fail(409, 'campaign_preflight_failed');
  const actor = await actorName(input.userId);
  const client = await pool.connect();
  let updatedRow: Record<string, unknown> | null = null;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE public.meta_ads_campaign_drafts SET status='submitted',preflight=$4::jsonb,updated_by=$5,updated_at=NOW()
        WHERE id=$1 AND company_id=$2 AND current_version=$3 AND status='draft' AND snapshot_hash=$6 RETURNING *`,
      [input.draftId, input.companyId, input.expectedVersion, JSON.stringify(preflight), input.userId, preflight.snapshotHash],
    );
    if (!rows[0]) fail(409, 'campaign_draft_version_conflict');
    updatedRow = rows[0];
    await addEvent({
      companyId: input.companyId,
      draftId: input.draftId,
      type: 'submitted_for_publish_approval',
      userId: input.userId,
      actor,
      payload: { version: input.expectedVersion },
    }, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return shapeDraft(updatedRow!, true);
}

export async function enqueueMetaAdsCreativeGeneration(input: {
  companyId: string; userId: string; draftId: string; expectedVersion: number; idempotencyKey: string; replaceConceptId?: string;
}): Promise<MetaAdsCreativeGenerationJob> {
  if (input.idempotencyKey.length < 8) fail(400, 'invalid_idempotency_key');
  const existing = await pool.query(`SELECT * FROM public.meta_ads_creative_generation_jobs WHERE company_id=$1 AND idempotency_key=$2`, [input.companyId, input.idempotencyKey]);
  if (existing.rows[0]) {
    const prior = existing.rows[0];
    const priorSnapshot = prior.brief_snapshot as { replaceConceptId?: string | null };
    if (String(prior.draft_id) !== input.draftId || Number(prior.requested_version) !== input.expectedVersion
      || (priorSnapshot.replaceConceptId ?? null) !== (input.replaceConceptId ?? null)) {
      fail(409, 'idempotency_key_conflict');
    }
    return shapeCreativeJob(prior);
  }
  const row = await draftRow(input.companyId, input.draftId);
  if (row.status !== 'draft' || Number(row.current_version) !== input.expectedVersion) {
    const replay = await pool.query(
      `SELECT * FROM public.meta_ads_creative_generation_jobs WHERE company_id=$1 AND idempotency_key=$2`,
      [input.companyId, input.idempotencyKey],
    );
    if (replay.rows[0]) {
      const prior = replay.rows[0] as Record<string, unknown>;
      const priorSnapshot = prior.brief_snapshot as { replaceConceptId?: string | null };
      if (String(prior.draft_id) !== input.draftId || Number(prior.requested_version) !== input.expectedVersion
        || (priorSnapshot.replaceConceptId ?? null) !== (input.replaceConceptId ?? null)) {
        fail(409, 'idempotency_key_conflict');
      }
      return shapeCreativeJob(prior);
    }
    fail(409, 'campaign_draft_version_conflict');
  }
  const brand = await getMetaAdsBrandKit(input.companyId);
  if (!brand.businessName || !brand.valueProposition || !brand.targetAudience) fail(409, 'brand_kit_incomplete');
  const content = draftContent(row.content);
  if (!content.brief.goal || !content.brief.offer || !content.brief.targetCustomer) fail(409, 'campaign_brief_incomplete');
  if (input.replaceConceptId && !content.concepts.some((concept) => concept.id === input.replaceConceptId)) fail(404, 'creative_concept_not_found');
  const actor = await actorName(input.userId);
  const client = await pool.connect();
  let jobRow: Record<string, unknown> | null = null;
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM public.meta_ads_campaign_drafts WHERE id=$1 AND company_id=$2 FOR UPDATE`,
      [input.draftId, input.companyId],
    );
    const lockedRow = locked.rows[0] as Record<string, unknown> | undefined;
    if (!lockedRow) fail(404, 'campaign_draft_not_found');
    const raced = await client.query(
      `SELECT * FROM public.meta_ads_creative_generation_jobs WHERE company_id=$1 AND idempotency_key=$2`,
      [input.companyId, input.idempotencyKey],
    );
    if (raced.rows[0]) {
      const prior = raced.rows[0] as Record<string, unknown>;
      const priorSnapshot = prior.brief_snapshot as { replaceConceptId?: string | null };
      if (String(prior.draft_id) !== input.draftId || Number(prior.requested_version) !== input.expectedVersion
        || (priorSnapshot.replaceConceptId ?? null) !== (input.replaceConceptId ?? null)) {
        fail(409, 'idempotency_key_conflict');
      }
      jobRow = prior;
    } else {
      if (lockedRow.status !== 'draft' || Number(lockedRow.current_version) !== input.expectedVersion
        || String(lockedRow.snapshot_hash) !== String(row.snapshot_hash)) {
        fail(409, 'campaign_draft_version_conflict');
      }
      const inserted = await client.query(
        `INSERT INTO public.meta_ads_creative_generation_jobs
          (company_id,draft_id,requested_version,brief_snapshot,brand_snapshot,product_snapshot,idempotency_key,requested_by)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8) RETURNING *`,
        [input.companyId, input.draftId, input.expectedVersion, JSON.stringify({ brief: content.brief, replaceConceptId: input.replaceConceptId ?? null }),
          JSON.stringify(brand), JSON.stringify(content.productContext), input.idempotencyKey, input.userId],
      );
      const createdJob = inserted.rows[0] as Record<string, unknown> | undefined;
      if (!createdJob) fail(500, 'creative_generation_job_not_created');
      jobRow = createdJob;
      const updated = await client.query(
        `UPDATE public.meta_ads_campaign_drafts SET status='generating',updated_at=NOW()
          WHERE id=$1 AND company_id=$2 AND status='draft' AND current_version=$3`,
        [input.draftId, input.companyId, input.expectedVersion],
      );
      if (updated.rowCount !== 1) fail(409, 'campaign_draft_version_conflict');
      await addEvent({
        companyId: input.companyId,
        draftId: input.draftId,
        type: input.replaceConceptId ? 'creative_regeneration_requested' : 'creative_generation_requested',
        userId: input.userId,
        actor,
        payload: { jobId: createdJob.id, replaceConceptId: input.replaceConceptId ?? null },
        idempotencyKey: `${input.idempotencyKey}:event`,
      }, client);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return shapeCreativeJob(jobRow!);
}

function shapeCreativeJob(row: Record<string, unknown>): MetaAdsCreativeGenerationJob {
  return {
    id: String(row.id), draftId: String(row.draft_id), status: row.status as MetaAdsCreativeGenerationJob['status'],
    attempt: Number(row.attempt), maxAttempts: Number(row.max_attempts),
    error: row.error_message ? String(row.error_message) : row.error_code ? String(row.error_code) : null,
    concepts: Array.isArray(row.concepts) ? row.concepts as MetaAdsCreativeGenerationJob['concepts'] : [],
    requestedAt: new Date(String(row.requested_at)).toISOString(),
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
  };
}

export async function getMetaAdsCreativeGenerationJob(companyId: string, jobId: string): Promise<MetaAdsCreativeGenerationJob> {
  const { rows } = await pool.query(`SELECT * FROM public.meta_ads_creative_generation_jobs WHERE id=$1 AND company_id=$2`, [jobId, companyId]);
  if (!rows[0]) fail(404, 'creative_job_not_found');
  return shapeCreativeJob(rows[0]);
}

export async function claimOneMetaAdsCreativeJob(companyId?: string): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(
    `UPDATE public.meta_ads_creative_generation_jobs SET status='running',attempt=attempt+1,started_at=COALESCE(started_at,NOW()),
       locked_at=NOW(),locked_until=NOW()+INTERVAL '15 minutes',locked_by=$1,error_code=NULL,error_message=NULL
     WHERE id=(SELECT id FROM public.meta_ads_creative_generation_jobs
       WHERE available_at<=NOW() AND (status='pending' OR (status='running' AND locked_until<NOW()))
         AND ($2::uuid IS NULL OR company_id=$2)
       ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
    [env.WORKER_ID, companyId ?? null],
  );
  return rows[0] ?? null;
}

export async function processOneMetaAdsCreativeJob(companyId?: string): Promise<boolean> {
  const job = await claimOneMetaAdsCreativeJob(companyId);
  if (!job) return false;
  try {
    const row = await draftRow(String(job.company_id), String(job.draft_id));
    if (Number(row.current_version) !== Number(job.requested_version) || row.status !== 'generating') fail(409, 'creative_job_stale');
    const snapshot = job.brief_snapshot as { brief: MetaAdsCampaignDraftContent['brief']; replaceConceptId?: string | null };
    const concepts = await generateMetaCreativeConcepts({
      companyId: String(job.company_id), userId: String(job.requested_by), draftId: String(job.draft_id),
      brief: snapshot.brief, brand: job.brand_snapshot as MetaAdsBrandKit,
      product: (job.product_snapshot as MetaAdsErpProductContext | null) ?? null,
    });
    const current = draftContent(row.content);
    let nextConcepts = concepts;
    let nextAds = current.ads;
    if (snapshot.replaceConceptId) {
      const replacement = { ...concepts[0], id: snapshot.replaceConceptId };
      nextConcepts = current.concepts.map((concept) => concept.id === snapshot.replaceConceptId ? replacement : concept);
      nextAds = current.ads.map((ad) => ad.conceptId === snapshot.replaceConceptId ? {
        ...ad, assetId: replacement.assetIds['1:1'] ?? ad.assetId, primaryText: replacement.primaryText,
        headline: replacement.headline, description: replacement.description, callToAction: replacement.callToAction,
      } : ad);
    }
    const content = { ...current, concepts: nextConcepts, ads: nextAds };
    const version = Number(row.current_version) + 1;
    const hash = metaAdsDraftSnapshotHash(content);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updatedDraft = await client.query(
        `UPDATE public.meta_ads_campaign_drafts SET status='draft',content=$2::jsonb,current_version=$3,snapshot_hash=$4,preflight=NULL,updated_at=NOW()
          WHERE id=$1 AND status='generating' AND current_version=$5`,
        [job.draft_id, JSON.stringify(content), version, hash, job.requested_version],
      );
      if (updatedDraft.rowCount !== 1) fail(409, 'creative_job_stale');
      await client.query(
        `INSERT INTO public.meta_ads_campaign_draft_versions
          (draft_id,company_id,version,content,snapshot_hash,reason,created_by) VALUES ($1,$2,$3,$4::jsonb,$5,'creative_generated',$6)`,
        [job.draft_id, job.company_id, version, JSON.stringify(content), hash, job.requested_by],
      );
      await client.query(
        `UPDATE public.meta_ads_creative_generation_jobs SET status='complete',concepts=$2::jsonb,completed_at=NOW(),locked_at=NULL,locked_until=NULL,locked_by=NULL WHERE id=$1`,
        [job.id, JSON.stringify(snapshot.replaceConceptId ? [nextConcepts.find((concept) => concept.id === snapshot.replaceConceptId)] : concepts)],
      );
      await addEvent({ companyId: String(job.company_id), draftId: String(job.draft_id), type: 'creative_generated', userId: job.requested_by ? String(job.requested_by) : null, payload: { jobId: job.id, version, replaceConceptId: snapshot.replaceConceptId ?? null } }, client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const failure = normalizedAuthoringFailure(error, 'creative_generation_failed');
    const retry = failure.retryable && Number(job.attempt) < Number(job.max_attempts);
    await pool.query(
      `UPDATE public.meta_ads_creative_generation_jobs SET status=$2,error_code=$3,error_message=$4,
       available_at=CASE WHEN $2='pending' THEN NOW()+($5 || ' seconds')::interval ELSE available_at END,
       completed_at=CASE WHEN $2='failed' THEN NOW() ELSE NULL END,locked_at=NULL,locked_until=NULL,locked_by=NULL WHERE id=$1`,
      [job.id, retry ? 'pending' : 'failed', failure.code, failure.message, String(Math.min(1800, 30 * (2 ** Math.max(0, Number(job.attempt) - 1))))],
    );
    if (!retry) {
      await pool.query(`UPDATE public.meta_ads_campaign_drafts SET status='draft',updated_at=NOW() WHERE id=$1 AND status='generating'`, [job.draft_id]);
      await addEvent({ companyId: String(job.company_id), draftId: String(job.draft_id), type: 'creative_generation_failed', payload: { jobId: job.id, code: failure.code } });
    }
  }
  return true;
}

function validateCampaignIdempotencyKey(value: string): void {
  if (value.length < 8) fail(400, 'invalid_idempotency_key');
}

async function findCampaignJobByIdempotency(
  companyId: string,
  idempotencyKey: string,
  client: PoolClient | typeof pool = pool,
): Promise<Record<string, unknown> | null> {
  const { rows } = await client.query(
    `SELECT * FROM public.meta_ads_campaign_jobs WHERE company_id=$1 AND idempotency_key=$2`,
    [companyId, idempotencyKey],
  );
  return rows[0] ?? null;
}

function assertMatchingIdempotentJob(
  row: Record<string, unknown>,
  draftId: string,
  kind: MetaAdsCampaignJobKind,
): void {
  if (String(row.draft_id) !== draftId || String(row.job_kind) !== kind) {
    fail(409, 'idempotency_key_conflict');
  }
}

async function insertCampaignJob(
  client: PoolClient,
  input: { companyId: string; userId: string; draftId: string; kind: MetaAdsCampaignJobKind; idempotencyKey: string },
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { rows } = await client.query(
    `INSERT INTO public.meta_ads_campaign_jobs
      (company_id,ad_account_id,draft_id,version,job_kind,snapshot_hash,idempotency_key,requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [input.companyId, row.ad_account_id, input.draftId, row.current_version, input.kind, row.snapshot_hash, input.idempotencyKey, input.userId],
  );
  return rows[0];
}

async function approveCampaignTransition(input: {
  companyId: string;
  userId: string;
  draftId: string;
  note?: string;
  idempotencyKey: string;
  approvalKind: 'publish' | 'launch';
  jobKind: 'publish_paused' | 'launch';
  expectedStatus: 'submitted' | 'published_paused';
  nextStatus: 'publish_approved' | 'launch_approved';
  preflightPhase: 'draft' | 'launch';
}): Promise<{ draft: MetaAdsCampaignDraft; job: MetaAdsCampaignJob }> {
  validateCampaignIdempotencyKey(input.idempotencyKey);
  const existing = await findCampaignJobByIdempotency(input.companyId, input.idempotencyKey);
  if (existing) {
    assertMatchingIdempotentJob(existing, input.draftId, input.jobKind);
    return {
      draft: await getMetaAdsCampaignDraft(input.companyId, input.draftId),
      job: (await campaignJobFromRow(existing))!,
    };
  }
  if (input.approvalKind === 'launch' && !env.META_AUTHORING_LAUNCH_ENABLED) fail(409, 'meta_launch_disabled');

  const initial = await draftRow(input.companyId, input.draftId);
  if (initial.status !== input.expectedStatus) fail(409, 'invalid_campaign_transition');
  const preflight = await preflightMetaAdsCampaign(input.companyId, input.draftId, input.preflightPhase);
  if (!preflight.ready || preflight.snapshotHash !== initial.snapshot_hash) fail(409, 'campaign_preflight_stale');
  const approverName = await actorName(input.userId);

  const client = await pool.connect();
  let jobRow: Record<string, unknown> | null = null;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM public.meta_ads_campaign_drafts WHERE id=$1 AND company_id=$2 FOR UPDATE`,
      [input.draftId, input.companyId],
    );
    const locked = rows[0] as Record<string, unknown> | undefined;
    if (!locked) fail(404, 'campaign_draft_not_found');

    const racedJob = await findCampaignJobByIdempotency(input.companyId, input.idempotencyKey, client);
    if (racedJob) {
      assertMatchingIdempotentJob(racedJob, input.draftId, input.jobKind);
      jobRow = racedJob;
      await client.query('COMMIT');
    } else {
      if (locked.status !== input.expectedStatus) fail(409, 'invalid_campaign_transition');
      if (locked.snapshot_hash !== initial.snapshot_hash || Number(locked.current_version) !== Number(initial.current_version)) {
        fail(409, 'campaign_preflight_stale');
      }
      await client.query(
        `INSERT INTO public.meta_ads_campaign_approvals
          (company_id,draft_id,version,approval_kind,snapshot_hash,approved_by,approver_name_snapshot,note,idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [input.companyId, input.draftId, locked.current_version, input.approvalKind, locked.snapshot_hash,
          input.userId, approverName, input.note?.trim() || null, input.idempotencyKey],
      );
      jobRow = await insertCampaignJob(client, {
        companyId: input.companyId,
        userId: input.userId,
        draftId: input.draftId,
        kind: input.jobKind,
        idempotencyKey: input.idempotencyKey,
      }, locked);
      const updated = await client.query(
        `UPDATE public.meta_ads_campaign_drafts SET status=$3,updated_at=NOW()
          WHERE id=$1 AND company_id=$2 AND status=$4`,
        [input.draftId, input.companyId, input.nextStatus, input.expectedStatus],
      );
      if (updated.rowCount !== 1) fail(409, 'invalid_campaign_transition');
      await addEvent({
        companyId: input.companyId,
        draftId: input.draftId,
        type: `${input.approvalKind}_approved`,
        userId: input.userId,
        actor: approverName,
        payload: { jobId: jobRow.id },
        idempotencyKey: `${input.idempotencyKey}:event`,
      }, client);
      await client.query('COMMIT');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    draft: await getMetaAdsCampaignDraft(input.companyId, input.draftId),
    job: (await campaignJobFromRow(jobRow!))!,
  };
}

export async function approveMetaAdsCampaignPublish(input: {
  companyId: string; userId: string; draftId: string; note?: string; idempotencyKey: string;
}): Promise<{ draft: MetaAdsCampaignDraft; job: MetaAdsCampaignJob }> {
  return approveCampaignTransition({
    ...input,
    approvalKind: 'publish',
    jobKind: 'publish_paused',
    expectedStatus: 'submitted',
    nextStatus: 'publish_approved',
    preflightPhase: 'draft',
  });
}

export async function approveMetaAdsCampaignLaunch(input: {
  companyId: string; userId: string; draftId: string; note?: string; idempotencyKey: string;
}): Promise<{ draft: MetaAdsCampaignDraft; job: MetaAdsCampaignJob }> {
  return approveCampaignTransition({
    ...input,
    approvalKind: 'launch',
    jobKind: 'launch',
    expectedStatus: 'published_paused',
    nextStatus: 'launch_approved',
    preflightPhase: 'launch',
  });
}

export async function pauseMetaAdsCampaign(input: { companyId: string; userId: string; draftId: string; idempotencyKey: string }): Promise<{ draft: MetaAdsCampaignDraft; job: MetaAdsCampaignJob | null }> {
  validateCampaignIdempotencyKey(input.idempotencyKey);
  const existing = await findCampaignJobByIdempotency(input.companyId, input.idempotencyKey);
  if (existing) {
    assertMatchingIdempotentJob(existing, input.draftId, 'pause');
    return { draft: await getMetaAdsCampaignDraft(input.companyId, input.draftId), job: (await campaignJobFromRow(existing))! };
  }
  const initial = await draftRow(input.companyId, input.draftId);
  if (initial.status === 'paused' || initial.status === 'published_paused') {
    return { draft: await getMetaAdsCampaignDraft(input.companyId, input.draftId), job: null };
  }
  if (!['launching','scheduled','active','pending_meta_review'].includes(String(initial.status))) fail(409, 'invalid_campaign_transition');
  const actor = await actorName(input.userId);
  const client = await pool.connect();
  let jobRow: Record<string, unknown> | null = null;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM public.meta_ads_campaign_drafts WHERE id=$1 AND company_id=$2 FOR UPDATE`,
      [input.draftId, input.companyId],
    );
    const locked = rows[0] as Record<string, unknown> | undefined;
    if (!locked) fail(404, 'campaign_draft_not_found');
    const racedJob = await findCampaignJobByIdempotency(input.companyId, input.idempotencyKey, client);
    if (racedJob) {
      assertMatchingIdempotentJob(racedJob, input.draftId, 'pause');
      jobRow = racedJob;
    } else {
      if (!['launching','scheduled','active','pending_meta_review'].includes(String(locked.status))) {
        fail(409, 'invalid_campaign_transition');
      }
      jobRow = await insertCampaignJob(client, { ...input, kind: 'pause' }, locked);
      await addEvent({
        companyId: input.companyId,
        draftId: input.draftId,
        type: 'pause_requested',
        userId: input.userId,
        actor,
        payload: { jobId: jobRow.id },
        idempotencyKey: `${input.idempotencyKey}:event`,
      }, client);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { draft: await getMetaAdsCampaignDraft(input.companyId, input.draftId), job: (await campaignJobFromRow(jobRow!))! };
}

export async function cancelMetaAdsCampaignDraft(input: { companyId: string; userId: string; draftId: string; reason: string; note?: string; idempotencyKey: string }): Promise<MetaAdsCampaignDraft> {
  validateCampaignIdempotencyKey(input.idempotencyKey);
  const replay = await pool.query(
    `SELECT draft_id,event_type FROM public.meta_ads_campaign_events WHERE company_id=$1 AND idempotency_key=$2`,
    [input.companyId, input.idempotencyKey],
  );
  if (replay.rows[0]) {
    if (String(replay.rows[0].draft_id) !== input.draftId || replay.rows[0].event_type !== 'cancelled') fail(409, 'idempotency_key_conflict');
    return getMetaAdsCampaignDraft(input.companyId, input.draftId);
  }
  const actor = await actorName(input.userId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT status FROM public.meta_ads_campaign_drafts WHERE id=$1 AND company_id=$2 FOR UPDATE`,
      [input.draftId, input.companyId],
    );
    if (!rows[0]) fail(404, 'campaign_draft_not_found');
    if (['generating','publishing','launching'].includes(String(rows[0].status))) fail(409, 'campaign_job_in_progress');
    if (['active','scheduled','pending_meta_review'].includes(String(rows[0].status))) fail(409, 'pause_campaign_before_cancel');
    if (rows[0].status !== 'cancelled') {
      await client.query(
        `UPDATE public.meta_ads_campaign_drafts SET status='cancelled',updated_at=NOW() WHERE id=$1 AND company_id=$2`,
        [input.draftId, input.companyId],
      );
      await client.query(
        `UPDATE public.meta_ads_campaign_jobs SET status='failed',error_code='cancelled',error_message='Cancelled before execution',completed_at=NOW()
          WHERE draft_id=$1 AND status='pending'`,
        [input.draftId],
      );
    }
    const inserted = await addEvent({
      companyId: input.companyId,
      draftId: input.draftId,
      type: 'cancelled',
      userId: input.userId,
      actor,
      payload: { reason: input.reason, note: input.note?.trim() || null },
      idempotencyKey: input.idempotencyKey,
    }, client);
    if (!inserted) {
      const existing = await client.query(
        `SELECT draft_id,event_type FROM public.meta_ads_campaign_events WHERE company_id=$1 AND idempotency_key=$2`,
        [input.companyId, input.idempotencyKey],
      );
      if (String(existing.rows[0]?.draft_id) !== input.draftId || existing.rows[0]?.event_type !== 'cancelled') fail(409, 'idempotency_key_conflict');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getMetaAdsCampaignDraft(input.companyId, input.draftId);
}

export async function cloneMetaAdsCampaignDraft(input: { companyId: string; userId: string; draftId: string }): Promise<MetaAdsCampaignDraft> {
  const source = await draftRow(input.companyId, input.draftId);
  const connection = await connectionContext(input.companyId);
  if (!connection) fail(409, 'meta_not_connected');
  // A clone keeps its lead-form spec verbatim, so it hashes equal and publishes against the same
  // Meta form rather than minting a duplicate. That is safe because attribution resolves through
  // `ad_id` (unique per clone), not through the shared form id.
  const sourceContent = draftContent(source.content);
  const content = { ...sourceContent, name: `${sourceContent.name} (copy)` };
  const hash = metaAdsDraftSnapshotHash(content);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO public.meta_ads_campaign_drafts
        (company_id,ad_account_id,status,current_version,content,snapshot_hash,created_by,updated_by)
       VALUES ($1,$2,'draft',1,$3::jsonb,$4,$5,$5) RETURNING *`,
      [input.companyId, connection.accountId, JSON.stringify(content), hash, input.userId],
    );
    await client.query(`INSERT INTO public.meta_ads_campaign_draft_versions
      (draft_id,company_id,version,content,snapshot_hash,reason,created_by) VALUES ($1,$2,1,$3::jsonb,$4,'cloned',$5)`,
      [rows[0].id, input.companyId, JSON.stringify(content), hash, input.userId]);
    await addEvent({ companyId: input.companyId, draftId: String(rows[0].id), type: 'cloned', userId: input.userId, payload: { sourceDraftId: input.draftId } }, client);
    await client.query('COMMIT');
    return shapeDraft(rows[0], true);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function getMetaAdsCampaignJob(companyId: string, jobId: string): Promise<MetaAdsCampaignJob> {
  const { rows } = await pool.query(`SELECT * FROM public.meta_ads_campaign_jobs WHERE id=$1 AND company_id=$2`, [jobId, companyId]);
  if (!rows[0]) fail(404, 'campaign_job_not_found');
  return (await campaignJobFromRow(rows[0]))!;
}

async function executeStep(input: {
  job: Record<string, unknown>; key: string; kind: 'image' | 'campaign' | 'adset' | 'creative' | 'ad' | 'status' | 'leadform' | 'crmsync'; fingerprint: string;
  run: () => Promise<{ id: string; summary?: Record<string, unknown> }>;
}): Promise<{ id: string; summary: Record<string, unknown> }> {
  const existing = await pool.query(`SELECT * FROM public.meta_ads_campaign_job_steps WHERE job_id=$1 AND step_key=$2`, [input.job.id, input.key]);
  if (existing.rows[0]?.status === 'complete') {
    if (String(existing.rows[0].request_fingerprint) !== input.fingerprint) fail(409, 'campaign_step_fingerprint_drift');
    return { id: String(existing.rows[0].meta_object_id), summary: (existing.rows[0].response_summary ?? {}) as Record<string, unknown> };
  }
  if (existing.rows[0] && String(existing.rows[0].request_fingerprint) !== input.fingerprint) {
    fail(409, 'campaign_step_fingerprint_drift');
  }
  await pool.query(
    `INSERT INTO public.meta_ads_campaign_job_steps
      (company_id,job_id,step_key,object_kind,status,request_fingerprint,attempt,started_at)
     VALUES ($1,$2,$3,$4,'running',$5,1,NOW())
     ON CONFLICT (job_id,step_key) DO UPDATE SET status='running',attempt=public.meta_ads_campaign_job_steps.attempt+1,
       error_code=NULL,error_message=NULL,started_at=COALESCE(public.meta_ads_campaign_job_steps.started_at,NOW())`,
    [input.job.company_id, input.job.id, input.key, input.kind, input.fingerprint],
  );
  try {
    const result = await input.run();
    await pool.query(
      `UPDATE public.meta_ads_campaign_job_steps SET status='complete',meta_object_id=$3,response_summary=$4::jsonb,completed_at=NOW(),error_code=NULL,error_message=NULL
        WHERE job_id=$1 AND step_key=$2`,
      [input.job.id, input.key, result.id, JSON.stringify(result.summary ?? {})],
    );
    return { id: result.id, summary: result.summary ?? {} };
  } catch (error) {
    const code = error instanceof MetaAuthoringApiError ? error.code : error instanceof Error ? error.message.slice(0, 120) : 'campaign_step_failed';
    await pool.query(`UPDATE public.meta_ads_campaign_job_steps SET status='failed',error_code=$3,error_message=$4 WHERE job_id=$1 AND step_key=$2`,
      [input.job.id, input.key, code, code]);
    throw error;
  }
}

async function mapping(input: { job: Record<string, unknown>; kind: 'image' | 'campaign' | 'adset' | 'creative' | 'ad' | 'leadform'; localKey: string; metaId: string; status?: string }): Promise<void> {
  await pool.query(
    `INSERT INTO public.meta_ads_entity_mappings
      (company_id,ad_account_id,draft_id,version,object_kind,local_key,meta_object_id,meta_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (draft_id,version,object_kind,local_key) DO UPDATE SET meta_object_id=EXCLUDED.meta_object_id,meta_status=EXCLUDED.meta_status,updated_at=NOW()`,
    [input.job.company_id, input.job.ad_account_id, input.job.draft_id, input.job.version, input.kind, input.localKey, input.metaId, input.status ?? null],
  );
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

async function loadJobDraft(job: Record<string, unknown>): Promise<{ row: Record<string, unknown>; content: MetaAdsCampaignDraftContent; connection: ConnectionContext }> {
  const row = await draftRow(String(job.company_id), String(job.draft_id));
  if (Number(row.current_version) !== Number(job.version) || String(row.snapshot_hash) !== String(job.snapshot_hash)) fail(409, 'campaign_job_snapshot_drift');
  const connection = await connectionContext(String(job.company_id));
  if (!connection || connection.accountId !== String(job.ad_account_id)) fail(409, 'meta_account_changed');
  return { row, content: draftContent(row.content), connection };
}

async function createdObject(job: Record<string, unknown>, kind: string, localKey: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT meta_object_id FROM public.meta_ads_entity_mappings WHERE draft_id=$1 AND version=$2 AND object_kind=$3 AND local_key=$4`,
    [job.draft_id, job.version, kind, localKey]);
  return rows[0]?.meta_object_id ? String(rows[0].meta_object_id) : null;
}

async function publishPaused(job: Record<string, unknown>): Promise<void> {
  const { content, connection } = await loadJobDraft(job);
  const approval = await pool.query(`SELECT id FROM public.meta_ads_campaign_approvals WHERE draft_id=$1 AND version=$2 AND approval_kind='publish' AND snapshot_hash=$3`, [job.draft_id, job.version, job.snapshot_hash]);
  if (!approval.rowCount) fail(409, 'publish_approval_missing');
  const preflight = await preflightMetaAdsCampaign(String(job.company_id), String(job.draft_id));
  if (!preflight.ready || preflight.snapshotHash !== String(job.snapshot_hash)) fail(409, 'campaign_preflight_stale');
  const imageHashes = new Map<string, string>();
  for (const ad of content.ads) {
    const asset = await downloadMetaCreativeAsset(String(job.company_id), ad.assetId);
    const step = await executeStep({
      job, key: `image:${ad.id}`, kind: 'image', fingerprint: fingerprint({ assetId: ad.assetId, bytes: createHash('sha256').update(asset.bytes).digest('hex') }),
      run: async () => {
        const result = await uploadMetaAdImage({ accessToken: connection.accessToken, adAccountId: connection.accountId, ...asset });
        return { id: result.hash };
      },
    });
    imageHashes.set(ad.id, step.id);
    await mapping({ job, kind: 'image', localKey: ad.id, metaId: step.id });
  }
  const isLeadForm = content.destination === 'lead_form' && content.leadForm !== null;
  const leadForm = content.leadForm;
  // Only fetched for lead-form publishes, and never surfaced through readiness — a Page token
  // must not reach the browser.
  const pageAccessToken = isLeadForm
    ? await getMetaPageAccessToken(connection.accessToken, content.identity!.pageId)
    : '';

  let leadFormId = '';
  if (isLeadForm && leadForm) {
    const leadFormName = workosMetaLeadFormName(leadForm.questionSetHash);
    const leadFormStep = await executeStep({
      job, key: 'leadform', kind: 'leadform', fingerprint: fingerprint({ leadFormName, pageId: content.identity!.pageId }),
      run: async () => {
        const found = await findMetaLeadFormByName({ pageAccessToken, pageId: content.identity!.pageId, name: leadFormName });
        return found ?? createMetaLeadForm({
          pageAccessToken, pageId: content.identity!.pageId, name: leadFormName,
          questions: leadForm.questions.map((question) => ({ type: question.type, key: question.key, label: question.label })),
          privacyPolicyUrl: leadForm.privacyPolicyUrl, followUpUrl: leadForm.followUpUrl,
          contextHeadline: leadForm.contextHeadline, contextDescription: leadForm.contextDescription,
        });
      },
    });
    leadFormId = leadFormStep.id;
    await mapping({ job, kind: 'leadform', localKey: leadForm.questionSetHash, metaId: leadFormId });
  }

  const campaignName = workosMetaObjectName(String(job.draft_id), Number(job.version), content.name);
  const objective = isLeadForm ? 'OUTCOME_LEADS' : 'OUTCOME_TRAFFIC';
  const campaign = await executeStep({
    job, key: 'campaign', kind: 'campaign', fingerprint: fingerprint({ campaignName, objective }),
    run: async () => {
      const found = await findMetaObjectByName({ accessToken: connection.accessToken, adAccountId: connection.accountId, edge: 'campaigns', name: campaignName });
      if (found) return { id: found.id };
      return isLeadForm
        ? createMetaLeadCampaign({ accessToken: connection.accessToken, adAccountId: connection.accountId, name: campaignName })
        : createMetaTrafficCampaign({ accessToken: connection.accessToken, adAccountId: connection.accountId, name: campaignName });
    },
  });
  await mapping({ job, kind: 'campaign', localKey: 'campaign', metaId: campaign.id, status: 'PAUSED' });
  const adsetName = workosMetaObjectName(String(job.draft_id), Number(job.version), `${content.name} · Broad`);
  const adsetPayload = {
    accessToken: connection.accessToken, adAccountId: connection.accountId, name: adsetName, campaignId: campaign.id,
    lifetimeBudgetMinor: content.lifetimeBudgetMinor, startTime: content.startTime, endTime: content.endTime,
    countries: content.audience.countries, ageMin: content.audience.ageMin, ageMax: content.audience.ageMax,
    languageIds: content.audience.languageIds, dsaBeneficiary: content.dsaBeneficiary || undefined, dsaPayor: content.dsaPayor || undefined,
  };
  const adset = await executeStep({
    job, key: 'adset', kind: 'adset', fingerprint: fingerprint({ ...adsetPayload, accessToken: undefined, objective }),
    run: async () => {
      const found = await findMetaObjectByName({ accessToken: connection.accessToken, adAccountId: connection.accountId, edge: 'adsets', name: adsetName });
      if (found) return { id: found.id };
      return isLeadForm
        ? createMetaLeadAdSet({ ...adsetPayload, pageId: content.identity!.pageId })
        : createMetaTrafficAdSet(adsetPayload);
    },
  });
  await mapping({ job, kind: 'adset', localKey: 'adset', metaId: adset.id, status: 'PAUSED' });
  for (const ad of content.ads) {
    const creativeName = workosMetaObjectName(String(job.draft_id), Number(job.version), `${content.name} · ${ad.name} creative`);
    const creativePayload = {
      accessToken: connection.accessToken, adAccountId: connection.accountId, name: creativeName,
      pageId: content.identity!.pageId, instagramActorId: content.identity!.instagramActorId,
      imageHash: imageHashes.get(ad.id)!, link: content.brief.landingPageUrl, primaryText: ad.primaryText,
      headline: ad.headline, description: ad.description, callToAction: ad.callToAction,
    };
    const creative = await executeStep({
      job, key: `creative:${ad.id}`, kind: 'creative', fingerprint: fingerprint({ ...creativePayload, accessToken: undefined, leadFormId }),
      run: async () => {
        const found = await findMetaObjectByName({ accessToken: connection.accessToken, adAccountId: connection.accountId, edge: 'adcreatives', name: creativeName });
        if (found) return { id: found.id };
        return isLeadForm
          ? createMetaLeadFormCreative({ ...creativePayload, leadFormId })
          : createMetaSingleImageCreative(creativePayload);
      },
    });
    await mapping({ job, kind: 'creative', localKey: ad.id, metaId: creative.id });
    const adName = workosMetaObjectName(String(job.draft_id), Number(job.version), `${content.name} · ${ad.name}`);
    const createdAd = await executeStep({
      job, key: `ad:${ad.id}`, kind: 'ad', fingerprint: fingerprint({ adName, adsetId: adset.id, creativeId: creative.id }),
      run: async () => {
        const found = await findMetaObjectByName({ accessToken: connection.accessToken, adAccountId: connection.accountId, edge: 'ads', name: adName });
        return found ? { id: found.id } : createMetaPausedAd({ accessToken: connection.accessToken, adAccountId: connection.accountId, name: adName, adsetId: adset.id, creativeId: creative.id });
      },
    });
    await mapping({ job, kind: 'ad', localKey: ad.id, metaId: createdAd.id, status: 'PAUSED' });
  }
  if (isLeadForm && leadForm && leadFormId) {
    // Deliberately non-fatal. The Meta side is already published at this point, and Meta keeps
    // collecting submissions regardless — Frappe's first sync backfills them because
    // `last_synced_at` starts null. Failing the job here would leave a live campaign behind a
    // "failed" publish; instead the step row records the failure and an event surfaces it.
    try {
      await executeStep({
        job, key: 'crmsync', kind: 'crmsync', fingerprint: fingerprint({ leadFormId, hash: leadForm.questionSetHash }),
        run: async () => {
          const result = await configureTenantLeadSync(String(job.company_id), {
            environment: provisionEnv,
            // Keyed on the form, not the draft: drafts sharing a question set share a form, and
            // the mapping they imply is identical, so configuring once is enough.
            idempotencyKey: `configure_lead_sync:${leadFormId}`,
            sourceName: `WorkOS · ${leadForm.questionSetHash.slice(0, 12)}`,
            discoveryAccessToken: connection.accessToken,
            syncAccessToken: pageAccessToken,
            backgroundSyncFrequency: 'Hourly',
            facebookPageId: content.identity!.pageId,
            facebookLeadFormId: leadFormId,
            questionMappings: leadForm.questions
              .filter((question): question is typeof question & { crmField: string } => Boolean(question.crmField))
              .map((question) => ({ key: question.key, mappedToCrmField: question.crmField })),
          });
          return { id: result.sourceName };
        },
      });
    } catch (error) {
      await addEvent({
        companyId: String(job.company_id), draftId: String(job.draft_id), type: 'lead_sync_configuration_failed',
        userId: job.requested_by ? String(job.requested_by) : null,
        payload: { leadFormId, error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' },
      });
    }
  }
  const states = await Promise.all([campaign.id, adset.id, ...content.ads.map((ad) => createdObject(job, 'ad', ad.id))]
    .filter((value): value is string => Boolean(value)).map((id) => getMetaObjectState(connection.accessToken, id)));
  if (states.some((state) => state.status && state.status !== 'PAUSED')) fail(409, 'meta_object_not_paused');
  await pool.query(`UPDATE public.meta_ads_campaign_drafts SET status='published_paused',updated_at=NOW() WHERE id=$1`, [job.draft_id]);
  await addEvent({ companyId: String(job.company_id), draftId: String(job.draft_id), type: 'published_paused', userId: job.requested_by ? String(job.requested_by) : null, payload: { campaignId: campaign.id, adsetId: adset.id, adCount: content.ads.length } });
}

async function launchCampaign(job: Record<string, unknown>): Promise<void> {
  if (!env.META_AUTHORING_LAUNCH_ENABLED) fail(409, 'meta_launch_disabled');
  const { content, connection } = await loadJobDraft(job);
  const approval = await pool.query(`SELECT id FROM public.meta_ads_campaign_approvals WHERE draft_id=$1 AND version=$2 AND approval_kind='launch' AND snapshot_hash=$3`, [job.draft_id, job.version, job.snapshot_hash]);
  if (!approval.rowCount) fail(409, 'launch_approval_missing');
  const preflight = await preflightMetaAdsCampaign(String(job.company_id), String(job.draft_id), 'launch');
  if (!preflight.ready || preflight.snapshotHash !== String(job.snapshot_hash)) fail(409, 'campaign_preflight_stale');
  const campaignId = await createdObject(job, 'campaign', 'campaign');
  const adsetId = await createdObject(job, 'adset', 'adset');
  const ads = (await Promise.all(content.ads.map(async (ad) => ({ localKey: ad.id, id: await createdObject(job, 'ad', ad.id) }))));
  if (!campaignId || !adsetId || ads.some((ad) => !ad.id)) fail(409, 'published_meta_objects_missing');
  const states = await Promise.all([campaignId, adsetId, ...ads.map((ad) => ad.id!)] .map((id) => getMetaObjectState(connection.accessToken, id)));
  if (states.some((state) => state.status !== 'PAUSED')) fail(409, 'meta_state_drift');
  for (const ad of ads) await executeStep({ job, key: `activate:ad:${ad.localKey}`, kind: 'status', fingerprint: fingerprint({ id: ad.id, status: 'ACTIVE' }), run: async () => { await updateMetaObjectStatus(connection.accessToken, ad.id!, 'ACTIVE'); return { id: ad.id! }; } });
  await executeStep({ job, key: 'activate:adset', kind: 'status', fingerprint: fingerprint({ id: adsetId, status: 'ACTIVE' }), run: async () => { await updateMetaObjectStatus(connection.accessToken, adsetId, 'ACTIVE'); return { id: adsetId }; } });
  await executeStep({ job, key: 'activate:campaign', kind: 'status', fingerprint: fingerprint({ id: campaignId, status: 'ACTIVE' }), run: async () => { await updateMetaObjectStatus(connection.accessToken, campaignId, 'ACTIVE'); return { id: campaignId }; } });
  const state = await getMetaObjectState(connection.accessToken, campaignId);
  const future = new Date(content.startTime).getTime() > Date.now();
  const status = future ? 'scheduled' : state.effectiveStatus === 'ACTIVE' ? 'active' : 'pending_meta_review';
  await pool.query(`UPDATE public.meta_ads_campaign_drafts SET status=$2,updated_at=NOW() WHERE id=$1`, [job.draft_id, status]);
  await pool.query(`UPDATE public.meta_ads_entity_mappings SET meta_status='ACTIVE',updated_at=NOW() WHERE draft_id=$1 AND version=$2 AND object_kind IN ('campaign','adset','ad')`, [job.draft_id, job.version]);
  await addEvent({ companyId: String(job.company_id), draftId: String(job.draft_id), type: status, userId: job.requested_by ? String(job.requested_by) : null, payload: { campaignId, effectiveStatus: state.effectiveStatus } });
}

async function pauseCampaign(job: Record<string, unknown>): Promise<void> {
  const { content, connection } = await loadJobDraft(job);
  const campaignId = await createdObject(job, 'campaign', 'campaign');
  const adsetId = await createdObject(job, 'adset', 'adset');
  const ads = (await Promise.all(content.ads.map((ad) => createdObject(job, 'ad', ad.id)))).filter((id): id is string => Boolean(id));
  if (!campaignId) fail(409, 'published_meta_objects_missing');
  await executeStep({ job, key: 'pause:campaign', kind: 'status', fingerprint: fingerprint({ id: campaignId, status: 'PAUSED' }), run: async () => { await updateMetaObjectStatus(connection.accessToken, campaignId, 'PAUSED'); return { id: campaignId }; } });
  if (adsetId) await executeStep({ job, key: 'pause:adset', kind: 'status', fingerprint: fingerprint({ id: adsetId, status: 'PAUSED' }), run: async () => { await updateMetaObjectStatus(connection.accessToken, adsetId, 'PAUSED'); return { id: adsetId }; } });
  for (const id of ads) await executeStep({ job, key: `pause:ad:${id}`, kind: 'status', fingerprint: fingerprint({ id, status: 'PAUSED' }), run: async () => { await updateMetaObjectStatus(connection.accessToken, id, 'PAUSED'); return { id }; } });
  await pool.query(`UPDATE public.meta_ads_campaign_drafts SET status='paused',updated_at=NOW() WHERE id=$1`, [job.draft_id]);
  await pool.query(`UPDATE public.meta_ads_entity_mappings SET meta_status='PAUSED',updated_at=NOW() WHERE draft_id=$1 AND version=$2 AND object_kind IN ('campaign','adset','ad')`, [job.draft_id, job.version]);
  await addEvent({ companyId: String(job.company_id), draftId: String(job.draft_id), type: 'paused', userId: job.requested_by ? String(job.requested_by) : null, payload: { campaignId } });
}

export async function claimOneMetaAdsCampaignJob(companyId?: string): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(
    `UPDATE public.meta_ads_campaign_jobs SET status='running',attempt=attempt+1,started_at=COALESCE(started_at,NOW()),
       locked_at=NOW(),locked_until=NOW()+INTERVAL '10 minutes',locked_by=$1,error_code=NULL,error_message=NULL
     WHERE id=(SELECT candidate.id FROM public.meta_ads_campaign_jobs candidate
       WHERE candidate.available_at<=NOW() AND (candidate.status='pending' OR (candidate.status='running' AND candidate.locked_until<NOW()))
         AND ($2::uuid IS NULL OR candidate.company_id=$2)
         AND NOT EXISTS (
           SELECT 1 FROM public.meta_ads_campaign_jobs active
            WHERE active.draft_id=candidate.draft_id AND active.id<>candidate.id
              AND active.status='running' AND active.locked_until>=NOW()
         )
       ORDER BY candidate.requested_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
    [env.WORKER_ID, companyId ?? null],
  );
  return rows[0] ?? null;
}

async function emergencyPausePublishedObjects(job: Record<string, unknown>): Promise<void> {
  try {
    const connection = await connectionContext(String(job.company_id));
    if (!connection) return;
    const { rows } = await pool.query(
      `SELECT object_kind,meta_object_id FROM public.meta_ads_entity_mappings
        WHERE draft_id=$1 AND version=$2 AND object_kind IN ('campaign','adset','ad')`,
      [job.draft_id, job.version],
    );
    const campaignId = rows.find((row) => row.object_kind === 'campaign')?.meta_object_id;
    // Stop possible delivery at the parent first. Then restore every known
    // child to PAUSED so a retry can pass the launch drift check instead of
    // getting stuck on a partially activated ad.
    if (campaignId) await updateMetaObjectStatus(connection.accessToken, String(campaignId), 'PAUSED');
    for (const row of rows.filter((value) => value.object_kind !== 'campaign')) {
      try { await updateMetaObjectStatus(connection.accessToken, String(row.meta_object_id), 'PAUSED'); }
      catch (childError) {
        console.error('[meta-ads-authoring] failed to pause child after job failure', {
          jobId: job.id,
          objectKind: row.object_kind,
          error: childError instanceof Error ? childError.message : String(childError),
        });
      }
    }
    await pool.query(
      `UPDATE public.meta_ads_entity_mappings SET meta_status='PAUSED',updated_at=NOW()
        WHERE draft_id=$1 AND version=$2 AND object_kind IN ('campaign','adset','ad')`,
      [job.draft_id, job.version],
    );
  } catch (pauseError) {
    console.error('[meta-ads-authoring] failed to preserve paused parent', { jobId: job.id, error: pauseError instanceof Error ? pauseError.message : String(pauseError) });
  }
}

export async function processOneMetaAdsCampaignJob(companyId?: string): Promise<boolean> {
  const job = await claimOneMetaAdsCampaignJob(companyId);
  if (!job) return false;
  try {
    if (job.job_kind === 'publish_paused') {
      const transition = await pool.query(`UPDATE public.meta_ads_campaign_drafts SET status='publishing',updated_at=NOW() WHERE id=$1 AND status IN ('publish_approved','publishing')`, [job.draft_id]);
      if (transition.rowCount !== 1) fail(409, 'campaign_job_stale_state');
      await publishPaused(job);
    } else if (job.job_kind === 'launch') {
      const transition = await pool.query(`UPDATE public.meta_ads_campaign_drafts SET status='launching',updated_at=NOW() WHERE id=$1 AND status IN ('launch_approved','launching')`, [job.draft_id]);
      if (transition.rowCount !== 1) fail(409, 'campaign_job_stale_state');
      await launchCampaign(job);
    } else {
      await pauseCampaign(job);
    }
    await pool.query(`UPDATE public.meta_ads_campaign_jobs SET status='complete',completed_at=NOW(),locked_at=NULL,locked_until=NULL,locked_by=NULL,error_code=NULL,error_message=NULL WHERE id=$1`, [job.id]);
  } catch (error) {
    if (job.job_kind === 'publish_paused' || job.job_kind === 'launch') await emergencyPausePublishedObjects(job);
    const failure = normalizedAuthoringFailure(error, 'meta_campaign_job_failed');
    const retry = failure.retryable && Number(job.attempt) < Number(job.max_attempts);
    await pool.query(
      `UPDATE public.meta_ads_campaign_jobs SET status=$2,error_code=$3,error_message=$4,
       available_at=CASE WHEN $2='pending' THEN NOW()+($5 || ' seconds')::interval ELSE available_at END,
       completed_at=CASE WHEN $2='failed' THEN NOW() ELSE NULL END,locked_at=NULL,locked_until=NULL,locked_by=NULL WHERE id=$1`,
      [job.id, retry ? 'pending' : 'failed', failure.code, failure.message, String(Math.min(3600, 30 * (2 ** Math.max(0, Number(job.attempt) - 1))))],
    );
    if (!retry) {
      await pool.query(`UPDATE public.meta_ads_campaign_drafts SET status='failed',updated_at=NOW() WHERE id=$1 AND status<>'cancelled'`, [job.draft_id]);
      await addEvent({ companyId: String(job.company_id), draftId: String(job.draft_id), type: 'campaign_job_failed', payload: { jobId: job.id, kind: job.job_kind, code: failure.code } });
    }
  }
  return true;
}
