import type {
  MetaAdsDiagnostic,
  MetaAdsExperimentConfidence,
  MetaAdsFindingScope,
  MetaAdsFindingSeverity,
  MetaAdsRecommendation,
} from '@cybranex/shared-types';

export interface FindingWindow {
  start: string | null;
  end: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  purchaseRoas: number;
  selectedConversions: number;
  cpa: number | null;
  purchaseCount: number;
}

export interface CampaignFindingInput extends FindingWindow {
  campaignId: string;
  campaignName: string;
  spendShare: number;
  accountPurchaseRoas: number;
  accountPurchaseCount: number;
  adsManagerUrl: string;
}

export interface TargetMovementInput {
  metricKey: string;
  label: string;
  unit: string;
  direction: 'higher_is_better' | 'lower_is_better';
  targetValue: number;
  currentValue: number | null;
  previousValue: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  goalId: string | null;
}

export interface FindingCandidate {
  fingerprint: string;
  kind: string;
  severity: MetaAdsFindingSeverity;
  scope: MetaAdsFindingScope;
  scopeId?: string;
  title: string;
  explanation: string;
  periodStart: string | null;
  periodEnd: string | null;
  evidence: Record<string, string | number | boolean | null>;
  estimatedSpendExposure: number;
  actionKind: 'open_goal' | 'configure_conversion' | 'reconnect_meta' | 'open_ads_manager' | 'review_paid_acquisition';
  actionLabel: string;
  actionHref: string;
  immediate?: boolean;
  diagnosis?: MetaAdsDiagnostic;
  recommendation?: MetaAdsRecommendation;
  confidence?: MetaAdsExperimentConfidence;
}

export interface FindingLifecycleState {
  active: boolean;
  detectionCount: number;
  clearCount: number;
  resolved: boolean;
}

export function nextFindingLifecycle(
  previous: Pick<FindingLifecycleState, 'active' | 'detectionCount' | 'clearCount'> | null,
  detected: boolean,
  immediate = false,
): FindingLifecycleState {
  if (detected) {
    const detectionCount = previous?.active ? previous.detectionCount : (previous?.detectionCount ?? 0) + 1;
    return { active: Boolean(previous?.active) || immediate || detectionCount >= 2, detectionCount, clearCount: 0, resolved: false };
  }
  const clearCount = (previous?.clearCount ?? 0) + 1;
  const resolved = immediate || clearCount >= 2;
  return { active: resolved ? false : Boolean(previous?.active), detectionCount: resolved ? 0 : previous?.detectionCount ?? 0, clearCount, resolved };
}

export function percentageChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function declineSeverity(change: number): MetaAdsFindingSeverity {
  return change <= -40 ? 'critical' : 'warning';
}

function increaseSeverity(change: number): MetaAdsFindingSeverity {
  return change >= 40 ? 'critical' : 'warning';
}

export function evaluatePerformanceFindings(input: {
  selectedConversionAction: string | null;
  current: FindingWindow;
  previous: FindingWindow;
  campaigns: CampaignFindingInput[];
  accountAdsManagerUrl: string;
}): FindingCandidate[] {
  const { current, previous } = input;
  const findings: FindingCandidate[] = [];
  const period = { periodStart: current.start, periodEnd: current.end };

  if (!input.selectedConversionAction && current.spend > 0) {
    findings.push({
      fingerprint: 'missing-conversion-configuration', kind: 'missing_conversion_configuration', severity: 'warning',
      scope: 'integration', title: 'Choose the conversion Meta should optimize around',
      explanation: `Meta recorded ${current.spend.toFixed(2)} in spend, but WorkOS cannot calculate selected conversions or CPA until a conversion event is chosen.`,
      ...period, evidence: { spend: current.spend, selectedConversionAction: null }, estimatedSpendExposure: current.spend,
      actionKind: 'configure_conversion', actionLabel: 'Configure conversion event', actionHref: '/twin/data?integration=int-meta',
      immediate: true,
    });
  }

  if (input.selectedConversionAction && current.spend > 0 && current.selectedConversions === 0 && current.clicks >= 20) {
    findings.push({
      fingerprint: 'spend-zero-selected-conversions', kind: 'zero_selected_conversions',
      severity: current.clicks >= 50 ? 'critical' : 'warning', scope: 'account',
      title: 'Paid traffic is not producing the selected conversion',
      explanation: `${current.clicks} clicks generated no ${input.selectedConversionAction} conversions in the latest seven complete days.`,
      ...period, evidence: { spend: current.spend, clicks: current.clicks, selectedConversions: 0, conversionAction: input.selectedConversionAction },
      estimatedSpendExposure: current.spend, actionKind: 'open_ads_manager', actionLabel: 'Inspect in Ads Manager', actionHref: input.accountAdsManagerUrl,
    });
  }

  const roasChange = percentageChange(current.purchaseRoas, previous.purchaseRoas);
  if (roasChange != null && roasChange <= -20 && current.purchaseCount >= 3 && previous.purchaseCount >= 3) {
    findings.push({
      fingerprint: 'account-roas-decline', kind: 'roas_decline', severity: declineSeverity(roasChange), scope: 'account',
      title: 'Return on ad spend has deteriorated',
      explanation: `Purchase ROAS fell ${Math.abs(roasChange).toFixed(1)}% versus the preceding seven complete days.`,
      ...period, evidence: { currentRoas: current.purchaseRoas, previousRoas: previous.purchaseRoas, changePct: roasChange, currentPurchases: current.purchaseCount, previousPurchases: previous.purchaseCount },
      estimatedSpendExposure: current.spend, actionKind: 'open_ads_manager', actionLabel: 'Review campaigns', actionHref: input.accountAdsManagerUrl,
    });
  }

  const cpaChange = percentageChange(current.cpa, previous.cpa);
  if (cpaChange != null && cpaChange >= 20 && current.selectedConversions >= 5 && previous.selectedConversions >= 5) {
    findings.push({
      fingerprint: 'account-cpa-increase', kind: 'cpa_increase', severity: increaseSeverity(cpaChange), scope: 'account',
      title: 'Cost per selected conversion has increased',
      explanation: `CPA rose ${cpaChange.toFixed(1)}% versus the preceding seven complete days.`,
      ...period, evidence: { currentCpa: current.cpa, previousCpa: previous.cpa, changePct: cpaChange, currentConversions: current.selectedConversions, previousConversions: previous.selectedConversions },
      estimatedSpendExposure: current.spend, actionKind: 'open_ads_manager', actionLabel: 'Review campaigns', actionHref: input.accountAdsManagerUrl,
    });
  }

  const ctrChange = percentageChange(current.ctr, previous.ctr);
  if (ctrChange != null && ctrChange <= -20 && current.impressions >= 1000 && previous.impressions >= 1000) {
    findings.push({
      fingerprint: 'account-ctr-decline', kind: 'ctr_decline', severity: declineSeverity(ctrChange), scope: 'account',
      title: 'Click-through rate has declined',
      explanation: `CTR fell ${Math.abs(ctrChange).toFixed(1)}% versus the preceding seven complete days.`,
      ...period, evidence: { currentCtr: current.ctr, previousCtr: previous.ctr, changePct: ctrChange, currentImpressions: current.impressions, previousImpressions: previous.impressions },
      estimatedSpendExposure: current.spend, actionKind: 'open_ads_manager', actionLabel: 'Inspect creative delivery', actionHref: input.accountAdsManagerUrl,
    });
  }

  for (const campaign of input.campaigns) {
    if (campaign.spendShare < 0.2 || campaign.accountPurchaseRoas <= 0 || campaign.purchaseCount < 3 || campaign.accountPurchaseCount < 3) continue;
    const gap = percentageChange(campaign.purchaseRoas, campaign.accountPurchaseRoas);
    if (gap == null || gap > -25) continue;
    let accountId = '';
    try {
      const act = new URL(input.accountAdsManagerUrl).searchParams.get('act');
      accountId = act ? `act_${act}` : '';
    } catch {
      accountId = '';
    }
    const evidence = { campaignSpend: campaign.spend, spendSharePct: Math.round(campaign.spendShare * 1000) / 10, campaignRoas: campaign.purchaseRoas, accountRoas: campaign.accountPurchaseRoas, gapPct: gap };
    const level: MetaAdsExperimentConfidence = campaign.spendShare >= 0.4 && gap <= -40 ? 'high' : 'medium';
    const explanation = `The campaign owns ${(campaign.spendShare * 100).toFixed(1)}% of spend and trails account ROAS by ${Math.abs(gap).toFixed(1)}%.`;
    findings.push({
      fingerprint: `campaign-underperformance:${campaign.campaignId}`, kind: 'campaign_underperformance', severity: gap <= -40 ? 'critical' : 'warning', scope: 'campaign', scopeId: campaign.campaignId,
      title: `${campaign.campaignName} is absorbing spend below account efficiency`,
      explanation,
      periodStart: campaign.start, periodEnd: campaign.end,
      evidence,
      estimatedSpendExposure: campaign.spend, actionKind: 'open_ads_manager', actionLabel: 'Open campaign', actionHref: campaign.adsManagerUrl,
      confidence: level,
      diagnosis: {
        kind: 'campaign_efficiency_concentration', summary: explanation,
        likelyDriver: 'A material share of account spend is concentrated in this below-account campaign.', confidence: level,
        affectedObject: { scope: 'campaign', id: campaign.campaignId, name: campaign.campaignName, campaignId: campaign.campaignId, campaignName: campaign.campaignName },
        evidence,
      },
      recommendation: accountId ? {
        kind: 'rebalance_campaign',
        hypothesis: 'Reducing this campaign’s allocation while keeping total account budget stable should improve account purchase ROAS.',
        change: `Reduce ${campaign.campaignName} allocation and reallocate within the existing account budget.`,
        keepConstant: ['Total account budget', 'Conversion event', 'Measurement window'],
        primaryMetric: 'purchase_roas', primaryDirection: 'higher', guardrailMetric: 'purchase_count',
        measurementScope: 'account', measurementScopeId: accountId, measurementScopeName: 'Meta ad account', adsManagerUrl: campaign.adsManagerUrl,
      } : undefined,
    });
  }

  return findings;
}

function targetGap(value: number, target: number, direction: TargetMovementInput['direction']): number {
  return direction === 'higher_is_better'
    ? Math.max(0, target - value)
    : Math.max(0, value - target);
}

/**
 * Target gaps are normally status-only. A finding is raised only when a full
 * 30-day window moved at least 20% of the configured target farther away than
 * the preceding 30-day window. This keeps static misses out of the daily brief.
 */
export function evaluateTargetMovementFindings(inputs: TargetMovementInput[]): FindingCandidate[] {
  return inputs.flatMap((input) => {
    if (input.currentValue == null || input.previousValue == null || !Number.isFinite(input.targetValue) || input.targetValue === 0) return [];
    const previousGap = targetGap(input.previousValue, input.targetValue, input.direction);
    const currentGap = targetGap(input.currentValue, input.targetValue, input.direction);
    const wideningPctOfTarget = ((currentGap - previousGap) / Math.abs(input.targetValue)) * 100;
    if (currentGap <= 0 || wideningPctOfTarget < 20) return [];

    const roundedWidening = Math.round(wideningPctOfTarget * 10) / 10;
    const hasGoal = Boolean(input.goalId);
    return [{
      fingerprint: `target-gap-widening:${input.metricKey}`,
      kind: 'target_gap_widening',
      severity: wideningPctOfTarget >= 40 ? 'critical' : 'warning',
      scope: 'account',
      title: `${input.label} is moving farther from target`,
      explanation: `The 30-day gap widened by ${roundedWidening.toFixed(1)}% of the configured target versus the preceding 30 days.`,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      evidence: {
        metricKey: input.metricKey,
        currentValue: input.currentValue,
        previousValue: input.previousValue,
        targetValue: input.targetValue,
        previousGap: Math.round(previousGap * 100) / 100,
        currentGap: Math.round(currentGap * 100) / 100,
        wideningPctOfTarget: roundedWidening,
        unit: input.unit,
      },
      estimatedSpendExposure: 0,
      actionKind: hasGoal ? 'open_goal' : 'review_paid_acquisition',
      actionLabel: hasGoal ? 'Open linked goal' : 'Review target alignment',
      actionHref: hasGoal
        ? `/twin/strategy?goal=${encodeURIComponent(input.goalId!)}`
        : '/universal?focus=mkt_paid_acquisition',
    }];
  });
}

export function syncFailureFinding(consecutiveFailures: number): FindingCandidate | null {
  if (consecutiveFailures < 1) return null;
  return {
    fingerprint: 'sync-failure', kind: 'sync_failure', severity: consecutiveFailures >= 3 ? 'critical' : 'warning', scope: 'integration',
    title: 'Meta Ads data refresh is failing',
    explanation: `${consecutiveFailures} consecutive refresh ${consecutiveFailures === 1 ? 'attempt has' : 'attempts have'} failed. Cached history is still available.`,
    periodStart: null, periodEnd: null, evidence: { consecutiveFailures }, estimatedSpendExposure: 0,
    actionKind: 'reconnect_meta', actionLabel: 'Reconnect Meta', actionHref: '/twin/data?integration=int-meta', immediate: true,
  };
}

export function staleDataFinding(dataAgeHours: number): FindingCandidate | null {
  if (dataAgeHours < 36) return null;
  return {
    fingerprint: 'stale-data', kind: 'stale_data', severity: dataAgeHours >= 72 ? 'critical' : 'warning', scope: 'integration',
    title: 'Meta Ads data is stale', explanation: `The latest successful snapshot is ${Math.floor(dataAgeHours)} hours old.`,
    periodStart: null, periodEnd: null, evidence: { dataAgeHours: Math.round(dataAgeHours * 10) / 10 }, estimatedSpendExposure: 0,
    actionKind: 'review_paid_acquisition', actionLabel: 'Review refresh status', actionHref: '/universal?focus=mkt_paid_acquisition', immediate: true,
  };
}
