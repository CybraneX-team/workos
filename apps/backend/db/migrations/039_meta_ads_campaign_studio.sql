-- Paid Acquisition Campaign Studio: durable creative generation, approvals,
-- paused publication, launch, and append-only audit history.

CREATE TABLE IF NOT EXISTS public.meta_ads_brand_kits (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL DEFAULT '',
  brand_voice TEXT NOT NULL DEFAULT '',
  value_proposition TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  primary_color TEXT,
  secondary_color TEXT,
  logo_asset_id UUID,
  required_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
  prohibited_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.meta_ads_creative_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('upload', 'gemini')),
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  aspect_ratio TEXT CHECK (aspect_ratio IS NULL OR aspect_ratio IN ('1:1', '4:5', '9:16')),
  checksum TEXT NOT NULL,
  prompt TEXT,
  model TEXT,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (company_id, storage_path)
);

ALTER TABLE public.meta_ads_brand_kits
  DROP CONSTRAINT IF EXISTS meta_ads_brand_kits_logo_asset_id_fkey;
ALTER TABLE public.meta_ads_brand_kits
  ADD CONSTRAINT meta_ads_brand_kits_logo_asset_id_fkey
  FOREIGN KEY (logo_asset_id) REFERENCES public.meta_ads_creative_assets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.meta_ads_campaign_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','generating','submitted','publish_approved','publishing','published_paused',
    'launch_approved','launching','scheduled','active','pending_meta_review','paused','failed','cancelled'
  )),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
  content JSONB NOT NULL,
  preflight JSONB,
  snapshot_hash TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meta_ads_campaign_drafts_company_idx
  ON public.meta_ads_campaign_drafts(company_id, ad_account_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS meta_ads_campaign_drafts_attention_idx
  ON public.meta_ads_campaign_drafts(company_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.meta_ads_campaign_draft_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.meta_ads_campaign_drafts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content JSONB NOT NULL,
  snapshot_hash TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'edited',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (draft_id, version)
);

CREATE TABLE IF NOT EXISTS public.meta_ads_creative_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL REFERENCES public.meta_ads_campaign_drafts(id) ON DELETE CASCADE,
  requested_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','failed')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  locked_by TEXT,
  brief_snapshot JSONB NOT NULL,
  brand_snapshot JSONB NOT NULL,
  product_snapshot JSONB,
  concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_code TEXT,
  error_message TEXT,
  idempotency_key TEXT NOT NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS meta_ads_creative_jobs_pick_idx
  ON public.meta_ads_creative_generation_jobs(status, available_at, requested_at);

CREATE TABLE IF NOT EXISTS public.meta_ads_campaign_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL REFERENCES public.meta_ads_campaign_drafts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  approval_kind TEXT NOT NULL CHECK (approval_kind IN ('publish','launch')),
  snapshot_hash TEXT NOT NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_name_snapshot TEXT NOT NULL,
  note TEXT,
  idempotency_key TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (draft_id, version, approval_kind),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.meta_ads_campaign_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  draft_id UUID NOT NULL REFERENCES public.meta_ads_campaign_drafts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  job_kind TEXT NOT NULL CHECK (job_kind IN ('publish_paused','launch','pause')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','failed')),
  snapshot_hash TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  locked_by TEXT,
  error_code TEXT,
  error_message TEXT,
  idempotency_key TEXT NOT NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS meta_ads_campaign_jobs_pick_idx
  ON public.meta_ads_campaign_jobs(status, available_at, requested_at);

CREATE TABLE IF NOT EXISTS public.meta_ads_campaign_job_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.meta_ads_campaign_jobs(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  object_kind TEXT NOT NULL CHECK (object_kind IN ('image','campaign','adset','creative','ad','status')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','failed')),
  request_fingerprint TEXT NOT NULL,
  meta_object_id TEXT,
  response_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, step_key)
);

ALTER TABLE public.meta_ads_campaign_job_steps
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.meta_ads_entity_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  draft_id UUID NOT NULL REFERENCES public.meta_ads_campaign_drafts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  object_kind TEXT NOT NULL CHECK (object_kind IN ('image','campaign','adset','creative','ad')),
  local_key TEXT NOT NULL,
  meta_object_id TEXT NOT NULL,
  meta_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (draft_id, version, object_kind, local_key),
  UNIQUE (company_id, ad_account_id, meta_object_id)
);

CREATE TABLE IF NOT EXISTS public.meta_ads_campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL REFERENCES public.meta_ads_campaign_drafts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name_snapshot TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_ads_campaign_events_idempotency_idx
  ON public.meta_ads_campaign_events(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS meta_ads_campaign_events_timeline_idx
  ON public.meta_ads_campaign_events(draft_id, created_at, id);

ALTER TABLE public.meta_ads_brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_creative_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_campaign_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_campaign_draft_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_creative_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_campaign_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_campaign_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_campaign_job_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_entity_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_campaign_events ENABLE ROW LEVEL SECURITY;

-- Keep direct Supabase reads aligned with the backend's paid_media:read gate,
-- including company-scoped custom roles. SECURITY DEFINER is required because
-- the roles table is itself protected by RLS.
CREATE OR REPLACE FUNCTION public.can_read_paid_media(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.company_members cm
      JOIN public.roles r ON r.id=cm.role
     WHERE cm.company_id=p_company_id
       AND cm.user_id=auth.uid()
       AND cm.status='active'
       AND COALESCE(r.is_archived,FALSE)=FALSE
       AND (r.company_id IS NULL OR r.company_id=p_company_id)
       AND COALESCE((r.permissions #>> '{paid_media,read}')::BOOLEAN,FALSE)=TRUE
  )
$$;

REVOKE ALL ON FUNCTION public.can_read_paid_media(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_paid_media(UUID) TO authenticated;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'meta_ads_brand_kits','meta_ads_creative_assets','meta_ads_campaign_drafts',
    'meta_ads_campaign_draft_versions','meta_ads_creative_generation_jobs',
    'meta_ads_campaign_approvals','meta_ads_campaign_jobs','meta_ads_campaign_job_steps',
    'meta_ads_entity_mappings','meta_ads_campaign_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_company_read ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_company_read ON public.%I FOR SELECT USING (public.can_read_paid_media(company_id))',
      table_name, table_name
    );
  END LOOP;
END $$;

-- Existing custom roles inherit false for the new module. System defaults are
-- updated explicitly so deployment does not depend on replaying the baseline seed.
UPDATE public.roles
   SET permissions = permissions || jsonb_build_object(
     'paid_media',
     CASE id
       WHEN 'super_admin' THEN '{"read":true,"write":true,"delete":false,"approve":true,"execute":true}'::jsonb
       WHEN 'founder' THEN '{"read":true,"write":true,"delete":false,"approve":true,"execute":true}'::jsonb
       WHEN 'co_founder' THEN '{"read":true,"write":true,"delete":false,"approve":true,"execute":true}'::jsonb
       WHEN 'admin' THEN '{"read":true,"write":true,"delete":false,"approve":true,"execute":true}'::jsonb
       WHEN 'analyst' THEN '{"read":true,"write":true,"delete":false,"approve":false,"execute":false}'::jsonb
       ELSE '{"read":true,"write":false,"delete":false,"approve":false,"execute":false}'::jsonb
     END
   ),
       updated_at = NOW()
 WHERE is_system=TRUE
   AND id IN ('super_admin','founder','co_founder','admin','analyst','engineer','viewer','investor');

-- Service-role-only private media bucket. Browser access is always via a short
-- lived signed URL returned by the authenticated backend.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
      VALUES ('meta-ads-creatives','meta-ads-creatives',FALSE,10485760,ARRAY['image/jpeg','image/png','image/webp'])
      ON CONFLICT (id) DO UPDATE SET public=FALSE,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types
    $sql$;
  END IF;
END $$;
