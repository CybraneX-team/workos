import { log } from '../lib/logger.js';

export interface ErpNextCreds {
  siteUrl: string;   // e.g. "http://localhost:8081" — the shared nginx endpoint, not the site's own hostname
  siteName: string;  // e.g. "erp-acme-robotics.localhost" — sent as X-Frappe-Site-Name to route to the right site
  deskUrl?: string;  // Optional browser-facing ERPNext Desk base URL for deep links.
  apiKey: string;
  apiSecret: string;
}

interface ErpNextListResponse<T> {
  data: T[];
}

function erpBase(creds: ErpNextCreds): string {
  return creds.siteUrl.replace(/\/+$/, '');
}

function erpHeaders(creds: ErpNextCreds): Record<string, string> {
  return {
    Authorization: `token ${creds.apiKey}:${creds.apiSecret}`,
    // Confirmed 2026-07-04: Host-header routing doesn't work through Node's fetch
    // (undici silently substitutes the real connection host), so Frappe's nginx is
    // configured with FRAPPE_SITE_NAME_HEADER=$http_x_frappe_site_name instead —
    // this custom header is what actually selects the target site.
    'X-Frappe-Site-Name': creds.siteName,
  };
}

async function erpGet<T>(creds: ErpNextCreds, resource: string, params: Record<string, string>): Promise<T[]> {
  const url = new URL(`${erpBase(creds)}/api/resource/${encodeURIComponent(resource)}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url.toString(), {
    headers: erpHeaders(creds),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`erpnext_${resource}_failed:${res.status}:${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as ErpNextListResponse<T>;
  return json.data;
}

export interface ErpNextGenericRecord {
  name: string;
  status?: string | null;
  docstatus?: number | null;
  modified?: string | null;
  creation?: string | null;
  [key: string]: string | number | null | undefined;
}

export async function getErpNextRecords(
  creds: ErpNextCreds,
  resource: string,
  fields: string[],
  limit?: number,
  filters: unknown[] = [],
  maxLimit = 100,
): Promise<ErpNextGenericRecord[]> {
  return erpGet<ErpNextGenericRecord>(creds, resource, {
    fields: JSON.stringify(Array.from(new Set(['name', ...fields]))),
    filters: JSON.stringify(filters),
    order_by: 'modified desc',
    limit_page_length: positiveLimit(limit, maxLimit),
  });
}

async function erpRequest<T>(creds: ErpNextCreds, method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${erpBase(creds)}${path}`, {
    method,
    headers: { ...erpHeaders(creds), 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`erpnext_request_failed:${method}:${path}:${res.status}:${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : ({} as T);
}

// Idempotent: creates the Frappe User if it doesn't exist (by email, which is
// the User doctype's primary key), otherwise overwrites `roles` in full —
// this is a one-way mirror of WorkOS RBAC, not additive (see erpnextRoleMapping.ts).
export async function upsertFrappeUser(
  creds: ErpNextCreds,
  input: { email: string; firstName: string; lastName?: string; roles: string[] },
): Promise<void> {
  const roles = input.roles.map((role) => ({ role }));
  const exists = await erpRequest<{ data?: unknown }>(creds, 'GET', `/api/resource/User/${encodeURIComponent(input.email)}`).then(
    () => true,
  ).catch(() => false);

  if (exists) {
    await erpRequest(creds, 'PUT', `/api/resource/User/${encodeURIComponent(input.email)}`, { roles });
  } else {
    await erpRequest(creds, 'POST', '/api/resource/User', {
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      user_type: 'System User',
      send_welcome_email: 0,
      roles,
    });
  }
}

export async function disableFrappeUser(creds: ErpNextCreds, email: string): Promise<void> {
  await erpRequest(creds, 'PUT', `/api/resource/User/${encodeURIComponent(email)}`, { enabled: 0, roles: [] });
}

// Per-site "high-visibility" ERPNext -> WorkOS display-field overrides — the
// counterpart to the bench-wide hooks.py vendor patch (which only covers the
// sidebar header and is applied manually on the VM, not per-site). These are
// ordinary doctype records already seeded by ERPNext's own fixtures at
// `bench new-site --install-app erpnext` time, so this only needs a PUT to
// update their display fields — no code patching. Best-effort: each field is
// cosmetic, so one failing (e.g. a record renamed/removed upstream in a future
// ERPNext version) shouldn't fail the rest of provisioning.
export async function applyWorkosBranding(creds: ErpNextCreds): Promise<void> {
  const updates: Array<[string, string, Record<string, string>]> = [
    ['Desktop Icon', 'ERPNext', { label: 'WorkOS' }],
    ['Desktop Icon', 'ERPNext Settings', { label: 'WorkOS Settings' }],
    ['Workspace', 'ERPNext Settings', { title: 'WorkOS Settings', label: 'WorkOS Settings' }],
    ['Website Settings', 'Website Settings', { footer_powered: 'WorkOS' }],
  ];
  for (const [doctype, name, fields] of updates) {
    try {
      await erpRequest(creds, 'PUT', `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, fields);
    } catch (err) {
      log.error({ doctype, name, err: String(err) }, 'applyWorkosBranding: one field update failed, continuing');
    }
  }
}

// Registers this site's Social Login Key pointing at our own OIDC provider
// (see routes/oidc.ts) — idempotent, keyed by provider_name.
//
// authorizeUrl and oidcBaseUrl are deliberately different hosts: the browser
// needs to land on the FRONTEND's /oauth/authorize bridge page (same origin
// as the logged-in SPA, so the Supabase session in localStorage is visible —
// see OAuthAuthorizePage.tsx), while token/userinfo are server-to-server
// calls with no session involved, so they go straight to the backend.
// Confirmed the hard way: pointing authorize_url at the backend directly
// hits a POST-only JSON API with a plain GET and no Bearer token — Frappe's
// login page correctly redirects there, it's just the wrong destination.
export async function upsertSocialLoginKey(
  creds: ErpNextCreds,
  input: { providerName: string; clientId: string; clientSecret: string; authorizeUrl: string; oidcBaseUrl: string; redirectUrl: string },
): Promise<void> {
  const base = input.oidcBaseUrl.replace(/\/+$/, '');
  const payload = {
    social_login_provider: 'Custom',
    provider_name: input.providerName,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    base_url: base,
    authorize_url: input.authorizeUrl,
    access_token_url: `${base}/token`,
    api_endpoint: `${base}/userinfo`,
    redirect_url: input.redirectUrl,
    user_id_property: 'email',
    sign_ups: 'Deny', // we pre-provision users ourselves; never let Frappe auto-create one
    enable_social_login: 1,
  };

  const exists = await erpRequest<{ data?: unknown }>(
    creds, 'GET', `/api/resource/Social Login Key/${encodeURIComponent(input.providerName)}`,
  ).then(() => true).catch(() => false);

  if (exists) {
    await erpRequest(creds, 'PUT', `/api/resource/Social Login Key/${encodeURIComponent(input.providerName)}`, payload);
  } else {
    await erpRequest(creds, 'POST', '/api/resource/Social Login Key', payload);
  }
}

function positiveLimit(limit?: number, max = 100): string {
  const next = typeof limit === 'number' && Number.isFinite(limit) ? Math.round(limit) : 50;
  return String(Math.max(1, Math.min(max, next)));
}

// Gemini extracts terms from natural language (e.g. "widget a"), which won't match
// real item codes like "WIDGET-A" as a single substring. Tokenize into a fuzzy
// multi-part LIKE pattern instead: "widget a" -> "%widget%a%".
function fuzzyLike(term: string): string {
  const tokens = term.trim().split(/\s+/).filter(Boolean);
  return `%${tokens.join('%')}%`;
}

export interface StockBalance {
  item_code: string;
  warehouse: string;
  actual_qty: number;
}

export async function getStockBalance(creds: ErpNextCreds, itemCode?: string, warehouse?: string): Promise<StockBalance[]> {
  const filters: Array<[string, string, string]> = [];
  if (itemCode?.trim()) filters.push(['item_code', 'like', fuzzyLike(itemCode)]);
  if (warehouse?.trim()) filters.push(['warehouse', 'like', fuzzyLike(warehouse)]);

  return erpGet<StockBalance>(creds, 'Bin', {
    fields: JSON.stringify(['item_code', 'warehouse', 'actual_qty']),
    filters: JSON.stringify(filters),
    limit_page_length: '50',
  });
}

export interface ItemSummary {
  item_code: string;
  item_name: string;
  stock_uom: string;
}

export async function getItemList(creds: ErpNextCreds, search?: string): Promise<ItemSummary[]> {
  const filters: Array<[string, string, string]> = [];
  if (search?.trim()) filters.push(['item_name', 'like', fuzzyLike(search)]);

  return erpGet<ItemSummary>(creds, 'Item', {
    fields: JSON.stringify(['item_code', 'item_name', 'stock_uom']),
    filters: JSON.stringify(filters),
    limit_page_length: '50',
  });
}

export async function getLowStockItems(creds: ErpNextCreds, threshold?: number): Promise<StockBalance[]> {
  const cutoff = typeof threshold === 'number' && threshold > 0 ? threshold : 10;

  return erpGet<StockBalance>(creds, 'Bin', {
    fields: JSON.stringify(['item_code', 'warehouse', 'actual_qty']),
    filters: JSON.stringify([['actual_qty', '<', cutoff]]),
    limit_page_length: '50',
  });
}

// ── Supply Chain & Logistics read models ─────────────────────────────────────
// Keep these as thin REST list helpers. The BDT route normalizes records into
// product-facing cards and metrics; the adapter stays close to ERPNext.

export interface WarehouseSummary {
  name: string;
  warehouse_name: string | null;
  is_group: 0 | 1;
  disabled: 0 | 1;
}

export async function getWarehouses(creds: ErpNextCreds, limit?: number): Promise<WarehouseSummary[]> {
  return erpGet<WarehouseSummary>(creds, 'Warehouse', {
    fields: JSON.stringify(['name', 'warehouse_name', 'is_group', 'disabled']),
    filters: JSON.stringify([['disabled', '=', 0]]),
    order_by: 'name asc',
    limit_page_length: positiveLimit(limit),
  });
}

export async function getStockBalances(creds: ErpNextCreds, limit?: number): Promise<StockBalance[]> {
  return erpGet<StockBalance>(creds, 'Bin', {
    fields: JSON.stringify(['item_code', 'warehouse', 'actual_qty']),
    order_by: 'modified desc',
    limit_page_length: positiveLimit(limit),
  });
}

export interface MaterialRequestSummary {
  name: string;
  status: string | null;
  material_request_type: string | null;
  transaction_date: string | null;
  schedule_date: string | null;
}

export async function getMaterialRequests(creds: ErpNextCreds, limit?: number): Promise<MaterialRequestSummary[]> {
  return erpGet<MaterialRequestSummary>(creds, 'Material Request', {
    fields: JSON.stringify(['name', 'status', 'material_request_type', 'transaction_date', 'schedule_date']),
    filters: JSON.stringify([['docstatus', '<', 2]]),
    order_by: 'modified desc',
    limit_page_length: positiveLimit(limit),
  });
}

export interface PurchaseOrderSummary {
  name: string;
  status: string | null;
  supplier: string | null;
  transaction_date: string | null;
  grand_total: number | null;
}

export async function getPurchaseOrders(creds: ErpNextCreds, limit?: number): Promise<PurchaseOrderSummary[]> {
  return erpGet<PurchaseOrderSummary>(creds, 'Purchase Order', {
    fields: JSON.stringify(['name', 'status', 'supplier', 'transaction_date', 'grand_total']),
    filters: JSON.stringify([['docstatus', '<', 2]]),
    order_by: 'modified desc',
    limit_page_length: positiveLimit(limit),
  });
}

export interface PurchaseReceiptSummary {
  name: string;
  status: string | null;
  supplier: string | null;
  posting_date: string | null;
  grand_total: number | null;
}

export async function getPurchaseReceipts(creds: ErpNextCreds, limit?: number): Promise<PurchaseReceiptSummary[]> {
  return erpGet<PurchaseReceiptSummary>(creds, 'Purchase Receipt', {
    fields: JSON.stringify(['name', 'status', 'supplier', 'posting_date', 'grand_total']),
    filters: JSON.stringify([['docstatus', '<', 2]]),
    order_by: 'modified desc',
    limit_page_length: positiveLimit(limit),
  });
}

export interface DeliveryNoteSummary {
  name: string;
  status: string | null;
  customer: string | null;
  posting_date: string | null;
  grand_total: number | null;
}

export async function getDeliveryNotes(creds: ErpNextCreds, limit?: number): Promise<DeliveryNoteSummary[]> {
  return erpGet<DeliveryNoteSummary>(creds, 'Delivery Note', {
    fields: JSON.stringify(['name', 'status', 'customer', 'posting_date', 'grand_total']),
    filters: JSON.stringify([['docstatus', '<', 2]]),
    order_by: 'modified desc',
    limit_page_length: positiveLimit(limit),
  });
}

export interface PickListSummary {
  name: string;
  status: string | null;
  purpose: string | null;
  modified: string | null;
}

export async function getPickLists(creds: ErpNextCreds, limit?: number): Promise<PickListSummary[]> {
  return erpGet<PickListSummary>(creds, 'Pick List', {
    fields: JSON.stringify(['name', 'status', 'purpose', 'modified']),
    filters: JSON.stringify([['docstatus', '<', 2]]),
    order_by: 'modified desc',
    limit_page_length: positiveLimit(limit),
  });
}

export interface ShipmentSummary {
  name: string;
  status: string | null;
  modified: string | null;
}

export async function getShipments(creds: ErpNextCreds, limit?: number): Promise<ShipmentSummary[]> {
  return erpGet<ShipmentSummary>(creds, 'Shipment', {
    fields: JSON.stringify(['name', 'status', 'modified']),
    order_by: 'modified desc',
    limit_page_length: positiveLimit(limit),
  });
}

// ── CRM (built-in ERPNext doctypes: Lead / Opportunity / Customer) — read-only ──
// Writes deferred; see project memory.

export interface LeadSummary {
  name: string;
  lead_name: string;
  company_name: string | null;
  status: string;
  email_id: string | null;
}

export async function getLeads(creds: ErpNextCreds, search?: string): Promise<LeadSummary[]> {
  const filters: Array<[string, string, string]> = [];
  if (search?.trim()) filters.push(['lead_name', 'like', fuzzyLike(search)]);

  return erpGet<LeadSummary>(creds, 'Lead', {
    fields: JSON.stringify(['name', 'lead_name', 'company_name', 'status', 'email_id']),
    filters: JSON.stringify(filters),
    limit_page_length: '50',
  });
}

export interface OpportunitySummary {
  name: string;
  party_name: string;
  opportunity_amount: number;
  sales_stage: string;
  status: string;
}

// Note: party_name is a docname (a Customer's name, or a Lead's internal ID like
// "CRM-LEAD-2026-00002") — searching by a person's name won't match a lead-sourced
// opportunity's party_name. Resolving that properly (search Lead/Customer first, then
// filter Opportunity by the resolved docname) is a reasonable next step, not done here.
export async function getOpportunities(creds: ErpNextCreds, search?: string): Promise<OpportunitySummary[]> {
  const filters: Array<[string, string, string]> = [];
  if (search?.trim()) filters.push(['party_name', 'like', fuzzyLike(search)]);

  return erpGet<OpportunitySummary>(creds, 'Opportunity', {
    fields: JSON.stringify(['name', 'party_name', 'opportunity_amount', 'sales_stage', 'status']),
    filters: JSON.stringify(filters),
    limit_page_length: '50',
  });
}

export interface CustomerSummary {
  name: string;
  customer_name: string;
  customer_group: string | null;
  territory: string | null;
}

export async function getCustomers(creds: ErpNextCreds, search?: string): Promise<CustomerSummary[]> {
  const filters: Array<[string, string, string]> = [];
  if (search?.trim()) filters.push(['customer_name', 'like', fuzzyLike(search)]);

  return erpGet<CustomerSummary>(creds, 'Customer', {
    fields: JSON.stringify(['name', 'customer_name', 'customer_group', 'territory']),
    filters: JSON.stringify(filters),
    limit_page_length: '50',
  });
}
