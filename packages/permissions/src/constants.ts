import type {
  RbacAction,
  RbacModule,
  SystemRole,
  DepartmentAction,
} from './types.js';

export const ACTIONS: RbacAction[] = ['read', 'write', 'delete', 'approve', 'execute'];

export const MODULES: RbacModule[] = [
  'twin',
  'strategy',
  'analytics',
  'data',
  'benchmarks',
  'team',
  'ecosystem',
  'settings',
  'paid_media',
];

/** Actions that are meaningful for each module. Unsupported actions stay false. */
export const MODULE_ACTIONS: Record<RbacModule, readonly RbacAction[]> = {
  twin: ['read', 'write', 'delete'],
  strategy: ['read', 'write', 'delete'],
  analytics: ['read', 'write', 'delete'],
  data: ['read', 'write', 'delete'],
  benchmarks: ['read', 'write', 'delete'],
  team: ['read', 'write', 'delete'],
  ecosystem: ['read', 'write', 'delete'],
  settings: ['read', 'write', 'delete'],
  paid_media: ['read', 'write', 'approve', 'execute'],
};

export function moduleSupportsAction(module: RbacModule, action: RbacAction): boolean {
  return MODULE_ACTIONS[module].includes(action);
}

/** System roles in canonical display / precedence order. */
export const SYSTEM_ROLE_ORDER: SystemRole[] = [
  'super_admin',
  'founder',
  'co_founder',
  'admin',
  'analyst',
  'engineer',
  'viewer',
  'investor',
];

export const PROTECTED_SYSTEM_ROLES: SystemRole[] = ['super_admin', 'founder'];

export const DEFAULT_MEMBER_ROLE: SystemRole = 'viewer';

export const DEPARTMENT_ACTIONS: DepartmentAction[] = ['read', 'write', 'delete', 'manage'];

/** Roles assignable to ordinary members (excludes protected system roles). */
export const ASSIGNABLE_MEMBER_ROLES: SystemRole[] = [
  'co_founder',
  'admin',
  'analyst',
  'engineer',
  'viewer',
  'investor',
];

export const MODULE_SET: ReadonlySet<string> = new Set<string>(MODULES);
export const ACTION_SET: ReadonlySet<string> = new Set<string>(ACTIONS);
export const SYSTEM_ROLE_SET: ReadonlySet<string> = new Set<string>(SYSTEM_ROLE_ORDER);
export const PROTECTED_ROLE_SET: ReadonlySet<string> = new Set<string>(PROTECTED_SYSTEM_ROLES);
