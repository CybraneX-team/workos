import {
  ConfigureLeadSyncResponseSchema, RecordQueryBatchResponseSchema, StampLeadAttributionResponseSchema,
  TenantListResponseSchema, TenantStatusSchema,
  type ConfigureLeadSyncRequest, type ConfigureSsoRequest, type ErpNextEnvironment,
  type ProvisionTenantRequest, type RecordQuery, type ReconcileUsersRequest,
  type StampLeadAttributionRequest, type TenantStatus,
} from '@cybranex/erpnext-contracts';
import { env } from '../config.js';

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${env.ERPNEXT_CONTROL_PLANE_URL.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.ERPNEXT_CONTROL_PLANE_TOKEN}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    signal: AbortSignal.timeout(35_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body as { code?: string; message?: string; retryable?: boolean };
    const thrown = new Error(error.message ?? `ERPNext control-plane returned ${response.status}`) as Error & { code?: string; retryable?: boolean; status?: number };
    thrown.code = error.code; thrown.retryable = error.retryable; thrown.status = response.status;
    throw thrown;
  }
  return body;
}

export async function getTenantStatus(companyId: string, environment: ErpNextEnvironment = env.ERPNEXT_TARGET_ENV): Promise<TenantStatus> {
  return TenantStatusSchema.parse(await request(`/internal/v1/tenants/${companyId}/status?environment=${environment}`));
}

export async function listTenants(environment: ErpNextEnvironment = env.ERPNEXT_TARGET_ENV) {
  return TenantListResponseSchema.parse(await request(`/internal/v1/tenants?environment=${environment}`)).tenants;
}

export async function provisionTenant(companyId: string, payload: ProvisionTenantRequest) {
  return request(`/internal/v1/tenants/${companyId}/provision`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function queryRecords(companyId: string, queries: RecordQuery[], options: { traceId?: string } = {}) {
  const response = await request(`/internal/v1/tenants/${companyId}/records/query-batch`, {
    method: 'POST',
    body: JSON.stringify({ environment: env.ERPNEXT_TARGET_ENV, queries }),
    headers: options.traceId ? { 'X-WorkOS-Trace-Id': options.traceId } : undefined,
  });
  return RecordQueryBatchResponseSchema.parse(response).results;
}

export async function reconcileTenantUsers(companyId: string, payload: ReconcileUsersRequest) {
  return request(`/internal/v1/tenants/${companyId}/users`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function configureTenantSso(companyId: string, payload: ConfigureSsoRequest) {
  return request(`/internal/v1/tenants/${companyId}/sso`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function configureTenantLeadSync(companyId: string, payload: ConfigureLeadSyncRequest) {
  return ConfigureLeadSyncResponseSchema.parse(
    await request(`/internal/v1/tenants/${companyId}/lead-sync`, { method: 'PUT', body: JSON.stringify(payload) }),
  );
}

export async function stampTenantLeadAttribution(companyId: string, payload: StampLeadAttributionRequest) {
  return StampLeadAttributionResponseSchema.parse(
    await request(`/internal/v1/tenants/${companyId}/lead-attribution`, { method: 'PUT', body: JSON.stringify(payload) }),
  );
}
