# ERPNext remote provisioning shim

Mirror of the provisioning shim deployed on the `erpnext-vm` Azure VM at
`/home/erpadmin/provision-shim/`. The control-plane cannot reach the VM's Docker
socket, so `remoteProvision()` in
`apps/erpnext-control-plane/src/provisionWorker.ts` POSTs to this service, which
runs `bench` inside the `frappe_docker` stack on the VM's behalf.

**This directory is a copy, not the running code.** The VM is still the live
source of truth: nothing deploys from here automatically. It was committed
(2026-07-22) because the file existed only on the VM — hand-deployed, no git
history, no backup, no review trail.

## Keeping it honest

`/provision` duplicates the `bench new-site` call in `localProvision()`
(`apps/erpnext-control-plane/src/provisionWorker.ts`). **The two must be changed
together.** If they drift, local dev and production provision differently and the
gap only surfaces when a real tenant is created — for example, a tenant silently
missing `crm` and showing an empty pipeline.

Deduplicating them properly (thin generic exec endpoint, or running the
control-plane on the VM) is tracked as follow-up work; this copy is the
stop-gap.

## Deploying a change

```bash
# 1. edit index.js here, review it like any other code
# 2. copy it up (no automated pipeline exists):
az vm run-command invoke -g startup-digital-twin-rg -n erpnext-vm \
  --command-id RunShellScript --scripts '<write file>; systemctl restart erpnext-provision-shim'
# 3. verify:
#    systemctl is-active erpnext-provision-shim
#    curl -s localhost:3001/health   # {"ok":true}
```

## Not in this directory

- `.env` — holds `PROVISION_SECRET` and DB/admin passwords. Lives only on the VM
  (mode 0600) and is mirrored into the backend/control-plane Azure env. Never
  commit it.
- `node_modules/` — installed on the VM.

## Files

| File | Purpose |
|---|---|
| `index.js` | Express service: `/health`, `/ondemand-ask` (Caddy on-demand TLS gate), `/provision` (bearer-authed). |
| `package.json` | Single dependency, `express`. |
| `erpnext-provision-shim.service` | systemd unit; runs as `erpadmin`, binds `127.0.0.1:3001`. |
