# Supabase Migrations

The active migration set was squashed on 2026-06-28 before production release.

Use these files for any fresh environment, in order:

1. `migrations/20260628210000_baseline_schema.sql`
2. `migrations/20260628210100_baseline_reference_seed.sql`

Why this exists:

- The previous `001`-`034` chain was dev-only history.
- The linked dev database had drift beyond the tracked `_migrations` table.
- The old chain was removed from the active repo after the squash.

Notes:

- The baseline was generated from the live linked Supabase schema on 2026-06-28.
- The seed file intentionally includes only system/global reference rows.
- Tenant/dev records were intentionally excluded from the new baseline.
