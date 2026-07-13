/**
 * localCompanies — persists user-created companies to localStorage.
 * Used when the Supabase companies table has FK constraints that prevent
 * inserting companies with new industry IDs (ind-technology, ind-finance …).
 *
 * Shape mirrors the subset of DbCompany consumed by buildUniverseData.
 */

import type { CompanyStage, BusinessModel } from './supabase';

const LS_KEY = 'founder_os_local_companies';

export interface LocalCompany {
  id: string;            // 'local-<uuid>'
  name: string;
  slug: string;
  industry_id: string;
  subdomain_id: string | null;
  stage: CompanyStage;
  country: string;
  founded_year: number | null;
  description: string | null;
  website: string | null;
  logo_url: null;
  mrr_usd: number;
  employees: number;
  annual_revenue: number;
  burn_rate_usd: number;
  runway_months: number;
  valuation: string | null;
  target_market: string | null;
  business_model: BusinessModel | null;
  problem_solved: string | null;
  usp: string | null;
  competitors: string[] | null;
  status: 'active';
  is_public: false;
  stock_symbol: null;
  offset_3d: { x: number; y: number; z: number } | null;
  created_at: string;
  updated_at: string;
  _isLocal: true;        // sentinel so we can distinguish from Supabase rows
}

/* ── helpers ──────────────────────────────────────────── */

function uid(): string {
  return 'local-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getAllLocalCompanies(): LocalCompany[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalCompany[];
  } catch {
    return [];
  }
}

export function saveLocalCompany(input: {
  name: string;
  industry_id: string;
  subdomain_id?: string;
  stage: CompanyStage;
  country: string;
  founded_year?: number;
  description?: string;
  website?: string;
  employees?: number;
  mrr_usd?: number;
  business_model?: BusinessModel;
  problem_solved?: string;
  usp?: string;
}): LocalCompany {
  const now = new Date().toISOString();

  const company: LocalCompany = {
    id: uid(),
    name: input.name,
    slug: toSlug(input.name),
    industry_id: input.industry_id,
    subdomain_id: input.subdomain_id ?? null,
    stage: input.stage,
    country: input.country,
    founded_year: input.founded_year ?? null,
    description: input.description ?? null,
    website: input.website ?? null,
    logo_url: null,
    mrr_usd: input.mrr_usd ?? 0,
    employees: input.employees ?? 0,
    annual_revenue: 0,
    burn_rate_usd: 0,
    runway_months: 0,
    valuation: null,
    target_market: null,
    business_model: input.business_model ?? null,
    problem_solved: input.problem_solved ?? null,
    usp: input.usp ?? null,
    competitors: null,
    status: 'active',
    is_public: false,
    stock_symbol: null,
    offset_3d: null,
    created_at: now,
    updated_at: now,
    _isLocal: true,
  };

  const existing = getAllLocalCompanies();
  existing.push(company);
  localStorage.setItem(LS_KEY, JSON.stringify(existing));

  return company;
}

export function deleteLocalCompany(id: string): void {
  const existing = getAllLocalCompanies().filter(c => c.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(existing));
}
