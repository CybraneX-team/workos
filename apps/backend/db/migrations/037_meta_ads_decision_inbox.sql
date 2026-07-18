-- Paid Acquisition Decision Inbox: deep read-only delivery evidence and durable experiments.

ALTER TABLE public.meta_ads_account_daily
  ADD COLUMN IF NOT EXISTS cpm NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reach BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frequency NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outbound_clicks BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landing_page_views BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.meta_ads_campaign_daily
  ADD COLUMN IF NOT EXISTS cpm NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reach BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frequency NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outbound_clicks BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landing_page_views BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.meta_ads_findings DROP CONSTRAINT IF EXISTS meta_ads_findings_scope_check;
ALTER TABLE public.meta_ads_findings
  ADD CONSTRAINT meta_ads_findings_scope_check CHECK (scope IN ('integration', 'account', 'campaign', 'adset', 'ad')),
  ADD COLUMN IF NOT EXISTS episode INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS episode_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diagnosis JSONB,
  ADD COLUMN IF NOT EXISTS recommendation JSONB,
  ADD COLUMN IF NOT EXISTS confidence TEXT CHECK (confidence IS NULL OR confidence IN ('medium', 'high'));

UPDATE public.meta_ads_findings
   SET episode=1,
       episode_started_at=COALESCE(episode_started_at, first_detected_at)
 WHERE active=TRUE AND episode=0;

ALTER TABLE public.meta_ads_sync_runs
  ADD COLUMN IF NOT EXISTS core_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diagnostic_coverage TEXT NOT NULL DEFAULT 'not_started'
    CHECK (diagnostic_coverage IN ('not_started', 'preparing', 'current', 'partial')),
  ADD COLUMN IF NOT EXISTS warnings JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.meta_ads_delivery_daily (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('adset', 'ad')),
  entity_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  entity_name TEXT NOT NULL,
  entity_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  adset_id TEXT,
  adset_name TEXT,
  creative_id TEXT,
  currency TEXT NOT NULL,
  account_timezone TEXT NOT NULL,
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC NOT NULL DEFAULT 0,
  cpc NUMERIC NOT NULL DEFAULT 0,
  cpm NUMERIC NOT NULL DEFAULT 0,
  reach BIGINT NOT NULL DEFAULT 0,
  frequency NUMERIC NOT NULL DEFAULT 0,
  outbound_clicks BIGINT NOT NULL DEFAULT 0,
  landing_page_views BIGINT NOT NULL DEFAULT 0,
  purchase_roas NUMERIC NOT NULL DEFAULT 0,
  actions JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, ad_account_id, level, entity_id, metric_date)
);

CREATE INDEX IF NOT EXISTS meta_ads_delivery_daily_range_idx
  ON public.meta_ads_delivery_daily(company_id, ad_account_id, level, metric_date DESC);
CREATE INDEX IF NOT EXISTS meta_ads_delivery_daily_parent_idx
  ON public.meta_ads_delivery_daily(company_id, ad_account_id, campaign_id, adset_id, metric_date DESC);

CREATE TABLE IF NOT EXISTS public.meta_ads_delivery_windows (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('adset', 'ad')),
  entity_id TEXT NOT NULL,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  entity_name TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  adset_id TEXT,
  adset_name TEXT,
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC NOT NULL DEFAULT 0,
  cpc NUMERIC NOT NULL DEFAULT 0,
  cpm NUMERIC NOT NULL DEFAULT 0,
  reach BIGINT NOT NULL DEFAULT 0,
  frequency NUMERIC NOT NULL DEFAULT 0,
  outbound_clicks BIGINT NOT NULL DEFAULT 0,
  landing_page_views BIGINT NOT NULL DEFAULT 0,
  purchase_roas NUMERIC NOT NULL DEFAULT 0,
  actions JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, ad_account_id, level, entity_id, window_start, window_end)
);

CREATE INDEX IF NOT EXISTS meta_ads_delivery_windows_current_idx
  ON public.meta_ads_delivery_windows(company_id, ad_account_id, level, window_end DESC);

CREATE TABLE IF NOT EXISTS public.meta_ads_delivery_entities (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('adset', 'ad')),
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  effective_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  adset_id TEXT,
  adset_name TEXT,
  creative_id TEXT,
  creative_name TEXT,
  creative_format TEXT,
  thumbnail_url TEXT,
  thumbnail_refreshed_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, ad_account_id, level, entity_id)
);

CREATE TABLE IF NOT EXISTS public.meta_ads_sync_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.meta_ads_sync_runs(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('adset', 'ad')),
  segment_kind TEXT NOT NULL CHECK (segment_kind IN ('daily', 'current_window', 'previous_window')),
  since_date DATE NOT NULL,
  until_date DATE NOT NULL,
  report_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'complete', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, level, segment_kind)
);

CREATE INDEX IF NOT EXISTS meta_ads_sync_segments_run_idx
  ON public.meta_ads_sync_segments(run_id, status, available_at);

CREATE TABLE IF NOT EXISTS public.meta_ads_finding_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  finding_id UUID NOT NULL REFERENCES public.meta_ads_findings(id) ON DELETE CASCADE,
  finding_episode INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('dismissed')),
  reason TEXT NOT NULL CHECK (reason IN ('not_relevant', 'already_addressed', 'insufficient_context', 'other')),
  note TEXT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (finding_id, finding_episode),
  UNIQUE (company_id, idempotency_key)
);

ALTER TABLE public.meta_ads_finding_decisions
  DROP COLUMN IF EXISTS account_name_snapshot,
  DROP COLUMN IF EXISTS timezone_snapshot;

CREATE TABLE IF NOT EXISTS public.meta_ads_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  account_name_snapshot TEXT,
  timezone_snapshot TEXT NOT NULL DEFAULT 'UTC',
  finding_id UUID NOT NULL REFERENCES public.meta_ads_findings(id) ON DELETE CASCADE,
  finding_episode INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'measuring', 'completed', 'cancelled')),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('improved', 'worsened', 'no_clear_change', 'inconclusive')),
  scope TEXT NOT NULL CHECK (scope IN ('account', 'campaign', 'adset', 'ad')),
  scope_id TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  measurement_scope TEXT NOT NULL CHECK (measurement_scope IN ('account', 'campaign', 'adset')),
  measurement_scope_id TEXT NOT NULL,
  measurement_scope_name TEXT NOT NULL,
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  recommended_change TEXT NOT NULL,
  primary_metric TEXT NOT NULL CHECK (primary_metric IN ('ctr', 'cpa', 'purchase_roas')),
  primary_direction TEXT NOT NULL CHECK (primary_direction IN ('higher', 'lower')),
  guardrail_metric TEXT,
  selected_conversion_action TEXT,
  recommendation_snapshot JSONB NOT NULL,
  source_evidence JSONB NOT NULL,
  owner_member_id UUID REFERENCES public.company_members(id) ON DELETE SET NULL,
  owner_name_snapshot TEXT NOT NULL,
  due_date DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  applied_local_date DATE,
  implementation_note TEXT,
  kept_budget_constant BOOLEAN,
  baseline_7 JSONB,
  baseline_14 JSONB,
  evaluation_start DATE,
  evaluation_due_7 DATE,
  evaluation_due_14 DATE,
  evaluation_days INTEGER,
  result_metrics JSONB,
  result_explanation TEXT,
  confidence TEXT CHECK (confidence IS NULL OR confidence IN ('medium', 'high')),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  cancel_note TEXT,
  idempotency_key TEXT NOT NULL,
  UNIQUE (company_id, idempotency_key)
);

ALTER TABLE public.meta_ads_experiments
  ADD COLUMN IF NOT EXISTS account_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS timezone_snapshot TEXT NOT NULL DEFAULT 'UTC';

CREATE UNIQUE INDEX IF NOT EXISTS meta_ads_experiments_active_episode_unique
  ON public.meta_ads_experiments(finding_id, finding_episode)
  WHERE status IN ('planned', 'measuring');
CREATE INDEX IF NOT EXISTS meta_ads_experiments_inbox_idx
  ON public.meta_ads_experiments(company_id, ad_account_id, status, due_date, created_at DESC);

CREATE TABLE IF NOT EXISTS public.meta_ads_experiment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  experiment_id UUID NOT NULL REFERENCES public.meta_ads_experiments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('started', 'updated', 'applied', 'extended', 'evaluated', 'cancelled', 'owner_removed')),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name_snapshot TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_ads_experiment_events_idempotency_idx
  ON public.meta_ads_experiment_events(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS meta_ads_experiment_events_timeline_idx
  ON public.meta_ads_experiment_events(experiment_id, created_at, id);

ALTER TABLE public.meta_ads_delivery_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_delivery_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_delivery_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_sync_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_finding_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_experiment_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'meta_ads_delivery_daily', 'meta_ads_delivery_windows', 'meta_ads_delivery_entities',
    'meta_ads_sync_segments', 'meta_ads_finding_decisions', 'meta_ads_experiments', 'meta_ads_experiment_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_company_read ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_company_read ON public.%I FOR SELECT USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id=auth.uid() AND cm.status=''active''))',
      table_name, table_name
    );
  END LOOP;
END $$;
