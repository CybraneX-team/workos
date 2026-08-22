# WorkOS backend guide

Last verified: 2026-08-08.

Read ../../docs/architecture/native-crm-catalog.md and ../../docs/architecture/native-sales-documents.md before changing CRM, catalogue, commercial documents, inventory, native Sales/Product workspaces, the assistant, or Meta lead ingestion.

## Ownership

- Supabase authentication, companies, memberships, profiles, departments, and RBAC.
- Company-scoped native CRM tables and APIs under /api/crm.
- Company-scoped native catalogue/current-stock APIs under /api/catalog.
- Company-scoped quote/order/invoice/payment APIs and PDFs under /api/sales.
- Native assistant tools under /api/business-assistant/chat.
- Meta Campaign Studio and the existing worker, including hourly lead-form polling into crm_leads.

## Non-negotiable rules

- Derive company_id from req.auth.companyId; never accept it from request data.
- Every SQL statement repeats company scope, including reads after permission middleware.
- CRM/catalogue writes use twin permissions and Zod validation.
- Keep lead conversion and terminal deal-stage updates transactional.
- Inventory is a current balance, not a movement ledger; product price is one current value, not history.
- Commercial totals are server-calculated; issued/confirmed records are immutable; sales documents never mutate inventory.
- Do not introduce generic domain frameworks, event buses, services, or job systems.
- Company creation must have no external business-system dependency.
- Meta Campaign Studio remains fail-closed for publication/launch and uses one native lead-form binding per company/form.

## Entry points

- src/server.ts: route registration and worker startup.
- src/domains/native-business/router.ts: CRM/catalogue APIs.
- src/domains/native-business/assistant.ts: native Gemini tool loop.
- src/domains/sales/router.ts: quote-to-cash routes and lifecycle transactions.
- src/domains/sales/service.ts: numbering, snapshots, and decimal totals.
- src/domains/meta-ads/nativeLeadSync.ts: hourly lead ingestion.
- src/domains/meta-ads/authoring.ts: lead-form binding creation.
- db/migrations/042_native_crm_catalog.sql: native model and obsolete integration cleanup.
- test/nativeBusinessArchitecture.test.ts: removal and schema guard.
- db/migrations/044_native_sales_documents.sql and test/salesDocuments.db.test.ts: commercial schema and local lifecycle proof.

Historical migrations remain immutable. New cleanup belongs in a new migration.
