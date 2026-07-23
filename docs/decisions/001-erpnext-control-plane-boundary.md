# ADR 001: Separate ERPNext operational control from WorkOS

Status: accepted; implemented for local development and deployed to Azure on 2026-07-20.

Decision date: 2026-07-13. Deployment amendment: 2026-07-20. Frappe CRM amendment:
2026-07-21. Tenant-write amendment: 2026-07-22 (see the amendments below).

Last verified: 2026-07-22.

## Context

ERPNext is a separate operational system, but user identity, company membership, RBAC policy, BDT projections, and browser APIs are WorkOS concepts. Keeping all Frappe provisioning and credentials in the WorkOS backend mixed those operational concerns with product-domain policy. Splitting every layer into a package would instead create abstractions with only one consumer.

## Decision

Create an independently runnable `apps/erpnext-control-plane` and keep WorkOS-specific behavior in `apps/backend`.

- WorkOS remains the identity provider, RBAC authority, OIDC provider, command producer, projection owner, Copilot orchestrator, and browser-facing gateway.
- The control-plane becomes the sole owner of Frappe access, provisioning, tenant credentials/status, branding, SSO key application, managed users, record reads, and ERP development seeds.
- Applications communicate through protected internal HTTP endpoints validated by runtime Zod schemas.
- Create only `@cybranex/erpnext-contracts`, because both applications consume it.
- Keep the Frappe client private to the control-plane and WorkOS ERP projections private to the backend until a second real application consumer exists.
- Keep local and remote tenant/client state independently keyed by environment.

## Consequences

Positive:

- Frappe credentials and Docker access are removed from the WorkOS runtime.
- The control-plane runs, builds, and deploys independently (deployed to Azure 2026-07-20).
- WorkOS business mutations remain available during ERPNext outages through durable, coalesced commands.
- Ownership can be checked with an architecture test rather than relying only on convention.
- Local browser SSO exercises the same WorkOS identity boundary used by ERPNext.

Costs:

- Local development now runs four components: frontend, backend, control-plane, and Frappe.
- Provisioning, SSO, and user changes are eventually consistent and require observable retry state.
- Contract changes require coordinated updates to two applications.

## Rejected alternatives

### Keep all ERPNext code in WorkOS backend

Rejected because provisioning, credentials, Docker access, and raw Frappe operations are a distinct operational responsibility and prevent independent service ownership.

### Extract `erpnext-client` now

Rejected because only the control-plane calls Frappe. A package with one consumer would add indirection without shared ownership.

### Extract WorkOS ERP projections now

Rejected because only WorkOS consumes its BDT projections, recommendations, stories, and Copilot logic.

### Move identity and RBAC into the control-plane

Rejected because these are WorkOS product-domain concerns. The control-plane applies desired state; it does not decide policy.

## Guardrails

- `apps/backend/test/erpnextArchitecture.test.ts` forbids direct Frappe access in WorkOS and WorkOS-domain reads/imports in the control-plane.
- A new shared package is allowed only after at least two applications consume it.

## Deployment amendment (2026-07-20)

The control-plane was deployed to Azure Container Apps (`erpnext-control-plane`,
internal ingress, `ERPNEXT_ENV=remote`), fronting the existing ERPNext VM shim. The
boundary in this ADR is unchanged and still enforced by the architecture test. Two
consequences worth recording, because they were pragmatic choices rather than the
ideal end state:

- **The `erpnext` schema shares the WorkOS Supabase Postgres instance.** The ADR's
  isolation is preserved at the schema and code level, not the database level. A
  dedicated database would be the stronger form and remains open.
- **Deploys are manual** for the backend and control-plane (see
  `../runbooks/cloud-deploy.md`); CI automation is blocked on an Azure role grant, not
  on this decision.

## Frappe CRM amendment (2026-07-21)

Tenant sites now install a second Frappe app, `crm` (Frappe CRM), alongside `erpnext`.
This does not change the WorkOS/control-plane boundary — the control-plane still owns all
Frappe access, and WorkOS still owns interpretation — but it does change what the Sales
projection reads, so it is recorded here.

**Decision: adopt Frappe CRM for the pre-sale pipeline; keep native ERPNext for the ledger.**

- `CRM Lead` / `CRM Deal` become the source of truth for leads and deals. WorkOS's
  pipeline and lead/deal performance nodes read them. `CRM Organization` backs the
  firmographic/ICP view alongside them.
- `Customer`, `Contact`, `Territory`, `Quotation`, `Sales Order`, `Sales Invoice` stay on
  the native ERPNext doctypes, unchanged. Frappe CRM has no equivalent and does not aim to.
- Segmentation reads across both models: `industry` and `territory` exist on each side,
  while `no_of_employees` / `annual_revenue` are CRM-only and `market_segment` /
  `customer_group` are ERPNext-only. The ICP node reads `CRM Organization` (prospect pool)
  and `Customer` (won accounts) together so the two can be compared.
- The hand-off between the two is Frappe CRM's own first-party "ERPNext CRM Settings"
  integration (a won `CRM Deal` creates a real `Customer`/`Quotation`), not a custom bridge.

Why this shape: Frappe CRM ships **parallel** doctypes rather than extending
`Lead`/`Opportunity`, with its own permission model (`crm.permissions.org_hierarchy`,
not the Role Permission Manager). Installing it does not migrate or replace anything —
the two data models simply coexist, so the choice of which is authoritative has to be
made deliberately. Native `Lead`/`Opportunity` records are **not** migrated: no automated
migrator exists upstream, and the existing rows were test data only.

Consequences worth recording:

- **Frappe apps live in the image layer, not the `sites` volume.** `crm` therefore cannot
  be added to a running container, which forces a custom image (`infra/erpnext-image/`)
  for both local and remote stacks. This is new operational surface that did not exist
  when this ADR was written.
- **RBAC coverage is unverified.** `erpnextRoleMapping.ts` grants Frappe roles
  (`Sales User`/`Sales Manager`), but Frappe CRM gates `CRM Lead`/`CRM Deal` visibility
  through its own hierarchy hook. Whether the existing role grants are sufficient has not
  been tested with a real non-Administrator user.
- **The remote provisioning shim is duplicated logic.** Its `bench new-site` call must be
  kept in sync with `localProvision()` by hand; see `infra/erpnext-remote-shim/README.md`.

## Tenant-write amendment (2026-07-22)

Until now the control plane's entire Frappe write surface was tenant lifecycle:
`upsertUser`, `disableUser`, `applyBranding`, `configureSso`. Nothing in the repository
could write tenant *business* data, which is why no lead ever reached `CRM Lead`.

**Decision: WorkOS may write tenant business data, but only through purpose-specific,
allowlisted commands — never a generic doctype writer.**

Two commands exist:

- `PUT /internal/v1/tenants/:companyId/lead-sync` — configures Frappe CRM's Facebook lead
  syncing for a Meta lead form WorkOS just created.
- `PUT /internal/v1/tenants/:companyId/lead-attribution` — stamps the originating Meta ad
  onto already-synced leads.

Both follow the `configure_sso` shape: environment guard, `command_receipts` idempotency
short-circuit, apply, receipt. Each allowlists its own doctypes and fields internally, so
the caller never names a doctype. The alternative — one generic `POST /records/write`
guarded by a server-side allowlist — was rejected for v1: it makes the allowlist the whole
security boundary, and there is currently one consumer.

Why this does not breach the existing boundary: the control plane still owns all Frappe
HTTP access and credentials, and still reads no WorkOS data. WorkOS states desired tenant
configuration; the control plane decides how to apply it.

Two constraints discovered while implementing, both load-bearing:

- `Lead Sync Source.before_insert` calls Graph `/me/accounts`, which a Page-scoped token
  cannot do (`(#100) Tried accessing nonexisting field (accounts)`). The source is therefore
  inserted with a short-lived *discovery* token and switched to the Page-scoped token as the
  final step. Frappe stores Password values in `__Auth` (upserted) and writes only a `*****`
  mask to the doc column, so the swap leaves no residue in version history.
- That same `before_insert` is what creates the `Facebook Page` and `Facebook Lead Form`
  rows. WorkOS deliberately does not write those doctypes.

## Authoritative files

- `apps/backend/src/domains/workos-erp/erpnextSales.ts`
- `apps/backend/src/domains/workos-erp/erpnextSalesStories.ts`
- `apps/backend/src/lib/erpnextOutbox.ts`
- `apps/backend/src/lib/erpnextControlPlane.ts`
- `apps/backend/src/routes/oidc.ts`
- `apps/erpnext-control-plane/src/server.ts`
- `apps/erpnext-control-plane/src/provisionWorker.ts`
- `apps/erpnext-control-plane/src/frappe/client.ts`
- `apps/backend/src/domains/meta-ads/leadAttribution.ts`
- `packages/erpnext-contracts/src/index.ts`

## Update or supersede this ADR when

- identity/RBAC ownership changes, Frappe gains another direct application consumer, projections gain another application consumer, or the control-plane moves to its own database or a different hosting model;
- the authoritative doctypes for any part of the Sales domain change, or Frappe CRM replaces/absorbs more of the native ERPNext surface;
- a second consumer needs tenant writes, at which point the generic-writer alternative rejected above should be reconsidered.
