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

## Recent Changes by Ronak

### 3D Planet Universe & Root Focus Space Enhancements
- **Dynamic Cursor Tooltips**: Configured 3D node line tooltips to track exact cursor coordinates on hover.
- **Narrative Branch Isolation Mode**: Clicking a branch card or connecting line isolates that branch and its attached note cards, centering them with minimum spacing and hiding non-focused elements.
- **Step-wise Back Navigation**: Updated top-left back navigation to step backwards level-by-level cleanly without blackouts or React Three Fiber hook order bugs.
- **Fluid Card Unfold Animations**: Implemented `cubic-bezier(0.16, 1, 0.3, 1)` directional scale & translate card unfold transitions with GSAP camera motion (`power4.out` / `power3.inOut`).

### Liquid Glassmorphism & Visual Design System
- **Frosted Glass Cards**: Applied `backdropFilter: blur(16px) saturate(180%)` with deep obsidian tint (`rgba(12, 12, 22, 0.72)`) to `BranchCard` and `NoteCard`.
- **Specular Bevels & Theme Rhombus Anchors**: Added top-edge glass refraction highlights (`inset 0 1px 0 rgba(255, 255, 255, 0.15)`) and updated branch connection rhombus anchors to dynamically use root node theme colors (`color`).
- **High-Contrast Readable Typography**: Enhanced text contrast (`#FFFFFF` titles, `rgba(255, 255, 255, 0.88)` body text) and grey neutral icon header boxes.

### Note Card Operations & Confirmation Modals
- **Note Delete Confirmation Overlay**: Built an in-card modal confirmation dialog (*"Are you sure you want to delete this note?"*) with Cancel and Delete actions.
- **AI Sparkles Integration**: Replaced the edit button on Note Cards with a glowing AI Sparkles button (`Sparkles` icon) opening `NodeChatPanel` with full node context. Direct text tapping remains for inline note editing.
- **Note Creation Persistence**: Creating/editing notes keeps the user in focus mode without unwanted back navigation.

### Node Chat Panel & Interactive AI Features
- **Selection-Triggered Quote-to-Input**: Highlighted/selected text inside AI responses displays a floating `✨ Add selection to chat` button that inserts `Regarding "[selected text]": ` into the chat input.
- **Mid-Stream AI Response Interruption**: Editing a user message immediately aborts active AI response generation mid-stream (`clearTimeout`) and reloads the message context into the input field for re-sending.
- **Minimalist Icon Action Bars**: Positioned clean icon-only action buttons (`Copy`, `Pencil`) below message cards with active state feedback (`Copied!` emerald highlight).
