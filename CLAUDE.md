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

For how marketing connects to sales (attribution, CPL/CAC, what is built vs remaining):

- `docs/architecture/marketing-sales-integration-layers.md`

Then read the nearest app-specific `AGENTS.md`. Do not store secrets or transient environment/test identifiers in memory files.

## IDT Root Focus

The IDT root-focus UI is the active exploration surface. Narrative branch isolation
and browser-local note cards are intentional. Notes are keyed by user and root in
`localStorage`, so they are saved on the current device only and are not shared or
backed up.

`NodeChatPanel` uses the authenticated reference-company chat API. It is a
read-only, session-only conversation: the backend loads the selected root, branch,
actions, and attached sources from the caller's workspace before calling Gemini.
Responses are constrained to this supplied evidence and return only allow-listed
citations. The chat does not open an action workspace or modify IDT data.

See `docs/architecture/idt-root-focus-chat.md` before changing this boundary.
