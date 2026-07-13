import { supabase } from '../supabase';

/* ──────────────────────────────────────────────────
   DbIndustry — matches the `industries` Supabase table.
   This is the canonical source of truth for all 12
   Work OS Universe industry galaxies.
────────────────────────────────────────────────── */
export interface DbIndustry {
  id: string;
  label: string;
  description: string | null;
  color: string;
  position_3d: { x: number; y: number; z: number };
  bubble_radius: number;
  tags: string[];
}

let _cache: DbIndustry[] | null = null;

/**
 * Fetch all industries from Supabase, ordered as they appear in the universe.
 * Results are in-memory cached for the page lifetime.
 */
export async function getAllIndustries(): Promise<DbIndustry[]> {
  if (_cache) return _cache;

  const { data, error } = await supabase
    .from('industries')
    .select('*')
    .order('label', { ascending: true });

  if (error) {
    console.error('[db/industries] fetch failed', error.message);
    return [];
  }

  _cache = (data ?? []) as DbIndustry[];
  return _cache;
}

export function invalidateIndustriesCache(): void {
  _cache = null;
}
