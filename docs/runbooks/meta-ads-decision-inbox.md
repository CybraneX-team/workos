# Local Meta Ads Decision Inbox verification

Last verified: 2026-07-22.

Use this runbook to exercise one continuous experiment from deterministic
finding through frozen result. It is development-only and deliberately uses a
fixture connection because Meta sandbox delivery cannot reliably create
non-zero findings.

Read `../architecture/meta-ads-operating-loop.md` and
`playwright-automation.md` first. Never run fixture commands against a real
company or production database.

## 1. Back up and apply the additive migrations

Confirm that `DATABASE_URL` identifies the intended development Supabase
project. Create a timestamped custom-format backup before applying SQL:

```sh
mkdir -p /tmp/cybranex-meta-ads-backups
pg_dump "$DATABASE_URL" --format=custom \
  --file="/tmp/cybranex-meta-ads-backups/pre-decision-inbox-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Apply the minimum timestamped migrations for the Decision Inbox in order:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/frontend/supabase/migrations/20260714093000_meta_ads_operating_loop.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/frontend/supabase/migrations/20260715090000_meta_ads_decision_inbox.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/frontend/supabase/migrations/20260715100000_meta_ads_configuration_recalculation.sql
```

Verify the service-local mirrors have not drifted:

```sh
cmp apps/backend/db/migrations/036_meta_ads_operating_loop.sql \
  apps/frontend/supabase/migrations/20260714093000_meta_ads_operating_loop.sql
cmp apps/backend/db/migrations/037_meta_ads_decision_inbox.sql \
  apps/frontend/supabase/migrations/20260715090000_meta_ads_decision_inbox.sql
cmp apps/backend/db/migrations/038_meta_ads_configuration_recalculation.sql \
  apps/frontend/supabase/migrations/20260715100000_meta_ads_configuration_recalculation.sql
```

Campaign Studio and lead-form support have later additive migrations (`039`/`040`).
Apply them through `meta-ads-campaign-studio.md` when that surface is enabled; do not
mistake this focused Decision Inbox sequence for the complete current migration set.

## 2. Prove the disposable automated path

This creates a uniquely named RBAC company and Auth users, seeds the minimum
Paid Acquisition BDT, tests every DB-backed role, runs the browser flows, and
cleans up afterward. Isolated ports avoid stale development servers:

```sh
RBAC_E2E_ALLOW_SHARED_DEV=true \
E2E_BACKEND_PORT=8084 E2E_PORT=5176 \
E2E_BACKEND_URL=http://127.0.0.1:8084 \
E2E_BASE_URL=http://127.0.0.1:5176 \
pnpm --filter frontend test:e2e:meta-ads
```

The explicit shared-development gate is required by the fixture safety check.
Do not weaken that check.

## 3. Prepare a manual disposable company

Create a disposable company through the normal local WorkOS flow and add an
active member with `analytics:write`. Copy the company UUID only after checking
its name and slug in the development database.

Preview the actionable fixture:

```sh
pnpm --filter backend seed:meta-ads-fixture -- \
  --company-id=<disposable-company-uuid> \
  --scenario=ad-response-decline
```

After checking the printed company/account, execute it:

```sh
pnpm --filter backend seed:meta-ads-fixture -- \
  --company-id=<disposable-company-uuid> \
  --scenario=ad-response-decline \
  --execute
```

This replaces Meta fixture data only for the selected company. It never calls
Meta and is rejected when `NODE_ENV=production`.

## 4. Start and apply through the browser

Start backend and frontend with the worker disabled so another job cannot move
the deterministic fixture while it is being inspected:

```sh
RUN_WORKER=false pnpm --filter backend dev
pnpm --filter frontend dev
```

Open:

```text
http://localhost:5173/universal?focus=mkt_paid_acquisition&openHub=1&tab=inbox
```

In the browser:

1. Open **Founder video shows response decline under repetition pressure**.
2. Verify the campaign, ad set, ad, current/prior CTR, spend exposure, and
   unchanged variables.
3. Start the experiment with an owner and due date.
4. Use **Open in Ads Manager** only to inspect the deep link; the fixture is not
   a real Meta object.
5. Choose **Mark applied**, add a short implementation note, confirm the
   prescribed change, and keep the budget guardrail set to **Yes**.
6. Copy the experiment UUID from the authenticated experiment API or the
   `meta_ads_experiments` row for this disposable company.

## 5. Advance the same stored experiment

Preview a deterministic improved post-change window:

```sh
pnpm --filter backend advance:meta-ads-experiment-fixture -- \
  --experiment-id=<experiment-uuid> \
  --outcome=improved
```

After verifying the experiment/company/account in the output, execute it:

```sh
pnpm --filter backend advance:meta-ads-experiment-fixture -- \
  --experiment-id=<experiment-uuid> \
  --outcome=improved \
  --execute
```

The command works only for a measuring fixture-backed ad-set CTR experiment.
It rewrites only its deterministic post-change delivery dates, rebases the
fixture clock, runs the real evaluator, and prints the stored status/outcome.
Alternative outcomes are `worsened`, `no-clear-change`, `day-7-low-volume`, and
`day-14-inconclusive`.

## 6. Verify frozen learning

Reload the hub, open **Results**, and verify:

- outcome and confidence;
- the matching frozen 7- or 14-day baseline;
- frozen result metrics and explanation;
- started, applied, extended (when applicable), and evaluated events;
- owner snapshot and Ads Manager link.

Then alter one normalized source row in the disposable fixture or run an
attribution recalculation and confirm the completed experiment result does not
change. The DB lifecycle suite performs this assertion automatically.

## 7. Run focused verification

```sh
pnpm --filter backend typecheck
pnpm --filter backend test:meta-ads
pnpm --filter backend test:meta-ads-db
pnpm --filter frontend build
pnpm --filter frontend lint
```

The opt-in live Meta sandbox test proves authentication, account discovery,
granular read access, and empty-data handling only:

```sh
pnpm --filter backend test:meta-sandbox-live
```

Do not use the sandbox result to claim non-zero delivery or outcome coverage;
those remain deterministic fixture tests.
