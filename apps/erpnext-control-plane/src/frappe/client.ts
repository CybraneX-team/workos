import type { ConfigureSsoRequest, DesiredUser, RecordFilter } from '@cybranex/erpnext-contracts';

export interface TenantCredentials {
  apiUrl: string;
  siteName: string;
  deskUrl: string;
  apiKey: string;
  apiSecret: string;
}

async function request<T>(creds: TenantCredentials, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${creds.apiUrl.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `token ${creds.apiKey}:${creds.apiSecret}`,
      'X-Frappe-Site-Name': creds.siteName,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
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
