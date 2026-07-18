# Repository memory entry point

Read `AGENTS.md` at the repository root before exploring or changing code. It contains the repository map, non-negotiable boundaries, verification commands, and links to maintained architecture, decision, and runbook documents.

For ERPNext work, start with:

- `docs/architecture/erpnext-control-plane.md`
- `docs/decisions/001-erpnext-control-plane-boundary.md`
- `docs/runbooks/local-erpnext-sso.md`
- `docs/runbooks/development-reset.md`

For Playwright, E2E, or recordable browser automation, start with:

- `docs/runbooks/playwright-automation.md`

For Meta Ads operating-loop work, start with:

- `docs/architecture/meta-ads-operating-loop.md`
- `docs/runbooks/meta-ads-decision-inbox.md`
- `docs/architecture/meta-ads-campaign-studio.md`
- `docs/runbooks/meta-ads-campaign-studio.md`
- `apps/backend/src/domains/meta-ads/README.md`

Then read the nearest app-specific `AGENTS.md`. Do not store secrets or transient environment/test identifiers in memory files.
