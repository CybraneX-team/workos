-- ================================================================
-- Metric System Rebuild — canonical production metric domain
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE public.metric_value_type AS ENUM ('number', 'currency', 'percent', 'duration', 'count', 'ratio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.metric_direction AS ENUM ('higher_is_better', 'lower_is_better', 'target_band');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.metric_status AS ENUM ('active', 'draft', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.metric_source_type AS ENUM ('manual', 'formula', 'imported_file', 'integration');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.metric_target_type AS ENUM ('company', 'department', 'bdt_node', 'goal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.metric_link_relation AS ENUM ('owns', 'measures', 'drives', 'health_component');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.metric_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  unit            TEXT NOT NULL DEFAULT '',
  value_type      public.metric_value_type NOT NULL DEFAULT 'number',
  direction       public.metric_direction NOT NULL DEFAULT 'higher_is_better',
  baseline_value  NUMERIC NOT NULL DEFAULT 0,
  target_value    NUMERIC NOT NULL DEFAULT 100,
  formula_ast     JSONB,
  formula_label   TEXT,
  category        TEXT,
  target_hint     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.metrics (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  description            TEXT NOT NULL DEFAULT '',
  unit                   TEXT NOT NULL,
  value_type             public.metric_value_type NOT NULL DEFAULT 'number',
  direction              public.metric_direction NOT NULL,
  baseline_value         NUMERIC NOT NULL,
  target_value           NUMERIC NOT NULL,
  current_value          NUMERIC NOT NULL DEFAULT 0,
  normalized_score       INTEGER NOT NULL DEFAULT 0 CHECK (normalized_score BETWEEN 0 AND 100),
  formula_ast            JSONB,
  formula_label          TEXT,
  owner_member_id        UUID REFERENCES public.company_members(id) ON DELETE SET NULL,
  cadence                TEXT NOT NULL DEFAULT 'weekly',
  status                 public.metric_status NOT NULL DEFAULT 'active',
  source_confidence      NUMERIC NOT NULL DEFAULT 0.7 CHECK (source_confidence >= 0 AND source_confidence <= 1),
  calculation_confidence NUMERIC NOT NULL DEFAULT 1 CHECK (calculation_confidence >= 0 AND calculation_confidence <= 1),
  template_id            UUID REFERENCES public.metric_templates(id) ON DELETE SET NULL,
  created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_company_status ON public.metrics(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_company_name ON public.metrics(company_id, lower(name));

CREATE TABLE IF NOT EXISTS public.metric_values (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id         UUID NOT NULL REFERENCES public.metrics(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  raw_value         NUMERIC NOT NULL,
  normalized_score  INTEGER NOT NULL CHECK (normalized_score BETWEEN 0 AND 100),
  period_start      DATE,
  period_end        DATE,
  source_type       public.metric_source_type NOT NULL DEFAULT 'manual',
  source_id         UUID,
  source_confidence NUMERIC NOT NULL DEFAULT 0.7 CHECK (source_confidence >= 0 AND source_confidence <= 1),
  reason            TEXT,
  recorded_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metric_values_metric_time ON public.metric_values(metric_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.metric_sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id         UUID NOT NULL REFERENCES public.metrics(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_type       public.metric_source_type NOT NULL,
  label             TEXT NOT NULL,
  config            JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence        NUMERIC NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.metric_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id     UUID NOT NULL REFERENCES public.metrics(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  target_type   public.metric_target_type NOT NULL,
  target_id     UUID NOT NULL,
  relation      public.metric_link_relation NOT NULL DEFAULT 'measures',
  weight        NUMERIC NOT NULL DEFAULT 1 CHECK (weight > 0),
  is_core       BOOLEAN NOT NULL DEFAULT false,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(metric_id, target_type, target_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_metric_links_target ON public.metric_links(company_id, target_type, target_id, is_core);
CREATE INDEX IF NOT EXISTS idx_metric_links_metric ON public.metric_links(metric_id);

CREATE TABLE IF NOT EXISTS public.metric_impacts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric_id            UUID REFERENCES public.metrics(id) ON DELETE CASCADE,
  actor_type           TEXT NOT NULL CHECK (actor_type IN ('bdt_node', 'goal')),
  actor_id             UUID NOT NULL,
  estimated_delta      NUMERIC,
  estimated_confidence NUMERIC CHECK (estimated_confidence IS NULL OR (estimated_confidence >= 0 AND estimated_confidence <= 1)),
  actual_delta         NUMERIC,
  variance             NUMERIC,
  no_impact_reason     TEXT,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ,
  CHECK ((metric_id IS NOT NULL AND estimated_delta IS NOT NULL) OR no_impact_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_metric_impacts_metric ON public.metric_impacts(metric_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.metric_rollups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  target_type       public.metric_target_type NOT NULL,
  target_id         UUID NOT NULL,
  health_score      INTEGER NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  metric_count      INTEGER NOT NULL DEFAULT 0,
  source_confidence NUMERIC NOT NULL DEFAULT 0 CHECK (source_confidence >= 0 AND source_confidence <= 1),
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_metric_rollups_company_target ON public.metric_rollups(company_id, target_type, target_id);

ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_impacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metrics_company_read ON public.metrics;
CREATE POLICY metrics_company_read ON public.metrics FOR SELECT USING (
  company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.status = 'active')
);

DROP POLICY IF EXISTS metric_values_company_read ON public.metric_values;
CREATE POLICY metric_values_company_read ON public.metric_values FOR SELECT USING (
  company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.status = 'active')
);

DROP POLICY IF EXISTS metric_sources_company_read ON public.metric_sources;
CREATE POLICY metric_sources_company_read ON public.metric_sources FOR SELECT USING (
  company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.status = 'active')
);

DROP POLICY IF EXISTS metric_links_company_read ON public.metric_links;
CREATE POLICY metric_links_company_read ON public.metric_links FOR SELECT USING (
  company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.status = 'active')
);

DROP POLICY IF EXISTS metric_impacts_company_read ON public.metric_impacts;
CREATE POLICY metric_impacts_company_read ON public.metric_impacts FOR SELECT USING (
  company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.status = 'active')
);

DROP POLICY IF EXISTS metric_rollups_company_read ON public.metric_rollups;
CREATE POLICY metric_rollups_company_read ON public.metric_rollups FOR SELECT USING (
  company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.status = 'active')
);

DROP POLICY IF EXISTS metric_templates_company_read ON public.metric_templates;
CREATE POLICY metric_templates_company_read ON public.metric_templates FOR SELECT USING (
  company_id IS NULL OR company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.status = 'active')
);

-- Safe one-way backfill from the old BDT KPI rows. Seed/catalog/localStorage
-- data is intentionally ignored.
DO $$
BEGIN
  IF to_regclass('public.bdt_metrics') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO public.metrics (
        company_id, name, description, unit, value_type, direction,
        baseline_value, target_value, current_value, normalized_score,
        owner_member_id, cadence, status, source_confidence, calculation_confidence,
        created_by, updated_by, created_at, updated_at
      )
      SELECT
        bm.company_id,
        bm.name,
        '',
        COALESCE(bm.unit, ''),
        CASE
          WHEN bm.unit = '$' THEN 'currency'::public.metric_value_type
          WHEN bm.unit = '%' THEN 'percent'::public.metric_value_type
          ELSE 'number'::public.metric_value_type
        END,
        CASE WHEN bm.higher_is_better THEN 'higher_is_better'::public.metric_direction ELSE 'lower_is_better'::public.metric_direction END,
        COALESCE(bm.baseline, 0),
        COALESCE(bm.target, 0),
        COALESCE(bm.value, 0),
        GREATEST(0, LEAST(100, CASE
          WHEN COALESCE(bm.target, 0) = COALESCE(bm.baseline, 0) THEN 100
          ELSE ROUND(((COALESCE(bm.value, 0) - COALESCE(bm.baseline, 0)) / NULLIF((COALESCE(bm.target, 0) - COALESCE(bm.baseline, 0)), 0)) * 100)
        END))::int,
        NULL,
        'weekly',
        'active'::public.metric_status,
        0.7,
        1,
        NULL,
        NULL,
        COALESCE(bm.created_at, NOW()),
        COALESCE(bm.updated_at, NOW())
      FROM public.bdt_metrics bm
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.metrics existing
        WHERE existing.company_id = bm.company_id
          AND lower(existing.name) = lower(bm.name)
          AND existing.current_value = COALESCE(bm.value, 0)
      )
    $sql$;

    EXECUTE $sql$
      INSERT INTO public.metric_links (metric_id, company_id, target_type, target_id, relation, weight, is_core)
      SELECT
        m.id,
        m.company_id,
        CASE WHEN bm.scope = 'department' AND bm.department_id IS NOT NULL
          THEN 'department'::public.metric_target_type
          ELSE 'company'::public.metric_target_type
        END,
        CASE WHEN bm.scope = 'department' AND bm.department_id IS NOT NULL
          THEN bm.department_id
          ELSE bm.company_id
        END,
        'health_component'::public.metric_link_relation,
        1,
        true
      FROM public.bdt_metrics bm
      JOIN public.metrics m
        ON m.company_id = bm.company_id
       AND lower(m.name) = lower(bm.name)
       AND m.current_value = COALESCE(bm.value, 0)
      ON CONFLICT DO NOTHING
    $sql$;
  END IF;
END $$;

INSERT INTO public.metric_values (metric_id, company_id, raw_value, normalized_score, source_type, source_confidence, reason, created_at)
SELECT id, company_id, current_value, normalized_score, 'manual', source_confidence, 'Backfilled from legacy bdt_metrics', created_at
FROM public.metrics m
WHERE NOT EXISTS (SELECT 1 FROM public.metric_values mv WHERE mv.metric_id = m.id);
