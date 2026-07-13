import { pool, supabaseAdmin } from '../db.js';
import { log } from './logger.js';
import { resolveErpNextCreds } from './erpnextConnection.js';
import { upsertFrappeUser, disableFrappeUser } from '../adapters/erpnext.js';
import { computeFrappeRoles } from './erpnextRoleMapping.js';
import type { RoleId } from '../rbac.js';

// One-way mirror, matching the Phase 0 decision: WorkOS RBAC is the source of
// truth, Frappe's roles are fully overwritten (not merged) on every sync. All
// callers are fire-and-forget from the caller's perspective — errors are
// logged, never thrown, so a sync failure never blocks the RBAC mutation
// itself (see call sites in routes/team.ts, routes/rbac.ts).

async function getEmail(userId: string): Promise<{ email: string; firstName: string; lastName?: string } | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  const meta = data.user.user_metadata ?? {};
  return {
    email: data.user.email,
    firstName: String(meta.first_name ?? data.user.email.split('@')[0]),
    lastName: meta.last_name ? String(meta.last_name) : undefined,
  };
}

// Recomputes and pushes one member's Frappe roles right now, reflecting
// whatever their WorkOS role + department grants currently are. If that
// computes to "no ERPNext access" (viewer/investor, or zero department
// grants), the Frappe User is disabled rather than left with stale roles.
export async function syncErpNextRolesForMember(companyId: string, userId: string, companyRole: RoleId): Promise<void> {
  try {
    const creds = await resolveErpNextCreds(companyId);
    if (!creds) return; // company has no ERPNext connection at all yet

    const identity = await getEmail(userId);
    if (!identity) return;

    const roles = await computeFrappeRoles(companyId, userId, companyRole);
    if (!roles || roles.length === 0) {
      await disableFrappeUser(creds, identity.email);
      return;
    }
    await upsertFrappeUser(creds, { ...identity, roles });
  } catch (err) {
    log.error({ companyId, userId, err: String(err) }, 'erpnext role sync failed');
  }
}

// A department_role_grants change for `roleId` shifts effective access for
// every active member currently holding that role, not just one person.
export async function syncErpNextRolesForRole(companyId: string, roleId: string): Promise<void> {
  const { rows: members } = await pool.query<{ user_id: string; role: RoleId }>(
    `select user_id, role from public.company_members where company_id = $1 and status = 'active' and role = $2`,
    [companyId, roleId],
  );
  await Promise.all(members.map((m) => syncErpNextRolesForMember(companyId, m.user_id, m.role)));
}

// Member removed from the company entirely — always disable, regardless of
// what their role was (unlike syncErpNextRolesForMember, which would
// incorrectly re-grant founder/co_founder's unconditional roles if called
// with a role string alone, ignoring membership status).
export async function deprovisionErpNextUser(companyId: string, userId: string): Promise<void> {
  try {
    const creds = await resolveErpNextCreds(companyId);
    if (!creds) return;
    const identity = await getEmail(userId);
    if (!identity) return;
    await disableFrappeUser(creds, identity.email);
  } catch (err) {
    log.error({ companyId, userId, err: String(err) }, 'erpnext deprovision failed');
  }
}

const RECONCILE_INTERVAL_MS = 30 * 60_000;

// Safety net, not the primary mechanism: the route-level hooks above cover
// every known RBAC mutation point, but this catches drift from anything
// missed (a hook that throws before reaching sync, a direct DB edit, etc.)
// by periodically resyncing every active member of every company that has
// an ERPNext connection at all.
async function reconcileOnce(): Promise<void> {
  const { rows: companies } = await pool.query<{ company_id: string }>(
    `select distinct company_id from public.integration_connections where integration_id = 'int-erpnext'`,
  );
  for (const { company_id } of companies) {
    const { rows: members } = await pool.query<{ user_id: string; role: RoleId }>(
      `select user_id, role from public.company_members where company_id = $1 and status = 'active'`,
      [company_id],
    );
    for (const member of members) {
      await syncErpNextRolesForMember(company_id, member.user_id, member.role);
    }
  }
}

export function startErpnextRoleReconciliationWorker(): void {
  setInterval(() => {
    reconcileOnce().catch((err) => log.error({ err: String(err) }, 'erpnext role reconciliation pass failed'));
  }, RECONCILE_INTERVAL_MS);
}
