-- Coalesced, backend-private recalculation after conversion-event changes.
-- The visible brief is derived immediately from retained action values; this
-- job durably updates canonical metrics, findings, and experiment evaluation.

CREATE TABLE IF NOT EXISTS public.meta_ads_recalculation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  selected_action TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  locked_by TEXT,
  error_code TEXT,
  error_message TEXT,
  UNIQUE (company_id, ad_account_id)
);

CREATE INDEX IF NOT EXISTS meta_ads_recalculation_jobs_pick_idx
  ON public.meta_ads_recalculation_jobs(status, available_at, requested_at);

ALTER TABLE public.meta_ads_recalculation_jobs ENABLE ROW LEVEL SECURITY;

