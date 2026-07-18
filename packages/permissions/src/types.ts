/**
 * Canonical RBAC / permission types shared by backend and frontend.
 * Previously hand-duplicated in apps/backend/src/rbac.ts,
 * apps/frontend/src/lib/db/rbac.ts and the e2e helper.
 */

export type RbacAction = 'read' | 'write' | 'delete' | 'approve' | 'execute';

export type RbacModule =
  | 'twin'
  | 'strategy'
  | 'analytics'
  | 'data'
  | 'benchmarks'
  | 'team'
  | 'ecosystem'
  | 'settings'
  | 'paid_media';

export type SystemRole =
  | 'super_admin'
  | 'founder'
  | 'co_founder'
  | 'admin'
  | 'analyst'
  | 'engineer'
  | 'viewer'
  | 'investor';

export type RoleId = string;

export type PermissionSet = Record<RbacAction, boolean>;
export type ExpandedPermissions = Record<RbacModule, PermissionSet>;

/** Raw (partial) permission shapes accepted from the DB / API before expansion. */
export type RawPermissionSet = Partial<Record<RbacAction, boolean>>;
export type RawPermissions = Record<string, RawPermissionSet>;

/** Full internal role record (as loaded from the DB). */
export interface RoleDefinition {
  id: RoleId;
  companyId: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  isArchived: boolean;
  baseRoleId: RoleId | null;
  createdBy: string | null;
  updatedBy: string | null;
  permissions: ExpandedPermissions;
}

/** API projection of a role — what `shapeRole` returns and the frontend consumes. */
export interface ShapedRole {
  id: RoleId;
  companyId: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  isArchived: boolean;
  baseRoleId: RoleId | null;
  permissions: ExpandedPermissions;
  assignable: boolean;
}

/** Projection used by the /me and /profile responses. */
export interface ProfileRoleProjection {
  role: RoleId;
  roleName: string;
  isSystemRole: boolean;
  permissions: ExpandedPermissions | null;
}

/* ── Department access axis (read/write/delete/manage per department) ── */

export type DepartmentAction = 'read' | 'write' | 'delete' | 'manage';
export type DepartmentAccess = Record<DepartmentAction, boolean>;

export interface DepartmentGrantInput {
  read?: boolean;
  write?: boolean;
  delete?: boolean;
  manage?: boolean;
}
