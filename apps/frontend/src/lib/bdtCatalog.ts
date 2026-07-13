/**
 * BDT catalog client — fetches the canonical taxonomy from the backend
 * (GET /api/bdt/catalog) and exposes it to the frontend.
 *
 * The backend owns this data (startup_digital_twin_backend/src/data/bdtCatalog.ts);
 * the frontend must NOT hardcode framework departments, colors, Level-1 defs, or
 * size configs. Use the sync getters (cache-backed) in non-React code and the
 * useBdtCatalog() hook in components.
 */
import { useEffect, useState } from 'react';
import { api } from './api';
// Canonical enums/shapes now live in @cybranex/shared-types — this file previously hardcoded
// Domain/BranchKind directly, contradicting its own comment above ("the frontend must NOT
// hardcode..."). Kept as local aliases so existing call sites (CatalogDeptMeta, etc.) are
// unchanged.
import type {
  Domain, BranchKind,
  DeptMeta as CatalogDeptMeta,
  DeptLevel1Def as CatalogLevel1Def,
  SizeConfig as CatalogSizeConfig,
} from '@cybranex/shared-types';
export type { Domain, BranchKind, CatalogDeptMeta, CatalogLevel1Def, CatalogSizeConfig };

export interface BdtCatalog {
  departments: CatalogDeptMeta[];
  level1: Record<string, CatalogLevel1Def[]>;
  enums: {
    domains: string[];
    nodeTypes: string[];
    branchKinds: string[];
    nodeLevels: string[];
    branchKindLabels: Record<string, string>;
  };
  sizeConfigs: Record<string, CatalogSizeConfig>;
}

const LS_KEY = 'bdt_catalog_v2';

function primeFromStorage(): BdtCatalog | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as BdtCatalog) : null;
  } catch {
    return null;
  }
}

let cache: BdtCatalog | null = primeFromStorage();
let inflight: Promise<BdtCatalog> | null = null;

/** Fetch (once) the catalog; memoized. Falls back to the last cached copy on failure. */
export async function loadBdtCatalog(force = false): Promise<BdtCatalog> {
  if (cache && !force) return cache;
  if (inflight) return inflight;
  inflight = api
    .get<BdtCatalog>('/api/bdt/catalog')
    .then((data) => {
      cache = data;
      try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* ignore quota */ }
      inflight = null;
      return data;
    })
    .catch((err) => {
      inflight = null;
      if (cache) return cache;
      throw err;
    });
  return inflight;
}

export function getCatalog(): BdtCatalog | null {
  return cache;
}

/** Framework departments (id/label/domain/cluster/score/color/metrics). Empty until loaded. */
export function getFrameworkDepartments(): CatalogDeptMeta[] {
  return cache?.departments ?? [];
}

/** Map of deptId → accent color, derived from the framework departments. */
export function getDepartmentColors(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of cache?.departments ?? []) map[d.id] = d.color;
  return map;
}

export function getSizeConfigs(): Record<string, CatalogSizeConfig> {
  return cache?.sizeConfigs ?? {};
}

export function getDeptLevel1(): Record<string, CatalogLevel1Def[]> {
  return cache?.level1 ?? {};
}

/** React hook — returns the catalog, triggering a one-time load and re-render when ready. */
export function useBdtCatalog(): BdtCatalog | null {
  const [value, setValue] = useState<BdtCatalog | null>(getCatalog());
  useEffect(() => {
    let mounted = true;
    loadBdtCatalog()
      .then((c) => { if (mounted) setValue(c); })
      .catch(() => { /* keep whatever we have */ });
    return () => { mounted = false; };
  }, []);
  return value;
}
