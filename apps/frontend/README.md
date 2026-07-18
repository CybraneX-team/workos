# WorkOS frontend

Last verified: 2026-07-15.

React 19 and Vite browser application for WorkOS. It uses Supabase for
authentication and calls the authenticated WorkOS backend for business APIs.
It is one application in the `cybranex-workos` pnpm monorepo, not a standalone
repository.

## Local development

Run commands from the monorepo root:

```sh
pnpm install
cp apps/frontend/.env.example apps/frontend/.env.local
pnpm --filter frontend dev
```

The default frontend URL is `http://localhost:5173`; the backend defaults to
`http://localhost:8080`. Configure:

- `VITE_BACKEND_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- optional request/auth timeout overrides from `.env.example`

Missing Supabase configuration does not intentionally enable an authentication
bypass. Use a configured development project for authenticated flows.

Build and lint:

```sh
pnpm --filter frontend build
pnpm --filter frontend lint
```

## Application boundaries

- `src/pages/` owns route-level experiences.
- `src/components/` owns reusable UI, the 3D Twin, Polytope navigation, and BDT
  workspaces.
- `src/lib/api.ts` is the authenticated backend client.
- `src/lib/db/` contains Supabase-backed browser data access where it still
  applies.
- `src/lib/integrations/` contains integration API clients and shared hooks.
- `supabase/migrations/` is the active ordered Supabase migration set. Read
  `supabase/README.md` before applying it.
- `e2e/` contains Playwright suites. Read `AGENTS.md` and
  `../../docs/runbooks/playwright-automation.md` before changing automation.

The frontend must not receive integration credentials, service-role keys, raw
provider errors, or internal ERPNext control-plane URLs.

## Meta Ads operating loop

The Meta Ads operating and authoring experience lives under Marketing → Paid
Acquisition. The container workspace opens directly at:

```text
/universal?focus=mkt_paid_acquisition&openHub=1&tab=inbox
```

The hub consumes the backend operating brief and Decision Inbox. It presents
connection health, KPIs, findings, goal alignment, trends, campaigns, planned or
measuring work, and frozen results. The `Campaigns` tab adds Campaign Studio for
explicit briefs, Gemini/uploaded assets, final copy/image editing, deterministic
preflight, paused publication, separate launch approval, and emergency pause.
All other experiment execution remains manual in Ads Manager.
The three existing Paid Acquisition leaf panels consume the same brief hook.
Company Overview renders Meta attention only for unresolved warning/critical
work or overdue experiments.

Start with:

- `../../docs/architecture/meta-ads-operating-loop.md`
- `../../docs/architecture/meta-ads-campaign-studio.md`
- `e2e/meta-ads/DEMO.md`
- `src/components/workspace/panels/MetaAdsOperatingHub.tsx`
- `src/components/workspace/panels/MetaAdsDecisionWorkspace.tsx`
- `src/components/workspace/panels/MetaAdsCampaignStudio.tsx`
- `src/lib/integrations/useMetaAdsBrief.ts`
- `src/lib/integrations/useMetaAdsDecisionInbox.ts`
- `src/lib/integrations/useMetaAdsCampaignStudio.ts`
- `../../docs/runbooks/meta-ads-decision-inbox.md`
- `../../docs/runbooks/meta-ads-campaign-studio.md`

Relevant checks:

```sh
pnpm --filter frontend test:e2e:meta-ads
pnpm --filter frontend test:e2e:meta-ads-demo
pnpm --filter frontend demo:meta-ads
```

The recordable demo uses disposable development data and has additional safety
requirements documented in `e2e/meta-ads/DEMO.md`.

## ERPNext

The browser accesses ERPNext through WorkOS backend routes. It must not call the
ERPNext control-plane directly. For the ownership boundary and local SSO flow,
read:

- `../../docs/architecture/erpnext-control-plane.md`
- `../../docs/runbooks/local-erpnext-sso.md`

## Keeping this document current

Update this README when frontend startup commands, environment variables,
application ownership, route entry points, or verification commands change.
Source code, package scripts, tests, and migrations remain authoritative.
