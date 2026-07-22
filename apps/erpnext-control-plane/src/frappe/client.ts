import type { ConfigureSsoRequest, DesiredUser, RecordFilter } from '@cybranex/erpnext-contracts';

export interface TenantCredentials {
  apiUrl: string;
  siteName: string;
  deskUrl: string;
  apiKey: string;
  apiSecret: string;
}

async function request<T>(creds: TenantCredentials, method: string, path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
  const response = await fetch(`${creds.apiUrl.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `token ${creds.apiKey}:${creds.apiSecret}`,
      'X-Frappe-Site-Name': creds.siteName,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`frappe_request_failed:${method}:${path}:${response.status}:${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function getRecords(
  creds: TenantCredentials,
  doctype: string,
  fields: string[],
  filters: RecordFilter[],
  limit: number,
  pageSize: number,
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (let start = 0; start < limit; start += pageSize) {
    const pageLimit = Math.min(pageSize, limit - start);
    const params = new URLSearchParams({
      fields: JSON.stringify(fields), filters: JSON.stringify(filters),
      limit_start: String(start), limit_page_length: String(pageLimit), order_by: 'modified desc',
    });
    const result = await request<{ data?: Array<Record<string, unknown>> }>(creds, 'GET', `/api/resource/${encodeURIComponent(doctype)}?${params}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageLimit) break;
  }
  return rows;
}

export async function upsertUser(creds: TenantCredentials, user: DesiredUser): Promise<void> {
  const path = `/api/resource/User/${encodeURIComponent(user.email)}`;
  const exists = await request(creds, 'GET', path).then(() => true).catch(() => false);
  const roles = user.roles.map(role => ({ role }));
  if (exists) {
    await request(creds, 'PUT', path, { enabled: 1, user_type: 'System User', first_name: user.firstName, last_name: user.lastName ?? '', roles });
  } else {
    await request(creds, 'POST', '/api/resource/User', { email: user.email, first_name: user.firstName, last_name: user.lastName ?? '', enabled: 1, user_type: 'System User', send_welcome_email: 0, roles });
  }
}

export async function disableUser(creds: TenantCredentials, email: string): Promise<void> {
  await request(creds, 'PUT', `/api/resource/User/${encodeURIComponent(email)}`, { enabled: 0, roles: [] });
}

export interface TenantSetupInput {
  companyName: string;
  country: string;
  currency: string;
  fyStartDate: string;
  fyEndDate: string;
  timezone?: string | null;
}

/** ERPNext abbreviations are short and alphanumeric; Company rejects anything else. */
export function companyAbbreviation(companyName: string): string {
  const words = companyName.replace(/[^A-Za-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const initials = words.map(word => word[0]).join('').toUpperCase().slice(0, 5);
  if (initials) return initials;
  // Names that are entirely punctuation/non-Latin leave no initials to take.
  const fallback = companyName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5);
  return fallback || 'CO';
}

// `bench new-site --install-app erpnext` leaves the setup wizard unrun: no Company,
// no chart of accounts, no fiscal year, and a desk that redirects to /setup-wizard.
// Both entry points below are @frappe.whitelist(), so this runs over the same REST
// surface as every other command here — one implementation for local and remote,
// and no duplication into infra/erpnext-remote-shim.
export async function completeSetup(creds: TenantCredentials, input: TenantSetupInput): Promise<void> {
  const timezone = input.timezone?.trim() || undefined;

  // Must precede setup_complete. process_setup_stages() calls set_missing_values()
  // once frappe's own stage is marked complete, which *overwrites* country/currency/
  // time_zone in the args from System Settings. If a previous attempt died after
  // frappe's stage, a retry would silently re-inject the empty values and fail the
  // same way — writing System Settings first is what makes retries converge.
  await request(creds, 'POST', '/api/method/frappe.desk.page.setup_wizard.setup_wizard.initialize_system_settings_and_user', {
    // `en`, not `English`. The two endpoints disagree: this one assigns `language`
    // straight to System Settings' Link field, so it needs the Language *docname*,
    // while setup_complete below runs it through get_language_code(), which looks a
    // Language up by `language_name` and therefore wants the display name. Passing
    // 'English' here fails with `LinkValidationError: Could not find Language: English`.
    system_settings_data: { language: 'en', country: input.country, currency: input.currency, time_zone: timezone },
    // create_or_update_user() returns early without an email. Frappe users are
    // provisioned by reconcile_users/SSO, not here.
    user_data: {},
  }, 120_000);

  await request(creds, 'POST', '/api/method/frappe.desk.page.setup_wizard.setup_wizard.setup_complete', {
    args: {
      language: 'English',
      country: input.country,
      currency: input.currency,
      // Frappe reads args.timezone here, but writes it to System Settings.time_zone.
      timezone,
      company_name: input.companyName,
      company_abbr: companyAbbreviation(input.companyName),
      fy_start_date: input.fyStartDate,
      fy_end_date: input.fyEndDate,
      chart_of_accounts: 'Standard',
      setup_demo: 0,
      enable_telemetry: 0,
    },
    // Builds the chart of accounts and runs crm's setup_wizard_complete hook
    // (create_demo_data), so this is minutes, not the 30s default.
  }, 600_000);
}

export async function applyBranding(creds: TenantCredentials): Promise<void> {
  const updates: Array<[string, string, Record<string, unknown>]> = [
    ['Desktop Icon', 'ERPNext', { label: 'WorkOS' }],
    ['Desktop Icon', 'ERPNext Settings', { label: 'WorkOS Settings' }],
    ['Workspace', 'ERPNext Settings', { title: 'WorkOS Settings', label: 'WorkOS Settings' }],
    ['Website Settings', 'Website Settings', { footer_powered: 'WorkOS' }],
  ];
  for (const [doctype, name, payload] of updates) {
    await request(creds, 'PUT', `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, payload).catch(err => {
      console.error('[erpnext-control-plane][branding]', doctype, name, String(err));
    });
  }
}

export async function configureSso(creds: TenantCredentials, input: ConfigureSsoRequest): Promise<void> {
  const base = input.oidcBaseUrl.replace(/\/$/, '');
  const payload = {
    social_login_provider: 'Custom', provider_name: input.providerName,
    client_id: input.clientId, client_secret: input.clientSecret,
    base_url: base, authorize_url: input.authorizeUrl,
    access_token_url: `${base}/token`, api_endpoint: `${base}/userinfo`, redirect_url: input.redirectUrl,
    user_id_property: 'email', sign_ups: 'Deny', enable_social_login: 1,
  };
  const path = `/api/resource/Social Login Key/${encodeURIComponent(input.providerName)}`;
  const exists = await request(creds, 'GET', path).then(() => true).catch(() => false);
  await request(creds, exists ? 'PUT' : 'POST', exists ? path : '/api/resource/Social Login Key', payload);
}
