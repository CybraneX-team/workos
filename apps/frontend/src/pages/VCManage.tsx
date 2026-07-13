import { useMemo, useState } from 'react';
import {
  LayoutDashboard, Users, Globe, AlertTriangle, DollarSign,
  TrendingUp, Star, X, ChevronRight, Building2,
  MapPin, Zap, BarChart2,
} from 'lucide-react';
import { COMPANIES } from '../db/companies';
import { INDUSTRIES } from '../db/industries';
import { getAllLocalCompanies } from '../lib/localCompanies';
import { getVCPortfolio } from './VCFindStartups';

/* ── Constants ── */
const STAGE_ORDER = ['Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D+', 'Pre-IPO', 'Public', 'Bootstrapped', 'PSU'];
const STAGE_COLORS: Record<string, string> = {
  'Idea': '#6b7280', 'Pre-seed': '#8b5cf6', 'Seed': '#a78bfa',
  'Series A': '#22d3ee', 'Series B': '#34d399', 'Series C': '#fbbf24',
  'Series D+': '#fb923c', 'Series E': '#f87171', 'Series F': '#ef4444',
  'Pre-IPO': '#ec4899', 'Public': '#10b981', 'Bootstrapped': '#6ee7b7', 'PSU': '#93c5fd',
};
const STATUS_COLORS: Record<string, string> = { healthy: '#22c55e', warning: '#f59e0b', critical: '#ef4444' };
const STATUS_LABELS: Record<string, string> = { healthy: 'On Track', warning: 'Watch', critical: 'At Risk' };

/* ── Helpers ── */
function fmt(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function stageBadge(stage: string) {
  const c = STAGE_COLORS[stage] ?? '#5E5E5E';
  return <span style={{ background: `${c}14`, color: c, border: `1px solid ${c}28`, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, whiteSpace: 'nowrap' }}>{stage}</span>;
}

function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  const init = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: `${color}14`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(9, size * 0.33), fontWeight: 700, color }}>
      {init}
    </div>
  );
}

/* ── Glass card wrapper ── */
function Card({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(20px)', ...style }}>
      {children}
    </div>
  );
}

function CardHeader({ title, sub, icon: Icon, iconColor = '#F9C6FF' }: { title: string; sub?: string; icon?: any; iconColor?: string }) {
  return (
    <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex items-center gap-2 mb-0.5">
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: iconColor, opacity: 0.8 }} />}
        <span style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e8' }}>{title}</span>
      </div>
      {sub && <p style={{ fontSize: 10, color: '#3d3d52' }}>{sub}</p>}
    </div>
  );
}

/* ── SVG Donut ── */
function Donut({ segments, size = 80 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (!total) return <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />;
  const cx = size / 2, cy = size / 2, R = size * 0.44, r = size * 0.27;
  let cum = 0;
  const paths = segments.filter(s => s.value > 0).map(s => {
    const sa = (cum / total) * 2 * Math.PI - Math.PI / 2;
    cum += s.value;
    const ea = (cum / total) * 2 * Math.PI - Math.PI / 2;
    const lg = s.value / total > 0.5 ? 1 : 0;
    const x1 = cx + R * Math.cos(sa), y1 = cy + R * Math.sin(sa);
    const x2 = cx + R * Math.cos(ea), y2 = cy + R * Math.sin(ea);
    const ix1 = cx + r * Math.cos(ea), iy1 = cy + r * Math.sin(ea);
    const ix2 = cx + r * Math.cos(sa), iy2 = cy + r * Math.sin(sa);
    return { ...s, path: `M${x1},${y1} A${R},${R} 0 ${lg},1 ${x2},${y2} L${ix1},${iy1} A${r},${r} 0 ${lg},0 ${ix2},${iy2}Z` };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths.map((p, i) => <path key={i} d={p.path} fill={p.color} opacity={0.9} />)}
      <circle cx={cx} cy={cy} r={r - 1} fill="rgba(10,10,14,0.95)" />
    </svg>
  );
}

/* ── Sparkline ── */
function Sparkline({ status, seed }: { status: string; seed: number }) {
  const W = 52, H = 22;
  const trend = status === 'healthy' ? -1.8 : status === 'critical' ? 1.8 : 0;
  const color = STATUS_COLORS[status] ?? '#5E5E5E';
  const pts = Array.from({ length: 6 }, (_, i) => {
    const x = (i / 5) * W;
    const base = H / 2 + trend * i * 1.2;
    const noise = (((seed * (i + 3) * 13) % 7) - 3.5) * (status === 'warning' ? 2.2 : 0.9);
    return `${x.toFixed(1)},${Math.max(3, Math.min(H - 3, base + noise)).toFixed(1)}`;
  }).join(' L');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0 }}>
      <path d={`M${pts}`} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
    </svg>
  );
}

/* ── Company Detail Modal ── */
function CompanyModal({ company, ind, onClose }: { company: any; ind: any; onClose: () => void }) {
  const color = ind?.color ?? '#7c3aed';
  const sc = STATUS_COLORS[company.status ?? 'healthy'] ?? '#22c55e';
  const mrr = company.mrrUSD ?? company.mrr_usd;
  const founded = company.founded ?? company.founded_year;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(20px)' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl" style={{ background: 'rgba(10,10,14,0.97)', border: `1px solid ${color}22`, boxShadow: '0 32px 64px rgba(0,0,0,0.6)', backdropFilter: 'blur(40px)' }}>
        <div className="flex items-start gap-3 p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Avatar name={company.name} color={color} size={40} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-white mb-1.5">{company.name}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {stageBadge(company.stage)}
              <span style={{ fontSize: 10, color: '#3d3d52', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc }} />
                {STATUS_LABELS[company.status ?? 'healthy']}
              </span>
              <span style={{ fontSize: 10, color: '#3d3d52' }}>{ind?.label} · {company.country}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ color: '#5E5E5E', padding: 6, borderRadius: 8 }}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {company.description && <p style={{ fontSize: 12, color: '#7a7a8a', lineHeight: 1.6 }}>{company.description}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'MRR', value: mrr ? fmt(mrr) : '—' },
              { label: 'Team', value: company.employees?.toLocaleString() ?? '—' },
              { label: 'Valuation', value: company.valuation && company.valuation !== '—' ? `$${company.valuation}` : '—' },
              { label: 'Founded', value: founded ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '9px 12px' }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3d3d4a', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{value}</div>
              </div>
            ))}
          </div>
          {(company as any)._isLocal && (company as any).burn_rate_usd > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: 10, padding: '9px 12px' }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3d3d4a', marginBottom: 3 }}>Burn Rate</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{fmt((company as any).burn_rate_usd)}<span style={{ fontSize: 10, color: '#3d3d4a' }}>/mo</span></div>
              </div>
              {(company as any).runway_months > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '9px 12px' }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3d3d4a', marginBottom: 3 }}>Runway</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{(company as any).runway_months}<span style={{ fontSize: 10, color: '#3d3d4a' }}> mo</span></div>
                </div>
              )}
            </div>
          )}
          {company.investors?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3d3d4a', marginBottom: 6 }}>Backed by</div>
              <div className="flex flex-wrap gap-1.5">
                {company.investors.map((inv: string) => (
                  <span key={inv} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#5a5a6a' }}>{inv}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   MAIN DASHBOARD
   ════════════════════════════════════════ */
export default function VCManage() {
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);

  /* ── Data setup ── */
  const localCos = useMemo(() => getAllLocalCompanies().map(c => ({
    id: c.id, name: c.name, industryId: c.industry_id, country: c.country,
    stage: c.stage, founded: c.founded_year ?? undefined, isPublic: c.is_public,
    valuation: c.valuation ?? '—', mrrUSD: c.mrr_usd, employees: c.employees,
    investors: [] as string[], description: c.description ?? undefined,
    status: 'healthy' as const, offset3D: [0, 0, 0] as [number, number, number],
    subdomain: c.subdomain_id ?? undefined, _isLocal: true,
    burn_rate_usd: c.burn_rate_usd, runway_months: c.runway_months,
  })), []);

  const allCos = useMemo(() => [...COMPANIES, ...localCos], [localCos]);
  const portfolioIds = getVCPortfolio();
  const portfolioCos = useMemo(() => allCos.filter(c => portfolioIds.includes(c.id)), [allCos]);
  const getIndustry = (id: string) => INDUSTRIES.find(i => i.id === id);

  /* ── Computed metrics ── */
  const stats = useMemo(() => {
    const industries = new Set(portfolioCos.map(c => c.industryId));
    const countries = new Set(portfolioCos.map(c => c.country));
    const atRisk = portfolioCos.filter(c => c.status === 'warning' || c.status === 'critical');
    const totalMRR = portfolioCos.reduce((s, c) => s + (c.mrrUSD ?? 0), 0);
    const totalEmployees = portfolioCos.reduce((s, c) => s + (c.employees ?? 0), 0);
    const avgTeam = portfolioCos.length ? Math.round(totalEmployees / portfolioCos.length) : 0;
    const withMRR = portfolioCos.filter(c => (c.mrrUSD ?? 0) > 0).length;
    const publicOrPreIPO = portfolioCos.filter(c => c.stage === 'Public' || c.stage === 'Pre-IPO').length;
    return { industries: industries.size, countries: countries.size, atRisk, totalMRR, avgTeam, withMRR, publicOrPreIPO };
  }, [portfolioCos]);

  /* ── Stage pipeline: ALL companies (market landscape) ── */
  const stagePipeline = useMemo(() => {
    const allMap = new Map<string, number>();
    const portMap = new Map<string, number>();
    allCos.forEach(c => allMap.set(c.stage, (allMap.get(c.stage) ?? 0) + 1));
    portfolioCos.forEach(c => portMap.set(c.stage, (portMap.get(c.stage) ?? 0) + 1));
    return STAGE_ORDER
      .filter(s => (allMap.get(s) ?? 0) > 0)
      .map(s => ({ stage: s, total: allMap.get(s) ?? 0, portfolio: portMap.get(s) ?? 0, color: STAGE_COLORS[s] ?? '#5E5E5E' }));
  }, [allCos, portfolioCos]);
  const maxStageTotal = Math.max(...stagePipeline.map(s => s.total), 1);

  /* ── MRR leaders ── */
  const mrrLeaders = useMemo(() =>
    portfolioCos
      .filter(c => (c.mrrUSD ?? 0) > 0)
      .sort((a, b) => (b.mrrUSD ?? 0) - (a.mrrUSD ?? 0))
      .slice(0, 7),
    [portfolioCos]);
  const maxMRR = mrrLeaders[0]?.mrrUSD ?? 1;

  /* ── Industry mix ── */
  const industryMix = useMemo(() => {
    const map = new Map<string, number>();
    portfolioCos.forEach(c => map.set(c.industryId, (map.get(c.industryId) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([id, count]) => { const ind = getIndustry(id); return { label: ind?.label ?? id, count, color: ind?.color ?? '#7c3aed' }; });
  }, [portfolioCos]);

  /* ── Stage mix (portfolio only) ── */
  const stageMix = useMemo(() => {
    const map = new Map<string, number>();
    portfolioCos.forEach(c => map.set(c.stage, (map.get(c.stage) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([stage, count]) => ({ label: stage, count, color: STAGE_COLORS[stage] ?? '#5E5E5E' }));
  }, [portfolioCos]);

  /* ── Geography ── */
  const geography = useMemo(() => {
    const map = new Map<string, number>();
    portfolioCos.forEach(c => map.set(c.country, (map.get(c.country) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [portfolioCos]);
  const maxGeo = Math.max(...geography.map(g => g[1]), 1);

  /* ── Risk monitor ── */
  const atRiskCos = useMemo(() =>
    portfolioCos.filter(c => c.status === 'warning' || c.status === 'critical')
      .sort((a, b) => (a.status === 'critical' ? -1 : 1) - (b.status === 'critical' ? -1 : 1)),
    [portfolioCos]);

  /* ── Status counts ── */
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { healthy: 0, warning: 0, critical: 0 };
    portfolioCos.forEach(c => { m[c.status ?? 'healthy'] = (m[c.status ?? 'healthy'] ?? 0) + 1; });
    return m;
  }, [portfolioCos]);

  /* ── Quick insights ── */
  const insights = useMemo(() => {
    const list: { text: string; accent: string }[] = [];
    if (stats.withMRR > 0) list.push({ text: `${stats.withMRR} of ${portfolioCos.length} generating revenue`, accent: '#34d399' });
    if (industryMix[0]) list.push({ text: `Top sector: ${industryMix[0].label} (${industryMix[0].count} co)`, accent: industryMix[0].color });
    if (stats.publicOrPreIPO > 0) list.push({ text: `${stats.publicOrPreIPO} near exit (Public/Pre-IPO)`, accent: '#10b981' });
    const highGrowth = portfolioCos.filter(c => (c.mrrUSD ?? 0) >= 1_000_000).length;
    if (highGrowth > 0) list.push({ text: `${highGrowth} companies with $1M+ MRR`, accent: '#fbbf24' });
    const earlyStage = portfolioCos.filter(c => ['Idea', 'Pre-seed', 'Seed'].includes(c.stage)).length;
    if (earlyStage > 0) list.push({ text: `${earlyStage} early-stage (Idea–Seed)`, accent: '#a78bfa' });
    if (geography[0]) list.push({ text: `Most concentrated: ${geography[0][0]} (${geography[0][1]} co)`, accent: '#22d3ee' });
    return list.slice(0, 5);
  }, [portfolioCos, stats, industryMix, geography]);

  /* ── Seed to hash for sparkline ── */
  function nameHash(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  /* ── Empty state ── */
  if (portfolioCos.length === 0) {
    return (
      <div className="max-w-7xl mx-auto flex flex-col items-center justify-center py-32 gap-4">
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(249,198,255,0.08)', border: '1px solid rgba(249,198,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LayoutDashboard className="w-6 h-6" style={{ color: '#F9C6FF' }} />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-white mb-1">No portfolio companies yet</h2>
          <p className="text-sm" style={{ color: '#3d3d52' }}>Star companies in Find Startups to populate your dashboard</p>
        </div>
      </div>
    );
  }

  /* ════════ RENDER ════════ */
  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-4 pb-8">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(249,198,255,0.08)', border: '1px solid rgba(249,198,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LayoutDashboard className="w-4 h-4" style={{ color: '#F9C6FF' }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">Portfolio Dashboard</h1>
            <p style={{ fontSize: 11, color: '#3d3d52', marginTop: 2 }}>Tracking {portfolioCos.length} companies · {allCos.length} in market</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[
            { label: 'Critical', count: statusCounts.critical, color: '#ef4444' },
            { label: 'Watch', count: statusCounts.warning, color: '#f59e0b' },
            { label: 'On Track', count: statusCounts.healthy, color: '#22c55e' },
          ].map(({ label, count, color }) => (
            <div key={label} style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 99, background: `${color}12`, color, border: `1px solid ${color}22` }}>
              {count} {label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Building2, label: 'Portfolio', value: portfolioCos.length, sub: 'companies', color: '#F9C6FF' },
          { icon: Globe, label: 'Industries', value: stats.industries, sub: 'sectors', color: '#22d3ee' },
          { icon: MapPin, label: 'Countries', value: stats.countries, sub: 'geographies', color: '#34d399' },
          { icon: AlertTriangle, label: 'At Risk', value: atRiskCos.length, sub: 'need attention', color: atRiskCos.length > 0 ? '#f87171' : '#22c55e' },
          { icon: DollarSign, label: 'Portfolio MRR', value: stats.totalMRR ? fmt(stats.totalMRR) : '—', sub: 'combined est.', color: '#fbbf24' },
          { icon: Users, label: 'Avg Team', value: stats.avgTeam ? stats.avgTeam.toLocaleString() : '—', sub: 'per company', color: '#a78bfa' },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <Card key={label} style={{ padding: '14px 16px' }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3d3d52' }}>{label}</span>
              <Icon className="w-3 h-3" style={{ color, opacity: 0.6 }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>{value}</div>
            <div style={{ fontSize: 9, color: '#3d3d52', marginTop: 3 }}>{sub}</div>
          </Card>
        ))}
      </div>

      {/* ── Row 2: Pipeline | MRR Leaders | Allocation ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Stage pipeline (market landscape) */}
        <Card className="lg:col-span-2">
          <CardHeader title="Market Pipeline" sub="Stage distribution across all tracked companies" icon={BarChart2} iconColor="#22d3ee" />
          <div style={{ padding: '14px 18px' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-1.5">
                <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.25)' }} />
                <span style={{ fontSize: 9, color: '#3d3d52' }}>All companies</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div style={{ width: 8, height: 8, borderRadius: 2, background: '#F9C6FF' }} />
                <span style={{ fontSize: 9, color: '#3d3d52' }}>Your portfolio</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {stagePipeline.map(({ stage, total, portfolio, color }) => (
                <div key={stage} className="flex items-center gap-2.5">
                  <span style={{ width: 64, fontSize: 10, color: '#5a5a6a', textAlign: 'right', flexShrink: 0 }}>{stage}</span>
                  <div style={{ flex: 1, position: 'relative', height: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                    {/* Total bar */}
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(total / maxStageTotal) * 100}%`, background: `${color}30`, borderRadius: 4 }} />
                    {/* Portfolio bar */}
                    {portfolio > 0 && (
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(portfolio / maxStageTotal) * 100}%`, background: color, borderRadius: 4, opacity: 0.85 }} />
                    )}
                  </div>
                  <span style={{ width: 28, fontSize: 10, color: '#fff', textAlign: 'right', flexShrink: 0, fontWeight: 600 }}>{total}</span>
                  {portfolio > 0 && (
                    <span style={{ width: 18, fontSize: 9, color: '#F9C6FF', flexShrink: 0 }}>+{portfolio}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* MRR Leaders */}
        <Card className="lg:col-span-2">
          <CardHeader title="MRR Leaders" sub="Highest revenue companies in portfolio" icon={TrendingUp} iconColor="#34d399" />
          <div style={{ padding: '14px 18px' }}>
            {mrrLeaders.length === 0 ? (
              <p style={{ fontSize: 12, color: '#3d3d52', marginTop: 8 }}>No MRR data available</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {mrrLeaders.map(company => {
                  const ind = getIndustry(company.industryId);
                  const color = ind?.color ?? '#7c3aed';
                  const pct = ((company.mrrUSD ?? 0) / maxMRR) * 100;
                  return (
                    <div key={company.id} className="flex items-center gap-2 cursor-pointer group" onClick={() => setSelectedCompany(company)}>
                      <span style={{ width: 80, fontSize: 10, color: '#6a6a7a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, textAlign: 'right' }}>{company.name}</span>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
                      </div>
                      <span style={{ width: 42, fontSize: 10, fontWeight: 600, color: '#fff', textAlign: 'right', flexShrink: 0 }}>{fmt(company.mrrUSD ?? 0)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Portfolio Allocation */}
        <Card className="lg:col-span-1">
          <CardHeader title="Allocation" sub="By industry & stage" icon={Zap} iconColor="#F9C6FF" />
          <div style={{ padding: '12px 16px' }} className="flex flex-col gap-4">
            {/* Industry donut */}
            <div>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#3d3d52', marginBottom: 8 }}>Industry</p>
              <div className="flex items-center gap-3">
                <Donut segments={industryMix.map(i => ({ label: i.label, value: i.count, color: i.color }))} size={68} />
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  {industryMix.slice(0, 4).map(({ label, count, color }) => (
                    <div key={label} className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 9, color: '#7a7a8a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Stage donut */}
            <div>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#3d3d52', marginBottom: 8 }}>Stage</p>
              <div className="flex items-center gap-3">
                <Donut segments={stageMix.map(s => ({ label: s.label, value: s.count, color: s.color }))} size={68} />
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  {stageMix.slice(0, 4).map(({ label, count, color }) => (
                    <div key={label} className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 9, color: '#7a7a8a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Row 3: Risk | Geography | Insights ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Risk Monitor */}
        <Card>
          <CardHeader title="Risk Monitor" sub="Portfolio health signals" icon={AlertTriangle} iconColor="#f87171" />
          <div style={{ padding: '12px 18px' }}>
            {/* Status summary */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { status: 'critical', label: 'Critical' },
                { status: 'warning', label: 'Watch' },
                { status: 'healthy', label: 'On Track' },
              ].map(({ status, label }) => (
                <div key={status} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: `${STATUS_COLORS[status]}08`, border: `1px solid ${STATUS_COLORS[status]}18` }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: STATUS_COLORS[status] }}>{statusCounts[status] ?? 0}</div>
                  <div style={{ fontSize: 9, color: '#3d3d52', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            {/* At-risk list */}
            {atRiskCos.length === 0 ? (
              <div className="flex items-center gap-2 py-2">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                <span style={{ fontSize: 11, color: '#4a4a5e' }}>All companies on track</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {atRiskCos.slice(0, 5).map(company => {
                  const ind = getIndustry(company.industryId);
                  const sc = STATUS_COLORS[company.status ?? 'warning'];
                  return (
                    <div key={company.id} className="flex items-center gap-2 cursor-pointer" onClick={() => setSelectedCompany(company)}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                      <Avatar name={company.name} color={ind?.color ?? '#7c3aed'} size={24} />
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#e0e0e8' }} className="truncate">{company.name}</p>
                        <p style={{ fontSize: 9, color: '#3d3d52' }}>{company.stage}</p>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${sc}12`, color: sc, border: `1px solid ${sc}22`, flexShrink: 0 }}>
                        {STATUS_LABELS[company.status ?? 'warning']}
                      </span>
                    </div>
                  );
                })}
                {atRiskCos.length > 5 && <p style={{ fontSize: 10, color: '#3d3d52' }}>+{atRiskCos.length - 5} more</p>}
              </div>
            )}
          </div>
        </Card>

        {/* Geographic Spread */}
        <Card>
          <CardHeader title="Geographic Spread" sub="Portfolio by country" icon={Globe} iconColor="#22d3ee" />
          <div style={{ padding: '14px 18px' }}>
            {geography.length === 0 ? (
              <p style={{ fontSize: 12, color: '#3d3d52' }}>No data</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {geography.map(([country, count]) => (
                  <div key={country} className="flex items-center gap-2.5">
                    <span style={{ width: 64, fontSize: 10, color: '#6a6a7a', textAlign: 'right', flexShrink: 0 }}>{country}</span>
                    <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${(count / maxGeo) * 100}%`, height: '100%', background: '#22d3ee', borderRadius: 99, opacity: 0.7 }} />
                    </div>
                    <span style={{ width: 16, fontSize: 11, fontWeight: 600, color: '#fff', textAlign: 'right', flexShrink: 0 }}>{count}</span>
                  </div>
                ))}
                {/* Total coverage */}
                <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: '#3d3d52' }}>Coverage</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{stats.countries} {stats.countries === 1 ? 'country' : 'countries'}</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Quick Insights */}
        <Card>
          <CardHeader title="Portfolio Insights" sub="Key signals from your companies" icon={Zap} iconColor="#fbbf24" />
          <div style={{ padding: '14px 18px' }}>
            {insights.length === 0 ? (
              <p style={{ fontSize: 12, color: '#3d3d52' }}>Add more companies to generate insights</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {insights.map(({ text, accent }, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-1">
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: accent, marginTop: 4, flexShrink: 0 }} />
                    <p style={{ fontSize: 11, color: '#8a8a9a', lineHeight: 1.5 }}>{text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Stage maturity indicator */}
            {portfolioCos.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#3d3d52', marginBottom: 8 }}>Portfolio Maturity</p>
                <div className="flex gap-1" style={{ height: 6, borderRadius: 99, overflow: 'hidden' }}>
                  {(() => {
                    const early = portfolioCos.filter(c => ['Idea', 'Pre-seed', 'Seed'].includes(c.stage)).length;
                    const growth = portfolioCos.filter(c => ['Series A', 'Series B', 'Series C'].includes(c.stage)).length;
                    const late = portfolioCos.filter(c => ['Series D+', 'Pre-IPO', 'Public'].includes(c.stage)).length;
                    const other = portfolioCos.length - early - growth - late;
                    const total = portfolioCos.length;
                    return [
                      { pct: (early / total) * 100, color: '#8b5cf6', label: 'Early' },
                      { pct: (growth / total) * 100, color: '#22d3ee', label: 'Growth' },
                      { pct: (late / total) * 100, color: '#10b981', label: 'Late' },
                      { pct: (other / total) * 100, color: '#5E5E5E', label: 'Other' },
                    ].filter(s => s.pct > 0).map(s => (
                      <div key={s.label} style={{ width: `${s.pct}%`, height: '100%', background: s.color }} />
                    ));
                  })()}
                </div>
                <div className="flex gap-3 mt-2">
                  {[
                    { label: 'Early', color: '#8b5cf6', stages: ['Idea', 'Pre-seed', 'Seed'] },
                    { label: 'Growth', color: '#22d3ee', stages: ['Series A', 'Series B', 'Series C'] },
                    { label: 'Late', color: '#10b981', stages: ['Series D+', 'Pre-IPO', 'Public'] },
                  ].map(({ label, color, stages }) => (
                    <div key={label} className="flex items-center gap-1">
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 9, color: '#3d3d52' }}>{label} ({portfolioCos.filter(c => stages.includes(c.stage)).length})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Portfolio Companies Table ── */}
      <Card>
        <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Star className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} fill="#fbbf24" />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e8' }}>Portfolio Companies</span>
          <span style={{ fontSize: 10, color: '#3d3d52' }}>{portfolioCos.length} total</span>
        </div>

        {/* Col headers */}
        <div className="flex items-center gap-3 px-5 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ width: 28, flexShrink: 0 }} />
          <div className="flex-1" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2a2a38' }}>Company</div>
          <div className="hidden sm:block shrink-0 w-24" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2a2a38' }}>Stage</div>
          <div className="hidden md:block shrink-0 w-20" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2a2a38' }}>Est. MRR</div>
          <div className="hidden lg:block shrink-0 w-16" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2a2a38' }}>Team</div>
          <div className="hidden xl:block shrink-0 w-16" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2a2a38' }}>Country</div>
          <div className="hidden xl:block shrink-0 w-16" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2a2a38' }}>Founded</div>
          <div className="shrink-0 w-20" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2a2a38' }}>Status</div>
          <div className="hidden lg:block shrink-0 w-14" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2a2a38' }}>Trend</div>
          <div style={{ width: 20, flexShrink: 0 }} />
        </div>

        {/* Rows */}
        {portfolioCos.map(company => {
          const ind = getIndustry(company.industryId);
          const color = ind?.color ?? '#7c3aed';
          const sc = STATUS_COLORS[company.status ?? 'healthy'] ?? '#22c55e';
          const mrr = company.mrrUSD ?? (company as any).mrr_usd;
          const founded = company.founded ?? (company as any).founded_year;
          const seed = nameHash(company.id);

          return (
            <div key={company.id}
              className="flex items-center gap-3 px-5 py-2.5 cursor-pointer group"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.035)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onClick={() => setSelectedCompany(company)}>

              <Avatar name={company.name} color={color} size={28} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#e0e0e8' }} className="truncate">{company.name}</span>
                  {(company as any)._isLocal && (
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: '#22d3ee10', color: '#22d3ee', flexShrink: 0 }}>LOCAL</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: '#3d3d52', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  {ind?.label ?? company.industryId}
                </div>
              </div>

              <div className="hidden sm:block shrink-0 w-24">{stageBadge(company.stage)}</div>

              <div className="hidden md:block shrink-0 w-20" style={{ fontSize: 11, color: mrr ? '#e0e0e8' : '#2a2a38' }}>
                {mrr ? fmt(mrr) : '—'}
              </div>

              <div className="hidden lg:block shrink-0 w-16" style={{ fontSize: 11, color: company.employees ? '#e0e0e8' : '#2a2a38' }}>
                {company.employees ? company.employees.toLocaleString() : '—'}
              </div>

              <div className="hidden xl:block shrink-0 w-16" style={{ fontSize: 11, color: '#5a5a6a' }}>
                {company.country}
              </div>

              <div className="hidden xl:block shrink-0 w-16" style={{ fontSize: 11, color: '#5a5a6a' }}>
                {founded ?? '—'}
              </div>

              <div className="shrink-0 w-20">
                <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: `${sc}10`, color: sc, border: `1px solid ${sc}20` }}>
                  {STATUS_LABELS[company.status ?? 'healthy']}
                </span>
              </div>

              <div className="hidden lg:flex shrink-0 w-14 items-center justify-center">
                <Sparkline status={company.status ?? 'healthy'} seed={seed} />
              </div>

              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-30 transition-opacity shrink-0" style={{ color: '#fff' }} />
            </div>
          );
        })}
      </Card>

      {/* Footnote */}
      <p style={{ fontSize: 9, color: '#1e1e2a', textAlign: 'center' }}>
        All data sourced from publicly available company profiles · for informational purposes only
      </p>

      {/* Modal */}
      {selectedCompany && (
        <CompanyModal
          company={selectedCompany}
          ind={getIndustry(selectedCompany.industryId)}
          onClose={() => setSelectedCompany(null)}
        />
      )}
    </div>
  );
}
