# Cloud deployment runbook (monorepo)

Last verified: 2026-08-03.

Live cloud now deploys from this monorepo (`CybraneX-team/workos`, branch `main`),
not the old split repos. This runbook is the source of truth for how each tier is
built and deployed, where its configuration lives, and how to roll back.

Never put secret values in this file. It records stable resource names, commands,
and where to read values from — not the values themselves.

## Live topology

| Tier | Platform | Identity |
|------|----------|----------|
| Frontend | Vercel | project `startup-digital-twin` (team `cybranexs-projects-d2538eda`) → https://os.cybranex.com |
| Backend | Azure Container Apps | `startup-twin-backend` (env `startup-twin-env`, RG `startup-digital-twin-rg`, Central India) |
| ERPNext control-plane | Azure Container Apps | `erpnext-control-plane` (same env/RG, **internal** ingress, port 8090) |
| Container registry | Azure ACR | `startupdigitaltwin123.azurecr.io` (admin user enabled) |
| Database + Auth | Supabase | project ref `wcovyctzfgpqifelefum` (backend `public` schema + control-plane `erpnext` schema) |
| ERPNext runtime | Azure VM | `erpnext-vm` (South India) + Caddy + provisioning shim at `erpnext-cybranex-dt.southindia.cloudapp.azure.com` |

Old repos kept for rollback: `CybraneX-team/startup_digital_twin_backend` (backend, workflow now **disabled**), `CybraneX-team/Startup_Digital_Twin` (frontend, **public**).

## Deploy — backend (manual)

Build in ACR (no local Docker needed) and roll the Container App to the new image:

```bash
TAG="mono-$(git rev-parse --short HEAD)"
az acr build --registry startupdigitaltwin123 \
  --image "startup-twin-backend:$TAG" --file apps/backend/Dockerfile .
az containerapp update -n startup-twin-backend -g startup-digital-twin-rg \
  --image "startupdigitaltwin123.azurecr.io/startup-twin-backend:$TAG"
```

Verify: `/healthz` = 200 **and** the monorepo-only `/test` endpoint responds; tail
the new revision's logs for `[rbac] loaded 8 active role definitions`.

Most recently verified on 2026-08-03: the backend image built from monorepo commit
`571f4ec` deployed successfully as revision `startup-twin-backend--0000048` with image
`startupdigitaltwin123.azurecr.io/startup-twin-backend:mono-571f4ec`; `/healthz` and
`/test` both returned `200`. The matching Vercel deployment for `main` completed
successfully. This records a deployment fact, not a substitute for verifying each future
rollout.

Env vars persist across image updates. Change them separately and **before** deploying
dependent code: `az containerapp update ... --set-env-vars KEY=value` (merges, preserves
the rest — never re-sync all from a local `.env`).

## Deploy — frontend (automatic, via Git)

`CybraneX-team/workos` is **public** and Git-connected to the Vercel project
(Root Directory `apps/frontend`, production branch `main`). **Pushing to `main`
builds and deploys automatically** — no CLI step, no local build.

```bash
git push origin HEAD:main   # that's the whole deploy
```

Verify: the deployment reaches `READY` and `os.cybranex.com` serves the new bundle
hash. The edge-cached `index.html` can lag a minute (`x-vercel-cache: HIT`); hashed
assets are served immediately, so `curl -o /dev/null -w '%{http_code}'` on the new
`assets/index-*.js` is the fastest confirmation.

⚠️ The build command **must** keep pnpm's `...` dependency selector:
`cd ../.. && pnpm --filter "frontend..." build`. Without `...`, the four
`@cybranex/*` workspace packages are never built and `tsc` fails on any clean
checkout with `TS2307: Cannot find module '@cybranex/shared-types'`. Local builds
can hide this because stale `packages/*/dist` artifacts satisfy the imports.

⚠️ `VITE_*` are build-time baked. Server-side Git builds inject **all** env vars
(including ones marked `sensitive`), so the Git flow is safe. A *local*
`vercel build` cannot decrypt `sensitive` vars and bakes them empty — which makes
the app call same-origin `/api/*` and get HTML back (`Unexpected token '<'`).
Another reason to prefer Git deploys over local ones.

## Deploy — ERPNext control-plane (manual)

```bash
TAG="cp-$(git rev-parse --short HEAD)"
az acr build --registry startupdigitaltwin123 \
  --image "erpnext-control-plane:$TAG" --file apps/erpnext-control-plane/Dockerfile .
az containerapp update -n erpnext-control-plane -g startup-digital-twin-rg \
  --image "startupdigitaltwin123.azurecr.io/erpnext-control-plane:$TAG"
```

Verify: revision Healthy; logs show `[erpnext-control-plane] listening on :8090 (remote)`.
It is internal-ingress; reach it only from the backend (same environment). Its
`INTERNAL_SERVICE_TOKEN` must equal the backend's `ERPNEXT_CONTROL_PLANE_TOKEN`.

## Deploy — ERPNext runtime image (manual)

Tenant sites run `erpnext`, `crm` (Frappe CRM), and the Cybranex-owned
`workos_frappe_integration`. Frappe apps live in the image layer, not the
`sites` volume, so all three are baked into a custom image rather than fetched
at runtime. Build inputs are version-controlled in `infra/erpnext-image/`:
`apps.json` selects the released upstream tags, `Containerfile` verifies their
exact commits and pins the AMD64 base-image digests, and `apps/` contains the
first-party integration app.

```bash
az acr build --registry startupdigitaltwin123 \
  --image erpnext-crm:v16.27.1-erpnext16.28.0-crm1.79.0-workos2 \
  --file infra/erpnext-image/Containerfile infra/erpnext-image
```

The build runs a full `bench init` (~15-25 min). It must build in ACR, not
locally: the VM is amd64 while dev machines are arm64, and `az acr build`
supports only `--secret-build-arg`, not the BuildKit `--mount=type=secret`
that upstream's `images/custom/Containerfile` uses for `apps.json`.

The build verifies the exact Frappe, ERPNext, and CRM commits after cloning the
release tags. It also pins `frappe/build`, `frappe/base`, and the ERPNext image
used solely for entrypoint scripts to AMD64 digests. If upstream retags a source
release or a base image changes, the build fails rather than silently producing
a different release. Record the output image digest after the ACR build and deploy
that digest—not the mutable semantic tag—to each environment.

⚠️ The final stage **must** derive from `frappe/base`, not `frappe/erpnext`. The
latter declares `sites`/`logs` as `VOLUME`s, which during a build are mounted
ephemerally: they cannot be deleted (`device or resource busy`) and anything
written into them is silently discarded, which drops the baked assets.

### Roll out to the VM

`erpnext-vm` runs the **same `pwd.yml` stack** as local dev, at
`/home/erpadmin/frappe_docker/` — not a bare bench install. The full sequence,
verified end-to-end on 2026-07-21:

```bash
# 1. repoint pwd.yml (keep a backup) — all 9 services share one image
az vm run-command invoke -g startup-digital-twin-rg -n erpnext-vm --command-id RunShellScript --scripts "
set -e
cd /home/erpadmin/frappe_docker
cp pwd.yml pwd.yml.bak-pre-<change>-<date>
sed -i 's|image: frappe/erpnext:v16.26.1|image: startupdigitaltwin123.azurecr.io/erpnext-crm:<tag>|g' pwd.yml"

# 2. authenticate the VM to ACR with a short-lived token (NOT the admin password)
TOKEN=$(az acr login --name startupdigitaltwin123 --expose-token --query accessToken -o tsv)
#    then, on the VM: echo "$TOKEN" | docker login startupdigitaltwin123.azurecr.io \
#      -u 00000000-0000-0000-0000-000000000000 --password-stdin
#    the token lasts ~3h; re-run if a later step 401s.

# 3. pull + recreate, then regenerate apps.txt, then backfill existing sites
#    docker compose -f pwd.yml pull backend frontend queue-long queue-short scheduler websocket
#    docker compose -f pwd.yml up -d --no-deps backend frontend queue-long queue-short \
#      scheduler websocket db redis-cache redis-queue
#    docker compose -f pwd.yml exec -T backend bash -c 'ls -1 apps > sites/apps.txt'
#    for each existing site: docker compose -f pwd.yml exec -T backend bench --site <site> migrate
#    for each existing site: docker compose -f pwd.yml exec -T backend bench --site <site> install-app workos_frappe_integration
#    for each existing site: docker compose -f pwd.yml exec -T backend bench --site <site> clear-cache
```

Site data survives image swaps — it lives in the named `sites`, `logs`, and
`db-data` volumes (verified: `bench list-sites` identical before and after).

⚠️ **`sites/apps.txt` must be regenerated by hand here.** It lives in the shared
`sites` volume and still lists the old app set after an image swap, so
`install-app workos_frappe_integration` fails with `App workos_frappe_integration not in apps.txt`.
Locally the `configurator`
service rewrites it on every `up`; on this VM `frappe-compose.service`
deliberately excludes `configurator`, so nothing does. This is the single most
likely step to forget.

⚠️ Only **newly provisioned** sites get new apps automatically. Existing sites
need the one-time `install-app` above.

⚠️ Installing an app onto a site whose framework version predates the new image
can fail mid-way (observed locally: `ImportError` on `CRM Lead Status` when a
site on frappe 16.25.0 met a 16.27.1 image). `bench --site <site> migrate` fixes
it. The three production sites installed cleanly without this, but they did take
the same silent version bump — **`bench migrate` has not been run on them.**

The local stack (`../infra/erpnext/pwd.yml`) pins the same ACR tag, so pulling
it needs `az acr login --name startupdigitaltwin123` first. Note the image is
amd64: on an arm64 dev machine Docker emulates it — works, but slow, and
`docker compose up -d` prints nothing during a multi-minute first pull.

### Provisioning shim

`/home/erpadmin/provision-shim/index.js` on the VM duplicates the `bench new-site`
call in `localProvision()` (`apps/erpnext-control-plane/src/provisionWorker.ts`).
**Changing which apps get installed requires editing both**, or local and remote
provision differently and the gap only appears when a real tenant is created.

A copy is now version-controlled at `infra/erpnext-remote-shim/` (committed
2026-07-22 — the file previously existed only on the VM, with no history or
backup). It is a **mirror, not a deployment source**: nothing deploys from it
automatically. See its README for the copy-up procedure. Verify a deploy with
`md5sum` on both ends plus `systemctl is-active erpnext-provision-shim` and
`curl -s localhost:3001/health`.

The checked-in shim source was updated on 2026-07-29 to match local site-creation
invariants: per-site container locking, a 25-minute inner timeout, required-app
verification, and `--mariadb-user-host-login-scope=%`. It was deployed and
verified on 2026-07-29 with MD5 `916a9642232c51e502279ea3d2b27438`,
service state `active`, and health `{"ok":true}`. A later source change still
requires a fresh reviewed deployment and checksum verification.

Deploy with `infra/erpnext-remote-shim/deploy.sh`; do not hand-roll the copy and
restart. The SSH user cannot restart the system service non-interactively, so
the script uses SSH for preflight/verification and Azure Run Command for the
root-only restart. Azure's synchronous command output can be delayed or absent,
so the script uses a unique durable status file and verifies it through SSH.
The shim needs a bounded readiness loop after restart: port `3001` has taken
2–7 seconds to bind, and an immediate `curl` can fail with connection error `7`
even when the new process is valid.

Setup completion is **not** part of this drift: the control-plane runs the wizard over
REST for both paths — see "Tenant setup is completed during provisioning" below.

### VM power schedule

`erpnext-vm` is **not** always on. Two Logic Apps (`erpnext-vm-start`,
`erpnext-vm-stop`) run it 12:00–00:00 IST daily to control cost. `az vm
run-command` fails with `OperationNotAllowed ... requires the VM to be running`
outside that window — `az vm start -g startup-digital-twin-rg -n erpnext-vm`
first, wait until the guest agent also reports `Ready`, and expect it to stop
again on schedule.

### Historical production ERPNext state (verified 2026-07-22)

| | |
|---|---|
| Image on all 9 services | `startupdigitaltwin123.azurecr.io/erpnext-crm:v16.26.1-crm1` |
| Apps per site | `frappe 16.27.1`, `erpnext 16.28.0`, `crm 1.79.0` |
| Tenant sites (2026-07-22) | `erp-asd-g9bi.localhost`, `erp-setup-check-labs-o7e0.localhost` |
| **ERPNext setup complete** | Now performed automatically during provisioning; see below |
| Rollback backups on VM | `pwd.yml.bak-pre-crm-20260721`, `provision-shim/index.js.bak-pre-crm-20260721` |

The table predates the reproducible `workos1` image and must not be treated as
the target state for a future rollout.

`erp-hello-world`, `erp-flasshh-our0`, `erp-asd-n12o` and `erp-crmtest-73972` were all
dropped on 2026-07-22 alongside a full WorkOS development reset, so the next signup
provisions a clean tenant through the fixed path. Dropped sites are archived under
`/home/frappe/frappe-bench/archived/sites` in the `sites` volume, not erased.

The two sites listed above were provisioned **after** that reset, through the fixed path.
Both verified 2026-07-22: `setup_complete = 1`, with a `Company` and a `Fiscal Year` — the
setup-wizard automation works end to end in production.

Tenant sites churn faster than this table. Confirm before trusting it:

```bash
az vm run-command invoke -g startup-digital-twin-rg -n erpnext-vm --command-id RunShellScript \
  --scripts "cd /home/erpadmin/frappe_docker && docker compose -f pwd.yml exec -T backend bench list-sites"
```

**The MariaDB root password is not `admin`.** `pwd.yml` declares
`MYSQL_ROOT_PASSWORD: admin`, but that only applies at first initialisation — the live
password is `FRAPPE_DB_ROOT_PASSWORD` in `/home/erpadmin/provision-shim/.env`. Source that
file for any `bench drop-site`; `admin` fails with `Access denied for user 'root'`.

Open items, deliberately left rather than forgotten:

- **`bench migrate` not run** after the framework version bump. The current tenants were
  created fresh on the new image, but the next image roll onto existing sites will need it.
- **RBAC through Frappe CRM is unverified** — no non-Administrator user has been tested
  against `CRM Lead`/`CRM Deal` visibility.
- **Tenants carry CRM data but no ERPNext transactional data** (verified 2026-07-22 on
  `erp-asd-g9bi.localhost`: 7 `CRM Organization`, 12 `CRM Lead`, 7 `CRM Deal`, but 0
  `Customer`, `Sales Order`, `Sales Invoice`, and `Quotation`). Every native-ERPNext-backed
  Sales node therefore renders empty — expected, not a regression. No `Lead Sync Source` is
  configured either.

### Tenant setup is completed during provisioning

**Fixed 2026-07-22.** Previously every new signup produced an unconfigured site: both
provisioning paths stopped after `bench new-site` + `generate_keys`, so the tenant had no
`Company`, chart of accounts or fiscal year, `erpnext.tenants.status` went to `'ready'`
anyway, and the first user to open the desk landed on `/desk/setup-wizard/0` — where
completing the wizard without a country crashed on
`erpnext/setup/setup_wizard/operations/install_fixtures.py:152`
(`"territory_name": country.replace("'", "")`, no null guard, **still unguarded on
`frappe/erpnext@version-16`** — this was never fixable by a version bump).

The control-plane now completes setup itself, in `completeSetup()`
(`apps/erpnext-control-plane/src/frappe/client.ts`), between provisioning and
`applyBranding()`. `status='ready'` is only written after setup and its persisted postcondition
checks succeed, so
`resolveErpNextCreds()` and the V4 ERPNext focus workspaces no longer present an empty site
as connected evidence. The postcondition checks are persisted `System Settings.setup_complete`
and the expected Company; a setup endpoint HTTP `200` alone is not accepted as proof of a usable
tenant.

Both entry points it calls are `@frappe.whitelist()`, so this runs over the same REST
surface as every other control-plane command — **one implementation covering local and
remote, with nothing duplicated into `infra/erpnext-remote-shim/`.**

Two things worth knowing before changing it:

- `initialize_system_settings_and_user` **must** run before `setup_complete`. Once
  frappe's own stage is marked complete in `Installed Application`, `process_setup_stages()`
  calls `set_missing_values()`, which *overwrites* `country`/`currency`/`time_zone` in the
  args from System Settings. A retry after a partial failure would otherwise re-inject the
  empty values and fail identically.
- The company's locale facts travel on `ProvisionTenantRequest` and are stored on
  `erpnext.provision_jobs` (migration `002`). The control-plane must not read
  `public.companies` itself; the backend resolves them in `companySetupFacts()`
  (`apps/backend/src/lib/erpnextOutbox.ts`) from `companies.country`/`currency`, reusing
  `currencyForCountry()` and the new `fiscalYearForCountry()`/`timezoneForCountry()`.

Fiscal year policy: April–March for India, calendar year elsewhere — Frappe's
`country_info.json` carries currency and timezones but no fiscal-year data.

`crm`'s `setup_wizard_complete` hook (`crm.demo.api.create_demo_data`) runs as part of
this, so new tenants start with a populated demo CRM pipeline. That is deliberate;
`crm.demo.api.clear_demo_data` is whitelisted if it needs reversing.

Frappe CRM never depended on this: `CRM Lead`/`CRM Deal` have no `company` field, so
pipeline data worked even on the unconfigured sites.

## Configure — Meta Ads integration (manual)

Found 2026-07-21 while debugging a live "Meta OAuth not configured" error: the
backend Container App was missing `META_APP_ID`, `META_APP_SECRET`, a correct
`META_REDIRECT_URI`, `NODE_ENV`, and any `META_AUTHORING_*` var — Meta Ads OAuth
connect and Campaign Studio authoring had never actually been configured for
production. Fixed the same day; all commands below were run and confirmed live
(`/healthz` 200 on the resulting revision).

```bash
az containerapp update -n startup-twin-backend -g startup-digital-twin-rg \
  --set-env-vars META_APP_ID=<value> META_APP_SECRET=<value> \
  META_REDIRECT_URI=https://startup-twin-backend.delightfuldesert-4a477cb8.centralindia.azurecontainerapps.io/api/integrations/meta/callback

az containerapp update -n startup-twin-backend -g startup-digital-twin-rg \
  --set-env-vars NODE_ENV=production

az containerapp update -n startup-twin-backend -g startup-digital-twin-rg \
  --set-env-vars META_AUTHORING_MODE=allowlisted_real \
  META_AUTHORING_ALLOWED_ACCOUNT_IDS=<act_... exact real ad account id>
```

**`NODE_ENV=production` matters project-wide, not just for Meta.** Its absence
silently left every "dev only" guard in this codebase open in production:
`isMetaSandboxAllowed()` (`apps/backend/src/routes/integrations.ts`), the
`META_AUTHORING_FAKE_META`/`META_AUTHORING_FAKE_GEMINI` fake-adapter switches,
and fixture seeding (`apps/backend/src/domains/meta-ads/README.md`: "Fixtures
are disabled when `NODE_ENV=production`"). None of these had a working trigger
in practice before this fix, because their *other* guard conditions (e.g.
`META_SANDBOX_ACCESS_TOKEN` being set) were also never configured on Azure —
but that was luck, not a second line of defense that was ever verified. Treat a
missing `NODE_ENV` on any future Container App as a real gap, not a formality.

**Meta App console prerequisites** (developers.facebook.com, app "CybraneX",
ID `1249568431567089`), found by trial and error and not documented anywhere
else — required before the OAuth flow above will work at all:

- **App Domains** (App settings → Basic): must include the backend's bare host
  (`startup-twin-backend.delightfuldesert-4a477cb8.centralindia.azurecontainerapps.io`),
  or the login dialog fails with "Can't load URL — domain not in app's domains"
  before it even gets to the redirect-URI check.
- **Valid OAuth Redirect URIs** (Facebook Login for Business → Settings): the
  exact `META_REDIRECT_URI` value above, full scheme and path.
- **Use case "Manage Pages"**, permission `pages_read_user_content` explicitly
  added (Use cases → Manage Pages → Customize → Permissions and features →
  `+ Add` on that row). This is `instagram_basic`'s actual dependency per
  Meta's Permissions Reference — **not** `pages_read_engagement`, despite that
  being the more obvious-looking Pages permission already in the scope list.
- **Use case "Manage messaging & content on Instagram"**, permission
  `instagram_basic` explicitly added the same way. Adding the use case card
  alone does not enable the permission — each permission needs its own
  `+ Add` inside that use case's Customize screen.
- Both permissions should show **"Ready for testing"** (Standard Access) once
  added — no App Review or Business Verification needed for the app owner's
  own testing.

`pages_manage_ads` was in the OAuth scope list until this date; removed
because nothing in this codebase reads or writes anything gated by it, and it
was rejected by Meta with "Invalid Scopes" the moment it was requested without
a matching console permission. See
[`docs/architecture/meta-ads-campaign-studio.md`](../architecture/meta-ads-campaign-studio.md)
for the full scope list and rationale.

⚠️ **A sandbox test connection exists under an unrelated company** (`asd`,
`46f1199b-a670-420e-b895-aa6e47ef1bfd`) in the shared Supabase `public.integration_connections`
table, `account_name: "Meta Ads · CybraneX Sandbox (sandbox)"`. Traced this
precisely rather than assuming: it cannot have come from the deployed backend —
`META_SANDBOX_ACCESS_TOKEN`/`META_SANDBOX_AD_ACCOUNT_ID` were never set on Azure
(confirmed by direct query), and `isMetaSandboxAllowed()` requires both. It came
from a local dev backend session (which has those values in `apps/backend/.env`)
writing to the same shared Supabase project dev and prod both use. Harmless,
but leave it alone rather than "fixing" it as if it were a production leak.

## Database migrations (manual)

No auto-apply anywhere. Apply against the pooled Supabase `DATABASE_URL`.

- Backend/WorkOS schema (`public`): the authoritative set is `apps/frontend/supabase/migrations/*`; `apps/backend/db/migrations/*` mirror the Meta Ads additions. As of cutover the prod DB was already fully migrated (the `supabase_migrations` ledger is stale — verify by table existence, not the ledger).
- Control-plane schema (`erpnext`): `pnpm --filter erpnext-control-plane db:migrate` with `DATABASE_URL` set (applies `db/migrations/001_control_plane.sql`).

## Configuration source of truth

- Backend + control-plane env: the Azure Container App env vars (`az containerapp show ... --query "properties.template.containers[0].env"`). Secret values are inline or Container App secrets.
- Frontend env: Vercel project env (`npx vercel env ls`); production `VITE_*` are baked at build.
- ERPNext VM connection values (`ERPNEXT_NGINX_URL`, `ERPNEXT_PROVISION_URL`, `ERPNEXT_PROVISION_SECRET`) originate on the VM and are mirrored into the backend and control-plane Azure env.

## Rollback

- Backend/control-plane: `az containerapp update --image <previous tag>` or activate a prior revision (`az containerapp revision list/activate`). The last old-repo backend revision was `startup-twin-backend--0000031` — confirm current before relying on it.
- Frontend: redeploy a prior Vercel deployment (promote from the dashboard), or the old public repo still builds at Root Directory `.`.
- ERPNext runtime image: restore the backup (`cp pwd.yml.bak-pre-crm-20260721 pwd.yml`) and
  recreate the services. Site data is in volumes and unaffected. Note this only reverts the
  *image* — apps already installed onto a site stay installed, and reverting to an image
  without `crm` while sites still have it installed is untested.

## Automation status

- **Frontend → Vercel:** ✅ **automated.** `workos` was made public on 2026-07-20 and Git-connected; push to `main` deploys. (Vercel's Hobby plan refuses to connect a *private* org-owned repo — that restriction is what made the repo public a prerequisite.)
- **Backend → Azure:** ⏳ **manual** (the two commands above). Automating it needs the workflow moved to repo-root `.github/workflows/` plus an Azure deploy service principal and repo secrets. SP creation is blocked until the deploying account has Entra **Owner** or **User Access Administrator** on `startup-digital-twin-rg` — it currently has Contributor, which can deploy resources but cannot create role assignments.
- **Control-plane → Azure:** ⏳ manual, same blocker as the backend.

## Update this file when

Deploy commands, resource names/regions, ingress mode, the migration procedure, the
automation-blocker status, the ERPNext runtime image tag / installed Frappe apps, the VM
power schedule, the provisioning shim's behavior, the Meta Ads authoring mode/allowlist,
or the Meta App console configuration (domains, redirect URIs, use cases/permissions) changes.
