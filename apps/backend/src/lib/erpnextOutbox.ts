import type { DesiredUser } from '@cybranex/erpnext-contracts';
import { env, provisionEnv } from '../config.js';
import { pool, supabaseAdmin } from '../db.js';
import type { RoleId } from '../rbac.js';
import { computeFrappeRoles } from './erpnextRoleMapping.js';
import { configureTenantSso, getTenantStatus, listTenants, provisionTenant, reconcileTenantUsers } from './erpnextControlPlane.js';
import { getOrCreateOidcClient } from '../routes/oidc.js';
import { log } from './logger.js';

type CommandKind = 'provision_tenant' | 'configure_sso' | 'reconcile_users';
interface Command { id: string; company_id: string; company_slug: string | null; command_kind: CommandKind; generation: number; attempts: number; max_attempts: number }

async function enqueue(companyId: string, kind: CommandKind, companySlug?: string) {
  await pool.query(`insert into public.erpnext_command_outbox(target_env,company_id,command_kind,company_slug) values($1,$2,$3,$4)
    on conflict(target_env,company_id,command_kind) do update set company_slug=coalesce(excluded.company_slug,erpnext_command_outbox.company_slug),generation=erpnext_command_outbox.generation+1,status='pending',attempts=0,next_attempt_at=now(),locked_by=null,locked_until=null,last_error=null,updated_at=now()`,
    [provisionEnv, companyId, kind, companySlug ?? null]);
}

export async function enqueueErpNextSetup(companyId: string, companySlug: string) {
  try { await enqueue(companyId, 'provision_tenant', companySlug); await enqueue(companyId, 'configure_sso', companySlug); await enqueue(companyId, 'reconcile_users', companySlug); }
  catch (error) { log.error({ companyId, err: String(error) }, 'erpnext setup outbox enqueue failed'); }
}

export async function enqueueErpNextReconcile(companyId: string) {
  try { await enqueue(companyId, 'reconcile_users'); }
  catch (error) { log.error({ companyId, err: String(error) }, 'erpnext reconcile outbox enqueue failed'); }
}

export async function enqueueErpNextSso(companyId: string) {
  try { await enqueue(companyId, 'configure_sso'); }
  catch (error) { log.error({ companyId, err: String(error) }, 'erpnext SSO outbox enqueue failed'); }
}

async function desiredUsers(companyId: string): Promise<DesiredUser[]> {
  const { rows } = await pool.query<{ user_id: string; role: RoleId }>('select user_id,role from public.company_members where company_id=$1 and status=\'active\'', [companyId]);
  const users: DesiredUser[] = [];
  for (const member of rows) {
    const roles = await computeFrappeRoles(companyId, member.user_id, member.role);
    if (!roles?.length) continue;
    const { data } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
    if (!data.user?.email) continue;
    const meta = data.user.user_metadata ?? {};
    users.push({ externalUserId: member.user_id, email: data.user.email, firstName: String(meta.first_name ?? data.user.email.split('@')[0]), ...(meta.last_name ? { lastName: String(meta.last_name) } : {}), roles });
  }
  return users;
}

async function pick(): Promise<Command | null> {
  const { rows } = await pool.query<Command>(`update public.erpnext_command_outbox set status='running',attempts=attempts+1,locked_by=$1,locked_until=now()+interval '2 minutes',updated_at=now()
    where id=(select id from public.erpnext_command_outbox where target_env=$2 and status in ('pending','running') and next_attempt_at<=now() and (locked_until is null or locked_until<now()) order by created_at for update skip locked limit 1) returning *`,
    [env.WORKER_ID, provisionEnv]);
  return rows[0] ?? null;
}

async function execute(command: Command) {
  const key = `${command.command_kind}:${provisionEnv}:${command.company_id}:${command.generation}`;
  if (command.command_kind === 'provision_tenant') {
    if (!command.company_slug) throw new Error('company_slug_missing');
    await provisionTenant(command.company_id, { environment: provisionEnv, companySlug: command.company_slug, idempotencyKey: key });
    return;
  }
  const status = await getTenantStatus(command.company_id);
  if (status.status !== 'ready' || !status.deskUrl) { const error = new Error('tenant_not_ready') as Error & { retryable?: boolean }; error.retryable = true; throw error; }
  if (command.command_kind === 'configure_sso') {
    const redirectUrl = `${status.deskUrl.replace(/\/$/, '')}/api/method/frappe.integrations.oauth2_logins.custom/workos`;
    const client = await getOrCreateOidcClient(command.company_id, provisionEnv, 'workos', redirectUrl);
    await configureTenantSso(command.company_id, { environment: provisionEnv, idempotencyKey: key, providerName: 'workos', clientId: client.clientId, clientSecret: client.clientSecret, authorizeUrl: env.OIDC_BROWSER_AUTHORIZE_URL, oidcBaseUrl: env.OIDC_INTERNAL_BASE_URL, redirectUrl });
    return;
  }
  await reconcileTenantUsers(command.company_id, { environment: provisionEnv, idempotencyKey: key, users: await desiredUsers(command.company_id) });
}

async function finish(command: Command, error?: unknown) {
  if (!error) { await pool.query(`update public.erpnext_command_outbox set status='complete',completed_at=now(),locked_by=null,locked_until=null,last_error=null,updated_at=now() where id=$1 and generation=$2`, [command.id, command.generation]); return; }
  const retryable = (error as { retryable?: boolean }).retryable !== false && command.attempts < command.max_attempts;
  const delay = Math.min(300, 2 ** Math.min(command.attempts, 8));
  await pool.query(`update public.erpnext_command_outbox set status=$3,next_attempt_at=now()+($4||' seconds')::interval,locked_by=null,locked_until=null,last_error=$5,updated_at=now() where id=$1 and generation=$2`,
    [command.id, command.generation, retryable ? 'pending' : 'failed', String(delay), String(error).slice(0, 500)]);
}

export function startErpNextOutboxWorker() {
  let active = true; process.on('SIGINT', () => { active = false; }); process.on('SIGTERM', () => { active = false; });
  void (async () => { while (active) { const command = await pick().catch(error => { log.error({ err: String(error) }, 'erpnext outbox pick failed'); return null; }); if (!command) { await new Promise(r => setTimeout(r, 2000)); continue; } try { await execute(command); await finish(command); } catch (error) { await finish(command, error); } } })();
  setInterval(() => { void listTenants().then(tenants => Promise.all(tenants.filter(t => t.status === 'ready').flatMap(t => [enqueueErpNextReconcile(t.companyId), enqueueErpNextSso(t.companyId)]))).catch(error => log.error({ err: String(error) }, 'erpnext reconciliation scheduling failed')); }, 30 * 60_000);
}
