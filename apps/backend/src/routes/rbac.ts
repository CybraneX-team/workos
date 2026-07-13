import { Router } from 'express';
import { pool } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import {
  customRoleId,
  getRoleDefinition,
  isProtectedRole,
  listRoleDefinitions,
  refreshCompanyRoles,
  requirePermission,
  serializePermissions,
  shapeRole,
  validatePermissionsInput,
} from '../rbac.js';
import {
  getDepartmentAccess,
  grantSubset,
  normalizeDepartmentGrant,
  type DepartmentAccess,
} from '../departmentAccess.js';
import { syncErpNextRolesForRole, syncErpNextRolesForMember } from '../lib/erpnextRoleSync.js';

export const rbacRouter = Router();
rbacRouter.use(authJwt);

function roleName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : null;
}

function nullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

rbacRouter.get('/roles', requirePermission('team', 'read'), (req: any, res: any) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  return res.status(200).json({
    roles: listRoleDefinitions(companyId).map((role) => shapeRole(role, req.auth.role, companyId)),
  });
});

rbacRouter.get('/department-access', requirePermission('team', 'read'), async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  try {
    const [{ rows: departments }, { rows: roleGrants }, { rows: memberGrants }] = await Promise.all([
      pool.query(
        `SELECT id, label
           FROM public.departments
          WHERE company_id = $1
          ORDER BY sort_order ASC, label ASC`,
        [companyId],
      ),
      pool.query(
        `SELECT department_id, role_id, read, write, "delete", manage
           FROM public.department_role_grants
          WHERE company_id = $1
          ORDER BY department_id, role_id`,
        [companyId],
      ),
      pool.query(
        `SELECT department_id, member_id, read, write, "delete", manage
           FROM public.department_member_grants
          WHERE company_id = $1
          ORDER BY department_id, member_id`,
        [companyId],
      ),
    ]);

    const departmentsWithAccess = (await Promise.all(departments.map(async (department: any) => ({
      id: department.id,
      label: department.label,
      access: await getDepartmentAccess(req.auth, department.id),
    })))).filter((department) => department.access.read);
    const visibleDepartmentIds = new Set(departmentsWithAccess.map((department) => department.id));

    return res.json({
      departments: departmentsWithAccess,
      roleGrants: roleGrants.filter((grant: any) => visibleDepartmentIds.has(grant.department_id)),
      memberGrants: memberGrants.filter((grant: any) => visibleDepartmentIds.has(grant.department_id)),
    });
  } catch (err: any) {
    console.error('[rbac] department access list failed', err);
    return res.status(500).json({ error: 'department_access_list_failed', details: err.message });
  }
});

async function assertGrantAllowed(req: any, departmentId: string, grant: DepartmentAccess) {
  const access = await getDepartmentAccess(req.auth, departmentId);
  if (!access.manage) throw new Error('department_forbidden');
  if (!grantSubset(grant, access)) throw new Error('department_permission_escalation');
}

rbacRouter.put('/departments/:departmentId/role-grants/:roleId', requirePermission('team', 'write'), async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  const departmentId = req.params.departmentId;
  const roleId = req.params.roleId;
  const grant = normalizeDepartmentGrant(req.body);

  if (isProtectedRole(roleId)) return res.status(403).json({ error: 'protected_role_implicit' });
  if (!getRoleDefinition(roleId, companyId)) return res.status(404).json({ error: 'role_not_found' });

  try {
    await assertGrantAllowed(req, departmentId, grant);
    await pool.query(
      `INSERT INTO public.department_role_grants
         (company_id, department_id, role_id, read, write, "delete", manage, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       ON CONFLICT (company_id, department_id, role_id) DO UPDATE
         SET read = EXCLUDED.read,
             write = EXCLUDED.write,
             "delete" = EXCLUDED."delete",
             manage = EXCLUDED.manage,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
      [companyId, departmentId, roleId, grant.read, grant.write, grant.delete, grant.manage, req.auth.userId],
    );
    await syncErpNextRolesForRole(companyId, roleId);
    return res.json({ success: true });
  } catch (err: any) {
    const status = err.message === 'department_forbidden' || err.message === 'department_permission_escalation' ? 403 : 500;
    return res.status(status).json({ error: err.message ?? 'department_role_grant_failed' });
  }
});

rbacRouter.delete('/departments/:departmentId/role-grants/:roleId', requirePermission('team', 'write'), async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    const access = await getDepartmentAccess(req.auth, req.params.departmentId);
    if (!access.manage) return res.status(403).json({ error: 'department_forbidden' });
    await pool.query(
      `DELETE FROM public.department_role_grants
        WHERE company_id = $1 AND department_id = $2 AND role_id = $3`,
      [companyId, req.params.departmentId, req.params.roleId],
    );
    await syncErpNextRolesForRole(companyId, req.params.roleId);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'department_role_grant_delete_failed', details: err.message });
  }
});

rbacRouter.put('/departments/:departmentId/member-grants/:memberId', requirePermission('team', 'write'), async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  const departmentId = req.params.departmentId;
  const memberId = req.params.memberId;
  const grant = normalizeDepartmentGrant(req.body);

  try {
    const { rows } = await pool.query<{ id: string; user_id: string; role: string }>(
      `SELECT id, user_id, role FROM public.company_members WHERE id = $1 AND company_id = $2 AND status = 'active'`,
      [memberId, companyId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'member_not_found' });
    await assertGrantAllowed(req, departmentId, grant);
    await pool.query(
      `INSERT INTO public.department_member_grants
         (company_id, department_id, member_id, read, write, "delete", manage, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       ON CONFLICT (company_id, department_id, member_id) DO UPDATE
         SET read = EXCLUDED.read,
             write = EXCLUDED.write,
             "delete" = EXCLUDED."delete",
             manage = EXCLUDED.manage,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
      [companyId, departmentId, memberId, grant.read, grant.write, grant.delete, grant.manage, req.auth.userId],
    );
    await syncErpNextRolesForMember(companyId, rows[0].user_id, rows[0].role);
    return res.json({ success: true });
  } catch (err: any) {
    const status = err.message === 'department_forbidden' || err.message === 'department_permission_escalation' ? 403 : 500;
    return res.status(status).json({ error: err.message ?? 'department_member_grant_failed' });
  }
});

rbacRouter.delete('/departments/:departmentId/member-grants/:memberId', requirePermission('team', 'write'), async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    const access = await getDepartmentAccess(req.auth, req.params.departmentId);
    if (!access.manage) return res.status(403).json({ error: 'department_forbidden' });
    await pool.query(
      `DELETE FROM public.department_member_grants
        WHERE company_id = $1 AND department_id = $2 AND member_id = $3`,
      [companyId, req.params.departmentId, req.params.memberId],
    );
    const { rows } = await pool.query<{ user_id: string; role: string }>(
      `SELECT user_id, role FROM public.company_members WHERE id = $1 AND company_id = $2`,
      [req.params.memberId, companyId],
    );
    if (rows[0]) await syncErpNextRolesForMember(companyId, rows[0].user_id, rows[0].role);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'department_member_grant_delete_failed', details: err.message });
  }
});

rbacRouter.post('/roles', requirePermission('team', 'write'), async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  const actorRole = req.auth.role;
  if (!companyId || !actorRole) return res.status(403).json({ error: 'no_company' });

  const name = roleName(req.body?.name);
  const description = nullableText(req.body?.description);
  const sourceRoleId = typeof req.body?.sourceRoleId === 'string' ? req.body.sourceRoleId : null;
  if (!name) return res.status(400).json({ error: 'name_required' });
  if (!sourceRoleId) return res.status(400).json({ error: 'source_role_required' });

  const sourceRole = getRoleDefinition(sourceRoleId, companyId);
  if (!sourceRole) return res.status(404).json({ error: 'source_role_not_found' });

  let permissions = sourceRole.permissions;
  try {
    permissions = validatePermissionsInput(
      req.body?.permissions !== undefined ? req.body.permissions : sourceRole.permissions,
      actorRole,
      companyId,
    );
  } catch (err: any) {
    return res.status(err.message === 'permission_escalation' ? 403 : 400).json({ error: err.message });
  }

  const id = customRoleId();
  try {
    await pool.query(
      `
      INSERT INTO public.roles
        (id, company_id, name, description, permissions, is_system, is_archived, base_role_id, created_by, updated_by)
      VALUES
        ($1, $2, $3, $4, $5::jsonb, false, false, $6, $7, $7)
      `,
      [id, companyId, name, description, JSON.stringify(serializePermissions(permissions)), sourceRole.id, req.auth.userId],
    );
  } catch (err: any) {
    console.error('[rbac] create role failed', err);
    return res.status(500).json({ error: 'role_create_failed', details: err.message });
  }

  await refreshCompanyRoles(companyId);
  const created = getRoleDefinition(id, companyId);
  return res.status(201).json({ role: created ? shapeRole(created, actorRole, companyId) : null });
});

rbacRouter.patch('/roles/:roleId', requirePermission('team', 'write'), async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  const actorRole = req.auth.role;
  if (!companyId || !actorRole) return res.status(403).json({ error: 'no_company' });

  const existing = getRoleDefinition(req.params.roleId, companyId);
  if (!existing) return res.status(404).json({ error: 'role_not_found' });
  if (existing.isSystem) return res.status(403).json({ error: 'system_role_locked' });

  const patch: Record<string, unknown> = { updated_by: req.auth.userId };
  if ('name' in req.body) {
    const name = roleName(req.body.name);
    if (!name) return res.status(400).json({ error: 'name_required' });
    patch.name = name;
  }
  if ('description' in req.body) patch.description = nullableText(req.body.description);

  const hasPermissions = 'permissions' in req.body;
  if (Object.keys(patch).length === 1 && !hasPermissions) {
    return res.status(400).json({ error: 'no_role_fields' });
  }

  // Validate the role's permissions against the actor exactly once: the submitted
  // set when provided, otherwise the existing set (blocks a lower-privilege actor
  // from editing a role that already exceeds their own permissions).
  try {
    const permissions = validatePermissionsInput(
      hasPermissions ? req.body.permissions : existing.permissions,
      actorRole,
      companyId,
    );
    if (hasPermissions) patch.permissions = serializePermissions(permissions);
  } catch (err: any) {
    return res.status(err.message === 'permission_escalation' ? 403 : 400).json({ error: err.message });
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    values.push(key === 'permissions' ? JSON.stringify(value) : value);
    fields.push(`${key} = $${values.length}${key === 'permissions' ? '::jsonb' : ''}`);
  }
  values.push(existing.id, companyId);

  try {
    await pool.query(
      `UPDATE public.roles SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length - 1}
          AND company_id = $${values.length}
          AND is_system = false
          AND is_archived = false`,
      values,
    );
  } catch (err: any) {
    console.error('[rbac] update role failed', err);
    return res.status(500).json({ error: 'role_update_failed', details: err.message });
  }

  await refreshCompanyRoles(companyId);
  const updated = getRoleDefinition(existing.id, companyId);
  return res.status(200).json({ role: updated ? shapeRole(updated, actorRole, companyId) : null });
});

rbacRouter.post('/roles/:roleId/archive', requirePermission('team', 'write'), async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const existing = getRoleDefinition(req.params.roleId, companyId);
  if (!existing) return res.status(404).json({ error: 'role_not_found' });
  if (existing.isSystem) return res.status(403).json({ error: 'system_role_locked' });

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM public.company_members
      WHERE company_id = $1
        AND role = $2
        AND status = 'active'`,
    [companyId, existing.id],
  );
  if (Number(rows[0]?.count ?? 0) > 0) {
    return res.status(409).json({ error: 'role_in_use' });
  }

  try {
    await pool.query(`DELETE FROM public.department_role_grants WHERE company_id = $1 AND role_id = $2`, [companyId, existing.id]);
    await pool.query(
      `UPDATE public.roles
          SET is_archived = true, updated_by = $1, updated_at = NOW()
        WHERE id = $2
          AND company_id = $3
          AND is_system = false`,
      [req.auth.userId, existing.id, companyId],
    );
  } catch (err: any) {
    console.error('[rbac] archive role failed', err);
    return res.status(500).json({ error: 'role_archive_failed', details: err.message });
  }

  await refreshCompanyRoles(companyId);
  return res.status(200).json({ success: true });
});
