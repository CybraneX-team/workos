# Local WorkOS-to-ERPNext SSO runbook

Last verified: 2026-07-21.

Scope: local development only. A separate **deployed** control-plane
(`ERPNEXT_ENV=remote`) runs in Azure against the ERPNext VM — this runbook does not
cover it; see `cloud-deploy.md`. The two are deliberately isolated: a control-plane
process serves exactly one `ERPNEXT_ENV` and rejects mismatched requests, so local
work here cannot drive the remote tenants.

This runbook verifies a real browser flow from a local WorkOS Supabase session into a company-specific ERPNext Desk session.

## Expected local topology

| Component | URL |
|---|---|
| WorkOS frontend | `http://localhost:5173` |
| WorkOS backend | `http://localhost:8080` |
| ERPNext control-plane | `http://localhost:8090` |
| Company ERPNext site | `http://erp-<company-slug>.localhost:8081` |

The Frappe Compose file is `../infra/erpnext/pwd.yml` relative to this repository. Its frontend must pass the request host as `FRAPPE_SITE_NAME_HEADER`, and its backend must resolve `host.docker.internal`.

⚠️ `../infra/erpnext` is a **separate git clone of `frappe/frappe_docker`**, not part of this
repository. Edits there (including the image pin below) are untracked by this repo — the
version-controlled build inputs live in `infra/erpnext-image/`.

All nine `pwd.yml` services must pin the custom image
`startupdigitaltwin123.azurecr.io/erpnext-crm:<tag>`, which bakes in both `erpnext` and
`crm` (Frappe CRM). Frappe apps live in the image layer, so `crm` cannot be added to a
running container. Pulling it needs `az acr login --name startupdigitaltwin123` first, and
the image is **amd64** — on an arm64 Mac it runs under emulation (works, but slower).

## 1. Configure environment

Use `apps/backend/.env.example` and `apps/erpnext-control-plane/.env.example` as the source of variable names. Keep actual values in ignored `.env` files.

Required ERP-specific relationships:

- Backend `ERPNEXT_CONTROL_PLANE_TOKEN` must exactly equal control-plane `INTERNAL_SERVICE_TOKEN` and be at least 16 characters.
- Backend `ERPNEXT_TARGET_ENV=local`; control-plane `ERPNEXT_ENV=local`.
- Backend `ERPNEXT_CONTROL_PLANE_URL=http://localhost:8090`.
- Backend `OIDC_BROWSER_AUTHORIZE_URL=http://localhost:5173/oauth/authorize`.
- Backend `OIDC_INTERNAL_BASE_URL=http://host.docker.internal:8080/api/oidc`.
- Control-plane `ERPNEXT_CREDENTIALS_KEY` must be a 64-character hex key.
- Control-plane `FRAPPE_DOCKER_DIR` must resolve to the sibling `infra/erpnext` directory.
- Backend and control-plane must use the same `DATABASE_URL` for the current shared local-development setup.

Generate new local-only values without writing them into documentation:

```bash
openssl rand -hex 32
openssl rand -hex 24
```

Use the 32-byte hex output for encryption keys and a separate random value for the shared service token. Never commit either value.

## 2. Apply schemas

Apply the WorkOS migration through the repository's database migration workflow. If applying this standalone migration directly in local development:

```bash
psql "$DATABASE_URL" -f apps/backend/db/migrations/035_erpnext_control_plane_outbox.sql
pnpm --filter erpnext-control-plane db:migrate
```

Both migrations are idempotent for repeated local setup.

## 3. Start the runtime

From the repository root:

```bash
pnpm install
pnpm build:packages
az acr login --name startupdigitaltwin123   # required: pwd.yml pins a private ACR image
pnpm frappe:up
pnpm dev:workos-erpnext
```

Keep the development process running. Check basic reachability in another terminal:

```bash
curl -fsS http://localhost:8080/healthz
curl -fsS http://localhost:8090/healthz
curl -fsS http://localhost:8081/api/method/ping
```

Startup notes learned the hard way (2026-07-21):

- `pnpm frappe:up` prints almost nothing while pulling the ~4.6GB image. A silent
  multi-minute wait is normal, not a hang. Run `docker compose -f ../infra/erpnext/pwd.yml pull`
  first if you want visible progress.
- Frappe needs a further minute after the containers report `Up` before it serves
  requests. Poll `/api/method/ping` rather than assuming failure.
- **`preview_start {name: ...}` cannot launch these servers in this environment** — it
  fails with `EPERM: operation not permitted, uv_cwd` inside corepack's `pnpm` shim
  (there is no standalone `pnpm` binary on the dev Mac). Start them with a normal
  background shell instead; `preview_start {url: ...}` against an already-running server
  works fine.
- `tsx watch` does **not** restart a process that crashed at runtime — it waits for the
  next file save. If the backend or control-plane dies, `pnpm dev:workos-erpnext` keeps
  running with a hole in it and provisioning silently stops. Verify with the `/healthz`
  curls above, not by checking that the dev command is still in the terminal. See
  "Provisioning stalls with no retries" below.

## 4. Provision a company

1. Sign in to WorkOS at `http://localhost:5173` and create/select a company.
2. Company creation should enqueue `provision_tenant`, `configure_sso`, and `reconcile_users`.
3. Open Settings and wait for ERPNext to become ready. The link must come from `GET /api/erpnext/status` and point to `http://erp-<slug>.localhost:8081`.
4. Optionally inspect safe state without reading secrets:

```sql
select target_env, company_id, command_kind, status, attempts, last_error
from public.erpnext_command_outbox
order by updated_at desc;

select environment, company_id, status, site_name, desk_url, last_error
from erpnext.tenants
order by updated_at desc;
```

## 5. Verify browser SSO

1. Stay signed in to WorkOS in the same browser profile.
2. Open the ERPNext link from Settings, or browse to `http://erp-<slug>.localhost:8081/login?redirect-to=/app`.
3. Click `Login with workos`.
4. Confirm the browser briefly visits the WorkOS authorization bridge and returns to the company-specific Frappe callback.
5. Confirm ERPNext Desk opens without an ERPNext password prompt.
6. In ERPNext, verify the signed-in email matches WorkOS and the expected roles match current WorkOS membership/grants.
7. Change WorkOS roles/grants and wait for reconciliation; verify Frappe roles are replaced.
8. Remove the member; verify the managed Frappe user is disabled.

Expected flow:

```text
Frappe login
  -> http://localhost:5173/oauth/authorize
  -> POST http://localhost:8080/api/oidc/authorize (existing Supabase session)
  -> company Frappe callback with one-time code
  -> http://host.docker.internal:8080/api/oidc/token (inside Docker)
  -> http://host.docker.internal:8080/api/oidc/userinfo
  -> ERPNext Desk session
```

## 6. Seed and verify projections

Seed a specific ready tenant to avoid accidentally selecting the wrong local site:

```bash
pnpm --filter erpnext-control-plane seed:sales -- --company-id=<company-uuid>
pnpm --filter erpnext-control-plane seed:operations -- --company-id=<company-uuid>
```

Then exercise the existing Operations, Supply Chain, Sales, Products, and Copilot browser surfaces. On Frappe v16, the sales seed can emit delivery-schedule warnings involving an empty `NOT IN` list; verify the seed's final counts and projection responses rather than treating those warnings alone as failure.

## Failure isolation

| Symptom | Check |
|---|---|
| Control-plane returns `environment_mismatch` | `ERPNEXT_TARGET_ENV` and `ERPNEXT_ENV` must both be `local`. |
| Provisioning remains pending | Control-plane health, `RUN_PROVISION_WORKER`, Docker availability, `erpnext.provision_jobs.last_error`. |
| SSO/users remain pending | Tenant must be `ready`; inspect WorkOS outbox attempts/error and confirm the two service tokens match. |
| Site returns the wrong tenant or 404 | Compose frontend must use `FRAPPE_SITE_NAME_HEADER: $host`; retain host port `8081`. |
| Token exchange cannot reach WorkOS | Frappe backend needs `host.docker.internal:host-gateway`; backend must listen on port `8080`. |
| Browser bridge sends user to `/auth` | No active Supabase session exists on `localhost:5173`; sign in and start a fresh ERPNext login flow. |
| `unauthorized_client` | Active WorkOS company, OIDC client's company, client ID, and exact callback URL must agree. |
| Frappe login succeeds with wrong/missing roles | Inspect desired users generated by `apps/backend/src/lib/erpnextOutbox.ts`, then managed-user state and Frappe User roles. Policy stays in WorkOS. |
| Outbox rows stuck `pending` with `TypeError: fetch failed` | The backend and/or control-plane process is dead. `curl` both `/healthz` endpoints — a running `pnpm dev:workos-erpnext` does **not** imply both are alive. See below. |
| Newly provisioned site lacks `crm` | The stack is running the stock `frappe/erpnext` image instead of the custom `erpnext-crm` one. Check `docker compose -f ../infra/erpnext/pwd.yml exec -T backend ls apps`. |
| `bench --site <site> install-app crm` fails `App crm not in apps.txt` | `sites/apps.txt` (in the shared `sites` volume) predates the image swap. Regenerate: `docker compose -f ../infra/erpnext/pwd.yml exec -T backend bash -c 'ls -1 apps > sites/apps.txt'`. Locally the `configurator` service usually fixes this itself on `up`; on the production VM it does not (see `cloud-deploy.md`). |
| Fresh site opens `/app/setup-wizard` or `/desk/setup-wizard/0` | Provisioning should have completed setup. Check the tenant reached `status='ready'` (it is only set *after* setup) and look for `setup_args_missing` or a `setup_complete` failure in `erpnext.provision_jobs.last_error`. |
| Provision job fails `setup_args_missing` | The job predates migration `002`, or the backend sent a pre-`companyName`/`country` payload. Redeploy the backend and re-enqueue; the worker refuses to provision a site it cannot configure. |
| Setup wizard fails: `Failed to install presets` / `AttributeError: 'NoneType' object has no attribute 'replace'` | Setup ran with no country. `install_fixtures.get_preset_records()` calls `country.replace(...)` unguarded (`install_fixtures.py:152`), still unguarded upstream on `version-16`. `companies.country` is `NOT NULL DEFAULT 'India'`, so this means the value was lost in transit — check `erpnext.provision_jobs.country` for that job. |
| Sales/Operations/Products dashboards unlock but render empty | The site has no `Company`. Check `bench --site <site> execute frappe.client.get_value --kwargs '{"doctype":"System Settings","fieldname":"setup_complete"}'`. |

## ERPNext setup completion (fixed 2026-07-22)

Provisioning used to stop after `bench new-site` + `generate_keys`, leaving every site with
no `Company`, chart of accounts, fiscal year or default currency, and dumping the first
user onto the setup wizard. The control-plane now runs the wizard itself in
`completeSetup()` (`apps/erpnext-control-plane/src/frappe/client.ts`), between provisioning
and branding, before `status='ready'`. This covers local and remote identically.

Frappe CRM never depended on it — `CRM Lead`/`CRM Deal` have no `company` field, so
pipeline projections worked even on unconfigured sites.

**Call the frappe-level endpoint, not ERPNext's.** If you ever invoke setup by hand, use
`frappe.desk.page.setup_wizard.setup_wizard.setup_complete`, not
`erpnext.setup.setup_wizard.setup_wizard.setup_complete`. The frappe one runs
`parse_args()`, which wraps the payload in a `frappe._dict`; ERPNext's `install_company()`
uses *attribute* access (`args.fy_start_date`, `args.company_name`) and raises
`AttributeError` on a plain dict. Calling ERPNext's directly via `bench execute` hits that.

What the wizard reads (`version-16`, read 2026-07-22):

- `stage_fixtures()` → `fixtures.install(args.get("country"))` — crashes on a null country.
- `install_company()` — `fy_start_date`, `fy_end_date`, `company_name`, `company_abbr`,
  `currency`, `country`, `chart_of_accounts`, `domain`.
- `install_defaults()` — `currency`, `company_name`, then `set_global_defaults()` and
  `create_bank_account(args)` (a no-op without `bank_account`).

`initialize_system_settings_and_user` must be called first — see
`../architecture/erpnext-control-plane.md`, "Completing ERPNext setup", for why a retry
otherwise re-fails identically.

A useful side effect: `update_system_settings()` sets `enable_scheduler: 1`, which Frappe
CRM's Facebook lead syncing needs.

## Provisioning stalls with no retries

Observed 2026-07-21: three outbox commands sat `pending` for hours at 7/20 attempts with
`TypeError: fetch failed`, and no site was ever created.

Root cause was **not** in the provisioning logic. Both the backend and the control-plane
had crashed with `Connection terminated unexpectedly` from `pg`, raised as an unhandled
`error` event and killing the process. The `pool.on('error', ...)` handlers in
`apps/backend/src/db.ts` and `apps/erpnext-control-plane/src/db.ts` only cover **idle**
pooled clients; a client checked out via `pool.connect()` for a transaction — which is how
both outbox workers claim rows (`FOR UPDATE SKIP LOCKED`) — is not covered. `tsx watch`
then waited for a file change instead of restarting.

To recover:

1. `curl -fsS http://localhost:8080/healthz` and `:8090/healthz`. `HTTP 000` means dead.
2. Restart the dead service(s) (`pnpm --filter backend dev`, `pnpm --filter erpnext-control-plane dev`).
3. The outbox resumes on its own, but backs off up to ~5 minutes between attempts. To
   retry immediately, set `next_attempt_at = now()` for that company's `pending` rows.
4. `provision_tenant` completing only means the job was durably enqueued. The control-plane
   worker then runs `bench new-site` as a **host** process — watch for it with
   `ps aux | grep 'bench new-site'`, not with `ps` inside the container (that exec session
   does not show it). It takes several minutes under emulation, and logs nothing on success.
5. `configure_sso` and `reconcile_users` legitimately report retryable `tenant_not_ready`
   until the tenant flips to `ready`.

A durable fix (attaching an `error` handler to checked-out clients) is not yet implemented.

## Durable recovery check

Stop the control-plane, mutate a WorkOS role or membership, and confirm the WorkOS mutation succeeds while the outbox remains pending. Restart the control-plane and confirm the command reaches `complete` and Frappe state converges.

## Automated verification

```bash
pnpm --filter @cybranex/erpnext-contracts test
pnpm --filter erpnext-control-plane test
pnpm --filter backend test:erpnext-architecture
pnpm --filter backend test:sales-stories
pnpm typecheck:backend
pnpm typecheck:frontend
pnpm typecheck:erpnext-control-plane
```

## Authoritative files

- `apps/frontend/src/pages/OAuthAuthorizePage.tsx`
- `apps/frontend/src/pages/SettingsPage.tsx`
- `apps/backend/src/routes/oidc.ts`
- `apps/backend/src/lib/erpnextOutbox.ts`
- `apps/erpnext-control-plane/src/provisionWorker.ts`
- `apps/erpnext-control-plane/src/frappe/client.ts`
- `infra/erpnext-image/` (custom image build inputs: `apps.json`, `Containerfile`)
- `../infra/erpnext/pwd.yml` (separate `frappe_docker` clone — not tracked by this repo)

## Update this runbook when

- ports, hostnames, environment variables, migration commands, SSO endpoints, callback paths, site naming, Compose routing, provisioning steps, or seed behavior changes;
- the set of installed Frappe apps or the custom image tag changes.
