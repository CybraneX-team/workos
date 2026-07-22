# WorkOS backend guide

Last verified: 2026-07-21.

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

## Sales doctypes: the silent-empty-dashboard trap

The Sales domain reads **two different data models**, and mixing them up fails silently:

- **Pipeline / lead-and-deal performance → Frappe CRM**: `CRM Lead`, `CRM Deal`
  (fields `deal_value`, `expected_closure_date`, `organization`, `status`).
- **Accounts, proposals, revenue → native ERPNext**: `Customer`, `Contact`,
  `Territory`, `Quotation`, `Sales Order`, `Sales Invoice`.

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

## Verification

```bash
pnpm --filter backend typecheck
pnpm --filter backend test:erpnext-architecture
pnpm --filter backend test:sales-stories
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
