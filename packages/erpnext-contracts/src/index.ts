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

export const MutatingCommandResponseSchema = z.object({ applied: z.literal(true) });
export type MutatingCommandResponse = z.infer<typeof MutatingCommandResponseSchema>;

export function serviceError(code: string, message: string, retryable: boolean): ServiceError {
  return { code, message, retryable };
}
