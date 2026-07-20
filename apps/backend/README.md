# FounderOS Backend (Phase 1)

Express service for Excel ingestion, canonical metric APIs, WorkOS integrations,
the read-only Meta Ads operating evidence/Decision Inbox, and isolated,
approval-gated Campaign Studio authoring.

## Deployment

Runs as the Azure Container App `startup-twin-backend` (RG `startup-digital-twin-rg`).
Deploys are currently **manual** — `az acr build` then `az containerapp update`; CI
automation is blocked on an Azure role grant. Env vars live on the Container App and
persist across image updates, so set them *before* deploying code that needs them.
Note `db/migrations/*.sql` are **not** applied automatically and are not shipped in
the image. Commands, env-var source of truth, and rollback:
`../../docs/runbooks/cloud-deploy.md`.

## Meta Ads operating loop

The backend stores 90 days of account/campaign and 60 days of ad-set/ad history,
refreshes the latest seven complete account-local days, generates deterministic
findings, and evaluates manually applied experiments. The worker schedules at
`01:30 UTC`; manual refreshes and async deep reports are durable and resumable.
The operating-loop Graph path is read-only; async Insights report creation is
its only allowed non-GET request and never changes an ad object.

See [`docs/architecture/meta-ads-operating-loop.md`](../../docs/architecture/meta-ads-operating-loop.md)
for ownership, migration, API, fixture, and verification details.

## Meta Ads Campaign Studio

Campaign Studio creates only Website Traffic campaigns with one broad,
lifetime-budget ad set and 1–3 single-image ads. A paid-media approver first
publishes all objects paused, then separately approves launch. The writer is
disabled by default, sandbox/allowlist gated, durable, idempotent, and isolated
from synchronization. See
[`docs/architecture/meta-ads-campaign-studio.md`](../../docs/architecture/meta-ads-campaign-studio.md)
and [`docs/runbooks/meta-ads-campaign-studio.md`](../../docs/runbooks/meta-ads-campaign-studio.md).

## Endpoints

- `GET /healthz`
- `POST /api/ingestion/excel/upload`
- `GET /api/ingestion/jobs/:jobId`
- `GET /api/metrics/:companyId`
- `GET /api/metrics/:companyId/:metricId`
- `POST /api/metrics/:companyId/draft`
- `POST /api/metrics/:companyId`
- `PATCH /api/metrics/:companyId/:metricId`
- `POST /api/metrics/:companyId/:metricId/values`
- `POST /api/metrics/:companyId/:metricId/links`
- `DELETE /api/metrics/:companyId/:metricId/links/:linkId`
- `POST /api/metrics/:companyId/impacts`
- `POST /api/metrics/:companyId/recompute`
- `GET /api/metrics/:companyId/rollups`
- `GET /api/integrations/meta/brief`
- `GET /api/integrations/meta/attention`
- `POST /api/integrations/meta/refresh`
- `GET /api/integrations/meta/sync-runs/:runId`
- `GET /api/integrations/meta/inbox`
- `GET /api/integrations/meta/experiments`
- `GET /api/integrations/meta/experiments/:experimentId`
- `GET /api/integrations/meta/assignees`
- Decision mutations under `/api/integrations/meta/findings/*` and
  `/api/integrations/meta/experiments/*`
- Campaign Studio readiness, brand, asset, draft, approval, job, launch, and
  pause routes under `/api/integrations/meta/*`

## Local setup

Run commands from the monorepo root.

1. Install workspace dependencies:

```bash
pnpm install
```

2. Copy `apps/backend/.env.example` to `apps/backend/.env` and fill the required
   values.
3. Apply pending timestamped migrations from `apps/frontend/supabase/migrations`
   to the database in `DATABASE_URL`. For the Meta Ads operating loop:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/frontend/supabase/migrations/20260714093000_meta_ads_operating_loop.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/frontend/supabase/migrations/20260715090000_meta_ads_decision_inbox.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/frontend/supabase/migrations/20260715100000_meta_ads_configuration_recalculation.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/frontend/supabase/migrations/20260716120000_meta_ads_campaign_studio.sql
```

4. Start the backend:

```bash
pnpm --filter backend dev
```

The worker loop starts in-process by default (`RUN_WORKER=true`).

Apply the active Supabase migrations before starting the service. To exercise
the Meta Ads UI without relying on non-zero sandbox delivery, seed a named
development scenario:

```bash
pnpm --filter backend seed:meta-ads-fixture -- --company-id=<uuid> --scenario=healthy
pnpm --filter backend seed:meta-ads-fixture -- --company-id=<uuid> --scenario=healthy --execute
```

The fixture also supports deep findings, active workflows, and deterministic
outcomes. The complete list and continuous browser-to-result procedure are in
[`docs/runbooks/meta-ads-decision-inbox.md`](../../docs/runbooks/meta-ads-decision-inbox.md).

Executing a fixture replaces the selected development company's current Meta
connection and fixture-account data. The `disconnected` scenario deletes all
Meta history, runs, and findings for that company. Always inspect the dry run;
fixtures are disabled when `NODE_ENV=production`.

## Build artifacts

`dist/` is a generated build artifact and is intentionally not tracked in git.
Run `npm run build` or `pnpm build` locally when you need the production bundle.

## Optional Gemini fallback

Set `GEMINI_API_KEY` to enable LLM classification for labels that dictionary,
fuzzy matching, and source profiles cannot confidently resolve.

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

If `GEMINI_API_KEY` is omitted, ingestion still works with deterministic
classification and review queue fallback.
