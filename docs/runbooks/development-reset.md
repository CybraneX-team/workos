# Guarded development reset

Last verified: 2026-08-10.

The reset removes company-owned application data and Supabase Auth users from the explicitly selected shared development project. Company cascades include native CRM, catalogue, inventory, Meta lead bindings, commercial profiles, quotes, orders, invoices, and payments. It creates a PostgreSQL custom-format backup first and restores system role reference rows afterward.

For disposable local development, start Supabase and rebuild it from every migration:

```bash
pnpm local:setup
pnpm --filter backend exec supabase db reset --workdir "$(pwd)/apps/frontend"
pnpm verify:local:phase2
pnpm dev:local
```

The local helpers read credentials from the running local Supabase process and override application environment values. The database suites additionally reject remote database hosts.

Run a dry run:

```bash
pnpm --filter backend reset:development
```

Then execute only after verifying the displayed project reference and counts:

```bash
pnpm --filter backend reset:development -- --execute \
  --confirm=DELETE_SHARED_WORKOS_DEVELOPMENT_DATA \
  --project-ref=<exact-project-ref-from-dry-run>
```

Required environment: `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`; `pg_dump` must be installed. Backups are written under `backups/development-reset/`. Verify `public.companies`, `public.company_members`, native CRM/catalogue tables, and `auth.users` are empty, while system roles have been restored.
