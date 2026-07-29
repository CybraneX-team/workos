import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import {
  cleanupRbacFixture,
  createRbacFixture,
  type RbacFixture,
} from '../rbac/helpers/fixture';
import { signInViaUi } from '../rbac/helpers/ui';
import { createGuidedDemoControls } from './guided-demo-controls';
import { seedMinimalPaidAcquisitionBdt } from './helpers';

test.skip(process.env.META_ADS_CAMPAIGN_DEMO !== '1', 'Run with the demo:meta-ads-campaign-studio package script.');
test.describe.configure({ mode: 'serial', timeout: 30 * 60_000 });

const execFileAsync = promisify(execFile);
const backendRoot = path.resolve(process.cwd(), '..', 'backend');
const sceneMs = Number(process.env.META_ADS_CAMPAIGN_DEMO_SCENE_MS ?? 7_000);
const verifyControls = process.env.META_ADS_CAMPAIGN_DEMO_VERIFY_CONTROLS === '1';
const controls = createGuidedDemoControls(sceneMs);
const fixtureAccountId = 'act_workos_campaign_studio_demo';

function apiResponse(page: Page, method: string, path: string | RegExp) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    const matchesPath = typeof path === 'string' ? url.pathname.endsWith(path) : path.test(url.pathname);
    return response.request().method() === method && matchesPath;
  });
}

async function expectOk(responsePromise: Promise<APIResponse>) {
  const response = await responsePromise;
  expect(response.ok(), `${response.request().method()} ${response.url()} returned ${response.status()}`).toBe(true);
  return response;
}

async function focus(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
}

async function seedCampaignStudio(fixture: RbacFixture) {
  await seedMinimalPaidAcquisitionBdt(fixture.admin, fixture.companyId);
  await execFileAsync('pnpm', [
    'seed:meta-ads-fixture', '--',
    `--company-id=${fixture.companyId}`,
    '--scenario=healthy',
    `--account-id=${fixtureAccountId}`,
    '--execute',
  ], { cwd: backendRoot, env: process.env });
  const { error } = await fixture.admin.from('companies').update({
    name: 'Northstar Commerce',
    description: 'Disposable Campaign Studio guided-test workspace',
  }).eq('id', fixture.companyId);
  if (error) throw new Error(`Failed to name Campaign Studio fixture: ${error.message}`);
}

async function processFixtureJob(companyId: string, kind: 'creative' | 'campaign') {
  await execFileAsync('pnpm', [
    'exec', 'tsx', 'scripts/process-meta-ads-authoring-fixture.ts',
    `--company-id=${companyId}`,
    `--kind=${kind}`,
    '--execute',
  ], {
    cwd: backendRoot,
    env: {
      ...process.env,
      META_AUTHORING_MODE: 'sandbox_only',
      META_AUTHORING_FAKE_META: 'true',
      META_AUTHORING_FAKE_GEMINI: 'true',
      META_AUTHORING_LAUNCH_ENABLED: 'true',
    },
  });
}

async function cleanupCreativeStorage(fixture: RbacFixture) {
  try {
    const { data, error } = await fixture.admin
      .from('meta_ads_creative_assets')
      .select('storage_path')
      .eq('company_id', fixture.companyId);
    if (error) throw error;
    const paths = (data ?? []).map((row) => String(row.storage_path)).filter(Boolean);
    if (paths.length > 0) {
      const removed = await fixture.admin.storage.from('meta-ads-creatives').remove(paths);
      if (removed.error) throw removed.error;
    }
  } catch (error) {
    console.warn('[meta-campaign-demo] creative cleanup warning:', error instanceof Error ? error.message : String(error));
  }
}

function futureUtcInput(daysFromNow: number) {
  const value = new Date(Date.now() + daysFromNow * 86_400_000);
  value.setUTCMinutes(0, 0, 0);
  return value.toISOString().slice(0, 16);
}

test('guided Campaign Studio lifecycle with review, approvals, and safe fake execution', async ({ page }, testInfo) => {
  let fixture: RbacFixture | null = null;
  await page.goto('/auth');
  await controls.reset(page);
  await controls.showStatus(
    page,
    'Preparing a disposable fake sandbox',
    'The browser is ready. Setup is creating an isolated company and founder, then connecting a deterministic sandbox account. No request can reach Meta.',
  );

  if (verifyControls) {
    await controls.clear(page);
    const controlScene = controls.showScene(page, 'Control verification', 'Pause, resume, and advance are verified before fixture setup.', 10_000);
    const pause = page.getByRole('button', { name: 'Pause Ⅱ', exact: true });
    await expect(pause).toBeVisible();
    await pause.click();
    const resume = page.getByRole('button', { name: 'Resume ▶', exact: true });
    await expect(resume).toBeVisible();
    await resume.click();
    await page.getByRole('button', { name: 'Next step →', exact: true }).click();
    await controlScene;
    await controls.reset(page);
    await controls.showStatus(
      page,
      'Preparing a disposable fake sandbox',
      'The browser is ready. Setup is creating an isolated company and founder, then connecting a deterministic sandbox account. No request can reach Meta.',
    );
  }

  try {
    fixture = await createRbacFixture(testInfo);
    await seedCampaignStudio(fixture);
    await controls.clear(page);
    await signInViaUi(page, fixture.users.founder);

    await page.goto('/universal?focus=mkt_paid_acquisition&tab=campaigns');
    await expect(page.getByText('Campaign Studio', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('WorkOS Meta sandbox · ready', { exact: true })).toBeVisible();
    await controls.showScene(
      page,
      'Authoring boundary is ready',
      'This single continuous walkthrough uses the real WorkOS APIs, database, private creative bucket, and durable jobs. Gemini and Meta are deterministic fakes, so nothing is published externally.',
    );

    await page.getByLabel('Business name', { exact: true }).fill('Northstar Commerce');
    await page.getByLabel('Target audience', { exact: true }).fill('Small business operators improving paid acquisition');
    await page.getByLabel('Brand voice', { exact: true }).fill('Clear, useful, specific, and calm');
    await page.getByLabel('Value proposition', { exact: true }).fill('Create reviewed campaigns with evidence and controlled approvals');
    await page.getByLabel('Required phrases', { exact: true }).fill('Human-reviewed');
    await page.getByLabel('Prohibited phrases', { exact: true }).fill('guaranteed results, instant success');
    const saveBrand = apiResponse(page, 'PUT', '/api/integrations/meta/brand-kit');
    await page.getByRole('button', { name: 'Save brand kit', exact: true }).click();
    await expectOk(saveBrand);
    await controls.showScene(
      page,
      'Brand context is explicit',
      'Creative generation receives only this saved brand kit, the campaign brief, and an optional confirmed ERPNext item. Required and prohibited phrases remain visible for review.',
    );

    const createDraft = apiResponse(page, 'POST', '/api/integrations/meta/campaign-drafts');
    await page.getByRole('button', { name: 'New campaign', exact: true }).click();
    await expectOk(createDraft);
    await expect(page.getByText('1. Brief and campaign setup', { exact: true })).toBeVisible();

    await page.getByLabel('Campaign name', { exact: true }).fill('Qualified website visits');
    await page.getByLabel('Goal', { exact: true }).fill('Send qualified operators to the product page');
    await page.getByLabel('Offer', { exact: true }).fill('A controlled paid-acquisition workspace');
    await page.getByLabel('Target customer', { exact: true }).fill('Small business operators responsible for paid growth');
    await page.getByLabel('Proof points', { exact: true }).fill('Human approval before publication, Paused-first publishing');
    await page.getByLabel('Landing page', { exact: true }).fill('https://example.com/paid-acquisition');
    await page.getByRole('combobox', { name: 'Facebook / Instagram identity', exact: true }).selectOption('page_workos_fixture');
    await page.getByLabel('Countries', { exact: true }).fill('US');
    await page.getByLabel('Minimum age', { exact: true }).fill('21');
    await page.getByLabel(/Lifetime budget/).fill('5000');
    await page.getByLabel(/Start time/).fill(futureUtcInput(1));
    await page.getByLabel(/End time/).fill(futureUtcInput(8));
    const saveSetup = apiResponse(page, 'PATCH', /\/api\/integrations\/meta\/campaign-drafts\/[^/]+$/);
    await page.getByRole('button', { name: 'Save setup', exact: true }).click();
    await expectOk(saveSetup);
    await controls.showScene(
      page,
      'Campaign setup is reviewable',
      'The draft fixes the objective to Website Traffic and exposes destination, Page identity, broad audience, lifetime budget, dates, and category before any creative or Meta object exists.',
    );

    await focus(page.getByText('2. Creative concepts', { exact: true }));
    const generation = apiResponse(page, 'POST', '/generate');
    await page.getByRole('button', { name: 'Generate concepts', exact: true }).click();
    await expectOk(generation);
    await processFixtureJob(fixture.companyId, 'creative');
    await expect(page.getByText('Benefit-led clarity', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('Proof-led confidence', { exact: true })).toBeVisible();
    await expect(page.getByText('Direct offer', { exact: true })).toBeVisible();
    await controls.showScene(
      page,
      'Three creative directions are generated',
      'Each concept has deterministic 1:1, 4:5, and 9:16 image assets in the private bucket plus editable rationale, primary text, headline, description, and CTA.',
    );

    const chooseAd = apiResponse(page, 'PATCH', /\/api\/integrations\/meta\/campaign-drafts\/[^/]+$/);
    await page.getByRole('button', { name: 'Use this ad', exact: true }).first().click();
    await expectOk(chooseAd);
    await expect(page.getByText('Selected ads (1/3)', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Primary text', exact: true }).fill('Human-reviewed paid acquisition: plan with evidence, then publish only after approval.');
    await page.getByRole('textbox', { name: 'Headline', exact: true }).fill('Paid acquisition with control');
    await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Review every detail before launch.');
    const saveAd = apiResponse(page, 'PATCH', /\/api\/integrations\/meta\/campaign-drafts\/[^/]+$/);
    await page.getByRole('button', { name: 'Save selected ads', exact: true }).click();
    await expectOk(saveAd);
    await controls.showScene(
      page,
      'The final ad remains editable',
      'Generated output is never auto-approved. The user chooses one to three concepts, selects the image ratio, and edits every final copy field before preflight.',
    );

    await focus(page.getByText('3. Review, publish paused, then launch', { exact: true }));
    const preflight = apiResponse(page, 'POST', '/preflight');
    await page.getByRole('button', { name: 'Run preflight', exact: true }).click();
    const preflightResponse = await expectOk(preflight);
    expect((await preflightResponse.json()).ready).toBe(true);
    await expect(page.getByText(/Preflight passed for snapshot/i)).toBeVisible();
    await controls.showScene(
      page,
      'Deterministic preflight passed',
      'The saved snapshot—not unsaved browser state—is checked for identity, destination, category, audience, budget, schedule, selected assets, and required copy.',
    );

    const submit = apiResponse(page, 'POST', '/submit');
    await page.getByRole('button', { name: 'Submit for paused publication', exact: true }).click();
    await expectOk(submit);
    await expect(page.getByRole('button', { name: 'Approve & publish paused', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Approval note (optional)', exact: true }).fill('Reviewed identity, copy, budget, dates, destination, and final image.');
    await controls.showScene(
      page,
      'First human approval: publish paused',
      'Submission freezes the reviewed snapshot. Approval authorizes creation of campaign, ad set, creative, and ad, but every delivery object must remain PAUSED.',
    );

    const publish = apiResponse(page, 'POST', '/approve-publish');
    await page.getByRole('button', { name: 'Approve & publish paused', exact: true }).click();
    await expectOk(publish);
    await processFixtureJob(fixture.companyId, 'campaign');
    const launchButton = page.getByRole('button', { name: 'Approve launch', exact: true });
    await expect(launchButton).toBeVisible({ timeout: 90_000 });
    const adsManagerLink = page.getByRole('link', { name: 'Open exact campaign in Ads Manager' });
    await expect(adsManagerLink).toBeVisible();
    await controls.showScene(
      page,
      'Paused publication is verified',
      'The durable job created fake campaign, ad-set, creative, and ad mappings, verified their paused state, retained the approval, and produced an exact Ads Manager deep-link.',
    );

    await page.getByRole('textbox', { name: 'Approval note (optional)', exact: true }).fill('Inspected the paused objects and approved the scheduled start.');
    await controls.showScene(
      page,
      'Second human approval: launch',
      'Launch is intentionally separate from publication. The current paused object state and frozen snapshot are checked again before activation.',
    );
    const launch = apiResponse(page, 'POST', '/approve-launch');
    await launchButton.click();
    await expectOk(launch);
    await processFixtureJob(fixture.companyId, 'campaign');
    const pauseButton = page.getByRole('button', { name: 'Emergency pause', exact: true });
    await expect(pauseButton).toBeVisible({ timeout: 90_000 });
    await controls.showScene(
      page,
      'Campaign is scheduled after approval',
      'Because the start date is in the future, the approved campaign becomes scheduled. WorkOS now exposes only the narrow emergency-pause execution control.',
    );

    const pause = apiResponse(page, 'POST', '/pause');
    await pauseButton.click();
    await expectOk(pause);
    await processFixtureJob(fixture.companyId, 'campaign');
    const cloneButton = page.getByRole('button', { name: 'Clone to edit', exact: true });
    await expect(cloneButton).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('Audit timeline', { exact: true })).toBeVisible();
    await expect(page.getByText('publish approved', { exact: true })).toBeVisible();
    await expect(page.getByText('launch approved', { exact: true })).toBeVisible();
    await controls.showScene(
      page,
      'Emergency pause and audit retention',
      'The campaign, ad set, and ads are paused through one controlled action. Actor snapshots, both approvals, durable job transitions, and the final pause remain append-only.',
    );

    const clone = apiResponse(page, 'POST', '/clone');
    await cloneButton.click();
    await expectOk(clone);
    await expect(page.getByRole('textbox', { name: 'Campaign name', exact: true })).toHaveValue(/\(copy\)$/);
    await expect(page.getByRole('link', { name: 'Open exact campaign in Ads Manager' })).toHaveCount(0);
    await controls.showScene(
      page,
      'Clone creates a clean editable draft',
      'The copy keeps the reviewed campaign content but carries no Meta object IDs or approvals. The completed source campaign remains in history with its original evidence.',
    );

    await controls.showScene(
      page,
      'Campaign Studio walkthrough complete',
      'One continuous verified path: brand kit → brief → generated creatives → final edit → preflight → paused publication approval → separate launch approval → emergency pause → clean clone.',
      Math.max(sceneMs, 10_000),
    );
  } finally {
    await controls.clear(page).catch(() => undefined);
    if (fixture) {
      await cleanupCreativeStorage(fixture);
      await cleanupRbacFixture(fixture);
    }
  }
});
