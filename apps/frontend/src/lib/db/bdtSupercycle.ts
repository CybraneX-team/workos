import { api } from '../api';

export type SupercycleNode = { id: string; label: string; nodeType: string; nodeLevel: string; workspaceKind: string | null; order?: number };
export type SupercycleDepartment = { id: string; label: string; order?: number; nodes: SupercycleNode[] };
export type SupercycleRoute = { id: string; label: string; color: string; order?: number; departmentIds: string[] };
export type BdtSupercycle = { configured: boolean; departments: SupercycleDepartment[]; routes: SupercycleRoute[]; canEdit: boolean; availableDepartments: SupercycleDepartment[] };
export type BdtSupercycleInput = { departments: Array<{ departmentId: string; nodeIds: string[] }>; routes: Array<{ label: string; color: string; departmentIds: string[] }> };

export const bdtSupercycle = {
  get: () => api.get<BdtSupercycle>('/api/bdt/supercycle'),
  save: (body: BdtSupercycleInput) => api.put<BdtSupercycle>('/api/bdt/supercycle', body),
  remove: () => api.delete<void>('/api/bdt/supercycle'),
};
