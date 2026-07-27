import { api } from '../api';

export interface ActiveNodeKey {
  departmentSourceKey: string;
  /** Immutable V2 taxonomy branch source key. */
  nodeSourceKey: string;
}

export interface ActiveNodesResponse {
  active: ActiveNodeKey[];
  erpConnected: boolean;
}

export function fetchActiveBdtNodeKeys() {
  return api.get<ActiveNodesResponse>('/api/bdt/active-nodes');
}

export function activeNodeKeyId(key: ActiveNodeKey): string {
  return `${key.departmentSourceKey}::${key.nodeSourceKey}`;
}

export function buildActiveKeySet(response: ActiveNodesResponse | null | undefined): Set<string> {
  if (!response) return new Set();
  return new Set(response.active.map(activeNodeKeyId).filter(Boolean));
}
