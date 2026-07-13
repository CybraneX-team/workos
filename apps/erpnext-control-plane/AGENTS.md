# ERPNext control-plane guide

Last verified: 2026-07-13.

This Express service runs independently on port `8090`. Read `../../docs/architecture/erpnext-control-plane.md` and `../../docs/runbooks/local-erpnext-sso.md` before changing provisioning or SSO.

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

## Verification

```bash
pnpm --filter erpnext-control-plane typecheck
pnpm --filter erpnext-control-plane test
pnpm --filter @cybranex/erpnext-contracts test
pnpm --filter backend test:erpnext-architecture
```

## Update this file when

- internal routes, schema tables, provisioning behavior, encryption, environment isolation, site naming, or direct Frappe access points change.
