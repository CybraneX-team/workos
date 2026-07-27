# Supabase Migrations

> **This database also hosts the ERPNext control-plane's `erpnext` schema** (added
> 2026-07-20, applied via `pnpm --filter erpnext-control-plane db:migrate`). The files
> here manage the WorkOS `public` schema only — do not add `erpnext.*` objects here, and
> do not assume `public` is the only schema present. See
> `../../../docs/runbooks/cloud-deploy.md`.
>
> ⚠️ The `supabase_migrations` ledger is **stale/unreliable** — it lists only a subset of
> what is actually applied (migrations have been applied by hand). Verify state by
> checking whether tables/columns exist, not by reading the ledger.

The active migration set was squashed on 2026-06-28 before production release.

Use all files in `migrations/` for a fresh environment, in filename order. The
first two files are the squashed baseline:

1. `migrations/20260628210000_baseline_schema.sql`
2. `migrations/20260628210100_baseline_reference_seed.sql`

Later timestamped files are additive migrations and must also be applied in
order. This repository does not currently include a Supabase CLI `config.toml`.
Apply a specific pending migration from the monorepo root with:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/frontend/supabase/migrations/<migration>.sql
```

Do not reapply the baseline to an existing database. Determine which migrations
are pending before applying them, and back up shared environments first.

The current Meta Ads additions are:

- `20260714093000_meta_ads_operating_loop.sql`
- `20260715090000_meta_ads_decision_inbox.sql`
- `20260715100000_meta_ads_configuration_recalculation.sql`
- `20260716120000_meta_ads_campaign_studio.sql`
- `20260722000000_meta_ads_lead_forms.sql`

Their backend mirrors are `036_meta_ads_operating_loop.sql` and
`037_meta_ads_decision_inbox.sql`, `038_meta_ads_configuration_recalculation.sql`,
`039_meta_ads_campaign_studio.sql`, and `040_meta_ads_lead_forms.sql`; keep each pair byte-identical. These
migrations are additive and safe to re-run, but a shared-database backup is
still required before applying them.

Why this exists:

- The previous `001`-`034` chain was dev-only history.
- The linked dev database had drift beyond the tracked `_migrations` table.
- The old chain was removed from the active repo after the squash.

Notes:

- The baseline was generated from the live linked Supabase schema on 2026-06-28.
- The seed file intentionally includes only system/global reference rows.
- Tenant/dev records were intentionally excluded from the new baseline.
