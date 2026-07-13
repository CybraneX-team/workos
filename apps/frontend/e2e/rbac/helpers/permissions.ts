import {
  MODULES,
  hasPermission,
  SYSTEM_ROLE_PERMISSIONS,
} from '@cybranex/permissions';
import type {
  RbacAction,
  RbacModule,
  SystemRole,
  ExpandedPermissions,
} from '@cybranex/permissions';

/**
 * RBAC e2e expectations. The system-role permission matrix is NO LONGER
 * hardcoded here — it comes from `SYSTEM_ROLE_PERMISSIONS`, the single source of
 * truth shared with the backend runtime and the SQL seed. This file keeps only
 * the e2e-specific role groupings and route contracts.
 */

export { MODULES };
export type { ExpandedPermissions };

export type DbBackedRole = SystemRole;

/** The system-role permission matrix under test (shared source of truth). */
export const ROLE_PERMISSIONS: Record<SystemRole, ExpandedPermissions> = SYSTEM_ROLE_PERMISSIONS;

/** Does `role` grant `action` on `module`, per the shared matrix? */
export function can(role: SystemRole, module: RbacModule, action: RbacAction): boolean {
  return hasPermission(SYSTEM_ROLE_PERMISSIONS[role], module, action);
}

export const DB_BACKED_ROLES: SystemRole[] = [
  'super_admin',
  'founder',
  'co_founder',
  'admin',
  'analyst',
  'engineer',
  'viewer',
  'investor',
];

export const TEAM_WRITE_ROLES: SystemRole[] = [
  'super_admin',
  'founder',
  'co_founder',
  'admin',
];

export const READ_ONLY_TEAM_ROLES: SystemRole[] = [
  'analyst',
  'engineer',
  'viewer',
  'investor',
];

export const ROUTE_CONTRACTS: Array<{
  path: string;
  module: RbacModule;
  action: RbacAction;
}> = [
  { path: '/twin/strategy',        module: 'strategy',   action: 'read'  },
  { path: '/twin/data',            module: 'data',        action: 'write' },
  { path: '/twin/benchmarks',      module: 'benchmarks',  action: 'read'  },
  { path: '/twin/team',            module: 'team',        action: 'read'  },
  { path: '/twin/analytics',       module: 'analytics',   action: 'read'  },
  { path: '/ecosystem/vc-connect', module: 'ecosystem',   action: 'read'  },
  { path: '/ecosystem/network',    module: 'ecosystem',   action: 'read'  },
  { path: '/settings',             module: 'settings',    action: 'read'  },
];
