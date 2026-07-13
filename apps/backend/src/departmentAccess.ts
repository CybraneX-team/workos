import type { RequestHandler } from 'express';
import { pool } from './db.js';
import { can, isProtectedRole, type RoleId } from './rbac.js';
import {
  emptyDepartmentAccess as emptyAccess,
  isGlobalDepartmentActor,
  accessAllows,
  grantSubset,
} from '@cybranex/permissions';
import type { DepartmentAction, DepartmentAccess } from '@cybranex/permissions';

// Department pure logic + types now live in @cybranex/permissions. Re-export the
// pieces this module's consumers (routes/rbac.ts, routes/team.ts) import from here.
export {
  DEPARTMENT_ACTIONS,
  isGlobalDepartmentActor,
  normalizeDepartmentGrant,
  accessAllows,
  grantSubset,
} from '@cybranex/permissions';
export type {
  DepartmentAction,
  DepartmentAccess,
  DepartmentGrantInput,
} from '@cybranex/permissions';

export interface DepartmentActor {
  userId: string;
  companyId: string;
  role: RoleId;
}

export async function getActiveMemberId(companyId: string, userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id
       FROM public.company_members
      WHERE company_id = $1
        AND user_id = $2
        AND status = 'active'
      LIMIT 1`,
    [companyId, userId],
  );
  return rows[0]?.id ?? null;
}

export async function assertDepartmentExists(companyId: string, departmentId: string): Promise<boolean> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM public.departments WHERE id = $1 AND company_id = $2`,
    [departmentId, companyId],
  );
  return Boolean(rows[0]);
}

export async function getNodeDepartmentId(companyId: string, nodeId: string): Promise<string | null> {
  const { rows } = await pool.query<{ department_id: string }>(
    `SELECT department_id
       FROM public.department_bdt_nodes
      WHERE id = $1
        AND company_id = $2`,
    [nodeId, companyId],
  );
  return rows[0]?.department_id ?? null;
}

export async function getDepartmentAccess(actor: DepartmentActor, departmentId: string): Promise<DepartmentAccess> {
  if (isGlobalDepartmentActor(actor.role)) {
    return { read: true, write: true, delete: true, manage: true };
  }

  const { rows } = await pool.query<{
    assigned_read: boolean;
    role_read: boolean | null;
    role_write: boolean | null;
    role_delete: boolean | null;
    role_manage: boolean | null;
    member_read: boolean | null;
    member_write: boolean | null;
    member_delete: boolean | null;
    member_manage: boolean | null;
  }>(
    `
    WITH actor_member AS (
      SELECT id, department_id
        FROM public.company_members
       WHERE company_id = $1
         AND user_id = $2
         AND status = 'active'
       LIMIT 1
    )
    SELECT
      EXISTS (
        SELECT 1 FROM actor_member am WHERE am.department_id = $3
      ) AS assigned_read,
      bool_or(drg.read) AS role_read,
      bool_or(drg.write) AS role_write,
      bool_or(drg."delete") AS role_delete,
      bool_or(drg.manage) AS role_manage,
      bool_or(dmg.read) AS member_read,
      bool_or(dmg.write) AS member_write,
      bool_or(dmg."delete") AS member_delete,
      bool_or(dmg.manage) AS member_manage
    FROM public.departments d
    LEFT JOIN public.department_role_grants drg
      ON drg.department_id = d.id
     AND drg.company_id = d.company_id
     AND drg.role_id = $4
    LEFT JOIN actor_member am ON true
    LEFT JOIN public.department_member_grants dmg
      ON dmg.department_id = d.id
     AND dmg.company_id = d.company_id
     AND dmg.member_id = am.id
    WHERE d.company_id = $1
      AND d.id = $3
    GROUP BY d.id
    `,
    [actor.companyId, actor.userId, departmentId, actor.role],
  );

  const row = rows[0];
  if (!row) return emptyAccess();
  return {
    read: Boolean(row.assigned_read || row.role_read || row.member_read),
    write: Boolean(row.role_write || row.member_write),
    delete: Boolean(row.role_delete || row.member_delete),
    manage: Boolean(row.role_manage || row.member_manage),
  };
}

export async function getDepartmentAccessMap(actor: DepartmentActor): Promise<Map<string, DepartmentAccess>> {
  const { rows: departmentRows } = await pool.query<{ id: string }>(
    `SELECT id FROM public.departments WHERE company_id = $1`,
    [actor.companyId],
  );

  if (isGlobalDepartmentActor(actor.role)) {
    return new Map(departmentRows.map((row) => [row.id, { read: true, write: true, delete: true, manage: true }]));
  }

  const { rows } = await pool.query<{
    id: string;
    assigned_read: boolean;
    role_read: boolean | null;
    role_write: boolean | null;
    role_delete: boolean | null;
    role_manage: boolean | null;
    member_read: boolean | null;
    member_write: boolean | null;
    member_delete: boolean | null;
    member_manage: boolean | null;
  }>(
    `
    WITH actor_member AS (
      SELECT id, department_id
        FROM public.company_members
       WHERE company_id = $1
         AND user_id = $2
         AND status = 'active'
       LIMIT 1
    )
    SELECT
      d.id,
      EXISTS (
        SELECT 1 FROM actor_member am WHERE am.department_id = d.id
      ) AS assigned_read,
      bool_or(drg.read) AS role_read,
      bool_or(drg.write) AS role_write,
      bool_or(drg."delete") AS role_delete,
      bool_or(drg.manage) AS role_manage,
      bool_or(dmg.read) AS member_read,
      bool_or(dmg.write) AS member_write,
      bool_or(dmg."delete") AS member_delete,
      bool_or(dmg.manage) AS member_manage
    FROM public.departments d
    LEFT JOIN public.department_role_grants drg
      ON drg.department_id = d.id
     AND drg.company_id = d.company_id
     AND drg.role_id = $3
    LEFT JOIN actor_member am ON true
    LEFT JOIN public.department_member_grants dmg
      ON dmg.department_id = d.id
     AND dmg.company_id = d.company_id
     AND dmg.member_id = am.id
    WHERE d.company_id = $1
    GROUP BY d.id
    `,
    [actor.companyId, actor.userId, actor.role],
  );

  return new Map(rows.map((row) => [
    row.id,
    {
      read: Boolean(row.assigned_read || row.role_read || row.member_read),
      write: Boolean(row.role_write || row.member_write),
      delete: Boolean(row.role_delete || row.member_delete),
      manage: Boolean(row.role_manage || row.member_manage),
    },
  ]));
}

export async function roleDepartmentGrantsSubset(actor: DepartmentActor, targetRoleId: RoleId): Promise<boolean> {
  if (isGlobalDepartmentActor(actor.role)) return true;
  const { rows } = await pool.query<{ department_id: string; read: boolean; write: boolean; delete: boolean; manage: boolean }>(
    `SELECT department_id, read, write, "delete" AS "delete", manage
       FROM public.department_role_grants
      WHERE company_id = $1
        AND role_id = $2
        AND (read = true OR write = true OR "delete" = true OR manage = true)`,
    [actor.companyId, targetRoleId],
  );

  for (const row of rows) {
    const actorAccess = await getDepartmentAccess(actor, row.department_id);
    if (!grantSubset({
      read: row.read,
      write: row.write,
      delete: row.delete,
      manage: row.manage,
    }, actorAccess)) {
      return false;
    }
  }
  return true;
}

export function requireDepartmentAccess(action: DepartmentAction, getDepartmentId: (req: any) => Promise<string | null> | string | null): RequestHandler {
  return async (req: any, res, next) => {
    const companyId = req.auth?.companyId;
    const role = req.auth?.role;
    const userId = req.auth?.userId;
    if (!companyId || !role || !userId) return res.status(403).json({ error: 'no_company' });

    const departmentId = await getDepartmentId(req);
    if (!departmentId) return res.status(404).json({ error: 'department_not_found' });

    const access = await getDepartmentAccess({ companyId, role, userId }, departmentId);
    if (!accessAllows(access, action)) return res.status(403).json({ error: 'department_forbidden' });
    req.departmentAccess = access;
    req.departmentId = departmentId;
    return next();
  };
}

export function requireTwinAndTeamWrite(): RequestHandler {
  return (req: any, res, next) => {
    const companyId = req.auth?.companyId;
    const role = req.auth?.role;
    if (!companyId || !role) return res.status(403).json({ error: 'no_company' });
    if (!can(role, companyId, 'twin', 'write') || !can(role, companyId, 'team', 'write')) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  };
}

export function canGrantProtectedRole(actorRole: RoleId | null | undefined, targetRole: RoleId): boolean {
  if (!isProtectedRole(targetRole)) return true;
  return actorRole === targetRole || actorRole === 'super_admin';
}
