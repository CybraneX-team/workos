DELETE FROM public.metric_snapshots WHERE integration_id = 'int-meta';

DROP TABLE IF EXISTS public.bdt_goal_metric_links CASCADE;
DROP TABLE IF EXISTS public.bdt_metric_history CASCADE;
DROP TABLE IF EXISTS public.bdt_metric_impacts CASCADE;
DROP TABLE IF EXISTS public.bdt_metrics CASCADE;
DROP TABLE IF EXISTS public.metric_impacts CASCADE;
DROP TABLE IF EXISTS public.metric_templates CASCADE;

DELETE FROM public.metrics m
WHERE EXISTS (
  SELECT 1 FROM public.metric_sources s
  WHERE s.metric_id = m.id AND s.source_type::text IN ('formula', 'imported_file')
);

ALTER TABLE public.metrics
  ALTER COLUMN current_value DROP NOT NULL,
  ALTER COLUMN normalized_score DROP NOT NULL,
  DROP COLUMN IF EXISTS formula_ast,
  DROP COLUMN IF EXISTS formula_label,
  DROP COLUMN IF EXISTS template_id,
  DROP COLUMN IF EXISTS calculation_confidence;

ALTER TABLE public.metric_sources
  ADD COLUMN IF NOT EXISTS integration_id TEXT,
  ADD COLUMN IF NOT EXISTS source_key TEXT,
  ADD COLUMN IF NOT EXISTS external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE public.metric_sources DROP CONSTRAINT IF EXISTS metric_sources_status_check;
ALTER TABLE public.metric_sources ADD CONSTRAINT metric_sources_status_check
  CHECK (status IN ('active', 'disconnected', 'needs_configuration'));
ALTER TABLE public.metric_sources DROP CONSTRAINT IF EXISTS metric_sources_supported_type_check;
ALTER TABLE public.metric_sources ADD CONSTRAINT metric_sources_supported_type_check
  CHECK (source_type::text IN ('manual', 'integration'));

CREATE UNIQUE INDEX IF NOT EXISTS metric_sources_integration_key_unique
  ON public.metric_sources(company_id, integration_id, source_key)
  WHERE source_type = 'integration'::public.metric_source_type AND integration_id IS NOT NULL AND source_key IS NOT NULL;

ALTER TABLE public.metric_values
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.metric_values DROP CONSTRAINT IF EXISTS metric_values_supported_type_check;
ALTER TABLE public.metric_values ADD CONSTRAINT metric_values_supported_type_check
  CHECK (source_type::text IN ('manual', 'integration'));

DELETE FROM public.metric_values older USING public.metric_values newer
WHERE older.metric_id = newer.metric_id
  AND older.source_type::text = 'integration'
  AND newer.source_type::text = 'integration'
  AND (older.created_at, older.id) < (newer.created_at, newer.id);

CREATE UNIQUE INDEX IF NOT EXISTS metric_values_latest_integration_unique
  ON public.metric_values(metric_id) WHERE source_type = 'integration'::public.metric_source_type;

CREATE UNIQUE INDEX IF NOT EXISTS metric_links_one_core_bdt_node
  ON public.metric_links(metric_id)
  WHERE target_type = 'bdt_node'::public.metric_target_type AND is_core = true;

ALTER TABLE public.metric_rollups
  ADD COLUMN IF NOT EXISTS covered_node_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eligible_node_count INTEGER NOT NULL DEFAULT 0;
