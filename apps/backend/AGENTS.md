# WorkOS backend guide

Last verified: 2026-07-13.

This application is the WorkOS-side owner of the ERPNext integration. Read `../../docs/architecture/erpnext-control-plane.md` before changing ERP boundaries.

## This app owns

- Supabase authentication, companies, memberships, profiles, departments, and WorkOS RBAC.
- Conversion of WorkOS membership/grant state into the complete desired Frappe user/role set.
- OIDC `/authorize`, `/token`, and `/userinfo` endpoints and encrypted OIDC client secrets.
- The environment-scoped `public.erpnext_command_outbox` and its local/remote dispatcher.
- WorkOS-specific ERP projections, recommendations, stories, rollups, and ERP-backed Copilot behavior.
- Browser-facing `/api/erpnext/*` routes, including `/api/erpnext/status`.

## This app does not own

- Frappe API credentials, site creation, branding, Social Login Key writes, Frappe user mutation, or direct `/api/resource/*` calls.
- Generic ERPNext operational state.

All ERPNext operations cross `src/lib/erpnextControlPlane.ts` using `@cybranex/erpnext-contracts`. The architecture test rejects direct Frappe access.

## Entry points

- `src/server.ts`: route registration and worker startup.
- `src/lib/erpnextOutbox.ts`: coalesced provisioning, SSO, and user-reconciliation commands; 30-minute safety reconciliation.
- `src/lib/erpnextControlPlane.ts`: authenticated internal client.
- `src/routes/oidc.ts`: OIDC grant flow and idempotent clients keyed by company/environment/provider.
- `src/lib/erpnextRoleMapping.ts`: WorkOS-to-Frappe role computation.
- `src/domains/workos-erp/`: WorkOS projections and public ERP routes.
- `src/adapters/erpnext.ts`: projection-facing reads implemented through batch queries.
- `db/migrations/035_erpnext_control_plane_outbox.sql`: OIDC ownership and outbox schema.
- `test/erpnextArchitecture.test.ts`: executable ownership boundary.
- `scripts/reset-development-data.ts`: destructive, guarded shared-project reset.

## Implementation rules

- Company creation enqueues `provision_tenant`, `configure_sso`, and `reconcile_users`.
- Membership/RBAC changes must succeed independently of ERPNext availability and enqueue a coalesced company reconciliation.
- Keep commands scoped by `ERPNEXT_TARGET_ENV`; a local worker must not claim remote commands.
- Never put a plaintext OIDC client secret in the outbox. The dispatcher may decrypt it only immediately before the protected SSO call.
- Preserve existing browser endpoint paths and response shapes when moving internals.
- Keep BDT reads, business projections, prompts, recommendations, and role policy here.

## Verification

```bash
pnpm --filter backend typecheck
pnpm --filter backend test:erpnext-architecture
pnpm --filter backend test:metrics
```

Also run contract and control-plane tests when changing the internal API.

## Update this file when

- an ERP route, worker, migration, ownership boundary, environment rule, or source entry point changes;
- a new application starts consuming ERP integration code and package ownership must be reconsidered.
