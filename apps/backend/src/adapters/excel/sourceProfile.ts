import crypto from 'node:crypto';
import { normalizeLabel } from '../classify/dictionary.js';
import type { DetectedRegion } from './regionLayout.js';
import type { MetricObservation } from './metricExtraction.js';

export interface RegionSourceRecipe {
  source: 'reviewed_region_profile';
  layout_type: string;
  label_mappings: Record<string, string>;
}

export function regionProfileSignature(region: DetectedRegion, observations: MetricObservation[]): string {
  const labels = [...new Set(observations.map((o) => normalizeLabel(o.source_label)).filter(Boolean))].sort();
  const payload = [
    'region-profile-v1',
    region.sheet_name.toLowerCase().trim(),
    region.layout.layout_type,
    region.layout.metric_axis ?? '',
    region.layout.period_axis ?? '',
    region.layout.label_column ?? '',
    labels.join('|'),
  ].join('::');
  return `region_profile:${crypto.createHash('sha256').update(payload).digest('hex')}`;
}

export function applyRegionRecipe(
  observations: MetricObservation[],
  recipe: RegionSourceRecipe | null,
): MetricObservation[] {
  if (!recipe?.label_mappings) return observations;
  return observations.map((observation) => {
    const mappedKey = recipe.label_mappings[normalizeLabel(observation.source_label)];
    if (!mappedKey) return observation;
    return {
      ...observation,
      metric_key: mappedKey,
      confidence: 0.99,
      status: 'accepted',
      stage: 'profile',
      reasoning: `Applied reviewed source profile mapping to "${mappedKey}"`,
    };
  });
}

export function mergeLabelMapping(
  recipe: unknown,
  sourceLabel: string,
  metricKey: string,
  layoutType: string,
): RegionSourceRecipe {
  const existing = typeof recipe === 'object' && recipe !== null ? recipe as Partial<RegionSourceRecipe> : {};
  return {
    source: 'reviewed_region_profile',
    layout_type: existing.layout_type ?? layoutType,
    label_mappings: {
      ...(existing.label_mappings ?? {}),
      [normalizeLabel(sourceLabel)]: metricKey,
    },
  };
}
