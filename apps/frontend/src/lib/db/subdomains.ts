import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/* ──────────────────────────────────────────────────
   Subdomain — bridges Industry → Company in the 3D
   universe view. Each industry galaxy hosts 5–8
   subdomain "planets" orbiting it.
────────────────────────────────────────────────── */
export interface DbSubdomain {
  id: string;                  // 'sd-saas-crm'
  industry_id: string;         // 'ind-saas'
  label: string;
  description: string | null;
  orbit_index: number;
  color: string | null;
  created_at: string;
}

/* ──────────────────────────────────────────────────
   Fetchers
────────────────────────────────────────────────── */
export async function getAllSubdomains(): Promise<DbSubdomain[]> {
  const { data, error } = await supabase
    .from('subdomains')
    .select('*')
    .order('industry_id', { ascending: true })
    .order('orbit_index', { ascending: true });
  if (error) { console.error('[db/subdomains] fetch all', error); return []; }
  return data ?? [];
}

export async function getSubdomainsByIndustry(industryId: string): Promise<DbSubdomain[]> {
  const { data, error } = await supabase
    .from('subdomains')
    .select('*')
    .eq('industry_id', industryId)
    .order('orbit_index', { ascending: true });
  if (error) { console.error('[db/subdomains] fetch by industry', error); return []; }
  return data ?? [];
}

/* ──────────────────────────────────────────────────
   Hooks
────────────────────────────────────────────────── */
export function useSubdomains(): { subdomains: DbSubdomain[]; loading: boolean } {
  const [subdomains, setSubdomains] = useState<DbSubdomain[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getAllSubdomains().then(rows => {
      if (!alive) return;
      setSubdomains(rows);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return { subdomains, loading };
}

export function useSubdomainsByIndustry(industryId: string | null | undefined): {
  subdomains: DbSubdomain[];
  loading: boolean;
} {
  const [subdomains, setSubdomains] = useState<DbSubdomain[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!industryId) { setSubdomains([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    getSubdomainsByIndustry(industryId).then(rows => {
      if (!alive) return;
      setSubdomains(rows);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [industryId]);

  return { subdomains, loading };
}
