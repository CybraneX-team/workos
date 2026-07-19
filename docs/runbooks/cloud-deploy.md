# Cloud deployment runbook (monorepo)

Last verified: 2026-07-19.

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

Env vars persist across image updates. Change them separately and **before** deploying
dependent code: `az containerapp update ... --set-env-vars KEY=value` (merges, preserves
the rest — never re-sync all from a local `.env`).

## Deploy — frontend (manual, Hobby workaround)

Vercel Hobby cannot git-deploy a private org repo, so builds run locally and the
prebuilt output is uploaded from a **non-git** directory (otherwise the private-repo
commit-author check blocks it). Root Directory is set to `apps/frontend`.

```bash
npx vercel pull --yes --environment=production   # pulls prod env + settings
npx vercel build --prod                          # -> .vercel/output
# copy .vercel/output + .vercel/project.json into a tmp dir that has NO .git and an
# (empty) apps/frontend/ dir, then:
( cd "$TMPDIR" && npx vercel deploy --prebuilt --prod --yes )
```

Verify: live bundle hash changed, and it contains the Azure backend URL
(`curl -s https://os.cybranex.com/assets/index-*.js | grep azurecontainerapps`).

⚠️ `VITE_*` are **build-time baked**. `VITE_BACKEND_URL` must be a normal (encrypted)
Vercel env var, **not "sensitive"** — sensitive vars can't be pulled for local builds
and bake empty, which makes the app call same-origin `/api/*` (returns HTML → JSON
parse error).

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

## Not yet automated (intentional; needs external unblock)

- **Backend CI (GitHub Actions → Azure):** the workflow needs to move to repo-root `.github/workflows/` and requires an Azure deploy service principal + repo secrets. SP creation is blocked until the deploying account has Entra **Owner/User Access Administrator** on `startup-digital-twin-rg` (currently Contributor only).
- **Frontend auto-deploy (Vercel Git):** blocked on Hobby for the private repo — needs **Vercel Pro** or making `workos` public (scrub committed secrets first, e.g. `apps/backend/deploy.sh`).

## Update this file when

Deploy commands, resource names/regions, ingress mode, the migration procedure, or
the automation-blocker status changes.
