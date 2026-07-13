/**
 * Normalize department payloads between the BDT frontend and REST API.
 * Keeps stable framework ids (dept_engineering) for trails and interrelated links.
 */
import type { UExternalNode } from './bdtPolytopeData';
import { getFrameworkDepartments, getDepartmentColors } from './bdtCatalog';

export type ApiDepartment = UExternalNode & { source_key?: string };

function resolveFrameworkId(dept: ApiDepartment): string {
  if (dept.source_key?.startsWith('dept_')) return dept.source_key;
  if (dept.id.startsWith('dept_')) return dept.id;
  const norm = dept.label.toLowerCase().trim();
  const framework = getFrameworkDepartments();
  const match =
    framework.find(d => d.id === dept.id) ??
    framework.find(d => d.label.toLowerCase().trim() === norm);
  return match?.id ?? dept.id;
}

/** GET /api/departments — map API rows back to framework ids; no seed hydration. */
export function normalizeDepartmentFromApi(dept: ApiDepartment): UExternalNode {
  const id = resolveFrameworkId(dept);
  return {
    ...dept,
    id,
    color: dept.color ?? getDepartmentColors()[id],
  };
}

export function normalizeDepartmentsFromApi(departments: ApiDepartment[]): UExternalNode[] {
  return departments.map(normalizeDepartmentFromApi);
}
