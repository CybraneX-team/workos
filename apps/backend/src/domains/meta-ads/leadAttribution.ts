import { WORKOS_LEAD_AD_ID_FIELD } from '@cybranex/erpnext-contracts';
import { META_GRAPH_BASE, metaAppSecretProof } from '../../adapters/metaAds.js';
import { provisionEnv } from '../../config.js';
import { pool } from '../../db.js';
import { decrypt } from '../../lib/crypto.js';
import { queryRecords, stampTenantLeadAttribution } from '../../lib/erpnextControlPlane.js';
import { log } from '../../lib/logger.js';

/**
 * Backfill the originating Meta ad onto leads that Frappe CRM synced.
 *
 * Frappe CRM's Facebook syncer requests only `id,created_time,field_data`, so `ad_id` — which
 * Meta does return on the lead object — never reaches `CRM Lead`. Without it, attribution
 * resolves no finer than the form, and one form is deliberately shared across campaigns, so
 * spend cannot be tied to outcomes at the level the optimisation loop already reasons at.
 *
 * Reading `/{lead_id}?fields=ad_id` is one Graph call per lead, hence the batching and the
 * "only leads still missing the field" query.
 */

/** Meta's own cap for a Graph batch. Also bounds StampLeadAttributionRequest, which allows 200. */
const BATCH_SIZE = 50;

interface LeadRow {
  name: string;
  facebook_lead_id: string;
}

async function pendingLeads(companyId: string, limit: number): Promise<LeadRow[]> {
  const [result] = await queryRecords(companyId, [{
    id: 'unattributed-leads',
    doctype: 'CRM Lead',
    fields: ['name', 'facebook_lead_id'],
    // Frappe's list filters treat '' and null separately, so both shapes are excluded.
    filters: [
      ['facebook_lead_id', 'is', 'set'],
      [WORKOS_LEAD_AD_ID_FIELD, 'is', 'not set'],
    ],
    limit,
    pageSize: limit,
  }]);
  // A tenant that has never published a lead form has no such custom field yet, so the query
  // legitimately fails. Left unlogged: this is the steady state for most companies, every hour.
  if (!result?.ok) return [];
  return result.rows
    .map((row) => ({ name: String(row.name ?? ''), facebook_lead_id: String(row.facebook_lead_id ?? '') }))
    .filter((row) => row.name && row.facebook_lead_id);
}

async function metaAdIdForLead(accessToken: string, leadId: string): Promise<string | null> {
  const url = new URL(`${META_GRAPH_BASE}/${leadId}`);
  url.searchParams.set('fields', 'ad_id');
  url.searchParams.set('access_token', accessToken);
  const proof = metaAppSecretProof(accessToken);
  if (proof) url.searchParams.set('appsecret_proof', proof);
  const response = await fetch(url);
  const body = await response.json().catch(() => ({})) as { ad_id?: string };
  // A lead Meta will not return (deleted, or outside the token's scope) is skipped rather than
  // retried forever — the next pass simply will not find it either.
  if (!response.ok) return null;
  return body.ad_id ? String(body.ad_id) : null;
}

/**
 * Stamp one batch for a company. Returns how many leads were updated so a caller can decide
 * whether more work remains.
 */
export async function stampLeadAttributionBatch(companyId: string): Promise<number> {
  const { rows } = await pool.query<{ access_token_enc: string }>(
    `SELECT access_token_enc FROM public.integration_connections
      WHERE company_id=$1 AND integration_id='int-meta' AND access_token_enc IS NOT NULL`,
    [companyId],
  );
  if (!rows[0]) return 0;
  const accessToken = decrypt(String(rows[0].access_token_enc));

  const leads = await pendingLeads(companyId, BATCH_SIZE);
  if (!leads.length) return 0;

  const entries: Array<{ leadName: string; adId: string }> = [];
  for (const lead of leads) {
    const adId = await metaAdIdForLead(accessToken, lead.facebook_lead_id);
    if (adId) entries.push({ leadName: lead.name, adId });
  }
  if (!entries.length) return 0;

  const result = await stampTenantLeadAttribution(companyId, {
    environment: provisionEnv,
    // Content-derived so a retry of the same batch is a no-op, while a later batch is not.
    idempotencyKey: `stamp_lead_attribution:${entries.map((entry) => entry.leadName).join(',')}`.slice(0, 200),
    entries,
  });
  log.info({ companyId, stamped: result.stamped, skipped: result.skipped }, 'lead attribution stamped');
  return result.stamped;
}

/**
 * Sweep every company holding a Meta connection. Frappe polls Meta hourly at the fastest useful
 * setting, so there is nothing to gain from running this more often than that.
 */
export async function runLeadAttributionSweep(): Promise<void> {
  const { rows } = await pool.query<{ company_id: string }>(
    `SELECT company_id FROM public.integration_connections WHERE integration_id='int-meta'`,
  );
  for (const row of rows) {
    try {
      await stampLeadAttributionBatch(String(row.company_id));
    } catch (error) {
      // One tenant's ERPNext being unreachable must not stop the sweep.
      log.error({ companyId: row.company_id, err: String(error) }, 'lead attribution sweep failed');
    }
  }
}

export function startLeadAttributionWorker(): void {
  const sweep = () => { void runLeadAttributionSweep().catch((error) => log.error({ err: String(error) }, 'lead attribution sweep crashed')); };
  setInterval(sweep, 60 * 60_000);
}
