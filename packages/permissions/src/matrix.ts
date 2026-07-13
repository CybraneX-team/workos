import type { RbacAction, RbacModule, SystemRole, ExpandedPermissions } from './types.js';
import { MODULES, ACTIONS } from './constants.js';

type PartialMatrix = Partial<Record<RbacModule, Partial<Record<RbacAction, boolean>>>>;

function expand(partial: PartialMatrix): ExpandedPermissions {
  return Object.fromEntries(
    MODULES.map((module) => [
      module,
      Object.fromEntries(
        ACTIONS.map((action) => [action, partial[module]?.[action] ?? false]),
      ),
    ]),
  ) as ExpandedPermissions;
}

const allModules = (set: { read: boolean; write: boolean; delete: boolean }): PartialMatrix =>
  Object.fromEntries(MODULES.map((module) => [module, set])) as PartialMatrix;

/**
 * The single source of truth for system-role permissions.
 *
 * Consumed by:
 *  - the RBAC e2e suite (replaces its hardcoded ROLE_PERMISSIONS), and
 *  - the SQL seed generator (`gen:rbac-seed`), which renders
 *    baseline_reference_seed.sql's role INSERTs from this constant.
 *
 * Keep this and the DB seed in lockstep — the drift test enforces it.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, ExpandedPermissions> = {
  super_admin: expand(allModules({ read: true, write: true, delete: true })),
  founder: expand({
    twin:       { read: true, write: true },
    strategy:   { read: true, write: true, delete: true },
    analytics:  { read: true, write: true },
    data:       { read: true, write: true },
    benchmarks: { read: true },
    team:       { read: true, write: true, delete: true },
    ecosystem:  { read: true, write: true },
    settings:   { read: true, write: true },
  }),
  co_founder: expand({
    twin:       { read: true, write: true },
    strategy:   { read: true, write: true, delete: true },
    analytics:  { read: true, write: true },
    data:       { read: true, write: true },
    benchmarks: { read: true },
    team:       { read: true, write: true },
    ecosystem:  { read: true, write: true },
    settings:   { read: true },
  }),
  admin: expand({
    twin:       { read: true, write: true },
    strategy:   { read: true, write: true },
    analytics:  { read: true, write: true },
    data:       { read: true, write: true },
    benchmarks: { read: true },
    team:       { read: true, write: true },
    ecosystem:  { read: true },
    settings:   { read: true },
  }),
  analyst: expand({
    twin:       { read: true },
    strategy:   { read: true, write: true },
    analytics:  { read: true, write: true },
    data:       { read: true },
    benchmarks: { read: true },
    team:       { read: true },
    ecosystem:  { read: true },
  }),
  engineer: expand({
    twin:       { read: true },
    strategy:   { read: true },
    analytics:  { read: true },
    data:       { read: true, write: true },
    benchmarks: { read: true },
    team:       { read: true },
  }),
  viewer: expand({
    twin:       { read: true },
    strategy:   { read: true },
    analytics:  { read: true },
    data:       { read: true },
    benchmarks: { read: true },
    team:       { read: true },
    ecosystem:  { read: true },
  }),
  investor: expand({
    twin:       { read: true },
    analytics:  { read: true },
    benchmarks: { read: true },
    team:       { read: true },
  }),
};

/** Human-readable metadata for each system role (name + description), matching the DB seed. */
export const SYSTEM_ROLE_META: Record<SystemRole, { name: string; description: string }> = {
  super_admin: { name: 'Super Admin', description: 'Platform-level administrator' },
  founder:     { name: 'Founder',     description: 'Company founder' },
  co_founder:  { name: 'Co-Founder',  description: 'Company co-founder' },
  admin:       { name: 'Admin',       description: 'Team administrator' },
  analyst:     { name: 'Analyst',     description: 'Strategy and analytics contributor' },
  engineer:    { name: 'Engineer',    description: 'Data and technical contributor' },
  viewer:      { name: 'Viewer',      description: 'Read-only team member' },
  investor:    { name: 'Investor',    description: 'Investor-facing read-only role' },
};
