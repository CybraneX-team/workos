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

Use the checked-in deployment script from the repository root:

```bash
infra/erpnext-remote-shim/deploy.sh
```

The script:

- starts the scheduled VM when necessary and waits for both `VM running` and the
  Azure guest agent's `Ready` state;
- verifies the pinned SSH host key, the currently running service, and `/health`
  before writing anything;
- copies only the reviewed `index.js`, verifies its checksum on the VM, and
  creates a timestamped backup;
- uses Azure Run Command for the privileged service restart because the
  `erpadmin` SSH account cannot restart this system service non-interactively;
- writes a unique per-rollout status file and reads it over SSH because the
  synchronous Azure Run Command response can be delayed or absent;
- waits up to 20 seconds for port `3001` to become ready before judging health;
- rolls back to the timestamped backup if installation, restart, readiness, or
  checksum verification fails.

Do not replace the readiness loop with an immediate `curl`. On this VM, the
service has taken 2–7 seconds after `systemctl restart` to log that it is
listening. An immediate health check produces connection error `7` and can
incorrectly classify a valid deployment as failed.

Do not reuse a fixed rollout-status filename. A caller can otherwise read the
previous deployment's terminal state before the new Azure command starts.

SSH is suitable for preflight and verification, but not for the privileged
restart. The configured `erpadmin` key is authorized on the VM; use Azure Run
Command for root operations rather than requesting or transmitting a sudo
password.

Last verified rollout: 2026-07-29, local and remote MD5
`916a9642232c51e502279ea3d2b27438`, service `active`, health `{"ok":true}`.

## Not in this directory

- `.env` — holds `PROVISION_SECRET` and DB/admin passwords. Lives only on the VM
  (mode 0600) and is mirrored into the backend/control-plane Azure env. Never
  commit it.
- `node_modules/` — installed on the VM.

## Files

| File | Purpose |
|---|---|
| `deploy.sh` | Guarded Azure VM rollout with preflight, readiness checks, checksum verification, and rollback. |
| `index.js` | Express service: `/health`, `/ondemand-ask` (Caddy on-demand TLS gate), `/provision` (bearer-authed). |
| `package.json` | Single dependency, `express`. |
| `erpnext-provision-shim.service` | systemd unit; runs as `erpadmin`, binds `127.0.0.1:3001`. |
