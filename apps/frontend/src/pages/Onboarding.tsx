import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, Hexagon, Check, Search, Users, Building2,
  Clock, CheckCircle, Plus, Sparkles, X, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { createCompany } from '../lib/db/companies';
import type { CreateCompanyInput } from '../lib/db/companies';
import { INDUSTRIES } from '../db/industries';
import { useSubdomainsByIndustry } from '../lib/db/subdomains';
import type { BusinessModel, CompanyStage } from '../lib/supabase';
import { submitJoinRequest, listJoinableCompanies } from '../lib/db/team';
import type { JoinableCompany } from '../lib/db/team';
import {
  getBdtCatalog,
  mapSuggestedLabelsToCatalogIds,
  matchCatalogDepartmentId,
  getDepartmentChipStyle,
  createCustomDepartmentEntry,
  type CustomDepartmentEntry,
} from '../lib/bdtOnboarding';
import { useBdtCatalog } from '../lib/bdtCatalog';
import type { UCompanySize } from '../lib/bdtPolytopeData';
import { api } from '../lib/api';
import { COUNTRIES, getCurrencyCodeForCountry } from '../lib/currency';

const BLOB_KF = `
@keyframes ob-a {
  0%,100% { transform: translate(0,0) scale(1); }
  33%      { transform: translate(50px,-40px) scale(1.07); }
  66%      { transform: translate(-30px,25px) scale(0.95); }
}
@keyframes ob-b {
  0%,100% { transform: translate(0,0) scale(1); }
  33%      { transform: translate(-40px,30px) scale(1.05); }
  66%      { transform: translate(40px,-25px) scale(0.97); }
}
@keyframes ob-c {
  0%,100% { transform: translate(0,0) scale(1); }
  50%      { transform: translate(25px,35px) scale(1.09); }
}
@keyframes ob-fade-in {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

const ACCENT = '#C1AEFF';
const FF = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif';

const STEPS = [
  { id: 1, label: 'Company' },
  { id: 2, label: 'Story' },
  { id: 3, label: 'Metrics' },
  { id: 4, label: 'Departments' },
  { id: 5, label: 'Size' },
  { id: 6, label: 'Profile' },
  { id: 7, label: 'Launch' },
];

const SIZE_OPTIONS: { key: UCompanySize; label: string; description: string }[] = [
  { key: 'micro', label: 'Micro', description: 'Founder-led, pre-team stage' },
  { key: 'msme', label: 'MSME', description: 'Growing team, 10-50 people' },
  { key: 'standard', label: 'Standard', description: 'Full org, 50-500 people' },
  { key: 'enterprise', label: 'Enterprise', description: 'Multi-team, 500+ people' },
];

const STAGES: CompanyStage[] = [
  'Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B',
  'Series C', 'Series D+', 'Pre-IPO', 'Public', 'PSU', 'Bootstrapped',
];

const BUSINESS_MODELS: BusinessModel[] = ['B2B', 'B2C', 'B2B2C', 'Marketplace', 'SaaS', 'D2C', 'Other'];

const JOIN_PAGE_SIZE = 4;

interface FormData {
  name: string; industry_id: string; subdomain_id: string; stage: CompanyStage;
  country: string; founded_year: string; website: string;
  description: string; problem_solved: string; usp: string;
  target_market: string; business_model: BusinessModel | '';
  employees: string; mrr_usd: string; burn_rate_usd: string;
  runway_months: string; cltv_usd: string; cac_usd: string;
  monthly_churn_rate: string; nps_score: string; competitors: string;
  first_name: string; last_name: string; title: string;
}

const INITIAL: FormData = {
  name: '', industry_id: '', subdomain_id: '', stage: 'Seed', country: 'India',
  founded_year: '', website: '',
  description: '', problem_solved: '', usp: '', target_market: '', business_model: '',
  employees: '', mrr_usd: '', burn_rate_usd: '', runway_months: '',
  cltv_usd: '', cac_usd: '', monthly_churn_rate: '', nps_score: '',
  competitors: '',
  first_name: '', last_name: '', title: '',
};

/* ── Shared design tokens ── */
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12, padding: '13px 16px', fontSize: 14,
  color: '#fff', outline: 'none', fontFamily: FF,
  transition: 'border-color 0.18s, box-shadow 0.18s',
};

function OInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
      style={{
        ...inputStyle,
        border: `1px solid ${focused ? 'rgba(193,174,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
        boxShadow: focused ? '0 0 0 3px rgba(193,174,255,0.1)' : 'none',
        ...props.style,
      }}
    />
  );
}

function OTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      rows={3}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
      style={{
        ...inputStyle, resize: 'none',
        border: `1px solid ${focused ? 'rgba(193,174,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
        boxShadow: focused ? '0 0 0 3px rgba(193,174,255,0.1)' : 'none',
        ...props.style,
      }}
    />
  );
}

function OSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
      style={{
        ...inputStyle,
        appearance: 'none', WebkitAppearance: 'none',
        border: `1px solid ${focused ? 'rgba(193,174,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
        boxShadow: focused ? '0 0 0 3px rgba(193,174,255,0.1)' : 'none',
        ...props.style,
      }}
    />
  );
}

function OField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
      {hint && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>{hint}</span>}
    </div>
  );
}

/* ── Full-page blob background wrapper ── */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{BLOB_KF}</style>
      <div style={{ minHeight: '100vh', background: '#07070f', position: 'relative', overflow: 'hidden', fontFamily: FF }}>
        {/* Blobs */}
        <div style={{ position: 'fixed', width: '55vw', height: '55vw', borderRadius: '50%', background: 'radial-gradient(ellipse at 40% 40%, rgba(167,139,250,0.55) 0%, rgba(109,40,217,0.35) 35%, transparent 70%)', top: '-15vw', left: '-10vw', filter: 'blur(70px)', animation: 'ob-a 16s ease-in-out infinite', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'fixed', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,60,219,0.3) 0%, transparent 65%)', bottom: '-8vw', right: '-5vw', filter: 'blur(80px)', animation: 'ob-b 20s ease-in-out infinite', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'fixed', width: '35vw', height: '35vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.18) 0%, transparent 65%)', top: '50%', left: '55%', filter: 'blur(90px)', animation: 'ob-c 26s ease-in-out infinite', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(4,4,12,0.6) 100%)', pointerEvents: 'none', zIndex: 1 }} />

        {/* Logo */}
        <div style={{ position: 'fixed', top: 28, left: 36, display: 'flex', alignItems: 'center', gap: 10, zIndex: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg, rgba(249,198,255,0.9), rgba(193,174,255,0.9))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Hexagon size={16} color="#161618" fill="#161618" strokeWidth={1.5} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.01em' }}>WorkOS</span>
        </div>

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 10, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 24px 80px' }}>
          {children}
        </div>
      </div>
    </>
  );
}

/* ── Main ── */
export default function Onboarding() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const bdtSizeCatalog = useBdtCatalog();

  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bdtCompanySize, setBdtCompanySize] = useState<UCompanySize>('standard');

  const bdtCatalog = getBdtCatalog();
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const [customDepartments, setCustomDepartments] = useState<CustomDepartmentEntry[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [customDeptInput, setCustomDeptInput] = useState('');
  const [aiSuggestedIds, setAiSuggestedIds] = useState<string[]>([]);

  function toggleCatalogDepartment(deptId: string) {
    setSelectedCatalogIds(prev => prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]);
  }

  function addCustomDepartment() {
    const trimmed = customDeptInput.trim();
    if (!trimmed) return;
    const catalogId = matchCatalogDepartmentId(trimmed);
    if (catalogId) {
      if (!selectedCatalogIds.includes(catalogId)) setSelectedCatalogIds(prev => [...prev, catalogId]);
      setCustomDeptInput('');
      return;
    }
    const duplicate = customDepartments.some(d => d.label.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) { setError('This custom department is already in your list'); return; }
    setCustomDepartments(prev => [...prev, createCustomDepartmentEntry(trimmed, prev.length, true)]);
    setCustomDeptInput('');
    setError(null);
  }

  function toggleCustomDepartment(id: string) {
    setCustomDepartments(prev => prev.map(d => d.id === id ? { ...d, selected: !d.selected } : d));
  }

  function removeCustomDepartment(id: string) {
    setCustomDepartments(prev => prev.filter(d => d.id !== id));
  }

  function countSelectedDepartments() {
    return selectedCatalogIds.length + customDepartments.filter(d => d.selected).length;
  }

  function getSelectedDepartmentLabels() {
    const fromCatalog = bdtCatalog.filter(d => selectedCatalogIds.includes(d.id)).map(d => d.label);
    const fromCustom = customDepartments.filter(d => d.selected).map(d => d.label);
    return [...fromCatalog, ...fromCustom];
  }

  async function fetchAiDepartmentSuggestions() {
    setDepartmentsLoading(true);
    setError(null);
    try {
      const industryName = INDUSTRIES.find(i => i.id === form.industry_id)?.label ?? 'Tech';
      const response = await api.post<{ departments: string[] }>('/api/metrics-onboarding/generate-departments', {
        name: form.name.trim(), industryName, description: form.description.trim(),
        businessModel: form.business_model, problemSolved: form.problem_solved.trim(), usp: form.usp.trim(),
      });
      if (response && Array.isArray(response.departments)) {
        const ids = mapSuggestedLabelsToCatalogIds(response.departments);
        if (ids.length > 0) { setAiSuggestedIds(ids); setSelectedCatalogIds(ids); }
      }
    } catch (err) {
      console.error('[onboarding] AI department suggestions failed (non-fatal)', err);
    } finally {
      setDepartmentsLoading(false);
    }
  }

  const [joinSearch, setJoinSearch] = useState('');
  const [joinCompanies, setJoinCompanies] = useState<JoinableCompany[]>([]);
  const [joinSelected, setJoinSelected] = useState<JoinableCompany | null>(null);
  const [joinJoined, setJoinJoined] = useState(false);
  const [joinSearching, setJoinSearching] = useState(false);
  const [joinHasLoaded, setJoinHasLoaded] = useState(false);
  const [joinPage, setJoinPage] = useState(1);
  const [joinTotal, setJoinTotal] = useState(0);

  async function loadJoinCompanies(page = joinPage, search = joinSearch) {
    setJoinSearching(true);
    const { companies, total } = await listJoinableCompanies({ page, pageSize: JOIN_PAGE_SIZE, search });
    setJoinCompanies(companies);
    setJoinTotal(total);
    setJoinPage(page);
    if (joinSelected && !companies.some(c => c.id === joinSelected.id)) setJoinSelected(null);
    setJoinHasLoaded(true);
    setJoinSearching(false);
  }

  useEffect(() => {
    if (mode !== 'join') return;
    const timer = window.setTimeout(() => { void loadJoinCompanies(1, joinSearch); }, 250);
    return () => window.clearTimeout(timer);
  }, [mode, joinSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profile?.company_id) return;
    const timer = window.setTimeout(() => { navigate('/overview', { replace: true }); }, 2400);
    return () => window.clearTimeout(timer);
  }, [profile?.company_id, navigate]);

  async function requestToJoin(company: JoinableCompany) {
    if (!user) return;
    if (profile?.company_id) { setError('You are already a company account.'); return; }
    setJoinSelected(company);
    setLoading(true);
    setError(null);
    const result = await submitJoinRequest(company.id, user.id);
    if (!result.success) { setError(result.error ?? 'Failed to send join request'); setLoading(false); return; }
    setLoading(false);
    setJoinJoined(true);
  }

  function update(field: keyof FormData, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setError(null);
  }

  function nextStep() {
    if (!validateStep()) return;
    const next = step + 1;
    if (next === 4) void fetchAiDepartmentSuggestions();
    setStep(s => Math.min(s + 1, 7));
  }

  function prevStep() { setStep(s => Math.max(s - 1, 1)); }

  function validateStep(): boolean {
    if (step === 1) {
      if (!form.name.trim()) { setError('Company name is required'); return false; }
      if (!form.industry_id) { setError('Please select an industry'); return false; }
    }
    if (step === 2 && !form.description.trim()) { setError('A short description is required'); return false; }
    if (step === 4 && countSelectedDepartments() === 0) {
      setError('Select at least one department for your Business Digital Twin'); return false;
    }
    if (step === 6 && !form.first_name.trim()) { setError('First name is required'); return false; }
    return true;
  }

  async function handleLaunch() {
    if (!user) return;
    if (profile?.company_id) { setError('You already have a company.'); navigate('/overview', { replace: true }); return; }
    setLoading(true); setError(null);

    const departmentLabels = getSelectedDepartmentLabels();

    const payload: CreateCompanyInput = {
      name: form.name.trim(), industry_id: form.industry_id,
      subdomain_id: form.subdomain_id || undefined, stage: form.stage,
      country: form.country, currency: getCurrencyCodeForCountry(form.country),
      founded_year: form.founded_year ? parseInt(form.founded_year) : undefined,
      description: form.description.trim() || undefined,
      website: form.website.trim() || undefined,
      problem_solved: form.problem_solved.trim() || undefined,
      usp: form.usp.trim() || undefined,
      target_market: form.target_market.trim() || undefined,
      business_model: (form.business_model as BusinessModel) || undefined,
      mrr_usd: form.mrr_usd ? parseFloat(form.mrr_usd) : undefined,
      employees: form.employees ? parseInt(form.employees) : undefined,
      burn_rate_usd: form.burn_rate_usd ? parseFloat(form.burn_rate_usd) : undefined,
      runway_months: form.runway_months ? parseInt(form.runway_months) : undefined,
      competitors: form.competitors ? form.competitors.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      departments: departmentLabels,
      bdt_department_source_keys: selectedCatalogIds,
      bdt_custom_departments: customDepartments.filter(d => d.selected).map(d => d.label),
      bdtCompanySize,
      profile: {
        first_name: form.first_name.trim() || undefined,
        last_name: form.last_name.trim() || undefined,
        title: form.title.trim() || undefined,
      },
    };

    const company = await createCompany(payload, user.id);
    if (!company) { setError('Failed to create company. Please try again.'); setLoading(false); return; }

    // Departments + BDT tree are seeded server-side during company creation
    // (POST /api/companies → import_bdt_departments_from_json). Nothing to import here.

    const hasAnyMetric = form.mrr_usd || form.burn_rate_usd || form.employees || form.runway_months ||
      form.cltv_usd || form.cac_usd || form.monthly_churn_rate || form.nps_score;
    if (hasAnyMetric) {
      try {
        await api.post(`/api/metrics-onboarding/${company.id}/initial`, {
          mrr: parseFloat(form.mrr_usd) || 0, burn: parseFloat(form.burn_rate_usd) || 0,
          headcount: parseInt(form.employees) || 0, runway: parseInt(form.runway_months) || 0,
          ltv: parseFloat(form.cltv_usd) || 0, cac: parseFloat(form.cac_usd) || 0,
          churn: parseFloat(form.monthly_churn_rate) || 0, nps: parseFloat(form.nps_score) || 0,
        });
      } catch (metricsErr) {
        console.error('[onboarding] metrics save failed (non-fatal)', metricsErr);
      }
    }

    localStorage.setItem('onboarding_departments', JSON.stringify(departmentLabels));
    localStorage.setItem('onboarding_bdt_department_keys', JSON.stringify(selectedCatalogIds));
    await refreshProfile();
    navigate('/twin/data', { replace: true });
  }

  const selectedIndustry = INDUSTRIES.find(i => i.id === form.industry_id);
  const { subdomains: industrySubdomains } = useSubdomainsByIndustry(form.industry_id || null);

  /* ── Already has company ── */
  if (profile?.company_id) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', animation: 'ob-fade-in 0.4s ease' }}>
          <CheckCircle size={52} style={{ color: '#34d399', margin: '0 auto 20px' }} />
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 10px' }}>Already set up</h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', margin: '0 0 28px' }}>
            Your workspace is ready.
          </p>
          <button onClick={() => navigate('/overview', { replace: true })} style={{
            padding: '13px 32px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: `linear-gradient(135deg, #F9C6FF, ${ACCENT})`, color: '#0d0b1a',
            fontSize: 14, fontWeight: 700, fontFamily: FF,
          }}>
            Open Dashboard
          </button>
        </div>
      </PageShell>
    );
  }

  /* ── Choose screen ── */
  if (mode === 'choose') {
    return (
      <PageShell>
        <div style={{ width: '100%', maxWidth: 560, animation: 'ob-fade-in 0.4s ease' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(193,174,255,0.5)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>
              Getting started
            </p>
            <h1 style={{ fontSize: 38, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.15, margin: '0 0 12px' }}>
              How do you want<br />to get started?
            </h1>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
              Pick the option that fits your situation.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Create */}
            <button onClick={() => setMode('create')} style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 20, padding: '32px 28px', textAlign: 'left', cursor: 'pointer',
              transition: 'all 0.2s', fontFamily: FF,
            }}
              onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(193,174,255,0.35)'; e.currentTarget.style.background = 'rgba(193,174,255,0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.09)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(193,174,255,0.12)', border: '1px solid rgba(193,174,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Building2 size={20} color={ACCENT} />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
                Create a Workspace
              </h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.32)', margin: '0 0 20px', lineHeight: 1.55 }}>
                You're the founder. Set up your company, add metrics, and invite your team.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: ACCENT, fontSize: 13, fontWeight: 600 }}>
                Get started <ArrowRight size={14} />
              </div>
            </button>

            {/* Join */}
            <button onClick={() => { setMode('join'); if (joinCompanies.length === 0) void loadJoinCompanies(1, joinSearch); }} style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 20, padding: '32px 28px', textAlign: 'left', cursor: 'pointer',
              transition: 'all 0.2s', fontFamily: FF,
            }}
              onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(56,189,248,0.35)'; e.currentTarget.style.background = 'rgba(56,189,248,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.09)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Users size={20} color="#38bdf8" />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
                Join a Workspace
              </h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.32)', margin: '0 0 20px', lineHeight: 1.55 }}>
                Your team already uses WorkOS. Find your company and request access.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', fontSize: 13, fontWeight: 600 }}>
                Find workspace <ArrowRight size={14} />
              </div>
            </button>
          </div>

          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.18)', marginTop: 24 }}>
            Have an invite link?{' '}
            <span onClick={() => navigate('/join')} style={{ color: ACCENT, cursor: 'pointer' }}>
              Use it here
            </span>
          </p>
        </div>
      </PageShell>
    );
  }

  /* ── Join workspace screen ── */
  if (mode === 'join') {
    const joinTotalPages = Math.max(1, Math.ceil(joinTotal / JOIN_PAGE_SIZE));
    const joinStart = joinTotal === 0 ? 0 : (joinPage - 1) * JOIN_PAGE_SIZE + 1;
    const joinEnd = Math.min(joinPage * JOIN_PAGE_SIZE, joinTotal);

    if (joinJoined) {
      return (
        <PageShell>
          <div style={{ textAlign: 'center', maxWidth: 440, animation: 'ob-fade-in 0.4s ease' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Clock size={30} color="#fbbf24" />
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 10px' }}>Request Sent</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6, margin: '0 0 28px' }}>
              We've asked the owner of <span style={{ color: '#fff', fontWeight: 600 }}>{joinSelected?.name}</span> to approve your request. You'll get access once they accept it.
            </p>
            <button onClick={() => navigate('/', { replace: true })} style={{
              padding: '12px 28px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)',
              fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: FF,
            }}>
              Back to Home
            </button>
          </div>
        </PageShell>
      );
    }

    return (
      <PageShell>
        <div style={{ width: '100%', maxWidth: 560, animation: 'ob-fade-in 0.4s ease' }}>
          <button onClick={() => setMode('choose')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.28)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FF, marginBottom: 36 }}>
            <ChevronLeft size={16} /> Back
          </button>

          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', margin: '0 0 8px' }}>Find your workspace</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Search for your company and request read-only access.</p>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.25)' }} />
              <input
                value={joinSearch}
                onChange={e => { setJoinSearch(e.target.value); setJoinPage(1); }}
                placeholder="Search companies..."
                style={{ ...inputStyle, paddingLeft: 42, width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <button onClick={() => loadJoinCompanies(1, joinSearch)} disabled={joinSearching} style={{
              padding: '13px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${ACCENT}, #9b7fee)`, color: '#0d0b1a',
              fontFamily: FF, display: 'flex', alignItems: 'center',
            }}>
              {joinSearching ? <div style={{ width: 16, height: 16, border: '2px solid rgba(13,11,26,0.3)', borderTop: '2px solid #0d0b1a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : <Search size={16} />}
            </button>
          </div>

          {/* Results */}
          <div style={{ minHeight: 280 }}>
            {joinSearching && !joinHasLoaded ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.28)', fontSize: 14, gap: 12 }}>
                <div style={{ width: 24, height: 24, border: '2px solid rgba(193,174,255,0.2)', borderTop: '2px solid rgba(193,174,255,0.7)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Loading workspaces...
              </div>
            ) : joinCompanies.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: joinSearching ? 0.55 : 1, transition: 'opacity 0.15s' }}>
                {joinCompanies.map(r => {
                  const industryLabel = r.industry_id ? INDUSTRIES.find(i => i.id === r.industry_id)?.label ?? r.industry_id : 'Industry not set';
                  const isSelected = joinSelected?.id === r.id;
                  return (
                    <div key={r.id} onClick={() => setJoinSelected(r)} style={{
                      padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
                      background: isSelected ? 'rgba(56,189,248,0.07)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isSelected ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      transition: 'all 0.15s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}>{r.name}</span>
                            {isSelected && <Check size={14} color="#38bdf8" />}
                          </div>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>
                            {r.stage ?? 'Stage not set'} · {industryLabel}{r.country ? ` · ${r.country}` : ''}
                          </span>
                          {r.description && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', margin: '6px 0 0', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.description}</p>}
                        </div>
                        <button type="button" onClick={e => { e.stopPropagation(); void requestToJoin(r); }} disabled={loading} style={{
                          padding: '7px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                          background: `linear-gradient(135deg, #F9C6FF, ${ACCENT})`, color: '#0d0b1a',
                          fontSize: 12, fontWeight: 700, fontFamily: FF, flexShrink: 0,
                          opacity: loading ? 0.5 : 1,
                        }}>
                          Join
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>
                {joinSearch ? 'No workspaces match this search.' : 'No active workspaces yet.'}
                <div><button onClick={() => loadJoinCompanies(1, joinSearch)} style={{ fontSize: 12, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', marginTop: 8 }}>Refresh</button></div>
              </div>
            )}
          </div>

          {joinTotal > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>
                {joinStart}–{joinEnd} of {joinTotal} · Page {joinPage}/{joinTotalPages}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['Prev', Math.max(1, joinPage - 1), joinPage <= 1], ['Next', Math.min(joinTotalPages, joinPage + 1), joinPage >= joinTotalPages]].map(([label, page, disabled]) => (
                  <button key={label as string} type="button" onClick={() => loadJoinCompanies(page as number, joinSearch)} disabled={joinSearching || Boolean(disabled)} style={{
                    padding: '7px 14px', borderRadius: 10, border: '1px solid rgba(193,174,255,0.18)',
                    background: 'rgba(255,255,255,0.03)', color: ACCENT, fontSize: 12, cursor: 'pointer',
                    fontFamily: FF, opacity: Boolean(disabled) ? 0.35 : 1,
                  }}>
                    {label as string}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ marginTop: 16, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171' }}>{error}</div>}

          <button onClick={() => void (joinSelected && requestToJoin(joinSelected))} disabled={!joinSelected || loading} style={{
            width: '100%', padding: '14px', borderRadius: 12, marginTop: 20, border: 'none', cursor: !joinSelected ? 'not-allowed' : 'pointer',
            background: `linear-gradient(135deg, #F9C6FF, ${ACCENT})`, color: '#0d0b1a',
            fontSize: 14, fontWeight: 700, fontFamily: FF, opacity: !joinSelected ? 0.35 : 1,
            transition: 'opacity 0.2s',
          }}>
            {loading ? 'Sending request…' : `Request to Join ${joinSelected?.name ?? 'Workspace'}`}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
            <Clock size={13} />
            The company owner must approve your request before you get access.
          </div>
        </div>
      </PageShell>
    );
  }

  /* ── Create wizard ── */
  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <PageShell>
      {/* Step counter top-right */}
      <div style={{ position: 'fixed', top: 30, right: 36, zIndex: 20, fontSize: 12, color: 'rgba(255,255,255,0.28)', fontFamily: FF }}>
        {step} of {STEPS.length}
      </div>

      {/* Thin progress bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.06)', zIndex: 20 }}>
        <div style={{ height: '100%', background: `linear-gradient(90deg, #F9C6FF, ${ACCENT})`, width: `${progress}%`, transition: 'width 0.4s ease', borderRadius: 1 }} />
      </div>

      <div style={{ width: '100%', maxWidth: 600, animation: 'ob-fade-in 0.35s ease' }}>

        {/* Step heading */}
        <div style={{ marginBottom: 36 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(193,174,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px' }}>
            Step {step} — {STEPS[step - 1].label}
          </p>
          <h2 style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.025em', margin: 0, lineHeight: 1.2 }}>
            {step === 1 && 'Tell us about your company'}
            {step === 2 && "What's your story?"}
            {step === 3 && 'Key metrics & numbers'}
            {step === 4 && 'Build your Digital Twin'}
            {step === 5 && 'Choose your company size'}
            {step === 6 && 'About the founder'}
            {step === 7 && 'Ready to launch'}
          </h2>
          {step === 3 && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', margin: '8px 0 0' }}>All optional — add what you know. You can update these anytime.</p>}
        </div>

        {/* Step content */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <OField label="Company name *">
              <OInput placeholder="e.g. Acme Fintech" value={form.name} onChange={e => update('name', e.target.value)} />
            </OField>
            <OField label="Industry *">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {INDUSTRIES.map(ind => {
                  const active = form.industry_id === ind.id;
                  return (
                    <button key={ind.id} type="button" onClick={() => { update('industry_id', ind.id); update('subdomain_id', ''); }} style={{
                      padding: '10px 14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                      background: active ? 'rgba(193,174,255,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${active ? 'rgba(193,174,255,0.35)' : 'rgba(255,255,255,0.07)'}`,
                      color: active ? ACCENT : 'rgba(255,255,255,0.45)',
                      fontSize: 13, fontWeight: 500, fontFamily: FF, transition: 'all 0.15s',
                    }}>
                      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: ind.color, marginRight: 8, verticalAlign: 'middle' }} />
                      {ind.label}
                    </button>
                  );
                })}
              </div>
            </OField>
            {form.industry_id && industrySubdomains.length > 0 && (
              <OField label="Sub-domain">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {industrySubdomains.map(sd => {
                    const active = form.subdomain_id === sd.id;
                    return (
                      <button key={sd.id} type="button" onClick={() => update('subdomain_id', sd.id)} style={{
                        padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
                        background: active ? 'rgba(193,174,255,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${active ? 'rgba(193,174,255,0.35)' : 'rgba(255,255,255,0.07)'}`,
                        color: active ? ACCENT : 'rgba(255,255,255,0.4)',
                        fontSize: 12, fontWeight: 500, textAlign: 'left', fontFamily: FF,
                      }}>
                        {sd.label}
                      </button>
                    );
                  })}
                </div>
              </OField>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <OField label="Stage">
                <OSelect value={form.stage} onChange={e => update('stage', e.target.value)}>
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </OSelect>
              </OField>
              <OField label="Country">
                <OSelect value={form.country} onChange={e => update('country', e.target.value)}>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </OSelect>
              </OField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <OField label="Founded year" hint="Optional">
                <OInput type="number" placeholder="2022" min={1990} max={2025} value={form.founded_year} onChange={e => update('founded_year', e.target.value)} />
              </OField>
              <OField label="Website" hint="Optional">
                <OInput type="url" placeholder="https://yourco.com" value={form.website} onChange={e => update('website', e.target.value)} />
              </OField>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <OField label="One-line description *">
              <OTextarea placeholder="What does your company do in one sentence?" value={form.description} onChange={e => update('description', e.target.value)} />
            </OField>
            <OField label="Problem you solve" hint="Optional but helps your Twin graph">
              <OTextarea placeholder="What problem are you solving and for whom?" value={form.problem_solved} onChange={e => update('problem_solved', e.target.value)} />
            </OField>
            <OField label="Unique selling point" hint="Optional">
              <OInput placeholder="What makes you different?" value={form.usp} onChange={e => update('usp', e.target.value)} />
            </OField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <OField label="Target market" hint="Optional">
                <OInput placeholder="SMBs in India, D2C…" value={form.target_market} onChange={e => update('target_market', e.target.value)} />
              </OField>
              <OField label="Business model" hint="Optional">
                <OSelect value={form.business_model} onChange={e => update('business_model', e.target.value)}>
                  <option value="">Select…</option>
                  {BUSINESS_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </OSelect>
              </OField>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <OField label="Team size">
                <OInput type="number" min={1} placeholder="10" value={form.employees} onChange={e => update('employees', e.target.value)} />
              </OField>
              <OField label={`Monthly Revenue (${getCurrencyCodeForCountry(form.country)})`}>
                <OInput type="number" min={0} placeholder="50000" value={form.mrr_usd} onChange={e => update('mrr_usd', e.target.value)} />
              </OField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <OField label={`Monthly Burn (${getCurrencyCodeForCountry(form.country)})`}>
                <OInput type="number" min={0} placeholder="30000" value={form.burn_rate_usd} onChange={e => update('burn_rate_usd', e.target.value)} />
              </OField>
              <OField label="Runway (months)">
                <OInput type="number" min={0} placeholder="18" value={form.runway_months} onChange={e => update('runway_months', e.target.value)} />
              </OField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <OField label={`CLTV (${getCurrencyCodeForCountry(form.country)})`} hint="Optional">
                <OInput type="number" min={0} placeholder="1200" value={form.cltv_usd} onChange={e => update('cltv_usd', e.target.value)} />
              </OField>
              <OField label={`CAC (${getCurrencyCodeForCountry(form.country)})`} hint="Optional">
                <OInput type="number" min={0} placeholder="95" value={form.cac_usd} onChange={e => update('cac_usd', e.target.value)} />
              </OField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <OField label="Monthly Churn (%)" hint="Optional">
                <OInput type="number" min={0} max={100} step={0.1} placeholder="4.2" value={form.monthly_churn_rate} onChange={e => update('monthly_churn_rate', e.target.value)} />
              </OField>
              <OField label="NPS Score" hint="Optional — −100 to 100">
                <OInput type="number" min={-100} max={100} placeholder="42" value={form.nps_score} onChange={e => update('nps_score', e.target.value)} />
              </OField>
            </div>
            <OField label="Competitors" hint="Comma-separated">
              <OInput placeholder="Stripe, Razorpay, …" value={form.competitors} onChange={e => update('competitors', e.target.value)} />
            </OField>
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'rgba(193,174,255,0.05)', borderRadius: 12, border: '1px solid rgba(193,174,255,0.12)' }}>
              <Sparkles size={15} color={ACCENT} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                {departmentsLoading ? 'AI is suggesting departments…' : aiSuggestedIds.length > 0 ? `AI selected ${aiSuggestedIds.length} departments based on your company` : 'Select departments for your Business Digital Twin'}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: ACCENT, fontWeight: 600 }}>{countSelectedDepartments()} selected</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {(['Direction', 'Build', 'Market', 'Delivery', 'Control', 'People'] as const).map(cluster => {
                const items = bdtCatalog.filter(d => d.cluster === cluster);
                if (items.length === 0) return null;
                return (
                  <div key={cluster}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 10px' }}>{cluster}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {items.map(item => {
                        const isSelected = selectedCatalogIds.includes(item.id);
                        const chip = getDepartmentChipStyle(item.color, isSelected);
                        return (
                          <button key={item.id} type="button" onClick={() => toggleCatalogDepartment(item.id)} style={{
                            padding: '8px 14px', borderRadius: 10, border: chip.border,
                            background: chip.background, color: chip.color,
                            fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: FF,
                            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                          }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, boxShadow: isSelected ? `0 0 6px ${item.color}88` : 'none', flexShrink: 0 }} />
                            {isSelected && <Check size={12} style={{ color: item.color }} />}
                            {item.label}
                            {aiSuggestedIds.includes(item.id) && <span style={{ fontSize: 9, opacity: 0.5 }}>AI</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {customDepartments.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 10px' }}>Custom</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {customDepartments.map(item => {
                      const chip = getDepartmentChipStyle(item.color, item.selected);
                      return (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button type="button" onClick={() => toggleCustomDepartment(item.id)} style={{
                            padding: '8px 14px', borderRadius: 10, border: chip.border,
                            background: chip.background, color: chip.color,
                            fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: FF,
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                            {item.selected && <Check size={12} style={{ color: item.color }} />}
                            {item.label}
                          </button>
                          <button type="button" onClick={() => removeCustomDepartment(item.id)} style={{ padding: '6px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex' }}>
                            <X size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <OInput
                  type="text" placeholder="Add a custom department…" value={customDeptInput}
                  onChange={e => setCustomDeptInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomDepartment(); } }}
                />
                <button type="button" onClick={addCustomDepartment} style={{
                  padding: '13px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: ACCENT, color: '#0d0b1a', fontWeight: 700, fontSize: 13,
                  fontFamily: FF, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ padding: '14px 16px', background: 'rgba(193,174,255,0.05)', borderRadius: 12, border: '1px solid rgba(193,174,255,0.12)' }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                This controls how many departments are active in your Business Digital Twin. You can change it later in Settings.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {SIZE_OPTIONS.map(option => {
                const selected = bdtCompanySize === option.key;
                const visibleCount = bdtSizeCatalog?.sizeConfigs[option.key]?.visibleDeptIds.length ?? 0;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setBdtCompanySize(option.key)}
                    style={{
                      width: '100%',
                      padding: '16px 18px',
                      borderRadius: 14,
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: selected ? 'rgba(193,174,255,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selected ? 'rgba(193,174,255,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      fontFamily: FF,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: selected ? ACCENT : '#fff', marginBottom: 4 }}>
                        {option.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                        {option.description}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: selected ? ACCENT : 'rgba(255,255,255,0.28)', fontWeight: 600 }}>
                        {visibleCount} active
                      </span>
                      {selected && <Check size={16} color={ACCENT} />}
                    </div>
                  </button>
                );
              })}
            </div>

            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', margin: 0 }}>
              All core departments are still created in your BDT. This setting controls which ones are visible and active at launch.
            </p>
          </div>
        )}

        {step === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <OField label="First name *">
                <OInput placeholder="Arjun" value={form.first_name} onChange={e => update('first_name', e.target.value)} />
              </OField>
              <OField label="Last name">
                <OInput placeholder="Sharma" value={form.last_name} onChange={e => update('last_name', e.target.value)} />
              </OField>
            </div>
            <OField label="Title / Role" hint="e.g. CEO, Co-founder & CTO">
              <OInput placeholder="Founder & CEO" value={form.title} onChange={e => update('title', e.target.value)} />
            </OField>
          </div>
        )}

        {step === 7 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ padding: '20px 22px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: selectedIndustry?.color ?? ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#0d0b1a', flexShrink: 0 }}>
                  {form.name.charAt(0).toUpperCase() || '?'}
                </div>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{form.name || '—'}</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: '0 0 8px' }}>
                    {selectedIndustry?.label ?? '—'} · {form.stage} · {form.country}
                  </p>
                  {form.description && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.5 }}>{form.description}</p>}
                </div>
              </div>
            </div>

            <div style={{ padding: '18px 20px', background: 'rgba(193,174,255,0.05)', border: '1px solid rgba(193,174,255,0.12)', borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.24)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 6px' }}>
                    Company Size
                  </p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
                    {SIZE_OPTIONS.find(option => option.key === bdtCompanySize)?.label ?? 'Standard'}
                  </p>
                </div>
                <span style={{ fontSize: 12, color: ACCENT, fontWeight: 600 }}>
                  {bdtSizeCatalog?.sizeConfigs[bdtCompanySize]?.visibleDeptIds.length ?? 0} active departments
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                'Your company is created and placed in the Twin graph',
                `Positioned in the ${selectedIndustry?.label ?? 'selected'} industry cluster`,
                'You are added as Founder with full access',
                'You can invite team members after launch',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(193,174,255,0.1)', border: '1px solid rgba(193,174,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={12} color={ACCENT} />
                  </div>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ marginTop: 20, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#f87171' }}>
            {error}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 40 }}>
          <button type="button" onClick={step === 1 ? () => setMode('choose') : prevStep} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '12px 20px', borderRadius: 12,
            border: 'none', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)',
            fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: FF,
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
          >
            <ChevronLeft size={16} />
            {step === 1 ? 'Choose' : 'Back'}
          </button>

          {step < 7 ? (
            <button type="button" onClick={nextStep} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '13px 28px', borderRadius: 12,
              border: 'none', background: `linear-gradient(135deg, #F9C6FF, ${ACCENT})`,
              color: '#0d0b1a', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FF,
              boxShadow: '0 6px 20px rgba(193,174,255,0.3)', transition: 'transform 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              Continue <ChevronRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={handleLaunch} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '13px 28px', borderRadius: 12,
              border: 'none', background: `linear-gradient(135deg, #F9C6FF, ${ACCENT})`,
              color: '#0d0b1a', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: FF, boxShadow: '0 6px 20px rgba(193,174,255,0.3)',
              opacity: loading ? 0.6 : 1, transition: 'transform 0.15s',
            }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {loading ? 'Launching…' : 'Launch in Twin'} {!loading && <Hexagon size={15} />}
            </button>
          )}
        </div>
      </div>
    </PageShell>
  );
}
