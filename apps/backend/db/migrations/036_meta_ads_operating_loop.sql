-- Read-only Meta Ads operating-loop history, durable synchronization, and findings.

CREATE TABLE IF NOT EXISTS public.meta_ads_account_daily (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  account_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  account_timezone TEXT NOT NULL,
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC NOT NULL DEFAULT 0,
  cpc NUMERIC NOT NULL DEFAULT 0,
  purchase_roas NUMERIC NOT NULL DEFAULT 0,
  actions JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, ad_account_id, metric_date)
);

CREATE TABLE IF NOT EXISTS public.meta_ads_campaign_daily (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  campaign_name TEXT NOT NULL,
  campaign_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  currency TEXT NOT NULL,
  account_timezone TEXT NOT NULL,
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC NOT NULL DEFAULT 0,
  cpc NUMERIC NOT NULL DEFAULT 0,
  purchase_roas NUMERIC NOT NULL DEFAULT 0,
  actions JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, ad_account_id, campaign_id, metric_date)
);

CREATE TABLE IF NOT EXISTS public.meta_ads_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('initial_backfill', 'daily', 'manual', 'recovery')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  schedule_date DATE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  locked_by TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  error_code TEXT,
  error_message TEXT,
  data_through DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_ads_sync_runs_active_unique
  ON public.meta_ads_sync_runs(company_id, ad_account_id)
  WHERE status IN ('pending', 'running');

CREATE UNIQUE INDEX IF NOT EXISTS meta_ads_sync_runs_daily_unique
  ON public.meta_ads_sync_runs(company_id, ad_account_id, schedule_date)
  WHERE reason = 'daily' AND schedule_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS meta_ads_sync_runs_pick_idx
  ON public.meta_ads_sync_runs(status, available_at, requested_at);

CREATE TABLE IF NOT EXISTS public.meta_ads_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  scope TEXT NOT NULL CHECK (scope IN ('integration', 'account', 'campaign')),
  scope_id TEXT,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_spend_exposure NUMERIC NOT NULL DEFAULT 0,
  action_kind TEXT NOT NULL,
  action_label TEXT NOT NULL,
  action_href TEXT NOT NULL,
  detection_count INTEGER NOT NULL DEFAULT 0,
  clear_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, ad_account_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS meta_ads_findings_active_idx
  ON public.meta_ads_findings(company_id, ad_account_id, severity)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS meta_ads_account_daily_range_idx
  ON public.meta_ads_account_daily(company_id, ad_account_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS meta_ads_campaign_daily_range_idx
  ON public.meta_ads_campaign_daily(company_id, ad_account_id, metric_date DESC);

UPDATE public.integration_connections c
SET last_synced_at = NULL
WHERE c.integration_id = 'int-meta'
  AND NOT EXISTS (
    SELECT 1 FROM public.meta_ads_account_daily h
    WHERE h.company_id = c.company_id
      AND h.ad_account_id = c.metadata->>'ad_account_id'
  );


INSERT INTO public.meta_ads_sync_runs (company_id, ad_account_id, reason)
SELECT company_id, metadata->>'ad_account_id', 'initial_backfill'
FROM public.integration_connections
WHERE integration_id = 'int-meta'
  AND NULLIF(metadata->>'ad_account_id', '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.meta_ads_account_daily h
    WHERE h.company_id = integration_connections.company_id
      AND h.ad_account_id = integration_connections.metadata->>'ad_account_id'
  )
ON CONFLICT DO NOTHING;


ALTER TABLE public.meta_ads_account_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_campaign_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_ads_account_daily_company_read ON public.meta_ads_account_daily;
CREATE POLICY meta_ads_account_daily_company_read ON public.meta_ads_account_daily FOR SELECT USING (
  company_id IN (
    SELECT cm.company_id FROM public.company_members cm
    WHERE cm.user_id = auth.uid() AND cm.status = 'active'
  )
);

DROP POLICY IF EXISTS meta_ads_campaign_daily_company_read ON public.meta_ads_campaign_daily;
CREATE POLICY meta_ads_campaign_daily_company_read ON public.meta_ads_campaign_daily FOR SELECT USING (
  company_id IN (
    SELECT cm.company_id FROM public.company_members cm
    WHERE cm.user_id = auth.uid() AND cm.status = 'active'
  )
);

DROP POLICY IF EXISTS meta_ads_sync_runs_company_read ON public.meta_ads_sync_runs;
CREATE POLICY meta_ads_sync_runs_company_read ON public.meta_ads_sync_runs FOR SELECT USING (
  company_id IN (
    SELECT cm.company_id FROM public.company_members cm
    WHERE cm.user_id = auth.uid() AND cm.status = 'active'
  )
);

DROP POLICY IF EXISTS meta_ads_findings_company_read ON public.meta_ads_findings;
CREATE POLICY meta_ads_findings_company_read ON public.meta_ads_findings FOR SELECT USING (
  company_id IN (
    SELECT cm.company_id FROM public.company_members cm
    WHERE cm.user_id = auth.uid() AND cm.status = 'active'
  )
);
