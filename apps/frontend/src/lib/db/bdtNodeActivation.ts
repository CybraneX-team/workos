import { api } from '../api';

export interface ActiveNodeKey {
  departmentSourceKey: string;
  /** Stable department_bdt_nodes.source_key for new bindings. */
  nodeSourceKey?: string;
  /** Temporary compatibility fields for ERP/demo adapters not yet source-keyed. */
  level1Label?: string;
  branchLabel?: string;
}

export interface ActiveNodesResponse {
  active: ActiveNodeKey[];
  erpConnected: boolean;
}

export function fetchActiveBdtNodeKeys() {
  return api.get<ActiveNodesResponse>('/api/bdt/active-nodes');
}

export function activeNodeKeyId(key: ActiveNodeKey): string {
  if (key.nodeSourceKey) return `${key.departmentSourceKey}::${key.nodeSourceKey}`;
  if (!key.level1Label || !key.branchLabel) return '';
  return `${key.departmentSourceKey}::${key.level1Label}::${key.branchLabel}`;
}

export function buildActiveKeySet(response: ActiveNodesResponse | null | undefined): Set<string> {
  if (!response) return new Set();
  return new Set(response.active.map(activeNodeKeyId).filter(Boolean));
}
