# ERPNext control-plane guide

Last verified: 2026-07-21.

This Express service runs independently on port `8090`. Read `../../docs/architecture/erpnext-control-plane.md` and `../../docs/runbooks/local-erpnext-sso.md` before changing provisioning or SSO.

## Deployed instance

A `remote` instance runs in Azure as Container App `erpnext-control-plane`
(env `startup-twin-env`, RG `startup-digital-twin-rg`, **internal ingress** — reachable
only from the backend in the same environment, not the public internet). Deploy commands
and env-var source of truth: `../../docs/runbooks/cloud-deploy.md`.

Operational notes for that instance:

- `INTERNAL_SERVICE_TOKEN` **must exactly equal** the backend's `ERPNEXT_CONTROL_PLANE_TOKEN`, or every `/internal/v1/*` call fails `401 unauthorized`.
- `ERPNEXT_CREDENTIALS_KEY` must be exactly 64 hex chars and is **not** interchangeable with the backend's `ENCRYPTION_KEY`. Changing it makes every stored tenant credential undecryptable.
- Its `erpnext` schema currently lives in the same Supabase Postgres as WorkOS `public`. Apply schema changes with `pnpm --filter erpnext-control-plane db:migrate` and `DATABASE_URL` set; nothing applies migrations automatically.
- `ERPNEXT_ENV` must be `remote` there; the process rejects mismatched-environment requests by design.

## This app owns

- Local Docker and remote-shim tenant provisioning.
- The `erpnext` Postgres schema, tenant lifecycle, provision jobs, managed-user snapshots, and command receipts.
- AES-256-GCM encryption of tenant API keys/secrets with `ERPNEXT_CREDENTIALS_KEY`.
- Direct Frappe HTTP calls, branding, Social Login Key application, Frappe user upsert/disable, record reads, and local seed scripts.

## Forbidden dependencies

- Do not import `apps/backend` or query WorkOS tables such as companies, memberships, profiles, departments, OIDC, BDT, or Supabase Auth.
- Do not compute WorkOS policy or desired roles here. The backend sends the complete desired managed-user set.
- Do not expose `/internal/v1/*` without the shared bearer token. Only `/healthz` is public.
- Do not return Frappe credentials to WorkOS or the browser.

These rules are checked by `apps/backend/test/erpnextArchitecture.test.ts`.

## Entry points

- `src/server.ts`: internal API, authentication, environment isolation, and request validation.
- `src/provisionWorker.ts`: local/remote provisioning, retries, branding, and encrypted credential persistence.
- `src/frappe/client.ts`: the only direct Frappe HTTP adapter.
- `src/tenantStore.ts`: safe status and credential resolution.
- `src/crypto.ts`: authenticated tenant-credential encryption.
- `db/migrations/001_control_plane.sql`: control-plane schema.
- `scripts/migrate.ts`: schema migration command.
- `scripts/seed.ts`: local-only sales/operations seed dispatcher.
- `test/`: service-level tests currently present for credential encryption.

## Operational invariants

- The service process serves exactly one `ERPNEXT_ENV` (`local` or `remote`) and rejects mismatched requests.
- Provisioning is durably inserted before returning `202` and is idempotent by `(environment, idempotency_key)`.
- Record batches preserve per-query success/failure.
- User reconciliation receives the complete desired set; previously managed users omitted from it are disabled.
- SSO configuration returns retryable `tenant_not_ready` until credentials exist.
- Local sites are named `erp-<slug>.localhost` and use `http://erp-<slug>.localhost:8081` for API and Desk URLs.
- Sites are provisioned with **two** Frappe apps: `erpnext`, then `crm` (Frappe CRM). Both stacks must run the custom image built from `infra/erpnext-image/` — Frappe apps live in the image layer, so `crm` cannot be added to a running container. Provisioning a site with an image that lacks `crm` fails at `bench new-site --install-app crm`.
- The remote provisioning shim (`/home/erpadmin/provision-shim/index.js` on `erpnext-vm`) mirrors `localProvision()`'s `bench new-site` call. Changing install-app behavior here requires editing that file on the VM too, or the two paths silently diverge. A mirror is version-controlled at `infra/erpnext-remote-shim/`, but **nothing deploys from it** — the VM is still the live source of truth, so update both by hand.
- `localProvision()` runs `bench new-site` as a **host** process via `docker compose exec`, taking several minutes (longer under arm64 emulation) and logging nothing on success. It is not visible to `ps` inside the container; check the host with `ps aux | grep 'bench new-site'` before assuming a job is stuck.

## Verification

```bash
pnpm --filter erpnext-control-plane typecheck
pnpm --filter erpnext-control-plane test
pnpm --filter @cybranex/erpnext-contracts test
pnpm --filter backend test:erpnext-architecture
```

## Update this file when

- internal routes, schema tables, provisioning behavior, encryption, environment isolation, site naming, or direct Frappe access points change.
