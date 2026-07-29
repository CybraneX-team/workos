# Meta Ads operating loop and Decision Inbox

Last verified: 2026-07-22.

This is the durable architecture map for the implemented Meta Ads product. It
is a starting point for future agents, not permission to trust stale prose:
trace the authoritative files listed at the end before changing behavior.

## Product boundary

WorkOS turns read-only Meta delivery evidence into a workflow:

```text
detect → diagnose → assign → apply manually in Ads Manager → measure → retain learning
```

This operating-loop path never changes campaigns, ad sets, ads, creatives,
audiences, placements, status, or budget. Its architecture test permits only
Graph reads and asynchronous Insights report creation. Campaign Studio now
provides a separate, approval-gated Website Traffic writer; it is intentionally
isolated from synchronization and experiment evaluation. See
[`meta-ads-campaign-studio.md`](meta-ads-campaign-studio.md).

Projects are deliberately excluded because the current Projects feature is
browser-local. ERPNext is excluded because this repository has no reliable
Meta campaign/ad attribution chain. Analysis and experiment outcomes are
deterministic; no LLM, email, or Meta write API participates.

## Ownership and flow

The WorkOS backend owns OAuth credentials, synchronization, normalized history,
deterministic findings, experiments, evaluation, permissions, and browser APIs.
The frontend owns presentation and manual workflow controls. Meta remains the
measurement source and Ads Manager remains the execution surface.

```text
Meta Graph API
  ├─ synchronous account/campaign reads
  ├─ resumable async ad-set/ad Insights reports
  └─ safe creative metadata reads
          ↓
backend worker (core first, deep diagnostics second)
          ↓
Supabase history + findings + decisions + experiments + append-only events
          ↓
/api/integrations/meta/*
          ↓
Paid Acquisition Inbox / Experiments / Results + Overview attention
          ↓
exact Ads Manager deep-link for manual execution
```

## Persistence and synchronization

The active migrations are:

- `20260714093000_meta_ads_operating_loop.sql` for account/campaign V1.
- `20260715090000_meta_ads_decision_inbox.sql` for deep delivery and workflow.
- `20260715100000_meta_ads_configuration_recalculation.sql` for durable stored
  recalculation after conversion-event changes.
- `20260716120000_meta_ads_campaign_studio.sql` for the isolated authoring,
  approval, job, mapping, asset, and event model.
- `20260722000000_meta_ads_lead_forms.sql` for Campaign Studio lead-form objects
  and CRM lead-sync support.

The matching numbered backend mirrors are `036`, `037`, `038`, `039`, and `040`. Keep
each pair byte identical.

Core history:

- `meta_ads_account_daily`: 90 account-local days.
- `meta_ads_campaign_daily`: 90 account-local days.
- `meta_ads_sync_runs`: durable scheduling, locks, retries, core/deep coverage,
  and safe warnings.
- `meta_ads_findings`: deterministic evidence, lifecycle, episode, diagnosis,
  and immutable recommendation source.

Decision Inbox additions:

- `meta_ads_delivery_daily`: 60 days of ad-set/ad delivery evidence.
- `meta_ads_delivery_windows`: exact current/prior aggregates for non-additive
  reach and frequency.
- `meta_ads_delivery_entities`: names, statuses, and sanitized creative metadata.
- `meta_ads_sync_segments`: resumable async report IDs and poll state.
- `meta_ads_finding_decisions`: episode-scoped dismissals.
- `meta_ads_experiments`: frozen recommendation, assignment, baseline, and result.
- `meta_ads_experiment_events`: append-only workflow timeline.
- `meta_ads_recalculation_jobs`: one coalesced generation per company/account
  with retry, lock-expiry recovery, and no Graph dependency.

Every row is company and ad-account scoped. An account switch never consumes
history from the former account; former experiments remain queryable in
History. The browser receives no token, provider metadata, or raw Graph error.

Initial connection queues a 90-day core backfill and a 60-day deep backfill.
The daily schedule remains `01:30 UTC`. Later runs replace the latest seven
complete Meta-account days so attribution updates are absorbed. Core
account/campaign ingestion completes first. A failed deep report does not erase
the usable operating brief: the run reports partial coverage and deep findings
are withheld until fresh deep evidence is complete.

Async report IDs, attempts, and availability timestamps are persisted. A worker
restart polls the existing report instead of submitting another. Creative reads
prioritize ads implicated in findings plus the top 100 ads by trailing spend;
thumbnail URLs are HTTPS-only, token-stripped references and media is not cached.

Changing the selected conversion event does not refetch Meta. The HTTP request
updates configuration, hides findings whose evidence depended on the former
event, and returns a newly derived brief from retained raw actions. In the same
atomic statement it queues a coalesced recalculation generation. The worker
then updates canonical metrics, deterministic findings, and measuring
experiments; a newer generation cannot be lost when an older worker finishes.

## Findings and episodes

Rules live in `findings.ts` and `deepFindings.ts`. Existing operational and
account/campaign rules remain. Deep rules cover:

- ad response decline, conservatively labelled repetition pressure when the
  frequency guards are met;
- selected-conversion efficiency outliers;
- campaign efficiency concentration with spend and purchase-volume guards;
- landing-page loss and delivery-cost pressure as diagnostics only.

Performance findings open after two consecutive detections and resolve after
two consecutive clear evaluations. Operational health alerts update
immediately. A resolved finding that recurs receives a new episode number.
Dismissals and experiments apply only to the episode on which they were made.

Only typed recommendations can start experiments. A recommendation freezes one
controlled change, its expected metric, the affected object, the measurement
scope, and variables that should remain constant. Landing-page and CPM
diagnostics intentionally cannot start experiments because the integration
does not observe enough configuration to prescribe a safe controlled change.

## Experiment lifecycle

`analytics:write` is required for every mutation; every Twin reader can inspect
evidence and history.

1. Start requires an active member owner, an account-local due date, a current
   active recommendation, and an idempotency key.
2. Planned work can be reassigned or rescheduled and exposes an exact Ads
   Manager link. Overdue work appears in the inbox and Overview.
3. Mark applied requires an implementation note, confirmation of the prescribed
   change, current data, and 14 complete baseline account days. The original
   selected conversion event and both 7/14-day baselines are frozen. The local
   application date is excluded.
4. Evaluation compares seven complete post-change days with seven baseline days.
   Insufficient volume extends the equal comparison to 14 days.
5. Outcomes are `improved`, `worsened`, `no_clear_change`, or `inconclusive`.
   CTR requires 2,000 impressions per side, CPA five selected conversions, and
   ROAS three purchases. Missing calendar data, disconnect/switch, insufficient
   14-day volume, a reported budget confound, or measured spend movement above
   30% yields an inconclusive result.
6. Final metrics and explanations are frozen. Later attribution refreshes never
   rewrite a completed result. Cancellation and dismissal require structured
   reasons and are retained in the audit history.

Removed owners retain their name snapshot; unfinished work becomes needs
reassignment. Disconnect and account-switch reconciliation runs immediately on
the integration path and also in the hourly safety sweep.

## Browser API

Read APIs (`twin:read`):

- `GET /api/integrations/meta/brief`
- `GET /api/integrations/meta/attention`
- `POST /api/integrations/meta/refresh`
- `GET /api/integrations/meta/sync-runs/:runId`
- `GET /api/integrations/meta/inbox`
- `GET /api/integrations/meta/experiments?view=active|history&cursor=...`
- `GET /api/integrations/meta/experiments/:experimentId`

Workflow APIs (`analytics:write`):

- `GET /api/integrations/meta/assignees`
- `POST /api/integrations/meta/findings/:findingId/experiments`
- `POST /api/integrations/meta/findings/:findingId/dismiss`
- `PATCH /api/integrations/meta/experiments/:experimentId`
- `POST /api/integrations/meta/experiments/:experimentId/apply`
- `POST /api/integrations/meta/experiments/:experimentId/cancel`

Mutation company/account identity always comes from authentication and the
current connection. Workflow conflicts and stale recommendations return `409`.
The legacy Meta sync and generic metrics responses remain compatible.

## Frontend entry points

The container hub opens at:

```text
/universal?focus=mkt_paid_acquisition&tab=inbox
```

The existing three Paid Acquisition leaf panels use the same operating-brief
hook. The hub adds Inbox, Campaigns, Experiments, and Results. Inbox and
Experiments remain deterministic and read-only toward Meta. Campaigns imports
the isolated Campaign Studio described in its architecture file. Read-only
members see evidence, progress, results, drafts, and Ads Manager links but no
mutation controls.
Overview reserves space only for unresolved warning/critical work or overdue
experiments and deep-links to the Inbox.

## Fixtures and verification

The fixture writer is dry-run-first and disabled in production:

```sh
pnpm --filter backend seed:meta-ads-fixture -- --company-id=<uuid> --scenario=ad-response-decline
pnpm --filter backend seed:meta-ads-fixture -- --company-id=<uuid> --scenario=ad-response-decline --execute
```

V1 states remain, and Decision Inbox scenarios include `ad-response-decline`,
`conversion-outlier`, `landing-page-loss`, `planned-experiment`,
`overdue-experiment`, `measuring-experiment`, `improved`, `worsened`,
`no-clear-change`, `day-7-low-volume`, and `day-14-inconclusive`.

Use `docs/runbooks/meta-ads-decision-inbox.md` for the disposable end-to-end
procedure and `docs/runbooks/playwright-automation.md` before changing browser
automation.

## Authoritative files

- `apps/backend/src/adapters/metaAds.ts` — Graph reads and async reports.
- `apps/backend/src/adapters/metaAdsAuthoring.ts` — isolated approval-gated
  writer; synchronization must never import it.
- `apps/backend/src/domains/meta-ads/deepSync.ts` — deep ingestion and resume.
- `apps/backend/src/domains/meta-ads/findings.ts` and `deepFindings.ts` — rules.
- `apps/backend/src/domains/meta-ads/decisionInbox.ts` — workflow/evaluator.
- `apps/backend/src/domains/meta-ads/service.ts` — scheduler, worker, read model.
- `apps/backend/src/domains/meta-ads/router.ts` — authenticated API.
- `apps/backend/src/routes/integrations.ts` — connect/switch/disconnect edges.
- `packages/shared-types/src/integrations.ts` — shared contracts.
- `apps/frontend/src/components/workspace/panels/MetaAdsDecisionWorkspace.tsx`
  — Inbox, Campaigns, Experiments, Results, and drawers.
- `docs/architecture/meta-ads-campaign-studio.md` — authoring boundary and
  authoritative writer map.
- `apps/frontend/src/lib/integrations/useMetaAdsDecisionInbox.ts` — workflow hook.
- `apps/backend/test/metaAdsOperatingLoop*.test.ts` — deterministic and DB tests.
- `apps/frontend/e2e/meta-ads/` — API, permission, UI, and demo coverage.
