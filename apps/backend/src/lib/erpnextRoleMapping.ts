import { pool } from '../db.js';
import type { RoleId } from '../rbac.js';
import { getDepartmentAccessMap, type DepartmentActor } from '../departmentAccess.js';
import type { Domain } from '../data/bdtCatalog.js';

// departments.domain is a fixed CHECK-constrained enum (matches Domain in
// data/bdtCatalog.ts, and baseline_schema.sql's CHECK constraint) — exhaustive,
// not a fuzzy keyword match.
const DOMAIN_ROLES: Record<Domain, { user: string[]; manager: string[] }> = {
  direction: { user: [], manager: [] }, // leadership — covered by company-wide role below, not a department grant
  build: { user: ['Item Manager'], manager: ['Item Manager'] }, // Frappe has no separate manager tier here
  delivery: {
    user: ['Stock User', 'Purchase User', 'Delivery User'],
    manager: ['Stock Manager', 'Purchase Manager', 'Delivery Manager'],
  },
  market: { user: ['Sales User'], manager: ['Sales Manager'] },
  control: { user: ['Accounts User'], manager: ['Accounts Manager'] },
  people: { user: ['HR User'], manager: ['HR Manager'] },
};

const ALL_MANAGER_ROLES = Object.values(DOMAIN_ROLES).flatMap((d) => d.manager);

// Phase 0 decision: viewer/investor never get a Frappe identity at all — they
// keep getting ERPNext data the read-only way they already do, through
// WorkOS's own UI. Returns null for "no Frappe access", [] is a valid (if
// unusual) "System User with zero roles" outcome for admin/analyst/engineer
// with no department grants at all.
export async function computeFrappeRoles(companyId: string, userId: string, companyRole: RoleId): Promise<string[] | null> {
  if (companyRole === 'viewer' || companyRole === 'investor') return null;

  if (companyRole === 'super_admin' || companyRole === 'founder') {
    return Array.from(new Set(['System Manager', ...ALL_MANAGER_ROLES]));
  }
  if (companyRole === 'co_founder') {
    return Array.from(new Set(ALL_MANAGER_ROLES));
  }

  // admin / analyst / engineer: driven entirely by department grants.
  const actor: DepartmentActor = { userId, companyId, role: companyRole };
  const accessMap = await getDepartmentAccessMap(actor);

  const { rows: departments } = await pool.query<{ id: string; domain: Domain }>(
    `select id, domain from public.departments where company_id = $1`,
    [companyId],
  );

  const roles = new Set<string>();
  for (const dept of departments) {
    const access = accessMap.get(dept.id);
    if (!access?.read) continue;
    const cluster = DOMAIN_ROLES[dept.domain];
    if (!cluster) continue;
    const tier = access.write || access.manage ? cluster.manager : cluster.user;
    tier.forEach((role) => roles.add(role));
  }
  return Array.from(roles);
}
