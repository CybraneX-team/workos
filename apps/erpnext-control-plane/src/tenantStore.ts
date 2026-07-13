import type { ErpNextEnvironment, TenantStatus } from '@cybranex/erpnext-contracts';
import { pool } from './db.js';
import { decrypt } from './crypto.js';
import type { TenantCredentials } from './frappe/client.js';

interface TenantRow {
  company_id: string; environment: ErpNextEnvironment; status: 'provisioning' | 'ready' | 'failed';
  site_name: string | null; api_url: string | null; desk_url: string | null;
  api_key_enc: string | null; api_secret_enc: string | null; last_error: string | null;
}

export async function tenantRow(companyId: string, environment: ErpNextEnvironment): Promise<TenantRow | null> {
  const { rows } = await pool.query<TenantRow>('select * from erpnext.tenants where company_id=$1 and environment=$2', [companyId, environment]);
  return rows[0] ?? null;
}

export async function credentials(companyId: string, environment: ErpNextEnvironment): Promise<TenantCredentials | null> {
  const row = await tenantRow(companyId, environment);
  if (!row || row.status !== 'ready' || !row.site_name || !row.api_url || !row.desk_url || !row.api_key_enc || !row.api_secret_enc) return null;
  return { siteName: row.site_name, apiUrl: row.api_url, deskUrl: row.desk_url, apiKey: decrypt(row.api_key_enc), apiSecret: decrypt(row.api_secret_enc) };
}

export function toStatus(row: TenantRow): TenantStatus {
  return {
    companyId: row.company_id, environment: row.environment, status: row.status,
    ...(row.site_name ? { siteName: row.site_name } : {}), ...(row.desk_url ? { deskUrl: row.desk_url } : {}),
    ...(row.last_error ? { lastError: { code: 'provision_failed', message: 'ERPNext tenant provisioning failed.', retryable: true } } : {}),
  };
}
