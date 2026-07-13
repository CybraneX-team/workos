export type Locator =
  | { type: 'column'; sheet_name?: string; column_idx: number; column_ref?: string }
  | { type: 'row'; sheet_name?: string; row_idx: number }
  | { type: 'cell'; sheet_name?: string; cell_ref: string; row_idx?: number; column_idx?: number }
  | { type: 'region'; sheet_name?: string; bbox: string }
  | { type: 'axis'; sheet_name?: string; axis: 'rows' | 'columns'; role: string; grain?: string };

export type ExtractionRole =
  | 'metric'
  | 'period'
  | 'unit_label'
  | 'scale_label'
  | 'value_field'
  | 'exclude'
  | 'entity_field';

export type ClassificationStage =
  | 'known_source'
  | 'profile'
  | 'dictionary'
  | 'fuzzy'
  | 'cache'
  | 'llm'
  | 'manual';

export interface ClassificationInput {
  locator: Locator;
  layout_context: Record<string, unknown>;
  label: string | null;
  sample_values: unknown[];
  siblings: string[];
}

export interface ClassificationOutput {
  role: ExtractionRole;
  target_key: string | null;
  confidence: number;
  reasoning?: string;
}
