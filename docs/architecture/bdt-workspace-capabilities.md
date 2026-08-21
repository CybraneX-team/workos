# BDT V5 workspace capabilities

## Shared Action nodes

Every persisted workspace node can own user-created `action` children. A
department manager creates an Action node with a name and optional purpose;
the node reuses the backend-owned BDT task feature and may contain files or
HTTPS links. Tasks remain separate records with one assignee each. Department
readers can see all tasks and information, while task progress stays limited to
the assignee or a department manager. Files are private and downloaded through
the authenticated backend; external-link access is managed by the linked service.

| Department | Focus area | Connected evidence |
| --- | --- | --- |
| Product | Product Portfolio | native WorkOS catalogue |
| Sales | Deal Execution | native WorkOS CRM |
| Operations | Process & Capacity | native Operations placeholder |
| Marketing | Paid Acquisition | Meta Ads |
| All other canonical departments | Their named focus area | No provider-specific adapter yet |

The Systems node always remains visible. It presents an honest unsupported or
not-connected state where no provider data is available; it does not lock the
department graph.

Projects are kept in browser local storage under a V4 key scoped to the active
company and user. They are not shared with teammates or synchronized to the
backend. The UI must retain the “Saved on this device” notice anywhere projects
are created or viewed.

Operations retains its canonical focus node but has no provider capability or API
dependency in Phase 1. It renders a concise native-Operations placeholder until the
execution model is deliberately designed in a later phase. Historical Operations
design material is not part of the Phase 1 runtime contract.
# User-authored Action and Form nodes

Persisted BDT workspaces may have two direct user-authored child kinds. An `action/action` child is an evidence-and-work surface: it reuses shared BDT tasks and private files/HTTPS links. A `resource/form` child is a structured shared-information surface: its administrator-defined field schema is permanently locked by its first record, and department readers can create and edit records thereafter.

Structural creation and editing is centralized in **Settings → Node Management**. The 3D BDT remains the discovery and navigation surface: focus a parent, focus the child, then activate its centered node to open its workspace. Neither child kind changes the canonical department taxonomy.
