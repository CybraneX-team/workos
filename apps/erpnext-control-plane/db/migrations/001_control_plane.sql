CREATE SCHEMA IF NOT EXISTS erpnext;

CREATE TABLE IF NOT EXISTS erpnext.tenants (
  environment text NOT NULL CHECK (environment IN ('local','remote')),
  company_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('provisioning','ready','failed')),
  site_name text,
  api_url text,
  desk_url text,
  api_key_enc text,
  api_secret_enc text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment, company_id)
);

CREATE TABLE IF NOT EXISTS erpnext.provision_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('local','remote')),
  company_id uuid NOT NULL,
  company_slug text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  locked_by text,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (environment, idempotency_key)
);

CREATE INDEX IF NOT EXISTS provision_jobs_claim_idx ON erpnext.provision_jobs(environment,created_at) WHERE status IN ('pending','running');

CREATE TABLE IF NOT EXISTS erpnext.managed_users (
  environment text NOT NULL,
  company_id uuid NOT NULL,
  external_user_id uuid NOT NULL,
  email text NOT NULL,
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment, company_id, external_user_id),
  UNIQUE (environment, company_id, email)
);

CREATE TABLE IF NOT EXISTS erpnext.command_receipts (
  environment text NOT NULL,
  company_id uuid NOT NULL,
  command_kind text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment, company_id, command_kind, idempotency_key)
);
