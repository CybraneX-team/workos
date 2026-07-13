import { supabase } from '../supabase';

/* ──────────────────────────────────────────────────
   CatalogCompany — pre-seeded read-only universe entities.
   Lives in the catalog_companies table (migration 012).
────────────────────────────────────────────────── */
export interface CatalogCompany {
  id: string;
  name: string;
  industry_id: string;
  subdomain_id: string | null;
  subdomain_name: string | null;
  country: string | null;
  founded_year: number | null;
  stage: string | null;
  is_public: boolean;
  stock_symbol: string | null;
  valuation: string | null;
  mrr_usd: number | null;
  employees: number | null;
  investors: string[];
  description: string | null;
  status: string;
  offset_3d: { x: number; y: number; z: number } | null;
}

let _cache: CatalogCompany[] | null = null;

/**
 * Fetches all catalog companies from Supabase.
 * Results are cached in-memory for the lifetime of the page load.
 * Falls back to an empty array on error (hardcoded TS data used as fallback
 * in universeGraph.ts when this returns []).
 */
export async function getCatalogCompanies(): Promise<CatalogCompany[]> {
  if (_cache) return _cache;

  const { data, error } = await supabase
    .from('catalog_companies')
    .select('*')
    .order('industry_id', { ascending: true });

  if (error) {
    console.warn('[db/catalogCompanies] fetch failed — falling back to TS hardcoded data', error.message);
    return [];
  }

  _cache = (data ?? []) as CatalogCompany[];
  return _cache;
}

/** Invalidate the cache so the next call re-fetches */
export function invalidateCatalogCache(): void {
  _cache = null;
}
