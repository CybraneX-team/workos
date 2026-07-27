# Playwright automation runbook for AI agents

Last verified: **2026-07-15**

Use this runbook before creating or materially changing Playwright automation in this monorepo. It records the recurring problems encountered while building the Meta Ads operating-loop demo and turns them into reusable engineering rules.

This document is guidance, not a substitute for tracing current code. The application, migrations, Playwright configuration, and tests remain authoritative.

## Authoritative files

- Default Playwright configuration: `apps/frontend/playwright.config.ts`
- Recordable Meta Ads configuration: `apps/frontend/playwright.meta-demo.config.ts`
- Disposable Supabase fixture: `apps/frontend/e2e/rbac/helpers/fixture.ts`
- E2E environment safety gate: `apps/frontend/e2e/rbac/helpers/env.ts`
- Browser sign-in helpers: `apps/frontend/e2e/rbac/helpers/ui.ts`
- Meta Ads API/UI contract tests: `apps/frontend/e2e/meta-ads/meta-ads-api.spec.ts` and `meta-ads-ui.spec.ts`
- Recordable tour: `apps/frontend/e2e/meta-ads/meta-ads-demo.spec.ts`
- Meta Ads BDT/test helpers: `apps/frontend/e2e/meta-ads/helpers.ts`
- Deterministic Meta fixture writer: `apps/backend/scripts/seed-meta-ads-fixture.ts`
- Meta worker and brief implementation: `apps/backend/src/domains/meta-ads/service.ts`
- Recording instructions: `apps/frontend/e2e/meta-ads/DEMO.md`

## First decide what kind of automation is needed

Do not put every concern into one long browser test.

| Need | Correct test type | Data strategy |
|---|---|---|
| Authorization, tenant isolation, API shape, RLS | API/database contract test | Disposable real records and direct API/DB assertions |
| UI state, actions, links, loading/error behavior | Focused browser test | Route fixture or narrowly seeded real state |
| OAuth/account discovery against a provider sandbox | Explicit live integration test | Real sandbox, opt-in environment flag |
| Deterministic non-zero analytics and findings | Backend unit/DB test plus focused UI test | Seed normalized stored evidence |
| Senior/stakeholder video | Dedicated headed visual tour | Disposable workspace, deterministic scenarios, captions and pacing |

A visual tour is not the primary correctness suite. It should reuse behavior already covered by narrower tests and prove that the complete presentation path remains navigable.

## IDT Root Focus journey

For the reference-company Root Focus UI, cover the boundaries rather than mocking a
model response in the browser: create, edit, and delete a note; reload to confirm the
same-browser local note persists; send a branch-chat question and render only the
returned plain-text reply and allow-listed citation link; switch branches; then reload
to confirm the chat session has cleared. Branch chat is chat-only, so this journey must
not expect an action-workspace handoff or any IDT-data mutation.

Use an authenticated disposable workspace with stored reference-company source data.
The backend chat contract test owns authorization, source allow-listing, invalid IDs,
and unavailable-model behavior; the browser test owns visible loading, error, retry,
and safe-link behavior.

## Recommended workflow

1. Read the nearest `AGENTS.md` and inspect existing Playwright configs and helpers.
2. Trace the UI action through the frontend service, backend route, persistence, worker, and response that drives the final visible state.
3. Enumerate states before coding: success, empty, loading, delayed, stale, failed, disconnected, unauthorized, and any historical/preserved-data state.
4. Decide which states require real infrastructure and which should be deterministic fixtures.
5. Add or reuse a safety-gated disposable fixture.
6. Build and pass focused tests first.
7. Build the long visual tour from those working helpers.
8. Rehearse long tours in sections, then run one uninterrupted full rehearsal.
9. Run the narrow backend tests, DB tests, typechecks, lint, and `git diff --check`.
10. Update this runbook when a new recurring failure mode is discovered.

## Environment and process isolation

### Use isolated ports for a recordable tour

The Meta Ads demo owns backend port `8082` and frontend port `5174`. The normal E2E configuration uses `8080` and `5173` by default.

Why this matters:

- A developer may already have servers running with stale code or different environment variables.
- `reuseExistingServer: true` can silently test the wrong process.
- A normal backend worker can mutate fixture state while the browser is trying to show it.

For a deterministic tour:

- use `reuseExistingServer: false`;
- use dedicated ports;
- set `RUN_WORKER=false` unless the worker itself is under test;
- set `workers: 1` and serial mode when scenarios share a company or provider account;
- point `VITE_BACKEND_URL` at the isolated backend;
- avoid running Playwright video/trace capture while an external screen recorder is active unless diagnostics require it.

For ordinary focused tests, reusing a known development server can be faster, but verify that it was restarted after backend or environment changes.

### Environment values are loaded from two applications

Current E2E helpers read frontend `.env.local` and backend `.env`. Required Supabase values include the URL, anon key, and service-role key. Provider live tests may need additional backend credentials.

Never copy secrets into tests, documentation, snapshots, or failure messages.

### Remote-database safety is mandatory

The shared RBAC fixture creates and deletes Auth users, companies, memberships, goals, and domain records. `getRbacE2EEnv()` blocks remote Supabase by default.

Use the shared development target only with the explicit gate:

```bash
RBAC_E2E_ALLOW_SHARED_DEV=true
```

Do not weaken or bypass the production-looking target guard. New destructive fixtures must reuse or strengthen this gate.

## Data setup and cleanup

### Prefer disposable, uniquely named fixtures

Use a per-run identifier for emails, company slugs, external IDs, and local IDs. Never rely on an existing human account or company.

Create fixtures in dependency order:

1. company;
2. Auth users and profiles;
3. memberships/RBAC;
4. BDT structure and goals;
5. integration connection;
6. normalized domain history and sync runs.

Clean up in reverse dependency order. Use `try/finally`, Playwright fixtures, or `afterAll` so cleanup also runs after assertion failures. Cleanup should be idempotent and log warnings without hiding the original test failure.

If a new table does not cascade from `company_id`, explicitly add it to cleanup. Confirm cleanup by querying for the per-run marker after a failed rehearsal.

### Seed the smallest valid product graph

Do not import a large production-like BDT seed just to reach one workspace. `seedMinimalPaidAcquisitionBdt()` creates the smallest hierarchy needed by the Meta Ads paths.

The seed must still match real product semantics:

- stable `sourceKey` values used by routing;
- correct branch/metric levels;
- leaf nodes for panels that only open from actionable nodes;
- real RPC/schema constraints.

An oversimplified graph may make a Playwright selector pass while bypassing the actual navigation contract.

### Use real provider sandboxes only for what they can prove

Meta's sandbox is useful for OAuth, token handling, account discovery, permissions, and zero-data behavior. It does not reliably produce non-zero delivered campaign insights.

Therefore the Meta Ads demo uses a deliberate hybrid:

- real development-sandbox connection through the UI;
- deterministic normalized account/campaign history for non-zero scenarios;
- real backend brief/finding/configuration APIs over that stored history;
- no Meta campaign mutation.

Never claim seeded stored evidence was delivered by Meta. Keep live-provider tests separately gated so normal E2E runs do not depend on network availability or provider quotas.

### Seed stored scenarios, not browser response blobs, when testing the operating loop

For end-to-end analytics behavior, seed the persistence layer that the backend actually reads. This verifies aggregation, findings, tenant scoping, and frontend rendering together.

The current Meta fixture supports:

- `disconnected`
- `backfilling`
- `healthy`
- `no-spend`
- `missing-conversion`
- `deteriorating`
- `refreshing`
- `stale`
- `failed-sync`
- `historical`
- `ad-response-decline`
- `conversion-outlier`
- `landing-page-loss`
- `planned-experiment`, `overdue-experiment`, and `measuring-experiment`
- `improved`, `worsened`, and `no-clear-change`
- `day-7-low-volume` and `day-14-inconclusive`

Keep scenarios deterministic relative to an account calendar date. Assert exact evidence in backend tests; browser tests should primarily assert the resulting user-visible state.

For one continuous browser-started experiment, use the production-disabled,
dry-run-first `advance:meta-ads-experiment-fixture` command after marking it
applied. Do not switch to an outcome scenario: the normal scenario writer
replaces finding rows and therefore intentionally cascades the old fixture
experiment. The complete procedure is in `meta-ads-decision-inbox.md`.

### Bulk-write time-series fixtures

The first implementation inserted dozens of account rows and hundreds of campaign rows serially. That made every scenario switch expensive and multiplied the cost of each failed rehearsal.

Use one bulk statement per logical dataset. The current fixture and ingestion service use `jsonb_to_recordset` for account and campaign rows. Keep transaction boundaries clear and fail the whole scenario if a required write fails.

## Background workers and race conditions

### A worker can invalidate a perfectly seeded scenario

The normal Meta worker sees pending/running jobs and connected accounts. During early rehearsals it claimed fixture jobs and replaced deterministic state with real sandbox results.

Current protection:

- fixture connections carry `metadata.fixture_scenario`;
- job claiming excludes those connections;
- daily scheduling excludes those connections;
- DB tests verify both exclusions.

If a new worker can touch test-owned rows, add an explicit fixture marker and test the exclusion. Turning the worker off in the demo process is necessary but not sufficient when another developer backend may share the database.

### Make “latest record” ordering unambiguous

The UI chooses the latest sync run by `requested_at`. A completed run and a special `running` or `failed` run with equal timestamps produced nondeterministic states.

Fixture rule: give the state-defining run a strictly newer timestamp than supporting runs. Do not rely on insertion order when SQL orders only by a timestamp.

When production semantics permit ties, add a deterministic secondary ordering key such as `id` or creation sequence.

### Test async state transitions through observable outcomes

Examples from the Meta flow:

- after selecting a conversion event, the control becomes disabled during save and enabled after completion;
- the owner select starts with no asynchronously loaded members;
- manual refresh returns a durable run that moves through pending/running/complete/failed.

Prefer:

```ts
await expect(control).toBeDisabled();
await expect(control).toBeEnabled();
await expect.poll(() => select.locator('option').count()).toBeGreaterThan(1);
```

Do not use fixed sleeps to prove correctness. `waitForTimeout()` is acceptable only for visual pacing, controlled animations, or a deliberate recording pause after the correctness assertion has already passed.

## Selector and navigation rules

### Prefer user-facing selectors

Use, in order:

1. role and accessible name;
2. associated label;
3. stable visible text;
4. a dedicated test ID only when the interface has no suitable accessible contract.

Avoid CSS classes, DOM ancestry assumptions, generated IDs, and `nth()` unless position is itself the product contract.

Scope repeated labels to a card, modal, navigation region, or panel before acting.

### Model legitimate intermediate screens

Deep links into the 3D BDT do not always render the final hub immediately. Depending on synchronization timing, Playwright may first see:

- the operating brief;
- the `Open Paid Acquisition` CTA;
- the Paid Acquisition node that must be selected before the CTA appears.

`ensurePaidAcquisitionCta()` handles this union of valid states. Use this pattern instead of asserting one transient representation.

### Exercise normal user navigation when route-driven modal state is stale

Opening the connected Integration modal directly through a query parameter exposed a stale-prop/timing race. The stable path is:

1. navigate to `/twin/data`;
2. click `Integrations`;
3. wait for the connected Meta card;
4. click the card;
5. assert live brief content.

Direct URLs are still appropriate when deep linking is itself the behavior under test. Otherwise use the product's normal click path.

### Do not erase a deep link before parent/scene state synchronizes

The 3D scene receives a selected department and an internal path from its parent, but its local `selectedId` synchronizes one render later. Validating the path while `selectedId` was still `null` erased the deep link.

The fix in `Scene.tsx` preserves a supplied path until department selection catches up. General lesson: when URL state and local scene state synchronize in separate effects, model the initialization phase explicitly instead of treating temporary `null` as a user reset.

## React and data-fetching issues exposed by automation

### State updates inside fetch effects must be idempotent

The Integration modal fetched a Meta brief, then always replaced `connection.lastSynced`. Because the fetch effect depended on `connection`, this created repeated refetch/loading behavior.

The fix updates connection state only when `lastSuccessfulSyncAt` actually changed. Apply the same rule elsewhere: an effect must not recreate a dependency object on every successful fetch unless another run is intended.

### Repeated full-page 3D navigation is noisy and expensive

Rapid BDT remounts currently emit Three.js deprecation warnings and can emit a React Three Fiber `Maximum update depth exceeded` error around canvas sizing. In the completed Meta tour the page continued and assertions passed, but this is product-level technical debt, not expected Playwright behavior.

For new automation:

- minimize unnecessary full remounts of the 3D scene;
- wait for a stable user-visible landmark before the next navigation;
- distinguish harmless renderer warnings from an assertion-affecting crash;
- retain screenshots/trace for focused failures;
- file or fix a product issue if the error changes visible behavior or makes the run flaky.

Do not hide browser exceptions globally just to make a test green.

### Shared hooks may be transiently empty during repeated navigation

The owner configuration UI depends on team members loaded from `/api/team/members`. Repeated navigation exposed transient fetch failures and empty option lists.

Production mitigation in `useTeamMembers()` retries quickly after failure and polls slowly after success. The recordable demo additionally fulfills only this endpoint with the real disposable founder membership ID to keep the presentation deterministic.

Important boundary: do not intercept `/api/team/members` in RBAC/API authorization tests. A narrow route fixture is acceptable for presentation stability only when authorization is separately tested and the fixture uses IDs from the real disposable records.

## Building a recordable visual tour

A stakeholder tour needs different ergonomics from a correctness test:

- headed Chromium;
- fixed viewport and color scheme;
- one worker and no retries;
- readable scene captions;
- safe pause/resume and next-step controls;
- deliberate scroll positioning for lower sections;
- no mouse or keyboard intervention required for the normal path;
- a final completion scene;
- isolated setup and automatic cleanup.

Keep captions outside product components. Injecting a temporary overlay from the test prevents demo-only presentation code from entering the application bundle.

The current tour supports Space to pause/resume and Right Arrow to advance one scene. Presentation timers belong only in `showScene()`/display helpers, never in the product assertions.

## Efficient debugging of long tours

The full Meta Ads rehearsal takes several minutes even with abbreviated captions. Re-running from the beginning after every late failure wastes time and creates more external state.

Use the existing section flags while developing:

```bash
META_ADS_DEMO_INTRO_ONLY=1
META_ADS_DEMO_CONNECTED_MODAL_ONLY=1
META_ADS_DEMO_TAIL_ONLY=1
META_ADS_DEMO_DECISION_ONLY=1
META_ADS_DEMO_RECOVERY_ONLY=1
```

These are development aids. The deliverable is not complete until the normal full command passes without any section flag.

Debug in this order:

1. Run the failing narrow API/unit/DB test.
2. Run only the smallest visual-tour section that reaches the failure.
3. Inspect Playwright screenshot/trace or run headed/debug mode.
4. Determine whether the fault is fixture data, worker interference, navigation timing, selector ambiguity, or product behavior.
5. Fix the responsible layer; do not compensate with a longer arbitrary timeout.
6. Re-run the section.
7. Run the full headless rehearsal once.

When a failure occurs near the end, preserve its exact URL, latest sync rows, connection metadata, and visible landmark before cleanup if safe. Avoid dumping tokens or provider errors containing credentials.

## Common failure diagnosis

| Symptom | Likely cause | First check |
|---|---|---|
| Seeded state changes by itself | Another worker claimed/scheduled fixture data | Connection fixture marker and worker exclusion query |
| `refreshing` renders as healthy/complete | Timestamp tie or wrong latest run | Order of sync runs by `requested_at` |
| Direct deep link returns to container/root | Parent and 3D local path synchronized in different renders | `selectedInternalPathProps` and `selectedId` effects |
| Integration modal continuously loads/refetches | Effect updates one of its own object dependencies | Idempotency of `setConn`/similar state update |
| Owner select has only placeholder | Team API has not loaded or transiently failed | `/api/team/members` response and option count |
| CTA is missing but node is visible | Valid intermediate BDT navigation state | Select node, then assert CTA |
| Test is slow before browser interactions | Serial DB fixture writes | Batch insert strategy and indexes |
| Sandbox connects but has zero insights | Provider sandbox limitation | Separate live connection proof from seeded analytics |
| Full run fails but each section passes | Shared state, ordering, cleanup, or worker interference | Scenario transition boundaries and latest rows |
| Browser logs R3F maximum-depth error | Repeated 3D canvas mount/resize loop | Whether visible UI crashed; inspect `Scene`/canvas lifecycle |
| Fetch fails immediately after navigation | Process startup, remount, or aborted request race | Health endpoints, stable landmark, backend logs |

## Verification commands

From the monorepo root:

```bash
# Focused Meta browser/API tests
pnpm --filter frontend test:e2e:meta-ads

# Fast full visual-tour rehearsal
pnpm --filter frontend test:e2e:meta-ads-demo

# Headed recordable tour
pnpm --filter frontend demo:meta-ads

# Meta operating-loop logic and database behavior
pnpm --filter backend test:meta-ads
pnpm --filter backend test:meta-ads-db

# Relevant static checks
pnpm --filter backend typecheck
pnpm --filter frontend typecheck
```

Run focused lint on new Playwright files and finish with:

```bash
git diff --check
```

The live Meta sandbox test is intentionally opt-in. Read its source and environment guard before running it.

## Completion checklist

- Every required user-visible state is enumerated and asserted somewhere.
- Correctness is covered by focused tests, not only by the long visual tour.
- External provider use is explicit, gated, and limited to what the sandbox can prove.
- No production or human-owned company/user is used.
- Fixture records are unique, deterministic, and cleaned up.
- Other running workers cannot mutate deterministic fixture state.
- “Latest” records have deterministic ordering.
- Selectors use accessible product contracts.
- Correctness waits use observable state, not arbitrary sleeps.
- The visual tour has captions, controls, isolated ports, and a completion scene.
- Section rehearsals pass, followed by one uninterrupted full rehearsal.
- Backend unit/DB tests and affected typechecks/lint pass.
- Secrets and transient IDs are absent from docs and committed artifacts.

## Update triggers

Update this runbook in the same change when any of these change:

- Playwright ports, environment files, or server startup commands;
- Supabase safety gates or disposable fixture lifecycle;
- authentication/sign-in flow;
- 3D BDT deep-link behavior;
- background-worker fixture exclusion;
- Meta sandbox capabilities or fixture scenarios;
- recording controls or visual-tour commands;
- a new recurring source of flaky waits, state races, or cleanup failures.
