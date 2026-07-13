import { useMemo } from 'react';
import {
  Globe2, TrendingUp, Zap, Building2,
  Layers, DollarSign, Users, Compass,
} from 'lucide-react';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';
import { getIndustryKnowledge } from '../../lib/industryKnowledge';

const ACCENT = '#C1AEFF';

export function WorkspaceUniverseCanvas() {
  const { entryContext } = useFounderWorkspace();

  const industries = entryContext?.subdomains ?? [];
  const totalCompanies = entryContext?.totalCompanyCount ?? 0;
  const totalIndustries = industries.length;

  // Real per-industry trend data, ranked by CAGR — used for the "fastest movers"
  // synthesis below instead of the old static 4-combo list.
  const topMovers = useMemo(() => {
    return industries
      .map(ind => ({ ind, knowledge: getIndustryKnowledge(ind.name) }))
      .filter((x): x is { ind: typeof x.ind; knowledge: NonNullable<typeof x.knowledge> } => x.knowledge != null)
      .sort((a, b) => parseFloat(b.knowledge.cagr) - parseFloat(a.knowledge.cagr))
      .slice(0, 4);
  }, [industries]);

  const avgCagr = useMemo(() => {
    const rates = industries
      .map(ind => getIndustryKnowledge(ind.name)?.cagr)
      .filter((c): c is string => !!c)
      .map(c => parseFloat(c));
    if (!rates.length) return '—';
    return `${(rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1)}%`;
  }, [industries]);

  return (
    <div className="w-full h-full overflow-y-auto scrollbar-hide flex flex-col gap-5 pb-6 pr-1">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 rounded-2xl p-5 border border-white/8 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, rgba(193,174,255,0.08) 0%, rgba(255,255,255,0.02) 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 80% 50%, rgba(193,174,255,0.1) 0%, transparent 65%)',
        }} />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Globe2 className="w-5 h-5" style={{ color: ACCENT }} />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Universe Workspace</span>
          </div>
          <h2 className="text-2xl font-bold text-white leading-tight">Innovation Ecosystem</h2>
          <p className="text-sm text-white/45 mt-1 max-w-lg">
            {totalIndustries} industry verticals · {totalCompanies} companies. Switch to the Nodes tab to browse and drill into any of them.
          </p>
          <div className="flex items-center gap-4 mt-4">
            {[
              { label: 'Industries', value: totalIndustries, icon: Layers },
              { label: 'Companies', value: totalCompanies, icon: Building2 },
              { label: 'Avg CAGR', value: avgCagr, icon: TrendingUp },
              { label: 'Global Market', value: '$3.2T', icon: DollarSign },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex flex-col">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-white/30 mb-0.5">
                  <Icon className="w-3 h-3" />
                  {label}
                </div>
                <span className="text-sm font-bold text-white tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Fastest-Moving Industries (real data, not a browse grid) ─────── */}
      {topMovers.length > 0 && (
        <div className="shrink-0">
          <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
            Fastest-Moving Industries
          </div>
          <div className="grid grid-cols-2 gap-2">
            {topMovers.map(({ ind, knowledge }) => (
              <div key={ind.id} className="rounded-xl p-3 border border-white/8 bg-white/[0.02] flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm shrink-0">{knowledge.emoji}</span>
                  <span className="text-[11px] font-bold text-white">{ind.name}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto"
                    style={{ background: `${ind.color ?? ACCENT}1a`, color: ind.color ?? ACCENT, border: `1px solid ${ind.color ?? ACCENT}30` }}>
                    {knowledge.cagr} CAGR
                  </span>
                </div>
                <p className="text-[10px] text-white/45 leading-relaxed">{knowledge.tagline}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Cross-industry Signals ─────────────────────────────────────── */}
      <div className="shrink-0">
        <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} />
          Cross-Industry Signals
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'AI × FinTech', desc: 'Risk scoring, fraud detection, and autonomous trading driving massive M&A', color: '#60a5fa' },
            { label: 'HealthTech × AI', desc: 'Diagnostic AI and clinical decision support entering FDA fast-track', color: '#34d399' },
            { label: 'CleanTech × SaaS', desc: 'ESG reporting mandates driving vertical SaaS unicorn formation', color: '#4ade80' },
            { label: 'HR × AI', desc: 'Agentic AI recruiters replacing ATS — skills-first hiring is the new norm', color: '#a78bfa' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 border border-white/8 bg-white/[0.02] flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="text-[11px] font-bold" style={{ color: s.color }}>{s.label}</span>
              </div>
              <p className="text-[10px] text-white/45 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Global Macro Context ────────────────────────────────────────── */}
      <div className="shrink-0 rounded-xl p-4 border border-white/8 bg-white/[0.02]">
        <div className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-3 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Macro Context
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Global VC deployed (2025)', value: '$340B' },
            { label: 'Active unicorns', value: '1,240+' },
            { label: 'YoY startup formation', value: '+8.4%' },
          ].map(s => (
            <div key={s.label} className="rounded-lg p-2 bg-white/[0.02] border border-white/[0.06]">
              <div className="text-base font-bold text-white">{s.value}</div>
              <div className="text-[9px] text-white/30 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Nodes CTA ────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[11px] font-medium"
        style={{ background: `${ACCENT}0a`, color: `${ACCENT}90`, border: `1px solid ${ACCENT}18` }}
      >
        <Compass className="w-3.5 h-3.5" />
        Switch to the Nodes tab to browse every industry as a card and drill into subdomains
      </div>
    </div>
  );
}
