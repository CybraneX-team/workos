# Marketing ↔ Sales integration: layer roadmap

Status of the work connecting Meta Ads (marketing) to Frappe CRM (sales) inside the BDT.
Layers are independently shippable and ordered by cost, not by importance.

Last verified 2026-07-22 against `erp-asd-g9bi.localhost`.

| Layer | What it is | Status |
| --- | --- | --- |
| 0 | Segmentation dimensions in the Sales projection | **Done** |
| 1 | Lead source — Meta lead forms → `CRM Lead` | **Done**, blocked externally |
| 2 | Attribution join — spend ↔ CRM outcomes | **Half**: key exists, no consumers |
| 3 | Control-plane record writes | **Done** |
| 4 | Loop back to Meta (audiences, offline conversions) | Not started |
| 5 | Unify the Marketing projection architecture | Not started |

---

## Layer 0 — Segmentation dimensions ✅

`industry` and `territory` are read across both data models; `no_of_employees` and
`annual_revenue` on the CRM doctypes; `industry` and `market_segment` on native `Customer`.
`sales_accounts_icp_segments` is no longer `unsupported()` — it derives ICP fit from
firmographics, reading `CRM Organization` (prospect pool) and `Customer` (won accounts).

See `apps/backend/AGENTS.md` for the scoring asymmetry (missing `industry` is penalised,
missing `territory` is not) and why it must not be "fixed" into consistency.

## Layer 1 — Lead source ✅ (externally blocked)

Campaign Studio authors the Meta instant form; `content.destination` selects
`OUTCOME_TRAFFIC` vs `OUTCOME_LEADS`. The `crmsync` step configures the tenant's
`Lead Sync Source` via the control plane. See `docs/architecture/meta-ads-campaign-studio.md`.

**Remaining is not code:**

- `leads_retrieval` needs Meta App Review for Advanced Access — the long pole, outside our
  control. Until granted, the sync polls but retrieves nothing.
- The Page must accept Meta's Lead Generation Terms by hand; no API can set it. Preflight
  blocks with `meta_leadgen_tos_required`.

Sandbox-verified 2026-07-22: form and campaign creation succeed, the ad set is rejected
until terms are accepted, and the lead round-trip is untested.

## Layer 2 — The attribution join ⬅ next

`domains/meta-ads/leadAttribution.ts` stamps `workos_meta_ad_id` onto synced leads hourly,
at **ad** granularity. `meta_ads_delivery_daily` holds ad-level spend keyed
`(company_id, ad_account_id, level, entity_id, metric_date)`.

**Both sides exist. Nothing joins them.** `workos_meta_ad_id` has no readers — only the
field creation, the write, and the "not yet stamped" filter. No CPL/CAC exists anywhere in
the backend; `bdtTaxonomy.ts` *declares* `"ROAS, CAC, Ad Leads"` as Paid Acquisition's
metric impact and nothing computes it.

### Remaining

1. **Join module** — a new `domains/workos-erp/` sibling reading CRM via control-plane
   `queryRecords` and spend from Supabase, joined backend-side. This keeps the boundary:
   the control plane never learns about Meta, WorkOS never holds Frappe credentials.
2. **Metrics** — CPL, cost per qualified lead (via `CRM Lead.status`), cost per won deal
   and CAC (via `CRM Deal.status` + `deal_value`), velocity by ad.
3. **Surface** — `Demand & Attribution → Pipeline Attribution` is still
   `"Awaiting CRM integration"` in the code-owned BDT taxonomy. Marketing has no `node-summary` endpoint,
   so lighting it up means either a fourth hardcoded activation key or doing Layer 5 first.

### Cost-per-revenue is a query, not a schema change

Frappe CRM's `crm_lead.py::create_deal` sets `"lead": self.name` **unconditionally**, outside
every guard. So `CRM Deal.lead → CRM Lead.workos_meta_ad_id` works retroactively on every
existing Deal, with no tenant write.

The alternative — adding `workos_meta_ad_id` to `CRM Deal` via `ensureCustomField` — also
works: `get_deal_fieldname` matches an identical fieldname directly, and the field is in
neither `restricted_map_fields` nor `restricted_fieldtypes`. But it only populates at
conversion time, so it needs a backfill anyway.

**Prefer the query.** Zero writes, retroactive, testable without a tenant. Treat the copy as
a later read optimisation if access patterns justify it.

### Two decisions that must precede the first query

- **Attribution window.** Spend is daily-bucketed; a lead has one timestamp and its Deal
  closes later. **CPL and CAC cannot share a window definition** — CAC divides spend in one
  period by revenue realised in another. Choose explicitly per metric, document it, and
  surface it in the UI.
- **Currency.** `meta_ads_delivery_daily.currency` is account-level and fixed; `CRM Deal`
  carries per-deal `currency` + `exchange_rate` captured at deal time. A CAC spanning both
  silently mixes units and is unstable under recomputation.

Both fail into *confident wrong numbers* — worse than the empty-dashboard failure mode
`apps/backend/AGENTS.md` already warns about, because a wrong CAC does not announce itself.

### Consent belongs here, not in Layer 4

Joining a person's CRM record to their ad click is processing personal data for marketing.
Frappe CRM captures no marketing-consent field. Add the consent question to the lead-form
question set **now** — leads collected before it exists can never be used in a Custom
Audience, so the cost of deferring compounds.

### Testability

Fake at the `queryRecords` boundary — `pendingLeads` already goes through it, so one seam
serves both. Precedent: `META_AUTHORING_FAKE_META` / `FAKE_GEMINI`. `scripts/seed-meta-ads-fixture.ts`
covers the spend side.

⚠️ A fake proves the arithmetic, not the retrieval. Frappe treats `''` and `null` as distinct
in list filters — `pendingLeads` carries a comment about exactly this — and that class of bug
survives any fake. Layer 2's numbers stay **unvalidated until a real lead round-trips**.

## Layer 3 — Control-plane record writes ✅

Two idempotency-keyed endpoints (`lead-sync`, `lead-attribution`) through
`erpnext.command_receipts`. Built as a Layer 1 prerequisite, ahead of the original ordering.
Also unblocks any future WorkOS-initiated CRM write.

## Layer 4 — Loop back to Meta

Not started. Won-deal contacts → Custom Audience → Lookalike seed; customers → suppression;
offline conversions with deal value via CAPI so Meta optimises toward revenue rather than
form fills. No `customaudiences` usage exists today.

Gated on **elapsed time, not effort** — a lookalike seed needs a meaningful volume of
consented won-deals, which accumulates rather than gets built. Sequence after Layer 2 has
been collecting consent for a while.

## Layer 5 — Unify the Marketing projection

Sales and Marketing are now both V4 focus workspaces. Sales resolves the stable
`sales_deal_execution` focus key server-side; Marketing routes the stable
`mkt_paid_acquisition` focus key directly to the Meta Ads hub. Neither depends on generated
branch/action descendants or activation locks.

Giving Marketing the Sales shape makes Organic Growth (GA4) and Brand & Intelligence
(Similarweb) *data* additions rather than code changes.

**Do this before adding a third Marketing integration, not after.** Right now Meta Ads is
the only instance; Layer 2's attribution is the second, and it has a genuinely different
shape (it joins two sources rather than reading one). Abstracting from two real cases beats
guessing from one.

---

## Recommended sequence

1. **Layer 2 decisions** — window, currency, consent field — written down before code.
2. **Layer 2 join + metrics** behind the fixture seam.
3. **Layer 2 surface** — accept one more hardcoded activation key as marked debt, or fold
   into Layer 5.
4. **Layer 5** — before any further Marketing integration.
5. **Layer 4** — once consented won-deals have accumulated.

## Known dead nodes (unrelated to these layers)

`Partnerships & Channels` and `Sales Resources` are **11 branch items at 100%
`unsupported()`** — permanently locked in the BDT. Either bind them or hide them at the
catalog level; a node that can never activate is worse than an absent one.
