ALTER TABLE public.oidc_clients
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'remote',
  ADD COLUMN IF NOT EXISTS provider_name text NOT NULL DEFAULT 'workos';

CREATE UNIQUE INDEX IF NOT EXISTS oidc_clients_company_environment_provider_idx
  ON public.oidc_clients(company_id, environment, provider_name);

ALTER TABLE public.oidc_access_tokens
  ADD COLUMN IF NOT EXISTS client_id text;

CREATE TABLE IF NOT EXISTS public.erpnext_command_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_env text NOT NULL CHECK (target_env IN ('local','remote')),
  company_id uuid NOT NULL,
  command_kind text NOT NULL CHECK (command_kind IN ('provision_tenant','configure_sso','reconcile_users')),
  company_slug text,
  generation bigint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 20,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (target_env, company_id, command_kind)
);

CREATE INDEX IF NOT EXISTS erpnext_command_outbox_claim_idx
  ON public.erpnext_command_outbox(target_env,next_attempt_at)
  WHERE status IN ('pending','running');
