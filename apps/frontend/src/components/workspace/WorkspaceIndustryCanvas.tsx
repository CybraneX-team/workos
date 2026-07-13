import {
  Building2, TrendingUp, Zap, ChevronLeft,
  Layers, Globe2, Star, Compass,
} from 'lucide-react';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';
import { getIndustryKnowledge, getSubdomainSignal } from '../../lib/industryKnowledge';

const ACCENT = '#C1AEFF';

export function WorkspaceIndustryCanvas() {
  const { entryContext, setEntryContext } = useFounderWorkspace();

  const industryId = entryContext?.industryId;
  const industryName = entryContext?.industryName ?? 'Industry';
  const industryColor = entryContext?.industryColor ?? ACCENT;
  const industryDescription = entryContext?.industryDescription;
  const subdomains = entryContext?.subdomains ?? [];
  const totalCompanies = entryContext?.totalCompanyCount ?? 0;
  const knowledge = getIndustryKnowledge(industryName);

  const handleBackToUniverse = () => {
    setEntryContext({
      level: 'universe',
      subdomains: entryContext?.allIndustries?.map(i => ({
        id: i.id, name: i.name, description: i.description,
        companyCount: i.subdomains.reduce((sum, s) => sum + s.companies.length, 0),
        color: i.color,
      })) ?? [],
      totalCompanyCount: entryContext?.allIndustries?.reduce(
        (total, i) => total + i.subdomains.reduce((s2, s) => s2 + s.companies.length, 0), 0
      ) ?? 0,
      allIndustries: entryContext?.allIndustries,
    });
  };

  const handleDrillIntoSubdomain = (sub: { id: string; name: string; description?: string; companyCount: number }) => {
    const fullInd = entryContext?.allIndustries?.find(i => i.id === industryId);
    const fullSub = fullInd?.subdomains.find(s => s.id === sub.id);
    setEntryContext({
      level: 'subdomain',
      industryId,
      industryName,
      industryColor,
      subdomainId: sub.id,
      subdomainName: sub.name,
      subdomainDescription: sub.description,
      companies: fullSub?.companies.map(c => ({
        id: c.id, name: c.name, description: c.description, isLive: c.isLive,
      })) ?? [],
      allIndustries: entryContext?.allIndustries,
    });
  };

  const hotSubdomains = subdomains.filter(s => getSubdomainSignal(s.name)?.hot);

  return (
    <div className="w-full h-full overflow-y-auto scrollbar-hide flex flex-col gap-5 pb-6 pr-1">

      {/* ── Industry Header ──────────────────────────────────────────────── */}
      <div
        className="shrink-0 rounded-2xl p-5 border relative overflow-hidden"
        style={{ borderColor: `${industryColor}30`, background: `linear-gradient(135deg, ${industryColor}0d 0%, rgba(255,255,255,0.02) 100%)` }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse at 80% 50%, ${industryColor}12 0%, transparent 65%)`,
        }} />
        <div className="relative">
          {entryContext?.allIndustries && (
            <button
              type="button"
              onClick={handleBackToUniverse}
              className="flex items-center gap-1 text-[10px] font-semibold mb-3 opacity-50 hover:opacity-90 transition-opacity"
              style={{ color: industryColor }}
            >
              <ChevronLeft className="w-3 h-3" />
              All Industries
            </button>
          )}
          <div className="flex items-center gap-2 mb-1">
            <Globe2 className="w-4 h-4" style={{ color: industryColor }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: `${industryColor}80` }}>
              Industry Workspace
            </span>
          </div>
          <h2 className="text-2xl font-bold text-white leading-tight">{industryName}</h2>
          <p className="text-sm text-white/45 mt-1 max-w-lg">
            {knowledge?.tagline ?? industryDescription}
          </p>
          <div className="flex items-center gap-5 mt-4">
            {[
              { label: 'Subdomains', value: subdomains.length, icon: Layers },
              { label: 'Companies', value: totalCompanies, icon: Building2 },
              { label: 'Hot Areas', value: hotSubdomains.length, icon: Zap },
              ...(knowledge ? [
                { label: 'Market Size', value: knowledge.marketSize, icon: TrendingUp },
                { label: 'CAGR', value: knowledge.cagr, icon: TrendingUp },
              ] : []),
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

      {/* ── Hot Right Now (quick-jump, not a full listing) ────────────────── */}
      {hotSubdomains.length > 0 && (
        <div className="shrink-0">
          <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} />
            Hot Right Now in {industryName}
          </div>
          <div className="flex flex-wrap gap-2">
            {hotSubdomains.slice(0, 4).map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleDrillIntoSubdomain(s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all hover:opacity-75"
                style={{ background: `${industryColor}1a`, color: industryColor, border: `1px solid ${industryColor}30` }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {s.name}
                <span className="text-[9px] opacity-60">· {s.companyCount} cos</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Deep-Dive Analysis (real content, not a subdomain browse grid) ── */}
      {knowledge && (
        <div className="shrink-0 rounded-xl p-4 border border-white/8 bg-white/[0.02]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-3 flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} />
            Why {industryName}, Why Now
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-white/30 mb-1.5 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Key Trends
              </div>
              <ul className="space-y-1.5">
                {knowledge.keyTrends.map(t => (
                  <li key={t} className="flex items-start gap-1.5 text-[11px] text-white/55">
                    <span className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: industryColor }} />
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
                {knowledge.keyMetrics.map(m => (
                  <li key={m} className="flex items-start gap-1.5 text-[11px] text-white/55">
                    <span className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: '#fbbf24' }} />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Nodes CTA ────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[11px] font-medium"
        style={{ background: `${industryColor}0a`, color: `${industryColor}90`, border: `1px solid ${industryColor}18` }}
      >
        <Compass className="w-3.5 h-3.5" />
        Switch to the Nodes tab to browse every subdomain in {industryName} and drill into companies
      </div>
    </div>
  );
}
