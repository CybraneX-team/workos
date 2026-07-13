import { api } from '../api';
import type { UExternalNode, UInternalNode } from '../bdtPolytopeData';

export async function getBdtDepartments(): Promise<UExternalNode[]> {
  const response = await api.get<{ departments: UExternalNode[] }>('/api/departments');
  return response.departments ?? [];
}

export async function getBdtDepartment(departmentId: string): Promise<UExternalNode> {
  const response = await api.get<{ department: UExternalNode }>(`/api/departments/${departmentId}`);
  return response.department;
}

export async function createBdtNode(
  departmentId: string,
  node: Omit<UInternalNode, 'id' | 'children'> & { parentNodeId?: string },
): Promise<{ nodeId: string; departments: UExternalNode[] }> {
  return api.post(`/api/departments/${departmentId}/nodes`, node);
}

export async function updateBdtNode(
  nodeId: string,
  updates: Partial<Omit<UInternalNode, 'id' | 'children'>>,
): Promise<{ departments: UExternalNode[] }> {
  return api.patch(`/api/departments/nodes/${nodeId}`, updates);
}

export async function deleteBdtNode(nodeId: string): Promise<{ departments: UExternalNode[] }> {
  return api.delete(`/api/departments/nodes/${nodeId}`);
}
