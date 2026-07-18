import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  cleanupRbacFixture,
  createRbacFixture,
  removeCompany,
  seedCompany,
  signInUser,
  type RbacFixture,
} from '../rbac/helpers/fixture';
import { can, DB_BACKED_ROLES } from '../rbac/helpers/permissions';

const backendUrl = process.env.E2E_BACKEND_URL ?? `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '8080'}`;
const fixtureAccountId = 'act_workos_fixture_meta_e2e';

test.describe('Meta Ads API authorization and compatibility', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  let fixture: RbacFixture;
  let founderToken = '';

  test.beforeAll(async ({ request }, testInfo) => {
    void request;
    testInfo.setTimeout(180_000);
    fixture = await createRbacFixture();
    const backendRoot = path.resolve(process.cwd(), '..', 'backend');
    execFileSync('pnpm', [
      'seed:meta-ads-fixture', '--',
      `--company-id=${fixture.companyId}`,
      '--scenario=healthy',
      `--account-id=${fixtureAccountId}`,
      '--execute',
    ], { cwd: backendRoot, env: process.env, stdio: 'pipe' });
    founderToken = (await signInUser(fixture.users.founder)).accessToken;
  });

  test.afterAll(async () => {
    await cleanupRbacFixture(fixture);
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  for (const role of DB_BACKED_ROLES) {
    test(`${role} can read the operating brief`, async ({ request }) => {
      const token = (await signInUser(fixture.users[role])).accessToken;
      const response = await request.get(`${backendUrl}/api/integrations/meta/brief`, { headers: auth(token) });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.connection.accountId).toBe(fixtureAccountId);
      expect(JSON.stringify(body)).not.toMatch(/access_token|metadata|graph api error/i);
    });

    test(`${role} has the expected Decision Inbox workflow permission`, async ({ request }) => {
      const token = (await signInUser(fixture.users[role])).accessToken;
      const inbox = await request.get(`${backendUrl}/api/integrations/meta/inbox`, { headers: auth(token) });
      expect(inbox.status()).toBe(200);
      const experiments = await request.get(`${backendUrl}/api/integrations/meta/experiments?view=history`, { headers: auth(token) });
      expect(experiments.status()).toBe(200);
      const assignees = await request.get(`${backendUrl}/api/integrations/meta/assignees`, { headers: auth(token) });
      expect(assignees.status()).toBe(can(role, 'analytics', 'write') ? 200 : 403);
      const mutationProbe = await request.post(`${backendUrl}/api/integrations/meta/findings/00000000-0000-0000-0000-000000000000/dismiss`, {
        headers: auth(token),
        data: { reason: 'not_relevant', idempotencyKey: `permission-${role}-${fixture.runId}` },
      });
      expect(mutationProbe.status()).toBe(can(role, 'analytics', 'write') ? 404 : 403);
    });

    test(`${role} has the expected Campaign Studio permissions`, async ({ request }) => {
      const token = (await signInUser(fixture.users[role])).accessToken;
      const readiness = await request.get(`${backendUrl}/api/integrations/meta/authoring/readiness`, { headers: auth(token) });
      expect(readiness.status()).toBe(200);
      const readinessBody = await readiness.json();
      expect(readinessBody.accountId).toBe(fixtureAccountId);
      expect(JSON.stringify(readinessBody)).not.toMatch(/access_token|appsecret_proof|metadata/i);

      const created = await request.post(`${backendUrl}/api/integrations/meta/campaign-drafts`, {
        headers: auth(token),
        data: { name: `${role} permission probe` },
      });
      expect(created.status()).toBe(can(role, 'paid_media', 'write') ? 201 : 403);

      const approval = await request.post(`${backendUrl}/api/integrations/meta/campaign-drafts/00000000-0000-0000-0000-000000000000/approve-publish`, {
        headers: auth(token),
        data: { idempotencyKey: `approve-${role}-${fixture.runId}` },
      });
      expect(approval.status()).toBe(can(role, 'paid_media', 'approve') ? 404 : 403);

      const pause = await request.post(`${backendUrl}/api/integrations/meta/campaign-drafts/00000000-0000-0000-0000-000000000000/pause`, {
        headers: auth(token),
        data: { idempotencyKey: `execute-${role}-${fixture.runId}` },
      });
      expect(pause.status()).toBe(can(role, 'paid_media', 'execute') ? 404 : 403);
    });
  }

  test('read-authorized viewer can enqueue and poll only this company\'s refresh', async ({ request }) => {
    const viewerToken = (await signInUser(fixture.users.viewer)).accessToken;
    const queued = await request.post(`${backendUrl}/api/integrations/meta/refresh`, { headers: auth(viewerToken), data: {} });
    expect(queued.status()).toBe(202);
    const run = await queued.json();
    const own = await request.get(`${backendUrl}/api/integrations/meta/sync-runs/${run.id}`, { headers: auth(viewerToken) });
    expect(own.status()).toBe(200);

    const otherCompanyId = await seedCompany(fixture.admin, fixture.runId, 'meta-isolation');
    try {
      const { data, error } = await fixture.admin.from('meta_ads_sync_runs').insert({
        company_id: otherCompanyId,
        ad_account_id: 'act_other_tenant',
        reason: 'manual',
      }).select('id').single();
      if (error || !data) throw new Error(error?.message ?? 'failed to seed other tenant run');
      const other = await request.get(`${backendUrl}/api/integrations/meta/sync-runs/${data.id}`, { headers: auth(viewerToken) });
      expect(other.status()).toBe(404);
    } finally {
      await removeCompany(fixture.admin, otherCompanyId);
    }
  });

  test('legacy sync and metrics endpoints preserve their public fields', async ({ request }) => {
    const sync = await request.post(`${backendUrl}/api/integrations/meta/sync`, { headers: auth(founderToken), data: {} });
    expect(sync.status()).toBe(200);
    const syncBody = await sync.json();
    expect(Object.keys(syncBody).sort()).toEqual(['accountId', 'deduplicated', 'fresh', 'metrics', 'preview', 'syncedAt'].sort());
    expect(Array.isArray(syncBody.preview.conversionActions)).toBe(true);
    expect(syncBody.preview.conversionActions.length).toBeGreaterThan(0);

    const metrics = await request.get(`${backendUrl}/api/integrations/int-meta/metrics`, { headers: auth(founderToken) });
    expect(metrics.status()).toBe(200);
    const metricsBody = await metrics.json();
    expect(metricsBody.type).toBe('meta-ads');
    expect(metricsBody.data.conversionActions.length).toBeGreaterThan(0);
  });

  test('metric configuration remains metric-admin only', async ({ request }) => {
    const viewerToken = (await signInUser(fixture.users.viewer)).accessToken;
    const denied = await request.put(`${backendUrl}/api/metrics/${fixture.companyId}/integrations/meta/conversion-event`, {
      headers: auth(viewerToken),
      data: { actionType: 'purchase' },
    });
    expect(denied.status()).toBe(403);

    const allowed = await request.put(`${backendUrl}/api/metrics/${fixture.companyId}/integrations/meta/conversion-event`, {
      headers: auth(founderToken),
      data: { actionType: 'purchase' },
    });
    expect(allowed.status()).toBe(200);
    const body = await allowed.json();
    expect(body.selectedConversionAction).toBe('purchase');
  });

  test('analyst operates a manual experiment while read-only roles can only inspect it', async ({ request }) => {
    const backendRoot = path.resolve(process.cwd(), '..', 'backend');
    execFileSync('pnpm', [
      'seed:meta-ads-fixture', '--',
      `--company-id=${fixture.companyId}`,
      '--scenario=ad-response-decline',
      `--account-id=${fixtureAccountId}`,
      '--execute',
    ], { cwd: backendRoot, env: process.env, stdio: 'pipe' });

    const analystToken = (await signInUser(fixture.users.analyst)).accessToken;
    const engineerToken = (await signInUser(fixture.users.engineer)).accessToken;
    const viewerToken = (await signInUser(fixture.users.viewer)).accessToken;
    const inboxResponse = await request.get(`${backendUrl}/api/integrations/meta/inbox`, { headers: auth(analystToken) });
    expect(inboxResponse.status()).toBe(200);
    const inbox = await inboxResponse.json();
    const finding = inbox.findings.find((item: { recommendation?: unknown }) => item.recommendation);
    expect(finding).toBeTruthy();

    const assigneesResponse = await request.get(`${backendUrl}/api/integrations/meta/assignees`, { headers: auth(analystToken) });
    const assignees = await assigneesResponse.json();
    const owner = assignees.find((item: { isCurrentUser: boolean }) => item.isCurrentUser) ?? assignees[0];
    const due = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const startedResponse = await request.post(`${backendUrl}/api/integrations/meta/findings/${finding.id}/experiments`, {
      headers: auth(analystToken),
      data: { ownerMemberId: owner.memberId, dueDate: due, idempotencyKey: `api-start-${fixture.runId}` },
    });
    expect(startedResponse.status()).toBe(201);
    const started = await startedResponse.json();

    const denied = await request.post(`${backendUrl}/api/integrations/meta/experiments/${started.id}/apply`, {
      headers: auth(engineerToken),
      data: { implementationNote: 'Should not apply', confirmedRecommendedChange: true, keptBudgetConstant: true, idempotencyKey: `api-denied-${fixture.runId}` },
    });
    expect(denied.status()).toBe(403);

    const appliedResponse = await request.post(`${backendUrl}/api/integrations/meta/experiments/${started.id}/apply`, {
      headers: auth(analystToken),
      data: { implementationNote: 'Rotated one creative and kept audience, placements and budget unchanged.', confirmedRecommendedChange: true, keptBudgetConstant: true, idempotencyKey: `api-apply-${fixture.runId}` },
    });
    expect(appliedResponse.status()).toBe(200);
    expect((await appliedResponse.json()).status).toBe('measuring');

    const readable = await request.get(`${backendUrl}/api/integrations/meta/experiments/${started.id}`, { headers: auth(viewerToken) });
    expect(readable.status()).toBe(200);
    expect(JSON.stringify(await readable.json())).not.toMatch(/access_token|metadata|graph api error/i);
  });
});
