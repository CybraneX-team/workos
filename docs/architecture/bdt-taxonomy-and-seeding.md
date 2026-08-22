# BDT V5 taxonomy and seeding

The Business Digital Twin uses the code-native V5 taxonomy in
`apps/backend/src/data/bdtTaxonomy.ts`. New companies receive the selected
canonical departments through `public.import_bdt_departments_from_json`.

Every unchanged canonical department retains its five top-level nodes. Product
and Sales instead have fixed native-commercial capability nodes: Product
Catalogue, Pricing Management, Inventory Readiness; Customers & Contacts, Lead
Management, Deal Management, Quotations, Orders & Invoices, and Collections.
These system-owned direct level-one leaves are commercial workspace anchors.
Commercial records stay inside their workspace and are never mirrored into the
BDT graph. All persisted workspace nodes, including these, can own user-created
Action children. BDT tasks are server-backed and may attach either directly to a
workspace or to one of its Action children.

The unchanged departments use:

1. Team — department roster, sourced from `company_members.department_id`.
2. Systems — integration lifecycle, connection configuration, and provider gateway.
3. Metrics — canonical department-level measures and rollups.
4. Projects — browser-local department projects, saved on the current device.
5. Focus — one department-specific ownership area.

These are all `node_level = level1`; V5 does not seed synthetic branches,
actions, or metric children. `metadata.workspaceKind` is the frontend routing
contract and `metadata.sourceKey` is the stable key. All V5 nodes are
navigable even when no provider is connected.

Product Portfolio is the only focus area that can project children at runtime:
Native catalogue groups and products are displayed as virtual nodes and are
never persisted as BDT nodes. Other provider-backed focus areas use their
existing native catalogue or Meta workspaces.

Custom departments are intentionally disabled for V5. The company creation
API rejects a non-empty `bdt_custom_departments` payload with
`custom_departments_disabled`.

## Development data

V5 is not a migration. The source tree only affects newly created or manually
reseeded development companies. V3 rows are intentionally ignored by the active
BDT read path; developers must recreate or reset development data to use V5.

Operations V4 has an additional implementation document at
[`operations-v4.md`](operations-v4.md). It intentionally does not restore V3
Operations descendants: the Phase 1 focus renders a native placeholder,
the Metrics scorecard, and the Process & Capacity control tower.
