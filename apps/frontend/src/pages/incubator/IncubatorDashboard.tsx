import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Globe, AlertTriangle, DollarSign,
  TrendingUp, Users, MapPin, Zap, BarChart2, UploadCloud,
} from 'lucide-react';
import {
  useDashboardSummary,
  usePortfolio,
  useDiscoverCompanies,
  COMPANY_STAGE_ENUM,
  type PortfolioCompany,
} from '../../lib/db/incubator';
import {
  PageHeader,
  Card,
  PrimaryButton,
  SecondaryButton,
  StageBadge,
  STAGE_COLORS,
  Avatar,
  Spinner,
  StatTile,
  StatusBadge,
  Donut,
  fmt,
  stringColor,
  ACCENT,
} from '../../components/incubator/ui';
import PortfolioDetailModal from '../../components/incubator/PortfolioDetailModal';

const STATUS_PILL_COLORS: Record<string, string> = { claimed: '#22c55e', invited: '#f59e0b', provisional: '#8a8a9a' };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function CardHeader({ title, sub, icon: Icon, iconColor = ACCENT }: { title: string; sub?: string; icon?: any; iconColor?: string }) {
  return (
    <div className="px-[18px] pt-4 pb-3 border-b border-white/[0.05]">
      <div className="flex items-center gap-2 mb-0.5">
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: iconColor, opacity: 0.8 }} />}
        <span className="text-xs font-semibold text-white/85">{title}</span>
      </div>
      {sub && <p className="text-[10px] text-white/30">{sub}</p>}
    </div>
  );
}

export default function IncubatorDashboard() {
  const navigate = useNavigate();
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);

  const { summary, loading: summaryLoading } = useDashboardSummary();
  const { companies: portfolioCos, loading: portfolioLoading, refresh } = usePortfolio();
  const { companies: discoverCos } = useDiscoverCompanies({});

  const claimedCount = useMemo(() => portfolioCos.filter((c) => c.status === 'claimed').length, [portfolioCos]);
  const invitedCount = useMemo(() => portfolioCos.filter((c) => c.status === 'invited').length, [portfolioCos]);
  const provisionalCount = useMemo(() => portfolioCos.filter((c) => c.status === 'provisional').length, [portfolioCos]);

  const sectorCount = useMemo(() => new Set(portfolioCos.map((c) => c.sector).filter(Boolean)).size, [portfolioCos]);
  const countryCount = useMemo(() => new Set(portfolioCos.map((c) => c.country).filter(Boolean)).size, [portfolioCos]);
  const totalMRR = useMemo(() => portfolioCos.reduce((s, c) => s + (c.mrr_usd ?? 0), 0), [portfolioCos]);
  const avgTeam = useMemo(
    () => (portfolioCos.length ? Math.round(portfolioCos.reduce((s, c) => s + (c.employees ?? 0), 0) / portfolioCos.length) : 0),
    [portfolioCos],
  );

  const stagePipeline = useMemo(() => {
    const portMap = new Map<string, number>();
    const marketMap = new Map<string, number>();
    for (const c of portfolioCos) {
      portMap.set(c.stage, (portMap.get(c.stage) ?? 0) + 1);
      marketMap.set(c.stage, (marketMap.get(c.stage) ?? 0) + 1);
    }
    for (const c of discoverCos) marketMap.set(c.stage, (marketMap.get(c.stage) ?? 0) + 1);
    return COMPANY_STAGE_ENUM.filter((s) => (marketMap.get(s) ?? 0) > 0).map((s) => ({
      stage: s,
      total: marketMap.get(s) ?? 0,
      portfolio: portMap.get(s) ?? 0,
      color: STAGE_COLORS[s] ?? '#8a8a9a',
    }));
  }, [portfolioCos, discoverCos]);
  const maxStageTotal = Math.max(...stagePipeline.map((s) => s.total), 1);

  const mrrLeaders = useMemo(
    () => portfolioCos.filter((c) => (c.mrr_usd ?? 0) > 0).sort((a, b) => (b.mrr_usd ?? 0) - (a.mrr_usd ?? 0)).slice(0, 7),
    [portfolioCos],
  );
  const maxMRR = mrrLeaders[0]?.mrr_usd ?? 1;

  const sectorMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of portfolioCos) {
      if (!c.sector) continue;
      map.set(c.sector, (map.get(c.sector) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({ label, count, color: stringColor(label) }));
  }, [portfolioCos]);

  const stageMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of portfolioCos) map.set(c.stage, (map.get(c.stage) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({ label, count, color: STAGE_COLORS[label] ?? '#8a8a9a' }));
  }, [portfolioCos]);

  const geography = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of portfolioCos) {
      if (!c.country) continue;
      map.set(c.country, (map.get(c.country) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [portfolioCos]);
  const maxGeo = Math.max(...geography.map((g) => g[1]), 1);

  const insights = useMemo(() => {
    const list: { text: string; accent: string }[] = [];
    const withMRR = portfolioCos.filter((c) => (c.mrr_usd ?? 0) > 0).length;
    if (withMRR > 0) list.push({ text: `${withMRR} of ${portfolioCos.length} generating revenue`, accent: '#34d399' });
    if (sectorMix[0]) list.push({ text: `Top sector: ${sectorMix[0].label} (${sectorMix[0].count} co)`, accent: sectorMix[0].color });
    const highGrowth = portfolioCos.filter((c) => (c.mrr_usd ?? 0) >= 1_000_000).length;
    if (highGrowth > 0) list.push({ text: `${highGrowth} companies with $1M+ MRR`, accent: '#fbbf24' });
    const earlyStage = portfolioCos.filter((c) => ['Idea', 'Pre-seed', 'Seed'].includes(c.stage)).length;
    if (earlyStage > 0) list.push({ text: `${earlyStage} early-stage (Idea–Seed)`, accent: '#a78bfa' });
    if (geography[0]) list.push({ text: `Most concentrated: ${geography[0][0]} (${geography[0][1]} co)`, accent: '#22d3ee' });
    if (claimedCount > 0) list.push({ text: `${claimedCount} startup${claimedCount === 1 ? '' : 's'} claimed their workspace`, accent: '#10b981' });
    return list.slice(0, 5);
  }, [portfolioCos, sectorMix, geography, claimedCount]);

  const maturity = useMemo(() => {
    const early = portfolioCos.filter((c) => ['Idea', 'Pre-seed', 'Seed'].includes(c.stage)).length;
    const growth = portfolioCos.filter((c) => ['Series A', 'Series B', 'Series C'].includes(c.stage)).length;
    const late = portfolioCos.filter((c) => ['Series D+', 'Pre-IPO', 'Public'].includes(c.stage)).length;
    const other = portfolioCos.length - early - growth - late;
    return { early, growth, late, other, total: portfolioCos.length || 1 };
  }, [portfolioCos]);

  if (summaryLoading || portfolioLoading || !summary) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const { attention } = summary;
  const hasAttention = attention.bouncedInvites.length > 0 || attention.expiringSoonInvites.length > 0 || attention.cohortsEndingSoon.length > 0;

  if (portfolioCos.length === 0) {
    return (
      <div className="max-w-6xl mx-auto p-8 flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.14)' }}>
          <LayoutDashboard className="w-6 h-6" style={{ color: ACCENT }} />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-white mb-1">No portfolio companies yet</h2>
          <p className="text-sm text-white/40">Upload a roster spreadsheet to populate your dashboard</p>
        </div>
        <PrimaryButton onClick={() => navigate('/incubator/import')}>
          <span className="inline-flex items-center gap-1.5">
            <UploadCloud size={14} /> Import your first roster
          </span>
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8 flex flex-col gap-4 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <PageHeader title="Dashboard" description="Your program at a glance." />
        <div className="flex items-center gap-2">
          {[
            { label: 'Claimed', count: claimedCount },
            { label: 'Invited', count: invitedCount },
            { label: 'Provisional', count: provisionalCount },
          ].map(({ label, count }) => (
            <div
              key={label}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: `${STATUS_PILL_COLORS[label.toLowerCase()]}12`, color: STATUS_PILL_COLORS[label.toLowerCase()], border: `1px solid ${STATUS_PILL_COLORS[label.toLowerCase()]}22` }}
            >
              {count} {label}
            </div>
          ))}
          <SecondaryButton onClick={() => navigate('/incubator/portfolio')}>View portfolio</SecondaryButton>
          <PrimaryButton onClick={() => navigate('/incubator/import')}>
            <span className="inline-flex items-center gap-1.5">
              <UploadCloud size={14} /> Import roster
            </span>
          </PrimaryButton>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile icon={Building2} color={ACCENT} label="Portfolio" value={portfolioCos.length} hint="companies" />
        <StatTile icon={Users} color="#22d3ee" label="Active cohorts" value={summary.cohorts.active} hint={`${summary.cohorts.total} total`} />
        <StatTile icon={Globe} color="#34d399" label="Sectors" value={sectorCount} hint="represented" />
        <StatTile icon={MapPin} color="#fbbf24" label="Countries" value={countryCount} hint="geographies" />
        <StatTile icon={DollarSign} color="#fb923c" label="Portfolio MRR" value={totalMRR ? fmt(totalMRR) : '—'} hint="combined" />
        <StatTile icon={Users} color="#f472b6" label="Avg team" value={avgTeam ? avgTeam.toLocaleString() : '—'} hint="per company" />
      </div>

      {/* Row 2: Pipeline | MRR Leaders | Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Stage Distribution" sub="Portfolio vs. rest of the platform" icon={BarChart2} iconColor="#22d3ee" />
          <div className="p-[18px] pt-3.5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-white/25" />
                <span className="text-[9px] text-white/30">All companies</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm" style={{ background: ACCENT }} />
                <span className="text-[9px] text-white/30">Your portfolio</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {stagePipeline.map(({ stage, total, portfolio, color }) => (
                <div key={stage} className="flex items-center gap-2.5">
                  <span className="w-16 text-[10px] text-white/40 text-right shrink-0">{stage}</span>
                  <div className="flex-1 relative h-3.5 rounded overflow-hidden bg-white/[0.04]">
                    <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${(total / maxStageTotal) * 100}%`, background: `${color}30` }} />
                    {portfolio > 0 && (
                      <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${(portfolio / maxStageTotal) * 100}%`, background: color, opacity: 0.85 }} />
                    )}
                  </div>
                  <span className="w-7 text-[10px] font-semibold text-white text-right shrink-0">{total}</span>
                  {portfolio > 0 && <span className="w-5 text-[9px] shrink-0" style={{ color: ACCENT }}>+{portfolio}</span>}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="MRR Leaders" sub="Highest revenue companies in portfolio" icon={TrendingUp} iconColor="#34d399" />
          <div className="p-[18px] pt-3.5">
            {mrrLeaders.length === 0 ? (
              <p className="text-xs text-white/30 mt-2">No MRR data available</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {mrrLeaders.map((company) => {
                  const color = stringColor(company.sector ?? company.name);
                  const pct = ((company.mrr_usd ?? 0) / maxMRR) * 100;
                  return (
                    <div key={company.id} className="flex items-center gap-2 cursor-pointer group" onClick={() => setOpenCompanyId(company.id)}>
                      <span className="w-20 text-[10px] text-white/45 truncate shrink-0 text-right">{company.name}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/[0.05]">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <span className="w-11 text-[10px] font-semibold text-white text-right shrink-0">{fmt(company.mrr_usd ?? 0)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader title="Allocation" sub="By sector & stage" icon={Zap} iconColor={ACCENT} />
          <div className="p-4 flex flex-col gap-4">
            <div>
              <p className="text-[9px] uppercase tracking-wide text-white/30 mb-2">Sector</p>
              <div className="flex items-center gap-3">
                <Donut segments={sectorMix.map((s) => ({ label: s.label, value: s.count, color: s.color }))} size={68} />
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  {sectorMix.slice(0, 4).map(({ label, count, color }) => (
                    <div key={label} className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-[9px] text-white/50 truncate">{label}</span>
                      </div>
                      <span className="text-[9px] font-bold text-white shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wide text-white/30 mb-2">Stage</p>
              <div className="flex items-center gap-3">
                <Donut segments={stageMix.map((s) => ({ label: s.label, value: s.count, color: s.color }))} size={68} />
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  {stageMix.slice(0, 4).map(({ label, count, color }) => (
                    <div key={label} className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-[9px] text-white/50 truncate">{label}</span>
                      </div>
                      <span className="text-[9px] font-bold text-white shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Row 3: Needs Attention | Geography | Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Needs Attention" sub="Invites & cohorts requiring action" icon={AlertTriangle} iconColor="#f87171" />
          <div className="p-[18px] pt-3">
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Bounced', count: attention.bouncedInvites.length, color: '#ef4444' },
                { label: 'Expiring', count: attention.expiringSoonInvites.length, color: '#f59e0b' },
                { label: 'Ending soon', count: attention.cohortsEndingSoon.length, color: '#38bdf8' },
              ].map(({ label, count, color }) => (
                <div key={label} className="text-center py-2 px-1 rounded-lg" style={{ background: `${color}08`, border: `1px solid ${color}18` }}>
                  <div className="text-lg font-bold" style={{ color }}>{count}</div>
                  <div className="text-[9px] text-white/30 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            {!hasAttention ? (
              <div className="flex items-center gap-2 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-white/40">All caught up</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {attention.bouncedInvites.slice(0, 2).map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2 cursor-pointer" onClick={() => navigate('/incubator/invites')}>
                    <p className="text-[11px] text-white/70 truncate">{i.startupName ?? i.email}</p>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>Bounced</span>
                  </div>
                ))}
                {attention.expiringSoonInvites.slice(0, 2).map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2 cursor-pointer" onClick={() => navigate('/incubator/invites')}>
                    <p className="text-[11px] text-white/70 truncate">{i.startupName ?? i.email}</p>
                    <span className="text-[9px] text-white/30 shrink-0">{formatDate(i.expiresAt)}</span>
                  </div>
                ))}
                {attention.cohortsEndingSoon.slice(0, 2).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 cursor-pointer" onClick={() => navigate('/incubator/cohorts')}>
                    <p className="text-[11px] text-white/70 truncate">{c.name}</p>
                    <span className="text-[9px] text-white/30 shrink-0">{formatDate(c.endsOn)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Geographic Spread" sub="Portfolio by country" icon={Globe} iconColor="#22d3ee" />
          <div className="p-[18px] pt-3.5">
            {geography.length === 0 ? (
              <p className="text-xs text-white/30">No data</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {geography.map(([country, count]) => (
                  <div key={country} className="flex items-center gap-2.5">
                    <span className="w-16 text-[10px] text-white/45 text-right shrink-0">{country}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/[0.05]">
                      <div className="h-full rounded-full" style={{ width: `${(count / maxGeo) * 100}%`, background: '#22d3ee', opacity: 0.7 }} />
                    </div>
                    <span className="w-4 text-[11px] font-semibold text-white text-right shrink-0">{count}</span>
                  </div>
                ))}
                <div className="mt-2 pt-2.5 border-t border-white/[0.05] flex justify-between">
                  <span className="text-[10px] text-white/30">Coverage</span>
                  <span className="text-[10px] font-bold text-white">{countryCount} {countryCount === 1 ? 'country' : 'countries'}</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Portfolio Insights" sub="Key signals from your companies" icon={Zap} iconColor="#fbbf24" />
          <div className="p-[18px] pt-3.5">
            {insights.length === 0 ? (
              <p className="text-xs text-white/30">Add more companies to generate insights</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {insights.map(({ text, accent }, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-0.5">
                    <div className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ background: accent }} />
                    <p className="text-[11px] text-white/55 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-3.5 border-t border-white/[0.05]">
              <p className="text-[9px] uppercase tracking-wide text-white/30 mb-2">Portfolio Maturity</p>
              <div className="flex gap-1 h-1.5 rounded-full overflow-hidden">
                {[
                  { pct: (maturity.early / maturity.total) * 100, color: '#8b5cf6' },
                  { pct: (maturity.growth / maturity.total) * 100, color: '#22d3ee' },
                  { pct: (maturity.late / maturity.total) * 100, color: '#10b981' },
                  { pct: (maturity.other / maturity.total) * 100, color: '#5E5E5E' },
                ].filter((s) => s.pct > 0).map((s, i) => (
                  <div key={i} style={{ width: `${s.pct}%`, background: s.color }} />
                ))}
              </div>
              <div className="flex gap-3 mt-2">
                {[
                  { label: 'Early', color: '#8b5cf6', count: maturity.early },
                  { label: 'Growth', color: '#22d3ee', count: maturity.growth },
                  { label: 'Late', color: '#10b981', count: maturity.late },
                ].map(({ label, color, count }) => (
                  <div key={label} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[9px] text-white/30">{label} ({count})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Portfolio Companies table */}
      <Card>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
          <Building2 className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          <span className="text-xs font-semibold text-white/85">Portfolio Companies</span>
          <span className="text-[10px] text-white/30">{portfolioCos.length} total</span>
        </div>

        <div className="hidden sm:flex items-center gap-3 px-5 py-2 border-b border-white/[0.04] bg-white/[0.01]">
          <div className="w-7 shrink-0" />
          <div className="flex-1 text-[9px] uppercase tracking-wide text-white/25">Company</div>
          <div className="shrink-0 w-24 text-[9px] uppercase tracking-wide text-white/25">Stage</div>
          <div className="hidden md:block shrink-0 w-16 text-[9px] uppercase tracking-wide text-white/25 text-right">MRR</div>
          <div className="hidden lg:block shrink-0 w-14 text-[9px] uppercase tracking-wide text-white/25 text-right">Team</div>
          <div className="hidden xl:block shrink-0 w-16 text-[9px] uppercase tracking-wide text-white/25">Country</div>
          <div className="hidden xl:block shrink-0 w-14 text-[9px] uppercase tracking-wide text-white/25">Founded</div>
          <div className="shrink-0 w-20 text-[9px] uppercase tracking-wide text-white/25">Status</div>
        </div>

        {portfolioCos.map((company: PortfolioCompany) => (
          <div
            key={company.id}
            className="flex items-center gap-3 px-5 py-2.5 cursor-pointer group border-b border-white/[0.035] last:border-b-0 hover:bg-white/[0.02] transition-colors"
            onClick={() => setOpenCompanyId(company.id)}
          >
            <Avatar name={company.name} size={28} />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-white/90 truncate block">{company.name}</span>
              <span className="text-[10px] text-white/30">{company.sector ?? '—'}</span>
            </div>
            <div className="shrink-0 w-24"><StageBadge stage={company.stage_label || company.stage} /></div>
            <div className="hidden md:block shrink-0 w-16 text-[11px] text-white/60 text-right">
              {company.mrr_usd ? fmt(company.mrr_usd) : <span className="text-white/15">—</span>}
            </div>
            <div className="hidden lg:block shrink-0 w-14 text-[11px] text-white/60 text-right">
              {company.employees ? company.employees.toLocaleString() : <span className="text-white/15">—</span>}
            </div>
            <div className="hidden xl:block shrink-0 w-16 text-[11px] text-white/45 truncate">{company.country || '—'}</div>
            <div className="hidden xl:block shrink-0 w-14 text-[11px] text-white/45">{company.founded_year ?? '—'}</div>
            <div className="shrink-0 w-20"><StatusBadge status={company.status} /></div>
          </div>
        ))}
      </Card>

      <PortfolioDetailModal companyId={openCompanyId} onClose={() => setOpenCompanyId(null)} onUpdated={refresh} />
    </div>
  );
}
