import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createMetaInsightsReport,
  downloadMetaInsightsReport,
  fetchMetaAdMetadata,
  parseMetaActionMap,
} from '../src/adapters/metaAds.js';
import { aggregateMetaDailyRows } from '../src/domains/meta-ads/service.js';
import { evaluateDeepDiagnostics, evaluateDeepPerformanceFindings, type DeepWindow } from '../src/domains/meta-ads/deepFindings.js';
import { classifyMetaAdsExperimentOutcome, hasMetaAdsExperimentVolume } from '../src/domains/meta-ads/decisionInbox.js';
import {
  evaluatePerformanceFindings,
  evaluateTargetMovementFindings,
  nextFindingLifecycle,
  percentageChange,
} from '../src/domains/meta-ads/findings.js';
import {
  evaluateMetaAdsCampaignDraft,
  isMetaAuthoringAccountPermitted,
  metaAdsDraftSnapshotHash,
} from '../src/domains/meta-ads/authoring.js';
import {
  metaSingleImageCreativePayload,
  metaTrafficAdSetPayload,
  metaTrafficCampaignPayload,
} from '../src/adapters/metaAdsAuthoring.js';
import { closestAspectRatio, imageDimensions } from '../src/domains/meta-ads/creativeGeneration.js';
import type { MetaAdsBrandKit, MetaAdsCampaignDraftContent, MetaAdsAuthoringReadiness } from '@cybranex/shared-types';

const window = (overrides = {}) => ({
  start: '2026-07-01',
  end: '2026-07-07',
  spend: 1000,
  impressions: 10000,
  clicks: 200,
  ctr: 2,
  purchaseRoas: 3,
  selectedConversions: 20,
  cpa: 50,
  purchaseCount: 10,
  ...overrides,
});

const deepWindow = (overrides: Partial<DeepWindow> = {}): DeepWindow => ({
  start: '2026-07-01', end: '2026-07-07', level: 'ad', entityId: 'ad-1', entityName: 'Founder video',
  campaignId: 'campaign-1', campaignName: 'Prospecting', adsetId: 'adset-1', adsetName: 'Founder audience',
  creativeId: 'creative-1', creativeName: 'Founder video', creativeFormat: 'VIDEO', thumbnailUrl: 'https://example.test/thumb.jpg',
  spend: 250, impressions: 4_000, clicks: 80, ctr: 2, cpc: 3.13, cpm: 62.5, reach: 3_000, frequency: 2,
  outboundClicks: 70, landingPageViews: 60, purchaseRoas: 2, purchaseCount: 5, selectedConversions: 10, cpa: 25,
  parentSpend: 1_000, parentCpa: 20, adsManagerUrl: 'https://www.facebook.com/adsmanager/manage/campaigns?act=1&selected_ad_ids=ad-1',
  measurementScopeId: 'adset-1', measurementScopeName: 'Founder audience',
  ...overrides,
});

const experimentMetrics = (overrides = {}) => ({
  periodStart: '2026-07-01', periodEnd: '2026-07-07', spend: 1_000, impressions: 10_000, clicks: 200,
  ctr: 2, cpc: 5, purchaseRoas: 2, purchaseCount: 10, selectedConversions: 20, cpa: 50,
  ...overrides,
});

test('action parsing accepts Graph arrays and serialized arrays', () => {
  const value = [{ action_type: 'lead', value: '4' }, { action_type: 'purchase', value: '2.5' }];
  assert.deepEqual(parseMetaActionMap(value), { lead: 4, purchase: 2.5 });
  assert.deepEqual(parseMetaActionMap(JSON.stringify(value)), { lead: 4, purchase: 2.5 });
  assert.deepEqual(parseMetaActionMap('not-json'), {});
});

test('asynchronous reports honor Meta usage backoff and normalize paginated rows', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  let downloadPage = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: String(init?.method ?? 'GET') });
    if (init?.method === 'POST') {
      return new Response(JSON.stringify({ report_run_id: 'report-e2e' }), {
        status: 200,
        headers: { 'x-business-use-case-usage': JSON.stringify({ act_1: [{ estimated_time_to_regain_access: 42 }] }) },
      });
    }
    downloadPage += 1;
    const row = {
      date_start: `2026-07-0${downloadPage}`, campaign_id: 'campaign-1', campaign_name: 'Prospecting',
      adset_id: 'adset-1', adset_name: 'Audience', ad_id: `ad-${downloadPage}`, ad_name: `Creative ${downloadPage}`,
      spend: '10', impressions: '1000', clicks: '20', ctr: '2', cpc: '0.5', cpm: '10', reach: '800', frequency: '1.25',
      outbound_clicks: [{ action_type: 'outbound_click', value: '18' }],
      actions: [{ action_type: 'landing_page_view', value: '15' }, { action_type: 'lead', value: '3' }],
      purchase_roas: [{ action_type: 'purchase', value: '2' }], action_values: [],
    };
    return new Response(JSON.stringify({ data: [row], paging: downloadPage === 1 ? { next: 'https://graph.facebook.com/next-page' } : {} }), { status: 200 });
  };
  try {
    const report = await createMetaInsightsReport({ accessToken: 'secret', adAccountId: 'act_1', level: 'ad', since: '2026-07-01', until: '2026-07-07', daily: true });
    assert.deepEqual(report, { reportRunId: 'report-e2e', retryAfterSeconds: 42 });
    const rows = await downloadMetaInsightsReport('secret', report.reportRunId, 'ad');
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.outboundClicks, 18);
    assert.equal(rows[0]?.landingPageViews, 15);
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('creative metadata exposes only sanitized HTTPS thumbnails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    'ad-safe': { id: 'ad-safe', name: 'Safe creative', effective_status: 'ACTIVE', campaign_id: 'campaign-1', adset_id: 'adset-1', creative: { id: 'creative-safe', name: 'Safe', object_type: 'VIDEO', thumbnail_url: 'https://cdn.example.com/thumb.jpg?access_token=secret&width=100' } },
    'ad-unsafe': { id: 'ad-unsafe', name: 'Unsafe creative', effective_status: 'ACTIVE', campaign_id: 'campaign-1', adset_id: 'adset-1', creative: { id: 'creative-unsafe', thumbnail_url: 'http://cdn.example.com/thumb.jpg?access_token=secret' } },
  }), { status: 200 });
  try {
    const values = await fetchMetaAdMetadata('secret', ['ad-safe', 'ad-unsafe']);
    assert.equal(values[0]?.thumbnailUrl, 'https://cdn.example.com/thumb.jpg?width=100');
    assert.equal(values[1]?.thumbnailUrl, null);
    assert.doesNotMatch(JSON.stringify(values), /access_token|secret/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily aggregation uses raw selected actions and spend-weighted ROAS', () => {
  const aggregate = aggregateMetaDailyRows([
    { metric_date: '2026-07-01', spend: 100, impressions: 1000, clicks: 20, purchase_roas: 4, actions: { lead: 5, purchase: 2 } },
    { metric_date: '2026-07-02', spend: 300, impressions: 3000, clicks: 30, purchase_roas: 2, actions: { lead: 3, purchase: 1 } },
  ], 'lead');
  assert.equal(aggregate.spend, 400);
  assert.equal(aggregate.impressions, 4000);
  assert.equal(aggregate.clicks, 50);
  assert.equal(aggregate.ctr, 1.25);
  assert.equal(aggregate.purchaseRoas, 2.5);
  assert.equal(aggregate.selectedConversions, 8);
  assert.equal(aggregate.cpa, 50);
  assert.equal(aggregate.purchaseCount, 3);
});

test('comparison percentage is deterministic and guards zero baselines', () => {
  assert.equal(percentageChange(80, 100), -20);
  assert.equal(percentageChange(140, 100), 40);
  assert.equal(percentageChange(1, 0), null);
});

test('zero-conversion finding respects click volume and severity thresholds', () => {
  const base = { selectedConversionAction: 'lead', previous: window(), campaigns: [], accountAdsManagerUrl: 'https://example.test' };
  assert.equal(evaluatePerformanceFindings({ ...base, current: window({ clicks: 19, selectedConversions: 0, cpa: null }) }).length, 0);
  const warning = evaluatePerformanceFindings({ ...base, current: window({ clicks: 20, selectedConversions: 0, cpa: null }) });
  assert.equal(warning[0]?.severity, 'warning');
  const critical = evaluatePerformanceFindings({ ...base, current: window({ clicks: 50, selectedConversions: 0, cpa: null }) });
  assert.equal(critical[0]?.severity, 'critical');
  assert.equal(critical[0]?.title, 'Paid traffic is not producing the selected conversion');
});

test('ROAS, CPA and CTR deterioration apply conservative volume guards', () => {
  const findings = evaluatePerformanceFindings({
    selectedConversionAction: 'lead',
    current: window({ purchaseRoas: 1.8, cpa: 75, ctr: 1.2 }),
    previous: window({ purchaseRoas: 3, cpa: 50, ctr: 2 }),
    campaigns: [],
    accountAdsManagerUrl: 'https://example.test',
  });
  assert.deepEqual(findings.map((finding) => finding.kind).sort(), ['cpa_increase', 'ctr_decline', 'roas_decline']);
  assert.ok(findings.every((finding) => finding.severity === 'critical'));

  const guarded = evaluatePerformanceFindings({
    selectedConversionAction: 'lead',
    current: window({ purchaseRoas: 1, purchaseCount: 2, cpa: 80, selectedConversions: 4, ctr: 1, impressions: 999 }),
    previous: window(),
    campaigns: [],
    accountAdsManagerUrl: 'https://example.test',
  });
  assert.equal(guarded.length, 0);
});

test('campaign finding requires material spend share and ROAS gap', () => {
  const findings = evaluatePerformanceFindings({
    selectedConversionAction: 'lead',
    current: window(),
    previous: window(),
    campaigns: [{
      ...window({ purchaseRoas: 1.5, spend: 300 }),
      campaignId: '123',
      campaignName: 'Prospecting',
      spendShare: 0.3,
      accountPurchaseRoas: 3,
      accountPurchaseCount: 10,
      adsManagerUrl: 'https://example.test/campaign',
    }],
    accountAdsManagerUrl: 'https://example.test',
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.kind, 'campaign_underperformance');
  assert.equal(findings[0]?.severity, 'critical');
  assert.equal(findings[0]?.evidence.spendSharePct, 30);

  const guarded = evaluatePerformanceFindings({
    selectedConversionAction: 'lead', current: window(), previous: window(),
    campaigns: [{
      ...window({ purchaseRoas: 1.5, purchaseCount: 2 }), campaignId: '123', campaignName: 'Prospecting',
      spendShare: 0.3, accountPurchaseRoas: 3, accountPurchaseCount: 10, adsManagerUrl: 'https://example.test/campaign',
    }],
    accountAdsManagerUrl: 'https://example.test',
  });
  assert.equal(guarded.length, 0);
});

test('ad response decline identifies repetition pressure and one controlled recommendation', () => {
  const previous = deepWindow({ start: '2026-06-24', end: '2026-06-30', ctr: 2.5, frequency: 2, spend: 200 });
  const current = deepWindow({ ctr: 1.8, frequency: 2.6, spend: 200, parentSpend: 1_000 });
  const findings = evaluateDeepPerformanceFindings({ comparisons: [{ current, previous }], selectedConversionAction: 'lead' });
  const response = findings.find((finding) => finding.kind === 'ad_response_decline');
  assert.ok(response);
  assert.match(response.explanation, /repetition pressure/i);
  assert.equal(response.recommendation?.kind, 'rotate_creative');
  assert.deepEqual(response.recommendation?.keepConstant, ['Ad-set audience', 'Placements', 'Ad-set budget']);

  const belowSpendShare = evaluateDeepPerformanceFindings({ comparisons: [{ current: { ...current, spend: 99 }, previous }], selectedConversionAction: 'lead' });
  assert.equal(belowSpendShare.some((finding) => finding.kind === 'ad_response_decline'), false);
});

test('conversion outliers use selected conversions and parent efficiency guards', () => {
  const zero = deepWindow({ clicks: 20, selectedConversions: 0, cpa: null, spend: 150, parentSpend: 1_000 });
  const findings = evaluateDeepPerformanceFindings({ comparisons: [{ current: zero, previous: deepWindow() }], selectedConversionAction: 'lead' });
  const outlier = findings.find((finding) => finding.kind === 'ad_conversion_outlier');
  assert.equal(outlier?.recommendation?.kind, 'replace_conversion_outlier');
  assert.equal(outlier?.recommendation?.measurementScope, 'adset');
  assert.equal(evaluateDeepPerformanceFindings({ comparisons: [{ current: zero, previous: deepWindow() }], selectedConversionAction: null }).some((finding) => finding.kind === 'ad_conversion_outlier'), false);
});

test('landing-page loss and delivery-cost pressure remain diagnostics only', () => {
  const previous = deepWindow({ level: 'adset', entityId: 'adset-1', frequency: 1.5, cpm: 20, outboundClicks: 200, landingPageViews: 180, impressions: 20_000 });
  const current = deepWindow({ level: 'adset', entityId: 'adset-1', cpm: 30, outboundClicks: 200, landingPageViews: 100, impressions: 20_000 });
  const findings = evaluateDeepDiagnostics({ comparisons: [{ current, previous }] });
  assert.deepEqual(findings.map((finding) => finding.kind).sort(), ['delivery_cost_pressure', 'landing_page_loss']);
  assert.ok(findings.every((finding) => !finding.recommendation));
});

test('experiment outcomes enforce volume, primary movement, guardrails and confounds', () => {
  const row = { primary_metric: 'ctr', primary_direction: 'higher', guardrail_metric: 'cpc', kept_budget_constant: true };
  assert.equal(hasMetaAdsExperimentVolume('ctr', experimentMetrics({ impressions: 1_999 })), false);
  assert.equal(hasMetaAdsExperimentVolume('ctr', experimentMetrics({ impressions: 2_000 })), true);
  assert.equal(classifyMetaAdsExperimentOutcome(row, experimentMetrics(), experimentMetrics({ ctr: 2.3, cpc: 5.2 })).outcome, 'improved');
  assert.equal(classifyMetaAdsExperimentOutcome(row, experimentMetrics(), experimentMetrics({ ctr: 1.7 })).outcome, 'worsened');
  assert.equal(classifyMetaAdsExperimentOutcome(row, experimentMetrics(), experimentMetrics({ ctr: 2.1 })).outcome, 'no_clear_change');
  assert.equal(classifyMetaAdsExperimentOutcome(row, experimentMetrics(), experimentMetrics({ ctr: 2.3, cpc: 6 })).outcome, 'worsened');
  assert.equal(classifyMetaAdsExperimentOutcome({ ...row, kept_budget_constant: false }, experimentMetrics(), experimentMetrics({ ctr: 2.3 })).outcome, 'inconclusive');
  assert.equal(classifyMetaAdsExperimentOutcome(row, experimentMetrics(), experimentMetrics({ ctr: 2.3, spend: 1_400 })).outcome, 'inconclusive');
});

test('performance lifecycle opens and resolves only after two detections', () => {
  const first = nextFindingLifecycle(null, true);
  assert.equal(first.active, false);
  const second = nextFindingLifecycle(first, true);
  assert.equal(second.active, true);
  const firstClear = nextFindingLifecycle(second, false);
  assert.equal(firstClear.active, true);
  const secondClear = nextFindingLifecycle(firstClear, false);
  assert.equal(secondClear.active, false);
  assert.equal(secondClear.resolved, true);

  assert.equal(nextFindingLifecycle(null, true, true).active, true);
  assert.equal(nextFindingLifecycle({ active: true, detectionCount: 1, clearCount: 0 }, false, true).resolved, true);
});

test('target gaps remain status-only until the 30-day gap widens materially', () => {
  const base = {
    metricKey: 'roas_30d', label: 'Meta ROAS (30d)', unit: 'x', direction: 'higher_is_better' as const,
    targetValue: 4, periodStart: '2026-06-08', periodEnd: '2026-07-07', goalId: 'goal-123',
  };
  assert.equal(evaluateTargetMovementFindings([{ ...base, previousValue: 3, currentValue: 2.5 }]).length, 0);
  const warning = evaluateTargetMovementFindings([{ ...base, previousValue: 3.8, currentValue: 2.8 }]);
  assert.equal(warning[0]?.severity, 'warning');
  assert.equal(warning[0]?.actionKind, 'open_goal');
  assert.equal(warning[0]?.evidence.wideningPctOfTarget, 25);
  const critical = evaluateTargetMovementFindings([{ ...base, previousValue: 4.2, currentValue: 2 }]);
  assert.equal(critical[0]?.severity, 'critical');
});

test('Meta synchronization permits only GET reads and asynchronous Insights report creation', async () => {
  const files = [
    '../src/adapters/metaAds.ts',
    '../src/domains/meta-ads/service.ts',
    '../src/domains/meta-ads/router.ts',
  ];
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const source = sources.join('\n');
  const adapter = sources[0];
  const allowedStart = adapter.indexOf('export async function createMetaInsightsReport');
  const allowedEnd = adapter.indexOf('export async function getMetaInsightsReportStatus');
  assert.ok(allowedStart >= 0 && allowedEnd > allowedStart);
  const allowedReportCreation = adapter.slice(allowedStart, allowedEnd);
  assert.match(allowedReportCreation, /\/insights/);
  assert.match(allowedReportCreation, /async:\s*['"]true['"]/);
  assert.match(allowedReportCreation, /method:\s*['"]POST['"]/);
  const outsideAllowedReportCreation = source.replace(allowedReportCreation, '');
  assert.doesNotMatch(outsideAllowedReportCreation, /method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
  assert.doesNotMatch(source, /graph(?:Post|Put|Delete|Patch)/i);
});

const authoringReadiness = (): MetaAdsAuthoringReadiness => ({
  mode: 'sandbox_only', connected: true, permitted: true, launchEnabled: true,
  accountId: 'act_sandbox', accountName: 'Sandbox', currency: 'USD', timezone: 'UTC', sandbox: true,
  tokenExpiresAt: '2026-09-01T00:00:00.000Z', accountStatus: 1,
  pages: [{ pageId: 'page-1', pageName: 'Example', instagramActorId: null, instagramUsername: null }],
  maxLifetimeBudgetMinor: 100_000, blockers: [], warnings: [],
});

const authoringBrand = (): MetaAdsBrandKit => ({
  businessName: 'Example', brandVoice: 'Clear', valueProposition: 'Useful software', targetAudience: 'Operators',
  primaryColor: null, secondaryColor: null, logoAssetId: null, requiredPhrases: [], prohibitedPhrases: [], updatedAt: null,
});

const authoringContent = (): MetaAdsCampaignDraftContent => ({
  name: 'Website traffic',
  brief: { goal: 'Drive qualified visits', offer: 'See how the product works', proofPoints: ['Transparent setup'], targetCustomer: 'Operations teams', landingPageUrl: 'https://example.com/product', callToAction: 'LEARN_MORE', regulatedCategory: 'none' },
  identity: { pageId: 'page-1', pageName: 'Example', instagramActorId: null, instagramUsername: null },
  audience: { countries: ['US'], ageMin: 18, ageMax: 65, languageIds: [] },
  lifetimeBudgetMinor: 10_000, startTime: '2026-08-01T00:00:00.000Z', endTime: '2026-08-08T00:00:00.000Z',
  specialAdCategories: [], dsaBeneficiary: '', dsaPayor: '', productContext: null, concepts: [],
  ads: [{ id: 'ad-local-1', conceptId: null, assetId: 'asset-1', name: 'Benefit', primaryText: 'See how the product works.', headline: 'A clearer operating view', description: 'Learn more', callToAction: 'LEARN_MORE' }],
});

test('Campaign Studio account gates keep real accounts out of sandbox-only mode', () => {
  assert.equal(isMetaAuthoringAccountPermitted({ mode: 'sandbox_only', sandbox: true, accountId: 'act_1', allowlistedAccountIds: new Set() }), true);
  assert.equal(isMetaAuthoringAccountPermitted({ mode: 'sandbox_only', sandbox: false, accountId: 'act_1', allowlistedAccountIds: new Set() }), false);
  assert.equal(isMetaAuthoringAccountPermitted({ mode: 'allowlisted_real', sandbox: false, accountId: 'act_1', allowlistedAccountIds: new Set() }), false);
  assert.equal(isMetaAuthoringAccountPermitted({ mode: 'allowlisted_real', sandbox: false, accountId: 'act_1', allowlistedAccountIds: new Set(['act_2']) }), false);
  assert.equal(isMetaAuthoringAccountPermitted({ mode: 'allowlisted_real', sandbox: false, accountId: 'act_1', allowlistedAccountIds: new Set(['act_1']) }), true);
});

test('Campaign Studio validates uploaded image bytes and supported aspect ratios', () => {
  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0, 'ascii');
  webp.write('WEBP', 8, 'ascii');
  webp.write('VP8X', 12, 'ascii');
  webp.writeUIntLE(1199, 24, 3);
  webp.writeUIntLE(1499, 27, 3);
  assert.deepEqual(imageDimensions(webp, 'image/webp'), { width: 1200, height: 1500 });
  assert.equal(closestAspectRatio(1200, 1500), '4:5');

  const jpeg = Buffer.alloc(13);
  jpeg.set([0xff, 0xd8, 0xff, 0xc0]);
  jpeg.writeUInt16BE(11, 4);
  jpeg.writeUInt16BE(1080, 7);
  jpeg.writeUInt16BE(1080, 9);
  assert.deepEqual(imageDimensions(jpeg, 'image/jpeg'), { width: 1080, height: 1080 });
  assert.equal(imageDimensions(Buffer.from('not an image'), 'image/png'), null);
});

test('Campaign Studio preflight is reproducible and blocks unsafe scope', () => {
  const content = authoringContent();
  const ready = evaluateMetaAdsCampaignDraft({ content, readiness: authoringReadiness(), brand: authoringBrand(), availableAssetIds: new Set(['asset-1']), now: new Date('2026-07-20T00:00:00.000Z') });
  assert.equal(ready.ready, true);
  assert.equal(ready.snapshotHash, metaAdsDraftSnapshotHash(content));

  const unsafe = evaluateMetaAdsCampaignDraft({
    content: { ...content, brief: { ...content.brief, landingPageUrl: 'http://localhost:3000', regulatedCategory: 'credit' }, specialAdCategories: ['CREDIT'] },
    readiness: authoringReadiness(), brand: authoringBrand(), availableAssetIds: new Set(), now: new Date('2026-07-20T00:00:00.000Z'),
  });
  assert.equal(unsafe.ready, false);
  assert.ok(unsafe.issues.some((value) => value.code === 'landing_page_url_invalid'));
  assert.ok(unsafe.issues.some((value) => value.code === 'special_ad_category_blocked'));
  assert.ok(unsafe.issues.some((value) => value.code === 'regulated_campaign_blocked'));
  assert.ok(unsafe.issues.some((value) => value.code === 'creative_asset_missing'));

  const inferredSpecialCategory = evaluateMetaAdsCampaignDraft({
    content: { ...content, brief: { ...content.brief, offer: 'Apply for our new job opening' } },
    readiness: authoringReadiness(), brand: authoringBrand(), availableAssetIds: new Set(['asset-1']), now: new Date('2026-07-20T00:00:00.000Z'),
  });
  assert.ok(inferredSpecialCategory.issues.some((value) => value.code === 'regulated_campaign_blocked'));

  const tamperedIdentity = evaluateMetaAdsCampaignDraft({
    content: { ...content, identity: { ...content.identity!, instagramActorId: 'ig-not-attached' } },
    readiness: authoringReadiness(), brand: authoringBrand(), availableAssetIds: new Set(['asset-1']), now: new Date('2026-07-20T00:00:00.000Z'),
  });
  assert.ok(tamperedIdentity.issues.some((value) => value.code === 'meta_instagram_identity_invalid'));
});

test('EEA campaigns require DSA payer and beneficiary disclosure', () => {
  const content = authoringContent();
  content.audience.countries = ['DE'];
  const result = evaluateMetaAdsCampaignDraft({ content, readiness: authoringReadiness(), brand: authoringBrand(), availableAssetIds: new Set(['asset-1']), now: new Date('2026-07-20T00:00:00.000Z') });
  assert.equal(result.ready, false);
  assert.ok(result.issues.some((value) => value.code === 'dsa_disclosure_required'));
});

test('Meta writer payloads are traffic-only, lifetime-budgeted, and paused by default', () => {
  assert.deepEqual(metaTrafficCampaignPayload({ name: 'Test' }), {
    name: 'Test', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: '[]',
  });
  const adset = metaTrafficAdSetPayload({
    name: 'Broad', campaignId: 'campaign-1', lifetimeBudgetMinor: 10_000,
    startTime: '2026-08-01T00:00:00.000Z', endTime: '2026-08-08T00:00:00.000Z',
    countries: ['US'], ageMin: 18, ageMax: 65, languageIds: [],
  });
  assert.equal(adset.status, 'PAUSED');
  assert.equal(adset.lifetime_budget, '10000');
  assert.equal(adset.optimization_goal, 'LINK_CLICKS');
  assert.equal(adset.bid_strategy, 'LOWEST_COST_WITHOUT_CAP');
  assert.equal(Object.hasOwn(adset, 'daily_budget'), false);
  const creative = metaSingleImageCreativePayload({
    name: 'Creative', pageId: 'page-1', instagramActorId: null, imageHash: 'hash', link: 'https://example.com',
    primaryText: 'Text', headline: 'Headline', description: 'Description', callToAction: 'LEARN_MORE',
  });
  assert.match(creative.degrees_of_freedom_spec, /OPT_OUT/);
});

test('Meta mutation code is isolated in the private authoring adapter', async () => {
  const reader = await readFile(new URL('../src/adapters/metaAds.ts', import.meta.url), 'utf8');
  const writer = await readFile(new URL('../src/adapters/metaAdsAuthoring.ts', import.meta.url), 'utf8');
  const operatingService = await readFile(new URL('../src/domains/meta-ads/service.ts', import.meta.url), 'utf8');
  assert.match(writer, /createMetaTrafficCampaign/);
  assert.match(writer, /status:\s*['"]PAUSED['"]/);
  assert.doesNotMatch(reader, /createMetaTrafficCampaign|updateMetaObjectStatus/);
  assert.doesNotMatch(operatingService, /metaAdsAuthoring/);
});
