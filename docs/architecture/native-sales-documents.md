# Native quote-to-cash lite

Last verified: 2026-08-10.

## Scope and ownership

WorkOS owns an internal operational flow in the existing Express/Postgres monolith:

`CRM deal → quote → accepted quote → sales order → invoice → payment entries`

Commercial tasks are independent backend-owned assignments. A task may link to
one quote, order, or invoice, but cannot alter document lifecycle, totals,
inventory, or accounting behavior.

The schema is `apps/backend/db/migrations/044_native_sales_documents.sql`, with the executable local-Supabase mirror at `apps/frontend/supabase/migrations/20260810110000_native_sales_documents.sql`. The API is mounted at `/api/sales`; all routes authenticate with Supabase JWTs, derive `company_id` from membership, require existing `twin` permissions, and repeat company scope in SQL.

## Model and invariants

- `commercial_profiles` stores current seller defaults and number prefixes. Documents retain editable seller and buyer JSON snapshots.
- `sales_document_sequences` allocates company/year/type numbers transactionally.
- Quotes, orders, invoices, their line items, and invoice payments use composite company-safe foreign keys.
- Catalogue-backed lines copy product code/name/description/unit/price at creation. Custom lines are valid. Later catalogue edits cannot alter a document.
- Server-side decimal arithmetic is authoritative. Lines are rounded half-up to two decimals, then document discount and one optional percentage tax are applied.
- Accepted quotes atomically win their deal and promote their account. One accepted quote creates at most one order; one confirmed order creates at most one invoice.
- Issued invoices derive unpaid/partial/paid/overdue state from payments and due date. Invoice row locks prevent overpayment. Paid invoices cannot be voided until payment entries are removed.
- PDFs contain stored snapshots and an operational-document disclaimer; they load no remote assets.
- Sales code never reserves or mutates `inventory_balances`.

## Deliberate limits

This is not accounting, statutory tax, e-invoicing, fulfilment, inventory movement, email delivery, a customer portal, or a payment gateway. There are no journals, refunds, credit notes, exchange rates, approvals, recurring invoices, attachments, or configurable workflows. Operations remains dependency-free.

## Verification

Run `pnpm --filter backend test:sales-architecture` for static boundaries, `pnpm test:local:sales` for real tenant/lifecycle/PDF/payment tests against local Postgres, and `pnpm verify:local:phase2` for the Phase 1 regression suite plus Phase 2 checks. Database suites refuse a non-local `DATABASE_URL`.
