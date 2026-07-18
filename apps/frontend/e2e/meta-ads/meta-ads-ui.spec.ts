import { expect, test, type Page } from '@playwright/test';
import { cleanupRbacFixture, createRbacFixture, type RbacFixture } from '../rbac/helpers/fixture';
import { signInViaUi } from '../rbac/helpers/ui';
import {
  metaActionableFindingFixture,
  metaAuthoringReadinessFixture,
  metaBrandKitFixture,
  metaBriefFixture,
  metaCampaignDraftFixture,
  metaCreativeAssetFixture,
  metaDecisionInboxFixture,
  metaExperimentFixture,
  seedMinimalPaidAcquisitionBdt,
} from './helpers';
import type { MetaAdsConnectionState } from '@cybranex/shared-types';

test.describe('Meta Ads Paid Acquisition UX', () => {
  test.setTimeout(90_000);
  let fixture: RbacFixture;

  test.beforeAll(async () => {
    fixture = await createRbacFixture();
    await seedMinimalPaidAcquisitionBdt(fixture.admin, fixture.companyId);
  });

  test.afterAll(async () => {
    await cleanupRbacFixture(fixture);
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.title.includes('read-only members')) return;
    await signInViaUi(page, fixture.users.founder);
  });

  async function mockBrief(page: Page, state: MetaAdsConnectionState, inbox = metaDecisionInboxFixture()) {
    await page.route('**/api/integrations/meta/brief', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(metaBriefFixture(state)),
    }));
    await page.route('**/api/integrations/meta/inbox', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inbox) }));
    await page.route('**/api/integrations/meta/experiments?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null }) }));
  }

  async function openPaidAcquisition(page: Page, tab?: 'inbox' | 'campaigns' | 'experiments' | 'results') {
    const suffix = tab ? `&tab=${tab}` : '';
    await page.goto(`/universal?focus=mkt_paid_acquisition&openHub=1${suffix}`);
    await expect(page.getByText('Paid Acquisition operating brief')).toBeVisible({ timeout: 30_000 });
  }

  async function mockCampaignStudio(page: Page, status: 'submitted' | 'published_paused' = 'submitted') {
    const draft = metaCampaignDraftFixture(status);
    await page.route('**/api/integrations/meta/authoring/readiness', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(metaAuthoringReadinessFixture()) }));
    await page.route('**/api/integrations/meta/brand-kit', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(metaBrandKitFixture()) }));
    await page.route('**/api/integrations/meta/creative-assets', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([metaCreativeAssetFixture()]) }));
    await page.route('**/api/integrations/meta/campaign-drafts**', (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(path.endsWith('/campaign-drafts') ? [draft] : draft) });
    });
  }

  const states: Array<[MetaAdsConnectionState, RegExp]> = [
    ['disconnected', /Connect Meta Ads to start the daily operating loop/i],
    ['backfilling', /Building the first 90-day history/i],
    ['healthy', /No performance decisions or operational alerts are waiting/i],
    ['no_spend', /reported no spend/i],
    ['needs_configuration', /Choose the conversion event/i],
    ['stale', /Showing cached history/i],
    ['failed', /latest data refresh failed/i],
    ['historical', /preserved history from a disconnected Meta account/i],
  ];

  for (const [state, expected] of states) {
    test(`renders the ${state} state explicitly`, async ({ page }) => {
      await mockBrief(page, state);
      await openPaidAcquisition(page);
      await expect(page.getByText(expected)).toBeVisible();
    });
  }

  test('starts and assigns an actionable experiment from deterministic evidence', async ({ page }) => {
    const finding = metaActionableFindingFixture();
    const planned = metaExperimentFixture('planned');
    let started = false;
    await mockBrief(page, 'healthy');
    await page.route('**/api/integrations/meta/inbox', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(started
        ? metaDecisionInboxFixture({ counts: { open: 0, planned: 1, measuring: 0, overdue: 0, completed: 0 }, activeExperiments: [planned] })
        : metaDecisionInboxFixture({ counts: { open: 1, planned: 0, measuring: 0, overdue: 0, completed: 0 }, findings: [finding] })),
    }));
    await page.route('**/api/integrations/meta/assignees', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ memberId: planned.owner.memberId, name: planned.owner.name, role: 'founder', avatarUrl: null, isCurrentUser: true }]),
    }));
    await page.route(`**/api/integrations/meta/findings/${finding.id}/experiments`, async (route) => {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON();
      expect(body.ownerMemberId).toBe(planned.owner.memberId);
      expect(body.idempotencyKey).toBeTruthy();
      started = true;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(planned) });
    });
    await openPaidAcquisition(page, 'inbox');
    await expect(page.getByText('Founder video is losing response')).toBeVisible();
    await page.getByRole('button', { name: 'Start experiment', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Meta Ads decision details' });
    await expect(drawer.getByText('Immutable recommendation')).toBeVisible();
    await drawer.getByRole('button', { name: 'Start experiment', exact: true }).click();
    await expect(page).toHaveURL(/tab=experiments/);
    await expect(page.getByText('owner Founder E2E')).toBeVisible();
  });

  test('records manual application and shows measurement progress', async ({ page }) => {
    const planned = metaExperimentFixture('planned');
    const measuring = metaExperimentFixture('measuring');
    let applied = false;
    await mockBrief(page, 'healthy');
    await page.route('**/api/integrations/meta/inbox', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(metaDecisionInboxFixture({
        counts: { open: 0, planned: applied ? 0 : 1, measuring: applied ? 1 : 0, overdue: 0, completed: 0 },
        activeExperiments: [applied ? measuring : planned],
      })),
    }));
    await page.route(`**/api/integrations/meta/experiments/${planned.id}/apply`, async (route) => {
      const body = route.request().postDataJSON();
      expect(body.confirmedRecommendedChange).toBe(true);
      expect(body.implementationNote).toContain('Rotated');
      applied = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(measuring) });
    });
    await openPaidAcquisition(page, 'experiments');
    await page.getByRole('button', { name: 'Mark applied', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Meta Ads decision details' });
    await drawer.getByPlaceholder('What did you change in Ads Manager?').fill('Rotated one creative in Ads Manager.');
    await drawer.getByLabel(/I confirm the prescribed change/i).check();
    await drawer.getByRole('button', { name: 'Mark applied and begin measurement' }).click();
    await expect(page.getByText(/Measuring · 4 of 7 complete days/i)).toBeVisible();
  });

  test('retains completed before-and-after evidence and timeline', async ({ page }) => {
    const completed = metaExperimentFixture('completed', 'improved');
    await mockBrief(page, 'healthy');
    await page.route('**/api/integrations/meta/experiments?**', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ items: [completed], nextCursor: null }),
    }));
    await page.route(`**/api/integrations/meta/experiments/${completed.id}`, (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(completed),
    }));
    await openPaidAcquisition(page, 'results');
    await expect(page.getByText(/CTR changed \+50.0%/i)).toBeVisible();
    await page.getByRole('button', { name: 'View evidence' }).click();
    const drawer = page.getByRole('dialog', { name: 'Meta Ads decision details' });
    await expect(drawer.getByText('Frozen 7-day baseline')).toBeVisible();
    await expect(drawer.getByText(/Timeline/)).toBeVisible();
  });

  test('read-only members can inspect evidence but cannot operate the workflow', async ({ page }) => {
    const finding = metaActionableFindingFixture();
    const planned = metaExperimentFixture('planned');
    await mockBrief(page, 'healthy', metaDecisionInboxFixture({
      counts: { open: 1, planned: 1, measuring: 0, overdue: 0, completed: 0 },
      findings: [finding],
      activeExperiments: [planned],
    }));
    await signInViaUi(page, fixture.users.viewer);
    await openPaidAcquisition(page, 'inbox');
    await expect(page.getByText(/You have read-only access/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start experiment', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Dismiss', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /Experiments/ }).click();
    await expect(page.getByRole('button', { name: 'Mark applied', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeVisible();
  });

  test('Campaign Studio exposes the paused-publication approval and editable final ad review', async ({ page }) => {
    await mockBrief(page, 'healthy');
    await mockCampaignStudio(page, 'submitted');
    await openPaidAcquisition(page, 'campaigns');
    await expect(page.getByText('Campaign Studio', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New campaign' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve & publish paused' })).toBeVisible();
    await expect(page.getByText('Selected ads (1/3)')).toBeVisible();
    await expect(page.getByLabel('Primary text')).toHaveValue(/publish it paused/i);
    await expect(page.getByRole('button', { name: 'Approve launch' })).toHaveCount(0);
  });

  test('Campaign Studio presents launch as a separate second approval', async ({ page }) => {
    await mockBrief(page, 'healthy');
    await mockCampaignStudio(page, 'published_paused');
    await openPaidAcquisition(page, 'campaigns');
    await expect(page.getByRole('button', { name: 'Approve launch' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve & publish paused' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open exact campaign in Ads Manager' })).toHaveAttribute('href', /selected_campaign_ids=campaign-e2e-published/);
  });

  test('read-only members can inspect Campaign Studio but cannot edit, approve, or execute', async ({ page }) => {
    await mockBrief(page, 'healthy');
    await mockCampaignStudio(page, 'submitted');
    await signInViaUi(page, fixture.users.viewer);
    await openPaidAcquisition(page, 'campaigns');
    await expect(page.getByText('Campaign Studio', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New campaign' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save brand kit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve & publish paused' })).toHaveCount(0);
    await expect(page.getByLabel('Primary text')).toBeDisabled();
  });

  test('Overview attention deep-link opens the Paid Acquisition hub', async ({ page }) => {
    await mockBrief(page, 'healthy');
    await page.route('**/api/integrations/meta/attention', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        count: 1, warningCount: 1, criticalCount: 0, dataAgeHours: 40,
        highestPriorityFinding: {
          id: 'finding-e2e', fingerprint: 'stale-e2e', severity: 'warning', scope: 'integration', kind: 'stale_data',
          title: 'Meta Ads data is stale', explanation: 'Fixture evidence', affectedPeriod: { start: null, end: null },
          evidence: { dataAgeHours: 40 }, estimatedSpendExposure: 0,
          action: { kind: 'review_paid_acquisition', label: 'Review refresh status', href: '/universal?focus=mkt_paid_acquisition&openHub=1' },
          firstDetectedAt: '2026-07-14T00:00:00.000Z', lastDetectedAt: '2026-07-14T01:00:00.000Z',
        },
      }),
    }));
    await page.goto('/overview');
    await page.getByRole('button', { name: 'Review in Paid Acquisition' }).click();
    await expect(page).toHaveURL(/focus=mkt_paid_acquisition.*openHub=1.*tab=inbox/);
    await expect(page.getByText('Paid Acquisition operating brief')).toBeVisible({ timeout: 30_000 });
  });

  test('Polytope side-panel CTA opens the container hub', async ({ page }) => {
    await mockBrief(page, 'healthy');
    await page.goto('/universal?focus=mkt_paid_acquisition');
    const cta = page.getByRole('button', { name: 'Open Paid Acquisition' });
    await expect(cta).toBeVisible({ timeout: 30_000 });
    await cta.click();
    await expect(page.getByText('Paid Acquisition operating brief')).toBeVisible({ timeout: 30_000 });
  });

  test('Paid Acquisition focus releases to explicit leaf navigation', async ({ page }) => {
    await mockBrief(page, 'healthy');
    await page.goto('/universal?focus=mkt_paid_acquisition');
    await expect(page.getByRole('button', { name: 'Open Paid Acquisition' })).toBeVisible({ timeout: 30_000 });
    await page.getByText('Ad Performance', { exact: true }).click();
    await page.getByText('Ad Performance health', { exact: true }).click();
    await expect(page.getByText('Meta Ads · Ad Performance', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/focus=mkt_paid_acquisition/);
  });
});
