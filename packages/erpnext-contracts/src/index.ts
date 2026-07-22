import { z } from 'zod';

export const ErpNextEnvironmentSchema = z.enum(['local', 'remote']);
export type ErpNextEnvironment = z.infer<typeof ErpNextEnvironmentSchema>;

export const ServiceErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
});
export type ServiceError = z.infer<typeof ServiceErrorSchema>;

export const ProvisionTenantRequestSchema = z.object({
  environment: ErpNextEnvironmentSchema,
  companySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  idempotencyKey: z.string().min(8).max(200),
});
export type ProvisionTenantRequest = z.infer<typeof ProvisionTenantRequestSchema>;

export const ProvisionTenantResponseSchema = z.object({
  accepted: z.literal(true),
  jobId: z.string().uuid(),
  status: z.enum(['pending', 'running', 'complete']),
});
export type ProvisionTenantResponse = z.infer<typeof ProvisionTenantResponseSchema>;

export const TenantStatusValueSchema = z.enum(['not_configured', 'provisioning', 'ready', 'failed']);
export const TenantStatusSchema = z.object({
  companyId: z.string().uuid(),
  environment: ErpNextEnvironmentSchema,
  status: TenantStatusValueSchema,
  siteName: z.string().optional(),
  deskUrl: z.string().url().optional(),
  lastError: ServiceErrorSchema.optional(),
});
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantListResponseSchema = z.object({ tenants: z.array(TenantStatusSchema) });
export type TenantListResponse = z.infer<typeof TenantListResponseSchema>;

export const RecordFilterSchema = z.tuple([z.string().min(1), z.string().min(1), z.unknown()]);
export type RecordFilter = z.infer<typeof RecordFilterSchema>;

export const RecordQuerySchema = z.object({
  id: z.string().min(1).max(120),
  doctype: z.string().min(1).max(120),
  fields: z.array(z.string().min(1).max(120)).min(1).max(100),
  filters: z.array(RecordFilterSchema).max(50).default([]),
  limit: z.number().int().min(1).max(1000).default(100),
  pageSize: z.number().int().min(1).max(1000).default(1000),
});
export type RecordQuery = z.infer<typeof RecordQuerySchema>;

export const RecordQueryBatchRequestSchema = z.object({
  environment: ErpNextEnvironmentSchema,
  queries: z.array(RecordQuerySchema).min(1).max(50),
});
export type RecordQueryBatchRequest = z.infer<typeof RecordQueryBatchRequestSchema>;

export const RecordQueryResultSchema = z.discriminatedUnion('ok', [
  z.object({ id: z.string(), ok: z.literal(true), rows: z.array(z.record(z.unknown())) }),
  z.object({ id: z.string(), ok: z.literal(false), rows: z.tuple([]), error: ServiceErrorSchema }),
]);
export type RecordQueryResult = z.infer<typeof RecordQueryResultSchema>;

export const RecordQueryBatchResponseSchema = z.object({ results: z.array(RecordQueryResultSchema) });
export type RecordQueryBatchResponse = z.infer<typeof RecordQueryBatchResponseSchema>;

export const DesiredUserSchema = z.object({
  externalUserId: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().min(1).max(140),
  lastName: z.string().max(140).optional(),
  roles: z.array(z.string().min(1).max(140)).max(100),
});
export type DesiredUser = z.infer<typeof DesiredUserSchema>;

export const ReconcileUsersRequestSchema = z.object({
  environment: ErpNextEnvironmentSchema,
  idempotencyKey: z.string().min(8).max(200),
  users: z.array(DesiredUserSchema).max(1000),
});
export type ReconcileUsersRequest = z.infer<typeof ReconcileUsersRequestSchema>;

export const ReconcileUsersResponseSchema = z.object({
  applied: z.number().int().nonnegative(),
  disabled: z.number().int().nonnegative(),
});
export type ReconcileUsersResponse = z.infer<typeof ReconcileUsersResponseSchema>;

export const ConfigureSsoRequestSchema = z.object({
  environment: ErpNextEnvironmentSchema,
  idempotencyKey: z.string().min(8).max(200),
  providerName: z.string().min(1).max(120).default('workos'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  authorizeUrl: z.string().url(),
  oidcBaseUrl: z.string().url(),
  redirectUrl: z.string().url(),
});
export type ConfigureSsoRequest = z.infer<typeof ConfigureSsoRequestSchema>;

/**
 * Custom field WorkOS adds to `CRM Lead` to carry the originating Meta ad. Frappe CRM's
 * lead syncer requests only `id,created_time,field_data`, so `ad_id` — which Meta does
 * return on the lead object — is discarded; WorkOS backfills it. Shared so the backend
 * enrichment pass and the control-plane writer cannot drift on the fieldname.
 */
export const WORKOS_LEAD_AD_ID_FIELD = 'workos_meta_ad_id';

/** Mirrors `Lead Sync Source.background_sync_frequency` in Frappe CRM's lead_syncing module. */
export const LeadSyncFrequencySchema = z.enum([
  'Every 5 Minutes', 'Every 10 Minutes', 'Every 15 Minutes', 'Hourly', 'Daily', 'Monthly',
]);
export type LeadSyncFrequency = z.infer<typeof LeadSyncFrequencySchema>;

export const LeadSyncQuestionMappingSchema = z.object({
  /** Facebook lead-form question key, matched against `Facebook Lead Form Question.key`. */
  key: z.string().min(1).max(200),
  /** Target `CRM Lead` fieldname. */
  mappedToCrmField: z.string().min(1).max(140),
});
export type LeadSyncQuestionMapping = z.infer<typeof LeadSyncQuestionMappingSchema>;

export const ConfigureLeadSyncRequestSchema = z.object({
  environment: ErpNextEnvironmentSchema,
  idempotencyKey: z.string().min(8).max(200),
  sourceName: z.string().min(1).max(140),
  /**
   * User token, used ONLY to bootstrap discovery. Frappe CRM's `Lead Sync Source.before_insert`
   * calls `/me/accounts` to enumerate Pages and their lead forms, and a Page-scoped token cannot
   * do that — Graph answers `(#100) Tried accessing nonexisting field (accounts)`. The control
   * plane overwrites this with `syncAccessToken` as its final step, so it is never the
   * steady-state credential. Frappe keeps Password values in `__Auth` (upserted) and stores only
   * a `*****` mask on the doc column, so the overwrite leaves no residue in version history.
   */
  discoveryAccessToken: z.string().min(1),
  /** Page-scoped token that remains stored on the tenant site and drives ongoing lead polling. */
  syncAccessToken: z.string().min(1),
  backgroundSyncFrequency: LeadSyncFrequencySchema.default('Hourly'),
  facebookPageId: z.string().min(1).max(120),
  facebookLeadFormId: z.string().min(1).max(120),
  questionMappings: z.array(LeadSyncQuestionMappingSchema).min(1).max(100),
}).refine(
  (value) => value.questionMappings.some((mapping) => mapping.mappedToCrmField === 'first_name'),
  {
    // Frappe CRM's facebook_lead_form.py throws unless first_name is mapped. Failing here
    // keeps a guaranteed-to-fail write from ever reaching the tenant site.
    path: ['questionMappings'],
    message: 'A question must map to first_name.',
  },
);
export type ConfigureLeadSyncRequest = z.infer<typeof ConfigureLeadSyncRequestSchema>;

export const ConfigureLeadSyncResponseSchema = z.object({
  applied: z.literal(true),
  sourceName: z.string().min(1),
});
export type ConfigureLeadSyncResponse = z.infer<typeof ConfigureLeadSyncResponseSchema>;

export const LeadAttributionEntrySchema = z.object({
  /** `CRM Lead` docname. */
  leadName: z.string().min(1).max(140),
  adId: z.string().min(1).max(120),
});
export type LeadAttributionEntry = z.infer<typeof LeadAttributionEntrySchema>;

export const StampLeadAttributionRequestSchema = z.object({
  environment: ErpNextEnvironmentSchema,
  idempotencyKey: z.string().min(8).max(200),
  entries: z.array(LeadAttributionEntrySchema).min(1).max(200),
});
export type StampLeadAttributionRequest = z.infer<typeof StampLeadAttributionRequestSchema>;

export const StampLeadAttributionResponseSchema = z.object({
  stamped: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
export type StampLeadAttributionResponse = z.infer<typeof StampLeadAttributionResponseSchema>;

export const MutatingCommandResponseSchema = z.object({ applied: z.literal(true) });
export type MutatingCommandResponse = z.infer<typeof MutatingCommandResponseSchema>;

export function serviceError(code: string, message: string, retryable: boolean): ServiceError {
  return { code, message, retryable };
}
