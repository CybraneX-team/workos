import { Router } from 'express';
import { supabaseAdmin } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import {
  DEFAULT_MEMBER_ROLE,
  canAssignRole,
  getRoleDefinition,
  isProtectedRole,
  requirePermission,
  requireTeamDelete,
  requireTeamWrite,
  type RoleId,
} from '../rbac.js';
import { getDepartmentAccess, roleDepartmentGrantsSubset } from '../departmentAccess.js';
import { syncErpNextRolesForMember, deprovisionErpNextUser } from '../lib/erpnextRoleSync.js';

export const teamRouter = Router();
teamRouter.use(authJwt);

type MemberRow = {
  id: string;
  company_id: string;
  user_id: string;
  role: RoleId;
  status: string;
  department_id?: string | null;
};

async function getMember(memberId: string, companyId: string): Promise<MemberRow | null> {
  const { data, error } = await supabaseAdmin
    .from('company_members')
    .select('id, company_id, user_id, role, status')
    .eq('id', memberId)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  return data as MemberRow | null;
}

async function activeFounderCount(companyId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('company_members')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'active')
    .eq('role', 'founder');

  if (error) throw error;
  return count ?? 0;
}

function canModifyTarget(actorRole: RoleId, targetRole: RoleId): boolean {
  if (targetRole === 'super_admin') return actorRole === 'super_admin';
  if (targetRole === 'founder') return actorRole === 'founder' || actorRole === 'super_admin';
  return true;
}

async function syncProfileRole(userId: string, companyId: string, role: RoleId) {
  await supabaseAdmin
    .from('user_profiles')
    .upsert(
      { id: userId, company_id: companyId, role, onboarding_completed: true },
      { onConflict: 'id' },
    );
}

teamRouter.get('/members', requirePermission('team', 'read'), async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  try {
    const { data, error } = await supabaseAdmin
      .from('company_members')
      .select('id, user_id, company_id, role, status, department_id, invited_by, approved_at, joined_at')
      .eq('company_id', companyId)
      .in('status', ['active', 'pending'])
      .order('joined_at', { ascending: true });

    if (error) {
      console.error('[team] list members failed', error);
      return res.status(500).json({ error: 'members_list_failed', details: error.message });
    }

    const rows = data ?? [];
    const userIds = [...new Set(rows.map((row: any) => row.user_id))];
    let profilesByUserId: Record<string, any> = {};

    if (userIds.length > 0) {
      const { data: profiles, error: profileErr } = await supabaseAdmin
        .from('user_profiles')
        .select('id, first_name, last_name, title, avatar_url')
        .in('id', userIds);

      if (profileErr) {
        console.error('[team] list member profiles failed', profileErr);
        return res.status(500).json({ error: 'members_list_failed', details: profileErr.message });
      }
      profilesByUserId = Object.fromEntries((profiles ?? []).map((profile: any) => [profile.id, profile]));
    }

    return res.status(200).json({
      members: rows.map((row: any) => {
        const role = getRoleDefinition(row.role, companyId);
        return {
          ...row,
          role_name: role?.name ?? row.role,
          is_system_role: role?.isSystem ?? false,
          is_protected_role: isProtectedRole(row.role),
          first_name: profilesByUserId[row.user_id]?.first_name ?? null,
          last_name: profilesByUserId[row.user_id]?.last_name ?? null,
          title: profilesByUserId[row.user_id]?.title ?? null,
          avatar_url: profilesByUserId[row.user_id]?.avatar_url ?? null,
          email: null,
        };
      }),
    });
  } catch (err: any) {
    console.error('[team] list members unexpected error', err);
    return res.status(500).json({ error: 'members_list_failed', details: err.message });
  }
});

teamRouter.patch('/members/:memberId/department', requireTeamWrite, async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const departmentId = typeof req.body?.departmentId === 'string' && req.body.departmentId.trim()
    ? req.body.departmentId.trim()
    : null;

  try {
    const member = await getMember(req.params.memberId, companyId);
    if (!member) return res.status(404).json({ error: 'member_not_found' });

    if (departmentId) {
      const { data: department, error: departmentErr } = await supabaseAdmin
        .from('departments')
        .select('id')
        .eq('id', departmentId)
        .eq('company_id', companyId)
        .maybeSingle();
      if (departmentErr) {
        return res.status(500).json({ error: 'department_lookup_failed', details: departmentErr.message });
      }
      if (!department) return res.status(404).json({ error: 'department_not_found' });
      const access = await getDepartmentAccess({ companyId, userId: req.auth.userId, role: req.auth.role }, departmentId);
      if (!access.manage) return res.status(403).json({ error: 'department_forbidden' });
    }

    const { error } = await supabaseAdmin
      .from('company_members')
      .update({ department_id: departmentId })
      .eq('id', member.id)
      .eq('company_id', companyId);

    if (error) {
      console.error('[team] department update failed', error);
      return res.status(500).json({ error: 'department_update_failed', details: error.message });
    }

    await syncErpNextRolesForMember(companyId, member.user_id, member.role);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[team] department update unexpected error', err);
    return res.status(500).json({ error: 'department_update_failed', details: err.message });
  }
});

teamRouter.patch('/members/:memberId/role', requireTeamWrite, async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  const actorRole = req.auth.role;
  const newRole = req.body?.role;

  if (!companyId || !actorRole) return res.status(403).json({ error: 'no_company' });
  if (typeof newRole !== 'string' || !canAssignRole(actorRole, companyId, newRole)) {
    return res.status(400).json({ error: 'invalid_role' });
  }
  if (!(await roleDepartmentGrantsSubset({ companyId, userId: req.auth.userId, role: actorRole }, newRole))) {
    return res.status(403).json({ error: 'department_permission_escalation' });
  }

  try {
    const member = await getMember(req.params.memberId, companyId);
    if (!member) return res.status(404).json({ error: 'member_not_found' });
    if (member.user_id === req.auth.userId) return res.status(403).json({ error: 'cannot_change_self' });
    if (!canModifyTarget(actorRole, member.role)) return res.status(403).json({ error: 'protected_role' });

    if (member.role === 'founder' && (await activeFounderCount(companyId)) <= 1) {
      return res.status(409).json({ error: 'last_founder' });
    }

    const { error } = await supabaseAdmin
      .from('company_members')
      .update({ role: newRole })
      .eq('id', member.id)
      .eq('company_id', companyId);

    if (error) {
      console.error('[team] role update failed', error);
      return res.status(500).json({ error: 'role_update_failed', details: error.message });
    }

    await syncProfileRole(member.user_id, companyId, newRole);
    await syncErpNextRolesForMember(companyId, member.user_id, newRole);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[team] role update unexpected error', err);
    return res.status(500).json({ error: 'role_update_failed', details: err.message });
  }
});

teamRouter.delete('/members/:memberId', requireTeamDelete, async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  const actorRole = req.auth.role;

  if (!companyId || !actorRole) return res.status(403).json({ error: 'no_company' });

  try {
    const member = await getMember(req.params.memberId, companyId);
    if (!member) return res.status(404).json({ error: 'member_not_found' });
    if (member.user_id === req.auth.userId) return res.status(403).json({ error: 'cannot_remove_self' });
    if (!canModifyTarget(actorRole, member.role)) return res.status(403).json({ error: 'protected_role' });

    if (member.role === 'founder' && (await activeFounderCount(companyId)) <= 1) {
      return res.status(409).json({ error: 'last_founder' });
    }

    const { error } = await supabaseAdmin
      .from('company_members')
      .update({ status: 'removed' })
      .eq('id', member.id)
      .eq('company_id', companyId);

    if (error) {
      console.error('[team] member remove failed', error);
      return res.status(500).json({ error: 'member_remove_failed', details: error.message });
    }

    await supabaseAdmin
      .from('user_profiles')
      .update({ company_id: null, role: DEFAULT_MEMBER_ROLE })
      .eq('id', member.user_id)
      .eq('company_id', companyId);

    await deprovisionErpNextUser(companyId, member.user_id);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[team] member remove unexpected error', err);
    return res.status(500).json({ error: 'member_remove_failed', details: err.message });
  }
});
