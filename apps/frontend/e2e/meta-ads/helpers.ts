import type {
  MetaAdsAuthoringReadiness,
  MetaAdsBrandKit,
  MetaAdsCampaignDraft,
  MetaAdsConnectionState,
  MetaAdsCreativeAsset,
  MetaAdsDecisionInbox,
  MetaAdsExperiment,
  MetaAdsFinding,
  MetaAdsOperatingBrief,
} from '@cybranex/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function seedMinimalPaidAcquisitionBdt(admin: SupabaseClient, companyId: string) {
  const departments = [{
    id: 'dept_marketing', source_key: 'dept_marketing', label: 'Marketing', domain: 'market', cluster: 'Market', color: '#EB5757', score: 72,
    metrics: { performance: 75, efficiency: 68, capacity: 74, alignment: 72, risk: 26 },
    internalNodes: [{
      id: 'mkt_paid_acquisition_e2e', label: 'Paid Acquisition', type: 'branch', score: 72, nodeLevel: 'level1',
      mappedUniversalCategory: 'metrics_health', metadata: { sourceKey: 'mkt_paid_acquisition' },
      children: [
        {
          id: 'mkt_ad_performance_e2e', label: 'Ad Performance', type: 'branch', score: 72, nodeLevel: 'branch',
          metadata: { sourceKey: 'mkt_paid_acquisition_ad_performance' },
          children: [{
            id: 'mkt_ad_performance_health_e2e', label: 'Ad Performance health', type: 'metric', score: 72, nodeLevel: 'action',
            metadata: { sourceKey: 'mkt_paid_acquisition_ad_performance' }, children: [],
          }],
        },
        {
          id: 'mkt_spend_reach_e2e', label: 'Spend & Reach', type: 'branch', score: 72, nodeLevel: 'branch',
          metadata: { sourceKey: 'mkt_paid_acquisition_spend_reach' },
          children: [{
            id: 'mkt_spend_reach_health_e2e', label: 'Spend & Reach health', type: 'metric', score: 72, nodeLevel: 'action',
            metadata: { sourceKey: 'mkt_paid_acquisition_spend_reach' }, children: [],
          }],
        },
        {
          id: 'mkt_campaigns_e2e', label: 'Campaigns', type: 'branch', score: 72, nodeLevel: 'branch',
          metadata: { sourceKey: 'mkt_paid_acquisition_campaigns' },
          children: [{
            id: 'mkt_campaigns_health_e2e', label: 'Campaigns health', type: 'metric', score: 72, nodeLevel: 'action',
            metadata: { sourceKey: 'mkt_paid_acquisition_campaigns' }, children: [],
          }],
        },
      ],
    }],
  }];
  const { error } = await admin.rpc('import_bdt_departments_from_json', {
    p_company_id: companyId,
    p_departments: departments,
    p_selection: { source_keys: ['dept_marketing'], e2e: true },
  });
  if (error) throw new Error(`Failed to seed Paid Acquisition BDT: ${error.message}`);

  const { data: marketing, error: departmentError } = await admin
    .from('departments')
    .select('id')
    .eq('company_id', companyId)
    .eq('source_key', 'dept_marketing')
    .single();
  if (departmentError || !marketing) {
    throw new Error(`Failed to resolve seeded Marketing department: ${departmentError?.message ?? 'not found'}`);
  }

  // The workflow is readable by every Twin reader. The disposable BDT import
  // does not create department grants itself, so explicitly reproduce that
  // access boundary for non-global E2E roles.
  const { error: grantError } = await admin.from('department_role_grants').upsert(
    ['analyst', 'engineer', 'viewer', 'investor'].map((roleId) => ({
      company_id: companyId,
      department_id: marketing.id,
      role_id: roleId,
      read: true,
      write: false,
      delete: false,
      manage: false,
    })),
    { onConflict: 'company_id,department_id,role_id' },
  );
  if (grantError) throw new Error(`Failed to seed Paid Acquisition read grants: ${grantError.message}`);
}

export function metaBriefFixture(state: MetaAdsConnectionState): MetaAdsOperatingBrief {
  const connected = !['disconnected', 'historical'].includes(state);
  const hasData = !['disconnected', 'backfilling'].includes(state);
  const noSpend = state === 'no_spend';
  return {
    connection: {
      connected,
      state,
      accountId: state === 'disconnected' ? null : 'act_e2e_meta',
      accountName: state === 'disconnected' ? null : 'E2E Meta Account',
      currency: hasData ? 'USD' : null,
      timezone: hasData ? 'America/Los_Angeles' : null,
      dataThrough: hasData ? '2026-07-13' : null,
      lastSuccessfulSyncAt: hasData ? '2026-07-14T01:31:00.000Z' : null,
      lastAttemptedAt: '2026-07-14T01:31:00.000Z',
      dataAgeHours: state === 'stale' ? 50 : hasData ? 2 : null,
      error: state === 'failed' ? 'Meta Ads data could not be refreshed.' : null,
      adsManagerUrl: state === 'disconnected' ? null : 'https://www.facebook.com/adsmanager/manage/campaigns?act=e2e_meta',
    },
    summary: {
      periodStart: hasData ? '2026-06-14' : null,
      periodEnd: hasData ? '2026-07-13' : null,
      currency: hasData ? 'USD' : null,
      spend: noSpend || !hasData ? 0 : 12000,
      impressions: noSpend || !hasData ? 0 : 400000,
      clicks: noSpend || !hasData ? 0 : 8000,
      ctr: noSpend || !hasData ? 0 : 2,
      cpc: noSpend || !hasData ? 0 : 1.5,
      purchaseRoas: noSpend || !hasData ? 0 : 3.2,
      selectedConversions: noSpend || !hasData ? 0 : 240,
      cpa: noSpend || !hasData ? null : 50,
      previous: null,
      deltas: { spendPct: null, ctrPct: null, purchaseRoasPct: null, selectedConversionsPct: null, cpaPct: null },
    },
    series: [],
    campaigns: [],
    goalContext: [],
    findings: [],
    topFindings: [],
    selectedConversionAction: state === 'needs_configuration' ? null : 'lead',
    availableConversionActions: hasData ? [{ actionType: 'lead', value: 240 }] : [],
    latestSyncRun: state === 'backfilling' || state === 'refreshing' ? {
      id: 'run-e2e', accountId: 'act_e2e_meta', reason: state === 'backfilling' ? 'initial_backfill' : 'manual', status: 'running',
      requestedAt: '2026-07-14T01:30:00.000Z', startedAt: '2026-07-14T01:30:01.000Z', completedAt: null,
      attempt: 1, maxAttempts: 5, error: null, dataThrough: null,
    } : null,
  };
}

export function metaActionableFindingFixture(): MetaAdsFinding {
  return {
    id: 'finding-actionable-e2e', fingerprint: 'ad-response-decline:ad-e2e', severity: 'warning', scope: 'ad', kind: 'ad_response_decline',
    title: 'Founder video is losing response', explanation: 'CTR fell across two complete seven-day windows.',
    affectedPeriod: { start: '2026-07-07', end: '2026-07-13' },
    evidence: { currentCtr: 1.5, previousCtr: 2.5, ctrChangePct: -40, parentSpendSharePct: 30 }, estimatedSpendExposure: 2100,
    action: { kind: 'open_ads_manager', label: 'Open ad in Ads Manager', href: 'https://www.facebook.com/adsmanager/manage/campaigns?act=e2e' },
    firstDetectedAt: '2026-07-13T01:30:00.000Z', lastDetectedAt: '2026-07-14T01:30:00.000Z', episode: 1, confidence: 'high', workflowState: 'open',
    diagnosis: {
      kind: 'ad_response_decline', summary: 'CTR fell 40% while frequency rose to 2.80.', likelyDriver: 'Repeated delivery is the strongest observed signal.', confidence: 'high',
      affectedObject: { scope: 'ad', id: 'ad-e2e', name: 'Founder video', campaignId: 'campaign-e2e', campaignName: 'Prospecting', adsetId: 'adset-e2e', adsetName: 'Founder audience', creativeId: 'creative-e2e', creativeName: 'Founder video', creativeFormat: 'VIDEO', thumbnailUrl: null },
      evidence: { currentCtr: 1.5, previousCtr: 2.5 },
    },
    recommendation: {
      kind: 'rotate_creative', hypothesis: 'A creative rotation should recover response.', change: 'Rotate one creative for Founder video.',
      keepConstant: ['Ad-set audience', 'Placements', 'Ad-set budget'], primaryMetric: 'ctr', primaryDirection: 'higher', guardrailMetric: 'cpc',
      measurementScope: 'adset', measurementScopeId: 'adset-e2e', measurementScopeName: 'Founder audience',
      adsManagerUrl: 'https://www.facebook.com/adsmanager/manage/campaigns?act=e2e&selected_ad_ids=ad-e2e',
    },
  };
}

export function metaExperimentFixture(status: MetaAdsExperiment['status'] = 'planned', outcome: MetaAdsExperiment['outcome'] = null): MetaAdsExperiment {
  const finding = metaActionableFindingFixture();
  return {
    id: `experiment-${status}-e2e`, findingId: finding.id, findingEpisode: 1, accountId: 'act_e2e_meta', accountName: 'E2E Meta Account', formerAccount: false,
    status, outcome, title: finding.title, hypothesis: finding.recommendation!.hypothesis, recommendedChange: finding.recommendation!.change,
    scope: 'ad', scopeId: 'ad-e2e', scopeName: 'Founder video', measurementScope: 'adset', measurementScopeId: 'adset-e2e', measurementScopeName: 'Founder audience',
    primaryMetric: 'ctr', primaryDirection: 'higher', guardrailMetric: 'cpc', selectedConversionAction: 'lead', recommendation: finding.recommendation!, sourceEvidence: finding.evidence,
    owner: { memberId: '00000000-0000-4000-8000-000000000001', name: 'Founder E2E', missing: false }, dueDate: '2026-07-17', overdue: false,
    createdAt: '2026-07-14T02:00:00.000Z', appliedAt: status === 'measuring' || status === 'completed' ? '2026-07-14T03:00:00.000Z' : null,
    appliedLocalDate: status === 'measuring' || status === 'completed' ? '2026-07-14' : null, implementationNote: status === 'measuring' || status === 'completed' ? 'Rotated one creative.' : null,
    keptBudgetConstant: status === 'measuring' || status === 'completed' ? true : null,
    baseline7: status === 'measuring' || status === 'completed' ? { periodStart: '2026-07-07', periodEnd: '2026-07-13', spend: 700, impressions: 7000, clicks: 140, ctr: 2, cpc: 5, purchaseRoas: 2, purchaseCount: 21, selectedConversions: 70, cpa: 10 } : null,
    baseline14: null, evaluationStart: status === 'measuring' || status === 'completed' ? '2026-07-15' : null,
    evaluationDue7: status === 'measuring' || status === 'completed' ? '2026-07-21' : null, evaluationDue14: status === 'measuring' || status === 'completed' ? '2026-07-28' : null,
    measurementProgress: status === 'measuring' ? { completeDays: 4, targetDays: 7 } : null, evaluationDays: status === 'measuring' || status === 'completed' ? 7 : null,
    resultMetrics: status === 'completed' ? { periodStart: '2026-07-15', periodEnd: '2026-07-21', spend: 700, impressions: 7000, clicks: 210, ctr: 3, cpc: 3.33, purchaseRoas: 2, purchaseCount: 21, selectedConversions: 70, cpa: 10 } : null,
    resultExplanation: status === 'completed' ? 'CTR changed +50.0% over the controlled comparison.' : null, confidence: status === 'completed' ? 'high' : null,
    completedAt: status === 'completed' ? '2026-07-22T01:30:00.000Z' : null, cancelledAt: status === 'cancelled' ? '2026-07-15T01:00:00.000Z' : null,
    cancelReason: status === 'cancelled' ? 'priorities_changed' : null, adsManagerUrl: finding.recommendation!.adsManagerUrl,
    events: [{ id: 'event-start-e2e', type: 'started', actorName: 'Founder E2E', payload: {}, createdAt: '2026-07-14T02:00:00.000Z' }],
  };
}

export function metaDecisionInboxFixture(input: Partial<MetaAdsDecisionInbox> = {}): MetaAdsDecisionInbox {
  return {
    generatedAt: '2026-07-14T02:00:00.000Z', accountId: 'act_e2e_meta', accountName: 'E2E Meta Account', timezone: 'America/Los_Angeles', dataThrough: '2026-07-13',
    coverage: 'current', coverageWarnings: [], counts: { open: 0, planned: 0, measuring: 0, overdue: 0, completed: 0 },
    findings: [], activeExperiments: [], recentResults: [], deliveryDrivers: [],
    ...input,
  };
}

export function metaAuthoringReadinessFixture(): MetaAdsAuthoringReadiness {
  return {
    mode: 'sandbox_only', connected: true, permitted: true, launchEnabled: true,
    accountId: 'act_e2e_meta', accountName: 'E2E Meta Sandbox', currency: 'USD', timezone: 'America/Los_Angeles',
    sandbox: true, tokenExpiresAt: '2026-08-14T00:00:00.000Z', accountStatus: 1,
    pages: [{ pageId: 'page-e2e', pageName: 'E2E Page', instagramActorId: 'ig-e2e', instagramUsername: 'e2e_brand' }],
    maxLifetimeBudgetMinor: 100_000, blockers: [], warnings: [],
  };
}

export function metaBrandKitFixture(): MetaAdsBrandKit {
  return {
    businessName: 'E2E Brand', brandVoice: 'Clear and direct', valueProposition: 'Controlled paid acquisition',
    targetAudience: 'Small business operators', primaryColor: '#6750ff', secondaryColor: '#111827', logoAssetId: null,
    requiredPhrases: [], prohibitedPhrases: ['guaranteed results'], updatedAt: '2026-07-14T02:00:00.000Z',
  };
}

export function metaCreativeAssetFixture(): MetaAdsCreativeAsset {
  return {
    id: '00000000-0000-4000-8000-000000000101', source: 'gemini', fileName: 'control-1x1.png', mimeType: 'image/png',
    byteSize: 1024, width: 1024, height: 1024, aspectRatio: '1:1', signedUrl: 'data:image/png;base64,iVBORw0KGgo=',
    prompt: 'Fixture prompt', model: 'fixture-model', createdAt: '2026-07-14T02:00:00.000Z',
  };
}

export function metaCampaignDraftFixture(status: MetaAdsCampaignDraft['status'] = 'submitted'): MetaAdsCampaignDraft {
  const asset = metaCreativeAssetFixture();
  return {
    id: '00000000-0000-4000-8000-000000000201', accountId: 'act_e2e_meta', status, version: 4,
    content: {
      name: 'Qualified website visits',
      brief: {
        goal: 'Drive qualified visits', offer: 'A controlled operating workspace', proofPoints: ['Paused-first publication'],
        targetCustomer: 'Small business operators', landingPageUrl: 'https://example.com/offer', callToAction: 'LEARN_MORE', regulatedCategory: 'none',
      },
      identity: { pageId: 'page-e2e', pageName: 'E2E Page', instagramActorId: 'ig-e2e', instagramUsername: 'e2e_brand' },
      audience: { countries: ['US'], ageMin: 21, ageMax: 65, languageIds: [1001] },
      lifetimeBudgetMinor: 5_000, startTime: '2026-07-20T17:00:00.000Z', endTime: '2026-07-27T17:00:00.000Z',
      specialAdCategories: [], dsaBeneficiary: '', dsaPayor: '', productContext: null,
      concepts: [{
        id: '00000000-0000-4000-8000-000000000301', name: 'Operator control', rationale: 'Lead with control and review.',
        primaryText: 'Plan a campaign, review every detail, then publish it paused.', headline: 'Paid acquisition with control',
        description: 'Review before launch.', callToAction: 'LEARN_MORE', assetIds: { '1:1': asset.id },
      }],
      ads: [{
        id: '00000000-0000-4000-8000-000000000401', conceptId: '00000000-0000-4000-8000-000000000301',
        assetId: asset.id, name: 'Operator control', primaryText: 'Plan a campaign, review every detail, then publish it paused.',
        headline: 'Paid acquisition with control', description: 'Review before launch.', callToAction: 'LEARN_MORE',
      }],
    },
    preflight: { checkedAt: '2026-07-14T02:00:00.000Z', ready: true, snapshotHash: 'fixture-snapshot-hash', issues: [] },
    approvals: status === 'published_paused' ? [{
      id: '00000000-0000-4000-8000-000000000501', kind: 'publish', approvedBy: '00000000-0000-4000-8000-000000000001',
      approvedByName: 'Founder E2E', version: 4, snapshotHash: 'fixture-snapshot-hash', note: 'Reviewed', approvedAt: '2026-07-14T02:10:00.000Z',
    }] : [],
    latestJob: null,
    metaObjects: {
      campaignId: status === 'published_paused' ? 'campaign-e2e-published' : null,
      adsetId: status === 'published_paused' ? 'adset-e2e-published' : null,
      creativeIds: status === 'published_paused' ? ['creative-e2e-published'] : [],
      adIds: status === 'published_paused' ? ['ad-e2e-published'] : [],
    },
    createdBy: '00000000-0000-4000-8000-000000000001', createdAt: '2026-07-14T01:00:00.000Z', updatedAt: '2026-07-14T02:00:00.000Z',
    events: [{ id: 'event-draft-e2e', type: 'submitted_for_publish_approval', actorName: 'Founder E2E', payload: {}, createdAt: '2026-07-14T02:00:00.000Z' }],
  };
}
