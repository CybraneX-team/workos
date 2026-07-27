# BDT taxonomy and company seeding

Status: active
Last verified: 2026-07-25

This document describes the source of truth for the Business Digital Twin (BDT)
catalog and the default tree imported for a new company.

## Source of truth

The canonical taxonomy is the typed, code-owned module:

apps/backend/src/data/bdtTaxonomy.ts

It owns the current framework tree:

- 13 department source keys;
- 54 ordered Level-1 capabilities;
- 212 ordered branch items;
- immutable capability and branch source keys;
- an owner/meaning statement and globally unique concept key for every branch;
- explicit planned/active availability, action examples, integrations, and metric impacts.

Each concept has exactly one owning department. Similar labels are permitted only
when their scope is materially different and stated in the node meaning. Marketing,
Sales, Product, Operations, frontend routing, activation gates, and metric keys
consume source keys. A taxonomy edit is therefore an API/data-contract change.

V3 retains the V2 ownership model and makes Product Lines a live ERPNext catalog
branch. It has no generated action/metric children: top-level ERPNext Item Groups
become read-only Product Lines and their descendant Items become Products. Nested
Item Groups are flattened, disabled Items remain visible, and unassigned/orphan
Items are shown under Unclassified. Catalog Readiness reports enabled state, price
coverage, assignment, and freshness—not commercial performance. This is a clean
development-only break; V2 company trees are not migrated or supported by this
presentation. The complete V1 disposition record is
maintained in apps/backend/src/data/bdtTaxonomyDecisionLog.ts. It accounts for
every former Level-1 and branch source key as retained, merged, moved, renamed,
planned, or pruned.

There is no DOCX input, generated spec tree, or generated seed artifact in the
active pipeline. The historical copy under old workos/ is not part of this
repository's runtime or build process.

## Derived catalog

apps/backend/src/data/bdtCatalog.ts derives DEPT_LEVEL1_NODES from
BDT_TAXONOMY. The existing catalog API remains:

~~~text
GET /api/bdt/catalog
~~~

DEPT_META remains the source of framework department metadata such as domain,
cluster, color, score, and department-level metrics. The taxonomy combines with
that metadata for the catalog response.

## New-company seed flow

The default seed is built in apps/backend/src/data/bdtSeed.ts:

1. BDT_TAXONOMY supplies the ordered department, Level-1, and branch content.
2. DEPT_META supplies the existing department metadata.
3. The seed builder preserves the database import payload shape while emitting
   V3 taxonomy version, meaning, concept key, availability, presentation mode, and immutable source
   key metadata for new nodes.
4. Existing companies are deliberately not migrated or aliased.

The resulting BDT_SEED_DEPARTMENTS is consumed by
apps/backend/src/routes/companies.ts. During company creation,
buildSeedPayload() selects the requested framework departments, adds bare shells
for custom labels, falls back to all 13 framework departments when no framework
selection is supplied, and passes the JSON payload to
public.import_bdt_departments_from_json.

Existing companies are not rewritten. Their stored department_bdt_nodes rows
remain unchanged; the code-native source affects new company onboarding only.

## Stable-key rules

There are two different keys in persisted BDT rows:

- department_bdt_nodes.source_key is positional and can change if a tree is
  reordered.
- metadata.sourceKey is the immutable taxonomy key used by activation and
  frontend routing. Branch/action/metric siblings share the branch stable key.

Branch source keys are explicit entries in the taxonomy; they are never derived
from a display label. Metric keys use spec_<department>_<branch-source-key>.
Changing the meaning of a node requires a new source key and a new decision-log
entry. No cross-department duplicate or compatibility alias is created.

## Tests and verification

The code-native contract test is:

~~~bash
pnpm --filter backend test:bdt
~~~

It verifies the 13/54/212 counts, catalog/seed order and keys, one action plus
one metric child for every static branch (and no generated children for the live
Product Lines branch), concept-key and source-key uniqueness, planned
Marketing behavior, V1 decision-log coverage, metric-key naming, and the
absence of DOCX provenance.

For changes affecting integrations or the import path, also run:

~~~bash
pnpm --filter backend typecheck
pnpm --filter backend test:sales-stories
pnpm --filter backend test:meta-ads
pnpm --filter backend test:erpnext-architecture
~~~

## Update this document when

- the taxonomy source, stable-key algorithm, seed builder, or onboarding import
  contract changes;
- a department, Level-1 capability, branch, action, metric, presentation mode, or source key is
  added, renamed, reordered, or removed;
- a new integration begins consuming BDT stable keys;
- the code-native BDT contract test or verification commands change.
