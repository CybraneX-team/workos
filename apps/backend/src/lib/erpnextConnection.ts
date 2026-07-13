import { supabaseAdmin } from '../db.js';
import { decrypt } from './crypto.js';
import type { ErpNextCreds } from '../adapters/erpnext.js';

// Mirrors the proven integration_connections pattern: one row per company +
// integration, with per-company ERPNext site routing in metadata.
export async function resolveErpNextCreds(companyId: string): Promise<ErpNextCreds | null> {
  const { data: conn } = await supabaseAdmin
    .from('integration_connections')
    .select('access_token_enc, refresh_token_enc, metadata')
    .eq('company_id', companyId)
    .eq('integration_id', 'int-erpnext')
    .maybeSingle();
  if (!conn?.access_token_enc || !conn.refresh_token_enc) return null;

  const metadata = (conn.metadata as Record<string, string>) ?? {};
  if (!metadata.site_url || !metadata.site_name) return null;

  return {
    siteUrl: metadata.site_url,
    siteName: metadata.site_name,
    deskUrl: metadata.desk_url,
    apiKey: decrypt(conn.access_token_enc),
    apiSecret: decrypt(conn.refresh_token_enc),
  };
}

export async function getErpNextNotConfiguredMessage(companyId: string): Promise<string> {
  const { data: job } = await supabaseAdmin
    .from('erpnext_provision_jobs')
    .select('status, attempts, max_attempts')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) {
    return "This workspace's inventory/CRM system hasn't been set up yet.";
  }
  if (job.status === 'failed') {
    return "Setting up this workspace's inventory/CRM system failed. Please contact support.";
  }
  return "Your workspace's inventory/CRM system is still being set up — this usually takes about a minute after signup. Try again shortly.";
}
