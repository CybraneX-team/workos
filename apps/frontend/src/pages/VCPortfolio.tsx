import { useState } from 'react';
import {
  Star, Users, DollarSign, Building2,
  Globe, Trash2, Award,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { COMPANIES } from '../db/companies';
import { INDUSTRIES } from '../db/industries';
import { getAllLocalCompanies } from '../lib/localCompanies';
import { getVCPortfolio, toggleVCPortfolio } from './VCFindStartups';

/* ── Helpers ── */
const STAGE_COLORS: Record<string, string> = {
  'Idea': '#6b7280', 'Pre-seed': '#8b5cf6', 'Seed': '#a78bfa',
  'Series A': '#22d3ee', 'Series B': '#34d399', 'Series C': '#fbbf24',
  'Series D+': '#fb923c', 'Series E': '#f87171', 'Series F': '#ef4444',
  'Pre-IPO': '#ec4899', 'Public': '#10b981', 'Bootstrapped': '#6ee7b7',
};

function fmt(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function stageBadge(stage: string) {
  const color = STAGE_COLORS[stage] ?? '#5E5E5E';
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
    >
      {stage}
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'healthy') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-400" />;
  return <AlertTriangle className="w-4 h-4 text-red-400" />;
}

/* ── Expanded company card ── */
function PortfolioCard({
  company,
  industryLabel,
  industryColor,
  onRemove,
}: {
  company: any;
  industryLabel: string;
  industryColor: string;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: '#1B1B1D',
        border: `1px solid ${industryColor}25`,
        boxShadow: `0 0 20px ${industryColor}08`,
      }}
    >
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${industryColor}15`, border: `1px solid ${industryColor}25` }}>
          <Building2 className="w-5 h-5" style={{ color: industryColor }} />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-white truncate">{company.name}</h3>
            <StatusIcon status={company.status ?? 'healthy'} />
            {(company as any)._isLocal && (
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#22d3ee15', color: '#22d3ee' }}>LOCAL</span>
            )}
          </div>
          <p className="text-[11px]" style={{ color: '#5E5E5E' }}>
            {industryLabel} · {company.country}
          </p>
        </div>

        {/* Stage */}
        <div className="hidden sm:block">{stageBadge(company.stage)}</div>

        {/* MRR */}
        <div className="hidden md:flex flex-col items-end gap-0.5">
          <span className="text-xs font-semibold text-white">
            {company.mrrUSD ? fmt(company.mrrUSD) : '—'}
          </span>
          <span className="text-[10px]" style={{ color: '#5E5E5E' }}>MRR</span>
        </div>

        {/* Team */}
        <div className="hidden lg:flex flex-col items-end gap-0.5">
          <span className="text-xs font-semibold text-white">
            {company.employees ? company.employees.toLocaleString() : '—'}
          </span>
          <span className="text-[10px]" style={{ color: '#5E5E5E' }}>Team</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: '#5E5E5E' }}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
            style={{ color: '#5E5E5E' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
            onMouseLeave={e => (e.currentTarget.style.color = '#5E5E5E')}
            title="Remove from portfolio"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="px-5 pb-5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          {company.description && (
            <p className="text-sm leading-relaxed mt-4 mb-4" style={{ color: '#9ca3af' }}>
              {company.description}
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Valuation', value: company.valuation ? `$${company.valuation}` : '—' },
              { label: 'Founded', value: company.founded ?? '—' },
              { label: 'MRR', value: company.mrrUSD ? fmt(company.mrrUSD) : '—' },
              { label: 'Headcount', value: company.employees ? `${company.employees.toLocaleString()}` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl p-3" style={{ background: '#161618' }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#5E5E5E' }}>{label}</p>
                <p className="text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>

          {company.investors?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#5E5E5E' }}>Co-investors</p>
              <div className="flex flex-wrap gap-1.5">
                {company.investors.map((inv: string) => (
                  <span key={inv} className="text-xs px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af' }}>
                    {inv}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ── */
export default function VCPortfolio() {
  const [portfolioIds, setPortfolioIds] = useState<string[]>(getVCPortfolio);

  const localCos = getAllLocalCompanies().map(c => ({
    id: c.id,
    name: c.name,
    industryId: c.industry_id,
    country: c.country,
    stage: c.stage,
    founded: c.founded_year ?? undefined,
    isPublic: false,
    valuation: '—',
    mrrUSD: c.mrr_usd,
    employees: c.employees,
    investors: [],
    description: c.description ?? undefined,
    status: 'healthy' as const,
    offset3D: [0, 0, 0] as [number, number, number],
    _isLocal: true,
  }));

  const allCompanies = [...COMPANIES, ...localCos];

  const portfolioCompanies = portfolioIds
    .map(id => allCompanies.find(c => c.id === id))
    .filter(Boolean) as typeof allCompanies;

  function handleRemove(id: string) {
    setPortfolioIds(toggleVCPortfolio(id));
  }

  function getIndustry(industryId: string) {
    return INDUSTRIES.find(i => i.id === industryId);
  }

  // Aggregate stats
  const totalMRR = portfolioCompanies.reduce((s, c) => s + (c.mrrUSD ?? 0), 0);
  const totalTeam = portfolioCompanies.reduce((s, c) => s + (c.employees ?? 0), 0);
  const stageBreakdown = portfolioCompanies.reduce<Record<string, number>>((acc, c) => {
    acc[c.stage] = (acc[c.stage] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #a78bfa20, #a78bfa10)', border: '1px solid #a78bfa30' }}>
            <Award className="w-4.5 h-4.5" style={{ color: '#a78bfa' }} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">My Portfolio</h1>
        </div>
        <p className="text-sm" style={{ color: '#5E5E5E' }}>
          Manage and monitor your funded startups
        </p>
      </div>

      {portfolioCompanies.length === 0 ? (
        /* ── Empty state ── */
        <div className="rounded-2xl p-16 text-center" style={{ background: '#1B1B1D', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Star className="w-12 h-12 mx-auto mb-4 opacity-20" style={{ color: '#a78bfa' }} />
          <p className="text-white font-semibold mb-2">No portfolio companies yet</p>
          <p className="text-sm mb-6" style={{ color: '#5E5E5E' }}>
            Browse startups and add them to your portfolio to track them here.
          </p>
          <a
            href="/vc/find"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #22d3ee, #22d3ee99)', color: '#161618' }}
          >
            Find Startups →
          </a>
        </div>
      ) : (
        <>
          {/* ── Portfolio stats ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { icon: Star, label: 'Companies', value: portfolioCompanies.length, color: '#a78bfa' },
              { icon: DollarSign, label: 'Total MRR', value: fmt(totalMRR), color: '#22d3ee' },
              { icon: Users, label: 'Total Team', value: totalTeam.toLocaleString(), color: '#34d399' },
              { icon: Globe, label: 'Countries', value: new Set(portfolioCompanies.map(c => c.country)).size, color: '#fbbf24' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="rounded-2xl p-5" style={{ background: '#1B1B1D', border: `1px solid ${color}20` }}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4" style={{ color }} />
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: '#5E5E5E' }}>{label}</span>
                </div>
                <p className="text-xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>

          {/* ── Stage breakdown ── */}
          {Object.keys(stageBreakdown).length > 1 && (
            <div className="rounded-2xl p-5 mb-6" style={{ background: '#1B1B1D', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#5E5E5E' }}>Stage Distribution</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stageBreakdown).map(([stage, count]) => {
                  const color = STAGE_COLORS[stage] ?? '#5E5E5E';
                  return (
                    <div key={stage} className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                      style={{ background: `${color}12`, border: `1px solid ${color}25` }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                      <span className="text-xs font-medium" style={{ color }}>{stage}</span>
                      <span className="text-xs" style={{ color: '#5E5E5E' }}>×{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Company list ── */}
          <div className="flex flex-col gap-3">
            {portfolioCompanies.map(company => {
              const ind = getIndustry(company.industryId);
              return (
                <PortfolioCard
                  key={company.id}
                  company={company}
                  industryLabel={ind?.label ?? company.industryId}
                  industryColor={ind?.color ?? '#7c3aed'}
                  onRemove={() => handleRemove(company.id)}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
