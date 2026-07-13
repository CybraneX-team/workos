-- Minimal OIDC/OAuth2 provider tables, backing SSO into per-company ERPNext
-- sites: each site's Frappe "Social Login Key" is an OAuth client of this
-- provider, authenticated against the existing Supabase session (see
-- src/routes/oidc.ts for the authorize/token/userinfo flow).

CREATE TABLE public.oidc_clients (
    client_id text PRIMARY KEY,
    client_secret_enc text NOT NULL,
    company_id uuid NOT NULL,
    redirect_uri text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX oidc_clients_company_id_idx ON public.oidc_clients (company_id);

-- Short-lived, single-use authorization codes issued by /oidc/authorize,
-- redeemed once by /oidc/token.
CREATE TABLE public.oidc_auth_codes (
    code text PRIMARY KEY,
    client_id text NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    email text NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Short-lived access tokens returned by /oidc/token, looked up once by
-- /oidc/userinfo (Frappe calls this immediately after token exchange).
CREATE TABLE public.oidc_access_tokens (
    token text PRIMARY KEY,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    email text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
