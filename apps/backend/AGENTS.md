# WorkOS backend guide

Last verified: 2026-07-27.

This application is the WorkOS-side owner of the ERPNext integration. Read `../../docs/architecture/erpnext-control-plane.md` before changing ERP boundaries.

## This app owns

- Supabase authentication, companies, memberships, profiles, departments, and WorkOS RBAC.
- Conversion of WorkOS membership/grant state into the complete desired Frappe user/role set.
- OIDC `/authorize`, `/token`, and `/userinfo` endpoints and encrypted OIDC client secrets.
- The environment-scoped `public.erpnext_command_outbox` and its local/remote dispatcher.
- WorkOS-specific ERP projections, recommendations, stories, rollups, and ERP-backed Copilot behavior.
- Browser-facing `/api/erpnext/*` routes, including `/api/erpnext/status`.

## This app does not own

- Frappe API credentials, site creation, branding, Social Login Key writes, Frappe user mutation, or direct `/api/resource/*` calls.
- Generic ERPNext operational state.

All ERPNext operations cross `src/lib/erpnextControlPlane.ts` using `@cybranex/erpnext-contracts`. The architecture test rejects direct Frappe access.

## Entry points

- `src/server.ts`: route registration and worker startup.
- `src/lib/erpnextOutbox.ts`: coalesced provisioning, SSO, and user-reconciliation commands; 30-minute safety reconciliation.
- `src/lib/erpnextControlPlane.ts`: authenticated internal client.
- `src/routes/oidc.ts`: OIDC grant flow and idempotent clients keyed by company/environment/provider.
- `src/lib/erpnextRoleMapping.ts`: WorkOS-to-Frappe role computation.
- `src/domains/workos-erp/`: WorkOS projections and public ERP routes.
- `src/routes/referenceCompanies.ts`: authenticated reference-company APIs,
  including source-grounded, read-only IDT branch chat.
- `src/domains/meta-ads/`: read-only Meta history, resumable deep reports,
  findings, Decision Inbox evaluation, and separately gated Campaign Studio
  drafts/approvals/jobs/browser APIs.
- `src/adapters/metaAdsAuthoring.ts`: the only Meta object writer. Read-side
  synchronization must never import it.
- `src/adapters/erpnext.ts`: projection-facing reads implemented through batch queries.
- `db/migrations/035_erpnext_control_plane_outbox.sql`: OIDC ownership and outbox schema.
- `test/erpnextArchitecture.test.ts`: executable ownership boundary.
- `test/salesStories.test.mjs`: Sales story builders **and** the mapping-to-story
  doctype consistency guard (see the Sales doctype rule below).
- `scripts/reset-development-data.ts`: destructive, guarded shared-project reset.
- `scripts/seed-meta-ads-fixture.ts`: dry-run-first deterministic operating-loop fixtures.
- `scripts/advance-meta-ads-experiment-fixture.ts`: fixture-only continuation of
  one browser-applied experiment through deterministic evaluation.
- `test/metaAdsAuthoring.db.test.ts`: disposable fake-Meta/Gemini lifecycle using
  real durable database and private Storage state.

## BDT taxonomy and onboarding seed

The canonical default BDT tree is the typed source at
`src/data/bdtTaxonomy.ts`. It contains 13 departments, 54 ordered Level-1
capabilities, and 212 ordered branches, including immutable source keys,
ownership meanings, concept keys, and availability. `src/data/bdtCatalog.ts` derives the catalog
Level-1 definitions from it, while `src/data/bdtSeed.ts` combines it with
`DEPT_META` to build the new-company import payload.

The active pipeline has no DOCX input, generated spec tree, or generated seed
file. `routes/companies.ts` selects framework departments from
`BDT_SEED_DEPARTMENTS`, adds custom department shells, and passes the result to
`public.import_bdt_departments_from_json`. Existing companies are not migrated
when this source changes.

The builder preserves the import payload shape but emits V3 source keys,
taxonomy version, meanings, concept keys, planned status, presentation mode, and
action/metric metadata for new rows. Product Lines is the sole live ERPNext
catalog branch: it deliberately emits no generic action/metric descendants; the
frontend renders top-level Item Groups and descendant Items as read-only virtual
nodes. Existing company trees are intentionally untouched and V2 Product Lines
are not compatibility-supported. Read
`../../docs/architecture/bdt-taxonomy-and-seeding.md` before editing this
tree or any consumer of its stable keys.

## Implementation rules

- Company creation enqueues `provision_tenant`, `configure_sso`, and `reconcile_users`.
- Membership/RBAC changes must succeed independently of ERPNext availability and enqueue a coalesced company reconciliation.
- Keep commands scoped by `ERPNEXT_TARGET_ENV`; a local worker must not claim remote commands.
- Never put a plaintext OIDC client secret in the outbox. The dispatcher may decrypt it only immediately before the protected SSO call.
- Preserve existing browser endpoint paths and response shapes when moving internals.
- Keep BDT reads, business projections, prompts, recommendations, and role policy here.
- Keep Campaign Studio fail-closed: Website Traffic only, paused publication,
  separate launch approval, exact account allowlist for real mode, and emergency
  pause as the only post-launch edit.

## Gemini structured output: two traps

`lib/gemini.ts` is the shared helper for structured Gemini calls such as IDT chat and
twin generation. Some domain-specific integrations currently call Gemini directly;
do not infer from this guide that it is the only Gemini call path. Both traps below were
live failures, not theory — they produced `reference_companies.status='failed'` with
zero nodes, which the planet UI rendered as an empty "ROOT SYSTEMS" list.

**1. `maxOutputTokens` is shared with thinking.** On 2.5 models, thinking tokens come
out of the same budget as the answer; measured between ~1.2k and ~4.3k on identical
prompts. An uncapped thinker starves a large structured response and truncates it
mid-JSON. Pass `thinkingBudget` for anything that must parse, and keep it > 0 — 2.5 Pro
rejects 0. `finishReason` is checked, so truncation now raises
`gemini_finish_max_tokens:` with the budget and thinking count rather than masquerading
as a parse error.

**2. `responseSchema` rejects rich JSON Schema.** Gemini compiles the schema into a
decoding state machine and 400s with *"produces a constraint that has too many states
for serving"* on numeric `minimum`/`maximum`, string `maxLength`, and nested
`minItems`/`maxItems`. `toGeminiSchema()` inlines `$ref`/`$defs`, drops
`additionalProperties`, rewrites `type: ['string','null']` as `nullable`, and **strips
every value-range keyword**. Those constraints are re-checked after parsing (see
`validateGeneratedTwin`), which is what actually enforces them — do not add them back
into the schema sent to Gemini.

Stripping them silently changes *output*, not just validation: a `relevance` field with
`minimum: 0, maximum: 100` came back on a 0-10 scale once the bounds were gone, and the
planet UI renders that value as `N% relevance`. `toGeminiSchema()` therefore folds the
dropped bounds into `description` ("Must be between 0 and 100 inclusive."), which Gemini
supports and which costs no decoder states. Keep that behaviour when adding keywords to
`UNSUPPORTED_SCHEMA_KEYS`.

Truncated *prose* (the `webSearch` research step) is deliberately tolerated with a
warning; only JSON requests treat `MAX_TOKENS` as fatal. `gemini-2.5-flash` also 503s
frequently under load, so `geminiText` retries 429/5xx itself rather than burning the
caller's job-level attempts.

## Sales doctypes: the silent-empty-dashboard trap

The Sales domain reads **two different data models**, and mixing them up fails silently:

- **Pipeline / lead-and-deal performance → Frappe CRM**: `CRM Lead`, `CRM Deal`,
  `CRM Organization` (fields `deal_value`, `expected_closure_date`, `organization`,
  `status`, plus the segmentation fields below).
- **Accounts, proposals, revenue → native ERPNext**: `Customer`, `Contact`,
  `Territory`, `Quotation`, `Sales Order`, `Sales Invoice` (`Customer` also carries
  `industry` and `market_segment`).

**Segmentation dimensions.** `industry` and `territory` share a fieldname across both
models and are read everywhere via `SEGMENT_FIELDS`; `no_of_employees` and
`annual_revenue` exist on the CRM doctypes only (`FIRMOGRAPHIC_FIELDS`). `ICP segments`
is **derived** from these — it is no longer `unsupported()`, so do not restore the old
"not represented as a WorkOS doctype" reason. Its story deliberately scores missing
`industry` but **not** missing `territory`: CRM territories are optional and routinely
empty on real tenants, so penalising them would floor the node for everyone.

Leads reach `CRM Lead` two ways: a human typing into Frappe CRM, or Frappe CRM's own
Facebook lead syncing, which WorkOS configures when it publishes a lead-form campaign
(`domains/meta-ads/authoring.ts`, `crmsync` step). Nothing else in this app writes leads.

`CRM Deal` has **no separate stage field** — its `status` (Link to `CRM Deal Status`)
*is* the pipeline stage. Field aliases in `erpnextSalesStories.ts` (`dealAmount`,
`dealStage`, `dealClose`, `leadCompany`) accept either shape.

⚠️ **`erpnextSalesStories.ts` looks rows up by doctype string** (`rowsFor(reads, 'CRM
Deal')`). If a mapping in `erpnextSales.ts` is repointed at a different doctype and its
story builder is not updated to match, `rowsFor` returns `[]` and the node renders a
confident, empty, entirely wrong summary — **no error anywhere**. Repointing a mapping
means updating `erpnextSales.ts` (reads + `ACTION_DOCTYPES_BY_MAPPING`),
`erpnextSalesStories.ts` (the `rowsFor` lookups and any field access), and
`adapters/erpnext.ts` / `erpnextChat.ts` if the Copilot tools read the same doctype.

`pnpm --filter backend test:sales-stories` guards this: every doctype in
`MAPPING_SOURCE_DOCTYPES` must be referenced in `erpnextSalesStories.ts`. It is the only
thing standing between a doctype rename and a silently blank dashboard — do not delete it.

## 🔴 Known broken: BDT coverage gaps (verified 2026-07-22)

**Two Sales Level-1 nodes are 100% dead.** `MAPPINGS` in `erpnextSales.ts` is 15 mapped
and 22 `unsupported()`:

| Level-1 node | mapped | unsupported |
|---|---|---|
| Customers & Accounts | 3 | 3 |
| Pipeline & Opportunities | 5 | 2 |
| Revenue Operations | 1 | 5 |
| **Partnerships & Channels** | **0** | **5** |
| Sales Performance | 6 | 1 |
| **Sales Resources** | **0** | **6** |

`listActiveBranchKeys()` filters out `unsupported`, so those two nodes contribute **zero**
active branches — 11 branch items that can never activate under any configuration. They
render permanently locked. Either bind them or hide them at the catalog level; a node that
can never activate is worse than an absent one.

**Segment dimensions are available but unread.** `industry` appears **zero** times in
`erpnextSales.ts`. `territory` is read only from `Customer` (lines 192, 200) — never from
`CRM Lead`, `CRM Deal`, or `CRM Organization`, all three of which carry `industry`,
`territory`, `no_of_employees`, and `annual_revenue`. `CRM Territory` is a real nested-set
tree, so rollups are available. This is why `sales_accounts_icp_segments` is marked
`unsupported` ("not represented as a WorkOS doctype") when the underlying fields exist.

## 🔴 Known broken: Marketing node binding is rename-fragile

Sales **derives** its active branches (`listActiveBranchKeys()`, `erpnextSales.ts:342`).
Marketing **hardcodes** them — `MARKETING_PAID_ACQUISITION_KEYS` in
`routes/bdtNodeActivation.ts:35`, and again in the frontend as
`META_METRIC_NODE_STABLE_KEYS` / `META_SPEND_REACH_STABLE_KEYS`
(`BdtActionWorkspace.tsx:71,77`), with literal-label fallbacks
(`'ad performance health'`, `'spend & reach health'`).

Those keys are **content-derived**: `data/bdtSeed.ts`'s `branchMetadata()` computes
`sourceKey: \`${level1SourceKey}_${slug(branchItem)}\``. The key is stable across tree
*reorders* — its stated purpose — but **not across renames**. Renaming a branch item in
`data/bdtTaxonomy.ts` (e.g. "Ad Performance" → "Ad Health") changes the derived key, which
silently unbinds *both* the backend activation array and the frontend gate at once, and the
label fallback misses too.

This is the same failure class as the doctype trap above, triggered by an **editorial**
change rather than a schema one — and unlike Sales, **no test guards it**;
`test:sales-stories` covers Sales doctypes only. Renaming any `mkt_paid_acquisition_*`
branch item requires updating `bdtNodeActivation.ts` and `BdtActionWorkspace.tsx` together.

## Verification

```bash
pnpm --filter backend typecheck
pnpm --filter backend test:erpnext-architecture
pnpm --filter backend test:sales-stories
pnpm --filter backend test:bdt
pnpm --filter backend test:metrics
pnpm --filter backend test:meta-ads
pnpm --filter backend test:meta-ads-db
pnpm --filter backend test:meta-ads-authoring-db
```

Also run contract and control-plane tests when changing the internal API.

Nothing runs these automatically — this repository has no `.github/workflows/`. Tests can
rot unnoticed: `test/salesStories.test.mjs` imported a `dist/routes/…` path that stopped
existing when the file moved to `dist/domains/workos-erp/`, and was silently dead until
2026-07-21. When moving a file, grep `test/` for its old built path.

## Update this file when

- an ERP route, worker, migration, ownership boundary, environment rule, or source entry point changes;
- the doctypes backing any Sales projection change;
- a new application starts consuming ERP integration code and package ownership must be reconsidered.
