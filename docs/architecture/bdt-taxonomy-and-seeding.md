# BDT V4 taxonomy and seeding

The Business Digital Twin uses the code-native V4 taxonomy in
`apps/backend/src/data/bdtTaxonomy.ts`. New companies receive the selected
canonical departments through `public.import_bdt_departments_from_json`.

Each canonical department has exactly five top-level nodes:

1. Team — department roster, sourced from `company_members.department_id`.
2. Systems — integration lifecycle, connection configuration, and provider gateway.
3. Metrics — canonical department-level measures and rollups.
4. Projects — browser-local department projects, saved on the current device.
5. Focus — one department-specific ownership area.

These are all `node_level = level1`; V4 does not seed synthetic branches,
actions, or metric children. `metadata.workspaceKind` is the frontend routing
contract and `metadata.sourceKey` is the stable key. All V4 nodes are
navigable even when no provider is connected.

Product Portfolio is the only focus area that can project children at runtime:
ERPNext Item Groups and Items are displayed as read-only virtual nodes and are
never persisted as BDT nodes. Other provider-backed focus areas use their
existing ERPNext or Meta workspaces.

Custom departments are intentionally disabled for V4. The company creation
API rejects a non-empty `bdt_custom_departments` payload with
`custom_departments_disabled`.

## Development data

V4 is not a migration. The source tree only affects newly created or manually
reseeded development companies. V3 rows are intentionally ignored by the active
BDT read path; developers must recreate or reset development data to use V4.

Operations V4 has an additional implementation document at
[`operations-v4.md`](operations-v4.md). It intentionally does not restore V3
Operations descendants: ERPNext data is surfaced through the Systems gateway,
the Metrics scorecard, and the Process & Capacity control tower.
