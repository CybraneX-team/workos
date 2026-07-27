# Guarded development reset runbook

Last verified: 2026-07-23.

Scope: destructive reset of the configured shared Supabase development project and local `.localhost` Frappe sites only.

## What it removes

- Company-owned application data through truncation and foreign-key cascades.
- Companies, memberships, profiles, legacy ERPNext connection/provisioning rows, WorkOS ERP command rows, OIDC clients/codes/tokens, and all Supabase Auth users.
- Every table in the control-plane-owned `erpnext` schema.
- Local Frappe sites matching `erp-<slug>.localhost`.
- Auth-owned public rows discovered from foreign keys; required references are truncated and nullable audit references are cleared.

It does not delete ERPNext VM sites. The script's site matcher only accepts local `.localhost` names. It restores the system role reference seed after deletion.

A stopped local Frappe stack no longer aborts the reset (changed 2026-07-22): `localSites()`
returns `null`, the run reports `localFrappeSites: "unreachable (local stack not running)"`,
warns, and skips local site deletion. This matters for remote-only setups
(`ERPNEXT_ENV=remote`), where nothing runs locally. Any local sites then survive as
orphans exactly like VM sites do — see step 4.

> ⚠️ **Changed 2026-07-20 — this reset now affects the deployed control-plane.**
> The Azure-deployed `erpnext-control-plane` (`ERPNEXT_ENV=remote`) uses the **same**
> Supabase project's `erpnext` schema. Because this script truncates every table in
> that schema, running it will delete the **remote** tenants, provision jobs, and
> encrypted Frappe credentials as well as local ones — even though the ERPNext VM
> sites themselves survive. The result is orphaned VM sites that WorkOS no longer
> knows about, and per-company ERPNext access breaking until those tenants are
> re-provisioned.
>
> Before running: confirm nobody depends on the deployed ERPNext integration, and
> treat the `erpnext` schema rows as production-shaped data even in development.
> See `cloud-deploy.md` for the deployed topology.

## Safety gates

Execution requires all of the following:

- a dry run first;
- explicit `--execute`;
- exact phrase `--confirm=DELETE_SHARED_WORKOS_DEVELOPMENT_DATA`;
- exact `--project-ref=<value shown by dry run>`;
- a successful timestamped PostgreSQL custom-format backup;
- Frappe site backups before deletion when local sites exist.

The Supabase project reference is derived from `SUPABASE_URL`; do not copy a remembered value from documentation or another environment.

## Prerequisites

- Backend environment has valid `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
- `pg_dump`, Docker, and Docker Compose are available.
- The local Frappe stack is running, if you have one, so sites can be listed and backed up. A stopped stack is tolerated — the reset proceeds and skips local site deletion.
- `az` CLI access to `erpnext-vm`, for step 4.
- The operator understands that Auth users and data visible to any application connected to the displayed shared project will be deleted.

## 1. Dry run

From the repository root:

```bash
pnpm --filter backend reset:development
```

Read and independently confirm:

- `mode` is `dry-run`;
- `sharedSupabaseProjectRef` is the intended development project;
- company and Auth user counts are plausible;
- every listed Frappe site is a disposable local `.localhost` site;
- `productionFrappeSitesWillBeDeleted` is `false`.

Stop if any value is unexpected.

## 2. Execute with the displayed project reference

```bash
pnpm --filter backend reset:development -- \
  --execute \
  --confirm=DELETE_SHARED_WORKOS_DEVELOPMENT_DATA \
  --project-ref=<exact-project-ref-from-dry-run>
```

If the Compose directory differs from `FRAPPE_DOCKER_DIR`, add:

```text
--frappe-dir=/absolute/path/to/infra/erpnext
```

Do not bypass or weaken the confirmation phrase, project match, or backup gates.

## 3. Verify

Confirm the command reports the database backup path and final Auth user/site counts. Backups are written under `backups/development-reset/` in the repository; Frappe backups remain in the sites volume.

Then verify:

```sql
select count(*) from public.companies;
select count(*) from public.company_members;
select count(*) from public.oidc_clients;
select count(*) from public.erpnext_command_outbox;
select count(*) from auth.users;
select count(*) from public.roles;
```

The first five should be zero. `public.roles` should contain the restored system reference roles. Confirm `erpnext` schema tables are empty and `bench list-sites` no longer lists the deleted local tenant sites.

## 4. Drop the ERPNext VM sites by hand

The script never touches the VM, so truncating the `erpnext` schema leaves every remote
tenant site orphaned — present on the VM, unknown to WorkOS. Drop them explicitly.

`erpnext-vm` only runs 12:00–00:00 IST; `az vm start -g startup-digital-twin-rg -n erpnext-vm`
first if outside that window.

```bash
az vm run-command invoke -g startup-digital-twin-rg -n erpnext-vm --command-id RunShellScript --scripts '
cd /home/erpadmin/frappe_docker
set -a; sudo cat /home/erpadmin/provision-shim/.env > /tmp/shim.env; . /tmp/shim.env; set +a
for s in $(docker compose -f pwd.yml exec -T backend bench list-sites | grep "^erp-"); do
  docker compose -f pwd.yml exec -T backend bench drop-site "$s" --force --no-backup \
    --mariadb-root-password "$FRAPPE_DB_ROOT_PASSWORD"
done
rm -f /tmp/shim.env
docker compose -f pwd.yml exec -T backend bench list-sites'
```

**Do not pass `admin` as the root password.** `pwd.yml` declares
`MYSQL_ROOT_PASSWORD: admin`, but that only applies at first initialisation; the live
password is `FRAPPE_DB_ROOT_PASSWORD` in the shim's `.env`. Using `admin` fails with
`Access denied for user 'root'@...`.

Dropped sites are archived under `/home/frappe/frappe-bench/archived/sites` in the `sites`
volume, not erased — reclaim that space separately if it matters.

## Backup and restore note

The PostgreSQL backup is a custom-format `pg_dump` file suitable for `pg_restore`. A restore is a separate destructive operation: review the target database and coordinate it explicitly rather than running it as part of this reset runbook.

## Authoritative files

- `apps/backend/scripts/reset-development-data.ts`
- `apps/backend/package.json`
- `apps/frontend/supabase/migrations/20260628210100_baseline_reference_seed.sql`
- `../infra/erpnext/pwd.yml`

## Update this runbook when

- reset scope, safety gates, backup location/format, local site naming, Auth deletion behavior, reference-data restoration, or required environment variables change.
