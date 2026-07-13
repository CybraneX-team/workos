import type { RoleId } from '../rbac.js';
import { enqueueErpNextReconcile } from './erpnextOutbox.js';

export async function syncErpNextRolesForMember(companyId: string, _userId: string, _companyRole: RoleId): Promise<void> { await enqueueErpNextReconcile(companyId); }
export async function syncErpNextRolesForRole(companyId: string, _roleId: string): Promise<void> { await enqueueErpNextReconcile(companyId); }
export async function deprovisionErpNextUser(companyId: string, _userId: string): Promise<void> { await enqueueErpNextReconcile(companyId); }
export function startErpnextRoleReconciliationWorker(): void { /* reconciliation is owned by the outbox worker */ }
