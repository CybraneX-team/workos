import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search, Users, DollarSign, Star, StarOff, Zap, X,
  Activity, Flame, ChevronRight, MapPin,
} from 'lucide-react';
import { COMPANIES } from '../db/companies';
import { INDUSTRIES } from '../db/industries';
import { getAllLocalCompanies } from '../lib/localCompanies';

/* ── Portfolio persistence ── */
const VC_PORTFOLIO_KEY = 'vc_portfolio_companies';
export function getVCPortfolio(): string[] {
  try { return JSON.parse(localStorage.getItem(VC_PORTFOLIO_KEY) ?? '[]'); }
  catch { return []; }
}
export function toggleVCPortfolio(id: string): string[] {
  const current = getVCPortfolio();
  const updated = current.includes(id) ? current.filter(c => c !== id) : [...current, id];
  localStorage.setItem(VC_PORTFOLIO_KEY, JSON.stringify(updated));
  return updated;
}

/* ── Constants ── */
const STAGE_COLORS: Record<string, string> = {
  'Idea': '#6b7280', 'Pre-seed': '#8b5cf6', 'Seed': '#a78bfa',
  'Series A': '#22d3ee', 'Series B': '#34d399', 'Series C': '#fbbf24',
  'Series D+': '#fb923c', 'Series E': '#f87171', 'Series F': '#ef4444',
  'Pre-IPO': '#ec4899', 'Public': '#10b981', 'Bootstrapped': '#6ee7b7', 'PSU': '#93c5fd',
};
const STATUS_COLORS: Record<string, string> = {
  healthy: '#22c55e', warning: '#f59e0b', critical: '#ef4444',
};

/* ── Helpers ── */
function fmt(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function stageBadge(stage: string) {
  const c = STAGE_COLORS[stage] ?? '#5E5E5E';
  return (
    <span style={{ background: `${c}14`, color: c, border: `1px solid ${c}28`, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, whiteSpace: 'nowrap' }}>
      {stage}
    </span>
  );
}

function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  const init = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${color}14`, border: `1px solid ${color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.max(9, size * 0.33), fontWeight: 700, color,
    }}>{init}</div>
  );
}

/* ── Detail Modal ── */
function CompanyModal({ company, ind, inPortfolio, onToggle, onClose }: {
  company: any; ind: any; inPortfolio: boolean; onToggle: () => void; onClose: () => void;
}) {
  const color = ind?.color ?? '#7c3aed';
  const statusColor = STATUS_COLORS[company.status ?? 'healthy'] ?? '#22c55e';

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const mrr = company.mrrUSD ?? company.mrr_usd;
  const founded = company.founded ?? company.founded_year;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(20px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl flex flex-col"
        style={{
          background: 'rgba(14,14,18,0.96)',
          border: `1px solid ${color}22`,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.04), 0 32px 64px rgba(0,0,0,0.6)`,
          backdropFilter: 'blur(40px)',
        }}>

        {/* Header */}
        <div className="flex items-start gap-3 p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Avatar name={company.name} color={color} size={44} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-base font-semibold text-white truncate">{company.name}</h2>
              {company._isLocal && (
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#22d3ee12', color: '#22d3ee', border: '1px solid #22d3ee20' }}>LOCAL</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {stageBadge(company.stage)}
              {(company.isPublic || company.is_public) && (
                <span style={{ fontSize: 9, padding: '1px 7px', borderRadius: 99, background: '#10b98112', color: '#10b981', border: '1px solid #10b98125', fontWeight: 600 }}>PUBLIC</span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#5E5E5E' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                {ind?.label ?? company.industryId}
              </span>
              {(company.subdomain || company.subdomain_id) && (
                <span style={{ fontSize: 11, color: '#3d3d4a' }}>· {company.subdomain ?? company.subdomain_id}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/6 transition-colors shrink-0" style={{ color: '#5E5E5E' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 flex-1">
          <div className="flex items-center gap-3 text-xs" style={{ color: '#5E5E5E' }}>
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{company.country}</span>
            {founded && <span>· Est. {founded}</span>}
          </div>

          {company.description && (
            <p className="text-sm leading-relaxed" style={{ color: '#8a8a9a' }}>{company.description}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'MRR', value: mrr ? fmt(mrr) : '—' },
              { label: 'Team', value: company.employees ? company.employees.toLocaleString() : '—' },
              { label: 'Valuation', value: company.valuation && company.valuation !== '—' ? `$${company.valuation}` : '—' },
              { label: 'Founded', value: founded ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3d3d4a', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{value}</div>
              </div>
            ))}
          </div>

          {company._isLocal && (
            <div className="grid grid-cols-2 gap-2">
              {company.burn_rate_usd > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3d3d4a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Flame className="w-3 h-3" style={{ color: '#f87171' }} /> Burn Rate
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{fmt(company.burn_rate_usd)}<span style={{ fontSize: 10, fontWeight: 400, color: '#3d3d4a' }}>/mo</span></div>
                </div>
              )}
              {company.runway_months > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3d3d4a', marginBottom: 4 }}>Runway</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{company.runway_months}<span style={{ fontSize: 10, fontWeight: 400, color: '#3d3d4a' }}> mo</span></div>
                </div>
              )}
              {company.target_market && (
                <div className="col-span-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3d3d4a', marginBottom: 4 }}>Target Market</div>
                  <div style={{ fontSize: 12, color: '#8a8a9a' }}>{company.target_market}</div>
                </div>
              )}
              {company.usp && (
                <div className="col-span-2" style={{ background: `${color}08`, border: `1px solid ${color}18`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3d3d4a', marginBottom: 4 }}>Unique Value Prop</div>
                  <div style={{ fontSize: 12, color: '#8a8a9a' }}>{company.usp}</div>
                </div>
              )}
            </div>
          )}

          {company.investors?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3d3d4a', marginBottom: 8 }}>Backed by</div>
              <div className="flex flex-wrap gap-1.5">
                {company.investors.map((inv: string) => (
                  <span key={inv} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#6a6a7a' }}>{inv}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onToggle}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-85"
            style={inPortfolio
              ? { background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.18)' }
              : { background: `${color}18`, color, border: `1px solid ${color}30` }}>
            {inPortfolio
              ? <><StarOff className="w-4 h-4" /> Remove from Portfolio</>
              : <><Star className="w-4 h-4" /> Add to Portfolio</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Company List Row ── */
function CompanyRow({ company, ind, inPortfolio, onSelect }: {
  company: any; ind: any; inPortfolio: boolean; onSelect: () => void;
}) {
  const color = ind?.color ?? '#7c3aed';
  const statusColor = STATUS_COLORS[company.status ?? 'healthy'] ?? '#22c55e';
  const mrr = company.mrrUSD ?? company.mrr_usd;

  return (
    <div onClick={onSelect}
      className="flex items-center gap-4 px-4 py-3 cursor-pointer group transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

      <Avatar name={company.name} color={color} size={32} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{company.name}</span>
          {inPortfolio && <Star className="w-3 h-3 shrink-0" style={{ color: '#fbbf24' }} fill="#fbbf24" />}
          {company._isLocal && (
            <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: '#22d3ee10', color: '#22d3ee', flexShrink: 0 }}>LOCAL</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px]" style={{ color: '#3d3d52' }}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
          <span>{ind?.label ?? company.industryId}</span>
          {(company.subdomain || company.subdomain_id) && (
            <><span style={{ color: '#2a2a38' }}>·</span><span>{company.subdomain ?? company.subdomain_id}</span></>
          )}
        </div>
      </div>

      <div className="hidden sm:block shrink-0">{stageBadge(company.stage)}</div>

      <div className="hidden md:flex items-center gap-1 shrink-0 w-20" style={{ color: '#4a4a5e', fontSize: 12 }}>
        {mrr ? <><DollarSign className="w-3 h-3" />{fmt(mrr)}</> : <span style={{ color: '#2a2a38' }}>—</span>}
      </div>

      <div className="hidden lg:flex items-center gap-1 shrink-0 w-20" style={{ color: '#4a4a5e', fontSize: 12 }}>
        {company.employees ? <><Users className="w-3 h-3" />{company.employees.toLocaleString()}</> : <span style={{ color: '#2a2a38' }}>—</span>}
      </div>

      <div className="hidden xl:block shrink-0 w-16 text-xs truncate" style={{ color: '#3d3d52' }}>
        {company.country}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: '#fff' }} />
      </div>
    </div>
  );
}

/* ── Static data ── */
const ALL_STAGES = [...new Set(COMPANIES.map(c => c.stage))].sort();
const ALL_COUNTRIES = [...new Set(COMPANIES.map(c => c.country))].sort();

/* ── Main Page ── */
export default function VCFindStartups() {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [portfolio, setPortfolio] = useState<string[]>(getVCPortfolio);

  const localCos = useMemo(() => getAllLocalCompanies().map(c => ({
    id: c.id, name: c.name, industryId: c.industry_id, country: c.country,
    stage: c.stage, founded: c.founded_year ?? undefined,
    isPublic: c.is_public, valuation: c.valuation ?? '—',
    mrrUSD: c.mrr_usd, employees: c.employees,
    investors: [] as string[], description: c.description ?? undefined,
    status: 'healthy' as const, offset3D: [0, 0, 0] as [number, number, number],
    subdomain: c.subdomain_id ?? undefined,
    _isLocal: true,
    burn_rate_usd: c.burn_rate_usd, runway_months: c.runway_months,
    business_model: c.business_model, target_market: c.target_market, usp: c.usp,
  })), []);

  const allCompanies = useMemo(() => [...COMPANIES, ...localCos], [localCos]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allCompanies.filter(c => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.description ?? '').toLowerCase().includes(q)) return false;
      if (stageFilter && c.stage !== stageFilter) return false;
      if (countryFilter && c.country !== countryFilter) return false;
      if (industryFilter && c.industryId !== industryFilter) return false;
      return true;
    });
  }, [allCompanies, search, stageFilter, countryFilter, industryFilter]);

  const companiesByIndustry = useMemo(() => {
    const map = new Map<string, number>();
    INDUSTRIES.forEach(ind => map.set(ind.id, 0));
    filtered.forEach(c => { map.set(c.industryId, (map.get(c.industryId) ?? 0) + 1); });
    return map;
  }, [filtered]);

  const getIndustry = useCallback((id: string) => INDUSTRIES.find(i => i.id === id), []);
  const togglePortfolio = (id: string) => setPortfolio(toggleVCPortfolio(id));
  const hasFilters = !!(search || stageFilter || countryFilter || industryFilter);

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap className="w-4 h-4" style={{ color: '#22d3ee' }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">Find Startups</h1>
            <p className="text-xs mt-0.5" style={{ color: '#3d3d52' }}>
              <span className="text-white">{allCompanies.length}</span> companies ·{' '}
              <span className="text-white">{INDUSTRIES.length}</span> industries ·{' '}
              <span style={{ color: '#fbbf24' }}>{portfolio.length}</span> in portfolio
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#3d3d52' }} />
          <input type="text" placeholder="Search startups…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#fff' }} />
        </div>

        {[
          { value: stageFilter, onChange: (v: string) => setStageFilter(v), placeholder: 'Stage', options: ALL_STAGES },
          { value: countryFilter, onChange: (v: string) => setCountryFilter(v), placeholder: 'Country', options: ALL_COUNTRIES },
        ].map(({ value, onChange, placeholder, options }) => (
          <select key={placeholder} value={value} onChange={e => onChange(e.target.value)}
            className="rounded-xl px-3 py-2.5 text-sm outline-none cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: value ? '#fff' : '#3d3d52' }}>
            <option value="">{placeholder}</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}

        {hasFilters && (
          <button onClick={() => { setSearch(''); setStageFilter(''); setCountryFilter(''); setIndustryFilter(''); }}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm transition-colors hover:bg-white/4"
            style={{ color: '#3d3d52', border: '1px solid rgba(255,255,255,0.06)' }}>
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Industry tabs */}
      <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
        <button onClick={() => setIndustryFilter('')}
          className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0"
          style={{
            background: !industryFilter ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: !industryFilter ? '#fff' : '#3d3d52',
            border: !industryFilter ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
          }}>
          All <span style={{ color: '#3d3d52', marginLeft: 3 }}>{filtered.length}</span>
        </button>
        {INDUSTRIES.map(ind => {
          const count = companiesByIndustry.get(ind.id) ?? 0;
          const active = industryFilter === ind.id;
          return (
            <button key={ind.id} onClick={() => setIndustryFilter(active ? '' : ind.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0"
              style={{
                background: active ? `${ind.color}14` : 'transparent',
                color: active ? ind.color : '#3d3d52',
                border: active ? `1px solid ${ind.color}28` : '1px solid transparent',
              }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? ind.color : '#3d3d52', flexShrink: 0 }} />
              {ind.label}
              <span style={{ color: active ? `${ind.color}80` : '#2a2a38', marginLeft: 1 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Company list */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden', backdropFilter: 'blur(20px)' }}>
        {/* Table header */}
        <div className="flex items-center gap-4 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ width: 32, flexShrink: 0 }} />
          <div className="flex-1 text-[10px] uppercase tracking-widest" style={{ color: '#2a2a38' }}>Company</div>
          <div className="hidden sm:block shrink-0 w-20 text-[10px] uppercase tracking-widest" style={{ color: '#2a2a38' }}>Stage</div>
          <div className="hidden md:block shrink-0 w-20 text-[10px] uppercase tracking-widest" style={{ color: '#2a2a38' }}>MRR</div>
          <div className="hidden lg:block shrink-0 w-20 text-[10px] uppercase tracking-widest" style={{ color: '#2a2a38' }}>Team</div>
          <div className="hidden xl:block shrink-0 w-16 text-[10px] uppercase tracking-widest" style={{ color: '#2a2a38' }}>Country</div>
          <div style={{ width: 30, flexShrink: 0 }} />
        </div>

        {filtered.map(company => (
          <CompanyRow key={company.id}
            company={company}
            ind={getIndustry(company.industryId)}
            inPortfolio={portfolio.includes(company.id)}
            onSelect={() => setSelected(company)}
          />
        ))}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity className="w-5 h-5" style={{ color: '#2a2a38' }} />
            </div>
            <div>
              <p className="text-sm font-medium text-white text-center">No startups found</p>
              <p className="text-xs text-center mt-0.5" style={{ color: '#3d3d52' }}>Adjust filters or search</p>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <CompanyModal
          company={selected}
          ind={getIndustry(selected.industryId)}
          inPortfolio={portfolio.includes(selected.id)}
          onToggle={() => togglePortfolio(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
