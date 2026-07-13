import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type { DbCompany, CompanyStage, BusinessModel } from '../supabase';
import { INDUSTRIES } from '../../db/industries';
import { api } from '../api';

/* ──────────────────────────────────────────────────
   Fetch all active companies (for Twin graph)
────────────────────────────────────────────────── */
export async function getActiveCompanies(): Promise<DbCompany[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) { console.error('[db/companies]', error); return []; }
  return data ?? [];
}

/* ──────────────────────────────────────────────────
   Get a single company by id
────────────────────────────────────────────────── */
export async function getCompanyById(id: string): Promise<DbCompany | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single();
  if (error) { console.error('[db/companies]', error); return null; }
  return data;
}

/* ──────────────────────────────────────────────────
   Create company from onboarding data
────────────────────────────────────────────────── */
export interface CreateCompanyInput {
  name: string;
  industry_id: string;
  subdomain_id?: string;
  stage: CompanyStage;
  country: string;
  currency?: string;
  founded_year?: number;
  description?: string;
  website?: string;
  mrr_usd?: number;
  employees?: number;
  burn_rate_usd?: number;
  runway_months?: number;
  target_market?: string;
  business_model?: BusinessModel;
  problem_solved?: string;
  usp?: string;
  competitors?: string[];
  /** Framework department source keys (dept_engineering, etc.) */
  bdt_department_source_keys?: string[];
  /** Custom department labels added during onboarding */
  bdt_custom_departments?: string[];
  departments?: string[];
  bdtCompanySize?: 'micro' | 'msme' | 'standard' | 'enterprise';
  profile?: {
    first_name?: string;
    last_name?: string;
    title?: string;
  };
}

export async function createCompany(
  input: CreateCompanyInput,
  userId: string,
): Promise<DbCompany | null> {
  void userId;
  try {
    const { company } = await api.post<{ company: DbCompany }>('/api/companies', input);
    return company;
  } catch (error) {
    console.error('[db/companies] create error', error);
    return null;
  }
}

/* ──────────────────────────────────────────────────
   useCompany — live hook for the logged-in user's company
────────────────────────────────────────────────── */
export function useCompany(companyId: string | null | undefined): {
  company: DbCompany | null;
  loading: boolean;
} {
  const [company, setCompany] = useState<DbCompany | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    getCompanyById(companyId).then(c => {
      setCompany(c);
      setLoading(false);
    });
  }, [companyId]);

  return { company, loading };
}

/* ──────────────────────────────────────────────────
   Incubator connection requests — founder-side half of Discover
   (backend/src/routes/incubatorDiscover.ts). An incubator finding this
   company via Discover sends a request here rather than being silently
   attached; the founder must explicitly accept before
   managed_by_incubator_id is set on the company.
────────────────────────────────────────────────── */
export interface CompanyConnectionRequest {
  id: string;
  status: 'pending' | 'accepted' | 'declined';
  message: string | null;
  created_at: string;
  incubator_id: string;
  incubator_name: string;
}

export function useConnectionRequests(companyId: string | null | undefined) {
  const [requests, setRequests] = useState<CompanyConnectionRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<{ requests: CompanyConnectionRequest[] }>(`/api/companies/${companyId}/connection-requests`);
      setRequests(data.requests);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  return { requests, loading, refresh: load };
}

export const respondToConnectionRequest = (companyId: string, requestId: string, accept: boolean) =>
  api.post<{ status: string }>(`/api/companies/${companyId}/connection-requests/${requestId}/respond`, { accept });

/* ──────────────────────────────────────────────────
   Convert DbCompany → TwinNode-compatible shape
────────────────────────────────────────────────── */
export function companyToTwinNodeData(c: DbCompany) {
  const industry = INDUSTRIES.find(i => i.id === c.industry_id);

  // Fallback: place at industry center + small deterministic offset when offset_3d is missing
  const fallbackOffset = industry
    ? { x: (c.name.charCodeAt(0) % 10) - 5, y: (c.name.charCodeAt(1) % 10) - 5, z: (c.name.charCodeAt(2) % 8) - 4 }
    : { x: 0, y: 0, z: 0 };
  const off = c.offset_3d ?? fallbackOffset;

  const pos3D = industry
    ? {
        x: industry.position3D[0] + off.x,
        y: industry.position3D[1] + off.y,
        z: industry.position3D[2] + off.z,
      }
    : null;

  return {
    id: `live-${c.id}`,
    label: c.name,
    type: 'company' as const,
    status: 'healthy' as const,
    description: c.description ?? undefined,
    metrics: {
      mrr: c.mrr_usd,
      team: c.employees,
      stage: c.stage,
    },
    _pos3D: pos3D,       // used by twinGraph to inject into POS3D
    _industryId: c.industry_id ?? undefined,
  };
}
