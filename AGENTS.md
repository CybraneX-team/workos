<!-- CODEGRAPH_START -->
## CodeGraph

If a ".codegraph" directory exists, use CodeGraph before text search for code-location and call-path questions. Otherwise use the source directly.
<!-- CODEGRAPH_END -->

# Repository guide for AI agents

Read the nearest AGENTS.md before changing files. Source, migrations, and tests are authoritative.

## Start here

- Native CRM and catalogue: docs/architecture/native-crm-catalog.md
- Native quote-to-cash: docs/architecture/native-sales-documents.md
- Meta Campaign Studio: docs/architecture/meta-ads-campaign-studio.md
- Meta operating loop: docs/architecture/meta-ads-operating-loop.md
- BDT taxonomy: docs/architecture/bdt-taxonomy-and-seeding.md
- Development reset: docs/runbooks/development-reset.md
- Cloud deployment: docs/runbooks/cloud-deploy.md
- Backend invariants: apps/backend/AGENTS.md
- Frontend invariants: apps/frontend/AGENTS.md

## Repository map and boundaries

- apps/frontend is the authenticated WorkOS browser application.
- apps/backend owns HTTP APIs, Postgres data, background jobs, identity integration, RBAC, native CRM/catalogue, and provider integrations.
- packages contains shared code only when at least two applications consume it.
- Native business records are always company-scoped. Routes derive company_id from the verified JWT and repositories repeat the company predicate.
- Do not add a generic resource API, repository framework, workflow engine, event bus, or another service for native business domains.
- Product and Sales workspaces are native. Operations is a dependency-free placeholder until its own model is designed.
- The repository is public. Never commit secrets, tokens, connection strings, or customer data.

## Verification

```bash
pnpm build:packages
pnpm typecheck:backend
pnpm typecheck:frontend
pnpm --filter backend test:native-architecture
pnpm test:local:native
pnpm test:local:sales
pnpm verify:local:phase2
pnpm --filter backend test:bdt
pnpm --filter backend test:meta-ads
```

Run narrow checks first, then broaden in proportion to the change. Update durable documentation when ownership, commands, migrations, or acceptance behavior changes.
