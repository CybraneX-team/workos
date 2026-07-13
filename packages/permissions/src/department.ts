import type {
  RoleId,
  DepartmentAction,
  DepartmentAccess,
  DepartmentGrantInput,
} from './types.js';
import { DEPARTMENT_ACTIONS } from './constants.js';

export function emptyDepartmentAccess(): DepartmentAccess {
  return { read: false, write: false, delete: false, manage: false };
}

/** Founders and super-admins have implicit full access to every department. */
export function isGlobalDepartmentActor(role: RoleId | null | undefined): boolean {
  return role === 'founder' || role === 'super_admin';
}

export function normalizeDepartmentGrant(input: unknown): DepartmentAccess {
  const source = input && typeof input === 'object' ? (input as DepartmentGrantInput) : {};
  return {
    read: source.read === true,
    write: source.write === true,
    delete: source.delete === true,
    manage: source.manage === true,
  };
}

export function accessAllows(access: DepartmentAccess, action: DepartmentAction): boolean {
  return access[action] === true;
}

/** Is every action `candidate` grants also granted by `actor`? */
export function grantSubset(candidate: DepartmentAccess, actor: DepartmentAccess): boolean {
  return DEPARTMENT_ACTIONS.every((action) => !candidate[action] || actor[action]);
}
