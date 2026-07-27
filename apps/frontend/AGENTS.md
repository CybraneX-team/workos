# Frontend guide

Read the repository-root `AGENTS.md` first. It defines when CodeGraph is available:
use it only when this repository has a `.codegraph/` directory and an available tool or
CLI; otherwise use the normal source, test, and runbook workflow. Do not rely on the
former environment-specific `code-review-graph` tool names.

## Product boundaries

- The browser uses authenticated backend APIs and must never receive provider tokens,
  service-role keys, raw provider errors, or ERPNext control-plane URLs.
- IDT Root Focus notes are browser-local; branch chat is session-only, grounded in
  stored server data, and cannot edit IDT data or open an action workspace. Read
  `../../docs/architecture/idt-root-focus-chat.md` before changing it.
- Meta Ads operating-loop and Campaign Studio behavior is documented in
  `../../docs/architecture/meta-ads-operating-loop.md` and
  `../../docs/architecture/meta-ads-campaign-studio.md`.

## Playwright and E2E automation

Before adding or materially changing browser automation, read
`../../docs/runbooks/playwright-automation.md`. It documents fixture safety,
isolated server setup, deterministic state, 3D navigation races, worker interference,
and recordable-tour workflow.

For Paid Acquisition campaign authoring, also read
`../../docs/runbooks/meta-ads-campaign-studio.md`. Keep approval/execute controls
permission-derived and never expose Meta tokens, raw Graph errors, or private asset
paths to the browser.
