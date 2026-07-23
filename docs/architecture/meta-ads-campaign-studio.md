# Meta Ads Campaign Studio

Last verified: 2026-07-22.

Campaign Studio adds a narrow, approval-gated Meta write surface to Paid
Acquisition. It is deliberately separate from the read-only operating loop:
sync, diagnosis, and experiment measurement remain read-only and continue to
work when authoring is disabled.

## Product boundary

Campaign Studio creates only this structure:

```text
campaign                        (destination: website | lead_form)
  └─ one broad ad set
       └─ one to three single-image ads
```

- Two destinations as of 2026-07-22, selected by `content.destination`:
  `website` (`OUTCOME_TRAFFIC` / `LINK_CLICKS`) and `lead_form`
  (`OUTCOME_LEADS` / `LEAD_GENERATION`, plus a Meta instant form). See
  "Lead-form campaigns" below.
- One lifetime budget with mandatory start/end dates; no daily budget.
- Country, adult age range, and optional language targeting only. Omitting
  placement fields leaves Advantage+ placements enabled.
- A Facebook Page is mandatory; an accessible Instagram actor is optional.
- Special Ad Categories and regulated/high-risk campaigns are blocked and sent
  to Ads Manager. The setup form requires an explicit category declaration,
  while deterministic term checks conservatively detect likely omissions.
- Every initial Meta object is created paused. Launch requires a second approval.
- After launch the only in-place operation is emergency pause. Further changes
  require cloning to a new WorkOS draft.
- Meta generative enhancements are explicitly opted out.

Campaign Studio does not create audiences, pixels, catalogs, videos, carousel
ads, dynamic creatives, Advantage+ campaigns, or conversion campaigns. It does
not scrape a website or silently import ERPNext context. It does create Meta
lead forms, as of 2026-07-22.

## User flow and permissions

```text
explicit brief + brand kit + optional confirmed ERP item
                         ↓
            Gemini copy and image concepts
                         ↓
       user selects/edits 1–3 final ads
                         ↓
              deterministic preflight
                         ↓
              submit for publish approval
                         ↓
       durable job creates all Meta objects PAUSED
                         ↓
         separate launch approval and drift check
                         ↓
       ads ACTIVE → ad set ACTIVE → campaign ACTIVE
```

The `paid_media` RBAC module has module-specific actions:

- `read`: inspect readiness, brand kit, assets, drafts, jobs, and audit history.
- `write`: edit the brand kit, upload assets, generate/edit drafts, preflight,
  submit, clone, and cancel.
- `approve`: approve paused publication and approve launch. Self-approval is
  allowed when the member's role grants this action.
- `execute`: emergency pause.

Founder/co-founder/admin/super-admin receive all four actions. Analyst receives
read/write. Engineer/viewer/investor receive read only. Unsupported action cells
are absent from permission expansion rather than treated as hidden grants.

## Safety gates

Authoring is fail-closed and independent of read access:

- `META_AUTHORING_MODE=disabled` blocks all new authoring.
- `sandbox_only` permits only connections marked as Meta sandbox accounts.
- `allowlisted_real` requires the exact account ID in
  `META_AUTHORING_ALLOWED_ACCOUNT_IDS`; an empty allowlist permits no real
  account.
- `META_AUTHORING_LAUNCH_ENABLED=false` allows paused publication but blocks the
  second launch approval.
- `META_MAX_LIFETIME_BUDGET_MINOR` is enforced by deterministic preflight.
- Token expiry, account status, account spend cap, Page access, account switch,
  stale draft versions, and snapshot drift block the operation.

The OAuth request includes `ads_read`, `ads_management`, `business_management`,
`pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, and
`instagram_basic` (`getMetaOAuthUrl` in `apps/backend/src/adapters/metaAds.ts`).
`pages_read_user_content` is `instagram_basic`'s actual dependency per Meta's
Permissions Reference — the previous `pages_read_engagement`-only list caused
Meta to reject the whole OAuth request with "Invalid Scopes: instagram_basic"
(found and fixed 2026-07-21). `pages_manage_ads` was in this list until the same
date; it was removed because nothing in this codebase reads or writes anything
gated by it, and its presence (without the corresponding Meta App permission
enabled) was the first thing that broke the OAuth request. If a future feature
needs Page-level ad management, re-add it here **and** enable it under the "Manage
Pages" use case in the Meta App console first. Tokens stay encrypted in
`integration_connections`; no token, App Secret Proof, raw Graph body, or private
storage path is returned to the browser.

## Creative context and storage

Gemini receives only the saved brand kit, the explicit campaign brief, and an
optional ERPNext item the user explicitly looked up and confirmed. It does not
receive arbitrary company records or crawl the destination.

`GEMINI_MODEL` produces three structured copy concepts. `GEMINI_IMAGE_MODEL`
(default `gemini-3.1-flash-image`) produces 1:1, 4:5, and 9:16 variants. Users may
instead upload PNG, JPEG, or WebP files, then edit the final image, primary text,
headline, description, CTA, and ad name before preflight.

Assets live in the private `meta-ads-creatives` Supabase Storage bucket. Browser
responses use short-lived signed URLs. The database retains checksum, dimensions,
prompt/model provenance, and ownership; it never makes the bucket public.

## Persistence and state machine

Migration `20260716120000_meta_ads_campaign_studio.sql` (backend mirror `039`)
adds brand kits, assets, versioned drafts, generation jobs, approvals, campaign
jobs/steps, Meta mappings, and append-only events. Keep the two migration files
byte-identical.

Draft states are:

```text
draft → generating → draft → submitted → publish_approved → publishing
      → published_paused → launch_approved → launching
      → scheduled | active | pending_meta_review → paused
```

`failed` and `cancelled` are terminal for editing; clone creates a clean version-1
draft without copying Meta mappings. Every editable save increments the version
and snapshot hash. Approval records freeze version/hash and actor name.

Generation and campaign jobs use database locking, lock expiry, attempts,
bounded backoff, and idempotency keys. Approval, job enqueue, state transition,
and approval event are one transaction. Retrying the same idempotency key returns
the same job; reusing it for a different draft/action returns a conflict.

Publication records a request fingerprint per step. On an unknown response, the
worker searches for the deterministic `[WorkOS:<draft>:v<version>]` marker before
creating anything again. Entity mappings are persisted after every successful
step. A publish/launch failure pauses the known parent campaign and every known
child best-effort.

Only one campaign operation may be claimed for a draft at a time across worker
replicas. Cancellation is rejected while generation, publication, or launch is
actively running, and worker state transitions use conditional updates so a
cancelled draft cannot be revived by a late result.

Launch re-runs preflight, requires an exact frozen snapshot, verifies all
campaign/ad-set/ad objects are still paused, activates ads first, then the ad
set, and the campaign last. Emergency pause reverses from parent to children and
is available even when new authoring has subsequently been disabled.

## Browser APIs

All routes derive company and current account from authentication:

- `GET /api/integrations/meta/authoring/readiness`
- `GET|PUT /api/integrations/meta/brand-kit`
- `GET|POST /api/integrations/meta/creative-assets`
- `DELETE /api/integrations/meta/creative-assets/:assetId`
- `GET /api/integrations/meta/product-context?itemCode=...`
- `GET|POST /api/integrations/meta/campaign-drafts`
- `GET|PATCH /api/integrations/meta/campaign-drafts/:draftId`
- draft actions: `generate`, `preflight`, `submit`, `approve-publish`,
  `approve-launch`, `pause`, `clone`, and `cancel`
- `GET /api/integrations/meta/creative-jobs/:jobId`
- `GET /api/integrations/meta/campaign-jobs/:jobId`

The UI is the `Campaigns` tab at:

```text
/universal?focus=mkt_paid_acquisition&openHub=1&tab=campaigns
```

Overview attention includes drafts awaiting approval and failed authoring jobs,
without exposing credentials or internal job payloads.

The migration's RLS policies call `can_read_paid_media(company_id)`, keeping
direct Supabase reads aligned with `paid_media:read` for system and custom roles.
All writes still flow through the authenticated backend and service role.

## Verification

Use the complete procedure in
[`docs/runbooks/meta-ads-campaign-studio.md`](../runbooks/meta-ads-campaign-studio.md).
The minimum focused checks are:

```sh
pnpm --filter backend test:meta-ads
pnpm --filter backend test:meta-ads-authoring-db
pnpm --filter backend typecheck
pnpm --filter frontend build
pnpm --filter frontend test:e2e:meta-ads
```

The DB lifecycle test uses fake Meta/Gemini adapters but real durable jobs,
Supabase tables, private Storage, idempotency, and cleanup. Live Meta sandbox
acceptance is paused-publication only unless launch is explicitly enabled.

## Lead-form campaigns

Added 2026-07-22. `content.destination` selects the publish shape.

| | `website` | `lead_form` |
| --- | --- | --- |
| Objective | `OUTCOME_TRAFFIC` | `OUTCOME_LEADS` |
| Ad set | `LINK_CLICKS`, `destination_type: WEBSITE` | `LEAD_GENERATION`, `destination_type: ON_AD`, `promoted_object: {page_id}` |
| Creative CTA value | `{link}` | `{lead_gen_form_id}` |
| Extra steps | — | `leadform` before the campaign, `crmsync` after the ads |

Design points that are not obvious from the code:

- **Forms are reused by question-set hash, not created per campaign.** Frappe CRM permits
  one enabled `Lead Sync Source` per form, so a form per campaign would multiply sync
  sources and their polling against Meta. The hash is recomputed server-side on every patch
  because it decides which form a publish binds to. It includes each question's target CRM
  field, since the mapping is stored on the shared form.
- **`crmsync` is non-fatal.** It runs after the campaign is live on Meta, which keeps
  collecting submissions regardless — Frappe backfills on first sync because
  `last_synced_at` starts null. A failure records the step and a
  `lead_sync_configuration_failed` event rather than failing an already-published job.
- **Ad-level attribution comes from `ad_id`, not the form.** See
  `domains/meta-ads/leadAttribution.ts`.
- **Preflight owns three Meta rules that otherwise fail mid-publish**: a lead form needs an
  HTTPS privacy-policy URL; an intro card forces a follow-up URL (`error_subcode 1892085`);
  and the Page must have accepted Meta's Lead Generation Terms (`leadgen_tos_accepted`,
  which no API can set — it is manual in Page settings).

## Authoritative files

- `apps/backend/src/domains/meta-ads/leadAttribution.ts` — hourly `ad_id` backfill.
- `apps/backend/src/adapters/metaAds.ts` — `getMetaOAuthUrl` (OAuth scope list)
  and `isMetaSandboxAllowed`/sandbox-connect gating live in
  `apps/backend/src/routes/integrations.ts`, not here.
- `apps/backend/src/adapters/metaAdsAuthoring.ts` — the only Meta object writer.
- `apps/backend/src/domains/meta-ads/authoring.ts` — policy, drafts, preflight,
  approvals, jobs, reconciliation, launch, pause, and audit history.
- `apps/backend/src/domains/meta-ads/creativeGeneration.ts` — Gemini and private
  asset storage.
- `apps/backend/src/domains/meta-ads/router.ts` — authenticated authoring API.
- `apps/backend/src/jobs/runner.ts` — job execution.
- `packages/permissions/src/*` — `paid_media` grants.
- `packages/shared-types/src/integrations.ts` — browser/backend contracts.
- `apps/frontend/src/components/workspace/panels/MetaAdsCampaignStudio.tsx` — UI.
- `apps/frontend/src/lib/integrations/useMetaAdsCampaignStudio.ts` — browser state
  and job polling.
- `apps/backend/test/metaAdsOperatingLoop.test.ts` and
  `metaAdsAuthoring.db.test.ts` — safety and lifecycle coverage.
- `apps/frontend/e2e/meta-ads/` — role/API/UI coverage.

Update this document whenever the objective, hierarchy, targeting, budget model,
approval/state machine, Graph permissions, write adapter, migration, environment
gate, or acceptance procedure changes.
