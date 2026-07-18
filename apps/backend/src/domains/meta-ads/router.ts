import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authJwt } from '../../middleware/authJwt.js';
import { requirePermission } from '../../rbac.js';
import {
  applyMetaAdsExperiment,
  buildMetaAdsDecisionInbox,
  cancelMetaAdsExperiment,
  dismissMetaAdsFinding,
  getMetaAdsExperiment,
  listMetaAdsAssignees,
  listMetaAdsExperiments,
  MetaAdsWorkflowError,
  startMetaAdsExperiment,
  updateMetaAdsExperiment,
} from './decisionInbox.js';
import { buildMetaAdsAttention, buildMetaAdsBrief, enqueueMetaAdsSync, getMetaAdsSyncRun } from './service.js';
import {
  approveMetaAdsCampaignLaunch,
  approveMetaAdsCampaignPublish,
  cancelMetaAdsCampaignDraft,
  cloneMetaAdsCampaignDraft,
  createMetaAdsCampaignDraft,
  deleteMetaAdsCreativeAsset,
  enqueueMetaAdsCreativeGeneration,
  getMetaAdsAuthoringReadiness,
  getMetaAdsBrandKit,
  getMetaAdsCampaignDraft,
  getMetaAdsCampaignJob,
  getMetaAdsCreativeGenerationJob,
  listMetaAdsCampaignDrafts,
  listMetaAdsCreativeAssets,
  MetaAdsAuthoringError,
  patchMetaAdsCampaignDraft,
  pauseMetaAdsCampaign,
  preflightMetaAdsCampaign,
  putMetaAdsBrandKit,
  resolveMetaAdsErpProduct,
  submitMetaAdsCampaignDraft,
  uploadMetaAdsCreativeAsset,
} from './authoring.js';

export const metaAdsOperatingRouter = express.Router();
const REQUIRE_TWIN_READ = requirePermission('twin', 'read');
const REQUIRE_ANALYTICS_WRITE = requirePermission('analytics', 'write');
const REQUIRE_PAID_MEDIA_READ = requirePermission('paid_media', 'read');
const REQUIRE_PAID_MEDIA_WRITE = requirePermission('paid_media', 'write');
const REQUIRE_PAID_MEDIA_APPROVE = requirePermission('paid_media', 'approve');
const REQUIRE_PAID_MEDIA_EXECUTE = requirePermission('paid_media', 'execute');

const creativeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return callback(new Error('unsupported_creative_type'));
    return callback(null, true);
  },
});
const handleCreativeUpload: express.RequestHandler = (req, res, next) => {
  creativeUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'creative_file_too_large' });
      return;
    }
    res.status(400).json({ error: error instanceof Error && error.message === 'unsupported_creative_type' ? error.message : 'invalid_creative_upload' });
  });
};

const ctaSchema = z.enum(['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'CONTACT_US', 'GET_QUOTE']);
const pageIdentitySchema = z.object({
  pageId: z.string().min(1), pageName: z.string().min(1),
  instagramActorId: z.string().nullable(), instagramUsername: z.string().nullable(),
});
const briefSchema = z.object({
  goal: z.string().max(500), offer: z.string().max(1_000), proofPoints: z.array(z.string().max(500)).max(10),
  targetCustomer: z.string().max(1_000), landingPageUrl: z.string().max(2_000), callToAction: ctaSchema,
  regulatedCategory: z.enum(['none','credit','employment','housing','politics','alcohol','gambling','tobacco','healthcare','financial_products','crypto','adult','weapons']),
});
const audienceSchema = z.object({
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(25),
  ageMin: z.number().int().min(18).max(65), ageMax: z.number().int().min(18).max(65),
  languageIds: z.array(z.number().int().positive()).max(50),
});
const productSchema = z.object({
  itemCode: z.string(), itemName: z.string(), disabled: z.boolean(), currency: z.string().nullable(),
  price: z.number().nullable(), stockQuantity: z.number().nullable(), source: z.literal('erpnext'), confirmedAt: z.string(),
});
const conceptSchema = z.object({
  id: z.string().uuid(), name: z.string(), rationale: z.string(), primaryText: z.string(), headline: z.string(), description: z.string(),
  callToAction: ctaSchema,
  assetIds: z.object({ '1:1': z.string().uuid().optional(), '4:5': z.string().uuid().optional(), '9:16': z.string().uuid().optional() }),
});
const adSchema = z.object({
  id: z.string().uuid(), conceptId: z.string().uuid().nullable(), assetId: z.string().uuid(), name: z.string().min(1).max(200),
  primaryText: z.string().max(500), headline: z.string().max(100), description: z.string().max(150), callToAction: ctaSchema,
});
const draftPatchSchema = z.object({
  expectedVersion: z.number().int().positive(),
  patch: z.object({
    name: z.string().max(200).optional(), brief: briefSchema.partial().optional(), identity: pageIdentitySchema.nullable().optional(),
    audience: audienceSchema.partial().optional(), lifetimeBudgetMinor: z.number().int().nonnegative().optional(),
    startTime: z.string().optional(), endTime: z.string().optional(), specialAdCategories: z.array(z.string()).max(0).optional(),
    dsaBeneficiary: z.string().max(500).optional(), dsaPayor: z.string().max(500).optional(),
    productContext: productSchema.nullable().optional(), concepts: z.array(conceptSchema).max(20).optional(), ads: z.array(adSchema).max(3).optional(),
  }).strict(),
}).strict();
const brandKitSchema = z.object({
  businessName: z.string().max(200), brandVoice: z.string().max(2_000), valueProposition: z.string().max(2_000),
  targetAudience: z.string().max(2_000), primaryColor: z.string().max(20).nullable(), secondaryColor: z.string().max(20).nullable(),
  logoAssetId: z.string().uuid().nullable(), requiredPhrases: z.array(z.string().max(200)).max(20), prohibitedPhrases: z.array(z.string().max(200)).max(20),
}).strict();

const startExperimentSchema = z.object({
  ownerMemberId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().min(8).optional(),
});
const dismissSchema = z.object({
  reason: z.enum(['not_relevant', 'already_addressed', 'insufficient_context', 'other']),
  note: z.string().max(1_000).optional(),
  idempotencyKey: z.string().min(8).optional(),
});
const updateExperimentSchema = z.object({
  ownerMemberId: z.string().uuid().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  idempotencyKey: z.string().min(8).optional(),
}).refine((value) => Boolean(value.ownerMemberId || value.dueDate), { message: 'empty_patch' });
const applyExperimentSchema = z.object({
  implementationNote: z.string().min(3).max(2_000),
  confirmedRecommendedChange: z.boolean(),
  keptBudgetConstant: z.boolean(),
  idempotencyKey: z.string().min(8).optional(),
});
const cancelExperimentSchema = z.object({
  reason: z.enum(['not_applied', 'recommendation_stale', 'priorities_changed', 'other']),
  note: z.string().max(1_000).optional(),
  idempotencyKey: z.string().min(8).optional(),
});

function idempotencyKey(req: express.Request, bodyKey?: string): string {
  return req.get('Idempotency-Key')?.trim() || bodyKey || '';
}

function workflowError(res: express.Response, error: unknown, fallback: string) {
  if (error instanceof MetaAdsWorkflowError) return res.status(error.status).json({ error: error.message });
  console.error(`[meta-ads] ${fallback}`, error);
  return res.status(500).json({ error: fallback });
}

function authoringError(res: express.Response, error: unknown, fallback: string) {
  if (error instanceof MetaAdsAuthoringError) return res.status(error.status).json({ error: error.message });
  console.error(`[meta-ads-authoring] ${fallback}`, error);
  return res.status(500).json({ error: fallback });
}

metaAdsOperatingRouter.get('/authoring/readiness', authJwt, REQUIRE_PAID_MEDIA_READ, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try { return res.json(await getMetaAdsAuthoringReadiness(companyId)); }
  catch (error) { return authoringError(res, error, 'meta_authoring_readiness_unavailable'); }
});

metaAdsOperatingRouter.get('/brand-kit', authJwt, REQUIRE_PAID_MEDIA_READ, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try { return res.json(await getMetaAdsBrandKit(companyId)); }
  catch (error) { return authoringError(res, error, 'meta_brand_kit_unavailable'); }
});

metaAdsOperatingRouter.put('/brand-kit', authJwt, REQUIRE_PAID_MEDIA_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId; const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = brandKitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_brand_kit', details: parsed.error.flatten() });
  try { return res.json(await putMetaAdsBrandKit(companyId, userId, parsed.data)); }
  catch (error) { return authoringError(res, error, 'meta_brand_kit_update_failed'); }
});

metaAdsOperatingRouter.get('/creative-assets', authJwt, REQUIRE_PAID_MEDIA_READ, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try { return res.json(await listMetaAdsCreativeAssets(companyId)); }
  catch (error) { return authoringError(res, error, 'meta_creative_assets_unavailable'); }
});

metaAdsOperatingRouter.post('/creative-assets', authJwt, REQUIRE_PAID_MEDIA_WRITE, handleCreativeUpload, async (req, res) => {
  const companyId = req.auth?.companyId; const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  if (!req.file) return res.status(400).json({ error: 'creative_file_required' });
  try {
    return res.status(201).json(await uploadMetaAdsCreativeAsset({
      companyId, userId, bytes: req.file.buffer,
      mimeType: req.file.mimetype as 'image/jpeg' | 'image/png' | 'image/webp',
      fileName: req.file.originalname.replace(/[^a-z0-9._ -]+/gi, '_').slice(0, 200) || 'creative-image',
    }));
  } catch (error) { return authoringError(res, error, 'meta_creative_upload_failed'); }
});

metaAdsOperatingRouter.delete('/creative-assets/:assetId', authJwt, REQUIRE_PAID_MEDIA_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try { await deleteMetaAdsCreativeAsset(companyId, req.params.assetId); return res.status(204).send(); }
  catch (error) { return authoringError(res, error, 'meta_creative_delete_failed'); }
});

metaAdsOperatingRouter.get('/product-context', authJwt, REQUIRE_PAID_MEDIA_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  const itemCode = typeof req.query.itemCode === 'string' ? req.query.itemCode : '';
  try { return res.json(await resolveMetaAdsErpProduct(companyId, itemCode)); }
  catch (error) { return authoringError(res, error, 'meta_product_context_unavailable'); }
});

metaAdsOperatingRouter.get('/campaign-drafts', authJwt, REQUIRE_PAID_MEDIA_READ, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try { return res.json(await listMetaAdsCampaignDrafts(companyId)); }
  catch (error) { return authoringError(res, error, 'meta_campaign_drafts_unavailable'); }
});

metaAdsOperatingRouter.post('/campaign-drafts', authJwt, REQUIRE_PAID_MEDIA_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId; const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = z.object({ name: z.string().max(200).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_campaign_draft' });
  try { return res.status(201).json(await createMetaAdsCampaignDraft({ companyId, userId, name: parsed.data.name })); }
  catch (error) { return authoringError(res, error, 'meta_campaign_draft_create_failed'); }
});

metaAdsOperatingRouter.get('/campaign-drafts/:draftId', authJwt, REQUIRE_PAID_MEDIA_READ, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try { return res.json(await getMetaAdsCampaignDraft(companyId, req.params.draftId)); }
  catch (error) { return authoringError(res, error, 'meta_campaign_draft_unavailable'); }
});

metaAdsOperatingRouter.patch('/campaign-drafts/:draftId', authJwt, REQUIRE_PAID_MEDIA_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId; const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = draftPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_campaign_draft_patch', details: parsed.error.flatten() });
  try {
    return res.json(await patchMetaAdsCampaignDraft({
      companyId, userId, draftId: req.params.draftId, expectedVersion: parsed.data.expectedVersion,
      patch: parsed.data.patch as Parameters<typeof patchMetaAdsCampaignDraft>[0]['patch'],
    }));
  } catch (error) { return authoringError(res, error, 'meta_campaign_draft_update_failed'); }
});

metaAdsOperatingRouter.post('/campaign-drafts/:draftId/generate', authJwt, REQUIRE_PAID_MEDIA_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId; const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = z.object({ expectedVersion: z.number().int().positive(), replaceConceptId: z.string().uuid().optional(), idempotencyKey: z.string().min(8).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_generation_request' });
  const key = idempotencyKey(req, parsed.data.idempotencyKey);
  if (!key) return res.status(400).json({ error: 'idempotency_key_required' });
  try { return res.status(202).json(await enqueueMetaAdsCreativeGeneration({ companyId, userId, draftId: req.params.draftId, expectedVersion: parsed.data.expectedVersion, replaceConceptId: parsed.data.replaceConceptId, idempotencyKey: key })); }
  catch (error) { return authoringError(res, error, 'meta_creative_generation_failed'); }
});

metaAdsOperatingRouter.post('/campaign-drafts/:draftId/preflight', authJwt, REQUIRE_PAID_MEDIA_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try { return res.json(await preflightMetaAdsCampaign(companyId, req.params.draftId)); }
  catch (error) { return authoringError(res, error, 'meta_campaign_preflight_failed'); }
});

metaAdsOperatingRouter.post('/campaign-drafts/:draftId/submit', authJwt, REQUIRE_PAID_MEDIA_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId; const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = z.object({ expectedVersion: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_submit_request' });
  try { return res.json(await submitMetaAdsCampaignDraft({ companyId, userId, draftId: req.params.draftId, expectedVersion: parsed.data.expectedVersion })); }
  catch (error) { return authoringError(res, error, 'meta_campaign_submit_failed'); }
});

const approvalSchema = z.object({ note: z.string().max(2_000).optional(), idempotencyKey: z.string().min(8).optional() });
metaAdsOperatingRouter.post('/campaign-drafts/:draftId/approve-publish', authJwt, REQUIRE_PAID_MEDIA_APPROVE, async (req, res) => {
  const companyId = req.auth?.companyId; const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = approvalSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'invalid_approval' });
  const key = idempotencyKey(req, parsed.data.idempotencyKey); if (!key) return res.status(400).json({ error: 'idempotency_key_required' });
  try { return res.status(202).json(await approveMetaAdsCampaignPublish({ companyId, userId, draftId: req.params.draftId, note: parsed.data.note, idempotencyKey: key })); }
  catch (error) { return authoringError(res, error, 'meta_publish_approval_failed'); }
});

metaAdsOperatingRouter.post('/campaign-drafts/:draftId/approve-launch', authJwt, REQUIRE_PAID_MEDIA_APPROVE, async (req, res) => {
  const companyId = req.auth?.companyId; const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = approvalSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'invalid_approval' });
  const key = idempotencyKey(req, parsed.data.idempotencyKey); if (!key) return res.status(400).json({ error: 'idempotency_key_required' });
  try { return res.status(202).json(await approveMetaAdsCampaignLaunch({ companyId, userId, draftId: req.params.draftId, note: parsed.data.note, idempotencyKey: key })); }
  catch (error) { return authoringError(res, error, 'meta_launch_approval_failed'); }
});

metaAdsOperatingRouter.post('/campaign-drafts/:draftId/pause', authJwt, REQUIRE_PAID_MEDIA_EXECUTE, async (req, res) => {
  const companyId = req.auth?.companyId; const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = z.object({ idempotencyKey: z.string().min(8).optional() }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'invalid_pause_request' });
  const key = idempotencyKey(req, parsed.data.idempotencyKey); if (!key) return res.status(400).json({ error: 'idempotency_key_required' });
  try { const result = await pauseMetaAdsCampaign({ companyId, userId, draftId: req.params.draftId, idempotencyKey: key }); return res.status(result.job ? 202 : 200).json(result); }
  catch (error) { return authoringError(res, error, 'meta_campaign_pause_failed'); }
});

metaAdsOperatingRouter.post('/campaign-drafts/:draftId/clone', authJwt, REQUIRE_PAID_MEDIA_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId; const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  try { return res.status(201).json(await cloneMetaAdsCampaignDraft({ companyId, userId, draftId: req.params.draftId })); }
  catch (error) { return authoringError(res, error, 'meta_campaign_clone_failed'); }
});

metaAdsOperatingRouter.post('/campaign-drafts/:draftId/cancel', authJwt, REQUIRE_PAID_MEDIA_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId; const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = z.object({ reason: z.enum(['not_needed','requirements_changed','policy_risk','other']), note: z.string().max(1_000).optional(), idempotencyKey: z.string().min(8).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_cancel_request' });
  const key = idempotencyKey(req, parsed.data.idempotencyKey); if (!key) return res.status(400).json({ error: 'idempotency_key_required' });
  try { return res.json(await cancelMetaAdsCampaignDraft({ companyId, userId, draftId: req.params.draftId, reason: parsed.data.reason, note: parsed.data.note, idempotencyKey: key })); }
  catch (error) { return authoringError(res, error, 'meta_campaign_cancel_failed'); }
});

metaAdsOperatingRouter.get('/creative-jobs/:jobId', authJwt, REQUIRE_PAID_MEDIA_READ, async (req, res) => {
  const companyId = req.auth?.companyId; if (!companyId) return res.status(403).json({ error: 'no_company' });
  try { return res.json(await getMetaAdsCreativeGenerationJob(companyId, req.params.jobId)); }
  catch (error) { return authoringError(res, error, 'meta_creative_job_unavailable'); }
});

metaAdsOperatingRouter.get('/campaign-jobs/:jobId', authJwt, REQUIRE_PAID_MEDIA_READ, async (req, res) => {
  const companyId = req.auth?.companyId; if (!companyId) return res.status(403).json({ error: 'no_company' });
  try { return res.json(await getMetaAdsCampaignJob(companyId, req.params.jobId)); }
  catch (error) { return authoringError(res, error, 'meta_campaign_job_unavailable'); }
});

metaAdsOperatingRouter.get('/brief', authJwt, REQUIRE_TWIN_READ, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    return res.json(await buildMetaAdsBrief(companyId));
  } catch (error) {
    console.error('[meta-ads] brief failed', error);
    return res.status(500).json({ error: 'meta_brief_unavailable' });
  }
});

metaAdsOperatingRouter.get('/attention', authJwt, REQUIRE_TWIN_READ, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    return res.json(await buildMetaAdsAttention(companyId));
  } catch (error) {
    console.error('[meta-ads] attention failed', error);
    return res.status(500).json({ error: 'meta_attention_unavailable' });
  }
});

metaAdsOperatingRouter.post('/refresh', authJwt, REQUIRE_TWIN_READ, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    const run = await enqueueMetaAdsSync(companyId, 'manual', req.auth?.userId);
    return res.status(202).json(run);
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    return res.status(code === 'meta_not_connected' ? 404 : 400).json({ error: code });
  }
});

metaAdsOperatingRouter.get('/sync-runs/:runId', authJwt, REQUIRE_TWIN_READ, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  const run = await getMetaAdsSyncRun(companyId, req.params.runId);
  if (!run) return res.status(404).json({ error: 'sync_run_not_found' });
  return res.json(run);
});

metaAdsOperatingRouter.get('/inbox', authJwt, REQUIRE_TWIN_READ, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    return res.json(await buildMetaAdsDecisionInbox(companyId));
  } catch (error) {
    return workflowError(res, error, 'meta_inbox_unavailable');
  }
});

metaAdsOperatingRouter.get('/experiments', authJwt, REQUIRE_TWIN_READ, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  const view = req.query.view === 'history' ? 'history' : req.query.view === 'active' || req.query.view == null ? 'active' : null;
  if (!view) return res.status(400).json({ error: 'invalid_view' });
  const limit = req.query.limit == null ? 25 : Number(req.query.limit);
  if (!Number.isFinite(limit)) return res.status(400).json({ error: 'invalid_limit' });
  try {
    return res.json(await listMetaAdsExperiments(companyId, view, typeof req.query.cursor === 'string' ? req.query.cursor : undefined, limit));
  } catch (error) {
    return workflowError(res, error, 'meta_experiments_unavailable');
  }
});

metaAdsOperatingRouter.get('/experiments/:experimentId', authJwt, REQUIRE_TWIN_READ, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    return res.json(await getMetaAdsExperiment(companyId, req.params.experimentId));
  } catch (error) {
    return workflowError(res, error, 'meta_experiment_unavailable');
  }
});

metaAdsOperatingRouter.get('/assignees', authJwt, REQUIRE_ANALYTICS_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId;
  const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  try {
    return res.json(await listMetaAdsAssignees(companyId, userId));
  } catch (error) {
    return workflowError(res, error, 'meta_assignees_unavailable');
  }
});

metaAdsOperatingRouter.post('/findings/:findingId/experiments', authJwt, REQUIRE_ANALYTICS_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId;
  const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = startExperimentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_experiment_input', details: parsed.error.flatten() });
  try {
    const experiment = await startMetaAdsExperiment({
      companyId, userId, findingId: req.params.findingId, ownerMemberId: parsed.data.ownerMemberId,
      dueDate: parsed.data.dueDate, idempotencyKey: idempotencyKey(req, parsed.data.idempotencyKey),
    });
    return res.status(201).json(experiment);
  } catch (error) {
    return workflowError(res, error, 'meta_experiment_start_failed');
  }
});

metaAdsOperatingRouter.post('/findings/:findingId/dismiss', authJwt, REQUIRE_ANALYTICS_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId;
  const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = dismissSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_dismiss_input', details: parsed.error.flatten() });
  try {
    return res.json(await dismissMetaAdsFinding({
      companyId, userId, findingId: req.params.findingId, reason: parsed.data.reason, note: parsed.data.note,
      idempotencyKey: idempotencyKey(req, parsed.data.idempotencyKey),
    }));
  } catch (error) {
    return workflowError(res, error, 'meta_finding_dismiss_failed');
  }
});

metaAdsOperatingRouter.patch('/experiments/:experimentId', authJwt, REQUIRE_ANALYTICS_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId;
  const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = updateExperimentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_experiment_update', details: parsed.error.flatten() });
  try {
    return res.json(await updateMetaAdsExperiment({
      companyId, userId, experimentId: req.params.experimentId,
      ownerMemberId: parsed.data.ownerMemberId, dueDate: parsed.data.dueDate,
      idempotencyKey: idempotencyKey(req, parsed.data.idempotencyKey),
    }));
  } catch (error) {
    return workflowError(res, error, 'meta_experiment_update_failed');
  }
});

metaAdsOperatingRouter.post('/experiments/:experimentId/apply', authJwt, REQUIRE_ANALYTICS_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId;
  const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = applyExperimentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_experiment_apply', details: parsed.error.flatten() });
  try {
    return res.json(await applyMetaAdsExperiment({
      companyId, userId, experimentId: req.params.experimentId, ...parsed.data,
      idempotencyKey: idempotencyKey(req, parsed.data.idempotencyKey),
    }));
  } catch (error) {
    return workflowError(res, error, 'meta_experiment_apply_failed');
  }
});

metaAdsOperatingRouter.post('/experiments/:experimentId/cancel', authJwt, REQUIRE_ANALYTICS_WRITE, async (req, res) => {
  const companyId = req.auth?.companyId;
  const userId = req.auth?.userId;
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  const parsed = cancelExperimentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_experiment_cancel', details: parsed.error.flatten() });
  try {
    return res.json(await cancelMetaAdsExperiment({
      companyId, userId, experimentId: req.params.experimentId, ...parsed.data,
      idempotencyKey: idempotencyKey(req, parsed.data.idempotencyKey),
    }));
  } catch (error) {
    return workflowError(res, error, 'meta_experiment_cancel_failed');
  }
});
