<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

# Repository guide for AI agents

Read the nearest `AGENTS.md` before changing files. Treat this file as a navigation index; source code, migrations, and tests remain authoritative.

## Start here

- ERPNext architecture and current ownership: `docs/architecture/erpnext-control-plane.md`
- Why this boundary exists: `docs/decisions/001-erpnext-control-plane-boundary.md`
- Local browser SSO setup and verification: `docs/runbooks/local-erpnext-sso.md`
- Guarded development reset: `docs/runbooks/development-reset.md`
- Backend-specific invariants: `apps/backend/AGENTS.md`
- Control-plane-specific invariants: `apps/erpnext-control-plane/AGENTS.md`

## Repository map

- `apps/frontend`: WorkOS browser application. Its local instructions are in `apps/frontend/AGENTS.md`.
- `apps/backend`: WorkOS API, authentication, membership, RBAC, OIDC provider, ERP projections, and durable ERP command delivery.
- `apps/erpnext-control-plane`: independently runnable ERPNext operational service and the only application that may own Frappe credentials or call Frappe directly.
- `packages/erpnext-contracts`: runtime Zod contracts shared by the backend and control-plane.
- `packages/*`: add a shared package only when at least two applications consume it.
- `../infra/erpnext/pwd.yml`: sibling Docker Compose stack used for local Frappe/ERPNext.

## ERPNext non-negotiable boundaries

- WorkOS owns identity, companies, memberships, RBAC policy and role computation, OIDC endpoints, browser-facing `/api/erpnext/*` routes, WorkOS projections, and Copilot orchestration.
- The control-plane owns Frappe HTTP access, tenant provisioning/status/credentials, branding, Social Login Key writes, managed Frappe users, record reads, and local seed/admin operations.
- The control-plane must not read WorkOS companies, memberships, profiles, RBAC, BDT, OIDC, or Supabase Auth data.
- WorkOS must not hold Frappe credentials or call Frappe resource endpoints directly.
- Do not create an `erpnext-client` or projection package while it has only one application consumer.
- Production ERPNext deployment and traffic cutover are not implemented by this local architecture.

## Useful verification commands

```bash
pnpm build:packages
pnpm typecheck:backend
pnpm typecheck:frontend
pnpm typecheck:erpnext-control-plane
pnpm --filter @cybranex/erpnext-contracts test
pnpm --filter erpnext-control-plane test
pnpm --filter backend test:erpnext-architecture
```

Run the narrowest relevant checks first, then broaden in proportion to the change.

## Maintaining agent memory

When architecture, ports, commands, ownership, migrations, or acceptance behavior changes, update the relevant document in the same change. Every durable document should identify:

- when it was last verified;
- the authoritative files to inspect;
- how to verify its claims;
- events that require the document to be updated.

Never store secrets, access tokens, passwords, encrypted credential values, transient test users/company IDs/site names, or raw production/customer data in agent documentation. Prefer stable paths and reproducible queries over copied implementation dumps.
