# Meta Ads Campaign Studio verification

Last verified: 2026-07-22.

This runbook verifies creative generation, final ad editing, deterministic
preflight, paused publication, the separate launch gate, emergency pause, and
audit history without risking a real ad account.

## 1. Apply the additive migration

Back up a shared development database first. Preview the target and use the
configured `DATABASE_URL`; never print credentials in logs.

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/frontend/supabase/migrations/20260716120000_meta_ads_campaign_studio.sql
```

The frontend and backend migration mirrors must match:

```sh
cmp apps/backend/db/migrations/039_meta_ads_campaign_studio.sql \
  apps/frontend/supabase/migrations/20260716120000_meta_ads_campaign_studio.sql
```

Lead-form support adds a second additive migration. Without it the `leadform`
publish step violates the `object_kind` CHECK and silently never runs:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/frontend/supabase/migrations/20260722000000_meta_ads_lead_forms.sql

cmp apps/backend/db/migrations/040_meta_ads_lead_forms.sql \
  apps/frontend/supabase/migrations/20260722000000_meta_ads_lead_forms.sql
```

## 1a. Lead-form prerequisites (one-time, per Meta App and Page)

Lead forms need more than the campaign permissions:

| Requirement | Where | Notes |
| --- | --- | --- |
| `pages_manage_ads` | Meta App console | Creates the lead form. |
| `leads_retrieval` | Meta App console | Reads submitted leads. Needs App Review for Advanced Access — **the long pole**, and outside your control. |
| Lead Generation Terms | Facebook Page settings | Manual acceptance. No API can set it; preflight blocks with `meta_leadgen_tos_required` until it is done. |

Check the terms without leaving the shell:

```sh
curl -s -G "https://graph.facebook.com/v25.0/me/accounts" \
  --data-urlencode "access_token=$META_SANDBOX_ACCESS_TOKEN" \
  --data-urlencode "fields=id,name,leadgen_tos_accepted"
```

Verified 2026-07-22 against the sandbox: form creation and `OUTCOME_LEADS` campaigns
succeed with `pages_manage_ads` + `ads_management`, but the ad set is rejected until the
Page accepts the terms, and `leads_retrieval` was not granted so the lead round-trip
remains untested.

## 2. Automated fake-sandbox lifecycle

This test creates and cleans a disposable company/user, generates deterministic
fake images into the real private development bucket, executes durable fake Meta
jobs, and verifies paused publication → launch → pause → clone.

```sh
pnpm --filter backend test:meta-ads-authoring-db
```

It requires the normal backend development database, Supabase service-role, and
encryption settings. The package script sets:

```text
META_AUTHORING_MODE=sandbox_only
META_AUTHORING_FAKE_META=true
META_AUTHORING_FAKE_GEMINI=true
META_AUTHORING_LAUNCH_ENABLED=true
```

Also run:

```sh
pnpm --filter backend test:meta-ads
pnpm --filter backend test:meta-ads-db
pnpm --filter backend typecheck
pnpm --filter frontend build
pnpm --filter frontend test:e2e:meta-ads
```

On a remote shared development Supabase project, Playwright intentionally
requires `RBAC_E2E_ALLOW_SHARED_DEV=true`; it creates and deletes disposable
fixtures. Prefer isolated ports (`E2E_PORT` and `E2E_BACKEND_PORT`) so a stale
local server cannot bypass the test environment.

### Guided browser walkthrough

For a human-readable Campaign Studio walkthrough, run:

```sh
pnpm --filter frontend demo:meta-ads-campaign-studio
```

This is one continuous browser test rather than the broad 47-test Meta suite.
The browser opens before disposable fixture setup and displays setup progress.
Every major product state has an overlay with `Pause / Resume` and `Next step`
controls; Space pauses and Right Arrow advances.

The walkthrough exercises the real frontend, backend APIs, database, private
creative bucket, deterministic preflight, and company-scoped job processors. It
forces fake Gemini and fake Meta adapters, never calls Meta, and cleans the
disposable company, users, rows, and creative files afterward. It demonstrates:

```text
brand kit → brief → creative generation → final ad editing → preflight
→ publish-paused approval → verified paused objects → launch approval
→ scheduled state → emergency pause → clean editable clone
```

For fast headless verification of the same continuous flow:

```sh
pnpm --filter frontend test:e2e:meta-ads-campaign-studio-demo
```

The guided test uses ports `5174` and `8082` by default and refuses to reuse
existing servers. Override them with `META_ADS_CAMPAIGN_DEMO_FRONTEND_PORT` and
`META_ADS_CAMPAIGN_DEMO_BACKEND_PORT` if needed.

## 3. Manual local fake mode

Use only in local development:

```env
META_AUTHORING_MODE=sandbox_only
META_AUTHORING_FAKE_META=true
META_AUTHORING_FAKE_GEMINI=true
META_AUTHORING_LAUNCH_ENABLED=true
RUN_WORKER=true
```

Seed a disposable company with the existing Meta fixture, then start backend and
frontend. Sign in as a founder/admin and open:

```text
http://localhost:5173/universal?focus=mkt_paid_acquisition&tab=campaigns
```

Verify:

1. Readiness shows the sandbox account, currency, timezone, and accessible Page.
2. Save a complete brand kit.
3. Create a campaign and complete the explicit brief, destination, identity,
   broad audience, lifetime budget, and dates.
4. Generate three concepts and confirm 1:1, 4:5, and 9:16 assets, or upload an
   image. Select one to three ads and edit every final copy field.
5. Run preflight. Confirm unsupported categories, localhost/HTTP destinations,
   missing assets/copy, and invalid schedules block submission.
6. Submit and approve publication. Polling must finish at `published_paused` and
   show campaign/ad-set/ad mappings plus the exact Ads Manager link.
7. Approve launch separately. A future start date should become `scheduled`.
8. Emergency pause and confirm the draft becomes `paused`.
9. Clone and confirm the new draft is editable with no Meta object IDs.
10. Inspect the append-only timeline and verify actor snapshots and both
    approvals are retained.

Repeat as analyst: creation/editing is available but approvals are hidden.
Repeat as viewer/engineer/investor: all mutation controls are hidden.

## 3a. Meta App console prerequisites (one-time, per Meta App)

Found by trial and error 2026-07-21 and not documented anywhere else. Before
any real OAuth connect (sandbox or production) will succeed, the Meta App
itself (developers.facebook.com) needs:

- **App Domains** (App settings → Basic) containing the bare host the backend's
  `META_REDIRECT_URI` uses. Missing this fails at the Facebook login dialog
  itself with "Can't load URL — domain not in app's domains", before the
  redirect-URI check ever runs.
- **Valid OAuth Redirect URIs** (Facebook Login for Business → Settings): the
  exact `META_REDIRECT_URI` value, full scheme and path, byte-for-byte.
- Every scope in `getMetaOAuthUrl()` (`apps/backend/src/adapters/metaAds.ts`)
  needs its permission explicitly added under **Use cases → \<relevant use
  case\> → Customize → Permissions and features → `+ Add`**. Adding a use
  case card is not enough — each permission inside it needs its own `+ Add`.
  In particular: `instagram_basic`'s actual dependency is
  `pages_read_user_content` (under "Manage Pages"), not the more
  obvious-looking `pages_read_engagement` that's already in the scope list.
  Requesting a scope whose dependency isn't enabled fails the whole OAuth
  call with `Invalid Scopes: <name>` — Meta doesn't say which dependency is
  missing, only which top-level scope it's rejecting.
- Each permission should show **"Ready for testing"** (Standard Access) once
  added — sufficient for the app owner's own account without App Review.

If the OAuth scope list in code ever changes, re-check this section against
`getMetaOAuthUrl()` and Meta's own Permissions Reference
(developers.facebook.com/docs/permissions) for each scope's real dependencies —
don't assume a scope's dependency is whichever permission looks most related.

## 4. Live Meta sandbox smoke

Create/use Meta test users and a sandbox ad account. Ensure the test user can
access a test Page and that the app OAuth grant includes the scopes documented
in the architecture file.

First run the non-mutating account/history smoke, then the stricter authoring
prerequisite check:

```sh
pnpm --filter backend test:meta-sandbox-live
pnpm --filter backend test:meta-sandbox-authoring-live
```

The second command intentionally fails until the sandbox token exposes at least
one accessible test Page; it does not create or modify Meta objects.

Use:

```env
META_AUTHORING_MODE=sandbox_only
META_AUTHORING_FAKE_META=false
META_AUTHORING_FAKE_GEMINI=false
META_AUTHORING_LAUNCH_ENABLED=false
```

Connect through the normal OAuth flow. Verify account/Page readiness, generate
or upload one image, submit, and approve paused publication. Acceptance requires:

- a campaign, ad set, creative, and ad are visible in Ads Manager;
- campaign/ad-set/ad configured status is `PAUSED`;
- objective, optimization, lifetime budget, dates, targeting, destination,
  identity, copy, CTA, and image match the frozen WorkOS draft;
- Meta standard creative enhancements are opted out;
- repeating the same job does not create duplicate marker-named objects;
- no token or raw Graph error appears in browser responses.

Do not enable launch for the live sandbox smoke until paused-object inspection
passes. Sandbox delivery/non-zero spend is not an acceptance requirement. Clean
up the test objects manually in Ads Manager after verification.

## 4a. Mutating sandbox tier

The only tier that writes to Meta. Everything else is read-only, and the publish path is
otherwise exercised only against fakes — which do not validate payloads, and so allowed a
Graph v25-invalid campaign payload to ship unnoticed.

```sh
pnpm --filter backend test:meta-sandbox-mutating
```

Creates a lead form and an `OUTCOME_LEADS` campaign from the shipping payload builders,
asserts the campaign is `PAUSED`, then tears both down. Campaigns delete; lead forms only
archive (Graph refuses `DELETE` with `error_subcode 33`), so the sandbox Page accumulates
archived `[WorkOS:...]` forms by design — that prefix is also how to find anything a crashed
run orphaned.

The ad set is deliberately not created: Meta rejects lead-gen ad sets until the Page accepts
its Lead Generation Terms. The test warns and continues when `leadgen_tos_accepted` is false.

## 5. Real-account boundary

Keep production-like environments at:

```env
META_AUTHORING_MODE=disabled
META_AUTHORING_LAUNCH_ENABLED=false
```

If a separately reviewed test requires a real account, both conditions are
mandatory:

```env
META_AUTHORING_MODE=allowlisted_real
META_AUTHORING_ALLOWED_ACCOUNT_IDS=act_exact_reviewed_account
```

An empty allowlist permits no real account. Keep launch disabled for the first
paused-publication inspection. Enabling launch is a separate operational
decision because it can cause spend; code-level approval does not replace that
authorization.

Production (`startup-twin-backend`) was set to `allowlisted_real` on
2026-07-21 with one real ad account, launch still disabled. See
[`docs/runbooks/cloud-deploy.md`](cloud-deploy.md) for the exact commands and
the account ID — do not duplicate the ID here, it drifts.

## Failure triage

- `meta_account_not_allowed`: inspect mode, sandbox flag, and exact account
  allowlist; do not broaden the allowlist to diagnose.
- `meta_prerequisites_unavailable`: reconnect and verify Graph scopes/Page role.
- `campaign_preflight_stale`: reload; account, ERP item, or draft snapshot changed.
- failed generation: inspect the durable generation job; retry uses backoff and
  does not mutate Meta.
- failed publication: inspect job steps and mappings. The worker reconciles by
  deterministic marker and pauses any known parent before retrying.
- `meta_state_drift` at launch: inspect the paused objects in Ads Manager. Do not
  force activation; clone or restore the expected paused state after review.

Never paste tokens, encrypted values, customer data, or raw provider payloads
into this runbook or an issue.
