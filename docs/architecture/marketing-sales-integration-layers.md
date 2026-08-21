# Marketing to native Sales integration

Last verified: 2026-08-08.

Meta lead-form publication creates or updates a company-scoped meta_lead_form_bindings row. The existing backend worker polls active bindings hourly, maps form answers, stores ad_id during ingestion, and idempotently upserts crm_leads by company and Meta lead ID. Sales users then qualify and convert leads into native accounts, contacts, and deals.

The authoritative implementation is apps/backend/src/domains/meta-ads/authoring.ts, nativeLeadSync.ts, and apps/backend/src/domains/native-business/router.ts. Webhooks, configurable workflows, attribution sweeps, and sales documents are deferred.
