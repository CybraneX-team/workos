-- Native WorkOS CRM, catalogue, current-stock model, and the hard removal of
-- the obsolete per-company ERPNext/Frappe control-plane state.

DROP TABLE IF EXISTS public.erpnext_command_outbox;
DROP TABLE IF EXISTS public.erpnext_provision_jobs;
DROP TABLE IF EXISTS public.oidc_auth_codes;
DROP TABLE IF EXISTS public.oidc_access_tokens;
DROP TABLE IF EXISTS public.oidc_clients;

ALTER TABLE public.meta_ads_campaign_job_steps DROP CONSTRAINT IF EXISTS meta_ads_campaign_job_steps_object_kind_check;
ALTER TABLE public.meta_ads_campaign_job_steps ADD CONSTRAINT meta_ads_campaign_job_steps_object_kind_check
  CHECK (object_kind IN ('image','campaign','adset','creative','ad','status','leadform','leadbinding'));

CREATE TABLE public.crm_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  lifecycle text NOT NULL DEFAULT 'prospect' CHECK (lifecycle IN ('prospect','customer','inactive')),
  industry text,
  territory text,
  market_segment text,
  employee_count integer CHECK (employee_count IS NULL OR employee_count >= 0),
  annual_revenue numeric(18,2) CHECK (annual_revenue IS NULL OR annual_revenue >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id)
);
CREATE INDEX crm_accounts_company_updated_idx ON public.crm_accounts(company_id,updated_at DESC);
CREATE INDEX crm_accounts_company_name_idx ON public.crm_accounts(company_id,lower(name));
CREATE INDEX crm_accounts_company_segment_idx ON public.crm_accounts(company_id,industry,territory);

CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid,
  first_name text NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 140),
  last_name text,
  email text,
  phone text,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,account_id) REFERENCES public.crm_accounts(company_id,id) ON DELETE SET NULL (account_id)
);
CREATE INDEX crm_contacts_company_updated_idx ON public.crm_contacts(company_id,updated_at DESC);
CREATE INDEX crm_contacts_account_idx ON public.crm_contacts(company_id,account_id);
CREATE INDEX crm_contacts_company_name_idx ON public.crm_contacts(company_id,lower(first_name),lower(coalesce(last_name,'')));
CREATE INDEX crm_contacts_company_email_idx ON public.crm_contacts(company_id,lower(email)) WHERE email IS NOT NULL;

CREATE TABLE public.crm_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  primary_contact_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  stage text NOT NULL DEFAULT 'qualification' CHECK (stage IN ('qualification','discovery','proposal','negotiation','won','lost')),
  value numeric(18,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  probability integer NOT NULL DEFAULT 10 CHECK (probability BETWEEN 0 AND 100),
  expected_close_date date,
  closed_at timestamptz,
  lost_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,account_id) REFERENCES public.crm_accounts(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,primary_contact_id) REFERENCES public.crm_contacts(company_id,id) ON DELETE SET NULL (primary_contact_id)
);
CREATE INDEX crm_deals_company_stage_idx ON public.crm_deals(company_id,stage,updated_at DESC);
CREATE INDEX crm_deals_company_name_idx ON public.crm_deals(company_id,lower(name));
CREATE INDEX crm_deals_company_close_idx ON public.crm_deals(company_id,expected_close_date) WHERE expected_close_date IS NOT NULL;

CREATE TABLE public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid,
  contact_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  email text,
  phone text,
  source text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','converted','disqualified')),
  meta_lead_id text,
  meta_form_id text,
  meta_ad_id text,
  raw_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  converted_deal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,account_id) REFERENCES public.crm_accounts(company_id,id) ON DELETE SET NULL (account_id),
  FOREIGN KEY(company_id,contact_id) REFERENCES public.crm_contacts(company_id,id) ON DELETE SET NULL (contact_id),
  FOREIGN KEY(company_id,converted_deal_id) REFERENCES public.crm_deals(company_id,id) ON DELETE SET NULL (converted_deal_id)
);
CREATE UNIQUE INDEX crm_leads_company_meta_lead_uidx ON public.crm_leads(company_id,meta_lead_id) WHERE meta_lead_id IS NOT NULL;
CREATE INDEX crm_leads_company_status_idx ON public.crm_leads(company_id,status,updated_at DESC);
CREATE INDEX crm_leads_company_name_idx ON public.crm_leads(company_id,lower(name));
CREATE INDEX crm_leads_company_email_idx ON public.crm_leads(company_id,lower(email)) WHERE email IS NOT NULL;

CREATE TABLE public.catalog_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,parent_id) REFERENCES public.catalog_groups(company_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX catalog_groups_company_parent_name_uidx ON public.catalog_groups(company_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name));

CREATE TABLE public.catalog_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id uuid,
  code text NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description text,
  unit text NOT NULL DEFAULT 'unit',
  active boolean NOT NULL DEFAULT true,
  price_amount numeric(18,2) CHECK (price_amount IS NULL OR price_amount >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,group_id) REFERENCES public.catalog_groups(company_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX catalog_products_company_code_uidx ON public.catalog_products(company_id,lower(code));
CREATE INDEX catalog_products_company_updated_idx ON public.catalog_products(company_id,updated_at DESC);
CREATE INDEX catalog_products_company_name_idx ON public.catalog_products(company_id,lower(name));

CREATE TABLE public.inventory_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  warehouse_name text NOT NULL CHECK (length(trim(warehouse_name)) BETWEEN 1 AND 160),
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  UNIQUE(company_id,product_id,warehouse_name),
  FOREIGN KEY(company_id,product_id) REFERENCES public.catalog_products(company_id,id) ON DELETE CASCADE
);
CREATE INDEX inventory_balances_company_warehouse_idx ON public.inventory_balances(company_id,lower(warehouse_name));

CREATE TABLE public.meta_lead_form_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  meta_page_id text NOT NULL,
  meta_form_id text NOT NULL,
  field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,meta_form_id)
);
CREATE INDEX meta_lead_form_bindings_active_idx ON public.meta_lead_form_bindings(active,updated_at) WHERE active=true;

