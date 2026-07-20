# Local WorkOS-to-ERPNext SSO runbook

Last verified: 2026-07-13.

Scope: local development only. A separate **deployed** control-plane
(`ERPNEXT_ENV=remote`) runs in Azure against the ERPNext VM — this runbook does not
cover it; see `cloud-deploy.md`. The two are deliberately isolated: a control-plane
process serves exactly one `ERPNEXT_ENV` and rejects mismatched requests, so local
work here cannot drive the remote tenants.

This runbook verifies a real browser flow from a local WorkOS Supabase session into a company-specific ERPNext Desk session.

## Expected local topology

| Component | URL |
|---|---|
| WorkOS frontend | `http://localhost:5173` |
| WorkOS backend | `http://localhost:8080` |
| ERPNext control-plane | `http://localhost:8090` |
| Company ERPNext site | `http://erp-<company-slug>.localhost:8081` |

The Frappe Compose file is `../infra/erpnext/pwd.yml` relative to this repository. Its frontend must pass the request host as `FRAPPE_SITE_NAME_HEADER`, and its backend must resolve `host.docker.internal`.

## 1. Configure environment

Use `apps/backend/.env.example` and `apps/erpnext-control-plane/.env.example` as the source of variable names. Keep actual values in ignored `.env` files.

Required ERP-specific relationships:

- Backend `ERPNEXT_CONTROL_PLANE_TOKEN` must exactly equal control-plane `INTERNAL_SERVICE_TOKEN` and be at least 16 characters.
- Backend `ERPNEXT_TARGET_ENV=local`; control-plane `ERPNEXT_ENV=local`.
- Backend `ERPNEXT_CONTROL_PLANE_URL=http://localhost:8090`.
- Backend `OIDC_BROWSER_AUTHORIZE_URL=http://localhost:5173/oauth/authorize`.
- Backend `OIDC_INTERNAL_BASE_URL=http://host.docker.internal:8080/api/oidc`.
- Control-plane `ERPNEXT_CREDENTIALS_KEY` must be a 64-character hex key.
- Control-plane `FRAPPE_DOCKER_DIR` must resolve to the sibling `infra/erpnext` directory.
- Backend and control-plane must use the same `DATABASE_URL` for the current shared local-development setup.

Generate new local-only values without writing them into documentation:

```bash
openssl rand -hex 32
openssl rand -hex 24
```

Use the 32-byte hex output for encryption keys and a separate random value for the shared service token. Never commit either value.

## 2. Apply schemas

Apply the WorkOS migration through the repository's database migration workflow. If applying this standalone migration directly in local development:

```bash
psql "$DATABASE_URL" -f apps/backend/db/migrations/035_erpnext_control_plane_outbox.sql
pnpm --filter erpnext-control-plane db:migrate
```

Both migrations are idempotent for repeated local setup.

## 3. Start the runtime

From the repository root:

```bash
pnpm install
pnpm build:packages
pnpm frappe:up
pnpm dev:workos-erpnext
```

Keep the development process running. Check basic reachability in another terminal:

```bash
curl -fsS http://localhost:8080/healthz
curl -fsS http://localhost:8090/healthz
curl -fsS http://localhost:8081/api/method/ping
```

## 4. Provision a company

1. Sign in to WorkOS at `http://localhost:5173` and create/select a company.
2. Company creation should enqueue `provision_tenant`, `configure_sso`, and `reconcile_users`.
3. Open Settings and wait for ERPNext to become ready. The link must come from `GET /api/erpnext/status` and point to `http://erp-<slug>.localhost:8081`.
4. Optionally inspect safe state without reading secrets:

```sql
select target_env, company_id, command_kind, status, attempts, last_error
from public.erpnext_command_outbox
order by updated_at desc;

select environment, company_id, status, site_name, desk_url, last_error
from erpnext.tenants
order by updated_at desc;
```

## 5. Verify browser SSO

1. Stay signed in to WorkOS in the same browser profile.
2. Open the ERPNext link from Settings, or browse to `http://erp-<slug>.localhost:8081/login?redirect-to=/app`.
3. Click `Login with workos`.
4. Confirm the browser briefly visits the WorkOS authorization bridge and returns to the company-specific Frappe callback.
5. Confirm ERPNext Desk opens without an ERPNext password prompt.
6. In ERPNext, verify the signed-in email matches WorkOS and the expected roles match current WorkOS membership/grants.
7. Change WorkOS roles/grants and wait for reconciliation; verify Frappe roles are replaced.
8. Remove the member; verify the managed Frappe user is disabled.

Expected flow:

```text
Frappe login
  -> http://localhost:5173/oauth/authorize
  -> POST http://localhost:8080/api/oidc/authorize (existing Supabase session)
  -> company Frappe callback with one-time code
  -> http://host.docker.internal:8080/api/oidc/token (inside Docker)
  -> http://host.docker.internal:8080/api/oidc/userinfo
  -> ERPNext Desk session
```

## 6. Seed and verify projections

Seed a specific ready tenant to avoid accidentally selecting the wrong local site:

```bash
pnpm --filter erpnext-control-plane seed:sales -- --company-id=<company-uuid>
pnpm --filter erpnext-control-plane seed:operations -- --company-id=<company-uuid>
```

Then exercise the existing Operations, Supply Chain, Sales, Products, and Copilot browser surfaces. On Frappe v16, the sales seed can emit delivery-schedule warnings involving an empty `NOT IN` list; verify the seed's final counts and projection responses rather than treating those warnings alone as failure.

## Failure isolation

| Symptom | Check |
|---|---|
| Control-plane returns `environment_mismatch` | `ERPNEXT_TARGET_ENV` and `ERPNEXT_ENV` must both be `local`. |
| Provisioning remains pending | Control-plane health, `RUN_PROVISION_WORKER`, Docker availability, `erpnext.provision_jobs.last_error`. |
| SSO/users remain pending | Tenant must be `ready`; inspect WorkOS outbox attempts/error and confirm the two service tokens match. |
| Site returns the wrong tenant or 404 | Compose frontend must use `FRAPPE_SITE_NAME_HEADER: $host`; retain host port `8081`. |
| Token exchange cannot reach WorkOS | Frappe backend needs `host.docker.internal:host-gateway`; backend must listen on port `8080`. |
| Browser bridge sends user to `/auth` | No active Supabase session exists on `localhost:5173`; sign in and start a fresh ERPNext login flow. |
| `unauthorized_client` | Active WorkOS company, OIDC client's company, client ID, and exact callback URL must agree. |
| Frappe login succeeds with wrong/missing roles | Inspect desired users generated by `apps/backend/src/lib/erpnextOutbox.ts`, then managed-user state and Frappe User roles. Policy stays in WorkOS. |

## Durable recovery check

Stop the control-plane, mutate a WorkOS role or membership, and confirm the WorkOS mutation succeeds while the outbox remains pending. Restart the control-plane and confirm the command reaches `complete` and Frappe state converges.

## Automated verification

```bash
pnpm --filter @cybranex/erpnext-contracts test
pnpm --filter erpnext-control-plane test
pnpm --filter backend test:erpnext-architecture
pnpm typecheck:backend
pnpm typecheck:frontend
pnpm typecheck:erpnext-control-plane
```

## Authoritative files

- `apps/frontend/src/pages/OAuthAuthorizePage.tsx`
- `apps/frontend/src/pages/SettingsPage.tsx`
- `apps/backend/src/routes/oidc.ts`
- `apps/backend/src/lib/erpnextOutbox.ts`
- `apps/erpnext-control-plane/src/provisionWorker.ts`
- `apps/erpnext-control-plane/src/frappe/client.ts`
- `../infra/erpnext/pwd.yml`

## Update this runbook when

- ports, hostnames, environment variables, migration commands, SSO endpoints, callback paths, site naming, Compose routing, provisioning steps, or seed behavior changes.
