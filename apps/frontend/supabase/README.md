# Supabase Migrations

The active migration set was squashed on 2026-06-28 before production release.

Use all files in `migrations/` for a fresh environment, in filename order. The
first two files are the squashed baseline:

1. `migrations/20260628210000_baseline_schema.sql`
2. `migrations/20260628210100_baseline_reference_seed.sql`

Later timestamped files are additive migrations and must also be applied in
order. `config.toml` defines the disposable local stack. From the monorepo root:

```sh
pnpm local:setup
pnpm test:local:native
pnpm test:local:sales
pnpm verify:local:phase2
pnpm dev:local
```

Use `supabase db reset --workdir apps/frontend` only for the disposable local
database. Never point local reset or the native DB suite at a shared/remote database;
the suite independently refuses non-local database hosts.

The current Meta Ads additions are:

- `20260714093000_meta_ads_operating_loop.sql`
- `20260715090000_meta_ads_decision_inbox.sql`
- `20260715100000_meta_ads_configuration_recalculation.sql`
- `20260716120000_meta_ads_campaign_studio.sql`
- `20260722000000_meta_ads_lead_forms.sql`
- `20260803090000_business_diagnoses.sql`
- `20260808100000_native_crm_catalog.sql`
- `20260808110000_runtime_role_grants.sql`
- `20260810100000_native_business_security.sql`
- `20260810110000_native_sales_documents.sql`

Their backend mirrors are `036_meta_ads_operating_loop.sql` and
`037_meta_ads_decision_inbox.sql`, `038_meta_ads_configuration_recalculation.sql`,
`039_meta_ads_campaign_studio.sql`, `040_meta_ads_lead_forms.sql`, and
`041_business_diagnoses.sql`, `042_native_crm_catalog.sql`, and
`043_native_business_security.sql`, and `044_native_sales_documents.sql`; keep domain migration pairs byte-identical. These
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
