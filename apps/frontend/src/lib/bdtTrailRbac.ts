import type { UExternalNode } from './bdtPolytopeData';

export function canReadDept(dept?: UExternalNode | null): boolean {
  if (!dept) return false;
  // API-backed depts must have explicit read; seed without access → allow (dev/demo)
  if (dept.access) return dept.access.read === true;
  return true;
}

export function canWriteDept(dept?: UExternalNode | null): boolean {
  if (!dept) return false;
  if (dept.access) return dept.access.write === true;
  return true;
}

export function canDeleteDept(dept?: UExternalNode | null): boolean {
  if (!dept) return false;
  if (dept.access) return dept.access.delete === true;
  return true;
}

/** Interrelated list filtered for UI and navigation */
export function filterReadableDepartments(
  deptIds: string[],
  allDepartments: UExternalNode[],
): UExternalNode[] {
  return deptIds
    .map(id => allDepartments.find(d => d.id === id))
    .filter((d): d is UExternalNode => !!d && canReadDept(d));
}

/** Asserts read access for all departments in a trail session */
export function assertTrailAccess(
  session: { anchor: { deptId: string; deptLabel?: string }; stops: { deptId: string; deptLabel?: string }[] } | null,
  departments: UExternalNode[]
): { ok: boolean; reason?: string } {
  if (!session) return { ok: false, reason: 'No session' };
  const anchorDept = departments.find(d => d.id === session.anchor.deptId);
  if (!canReadDept(anchorDept)) {
    return { ok: false, reason: `Access denied to anchor department ${session.anchor.deptLabel || session.anchor.deptId}` };
  }
  for (const stop of session.stops) {
    const stopDept = departments.find(d => d.id === stop.deptId);
    if (!canReadDept(stopDept)) {
      return { ok: false, reason: `Access denied to department ${stop.deptLabel || stop.deptId}` };
    }
  }
  return { ok: true };
}
