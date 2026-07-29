# Operations V4 workspace model

Last verified: 2026-07-29.

Operations uses the five-node V4 department model. ERPNext remains the system of
record: WorkOS reads verified operational evidence and routes users to ERPNext
Desk for every record change.

| Node | Responsibility | Source of truth |
| --- | --- | --- |
| Team | Department roster and roles | `company_members.department_id` |
| Systems | ERPNext lifecycle, readiness, and Desk gateway | Safe control-plane status + ERPNext Desk |
| Metrics | Configured operational measures | Canonical metrics with ERPNext integration sources |
| Projects | Improvement initiatives | Per-user, per-company browser storage |
| Process & Capacity | Exception-to-improvement control tower | Server-validated ERPNext snapshot |

## Systems and Process & Capacity

Systems exposes only safe tenant status: `status`, an active provisioning stage,
Desk URL when ready, and a normalized error. `ready` means the control plane has
verified the site, ERPNext, Frappe CRM, setup completion, and the expected
Company. It is not a claim that data has been synchronized; Operations reads
ERPNext when the user requests a snapshot.

The Process & Capacity snapshot groups read-only evidence into Supply &
procurement, Fulfilment & logistics, Production & capacity, and Service &
quality. It exposes current queues, exceptions, recent evidence, recommended
follow-up, and ERPNext Desk links. The browser never receives ERPNext
credentials and cannot write ERPNext records through this surface.

## Metrics

The starter Operations scorecard contains open material requests, open purchase
orders, low-stock positions, open work orders, work-order completion, and
failed/rejected quality checks. Sources are created as `needs_configuration`:
the first read records current values and baselines, but no score or rollup is
shown until a user configures the measure's target or threshold. In particular,
the low-stock threshold is always user-configured; WorkOS never guesses a
reorder level or universal quantity.

## Projects

Projects use `bdt_projects_v2:<companyId>:<userId>` local storage and are filtered
by the Operations department source key. They are not synchronized or shared.
The UI must keep the “Saved on this device” warning visible when creating or
viewing an improvement project.

## Verification

Run backend Operations/metrics tests, backend typecheck, frontend build, and the
Operations Playwright journey. Apply the control-plane lifecycle migration with
`pnpm --filter erpnext-control-plane db:migrate` before relying on provisioning
stage visibility in a deployment. The checked-in remote provisioning shim still
requires a separate reviewed rollout to the Azure VM.
