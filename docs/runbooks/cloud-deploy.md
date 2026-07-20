# Cloud deployment runbook (monorepo)

Last verified: 2026-07-20.

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

## Automation status

- **Frontend → Vercel:** ✅ **automated.** `workos` was made public on 2026-07-20 and Git-connected; push to `main` deploys. (Vercel's Hobby plan refuses to connect a *private* org-owned repo — that restriction is what made the repo public a prerequisite.)
- **Backend → Azure:** ⏳ **manual** (the two commands above). Automating it needs the workflow moved to repo-root `.github/workflows/` plus an Azure deploy service principal and repo secrets. SP creation is blocked until the deploying account has Entra **Owner** or **User Access Administrator** on `startup-digital-twin-rg` — it currently has Contributor, which can deploy resources but cannot create role assignments.
- **Control-plane → Azure:** ⏳ manual, same blocker as the backend.

## Update this file when

Deploy commands, resource names/regions, ingress mode, the migration procedure, or
the automation-blocker status changes.
