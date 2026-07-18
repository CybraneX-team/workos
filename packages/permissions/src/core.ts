import type {
  RbacAction,
  RbacModule,
  SystemRole,
  RoleId,
  PermissionSet,
  ExpandedPermissions,
  RawPermissions,
  RoleDefinition,
  ShapedRole,
  ProfileRoleProjection,
} from './types.js';
import {
  ACTIONS,
  MODULES,
  MODULE_SET,
  ACTION_SET,
  moduleSupportsAction,
  SYSTEM_ROLE_SET,
  PROTECTED_ROLE_SET,
  DEFAULT_MEMBER_ROLE,
} from './constants.js';

/* ── construction / cloning ──────────────────────────────────────────── */

export function emptyPermissions(): ExpandedPermissions {
  return Object.fromEntries(
    MODULES.map((module) => [
      module,
      Object.fromEntries(ACTIONS.map((action) => [action, false])) as PermissionSet,
    ]),
  ) as ExpandedPermissions;
}

export function clonePermissions(permissions: ExpandedPermissions): ExpandedPermissions {
  return Object.fromEntries(
    MODULES.map((module) => [module, { ...permissions[module] }]),
  ) as ExpandedPermissions;
}

/* ── DB (raw) <-> expanded conversion ────────────────────────────────── */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate and expand a raw permissions object (as stored in the DB, possibly
 * using the `*` wildcard module) into a fully-populated ExpandedPermissions.
 * Throws on unknown modules/actions or non-boolean values.
 */
export function expandPermissions(raw: unknown, roleId = 'unknown'): ExpandedPermissions {
  if (!isPlainObject(raw)) {
    throw new Error(`RBAC role ${roleId} has invalid permissions`);
  }

  const expanded = emptyPermissions();
  for (const [moduleName, actions] of Object.entries(raw)) {
    if (moduleName !== '*' && !MODULE_SET.has(moduleName)) {
      throw new Error(`RBAC role ${roleId} has unknown module ${moduleName}`);
    }
    if (!isPlainObject(actions)) {
      throw new Error(`RBAC role ${roleId} has invalid action map for ${moduleName}`);
    }

    for (const [actionName, value] of Object.entries(actions)) {
      if (!ACTION_SET.has(actionName)) {
        throw new Error(`RBAC role ${roleId} has unknown action ${actionName}`);
      }
      if (typeof value !== 'boolean') {
        throw new Error(`RBAC role ${roleId} has non-boolean permission ${moduleName}.${actionName}`);
      }

      if (moduleName === '*') {
        for (const module of MODULES) {
          if (moduleSupportsAction(module, actionName as RbacAction)) {
            expanded[module][actionName as RbacAction] = value;
          }
        }
      } else {
        const module = moduleName as RbacModule;
        const action = actionName as RbacAction;
        if (!moduleSupportsAction(module, action)) {
          if (value) throw new Error(`RBAC role ${roleId} grants unsupported permission ${moduleName}.${actionName}`);
          continue;
        }
        expanded[module][action] = value;
      }
    }
  }

  return expanded;
}

export function serializePermissions(permissions: ExpandedPermissions): RawPermissions {
  const raw: RawPermissions = {};
  for (const module of MODULES) {
    raw[module] = { ...permissions[module] };
  }
  return raw;
}

/* ── role classification ─────────────────────────────────────────────── */

export function isSystemRole(roleId: unknown): roleId is SystemRole {
  return typeof roleId === 'string' && SYSTEM_ROLE_SET.has(roleId);
}

export function isProtectedRole(roleId: unknown): roleId is SystemRole {
  return typeof roleId === 'string' && PROTECTED_ROLE_SET.has(roleId);
}

/* ── permission checks (pure — operate on resolved permissions) ───────── */

/**
 * Does an already-resolved permission set grant `action` on `module`?
 * This is the pure primitive both apps use; the backend resolves a roleId to
 * its permissions first (via its cache) and then calls this.
 */
export function hasPermission(
  permissions: ExpandedPermissions | null | undefined,
  module: RbacModule,
  action: RbacAction,
): boolean {
  return permissions?.[module]?.[action] ?? false;
}

/** Alias of {@link hasPermission} — reads naturally at call sites. */
export const can = hasPermission;

/** Is every permission `candidate` grants also granted by `actor`? */
export function permissionsSubset(candidate: ExpandedPermissions, actor: ExpandedPermissions): boolean {
  for (const module of MODULES) {
    for (const action of ACTIONS) {
      if (candidate[module][action] && !actor[module][action]) return false;
    }
  }
  return true;
}

/* ── role assignment (pure — operate on resolved RoleDefinitions) ─────── */

/**
 * Can an actor (by its resolved permissions) assign `target`?
 * The backend resolves actor/target roleIds to definitions before calling.
 * Returns false for protected or archived targets, or when the target grants
 * anything the actor lacks (no privilege escalation).
 */
export function canAssignRole(
  actor: RoleDefinition | null | undefined,
  target: RoleDefinition | null | undefined,
): boolean {
  if (!target || isProtectedRole(target.id) || target.isArchived) return false;
  if (!actor) return false;
  return permissionsSubset(target.permissions, actor.permissions);
}

/** Whether `role` is assignable by an actor with the given resolved definition. */
export function roleIsAssignableBy(
  actor: RoleDefinition | null | undefined,
  role: RoleDefinition,
): boolean {
  if (isProtectedRole(role.id) || role.isArchived) return false;
  return Boolean(actor && permissionsSubset(role.permissions, actor.permissions));
}

/**
 * Validate a custom-role permissions payload against the actor's own
 * permissions (already resolved). Throws `permission_escalation` if the input
 * grants anything the actor lacks. The caller is responsible for ensuring the
 * actor role resolved (throw `actor_role_not_found` before calling if not).
 */
export function validatePermissionsInput(
  input: unknown,
  actorPermissions: ExpandedPermissions,
): ExpandedPermissions {
  const permissions = expandPermissions(input, 'custom-input');
  if (!permissionsSubset(permissions, actorPermissions)) {
    throw new Error('permission_escalation');
  }
  return permissions;
}

/* ── projections ─────────────────────────────────────────────────────── */

/**
 * Project a role into its API shape.
 *
 * `assignable` mirrors the original backend semantics exactly:
 *  - when actor context is provided (`options` present, even if `options.actor`
 *    is null) → `roleIsAssignableBy(options.actor, role)` (unresolved actor → false);
 *  - when no actor context is provided (`options` omitted) → falls back to
 *    "any non-protected role".
 */
export function shapeRole(
  role: RoleDefinition,
  options?: { actor: RoleDefinition | null },
): ShapedRole {
  return {
    id: role.id,
    companyId: role.companyId,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    isArchived: role.isArchived,
    baseRoleId: role.baseRoleId,
    permissions: role.permissions,
    assignable: options
      ? roleIsAssignableBy(options.actor, role)
      : !isProtectedRole(role.id),
  };
}

/** Role projection for /me and /profile — falls back to viewer defaults. */
export function shapeProfileRole(role: RoleDefinition | null): ProfileRoleProjection {
  return {
    role: role?.id ?? DEFAULT_MEMBER_ROLE,
    roleName: role?.name ?? 'Viewer',
    isSystemRole: role?.isSystem ?? true,
    permissions: role?.permissions ?? null,
  };
}
