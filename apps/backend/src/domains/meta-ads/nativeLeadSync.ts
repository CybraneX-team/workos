import { META_GRAPH_BASE, metaAppSecretProof } from '../../adapters/metaAds.js';
import { pool } from '../../db.js';
import { decrypt } from '../../lib/crypto.js';
import { log } from '../../lib/logger.js';

export interface NativeMetaLeadBinding { id: string; company_id: string; meta_form_id: string; field_mapping: Record<string,string>; last_synced_at: string | null; access_token_enc: string }
interface MetaLead { id: string; created_time?: string; ad_id?: string; field_data?: Array<{ name?: string; values?: unknown[] }> }
type FetchLike = typeof fetch;

let nextSweepAt = 0;

async function fetchLeads(binding: NativeMetaLeadBinding, fetchImpl: FetchLike): Promise<MetaLead[]> {
  const token = decrypt(binding.access_token_enc);
  const url = new URL(`${META_GRAPH_BASE}/${binding.meta_form_id}/leads`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('fields', 'id,created_time,ad_id,field_data');
  url.searchParams.set('limit', '100');
  if (binding.last_synced_at) url.searchParams.set('since', String(Math.floor(new Date(binding.last_synced_at).getTime() / 1000)));
  const proof = metaAppSecretProof(token); if (proof) url.searchParams.set('appsecret_proof', proof);
  const rows: MetaLead[] = []; let next: string | null = url.toString(); let pages = 0;
  while (next && pages++ < 100) {
    const response = await fetchImpl(next); const body = await response.json().catch(() => ({})) as { data?: MetaLead[]; paging?: { next?: string }; error?: { message?: string } };
    if (!response.ok) throw new Error(`meta_leads_${response.status}:${body.error?.message ?? 'request_failed'}`);
    rows.push(...(body.data ?? [])); next = body.paging?.next ?? null;
  }
  if (next) throw new Error('meta_leads_pagination_limit');
  return rows;
}

function answerMap(lead: MetaLead): Record<string,string> {
  return Object.fromEntries((lead.field_data ?? []).map(row => [String(row.name ?? ''), String(row.values?.[0] ?? '')]).filter(([key]) => key));
}

function mappedAnswers(binding: NativeMetaLeadBinding, lead: MetaLead) {
  const raw = answerMap(lead); const mapped: Record<string,string> = {};
  for (const [question, value] of Object.entries(raw)) mapped[binding.field_mapping[question] ?? question] = value;
  const first = mapped.first_name ?? mapped.full_name?.split(/\s+/)[0] ?? '';
  const last = mapped.last_name ?? (mapped.full_name?.split(/\s+/).slice(1).join(' ') || '');
  return {
    raw, name: [first,last].filter(Boolean).join(' ') || mapped.email || `Meta lead ${lead.id}`,
    email: mapped.email || null,
    phone: mapped.phone || mapped.phone_number || mapped.mobile_no || null,
  };
}

export async function syncNativeMetaLeadBinding(binding: NativeMetaLeadBinding, fetchImpl: FetchLike = fetch): Promise<number> {
  const leads = await fetchLeads(binding, fetchImpl); const client = await pool.connect();
  try {
    await client.query('begin');
    for (const lead of leads) {
      const values = mappedAnswers(binding, lead);
      await client.query(
        `insert into public.crm_leads(company_id,name,email,phone,source,status,meta_lead_id,meta_form_id,meta_ad_id,raw_answers,created_at,updated_at)
         values($1,$2,$3,$4,'Meta Lead Ads','new',$5,$6,$7,$8::jsonb,coalesce($9::timestamptz,now()),now())
         on conflict(company_id,meta_lead_id) where meta_lead_id is not null do update set
           name=excluded.name,email=excluded.email,phone=excluded.phone,meta_ad_id=excluded.meta_ad_id,
           raw_answers=excluded.raw_answers,updated_at=now()`,
        [binding.company_id,values.name,values.email,values.phone,lead.id,binding.meta_form_id,lead.ad_id??null,JSON.stringify(values.raw),lead.created_time??null],
      );
    }
    const latest = leads.map(lead => lead.created_time).filter((value): value is string => Boolean(value)).sort().at(-1) ?? new Date().toISOString();
    await client.query(`update public.meta_lead_form_bindings set last_synced_at=$2,last_error=null,updated_at=now() where id=$1`,[binding.id,latest]);
    await client.query('commit'); return leads.length;
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
}

export async function runNativeMetaLeadSweep(fetchImpl: FetchLike = fetch): Promise<void> {
  const { rows } = await pool.query<NativeMetaLeadBinding>(
    `select b.*,c.access_token_enc from public.meta_lead_form_bindings b join public.integration_connections c on c.company_id=b.company_id and c.integration_id='int-meta' where b.active=true and c.access_token_enc is not null order by b.updated_at`,
  );
  for (const binding of rows) {
    try { const count = await syncNativeMetaLeadBinding(binding, fetchImpl); if (count) log.info({ bindingId: binding.id, companyId: binding.company_id, count }, 'native Meta leads synced'); }
    catch (error) { const message = String(error).slice(0,500); await pool.query(`update public.meta_lead_form_bindings set last_error=$2,updated_at=now() where id=$1`,[binding.id,message]); log.error({ bindingId: binding.id, companyId: binding.company_id, err: message }, 'native Meta lead sync failed'); }
  }
}

export async function runNativeMetaLeadSweepIfDue(now = Date.now()): Promise<void> {
  if (now < nextSweepAt) return;
  nextSweepAt = now + 60 * 60_000;
  await runNativeMetaLeadSweep();
}
