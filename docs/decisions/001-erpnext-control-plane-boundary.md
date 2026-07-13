# ADR 001: Separate ERPNext operational control from WorkOS

Status: accepted and implemented for local development.

Decision date: 2026-07-13.

Last verified: 2026-07-13.

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
- The control-plane can run, build, and later deploy independently.
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
- Production deployment/cutover requires a separate decision and implementation review.

## Authoritative files

- `apps/backend/src/lib/erpnextOutbox.ts`
- `apps/backend/src/lib/erpnextControlPlane.ts`
- `apps/backend/src/routes/oidc.ts`
- `apps/erpnext-control-plane/src/server.ts`
- `apps/erpnext-control-plane/src/provisionWorker.ts`
- `apps/erpnext-control-plane/src/frappe/client.ts`
- `packages/erpnext-contracts/src/index.ts`

## Update or supersede this ADR when

- identity/RBAC ownership changes, Frappe gains another direct application consumer, projections gain another application consumer, or production control-plane deployment is designed.
