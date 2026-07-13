import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Building2, Globe2, Layers, Users, Boxes, Briefcase,
  TrendingUp, Star, Zap,
} from 'lucide-react';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';
import { getIndustryKnowledge, getSubdomainSignal, type IndustryKnowledge, type SubdomainSignal } from '../../lib/industryKnowledge';

/* ── palette rotation for cards without an intrinsic color ─────── */
const PALETTE = ['#6366f1', '#10b981', '#fbbf24', '#f43f5e', '#a78bfa', '#22d3ee', '#f97316', '#34d399'];
const ACCENT = '#C1AEFF';

/* deterministic pseudo-random series from a string seed */
function seededSeries(seed: string, n: number, min = 15, max = 90): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    out.push(min + (Math.abs(h) % (max - min)));
  }
  return out;
}

/* ── mini chart set (varied visuals per card) ───────────────────── */

function ChartBars({ color, seed }: { color: string; seed: string }) {
  const heights = seededSeries(seed, 8, 25, 95);
  return (
    <div className="flex items-end gap-[3px] h-full w-full">
      {heights.map((h, i) => (
        <div key={i} className="flex-1 rounded-[2px]"
          style={{ height: `${h}%`, background: `${color}${i % 2 ? 'cc' : '77'}` }} />
      ))}
    </div>
  );
}

function ChartArea({ color, seed }: { color: string; seed: string }) {
  const ys = seededSeries(seed, 8, 6, 36);
  const pts = ys.map((y, i) => `${i * 17},${42 - y}`).join(' ');
  return (
    <svg viewBox="0 0 120 44" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id={`hn-area-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.45} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon fill={`url(#hn-area-${seed})`} points={`${pts} 119,44 0,44`} />
      <polyline fill="none" stroke={color} strokeWidth={1.6} strokeOpacity={0.9} points={pts} />
    </svg>
  );
}

function ChartLine({ color, seed }: { color: string; seed: string }) {
  const ys = seededSeries(seed, 7, 4, 34);
  const pts = ys.map((y, i) => `${i * 20},${40 - y}`).join(' ');
  return (
    <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="w-full h-full">
      <polyline fill="none" stroke={color} strokeWidth={1.6} strokeOpacity={0.9} points={pts} />
      {ys.map((y, i) => (
        <circle key={i} cx={i * 20} cy={40 - y} r={1.8} fill={color} fillOpacity={0.9} />
      ))}
    </svg>
  );
}

function ChartDonut({ color, seed, label }: { color: string; seed: string; label: string }) {
  const parts = seededSeries(seed, 3, 20, 60);
  const total = parts.reduce((s, v) => s + v, 0);
  const r = 20;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const opacities = [0.95, 0.55, 0.25];
  return (
    <div className="relative h-full flex items-center justify-center">
      <svg viewBox="0 0 56 56" className="h-full -rotate-90" style={{ maxHeight: 64 }}>
        {parts.map((p, i) => {
          const frac = p / total;
          const el = (
            <circle key={i} cx="28" cy="28" r={r} fill="none"
              stroke={color} strokeOpacity={opacities[i]} strokeWidth={6}
              strokeDasharray={`${c * frac - 2} ${c - c * frac + 2}`}
              strokeDashoffset={-c * acc} />
          );
          acc += frac;
          return el;
        })}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

function ChartGauge({ color, value }: { color: string; value: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-full flex items-center justify-center">
      <svg viewBox="0 0 56 56" className="h-full -rotate-90" style={{ maxHeight: 64 }}>
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={4.5} />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth={4.5} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}
          style={{ filter: `drop-shadow(0 0 4px ${color}aa)` }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold" style={{ color }}>
        {value}%
      </span>
    </div>
  );
}

function ChartRadar({ color, seed }: { color: string; seed: string }) {
  const vals = seededSeries(seed, 5, 35, 95).map(v => v / 100);
  const angles = [-90, -18, 54, 126, 198].map(a => (a * Math.PI) / 180);
  const pt = (s: number, i: number) =>
    `${50 + 40 * s * Math.cos(angles[i])},${50 + 40 * s * Math.sin(angles[i])}`;
  const ring = (s: number) => angles.map((_, i) => pt(s, i)).join(' ');
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      {[1, 0.66, 0.33].map(s => (
        <polygon key={s} points={ring(s)} fill="none" stroke={color} strokeWidth={0.8} strokeOpacity={0.22} />
      ))}
      <polygon points={vals.map((v, i) => pt(v, i)).join(' ')}
        fill={`${color}33`} stroke={color} strokeWidth={1.2} strokeOpacity={0.85} />
    </svg>
  );
}

/* ── node model ─────────────────────────────────────────────────── */

interface HierarchyNode {
  id: string;
  title: string;
  subtitle: string;
  description?: string;
  accent: string;
  icon: 'globe' | 'layers' | 'building' | 'users' | 'boxes' | 'briefcase';
  stats: { label: string; value: string }[];
  chart: 'bars' | 'area' | 'line' | 'donut' | 'gauge' | 'radar';
  chartLabel?: string;
  gaugeValue?: number;
  children?: { label: string; meta?: string }[];
  live?: boolean;
  knowledge?: IndustryKnowledge | null;
  signal?: SubdomainSignal | null;
  exploreLabel?: string;
  onExplore?: () => void;
}

const NODE_ICONS = {
  globe: Globe2, layers: Layers, building: Building2,
  users: Users, boxes: Boxes, briefcase: Briefcase,
};

const CHART_CYCLE: HierarchyNode['chart'][] = ['bars', 'area', 'donut', 'line', 'gauge', 'radar'];

/* ── main canvas ────────────────────────────────────────────────── */

export function WorkspaceHierarchyNodesCanvas({ isFullscreen }: { isFullscreen: boolean }) {
  const { entryContext, setEntryContext, departments, totalFTE } = useFounderWorkspace();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { levelLabel, nodes } = useMemo((): { levelLabel: string; nodes: HierarchyNode[] } => {
    const ctx = entryContext;

    const mk = (
      i: number,
      base: Omit<HierarchyNode, 'chart' | 'accent'> & { accent?: string },
    ): HierarchyNode => ({
      ...base,
      accent: base.accent ?? PALETTE[i % PALETTE.length],
      chart: CHART_CYCLE[i % CHART_CYCLE.length],
      gaugeValue: 40 + (seededSeries(base.id, 1, 0, 55)[0] ?? 30),
    });

    /* industry level → subdomain cards */
    if (ctx?.level === 'industry' && ctx.subdomains?.length) {
      const industryId = ctx.industryId;
      const industryName = ctx.industryName ?? '';
      const industryColor = ctx.industryColor ?? ACCENT;
      return {
        levelLabel: `${ctx.industryName ?? 'Industry'} · Subdomains`,
        nodes: ctx.subdomains.map((s, i) => {
          const signal = getSubdomainSignal(s.name);
          const fullInd = ctx.allIndustries?.find(ind => ind.id === industryId);
          const fullSub = fullInd?.subdomains.find(sd => sd.id === s.id);
          return mk(i, {
            id: s.id,
            title: s.name,
            subtitle: 'Subdomain',
            description: signal?.trend ?? s.description,
            accent: s.color,
            icon: 'layers',
            signal,
            stats: [
              { label: 'Companies', value: `${s.companyCount}` },
              { label: 'Signals', value: `${seededSeries(s.id, 1, 3, 24)[0]}` },
            ],
            chartLabel: `${s.companyCount}`,
            children: fullSub?.companies.slice(0, 6).map(c => ({ label: c.name, meta: c.stage })) ?? [],
            exploreLabel: `Explore ${s.name} Companies`,
            onExplore: () => setEntryContext({
              level: 'subdomain',
              industryId,
              industryName,
              industryColor,
              subdomainId: s.id,
              subdomainName: s.name,
              subdomainDescription: s.description,
              companies: fullSub?.companies.map(c => ({
                id: c.id, name: c.name, description: c.description, isLive: c.isLive,
              })) ?? [],
              allIndustries: ctx.allIndustries,
            }),
          });
        }),
      };
    }

    /* subdomain level → company planet cards */
    if (ctx?.level === 'subdomain' && ctx.companies?.length) {
      const industryId = ctx.industryId;
      const industryName = ctx.industryName ?? '';
      const industryColor = ctx.industryColor ?? ACCENT;
      const subdomainId = ctx.subdomainId;
      const subdomainName = ctx.subdomainName ?? '';
      return {
        levelLabel: `${ctx.subdomainName ?? 'Subdomain'} · Companies`,
        nodes: ctx.companies.map((c, i) => mk(i, {
          id: c.id,
          title: c.name,
          subtitle: c.stage ?? 'Company',
          description: c.description,
          icon: 'building',
          live: c.isLive,
          stats: [
            { label: 'Stage', value: c.stage ?? '—' },
            { label: 'Team', value: c.employees != null ? `${c.employees}` : '—' },
          ],
          chartLabel: c.employees != null ? `${c.employees}` : '—',
          children: [
            { label: c.isLive ? 'Tracked live in this OS' : 'External — public data only', meta: c.isLive ? 'Live' : undefined },
            { label: `Funding stage: ${c.stage ?? 'unknown'}`, meta: undefined },
            ...(c.employees != null ? [{ label: `Team size: ${c.employees} people`, meta: undefined }] : []),
          ],
          exploreLabel: `Open ${c.name}`,
          onExplore: () => setEntryContext({
            level: 'company',
            companyId: c.id,
            companyName: c.name,
            companyDescription: c.description,
            companyStage: c.stage,
            companyEmployees: c.employees,
            companyIsLive: c.isLive,
            companyRelationship: c.isLive ? 'own' : undefined,
            companyRole: 'founder',
            industryId,
            industryName: industryName || undefined,
            industryColor,
            subdomainId,
            subdomainName,
            allIndustries: ctx.allIndustries,
          }),
        })),
      };
    }

    /* company / node level → department cards */
    if ((ctx?.level === 'company' || ctx?.level === 'node') && departments.length) {
      return {
        levelLabel: `${ctx.companyName ?? ctx.rootLabel ?? 'Company'} · Departments`,
        nodes: departments.map((d, i) => mk(i, {
          id: d.id,
          title: d.name,
          subtitle: 'Department',
          icon: 'users',
          stats: [
            { label: 'FTE', value: `${d.fte}` },
            { label: 'Share', value: totalFTE ? `${Math.round((d.fte / totalFTE) * 100)}%` : '—' },
          ],
          chartLabel: `${d.fte}`,
          children: d.roles.map(r => ({ label: r })),
        })),
      };
    }

    /* universe level (default) → industry cards */
    if (ctx?.allIndustries?.length) {
      return {
        levelLabel: 'Universe · Industries',
        nodes: ctx.allIndustries.map((ind, i) => {
          const companyCount = ind.subdomains.reduce((s, sd) => s + sd.companies.length, 0);
          const knowledge = getIndustryKnowledge(ind.name);
          return mk(i, {
            id: ind.id,
            title: ind.name,
            subtitle: 'Industry',
            description: knowledge?.tagline ?? ind.description,
            accent: ind.color,
            icon: 'globe',
            knowledge,
            stats: [
              { label: 'Subdomains', value: `${ind.subdomains.length}` },
              { label: 'Companies', value: `${companyCount}` },
              ...(knowledge ? [
                { label: 'Market Size', value: knowledge.marketSize },
                { label: 'CAGR', value: knowledge.cagr },
              ] : []),
            ],
            chartLabel: `${companyCount}`,
            children: ind.subdomains.map(sd => ({ label: sd.name, meta: `${sd.companies.length} companies` })),
            exploreLabel: `Explore ${ind.name} Subdomains`,
            onExplore: () => setEntryContext({
              level: 'industry',
              industryId: ind.id,
              industryName: ind.name,
              industryColor: ind.color ?? ACCENT,
              industryDescription: ind.description,
              subdomains: ind.subdomains.map(s => ({
                id: s.id,
                name: s.name,
                description: s.description,
                companyCount: s.companies.length,
                color: ind.color ?? ACCENT,
              })),
              totalCompanyCount: companyCount,
              allIndustries: ctx.allIndustries,
            }),
          });
        }),
      };
    }

    /* no hierarchy context at all → departments fallback */
    return {
      levelLabel: 'Workspace · Departments',
      nodes: departments.map((d, i) => mk(i, {
        id: d.id,
        title: d.name,
        subtitle: 'Department',
        icon: 'users',
        stats: [
          { label: 'FTE', value: `${d.fte}` },
          { label: 'Share', value: totalFTE ? `${Math.round((d.fte / totalFTE) * 100)}%` : '—' },
        ],
        chartLabel: `${d.fte}`,
        children: d.roles.map(r => ({ label: r })),
      })),
    };
  }, [entryContext, departments, totalFTE, setEntryContext]);

  const expanded = nodes.find(n => n.id === expandedId) ?? null;

  const renderChart = (n: HierarchyNode) => {
    switch (n.chart) {
      case 'bars':  return <ChartBars color={n.accent} seed={n.id} />;
      case 'area':  return <ChartArea color={n.accent} seed={n.id} />;
      case 'line':  return <ChartLine color={n.accent} seed={n.id} />;
      case 'donut': return <ChartDonut color={n.accent} seed={n.id} label={n.chartLabel ?? ''} />;
      case 'gauge': return <ChartGauge color={n.accent} value={n.gaugeValue ?? 60} />;
      case 'radar': return <ChartRadar color={n.accent} seed={n.id} />;
    }
  };

  /* ── expanded detail view ─────────────────────────────────────── */
  if (expanded) {
    const Icon = NODE_ICONS[expanded.icon];
    return (
      <div className="absolute inset-0 flex flex-col overflow-hidden p-4">
        <div
          className="ws-glass-block relative flex-1 min-h-0"
          style={{ position: 'relative', ['--card-accent' as string]: expanded.accent }}
        >
          <div className="ws-glass-block__extrude" />
          <div className="ws-glass-block__face flex flex-col overflow-y-auto" style={{ position: 'absolute', padding: '20px 26px' }}>
            <div className="flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: `linear-gradient(135deg, color-mix(in srgb, ${expanded.accent} 40%, transparent), transparent)`,
                    border: `1px solid color-mix(in srgb, ${expanded.accent} 35%, transparent)`,
                  }}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight">{expanded.title}</h3>
                  <span className="text-[11px]" style={{ color: expanded.accent }}>{expanded.subtitle}</span>
                </div>
              </div>
              <button type="button" onClick={() => setExpandedId(null)}
                className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 transition-colors shrink-0">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            </div>

            {expanded.description && (
              <p className="text-[12px] text-white/50 mt-3 max-w-xl leading-relaxed shrink-0">{expanded.description}</p>
            )}

            {expanded.signal?.hot && (
              <div className="flex items-center gap-1.5 mt-2 shrink-0">
                <Zap className="w-3 h-3" style={{ color: '#fbbf24' }} />
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Hot right now</span>
              </div>
            )}

            <div className="flex gap-2.5 mt-4 shrink-0 flex-wrap">
              {expanded.stats.map(s => (
                <div key={s.label} className="px-3.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07]">
                  <div className="text-[9px] uppercase tracking-wider text-white/30">{s.label}</div>
                  <div className="text-[15px] font-bold text-white mt-0.5">{s.value}</div>
                </div>
              ))}
              {expanded.live && (
                <div className="px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-[9px] uppercase tracking-wider text-emerald-400/60">Status</div>
                  <div className="text-[15px] font-bold text-emerald-400 mt-0.5">Live</div>
                </div>
              )}
            </div>

            {/* Industry nodes: real trends/metrics dashboard instead of a fake chart */}
            {expanded.knowledge ? (
              <div className="grid grid-cols-2 gap-5 mt-5">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-white/30 mb-1.5 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Key Trends
                  </div>
                  <ul className="space-y-1.5">
                    {expanded.knowledge.keyTrends.map(t => (
                      <li key={t} className="flex items-start gap-1.5 text-[11px] text-white/60">
                        <span className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: expanded.accent }} />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-white/30 mb-1.5 flex items-center gap-1">
                    <Star className="w-3 h-3" /> Key Metrics to Track
                  </div>
                  <ul className="space-y-1.5">
                    {expanded.knowledge.keyMetrics.map(m => (
                      <li key={m} className="flex items-start gap-1.5 text-[11px] text-white/60">
                        <span className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: '#fbbf24' }} />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex gap-5 mt-5 flex-1 min-h-0">
                <div className="flex-1 min-w-0" style={{ maxHeight: 200 }}>
                  {renderChart(expanded)}
                </div>
                {expanded.children && expanded.children.length > 0 && (
                  <div className="w-[260px] shrink-0 overflow-y-auto pr-1">
                    <div className="text-[9px] uppercase tracking-wider text-white/30 mb-2">Contains</div>
                    {expanded.children.map(ch => (
                      <div key={ch.label} className="flex items-center justify-between py-2 border-b border-white/[0.05]">
                        <span className="text-[12px] text-white/70 truncate">{ch.label}</span>
                        {ch.meta && <span className="text-[10px] text-white/30 shrink-0 ml-2">{ch.meta}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {expanded.onExplore && (
              <button
                type="button"
                onClick={expanded.onExplore}
                className="mt-5 shrink-0 flex items-center gap-1.5 text-[11px] font-semibold px-3.5 py-2 rounded-lg transition-all hover:opacity-90 self-start"
                style={{ background: `${expanded.accent}1a`, color: expanded.accent, border: `1px solid ${expanded.accent}30` }}
              >
                <ArrowRight className="w-3.5 h-3.5" />
                {expanded.exploreLabel ?? 'Explore'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── card grid ────────────────────────────────────────────────── */
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{levelLabel}</span>
        <span className="text-[10px] text-white/25 font-mono">{nodes.length} nodes</span>
      </div>

      {nodes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[12px] text-white/30">
          No nodes at this level yet.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
          <div className="grid gap-4" style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${isFullscreen ? 250 : 220}px, 1fr))`,
          }}>
            {nodes.map(n => {
              const Icon = NODE_ICONS[n.icon];
              return (
                <div
                  key={n.id}
                  onClick={() => setExpandedId(n.id)}
                  className="ws-glass-block cursor-pointer transition-colors hover:border-white/20"
                  style={{ position: 'relative', height: 172, ['--card-accent' as string]: n.accent }}
                >
                  <div className="ws-glass-block__extrude" />
                  <div className="ws-glass-block__face flex flex-col" style={{ position: 'absolute', padding: '12px 14px' }}>
                    <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: n.accent }} strokeWidth={2} />
                      <span className="text-[9.5px] font-bold tracking-[0.13em] uppercase truncate" style={{ color: n.accent }}>
                        {n.title}
                      </span>
                      {n.live && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 ml-auto"
                          style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
                      )}
                      {n.signal?.hot && !n.live && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 ml-auto animate-pulse" />
                      )}
                    </div>
                    <span className="text-[9px] text-white/35 mt-0.5 shrink-0">{n.subtitle}</span>

                    <div className="flex gap-3 mt-2 shrink-0">
                      {n.stats.slice(0, 2).map(s => (
                        <div key={s.label}>
                          <div className="text-[8px] uppercase tracking-wider text-white/28">{s.label}</div>
                          <div className="text-[13px] font-bold text-white leading-tight">{s.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="flex-1 min-h-0 mt-2">
                      {renderChart(n)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
