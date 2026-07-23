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
- Playwright automation patterns and known failure modes: `docs/runbooks/playwright-automation.md`
- Meta Ads operating loop and Decision Inbox: `docs/architecture/meta-ads-operating-loop.md`
- Continuous local Meta experiment verification: `docs/runbooks/meta-ads-decision-inbox.md`
- Meta Ads Campaign Studio writer boundary: `docs/architecture/meta-ads-campaign-studio.md`
- Campaign authoring fake/live-sandbox verification: `docs/runbooks/meta-ads-campaign-studio.md`
- Backend-specific invariants: `apps/backend/AGENTS.md`
- Control-plane-specific invariants: `apps/erpnext-control-plane/AGENTS.md`
- Cloud deployment (how each tier builds/deploys, config source of truth, rollback): `docs/runbooks/cloud-deploy.md`

## Repository map

- `apps/frontend`: WorkOS browser application. Its local instructions are in `apps/frontend/AGENTS.md`.
- `apps/backend`: WorkOS API, authentication, membership, RBAC, OIDC provider, ERP projections, and durable ERP command delivery.
- `apps/erpnext-control-plane`: independently runnable ERPNext operational service and the only application that may own Frappe credentials or call Frappe directly.
- `packages/erpnext-contracts`: runtime Zod contracts shared by the backend and control-plane.
- `packages/*`: add a shared package only when at least two applications consume it.
- `infra/erpnext-image`: build inputs (`apps.json`, `Containerfile`) for the custom Frappe image that bakes in both `erpnext` and `crm` (Frappe CRM). Frappe apps live in the image layer, so they cannot be added to a running container.
- `infra/erpnext-remote-shim`: version-controlled **mirror** of the provisioning shim running on the `erpnext-vm` Azure VM. Nothing deploys from it; the VM is the live source of truth. Its `bench new-site` call duplicates `localProvision()` and must be kept in sync by hand.
- `../infra/erpnext/pwd.yml`: sibling Docker Compose stack used for local Frappe/ERPNext. It is a `frappe_docker` clone with its own git remote — changes there are **not** tracked by this repo.

## ERPNext non-negotiable boundaries

- WorkOS owns identity, companies, memberships, RBAC policy and role computation, OIDC endpoints, browser-facing `/api/erpnext/*` routes, WorkOS projections, and Copilot orchestration.
- The control-plane owns Frappe HTTP access, tenant provisioning/status/credentials, branding, Social Login Key writes, managed Frappe users, record reads, and local seed/admin operations.
- The control-plane must not read WorkOS companies, memberships, profiles, RBAC, BDT, OIDC, or Supabase Auth data.
- WorkOS must not hold Frappe credentials or call Frappe resource endpoints directly.
- Do not create an `erpnext-client` or projection package while it has only one application consumer.
- The control-plane is deployed to Azure as of 2026-07-20 (internal-ingress Container App, `ERPNEXT_ENV=remote`) and fronts the existing ERPNext VM shim. Its `erpnext` schema shares the Supabase Postgres with WorkOS `public`; isolation is by schema plus the code boundary above, not a separate database. See `docs/runbooks/cloud-deploy.md`.
- Tenant sites run **two** Frappe apps: `erpnext` and `crm` (Frappe CRM), as of 2026-07-21. They are parallel data models — Frappe CRM's `CRM Lead`/`CRM Deal`/`CRM Organization` back WorkOS's pipeline and ICP projections, while native `Customer`/`Quotation`/`Sales Order`/`Sales Invoice` back accounts and revenue. Segmentation (`industry`, `territory`, and CRM-only `no_of_employees`/`annual_revenue`) is read across both. Repointing a Sales mapping at a different doctype without updating its story builder renders a silently empty dashboard; see `apps/backend/AGENTS.md`.
- WorkOS may write tenant business data as of 2026-07-22, but **only** through purpose-specific allowlisted control-plane commands (`lead-sync`, `lead-attribution`) — never a generic doctype writer. See `docs/decisions/001-erpnext-control-plane-boundary.md`.
- Campaign Studio can publish Meta lead-form campaigns whose submissions sync into `CRM Lead`; see `docs/architecture/meta-ads-campaign-studio.md`.

## Useful verification commands

```bash
pnpm build:packages
pnpm typecheck:backend
pnpm typecheck:frontend
pnpm typecheck:erpnext-control-plane
pnpm --filter @cybranex/erpnext-contracts test
pnpm --filter erpnext-control-plane test
pnpm --filter backend test:erpnext-architecture
pnpm --filter backend test:sales-stories
```

Nothing runs these automatically — there is no `.github/workflows/` in this repository.

Run the narrowest relevant checks first, then broaden in proportion to the change.

## Maintaining agent memory

When architecture, ports, commands, ownership, migrations, or acceptance behavior changes, update the relevant document in the same change. Every durable document should identify:

- when it was last verified;
- the authoritative files to inspect;
- how to verify its claims;
- events that require the document to be updated.

Never store secrets, access tokens, passwords, encrypted credential values, transient test users/company IDs/site names, or raw production/customer data in agent documentation. Prefer stable paths and reproducible queries over copied implementation dumps.

## Repository status (read before committing)

- **This repository is PUBLIC** (made public 2026-07-20 so Vercel's Hobby plan could Git-deploy it). Anything committed here — including anything added to git history — is world-readable. Never commit `.env` files, credentials, tokens, connection strings, or customer data. Configuration values belong in the Azure Container App env and the Vercel project env; see `docs/runbooks/cloud-deploy.md`.
- **History was rewritten on 2026-07-20** (`git filter-repo`) to purge two committed secrets — a dead Azure App Service Kudu password in `apps/backend/deploy.sh` and a Supabase anon key in `apps/frontend/AI.context.md` — and `main` plus `agent/extract-erpnext-control-plane` were force-pushed. **Every commit hash before that date changed.** A clone made earlier will not fast-forward: re-clone, or `git fetch origin && git reset --hard origin/main`. The obsolete `deploy.sh` / `deploy-azure.sh` were removed entirely; use the runbook's deploy commands instead.
