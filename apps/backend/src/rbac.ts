import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { pool } from './db.js';
import {
  SYSTEM_ROLE_ORDER,
  expandPermissions,
  hasPermission,
  canAssignRole as canAssignRolePure,
  validatePermissionsInput as validatePermissionsInputPure,
  shapeRole as shapeRolePure,
} from '@cybranex/permissions';
import type {
  RbacAction,
  RbacModule,
  RoleId,
  ExpandedPermissions,
  RoleDefinition,
  ShapedRole,
} from '@cybranex/permissions';

/**
 * Backend RBAC glue. All permission *logic* lives in `@cybranex/permissions`;
 * this module owns only what the package can't: the DB-backed role cache, the
 * Express middleware, and thin wrappers that resolve a roleId to its cached
 * RoleDefinition before delegating to the package's pure functions.
 */

// Re-export the shared vocabulary so existing `import { ... } from './rbac.js'`
// call sites across the backend keep working unchanged.
export type {
  RbacAction,
  RbacModule,
  SystemRole,
  RoleId,
  PermissionSet,
  ExpandedPermissions,
  RoleDefinition,
  ShapedRole,
} from '@cybranex/permissions';
export {
  ACTIONS,
  MODULES,
  SYSTEM_ROLE_ORDER,
  PROTECTED_SYSTEM_ROLES,
  DEFAULT_MEMBER_ROLE,
  expandPermissions,
  serializePermissions,
  isSystemRole,
  isProtectedRole,
  hasPermission,
  permissionsSubset,
  shapeProfileRole,
  emptyPermissions,
  clonePermissions,
} from '@cybranex/permissions';

type RoleRow = {
  id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  permissions: unknown;
  is_system: boolean | null;
  is_archived: boolean | null;
  base_role_id: string | null;
  created_by: string | null;
  updated_by: string | null;
};

let rolesById = new Map<RoleId, RoleDefinition>();
let customRolesByCompany = new Map<string, Map<RoleId, RoleDefinition>>();

function normalizeRoleRow(row: RoleRow): RoleDefinition {
  const isSystem = row.is_system === true;
  if (isSystem && row.company_id !== null) {
    throw new Error(`RBAC system role ${row.id} cannot be company-scoped`);
  }
  if (!isSystem && !row.company_id) {
    throw new Error(`RBAC custom role ${row.id} must be company-scoped`);
  }

  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description,
    isSystem,
    isArchived: row.is_archived === true,
    baseRoleId: row.base_role_id,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    permissions: expandPermissions(row.permissions, row.id),
  };
}

function rebuildRoleCache(rows: RoleRow[]) {
  const nextById = new Map<RoleId, RoleDefinition>();
  const nextByCompany = new Map<string, Map<RoleId, RoleDefinition>>();

  for (const row of rows) {
    const role = normalizeRoleRow(row);
    if (role.isArchived) continue;
    nextById.set(role.id, role);
    if (role.companyId) {
      if (!nextByCompany.has(role.companyId)) nextByCompany.set(role.companyId, new Map());
      nextByCompany.get(role.companyId)!.set(role.id, role);
    }
  }

  for (const roleId of SYSTEM_ROLE_ORDER) {
    const role = nextById.get(roleId);
    if (!role || !role.isSystem) {
      throw new Error(`RBAC required system role ${roleId} is missing`);
    }
  }

  rolesById = nextById;
  customRolesByCompany = nextByCompany;
}

async function fetchRoleRows(): Promise<RoleRow[]> {
  const { rows } = await pool.query<RoleRow>(
    `
    SELECT id, company_id, name, description, permissions,
           is_system, is_archived, base_role_id, created_by, updated_by
      FROM public.roles
     WHERE COALESCE(is_archived, false) = false
     ORDER BY is_system DESC, name ASC
    `,
  );
  return rows;
}

export async function initializeRbac() {
  const rows = await fetchRoleRows();
  rebuildRoleCache(rows);
  console.log(`[rbac] loaded ${rows.length} active role definitions`);
}

// Roles change rarely (only via the /rbac/roles mutations), so a full reload is
// simpler than incremental per-company cache surgery and the cost is negligible.
// `companyId` is kept in the signature for call-site compatibility.
export async function refreshCompanyRoles(_companyId: string) {
  return initializeRbac();
}

export function getRoleDefinition(roleId: RoleId | null | undefined, companyId?: string | null): RoleDefinition | null {
  if (!roleId) return null;
  const role = rolesById.get(roleId);
  if (!role) return null;
  if (role.isSystem) return role;
  return role.companyId && companyId && role.companyId === companyId ? role : null;
}

export function listRoleDefinitions(companyId: string): RoleDefinition[] {
  const system = SYSTEM_ROLE_ORDER.map((roleId) => rolesById.get(roleId)).filter(Boolean) as RoleDefinition[];
  const custom = [...(customRolesByCompany.get(companyId)?.values() ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return [...system, ...custom];
}

/* ── cache-resolving wrappers (delegate all logic to the package) ─────── */

/** Resolve `roleId` in `companyId` and check `action` on `module`. */
export function can(
  roleId: RoleId | null | undefined,
  companyId: string | null | undefined,
  module: RbacModule,
  action: RbacAction,
): boolean {
  const role = getRoleDefinition(roleId, companyId);
  return hasPermission(role?.permissions, module, action);
}

export function canAssignRole(actorRoleId: RoleId | null | undefined, companyId: string, targetRoleId: RoleId): boolean {
  return canAssignRolePure(
    getRoleDefinition(actorRoleId, companyId),
    getRoleDefinition(targetRoleId, companyId),
  );
}

export function validatePermissionsInput(input: unknown, actorRoleId: RoleId, companyId: string): ExpandedPermissions {
  const actor = getRoleDefinition(actorRoleId, companyId);
  if (!actor) throw new Error('actor_role_not_found');
  return validatePermissionsInputPure(input, actor.permissions);
}

export function shapeRole(role: RoleDefinition, actorRoleId?: RoleId | null, companyId?: string | null): ShapedRole {
  if (actorRoleId && companyId) {
    return shapeRolePure(role, { actor: getRoleDefinition(actorRoleId, companyId) });
  }
  return shapeRolePure(role);
}

/* ── Express middleware ───────────────────────────────────────────────── */

export function requirePermission(module: RbacModule, action: RbacAction): RequestHandler {
  return (req, res, next) => {
    if (!can(req.auth?.role, req.auth?.companyId, module, action)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  };
}

export const requireTeamWrite = requirePermission('team', 'write');
export const requireTeamDelete = requirePermission('team', 'delete');

export function customRoleId(): string {
  return `custom_${crypto.randomUUID()}`;
}
