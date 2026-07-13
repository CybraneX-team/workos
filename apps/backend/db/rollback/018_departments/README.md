# 018 Departments Rollback Archive

This folder keeps the rollback material for the dev database change that normalized departments into canonical company-scoped records.

## What Happened

- Migration applied: `applied_018_departments.sql`
- Rollback script: `rollback_018_departments.sql`
- Preflight live dev snapshot: `live-dev-preflight-snapshot-2026-06-19T13-41-55-686Z.json`
- Snapshot timestamp: `2026-06-19T13:41:55.686Z`
- Snapshot scope: `companies`, `company_members`, and row counts only.
- Snapshot counts before migration:
  - `companies`: 38
  - `company_members`: 26
  - `user_profiles`: 34

The migration was applied directly against the live dev Supabase database from the local backend environment. It was not applied through Supabase CLI migration tracking in this session.

## Post-Migration Verification

After applying the migration, the live dev database had:

- `companies`: 38
- `departments`: 494
- `department_bdt_nodes`: 2964
- `department_teams`: 988
- `department_projects`: 988
- `department_processes`: 494
- `department_metric_links`: 494
- Companies with zero departments: 0
- `company_members.department_id`: present
- Seed idempotency check: passed for one sampled company

## Rollback Behavior

Running `rollback_018_departments.sql` will:

- Drop the `company_members.department_id` foreign key and column.
- Drop the default department seed functions.
- Drop the normalized department and BDT detail tables.

This removes normalized department data created after the migration. Export any department records you want to keep before running it.

## Safest Rollback Steps

1. Take a fresh backup/export of the live dev database.
2. Confirm the app is not actively writing department data.
3. Run `rollback_018_departments.sql` manually.
4. Verify that the dropped tables are gone and `company_members.department_id` no longer exists.
5. If needed, use the preflight snapshot in this folder to compare original `companies` and `company_members` rows.

If `psql` is available:

```bash
psql "$DATABASE_URL" -f db/rollback/018_departments/rollback_018_departments.sql
```

If using this backend's local Node environment, the Supabase pooler worked from this machine on port `6543`:

```bash
DATABASE_URL="$(node -e "require('dotenv').config(); const u = new URL(process.env.DATABASE_URL); u.port = '6543'; process.stdout.write(u.toString())")" \
node --input-type=module -e "import fs from 'node:fs'; import pg from 'pg'; const { Pool } = pg; const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await pool.query(fs.readFileSync('db/rollback/018_departments/rollback_018_departments.sql', 'utf8')); await pool.end();"
```

## File Checksums

```text
5cdea1be027b9a388597bf83177d21fdf934802b7cbca111f861b10f38d2255c  applied_018_departments.sql
fed89b75b9594e1f8dd6028238664ee1672f6754539d49659f269ab1a3cba8c3  live-dev-preflight-snapshot-2026-06-19T13-41-55-686Z.json
3ded43acdc71e80dbc7716606687647fc95edcd51fdc2bde61d19ad9100f221d  rollback_018_departments.sql
```
