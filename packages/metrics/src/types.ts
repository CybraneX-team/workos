/**
 * Canonical metric types — single source of truth shared by backend + frontend.
 * Supersedes the previously-triplicated declarations in the two apps.
 */

export type MetricValueType = 'number' | 'currency' | 'percent' | 'duration' | 'count' | 'ratio';
export type MetricDirection = 'higher_is_better' | 'lower_is_better' | 'target_band';
export type MetricStatus = 'active' | 'draft' | 'archived';
export type MetricSourceType = 'manual' | 'integration';
export type MetricTargetType = 'company' | 'department' | 'bdt_node' | 'goal';
export type MetricLinkRelation = 'owns' | 'measures' | 'drives' | 'health_component';

export interface MetricLink {
  id: string;
  metric_id: string;
  company_id: string;
  target_type: MetricTargetType;
  target_id: string;
  relation: MetricLinkRelation;
  weight: number;
  is_core: boolean;
  created_by: string | null;
  created_at: string;
}

export interface MetricSource {
  id: string;
  metric_id: string;
  company_id: string;
  source_type: MetricSourceType;
  label: string;
  config: Record<string, unknown>;
  confidence: number;
  created_by: string | null;
  created_at: string;
}

export interface MetricValue {
  id: string;
  metric_id: string;
  company_id: string;
  raw_value: number;
  normalized_score: number;
  period_start: string | null;
  period_end: string | null;
  source_type: MetricSourceType;
  source_id: string | null;
  source_confidence: number;
  reason: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface CanonicalMetric {
  id: string;
  company_id: string;
  name: string;
  description: string;
  unit: string;
  value_type: MetricValueType;
  direction: MetricDirection;
  baseline_value: number;
  target_value: number;
  current_value: number | null;
  normalized_score: number | null;
  owner_member_id: string | null;
  cadence: string;
  status: MetricStatus;
  source_confidence: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  links: MetricLink[];
  sources: MetricSource[];
  values?: MetricValue[];
}

export interface MetricRollup {
  id: string;
  company_id: string;
  target_type: MetricTargetType;
  target_id: string;
  health_score: number;
  metric_count: number;
  source_confidence: number;
  calculated_at: string;
}

export interface CreateMetricInput {
  name: string;
  description: string;
  unit: string;
  value_type: MetricValueType;
  direction: MetricDirection;
  baseline_value: number;
  target_value: number;
  current_value?: number;
  owner_member_id: string;
  cadence: string;
  source_type: 'manual';
  source_label?: string;
  source_confidence: number;
  links: Array<{
    target_type: MetricTargetType;
    target_id: string;
    relation: MetricLinkRelation;
    weight: number;
    is_core: boolean;
  }>;
}

export type MetricDraftField =
  | 'name'
  | 'description'
  | 'unit'
  | 'value_type'
  | 'direction'
  | 'baseline_value'
  | 'current_value'
  | 'target_value'
  | 'cadence'
  | 'source_type'
  | 'owner_member_id'
  | 'target';

export interface MetricDraftInput {
  name: string;
  description: string;
  unit: string;
  value_type: MetricValueType | null;
  direction: MetricDirection | null;
  baseline_value: number | null;
  target_value: number | null;
  current_value: number | null;
  owner_member_id?: string | null;
  cadence: string;
  source_type: MetricSourceType | null;
  source_label?: string;
  source_confidence: number | null;
  links: Array<{
    target_type: MetricTargetType;
    target_id: string;
    relation: MetricLinkRelation;
    weight: number;
    is_core: boolean;
  }>;
}

export interface MetricDraftResponse {
  draft: MetricDraftInput;
  assumptions: string[];
  warnings: string[];
  missing_fields: MetricDraftField[];
  confidence: number;
  field_states: Array<{
    field: MetricDraftField;
    status: 'inferred' | 'assumed' | 'unresolved';
    message: string;
  }>;
  resolved_target?: {
    target_type: MetricTargetType;
    target_id: string;
    label: string;
    inferred: boolean;
  };
  resolved_owner?: {
    owner_member_id: string;
    label: string;
    inferred: boolean;
  };
}
