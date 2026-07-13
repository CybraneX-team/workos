import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

/* ──────────────────────────────────────────────────
   Types
────────────────────────────────────────────────── */

export type ProgramType = 'accelerator' | 'incubator' | 'studio' | 'university' | 'corporate';

export interface IncubatorProfile {
  id: string;
  owner_user_id: string;
  name: string;
  legal_name: string | null;
  website: string | null;
  logo_url: string | null;
  hq_country: string | null;
  hq_city: string | null;
  program_type: ProgramType | null;
  focus_sectors: string[];
  focus_stages: string[];
  typical_cohort_size: number | null;
  program_length_weeks: number | null;
  description: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export type PortfolioStatus = 'provisional' | 'invited' | 'claimed';

export interface InviteSummary {
  id: string;
  company_id: string | null;
  cohort_id: string | null;
  startup_name: string | null;
  status: 'pending' | 'sent' | 'opened' | 'claimed' | 'expired' | 'bounced';
  email: string;
  sent_at: string | null;
  opened_at: string | null;
  claimed_at: string | null;
  claimed_company_id: string | null;
  expires_at: string;
  created_at: string;
}

export interface CohortRef {
  id: string;
  name: string;
}

export interface PortfolioCompany {
  id: string;
  name: string;
  slug: string;
  stage: string;
  stage_label: string | null;
  industry_id: string | null;
  sector: string | null;
  country: string;
  founded_year: number | null;
  website: string | null;
  description: string | null;
  mrr_usd: number;
  employees: number;
  annual_revenue: number;
  burn_rate_usd: number;
  runway_months: number;
  kind: 'active' | 'provisional';
  source: 'self' | 'incubator_roster';
  roster_contact_email: string | null;
  roster_contact_name: string | null;
  incubator_notes: string | null;
  claimed_from_invite_id: string | null;
  created_at: string;
  updated_at: string;
  status: PortfolioStatus;
  latestInvite: InviteSummary | null;
  cohorts: CohortRef[];
}

export interface LiveMetrics {
  normalized: Array<{ metric_key: string; value: number; unit: string | null; period_end: string }>;
  latestSnapshot: Record<string, unknown> | null;
}

export interface PortfolioCompanyDetail extends PortfolioCompany {
  liveMetrics: LiveMetrics | null;
}

export interface RosterRow {
  name: string | null;
  contactEmail: string | null;
  contactName: string | null;
  website: string | null;
  stage: string | null;
  sector: string | null;
  country: string | null;
  foundedYear: number | null;
  seedMetrics: Record<string, number>;
  confidence: Record<string, number>;
  emailRecoveredByRegexSweep: boolean;
  sheetName: string;
  rowIndex: number;
}

export interface RosterJobStatus {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  record_count: number | null;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  rosterStaging: { rows: RosterRow[]; warnings: string[]; parsedAt: string } | null;
}

export interface RosterCommitResult {
  imported: number;
  missingName: number;
  duplicatesSkipped: number;
  companyIds: string[];
}

export interface Goal {
  label: string;
  metric_key: string;
  target: number;
}

export interface Cohort {
  id: string;
  incubator_id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'completed' | 'archived';
  starts_on: string | null;
  ends_on: string | null;
  goals: Goal[];
  created_by: string;
  created_at: string;
  updated_at: string;
  memberCount: number;
}

export interface CohortMemberRow {
  companyId: string;
  joinedAt: string;
  status: 'active' | 'graduated' | 'dropped';
  notes: string | null;
  company: { id: string; name: string; kind: string; stage: string; mrr_usd: number } | null;
}

export interface CohortDetail extends Cohort {
  members: CohortMemberRow[];
}

export interface GoalProgress {
  label: string;
  metricKey: string;
  target: number;
  actual: number | null;
  progressPct: number | null;
  note?: string;
}

export interface CohortTracking {
  cohort: { id: string; name: string; status: string; startsOn: string | null; endsOn: string | null };
  aggregate: {
    memberCount: number;
    claimedCount: number;
    provisionalCount: number;
    totalMrrUsd: number;
    avgMrrUsd: number;
    totalEmployees: number;
    avgRunwayMonths: number;
    totalAnnualRevenue: number;
    totalBurnRateUsd: number;
  };
  byStage: Record<string, number>;
  goalsProgress: GoalProgress[];
  members: Array<{ id: string; name: string; kind: string; stage: string; mrr_usd: number; employees: number }>;
}

export interface DashboardSummary {
  startups: { total: number; claimed: number; provisional: number };
  cohorts: { total: number; active: number };
  invites: { totalInvited: number; claimed: number; conversionPct: number | null };
  portfolio: { totalMrrUsd: number };
  attention: {
    bouncedInvites: Array<{ id: string; companyId: string | null; startupName: string | null; email: string }>;
    expiringSoonInvites: Array<{ id: string; companyId: string | null; startupName: string | null; email: string; expiresAt: string }>;
    cohortsEndingSoon: Array<{ id: string; name: string; endsOn: string }>;
  };
}

// Broad stage vocabulary for incubator *focus* selection (onboarding/settings),
// where focus_stages is a free-text array not constrained by the company enum.
export const COMPANY_STAGE_OPTIONS = [
  'Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D',
  'Series D+', 'Series E', 'Series F', 'Series G', 'Series H', 'Series I',
  'Growth', 'Pre-IPO', 'Public', 'PSU', 'Bootstrapped', 'Private', 'Acquired',
  'Subsidiary',
] as const;

// The values actually permitted by the public.company_stage Postgres enum —
// must match backend COMPANY_STAGE_ENUM. Use this (not COMPANY_STAGE_OPTIONS)
// anywhere the selection is written to companies.stage, or the save will 400 /
// 22P02 on values outside the enum. 'Others' is the explicit fallback bucket
// for roster stage labels that don't correspond to any funding round.
export const COMPANY_STAGE_ENUM = [
  'Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D+',
  'Pre-IPO', 'Public', 'PSU', 'Bootstrapped', 'Others',
] as const;

function isNotFoundOrForbidden(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.startsWith('403') || message.startsWith('404');
}

/* ──────────────────────────────────────────────────
   Incubator profile
────────────────────────────────────────────────── */

export function useIncubatorMe() {
  const [incubator, setIncubator] = useState<IncubatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notOnboarded, setNotOnboarded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<IncubatorProfile>('/api/incubators/me');
      setIncubator(data);
      setNotOnboarded(false);
      localStorage.setItem('active_role', 'incubator');
    } catch (err) {
      setIncubator(null);
      setNotOnboarded(isNotFoundOrForbidden(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { incubator, loading, notOnboarded, refresh: load };
}

export interface CreateIncubatorInput {
  name: string;
  legal_name?: string;
  website?: string;
  logo_url?: string;
  hq_country: string;
  hq_city?: string;
  program_type: ProgramType;
  focus_sectors?: string[];
  focus_stages?: string[];
  typical_cohort_size?: number;
  program_length_weeks?: number;
  description?: string;
}

export const createIncubator = (input: CreateIncubatorInput) =>
  api.post<IncubatorProfile>('/api/incubators', input);

export const updateIncubator = (patch: Partial<CreateIncubatorInput>) =>
  api.patch<IncubatorProfile>('/api/incubators/me', patch);

/* ──────────────────────────────────────────────────
   Portfolio
────────────────────────────────────────────────── */

export function usePortfolio(filters: { status?: PortfolioStatus; cohortId?: string; search?: string } = {}) {
  const [companies, setCompanies] = useState<PortfolioCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { status, cohortId, search } = filters;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (cohortId) params.set('cohortId', cohortId);
      if (search) params.set('search', search);
      const qs = params.toString();
      const data = await api.get<PortfolioCompany[]>(`/api/incubator/portfolio${qs ? `?${qs}` : ''}`);
      setCompanies(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [status, cohortId, search]);

  useEffect(() => {
    load();
  }, [load]);

  return { companies, loading, error, refresh: load };
}

export function usePortfolioCompany(companyId: string | undefined) {
  const [company, setCompany] = useState<PortfolioCompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<PortfolioCompanyDetail>(`/api/incubator/portfolio/${companyId}`);
      setCompany(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  return { company, loading, error, refresh: load };
}

export const updatePortfolioCompany = (companyId: string, patch: Record<string, unknown>) =>
  api.patch<PortfolioCompanyDetail>(`/api/incubator/portfolio/${companyId}`, patch);

/* ──────────────────────────────────────────────────
   Roster ingestion
────────────────────────────────────────────────── */

export async function uploadRoster(file: File): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<{ jobId: string }>('/api/incubator/roster/upload', formData);
}

export const getRosterJob = (jobId: string) =>
  api.get<RosterJobStatus>(`/api/incubator/roster/jobs/${jobId}`);

export const commitRoster = (jobId: string, body?: { cohortId?: string; rows?: RosterRow[] }) =>
  api.post<RosterCommitResult>(`/api/incubator/roster/${jobId}/commit`, body ?? {});

/* ──────────────────────────────────────────────────
   Invites
────────────────────────────────────────────────── */

export function useInvites(filters: { status?: string; cohortId?: string } = {}) {
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { status, cohortId } = filters;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (cohortId) params.set('cohortId', cohortId);
      const qs = params.toString();
      const data = await api.get<InviteSummary[]>(`/api/incubator/invites${qs ? `?${qs}` : ''}`);
      setInvites(data);
    } finally {
      setLoading(false);
    }
  }, [status, cohortId]);

  useEffect(() => {
    load();
  }, [load]);

  return { invites, loading, refresh: load };
}

export interface SendInvitesResult {
  results: Array<{ companyId: string; result: string }>;
}

export const sendInvites = (payload: { companyIds: string[]; cohortId?: string; emailOverrides?: Record<string, string> }) =>
  api.post<SendInvitesResult>('/api/incubator/invites/send', payload);

export const resendInvite = (inviteId: string) =>
  api.post<{ status: string }>(`/api/incubator/invites/${inviteId}/resend`);

/* ──────────────────────────────────────────────────
   Cohorts
────────────────────────────────────────────────── */

export function useCohorts() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Cohort[]>('/api/incubator/cohorts');
      setCohorts(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { cohorts, loading, refresh: load };
}

export function useCohort(cohortId: string | undefined) {
  const [cohort, setCohort] = useState<CohortDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<CohortDetail>(`/api/incubator/cohorts/${cohortId}`);
      setCohort(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    load();
  }, [load]);

  return { cohort, loading, error, refresh: load };
}

export function useCohortTracking(cohortId: string | undefined) {
  const [tracking, setTracking] = useState<CohortTracking | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const data = await api.get<CohortTracking>(`/api/incubator/cohorts/${cohortId}/tracking`);
      setTracking(data);
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    load();
  }, [load]);

  return { tracking, loading, refresh: load };
}

export interface CreateCohortInput {
  name: string;
  description?: string;
  status?: Cohort['status'];
  startsOn?: string | null;
  endsOn?: string | null;
  goals?: Goal[];
}

export const createCohort = (input: CreateCohortInput) => api.post<Cohort>('/api/incubator/cohorts', input);

export const updateCohort = (cohortId: string, patch: Partial<CreateCohortInput>) =>
  api.patch<Cohort>(`/api/incubator/cohorts/${cohortId}`, patch);

export const deleteCohort = (cohortId: string) => api.delete<{ success: boolean }>(`/api/incubator/cohorts/${cohortId}`);

export const addCohortMembers = (cohortId: string, companyIds: string[]) =>
  api.post<{ added: number; skipped: string[] }>(`/api/incubator/cohorts/${cohortId}/members`, { companyIds });

export const removeCohortMember = (cohortId: string, companyId: string) =>
  api.delete<{ success: boolean }>(`/api/incubator/cohorts/${cohortId}/members/${companyId}`);

/* ──────────────────────────────────────────────────
   Dashboard
────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────
   Public invite (no incubator auth — /join-startup)
────────────────────────────────────────────────── */

export interface PublicInviteInfo {
  startupName: string | null;
  email: string;
  status: 'pending' | 'opened' | 'claimed' | 'expired' | 'bounced';
  incubatorName: string;
  incubatorLogoUrl: string | null;
  cohortName: string | null;
  expiresAt: string;
  alreadyClaimed: boolean;
}

export const lookupStartupInvite = (token: string) =>
  api.get<PublicInviteInfo>(`/api/invites/${encodeURIComponent(token)}`);

export const claimStartupInvite = (token: string) =>
  api.post<{ companyId: string; companyName: string }>(`/api/invites/${encodeURIComponent(token)}/claim`);

export function useDashboardSummary() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<DashboardSummary>('/api/incubator/dashboard/summary');
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { summary, loading, refresh: load };
}

/* ──────────────────────────────────────────────────
   Discover — search real, platform-wide companies not yet managed by
   this incubator. Public-fields-only (no financials/notes) — see
   backend/src/routes/incubatorDiscover.ts for the D2a-style scoping.
────────────────────────────────────────────────── */

export type ConnectionStatus = 'none' | 'pending' | 'accepted' | 'declined';

export interface DiscoverCompany {
  id: string;
  name: string;
  slug: string;
  sector: string | null;
  stage: string;
  stage_label: string | null;
  country: string;
  founded_year: number | null;
  website: string | null;
  description: string | null;
  employees: number;
  connection_status: ConnectionStatus;
}

export function useDiscoverCompanies(
  filters: { search?: string; stage?: string; sector?: string; country?: string } = {},
) {
  const [companies, setCompanies] = useState<DiscoverCompany[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const { search, stage, sector, country } = filters;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (stage) params.set('stage', stage);
      if (sector) params.set('sector', sector);
      if (country) params.set('country', country);
      const qs = params.toString();
      const data = await api.get<{ companies: DiscoverCompany[]; total: number }>(
        `/api/incubator/discover${qs ? `?${qs}` : ''}`,
      );
      setCompanies(data.companies);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [search, stage, sector, country]);

  useEffect(() => {
    load();
  }, [load]);

  return { companies, total, loading, refresh: load };
}

export const connectToCompany = (companyId: string, message?: string) =>
  api.post<{ result: string }>(`/api/incubator/discover/${companyId}/connect`, message ? { message } : {});
