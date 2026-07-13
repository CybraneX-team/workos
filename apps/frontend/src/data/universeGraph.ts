/* ================================================================
   WorkOS — Universe Graph Builder
   Produces the UniverseData shape consumed by the
   /3d UniverseController. All data is fetched from Supabase:
     • industries        → lib/db/industries.ts
     • subdomains        → lib/db/subdomains.ts
     • catalog_companies → lib/db/catalogCompanies.ts  (pre-seeded universe)
     • companies         → lib/db/companies.ts          (live user companies)
================================================================ */

import { useEffect, useMemo, useState } from 'react';
import { getAllIndustries, type DbIndustry } from '../lib/db/industries';
import { getAllSubdomains, type DbSubdomain } from '../lib/db/subdomains';
import { getActiveCompanies } from '../lib/db/companies';
import { getAllLocalCompanies } from '../lib/localCompanies';
import { listReferenceCompanies, type ReferenceCompany } from '../lib/db/referenceCompanies';
import type { DbCompany } from '../lib/supabase';

/* ──────────────────────────────────────────────────
   UniverseData — exactly what UniverseController consumes
────────────────────────────────────────────────── */
export interface UniverseCompany {
  id: string;
  name: string;
  description?: string;
  founded?: number;
  funding?: string;
  employees?: number;
  stage?: string;
  isLive: boolean;
  referenceCompanyId?: string;
  departments?: { id: string; name: string; headcount?: number; focus?: string; metrics?: Record<string, number> }[];
  raw?: DbCompany;
}

export interface UniverseSubdomain {
  id: string;
  name: string;
  description?: string;
  orbit_index: number;
  color?: string;
  companies: UniverseCompany[];
}

export interface UniverseIndustry {
  id: string;
  name: string;
  description?: string;
  color: string;
  angle: number;
  subdomains: UniverseSubdomain[];
  // position exposed for 3D controller
  position3D?: [number, number, number];
  bubbleRadius?: number;
}

export interface UniverseData {
  industries: UniverseIndustry[];
  myCompanyNodeId: string | null;
}

/* ──────────────────────────────────────────────────
   Pure builder — testable without React
────────────────────────────────────────────────── */
export function buildUniverseData(args: {
  industries: DbIndustry[];
  subdomains: DbSubdomain[];
  liveCompanies: DbCompany[];
  referenceCompanies?: ReferenceCompany[];
  myCompanyId?: string | null;
}): UniverseData {
  const { industries, subdomains, liveCompanies, referenceCompanies = [], myCompanyId } = args;

  // ── Index subdomains by industry ─────────────────────────────────
  const subsByInd = new Map<string, DbSubdomain[]>();
  for (const sd of subdomains) {
    if (!subsByInd.has(sd.industry_id)) subsByInd.set(sd.industry_id, []);
    subsByInd.get(sd.industry_id)!.push(sd);
  }
  for (const list of subsByInd.values()) list.sort((a, b) => a.orbit_index - b.orbit_index);

  // ── Bucket companies under subdomain IDs ─────────────────────────
  const compsBySub = new Map<string, UniverseCompany[]>();

  function addToSub(sdId: string, node: UniverseCompany) {
    if (!compsBySub.has(sdId)) compsBySub.set(sdId, []);
    compsBySub.get(sdId)!.push(node);
  }

  // 1. Live user companies (from `companies` table)
  for (const c of liveCompanies) {
    if (!c.industry_id) continue;
    let sdId = c.subdomain_id;
    if (!sdId) {
      sdId = subsByInd.get(c.industry_id)?.[0]?.id ?? null;
    }
    if (!sdId) continue;
    addToSub(sdId, {
      id: `live-${c.id}`,
      name: c.name,
      description: c.description ?? undefined,
      founded: c.founded_year ?? undefined,
      funding: c.stage,
      stage: c.stage,
      employees: c.employees,
      isLive: true,
      departments: [],
      raw: c,
    });
  }

  // 2. Reference companies (backend-researched public companies)
  for (const rc of referenceCompanies) {
    if (!rc.subdomainId) continue;
    addToSub(rc.subdomainId, {
      id: `ref-${rc.id}`,
      name: rc.name || new URL(rc.sourceUrl).hostname.replace(/^www\./, ''),
      description: rc.description ?? undefined,
      isLive: false,
      referenceCompanyId: rc.id,
    });
  }

  // ── Assemble the industry tree ────────────────────────────────────
  const TAU = Math.PI * 2;
  const out: UniverseIndustry[] = industries.map((ind, idx) => {
    const dbSubdomains = subsByInd.get(ind.id) ?? [];

    const effectiveSubs: UniverseSubdomain[] = dbSubdomains.map(sd => ({
      id: sd.id,
      name: sd.label,
      description: sd.description ?? undefined,
      orbit_index: sd.orbit_index,
      color: sd.color ?? ind.color,
      companies: compsBySub.get(sd.id) ?? [],
    }));

    const pos = ind.position_3d;

    return {
      id: ind.id,
      name: ind.label,
      description: ind.description ?? undefined,
      color: ind.color,
      angle: TAU * (idx / industries.length),
      subdomains: effectiveSubs,
      position3D: [pos?.x ?? 0, pos?.y ?? 0, pos?.z ?? 0],
      bubbleRadius: ind.bubble_radius,
    };
  });

  return {
    industries: out,
    myCompanyNodeId: myCompanyId ? `live-${myCompanyId}` : null,
  };
}

/* ──────────────────────────────────────────────────
   useUniverseGraph — React hook for the /3d page.
   100% DB-driven — no hardcoded TypeScript arrays.
────────────────────────────────────────────────── */
export function useUniverseGraph(authCompanyId?: string | null): {
  data: UniverseData | null;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => void;
  appendReferenceCompany: (company: ReferenceCompany) => void;
} {
  const [industries, setIndustries]       = useState<DbIndustry[]>([]);
  const [subdomains, setSubdomains]       = useState<DbSubdomain[]>([]);
  const [liveCompanies, setLive]          = useState<DbCompany[]>([]);
  const [refCompanies, setRefCompanies]   = useState<ReferenceCompany[]>([]);
  const [loading, setLoading]             = useState(true);
  const [isRefreshing, setIsRefreshing]   = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [refreshKey, setRefreshKey]       = useState(0);

  const refresh = () => setRefreshKey(k => k + 1);

  const appendReferenceCompany = (company: ReferenceCompany) => {
    setRefCompanies(prev => [...prev.filter(c => c.id !== company.id), company]);
  };

  useEffect(() => {
    let alive = true;
    const hasCachedData = industries.length > 0;
    if (hasCachedData) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    Promise.all([
      getAllIndustries(),
      getAllSubdomains(),
      getActiveCompanies(),
      listReferenceCompanies().catch(() => [] as ReferenceCompany[]),
    ])
      .then(([inds, sds, live, refs]) => {
        if (!alive) return;
        setIndustries(inds);
        setSubdomains(sds);
        const localCos = getAllLocalCompanies() as unknown as DbCompany[];
        setLive([...live, ...localCos]);
        setRefCompanies(refs);
        setLoading(false);
        setIsRefreshing(false);
      })
      .catch(err => {
        if (!alive) return;
        setError(err?.message ?? 'Failed to load universe data');
        setLoading(false);
        setIsRefreshing(false);
      });

    return () => { alive = false; };
  }, [refreshKey]);

  const data = useMemo(() => {
    if (loading || industries.length === 0) return null;
    return buildUniverseData({
      industries,
      subdomains,
      liveCompanies,
      referenceCompanies: refCompanies,
      myCompanyId: authCompanyId ?? null,
    });
  }, [loading, industries, subdomains, liveCompanies, refCompanies, authCompanyId]);

  return { data, loading, isRefreshing, error, refresh, appendReferenceCompany };
}
