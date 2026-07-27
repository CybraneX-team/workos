# IDT root-focus chat

## Scope

The IDT Root Focus UI is the exploration surface for a reference-company twin.
Its branch chat is read-only: it explains the selected branch's captured research,
including action data, but it cannot create, edit, or delete reference-company data
or open an action workspace. Admin node authoring is intentionally not exposed in
this surface.

## Notes and conversation lifetime

Root-focus notes remain browser-local under a user/root `localStorage` key. They are
not synced, shared, backed up, or recoverable after browser storage is cleared.
Chat conversations stay in page memory only and are not persisted in the browser or
database.

## API boundary

`POST /api/reference-companies/:referenceCompanyId/chat` requires the normal JWT and
workspace identity. The route verifies that the reference company belongs to that
workspace, then verifies the requested root and branch relationship before it builds
any model context.

The browser supplies only root ID, branch ID, and a bounded conversation history. The
server loads the root, selected branch, child actions, and their attached source rows.
It never accepts client-provided research text or citation URLs. Gemini receives no
web-search tool and no ERP tools.

Gemini returns structured prose plus source IDs. The backend maps those IDs back to
the server allow-list, so a model cannot return an arbitrary citation URL. Source text
is explicitly treated as data rather than instructions to mitigate prompt injection.

## Operations

`GEMINI_API_KEY` must be configured in the backend runtime. The key remains server
only; do not use `/api/gemini/token` for this feature. If the key or provider is
unavailable, the API returns an unavailable error and the panel presents a retryable
failure state.
