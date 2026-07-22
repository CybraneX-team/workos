import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConfigureLeadSyncRequestSchema,
  ConfigureSsoRequestSchema,
  ErpNextEnvironmentSchema,
  MutatingCommandResponseSchema,
  ProvisionTenantRequestSchema,
  ProvisionTenantResponseSchema,
  RecordQueryBatchRequestSchema,
  RecordQueryBatchResponseSchema,
  ReconcileUsersResponseSchema,
  ReconcileUsersRequestSchema,
  ServiceErrorSchema,
  StampLeadAttributionRequestSchema,
  TenantListResponseSchema,
  TenantStatusSchema,
  WORKOS_LEAD_AD_ID_FIELD,
  serviceError,
} from '../src/index.js';

test('provision contracts reject cross-shape and invalid slugs', () => {
  assert.equal(ProvisionTenantRequestSchema.safeParse({ environment: 'local', companySlug: 'Acme Inc', idempotencyKey: '12345678' }).success, false);
  assert.equal(ProvisionTenantRequestSchema.safeParse({ environment: 'local', companySlug: 'acme-inc', idempotencyKey: 'provision:acme' }).success, true);
});

test('environment, status, list, response, and normalized-error contracts validate', () => {
  const companyId = '9380e38c-5f03-49a0-bb60-1c916a51ff1e';
  assert.equal(ErpNextEnvironmentSchema.parse('local'), 'local');
  assert.deepEqual(ServiceErrorSchema.parse(serviceError('tenant_not_ready', 'Not ready.', true)), {
    code: 'tenant_not_ready', message: 'Not ready.', retryable: true,
  });
  const tenant = TenantStatusSchema.parse({ companyId, environment: 'local', status: 'ready', deskUrl: 'http://erp-acme.localhost:8081' });
  assert.equal(TenantListResponseSchema.parse({ tenants: [tenant] }).tenants.length, 1);
  assert.equal(ProvisionTenantResponseSchema.parse({ accepted: true, jobId: companyId, status: 'complete' }).status, 'complete');
  assert.deepEqual(ReconcileUsersResponseSchema.parse({ applied: 1, disabled: 2 }), { applied: 1, disabled: 2 });
  assert.deepEqual(MutatingCommandResponseSchema.parse({ applied: true }), { applied: true });
});

test('batch response preserves independent success and normalized failure results', () => {
  const parsed = RecordQueryBatchResponseSchema.parse({ results: [
    { id: 'ok', ok: true, rows: [{ name: 'ITEM-1' }] },
    { id: 'failed', ok: false, rows: [], error: serviceError('frappe_read_failed', 'Read failed.', true) },
  ] });
  assert.equal(parsed.results[0].ok, true);
  assert.equal(parsed.results[1].ok, false);
});

test('record batch applies bounded defaults', () => {
  const parsed = RecordQueryBatchRequestSchema.parse({
    environment: 'local',
    queries: [{ id: 'items', doctype: 'Item', fields: ['name'] }],
  });
  assert.equal(parsed.queries[0].limit, 100);
  assert.equal(parsed.queries[0].pageSize, 1000);
});

test('lead-sync command requires a first_name mapping and applies the frequency default', () => {
  const base = {
    environment: 'local' as const,
    idempotencyKey: 'lead-sync:company',
    sourceName: 'WorkOS · Standard lead form',
    discoveryAccessToken: 'user-token',
    syncAccessToken: 'page-scoped-token',
    facebookPageId: '1234567890',
    facebookLeadFormId: '9876543210',
  };
  // Frappe CRM throws server-side without first_name; the contract fails closed first.
  assert.equal(ConfigureLeadSyncRequestSchema.safeParse({
    ...base, questionMappings: [{ key: 'email', mappedToCrmField: 'email' }],
  }).success, false);

  const parsed = ConfigureLeadSyncRequestSchema.parse({
    ...base,
    questionMappings: [
      { key: 'first_name', mappedToCrmField: 'first_name' },
      { key: 'email', mappedToCrmField: 'email' },
    ],
  });
  assert.equal(parsed.backgroundSyncFrequency, 'Hourly');

  assert.equal(ConfigureLeadSyncRequestSchema.safeParse({
    ...base, backgroundSyncFrequency: 'Every 2 Minutes',
    questionMappings: [{ key: 'first_name', mappedToCrmField: 'first_name' }],
  }).success, false);
});

test('lead-attribution command bounds its batch and names the shared custom field', () => {
  assert.equal(WORKOS_LEAD_AD_ID_FIELD, 'workos_meta_ad_id');
  assert.equal(StampLeadAttributionRequestSchema.safeParse({
    environment: 'local', idempotencyKey: 'attribution:company', entries: [],
  }).success, false);
  assert.equal(StampLeadAttributionRequestSchema.safeParse({
    environment: 'local',
    idempotencyKey: 'attribution:company',
    entries: Array.from({ length: 201 }, (_, index) => ({ leadName: `CRM-LEAD-${index}`, adId: '1' })),
  }).success, false);
  assert.equal(StampLeadAttributionRequestSchema.parse({
    environment: 'local',
    idempotencyKey: 'attribution:company',
    entries: [{ leadName: 'CRM-LEAD-2026-00001', adId: '120210000000000' }],
  }).entries.length, 1);
});

test('user and sso commands validate runtime payloads', () => {
  assert.equal(ReconcileUsersRequestSchema.safeParse({ environment: 'local', idempotencyKey: 'users:company', users: [] }).success, true);
  assert.equal(ConfigureSsoRequestSchema.safeParse({
    environment: 'local', idempotencyKey: 'sso:company', providerName: 'workos', clientId: 'id', clientSecret: 'secret',
    authorizeUrl: 'http://localhost:5173/oauth/authorize', oidcBaseUrl: 'http://host.docker.internal:8080/api/oidc',
    redirectUrl: 'http://erp-acme.localhost:8081/api/method/frappe.integrations.oauth2_logins.custom/workos',
  }).success, true);
});
