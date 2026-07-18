# Meta Ads operating loop, Decision Inbox, and Campaign Studio

Last verified: 2026-07-16. Start with the read architecture in
[`docs/architecture/meta-ads-operating-loop.md`](../../../../docs/architecture/meta-ads-operating-loop.md)
and the isolated writer architecture in
[`docs/architecture/meta-ads-campaign-studio.md`](../../../../docs/architecture/meta-ads-campaign-studio.md).

This backend-private domain owns read-only Meta history, resumable deep reports,
deterministic findings, the durable Decision Inbox, experiment evaluation, and
browser APIs. It also owns approval-gated Website Traffic authoring through a
separate writer adapter. WorkOS goals, permissions, and BDT nodes remain in
their existing domains.

## Invariants

- Graph synchronization performs reads only. Async Insights report creation is
  the sole permitted POST and does not mutate an ad object.
- Every historical row and finding is scoped by both company and ad account. Reconnecting another account cannot blend histories.
- Dates are complete calendar days in the Meta ad account timezone. Scheduling is fixed at `01:30 UTC`.
- Account/campaign history retains 90 days; ad-set/ad history retains 60. Later
  refreshes replace the latest seven complete days.
- Performance findings need two detections to open and two clear evaluations to resolve. Connection and data-health findings change immediately.
- Dismissals and experiments are finding-episode scoped. Completed results are
  frozen and never rewritten by attribution refreshes.
- Synchronization, findings, and experiments never import the Meta writer.
  `metaAdsAuthoring.ts` is the sole Meta object writer and is reachable only
  through Campaign Studio's paid-media permissions, environment/account gates,
  frozen approvals, and durable jobs.
- Campaign Studio is Website Traffic only, creates one broad lifetime-budget ad
  set and 1–3 single-image ads paused, requires a second approval to launch,
  and permits only emergency pause after launch. Projects and email remain out.
- Browser responses contain safe Ads Manager links and normalized errors, never tokens or raw Graph errors.

## Runtime

The existing backend worker calls `scheduleDailyMetaAdsSyncs`,
`processOneMetaAdsRecalculationJob`, `processOneMetaAdsJob`, and hourly
reconciliation. Core history completes first; durable async deep segments then
resume until current or partial. A newly connected account receives an
`initial_backfill` job immediately. Manual refreshes coalesce with an existing
pending/running account job.

Selecting a conversion event derives the visible brief immediately from stored
raw actions, invalidates findings whose evidence used the prior selection, and
atomically coalesces a `meta_ads_recalculation_jobs` generation. The worker then
updates canonical metrics, findings, and measuring experiments without another
Meta API read. Expired locks resume safely after a worker crash.

`decisionInbox.ts` owns start/dismiss/update/apply/cancel, baseline freezing,
7→14-day evaluation, account-switch handling, and append-only events. The public
read/workflow model is exposed under `/api/integrations/meta` by `router.ts`.
The legacy Meta sync and generic metrics endpoints still use the stored core
read model.

`authoring.ts` owns brand kits, versioned drafts, deterministic preflight,
generation/publish/launch jobs, approval snapshots, idempotent Meta mappings,
and the append-only campaign timeline. `creativeGeneration.ts` limits Gemini to
explicit user context and private signed assets. `metaAdsAuthoring.ts` is the
only adapter allowed to POST mutations to Meta. Real accounts fail closed unless
explicitly allowlisted; see the Campaign Studio architecture and runbook.

## Development fixtures

Preview a deterministic fixture command first:

```sh
pnpm --filter backend seed:meta-ads-fixture -- --company-id=<uuid> --scenario=deteriorating
```

Execute only after confirming the development company:

```sh
pnpm --filter backend seed:meta-ads-fixture -- --company-id=<uuid> --scenario=deteriorating --execute
```

Decision scenarios include `ad-response-decline`, `conversion-outlier`,
`landing-page-loss`, planned/overdue/measuring experiments, and deterministic
improved/worsened/no-change/low-volume outcomes. See the architecture document
for the complete list.

Advance one experiment that was started and applied in the browser:

```sh
pnpm --filter backend advance:meta-ads-experiment-fixture -- --experiment-id=<uuid> --outcome=improved
pnpm --filter backend advance:meta-ads-experiment-fixture -- --experiment-id=<uuid> --outcome=improved --execute
```

Execution replaces the selected development company's current Meta connection
and fixture-account operating data. The `disconnected` scenario deletes all
Meta history, runs, and findings for that company. Fixtures are disabled when
`NODE_ENV=production`.

Follow [`docs/runbooks/meta-ads-decision-inbox.md`](../../../../docs/runbooks/meta-ads-decision-inbox.md)
for the continuous browser-to-result test.

Follow [`docs/runbooks/meta-ads-campaign-studio.md`](../../../../docs/runbooks/meta-ads-campaign-studio.md)
for fake and live-sandbox authoring verification.
