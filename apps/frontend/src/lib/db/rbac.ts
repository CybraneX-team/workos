import { api } from '../api';
import type {
  RoleId,
  ExpandedPermissions,
  DepartmentAccess,
  ShapedRole,
} from '@cybranex/permissions';

/**
 * Frontend RBAC data layer. All shared vocabulary + pure permission logic now
 * lives in `@cybranex/permissions`; this module keeps only the HTTP wrappers
 * that talk to the backend `/api/rbac/*` routes, and re-exports the shared
 * pieces its consumers import from here.
 */

// Re-export shared constants + pure helpers.
export {
  ACTIONS,
  MODULES,
  DEPARTMENT_ACTIONS,
  SYSTEM_ROLE_ORDER,
  PROTECTED_SYSTEM_ROLES,
  emptyPermissions,
  hasPermission,
  moduleSupportsAction,
  clonePermissions,
  isSystemRole,
  isProtectedRole,
} from '@cybranex/permissions';

// Re-export shared types.
export type {
  RbacAction,
  RbacModule,
  SystemRole,
  RoleId,
  PermissionSet,
  ExpandedPermissions,
  DepartmentAction,
  DepartmentAccess,
} from '@cybranex/permissions';

// The frontend consumes roles in their API-shaped form (with `assignable`).
export type { ShapedRole as RoleDefinition } from '@cybranex/permissions';

/* ── API response shapes (frontend-only) ─────────────────────────────── */

export interface DepartmentAccessDepartment {
  id: string;
  label: string;
  access: DepartmentAccess;
}

export interface DepartmentRoleGrant extends DepartmentAccess {
  department_id: string;
  role_id: RoleId;
}

export interface DepartmentMemberGrant extends DepartmentAccess {
  department_id: string;
  member_id: string;
}

export interface DepartmentAccessResponse {
  departments: DepartmentAccessDepartment[];
  roleGrants: DepartmentRoleGrant[];
  memberGrants: DepartmentMemberGrant[];
}

/* ── HTTP wrappers ───────────────────────────────────────────────────── */

export async function fetchRbacRoles(): Promise<ShapedRole[]> {
  const { roles } = await api.get<{ roles: ShapedRole[] }>('/api/rbac/roles');
  return roles;
}

export async function createCustomRole(input: {
  name: string;
  description?: string | null;
  sourceRoleId: RoleId;
  permissions: ExpandedPermissions;
}): Promise<ShapedRole> {
  const { role } = await api.post<{ role: ShapedRole }>('/api/rbac/roles', input);
  return role;
}

export async function updateCustomRole(
  roleId: RoleId,
  patch: { name?: string; description?: string | null; permissions?: ExpandedPermissions },
): Promise<ShapedRole> {
  const { role } = await api.patch<{ role: ShapedRole }>(`/api/rbac/roles/${roleId}`, patch);
  return role;
}

export async function archiveCustomRole(roleId: RoleId): Promise<boolean> {
  await api.post(`/api/rbac/roles/${roleId}/archive`, {});
  return true;
}

export async function fetchDepartmentAccess(): Promise<DepartmentAccessResponse> {
  return api.get<DepartmentAccessResponse>('/api/rbac/department-access');
}

export async function saveDepartmentRoleGrant(departmentId: string, roleId: RoleId, grant: DepartmentAccess): Promise<void> {
  await api.put(`/api/rbac/departments/${departmentId}/role-grants/${roleId}`, grant);
}

export async function deleteDepartmentRoleGrant(departmentId: string, roleId: RoleId): Promise<void> {
  await api.delete(`/api/rbac/departments/${departmentId}/role-grants/${roleId}`);
}

export async function saveDepartmentMemberGrant(departmentId: string, memberId: string, grant: DepartmentAccess): Promise<void> {
  await api.put(`/api/rbac/departments/${departmentId}/member-grants/${memberId}`, grant);
}

export async function deleteDepartmentMemberGrant(departmentId: string, memberId: string): Promise<void> {
  await api.delete(`/api/rbac/departments/${departmentId}/member-grants/${memberId}`);
}
