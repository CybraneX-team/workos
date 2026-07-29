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

`/provision` mirrors the bounded, lock-protected site-creation step in `localProvision()`
(`apps/erpnext-control-plane/src/provisionWorker.ts`). **The two must be changed
together.** If they drift, local dev and production provision differently and the
gap only surfaces when a real tenant is created — for example, a tenant silently
missing `crm` and showing an empty pipeline.

Deduplicating them properly (thin generic exec endpoint, or running the
control-plane on the VM) is tracked as follow-up work; this copy is the
stop-gap.

### Provisioning invariants

The table describes the checked-in source. The Azure VM may still differ until this file is
manually deployed there; verify the deployed checksum before relying on remote provisioning.

| | `localProvision()` | `/provision` here |
|---|---|---|
| Idempotency | lock + `bench list-sites`; verifies required installed apps | same lock + required-app verification |
| `--mariadb-user-host-login-scope=%` | passed | passed |
| ERPNext setup wizard | n/a — done by the control-plane for both paths | n/a |

`provisionWorker.run()` retries up to `max_attempts`; a busy remote lock returns a retryable
conflict, while an incomplete site is reported explicitly rather than marked usable. The same
rules apply locally. This safety is effective remotely only after deploying this mirror.

Fixing either of these means editing **both** files and copying this one up to the VM.

### Do not add setup completion here

ERPNext's setup wizard is run by the control-plane's `completeSetup()`
(`apps/erpnext-control-plane/src/frappe/client.ts`), not by either `bench new-site` caller.

This directory is a source mirror, not a deployment mechanism. Updating it does **not**
change the Azure VM. Deploy the reviewed file through the remote ERPNext runbook before
using remote provisioning. Both setup entry points are `@frappe.whitelist()`, so setup goes over the tenant's REST API
and covers local and remote from a single implementation — deliberately avoiding a third
thing to keep in sync by hand. Adding it here would reintroduce exactly the drift this
file warns about.

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
