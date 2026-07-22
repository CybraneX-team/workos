import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
  TenantListResponseSchema,
  TenantStatusSchema,
  serviceError,
} from '../src/index.js';

const provisionRequest = {
  environment: 'local', companySlug: 'acme-inc', idempotencyKey: 'provision:acme',
  companyName: 'Acme Inc', country: 'India', currency: 'INR',
  fyStartDate: '2026-04-01', fyEndDate: '2027-03-31', timezone: 'Asia/Kolkata',
};

test('provision contracts reject cross-shape and invalid slugs', () => {
  assert.equal(ProvisionTenantRequestSchema.safeParse({ ...provisionRequest, companySlug: 'Acme Inc' }).success, false);
  assert.equal(ProvisionTenantRequestSchema.safeParse(provisionRequest).success, true);
});

test('provision contract requires the ERPNext setup-wizard locale facts', () => {
  // country is the field whose absence crashes erpnext's install_fixtures.
  for (const field of ['companyName', 'country', 'currency', 'fyStartDate', 'fyEndDate']) {
    const { [field]: _omitted, ...withoutField } = provisionRequest as Record<string, unknown>;
    assert.equal(ProvisionTenantRequestSchema.safeParse(withoutField).success, false, `${field} must be required`);
  }
  // timezone is the one optional locale fact — Frappe tolerates an unset time_zone.
  const { timezone: _tz, ...withoutTimezone } = provisionRequest;
  assert.equal(ProvisionTenantRequestSchema.safeParse(withoutTimezone).success, true);
  assert.equal(ProvisionTenantRequestSchema.safeParse({ ...provisionRequest, currency: 'inr' }).success, false);
  assert.equal(ProvisionTenantRequestSchema.safeParse({ ...provisionRequest, fyStartDate: '01-04-2026' }).success, false);
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

test('user and sso commands validate runtime payloads', () => {
  assert.equal(ReconcileUsersRequestSchema.safeParse({ environment: 'local', idempotencyKey: 'users:company', users: [] }).success, true);
  assert.equal(ConfigureSsoRequestSchema.safeParse({
    environment: 'local', idempotencyKey: 'sso:company', providerName: 'workos', clientId: 'id', clientSecret: 'secret',
    authorizeUrl: 'http://localhost:5173/oauth/authorize', oidcBaseUrl: 'http://host.docker.internal:8080/api/oidc',
    redirectUrl: 'http://erp-acme.localhost:8081/api/method/frappe.integrations.oauth2_logins.custom/workos',
  }).success, true);
});
