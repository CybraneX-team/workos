# ERPNext control-plane guide

Last verified: 2026-07-29.

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
- `db/migrations/001_control_plane.sql` through `003_provision_lifecycle.sql`: control-plane schema and provisioning lifecycle state.
- `scripts/migrate.ts`: schema migration command.
- `scripts/seed.ts`: local-only sales/operations seed dispatcher.
- `test/`: service-level tests currently present for credential encryption.

## Operational invariants

- The service process serves exactly one `ERPNEXT_ENV` (`local` or `remote`) and rejects mismatched requests.
- Provisioning is durably inserted before returning `202` and is idempotent by `(environment, idempotency_key)`. Active jobs persist `current_stage`, `stage_started_at`, and `heartbeat_at`.
- Record batches preserve per-query success/failure.
- User reconciliation receives the complete desired set; previously managed users omitted from it are disabled.
- SSO configuration returns retryable `tenant_not_ready` until credentials exist.
- Tenant business writes go through purpose-specific commands only (`lead-sync`, `lead-attribution`); each allowlists its own doctypes and fields, and callers never name a doctype. Do not add a generic record writer without revisiting ADR 001.
- `lead-sync` inserts `Lead Sync Source` with a **discovery (user) token**, then swaps in the Page-scoped token last. `before_insert` calls Graph `/me/accounts`, which a Page token cannot do (`(#100) Tried accessing nonexisting field (accounts)`). That same hook creates the `Facebook Page` / `Facebook Lead Form` rows, so this service must not write those doctypes.
- Local sites are named `erp-<slug>.localhost` and use `http://erp-<slug>.localhost:8081` for API and Desk URLs.
- Sites are provisioned with **three** Frappe apps: `erpnext`, then `crm` (Frappe CRM), then `workos_frappe_integration` (Cybranex-owned hooks). All must be in the custom image built from `infra/erpnext-image/`; Frappe apps live in the image layer, so provisioning fails if an `--install-app` target is absent.
- The remote provisioning shim (`/home/erpadmin/provision-shim/index.js` on `erpnext-vm`) has a version-controlled source mirror at `infra/erpnext-remote-shim/`. Nothing deploys automatically: verify and deploy the reviewed mirror manually before relying on its new behavior.
- Deploy that mirror only with `infra/erpnext-remote-shim/deploy.sh`. The `erpadmin` SSH account cannot restart the system service non-interactively; use SSH for preflight/verification and Azure Run Command for the privileged restart. Wait for both VM/agent readiness and the shim's bounded post-restart readiness loop. Never use an immediate health check or a fixed/stale rollout-status file.
- Local creation is serialized **inside the Frappe backend container** with a per-site `flock` and a 25-minute inner `timeout`; the outer Docker CLI has a 26-minute bound. A busy lock is retryable and does not consume an attempt. Inspect the active job heartbeat and container process, not a host-side `bench` process.
- **`completeSetup()` (`src/frappe/client.ts`) runs ERPNext's setup wizard** between provisioning and `applyBranding()`, before `status='ready'`, and `verifySetup()` then checks persisted `System Settings.setup_complete` plus the expected Company. Both setup entry points are `@frappe.whitelist()`, so they cover local and remote from one place — do not duplicate them into the shim. Order matters twice: `initialize_system_settings_and_user` must precede `setup_complete` (once frappe's stage is marked complete, `set_missing_values()` overwrites `country`/`currency`/`time_zone` from System Settings, so a retry would re-fail identically), and setup must precede branding (the wizard rewrites workspaces and Website Settings).
- Setup needs the company's locale facts, which arrive on `ProvisionTenantRequest` and are stored on `erpnext.provision_jobs` (migration `002`) because the worker claims the job later. Do not look them up here — reading `public.companies` breaks the boundary, and `test/erpnextArchitecture.test.ts` enforces that.
- The job lease is **30 minutes** and refreshes every 30 seconds while running. The inner
  site-creation timeout is 25 minutes, leaving time for setup and preventing a second worker
  from reclaiming an active job.
- `startProvisionWorker()` does not install its own signal handlers. `src/server.ts` owns
  shutdown: stop the worker, close HTTP, then close the pool. Do not reintroduce worker-only
  signal handlers that can leave `/healthz` alive after the loop stops.

## Verification

```bash
pnpm --filter erpnext-control-plane typecheck
pnpm --filter erpnext-control-plane test
pnpm --filter @cybranex/erpnext-contracts test
pnpm --filter backend test:erpnext-architecture
```

## Update this file when

- internal routes, schema tables, provisioning behavior, encryption, environment isolation, site naming, or direct Frappe access points change.
