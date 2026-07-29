import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import {
  cleanupRbacFixture,
  createRbacFixture,
  type RbacFixture,
} from '../rbac/helpers/fixture';
import { signInViaUi } from '../rbac/helpers/ui';
import { seedMinimalPaidAcquisitionBdt } from './helpers';

test.skip(process.env.META_ADS_DEMO !== '1', 'Run with the demo:meta-ads package script.');
test.describe.configure({ mode: 'serial', timeout: 30 * 60_000 });

const SCENE_MS = Number(process.env.META_ADS_DEMO_SCENE_MS ?? 2_400);
const READ_MS = Number(process.env.META_ADS_DEMO_READ_MS ?? 3_800);
const TAIL_ONLY = process.env.META_ADS_DEMO_TAIL_ONLY === '1';
const RECOVERY_ONLY = process.env.META_ADS_DEMO_RECOVERY_ONLY === '1';
const INTRO_ONLY = process.env.META_ADS_DEMO_INTRO_ONLY === '1';
const DECISION_ONLY = process.env.META_ADS_DEMO_DECISION_ONLY === '1';
const CONNECTED_MODAL_ONLY = process.env.META_ADS_DEMO_CONNECTED_MODAL_ONLY === '1';
const CONTROLS_TEST = process.env.META_ADS_DEMO_CONTROLS_TEST === '1';
const backendRoot = path.resolve(process.cwd(), '..', 'backend');
const goalTitle = 'Scale paid acquisition efficiently';

let sceneNumber = 0;
let fixture: RbacFixture;
let founderMemberId = '';
const execFileAsync = promisify(execFile);

async function seedScenario(companyId: string, scenario: string) {
  await execFileAsync('pnpm', [
    'seed:meta-ads-fixture', '--',
    `--company-id=${companyId}`,
    `--scenario=${scenario}`,
    '--execute',
  ], { cwd: backendRoot, env: process.env });
}

async function advanceExperiment(experimentId: string, outcome: string) {
  await execFileAsync('pnpm', [
    'advance:meta-ads-experiment-fixture', '--',
    `--experiment-id=${experimentId}`,
    `--outcome=${outcome}`,
    '--execute',
  ], { cwd: backendRoot, env: process.env });
}

async function showScene(page: Page, title: string, detail: string, holdMs = SCENE_MS) {
  sceneNumber += 1;
  await page.evaluate(async ({ number, title: sceneTitle, detail: sceneDetail, duration }) => {
    document.getElementById('meta-demo-scene')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'meta-demo-scene';
    overlay.style.cssText = [
      'position:fixed', 'left:32px', 'bottom:30px', 'z-index:2147483647',
      'max-width:600px', 'padding:18px 22px', 'border-radius:18px',
      'border:1px solid rgba(196,181,253,.35)',
      'background:linear-gradient(135deg,rgba(17,12,32,.96),rgba(15,23,42,.94))',
      'box-shadow:0 24px 70px rgba(0,0,0,.55)', 'backdrop-filter:blur(18px)',
      'color:white', 'font-family:Inter,ui-sans-serif,system-ui,sans-serif',
    ].join(';');
    overlay.innerHTML = `
      <div style="font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#c4b5fd">Meta Ads operating loop · ${number}</div>
      <div style="margin-top:6px;font-size:22px;font-weight:750;line-height:1.15">${sceneTitle}</div>
      <div style="margin-top:7px;font-size:13px;line-height:1.5;color:rgba(255,255,255,.65)">${sceneDetail}</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:14px">
        <button id="meta-demo-pause" style="padding:8px 13px;border:1px solid rgba(196,181,253,.4);border-radius:9px;background:rgba(124,58,237,.2);color:white;font:700 12px Inter,ui-sans-serif,system-ui;cursor:pointer"></button>
        <button id="meta-demo-next" style="padding:8px 13px;border:1px solid rgba(255,255,255,.16);border-radius:9px;background:rgba(255,255,255,.08);color:white;font:700 12px Inter,ui-sans-serif,system-ui;cursor:pointer">Next step →</button>
        <span style="font-size:10px;color:rgba(255,255,255,.42)">Space · pause &nbsp; Right arrow · step</span>
      </div>`;
    document.body.appendChild(overlay);

    const pauseButton = document.getElementById('meta-demo-pause') as HTMLButtonElement;
    const nextButton = document.getElementById('meta-demo-next') as HTMLButtonElement;
    let paused = window.localStorage.getItem('meta-demo-paused') === '1';
    let remaining = duration;
    let previousTick = performance.now();

    const renderPauseState = () => {
      pauseButton.textContent = paused ? 'Resume ▶' : 'Pause Ⅱ';
      pauseButton.style.background = paused ? 'rgba(16,185,129,.22)' : 'rgba(124,58,237,.2)';
    };
    const togglePause = () => {
      paused = !paused;
      window.localStorage.setItem('meta-demo-paused', paused ? '1' : '0');
      previousTick = performance.now();
      renderPauseState();
    };
    renderPauseState();

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearInterval(timer);
        pauseButton.removeEventListener('click', togglePause);
        nextButton.removeEventListener('click', finish);
        window.removeEventListener('keydown', onKeyDown);
        resolve();
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.code === 'Space') {
          event.preventDefault();
          togglePause();
        } else if (event.code === 'ArrowRight') {
          event.preventDefault();
          finish();
        }
      };
      const timer = window.setInterval(() => {
        const now = performance.now();
        if (!paused) remaining -= now - previousTick;
        previousTick = now;
        if (remaining <= 0) finish();
      }, 50);

      pauseButton.addEventListener('click', togglePause);
      nextButton.addEventListener('click', finish);
      window.addEventListener('keydown', onKeyDown);
    });
  }, { number: sceneNumber, title, detail, duration: holdMs });
  await page.evaluate(() => document.getElementById('meta-demo-scene')?.remove());
}

async function ensurePaidAcquisitionCta(page: Page) {
  const openButton = page.getByRole('button', { name: 'Open Paid Acquisition', exact: true });
  await expect(openButton).toBeVisible({ timeout: 30_000 });
  return openButton;
}

async function openHub(page: Page) {
  await page.goto('/universal?focus=mkt_paid_acquisition');
  const brief = page.getByText('Paid Acquisition operating brief', { exact: true });
  await expect(brief).toBeVisible({ timeout: 30_000 });
}

async function switchScenario(page: Page, scenario: string, title: string, detail: string) {
  await showScene(page, `Preparing: ${title}`, 'The tour is switching deterministic stored evidence. No Meta objects are modified.', Math.min(SCENE_MS, 1_500));
  await seedScenario(fixture.companyId, scenario);
  await openHub(page);
  await showScene(page, title, detail);
}

async function focusText(page: Page, text: string) {
  const target = page.getByText(text, { exact: true });
  await expect(target).toBeVisible();
  await target.evaluate((element) => element.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await page.waitForTimeout(READ_MS);
}

async function openConnectedMetaIntegration(page: Page) {
  await page.goto('/twin/data');
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  const connectedMetaCard = page.getByRole('button', { name: /Meta Ads.*Northstar Commerce.*Live/i });
  await expect(connectedMetaCard).toBeVisible();
  await connectedMetaCard.click();
  await expect(page.getByRole('heading', { name: 'Meta Ads', exact: true, level: 2 })).toBeVisible();
  await expect(page.getByText(/Data through/i)).toBeVisible();
}

async function openBdtLeaf(page: Page, label: string, panelHeading: string) {
  const branchByLeaf: Record<string, string> = {
    'Ad Performance health': 'Ad Performance',
    'Spend & Reach health': 'Spend & Reach',
    'Campaigns health': 'Campaigns',
  };
  await page.goto('/universal?focus=mkt_paid_acquisition');
  await ensurePaidAcquisitionCta(page);
  await page.getByText(branchByLeaf[label], { exact: true }).click();
  await page.getByText(label, { exact: true }).click();
  await expect(page.getByText(panelHeading, { exact: true })).toBeVisible();
}

test.beforeAll(async () => {
  fixture = await createRbacFixture();
  await seedMinimalPaidAcquisitionBdt(fixture.admin, fixture.companyId);

  const { error: companyError } = await fixture.admin.from('companies').update({
    name: 'Northstar Commerce',
    description: 'Demo workspace for the Meta Ads operating loop',
  }).eq('id', fixture.companyId);
  if (companyError) throw new Error(`Failed to name demo company: ${companyError.message}`);

  const { error: profileError } = await fixture.admin.from('user_profiles').update({
    first_name: 'Kushagra',
    last_name: 'Founder',
    title: 'Founder & CEO',
  }).eq('id', fixture.users.founder.id);
  if (profileError) throw new Error(`Failed to name demo founder: ${profileError.message}`);

  const { data: founderMember, error: memberError } = await fixture.admin
    .from('company_members')
    .select('id')
    .eq('company_id', fixture.companyId)
    .eq('user_id', fixture.users.founder.id)
    .single();
  if (memberError || !founderMember) throw new Error(`Failed to load demo founder membership: ${memberError?.message ?? 'missing member'}`);
  founderMemberId = founderMember.id;

  const { error: goalError } = await fixture.admin.from('bdt_goals').insert({
    company_id: fixture.companyId,
    title: goalTitle,
    horizon: 'quarterly',
    owner_id: fixture.users.founder.id,
    created_by: fixture.users.founder.id,
    local_id: `meta-demo-${fixture.runId}`,
  });
  if (goalError) throw new Error(`Failed to seed demo goal: ${goalError.message}`);
});

test.afterAll(async () => {
  await cleanupRbacFixture(fixture);
});

test('guided visual tour of every Meta Ads operating state', async ({ page }) => {
  await page.route('**/api/team/members', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      members: [{
        id: founderMemberId,
        user_id: fixture.users.founder.id,
        company_id: fixture.companyId,
        role: 'founder',
        role_name: 'Founder',
        is_system_role: true,
        is_protected_role: true,
        status: 'active',
        department_id: null,
        invited_by: null,
        approved_at: new Date().toISOString(),
        joined_at: new Date().toISOString(),
        first_name: 'Kushagra',
        last_name: 'Founder',
        title: 'Founder & CEO',
        avatar_url: null,
        email: fixture.users.founder.email,
      }],
    }),
  }));
  await signInViaUi(page, fixture.users.founder);

  if (CONTROLS_TEST) {
    const scene = showScene(page, 'Recording controls', 'Pause the tour, then advance exactly one scene.', 10_000);
    const pauseButton = page.getByRole('button', { name: 'Pause Ⅱ', exact: true });
    await expect(pauseButton).toBeVisible();
    await pauseButton.click();
    await expect(page.getByRole('button', { name: 'Resume ▶', exact: true })).toBeVisible();
    await page.waitForTimeout(250);
    await expect(page.locator('#meta-demo-scene')).toBeVisible();
    await page.getByRole('button', { name: 'Next step →', exact: true }).click();
    await scene;
    await expect(page.locator('#meta-demo-scene')).toBeHidden();

    const nextScene = showScene(page, 'Paused next scene', 'The paused state persists between scripted scenes.', 250);
    const resumeButton = page.getByRole('button', { name: 'Resume ▶', exact: true });
    await expect(resumeButton).toBeVisible();
    await resumeButton.click();
    await nextScene;
    await expect(page.locator('#meta-demo-scene')).toBeHidden();
    return;
  }

  await showScene(
    page,
    'Northstar Commerce',
    'A complete Meta Ads decision loop: read-only evidence, controlled recommendations, manual Ads Manager execution, and frozen outcome learning.',
    READ_MS,
  );

  if (CONNECTED_MODAL_ONLY) {
    await seedScenario(fixture.companyId, 'healthy');
    await openConnectedMetaIntegration(page);
    return;
  }

  if (!TAIL_ONLY) {
  await seedScenario(fixture.companyId, 'disconnected');
  await openHub(page);
  await expect(page.getByText('Connect Meta Ads to start the daily operating loop')).toBeVisible();
  await showScene(page, 'Explicit disconnected state', 'The hub explains what will be read and guarantees that WorkOS never changes Meta campaigns.');

  await page.getByRole('button', { name: 'Connect Meta Ads', exact: true }).click();
  await expect(page).toHaveURL(/\/twin\/data\?integration=int-meta/);
  await expect(page.getByRole('heading', { name: 'Meta Ads', exact: true, level: 2 })).toBeVisible();
  await showScene(page, 'Connection experience', 'Users can choose real OAuth or the allowlisted development sandbox from the same integration modal.');

  const sandboxButton = page.getByRole('button', { name: 'Connect sandbox account (dev)', exact: true });
  await expect(sandboxButton).toBeVisible();
  await seedScenario(fixture.companyId, 'backfilling');
  await page.route('**/api/integrations/meta/connect-sandbox', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      integrationId: 'int-meta',
      accountName: 'Northstar Commerce · Meta Ads',
      sandboxMode: true,
      connectedAt: new Date().toISOString(),
      lastSynced: null,
    }),
  }));
  await sandboxButton.click();
  await expect(page.getByText('backfilling', { exact: true })).toBeVisible();
  await showScene(page, 'Durable 90-day backfill', 'Connection returns immediately while a durable job prepares the initial history in the background.');
  await page.keyboard.press('Escape');

  await page.goto('/universal?focus=mkt_paid_acquisition');
  const openPaidAcquisition = await ensurePaidAcquisitionCta(page);
  await showScene(page, 'BDT-native entry point', 'Marketing → Paid Acquisition remains a container; the explicit CTA opens its operating workspace.');
  await openPaidAcquisition.click();
  await expect(page.getByText('Paid Acquisition operating brief', { exact: true })).toBeVisible();

  await switchScenario(page, 'no-spend', 'Connected, with no spend', 'The account is healthy and current, but the product clearly distinguishes zero delivery from a broken connection.');
  await expect(page.getByText(/reported no spend/i)).toBeVisible();

  await switchScenario(page, 'missing-conversion', 'Conversion event needs configuration', 'Spend exists, but CPA and selected conversions remain intentionally unscored until the user chooses the event.');
  await expect(page.getByText('Choose the conversion Meta should optimize around', { exact: true })).toBeVisible();

  await openBdtLeaf(page, 'Ad Performance health', 'Meta Ads · Ad Performance');
  await showScene(page, 'Focused Ad Performance workspace', 'The shared conversion event, ROAS, CPA, and selected conversions all use the same stored operating brief.');

  const eventSelect = page.getByLabel(/Shared conversion event/i);
  await eventSelect.selectOption('lead');
  await expect(eventSelect).toBeDisabled();
  await expect(eventSelect).toBeEnabled({ timeout: 90_000 });
  await expect(eventSelect).toHaveValue('lead');
  await showScene(page, 'Conversion semantics selected', 'Historical CPA and conversion counts are recalculated from retained raw Meta action values—without refetching Meta.');

  const roasCard = page.getByText('ROAS', { exact: true }).locator('..');
  await roasCard.getByRole('button', { name: 'Configure', exact: true }).click();
  await roasCard.getByLabel('Target', { exact: true }).fill('4.5');
  await roasCard.getByLabel('Core weight', { exact: true }).fill('1');
  const ownerSelect = roasCard.locator('select');
  await expect.poll(() => ownerSelect.locator('option').count()).toBeGreaterThan(1);
  await ownerSelect.selectOption({ index: 1 });
  await roasCard.getByLabel(goalTitle, { exact: true }).check();
  await showScene(page, 'Goal and owner alignment', 'A metric administrator sets the target, owner, strategic weight, and linked BDT goal in one place.');
  await roasCard.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(roasCard.getByRole('button', { name: 'Reconfigure', exact: true })).toBeVisible({ timeout: 60_000 });

  await openHub(page);
  await expect(page.getByText('No performance decisions or operational alerts are waiting.')).toBeVisible();
  await showScene(page, 'Healthy operating brief', 'Five KPIs, reproducible status, and a calm “no decisions waiting” state keep healthy accounts quiet.');
  await focusText(page, 'Goal alignment');
  await showScene(page, 'Goal alignment in context', 'Current value, target, health, owner, and linked goals are visible beside ad performance.');
  await focusText(page, 'Thirty-day trend');
  await showScene(page, 'Attribution-aware history', 'Thirty complete account days and current-versus-prior seven-day comparisons make movement visible.');
  await focusText(page, 'Campaigns');
  await showScene(page, 'Read-only campaign drill-down', 'Campaign state, spend, ROAS, conversions, trend, and safe Ads Manager links—without mutation controls.');

  await openConnectedMetaIntegration(page);
  await showScene(page, 'Connected integration health', 'The modal shows data-through date, account timezone, durable refresh status, metrics, campaigns, and Ads Manager navigation.');
  await page.keyboard.press('Escape');
  }
  if (INTRO_ONLY) return;

  if (!RECOVERY_ONLY) {
  await switchScenario(page, 'deteriorating', 'Material deterioration detected', 'Two consecutive deterministic evaluations activate ROAS, CPA, CTR, and campaign-efficiency findings with exact evidence.');
  await expect(page.getByText('Return on ad spend has deteriorated')).toBeVisible();
  await focusText(page, 'Decision workflow');

  await page.goto('/overview');
  const attentionButton = page.getByRole('button', { name: 'Review in Paid Acquisition', exact: true });
  await expect(attentionButton).toBeVisible();
  await showScene(page, 'Urgent attention on Company Overview', 'Only unresolved warning or critical findings consume Overview space. Evidence and data age are visible immediately.');
  await attentionButton.click();
  await expect(page.getByText('Paid Acquisition operating brief', { exact: true })).toBeVisible();

  await openBdtLeaf(page, 'Spend & Reach health', 'Meta Ads · Spend & Reach');
  await showScene(page, 'Spend & Reach drill-down', 'Spend, impressions, clicks, CTR, CPC, and active campaign coverage share the same cached brief.');
  await openBdtLeaf(page, 'Campaigns health', 'Meta Ads · Campaigns');
  await showScene(page, 'Campaign drill-down', 'A visual spend comparison and per-campaign efficiency details support safe investigation.');

  await switchScenario(page, 'ad-response-decline', 'A specific delivery driver', 'The inbox identifies the exact campaign, audience, ad, and creative behind a material CTR decline, with repetition pressure described conservatively.');
  await expect(page.getByText('Founder video shows response decline under repetition pressure', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start experiment', exact: true }).click();
  const startDrawer = page.getByRole('dialog', { name: 'Meta Ads decision details' });
  await expect(startDrawer.getByText('Immutable recommendation')).toBeVisible();
  await showScene(page, 'Assign one controlled change', 'Owner, due date, expected metric, and unchanged variables are explicit before work starts.');
  await startDrawer.getByRole('button', { name: 'Start experiment', exact: true }).click();
  await expect(page.getByText(/owner Kushagra Founder/i)).toBeVisible();
  const { data: experiment, error: experimentError } = await fixture.admin
    .from('meta_ads_experiments')
    .select('id')
    .eq('company_id', fixture.companyId)
    .eq('status', 'planned')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (experimentError || !experiment) throw new Error(`Failed to locate demo experiment: ${experimentError?.message ?? 'missing experiment'}`);
  await page.getByRole('button', { name: 'Mark applied', exact: true }).click();
  const applyDrawer = page.getByRole('dialog', { name: 'Meta Ads decision details' });
  await applyDrawer.getByPlaceholder('What did you change in Ads Manager?').fill('Rotated one creative and kept the audience, placements, and ad-set budget unchanged.');
  await applyDrawer.getByLabel(/I confirm the prescribed change/i).check();
  await showScene(page, 'Manual execution confirmed', 'WorkOS records what changed, but the actual spend-affecting action remains in Meta Ads Manager.');
  await applyDrawer.getByRole('button', { name: 'Mark applied and begin measurement' }).click();
  await expect(page.getByText(/Measuring/i).first()).toBeVisible();
  await advanceExperiment(experiment.id, 'improved');
  await openHub(page);
  await page.getByRole('button', { name: /Results/ }).click();
  await expect(page.getByText(/CTR changed \+50.0%/i)).toBeVisible();
  await page.getByRole('button', { name: 'View evidence' }).click();
  await expect(page.getByRole('dialog', { name: 'Meta Ads decision details' }).getByText('Frozen 7-day baseline')).toBeVisible();
  await showScene(page, 'Outcome retained', 'After seven complete account-local days, the result is classified from frozen before-and-after evidence and preserved in the audit timeline.');
  await page.getByRole('button', { name: 'Close decision drawer' }).click();
  }
  if (DECISION_ONLY) return;

  await switchScenario(page, 'refreshing', 'Refresh in progress', 'A durable pending/running job is visible while preserved data remains available to the user.');
  await expect(page.getByText(/refresh is running in the background/i)).toBeVisible();
  await switchScenario(page, 'stale', 'Stale cached data', 'After 36 hours, the product warns immediately and keeps the last trustworthy history available.');
  await expect(page.getByText(/Showing cached history/i)).toBeVisible();
  await switchScenario(page, 'failed-sync', 'Repeated refresh failure', 'Three consecutive failures become critical, retain history, and guide the user toward safe recovery.');
  await expect(page.getByText(/latest data refresh failed/i)).toBeVisible();
  await switchScenario(page, 'historical', 'History preserved after disconnect', 'Disconnecting never erases prior evidence. Historical data remains clearly labeled and never refreshes.');
  await expect(page.getByText(/preserved history from a disconnected Meta account/i)).toBeVisible();

  await showScene(
    page,
    'Demo complete',
    'One safe operating loop: monitor and diagnose automatically, execute spend-affecting changes manually, then measure and retain the result.',
    Math.max(READ_MS, 6_000),
  );
});
