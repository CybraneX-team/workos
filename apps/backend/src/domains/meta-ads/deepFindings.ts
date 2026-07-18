import type { MetaAdsDiagnostic, MetaAdsRecommendation } from '@cybranex/shared-types';
import { percentageChange, type FindingCandidate } from './findings.js';

export interface DeepWindow {
  start: string;
  end: string;
  level: 'adset' | 'ad';
  entityId: string;
  entityName: string;
  campaignId: string;
  campaignName: string;
  adsetId: string | null;
  adsetName: string | null;
  creativeId: string | null;
  creativeName: string | null;
  creativeFormat: string | null;
  thumbnailUrl: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach: number;
  frequency: number;
  outboundClicks: number;
  landingPageViews: number;
  purchaseRoas: number;
  purchaseCount: number;
  selectedConversions: number;
  cpa: number | null;
  parentSpend: number;
  parentCpa: number | null;
  adsManagerUrl: string;
  measurementScopeId: string;
  measurementScopeName: string;
}

export interface DeepComparison {
  current: DeepWindow;
  previous: DeepWindow | null;
}

function confidence(current: DeepWindow, changeMagnitude: number, volumeMetric: 'impressions' | 'conversions') {
  const doubledVolume = volumeMetric === 'impressions' ? current.impressions >= 4_000 : current.selectedConversions >= 10;
  return doubledVolume && Math.abs(changeMagnitude) >= 40 ? 'high' as const : 'medium' as const;
}

function diagnostic(input: DeepWindow, kind: string, summary: string, likelyDriver: string, evidence: Record<string, string | number | boolean | null>, level: 'medium' | 'high'): MetaAdsDiagnostic {
  return {
    kind,
    summary,
    likelyDriver,
    confidence: level,
    affectedObject: {
      scope: input.level,
      id: input.entityId,
      name: input.entityName,
      campaignId: input.campaignId,
      campaignName: input.campaignName,
      adsetId: input.adsetId,
      adsetName: input.adsetName,
      creativeId: input.creativeId,
      creativeName: input.creativeName,
      creativeFormat: input.creativeFormat,
      thumbnailUrl: input.thumbnailUrl,
    },
    evidence,
  };
}

function rotateRecommendation(input: DeepWindow): MetaAdsRecommendation {
  return {
    kind: 'rotate_creative',
    hypothesis: `Refreshing ${input.entityName} should recover response at the parent ad-set level.`,
    change: `Rotate one creative for ${input.entityName}.`,
    keepConstant: ['Ad-set audience', 'Placements', 'Ad-set budget'],
    primaryMetric: 'ctr',
    primaryDirection: 'higher',
    guardrailMetric: 'cpc',
    measurementScope: 'adset',
    measurementScopeId: input.measurementScopeId,
    measurementScopeName: input.measurementScopeName,
    adsManagerUrl: input.adsManagerUrl,
  };
}

function conversionRecommendation(input: DeepWindow): MetaAdsRecommendation {
  return {
    kind: 'replace_conversion_outlier',
    hypothesis: `Removing the conversion outlier should lower CPA for ${input.measurementScopeName}.`,
    change: `Pause or replace ${input.entityName}.`,
    keepConstant: ['Ad-set audience', 'Placements', 'Ad-set budget'],
    primaryMetric: 'cpa',
    primaryDirection: 'lower',
    guardrailMetric: 'selected_conversions',
    measurementScope: 'adset',
    measurementScopeId: input.measurementScopeId,
    measurementScopeName: input.measurementScopeName,
    adsManagerUrl: input.adsManagerUrl,
  };
}

export function evaluateDeepPerformanceFindings(input: {
  comparisons: DeepComparison[];
  selectedConversionAction: string | null;
}): FindingCandidate[] {
  const findings: FindingCandidate[] = [];
  for (const { current, previous } of input.comparisons) {
    if (current.level !== 'ad' || !previous) continue;
    const spendShare = current.parentSpend > 0 ? current.spend / current.parentSpend : 0;
    const ctrChange = percentageChange(current.ctr, previous.ctr);

    if (current.impressions >= 2_000 && previous.impressions >= 2_000 && spendShare >= 0.10 && ctrChange != null && ctrChange <= -20) {
      const frequencyChange = percentageChange(current.frequency, previous.frequency);
      const repetitionPressure = current.frequency >= 2.5 && frequencyChange != null && frequencyChange >= 20;
      const evidence = {
        currentCtr: current.ctr,
        previousCtr: previous.ctr,
        ctrChangePct: ctrChange,
        currentFrequency: current.frequency,
        previousFrequency: previous.frequency,
        frequencyChangePct: frequencyChange,
        impressions: current.impressions,
        parentSpendSharePct: Math.round(spendShare * 1000) / 10,
        repetitionPressure,
      };
      const level = confidence(current, ctrChange, 'impressions');
      const title = repetitionPressure ? `${current.entityName} shows response decline under repetition pressure` : `${current.entityName} is losing response`;
      const explanation = repetitionPressure
        ? `CTR fell ${Math.abs(ctrChange).toFixed(1)}% while frequency rose to ${current.frequency.toFixed(2)}. This suggests repetition pressure; it does not prove creative fatigue.`
        : `CTR fell ${Math.abs(ctrChange).toFixed(1)}% across two complete seven-day windows.`;
      findings.push({
        fingerprint: `ad-response-decline:${current.entityId}`,
        kind: 'ad_response_decline',
        severity: ctrChange <= -40 ? 'critical' : 'warning',
        scope: 'ad',
        scopeId: current.entityId,
        title,
        explanation,
        periodStart: current.start,
        periodEnd: current.end,
        evidence,
        estimatedSpendExposure: current.spend,
        actionKind: 'open_ads_manager',
        actionLabel: 'Open ad in Ads Manager',
        actionHref: current.adsManagerUrl,
        confidence: level,
        diagnosis: diagnostic(current, 'ad_response_decline', explanation, repetitionPressure ? 'Repeated delivery is the strongest observed signal.' : 'The ad is the strongest observed response driver.', evidence, level),
        recommendation: rotateRecommendation(current),
      });
    }

    if (input.selectedConversionAction && spendShare >= 0.15) {
      const zeroConversion = current.clicks >= 20 && current.selectedConversions === 0;
      const cpaGap = percentageChange(current.cpa, current.parentCpa);
      const inefficient = current.selectedConversions >= 5 && current.parentCpa != null && cpaGap != null && cpaGap >= 25;
      if (zeroConversion || inefficient) {
        const magnitude = zeroConversion ? 100 : cpaGap!;
        const evidence = {
          conversionAction: input.selectedConversionAction,
          clicks: current.clicks,
          selectedConversions: current.selectedConversions,
          adCpa: current.cpa,
          parentCpa: current.parentCpa,
          cpaGapPct: cpaGap,
          parentSpendSharePct: Math.round(spendShare * 1000) / 10,
        };
        const level = confidence(current, magnitude, 'conversions');
        const explanation = zeroConversion
          ? `${current.clicks} clicks produced no ${input.selectedConversionAction} conversions while this ad owned ${(spendShare * 100).toFixed(1)}% of ad-set spend.`
          : `CPA is ${cpaGap!.toFixed(1)}% worse than the parent ad set with sufficient conversion volume.`;
        findings.push({
          fingerprint: `ad-conversion-outlier:${current.entityId}`,
          kind: 'ad_conversion_outlier',
          severity: (zeroConversion && current.clicks >= 50) || magnitude >= 40 ? 'critical' : 'warning',
          scope: 'ad',
          scopeId: current.entityId,
          title: `${current.entityName} is a conversion-efficiency outlier`,
          explanation,
          periodStart: current.start,
          periodEnd: current.end,
          evidence,
          estimatedSpendExposure: current.spend,
          actionKind: 'open_ads_manager',
          actionLabel: 'Open ad in Ads Manager',
          actionHref: current.adsManagerUrl,
          confidence: level,
          diagnosis: diagnostic(current, 'ad_conversion_outlier', explanation, 'This ad contributes disproportionate spend at weaker conversion efficiency.', evidence, level),
          recommendation: conversionRecommendation(current),
        });
      }
    }
  }
  return findings;
}

export function evaluateDeepDiagnostics(input: { comparisons: DeepComparison[] }): FindingCandidate[] {
  const findings: FindingCandidate[] = [];
  for (const { current, previous } of input.comparisons) {
    if (!previous || current.level !== 'adset') continue;
    const cpmChange = percentageChange(current.cpm, previous.cpm);
    if (current.impressions >= 10_000 && previous.impressions >= 10_000 && cpmChange != null && cpmChange >= 25) {
      findings.push({
        fingerprint: `delivery-cost-pressure:${current.entityId}`,
        kind: 'delivery_cost_pressure',
        severity: cpmChange >= 40 ? 'critical' : 'warning',
        scope: 'adset', scopeId: current.entityId,
        title: `${current.entityName} has higher delivery cost`,
        explanation: `CPM increased ${cpmChange.toFixed(1)}% versus the preceding seven days. WorkOS cannot safely identify the auction or placement cause from current evidence.`,
        periodStart: current.start, periodEnd: current.end,
        evidence: { currentCpm: current.cpm, previousCpm: previous.cpm, changePct: cpmChange, currentImpressions: current.impressions, previousImpressions: previous.impressions },
        estimatedSpendExposure: current.spend,
        actionKind: 'open_ads_manager', actionLabel: 'Inspect delivery', actionHref: current.adsManagerUrl,
        confidence: current.impressions >= 20_000 && Math.abs(cpmChange) >= 40 ? 'high' : 'medium',
      });
    }
    const currentRate = current.outboundClicks > 0 ? current.landingPageViews / current.outboundClicks : null;
    const previousRate = previous.outboundClicks > 0 ? previous.landingPageViews / previous.outboundClicks : null;
    const rateChange = percentageChange(currentRate, previousRate);
    if (current.outboundClicks >= 100 && currentRate != null && previousRate != null && currentRate < 0.70 && rateChange != null && rateChange <= -20) {
      findings.push({
        fingerprint: `landing-page-loss:${current.entityId}`,
        kind: 'landing_page_loss', severity: currentRate < 0.50 ? 'critical' : 'warning',
        scope: 'adset', scopeId: current.entityId,
        title: `${current.entityName} is losing traffic before the landing page`,
        explanation: `Only ${(currentRate * 100).toFixed(1)}% of outbound clicks became landing-page views, down ${Math.abs(rateChange).toFixed(1)}%. This may reflect page-load or tracking loss.`,
        periodStart: current.start, periodEnd: current.end,
        evidence: { outboundClicks: current.outboundClicks, landingPageViews: current.landingPageViews, landingPageViewRatePct: Math.round(currentRate * 1000) / 10, previousRatePct: Math.round(previousRate * 1000) / 10, changePct: rateChange },
        estimatedSpendExposure: current.spend,
        actionKind: 'open_ads_manager', actionLabel: 'Inspect destination and tracking', actionHref: current.adsManagerUrl,
        confidence: current.outboundClicks >= 200 && Math.abs(rateChange) >= 40 ? 'high' : 'medium',
      });
    }
  }
  return findings;
}
