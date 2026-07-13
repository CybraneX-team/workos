import {
  Building2, Layers, Target, Zap, ArrowRight,
  TrendingUp, Globe2, ChevronLeft, Users,
  Handshake, Swords, Landmark, ShieldCheck,
  Lock, AlertCircle, ChevronRight, Star, BarChart2,
  MessageSquare, Phone,
} from 'lucide-react';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';
import { WorkspaceCanvasOverview } from './WorkspaceCanvasOverview';
import { useSavedWorkflows } from '../../lib/useSavedWorkflows';

const ACCENT = '#C1AEFF';

// ── Relationship metadata ─────────────────────────────────────────────────────
const RELATIONSHIPS = [
  {
    id: 'own' as const,
    label: 'My Company',
    sublabel: 'You own or co-founded this',
    icon: Building2,
    color: '#C1AEFF',
    description: 'Full workspace access — strategy, execution, metrics, and decisions.',
  },
  {
    id: 'opportunity' as const,
    label: 'Opportunity',
    sublabel: 'Potential client, deal, or customer',
    icon: Target,
    color: '#34d399',
    description: 'Track deal stage, fit analysis, and outreach context.',
  },
  {
    id: 'competitor' as const,
    label: 'Competitor',
    sublabel: 'Competing in your space',
    icon: Swords,
    color: '#fb7185',
    description: 'Monitor positioning, signals, and market overlap.',
  },
  {
    id: 'investor' as const,
    label: 'Investor / VC',
    sublabel: 'Fund or angel to pitch',
    icon: Landmark,
    color: '#fbbf24',
    description: 'Analyse thesis fit, track outreach, and prep materials.',
  },
  {
    id: 'partner' as const,
    label: 'Partner',
    sublabel: 'Integration, reseller, or collaborator',
    icon: Handshake,
    color: '#60a5fa',
    description: 'Map collaboration opportunities and partnership context.',
  },
] as const;

type Relationship = typeof RELATIONSHIPS[number]['id'];

// ── Shared back-navigation hook ───────────────────────────────────────────────
function useBackHandler() {
  const { entryContext, setEntryContext } = useFounderWorkspace();

  return () => {
    const industryId = entryContext?.industryId;
    const industryName = entryContext?.industryName;
    const industryColor = entryContext?.industryColor ?? ACCENT;
    const subdomainId = entryContext?.subdomainId;
    const subdomainName = entryContext?.subdomainName;

    if (subdomainId) {
      const fullInd = entryContext?.allIndustries?.find(i => i.id === industryId);
      const fullSub = fullInd?.subdomains.find(s => s.id === subdomainId);
      setEntryContext({
        level: 'subdomain',
        industryId,
        industryName: industryName ?? undefined,
        industryColor,
        subdomainId,
        subdomainName: subdomainName ?? undefined,
        companies: fullSub?.companies.map(c => ({
          id: c.id, name: c.name, description: c.description, isLive: c.isLive,
        })) ?? [],
        allIndustries: entryContext?.allIndustries,
      });
    } else if (industryId) {
      const fullInd = entryContext?.allIndustries?.find(i => i.id === industryId);
      setEntryContext({
        level: 'industry',
        industryId,
        industryName: industryName ?? undefined,
        industryColor,
        subdomains: fullInd?.subdomains.map(s => ({
          id: s.id, name: s.name, description: s.description,
          companyCount: s.companies.length, color: industryColor,
        })) ?? [],
        totalCompanyCount: fullInd?.subdomains.reduce((sum, s) => sum + s.companies.length, 0) ?? 0,
        allIndustries: entryContext?.allIndustries,
      });
    }
  };
}

// ── Shared company header ─────────────────────────────────────────────────────
function CompanyHeader({
  companyName,
  industryName,
  subdomainName,
  industryColor,
  backLabel,
  onBack,
  badge,
}: {
  companyName: string;
  industryName?: string;
  subdomainName?: string;
  industryColor: string;
  backLabel?: string;
  onBack: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <div
      className="shrink-0 rounded-2xl p-5 border relative overflow-hidden"
      style={{ borderColor: `${industryColor}30`, background: `linear-gradient(135deg, ${industryColor}0d 0%, rgba(255,255,255,0.02) 100%)` }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `radial-gradient(ellipse at 80% 50%, ${industryColor}14 0%, transparent 65%)`,
      }} />
      <div className="relative">
        {backLabel && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-[10px] font-semibold mb-3 opacity-50 hover:opacity-90 transition-opacity"
            style={{ color: industryColor }}
          >
            <ChevronLeft className="w-3 h-3" />
            {backLabel}
          </button>
        )}
        {(industryName || subdomainName) && (
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] mb-0.5 flex items-center gap-1.5">
            <Globe2 className="w-3 h-3" style={{ color: `${industryColor}70` }} />
            <span style={{ color: `${industryColor}70` }}>
              {[industryName, subdomainName].filter(Boolean).join(' › ')}
            </span>
          </div>
        )}
        <h2 className="text-xl font-bold text-white leading-tight">{companyName}</h2>
        {badge && <div className="mt-2">{badge}</div>}
      </div>
    </div>
  );
}

// ── Relationship picker ───────────────────────────────────────────────────────
function RelationshipPicker({ companyName, onPick }: { companyName: string; onPick: (r: Relationship) => void }) {
  return (
    <div className="w-full flex flex-col gap-4 pb-6 pr-1">
      <div className="text-center pt-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-1">Workspace Setup</div>
        <h3 className="text-lg font-bold text-white">Your relationship with</h3>
        <h3 className="text-lg font-bold" style={{ color: ACCENT }}>{companyName}</h3>
        <p className="text-[11px] text-white/35 mt-1.5 max-w-xs mx-auto">
          Choose how you're connected — we'll tailor the workspace to only show relevant, appropriate information.
        </p>
      </div>

      <div className="flex flex-col gap-2 mt-1">
        {RELATIONSHIPS.filter(r => r.id !== 'own' && r.id !== 'investor').map(rel => {
          const Icon = rel.icon;
          return (
            <button
              key={rel.id}
              type="button"
              onClick={() => onPick(rel.id)}
              className="group flex items-center gap-4 px-4 py-3.5 rounded-xl border border-white/8 bg-white/[0.02] hover:border-white/18 hover:bg-white/[0.04] transition-all text-left"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${rel.color}18`, border: `1px solid ${rel.color}30` }}
              >
                <Icon className="w-4.5 h-4.5" style={{ color: rel.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">{rel.label}</div>
                <div className="text-[10px] text-white/40 mt-0.5">{rel.sublabel}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/55 transition-colors shrink-0" />
            </button>
          );
        })}
      </div>

      {/* Privacy notice */}
      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-[10px] text-white/35 border border-white/6 bg-white/[0.01]">
        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-white/25" />
        <span>
          For companies you don't own, we only show <strong className="text-white/50">publicly available information</strong>. Internal metrics, tasks, and decisions are never exposed across company boundaries.
        </span>
      </div>
    </div>
  );
}

// ── Own company view (full internal workspace) ────────────────────────────────
function OwnCompanyView() {
  const { entryContext, setActiveSidebarTab, setEntryContext } = useFounderWorkspace();

  const companyName = entryContext?.companyName ?? 'Company';
  const industryColor = entryContext?.industryColor ?? ACCENT;
  const industryName = entryContext?.industryName;
  const subdomainName = entryContext?.subdomainName;
  const backLabel = subdomainName ?? industryName;
  const handleBack = useBackHandler();

  const handleChangeRelationship = () => {
    setEntryContext({ ...entryContext!, companyRelationship: undefined });
  };

  return (
    <div className="w-full h-full overflow-y-auto scrollbar-hide flex flex-col gap-4 pb-6 pr-1">
      <CompanyHeader
        companyName={companyName}
        industryName={industryName}
        subdomainName={subdomainName}
        industryColor={industryColor}
        backLabel={backLabel}
        onBack={handleBack}
        badge={
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: `${ACCENT}18`, color: ACCENT, border: `1px solid ${ACCENT}30` }}
            >
              My Company
            </span>
            <button
              type="button"
              onClick={handleChangeRelationship}
              className="text-[9px] text-white/25 hover:text-white/50 transition-colors underline"
            >
              not your company?
            </button>
          </div>
        }
      />

      <div className="shrink-0 grid grid-cols-3 gap-2">
        {[
          { label: 'Strategy', desc: 'Decisions & roadmap', color: '#a78bfa', icon: TrendingUp, tab: 'projects' },
          { label: 'Execution', desc: 'Tasks & milestones', color: '#34d399', icon: Zap, tab: 'projects' },
          { label: 'Market', desc: 'Competitors & signals', color: '#fbbf24', icon: Building2, tab: 'competitors' },
        ].map(({ label, desc, color, icon: Icon, tab }) => (
          <button
            key={label}
            type="button"
            onClick={() => setActiveSidebarTab(tab)}
            className="rounded-xl p-3 border border-white/8 bg-white/[0.02] text-left hover:border-white/15 hover:bg-white/[0.04] transition-all"
          >
            <Icon className="w-4 h-4 mb-2" style={{ color }} />
            <div className="text-sm font-semibold text-white">{label}</div>
            <div className="text-[10px] text-white/35 mt-0.5">{desc}</div>
          </button>
        ))}
      </div>

      <div>
        <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/30 mb-3 flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          Company Workspace — {companyName}
        </div>
        <WorkspaceCanvasOverview />
      </div>
    </div>
  );
}

// ── External company header pill (shows data restriction notice) ──────────────
function ExternalBadge({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className="text-[10px] font-bold px-2.5 py-1 rounded-full"
        style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
      >
        {label}
      </span>
      <span className="flex items-center gap-1 text-[9px] text-white/30">
        <ShieldCheck className="w-3 h-3" />
        Public data only
      </span>
    </div>
  );
}

type LucideIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon: Icon, color = 'white', children }: {
  title: string; icon: LucideIcon; color?: string; children: React.ReactNode;
}) {
  return (
    <div className="shrink-0">
      <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/30 mb-2.5 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Action button row ─────────────────────────────────────────────────────────
function ActionRow({ actions }: { actions: { label: string; icon: LucideIcon; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(({ label, icon: Icon, color }) => (
        <button
          key={label}
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.08] transition-all"
        >
          <Icon className="w-3.5 h-3.5" style={{ color }} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Info card grid ────────────────────────────────────────────────────────────
function InfoGrid({ items }: { items: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ label, value, sub }) => (
        <div key={label} className="rounded-xl p-3 border border-white/8 bg-white/[0.02] flex flex-col gap-0.5">
          <div className="text-[9px] text-white/30 uppercase tracking-wider">{label}</div>
          <div className="text-sm font-bold text-white">{value}</div>
          {sub && <div className="text-[9px] text-white/30">{sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Stage track (deal pipeline) ───────────────────────────────────────────────
const DEAL_STAGES = ['Prospecting', 'Qualified', 'Proposal', 'Negotiation', 'Closed'];

function DealTrack({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-0">
      {DEAL_STAGES.map((stage, i) => (
        <div key={stage} className="flex items-center">
          <button
            type="button"
            className="flex flex-col items-center gap-1 px-2.5 py-2 rounded-lg hover:bg-white/5 transition-all group"
          >
            <div
              className="w-2.5 h-2.5 rounded-full border-2 transition-all"
              style={i === 0
                ? { borderColor: color, background: color }
                : { borderColor: 'rgba(255,255,255,0.15)', background: 'transparent' }}
            />
            <span className="text-[9px] text-white/35 group-hover:text-white/60 transition-colors whitespace-nowrap">
              {stage}
            </span>
          </button>
          {i < DEAL_STAGES.length - 1 && (
            <div className="w-3 h-px bg-white/10 shrink-0 -mt-3.5" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Opportunity view ──────────────────────────────────────────────────────────
function OpportunityView() {
  const { entryContext } = useFounderWorkspace();
  const rel = RELATIONSHIPS.find(r => r.id === 'opportunity')!;
  const color = rel.color;
  const companyName = entryContext?.companyName ?? 'Company';
  const desc = entryContext?.companyDescription;
  const stage = entryContext?.companyStage;
  const employees = entryContext?.companyEmployees;
  const handleBack = useBackHandler();
  const backLabel = entryContext?.subdomainName ?? entryContext?.industryName;

  return (
    <div className="w-full flex flex-col gap-4 pb-6 pr-1">
      <CompanyHeader
        companyName={companyName}
        industryName={entryContext?.industryName}
        subdomainName={entryContext?.subdomainName}
        industryColor={color}
        backLabel={backLabel}
        onBack={handleBack}
        badge={<ExternalBadge label="Opportunity" color={color} />}
      />

      <Section title="Deal Pipeline" icon={Target} color={color}>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <div className="text-[10px] text-white/40 mb-3">Where is this deal right now?</div>
          <DealTrack color={color} />
        </div>
      </Section>

      <Section title="Company Overview" icon={Building2} color={color}>
        {desc && <p className="text-[11px] text-white/45 mb-3 leading-relaxed">{desc}</p>}
        <InfoGrid items={[
          { label: 'Funding Stage', value: stage ?? '—' },
          { label: 'Team Size', value: employees ? (employees > 1000 ? `${(employees / 1000).toFixed(1)}k` : String(employees)) : '—' },
          { label: 'ICP Fit', value: '—', sub: 'Not scored yet' },
        ]} />
      </Section>

      <Section title="ICP Alignment" icon={Star} color={color}>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-2.5">
          {[
            { label: 'Company size match', note: 'Assess against your target segment' },
            { label: 'Industry relevance', note: 'Check if they operate in your target verticals' },
            { label: 'Budget signals', note: 'Stage indicates likely purchasing power' },
          ].map(({ label, note }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-4 h-4 rounded border border-white/15 shrink-0" />
              <div>
                <div className="text-[11px] font-semibold text-white/70">{label}</div>
                <div className="text-[9px] text-white/30">{note}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Actions" icon={Zap} color={color}>
        <ActionRow actions={[
          { label: 'Draft intro email', icon: MessageSquare, color },
          { label: 'Log a call', icon: Phone, color },
          { label: 'Add to pipeline', icon: ArrowRight, color },
        ]} />
      </Section>

      <PrivacyFooter />
    </div>
  );
}

// ── Competitor view ───────────────────────────────────────────────────────────
function CompetitorView() {
  const { entryContext } = useFounderWorkspace();
  const rel = RELATIONSHIPS.find(r => r.id === 'competitor')!;
  const color = rel.color;
  const companyName = entryContext?.companyName ?? 'Company';
  const desc = entryContext?.companyDescription;
  const stage = entryContext?.companyStage;
  const employees = entryContext?.companyEmployees;
  const handleBack = useBackHandler();
  const backLabel = entryContext?.subdomainName ?? entryContext?.industryName;

  return (
    <div className="w-full flex flex-col gap-4 pb-6 pr-1">
      <CompanyHeader
        companyName={companyName}
        industryName={entryContext?.industryName}
        subdomainName={entryContext?.subdomainName}
        industryColor={color}
        backLabel={backLabel}
        onBack={handleBack}
        badge={<ExternalBadge label="Competitor" color={color} />}
      />

      <Section title="Public Profile" icon={Building2} color={color}>
        {desc && <p className="text-[11px] text-white/45 mb-3 leading-relaxed">{desc}</p>}
        <InfoGrid items={[
          { label: 'Funding Stage', value: stage ?? '—' },
          { label: 'Team Size', value: employees ? (employees > 1000 ? `${(employees / 1000).toFixed(1)}k` : String(employees)) : '—' },
          { label: 'Data Source', value: 'Public', sub: 'No internal access' },
        ]} />
      </Section>

      <Section title="Competitive Positioning" icon={Swords} color={color}>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
          {[
            { axis: 'Market overlap', hint: 'How directly do you compete for the same customers?' },
            { axis: 'Product differentiation', hint: 'Where do your offerings diverge?' },
            { axis: 'Pricing strategy', hint: 'Estimated from public pricing pages and news' },
            { axis: 'GTM motion', hint: 'PLG vs. sales-led vs. channel' },
          ].map(({ axis, hint }) => (
            <div key={axis}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-white/65">{axis}</span>
                <span className="text-[9px] text-white/25">not assessed</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                <div className="h-full rounded-full bg-white/15" style={{ width: '0%' }} />
              </div>
              <div className="text-[9px] text-white/25 mt-0.5">{hint}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Intelligence Actions" icon={BarChart2} color={color}>
        <ActionRow actions={[
          { label: 'Track signals', icon: Zap, color },
          { label: 'Compare features', icon: Layers, color },
          { label: 'Add to watchlist', icon: Star, color },
        ]} />
      </Section>

      <PrivacyFooter />
    </div>
  );
}

// ── Investor view ─────────────────────────────────────────────────────────────
function InvestorView() {
  const { entryContext } = useFounderWorkspace();
  const rel = RELATIONSHIPS.find(r => r.id === 'investor')!;
  const color = rel.color;
  const companyName = entryContext?.companyName ?? 'Company';
  const desc = entryContext?.companyDescription;
  const handleBack = useBackHandler();
  const backLabel = entryContext?.subdomainName ?? entryContext?.industryName;

  const OUTREACH_STAGES = ['Research', 'Warm Intro', 'First Meeting', 'Partner Call', 'Term Sheet'];

  return (
    <div className="w-full flex flex-col gap-4 pb-6 pr-1">
      <CompanyHeader
        companyName={companyName}
        industryName={entryContext?.industryName}
        subdomainName={entryContext?.subdomainName}
        industryColor={color}
        backLabel={backLabel}
        onBack={handleBack}
        badge={<ExternalBadge label="Investor / VC" color={color} />}
      />

      <Section title="Fund Overview" icon={Landmark} color={color}>
        {desc && <p className="text-[11px] text-white/45 mb-3 leading-relaxed">{desc}</p>}
        <InfoGrid items={[
          { label: 'Stage Focus', value: '—', sub: 'Check website' },
          { label: 'Check Size', value: '—', sub: 'Public intel' },
          { label: 'Sector Fit', value: '—', sub: 'Not assessed' },
        ]} />
      </Section>

      <Section title="Fundraising Pipeline" icon={Target} color={color}>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <div className="text-[10px] text-white/40 mb-3">Outreach stage with this investor</div>
          <div className="flex flex-wrap gap-2">
            {OUTREACH_STAGES.map((s, i) => (
              <div
                key={s}
                className="px-2.5 py-1 rounded-full text-[9px] font-semibold transition-all"
                style={i === 0
                  ? { background: `${color}22`, color, border: `1px solid ${color}40` }
                  : { background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {s}
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Thesis Fit Analysis" icon={Star} color={color}>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-2.5">
          {[
            { label: 'Stage alignment', note: 'Your round vs. their typical check stage' },
            { label: 'Sector interest', note: 'Does your category match their thesis?' },
            { label: 'Portfolio conflict', note: 'Any existing portfolio companies that overlap?' },
            { label: 'Warm intro path', note: 'Can you find a shared connection?' },
          ].map(({ label, note }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-4 h-4 rounded border border-white/15 shrink-0" />
              <div>
                <div className="text-[11px] font-semibold text-white/70">{label}</div>
                <div className="text-[9px] text-white/30">{note}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Actions" icon={Zap} color={color}>
        <ActionRow actions={[
          { label: 'Prep pitch angle', icon: TrendingUp, color },
          { label: 'Find warm intro', icon: Users, color },
          { label: 'Draft outreach', icon: MessageSquare, color },
        ]} />
      </Section>

      <PrivacyFooter />
    </div>
  );
}

// ── Partner view ──────────────────────────────────────────────────────────────
function PartnerView() {
  const { entryContext } = useFounderWorkspace();
  const rel = RELATIONSHIPS.find(r => r.id === 'partner')!;
  const color = rel.color;
  const companyName = entryContext?.companyName ?? 'Company';
  const desc = entryContext?.companyDescription;
  const handleBack = useBackHandler();
  const backLabel = entryContext?.subdomainName ?? entryContext?.industryName;

  return (
    <div className="w-full flex flex-col gap-4 pb-6 pr-1">
      <CompanyHeader
        companyName={companyName}
        industryName={entryContext?.industryName}
        subdomainName={entryContext?.subdomainName}
        industryColor={color}
        backLabel={backLabel}
        onBack={handleBack}
        badge={<ExternalBadge label="Partner" color={color} />}
      />

      <Section title="Company Overview" icon={Building2} color={color}>
        {desc && <p className="text-[11px] text-white/45 mb-3 leading-relaxed">{desc}</p>}
        <InfoGrid items={[
          { label: 'Partnership Type', value: '—', sub: 'Not classified' },
          { label: 'Team Size', value: entryContext?.companyEmployees
            ? (entryContext.companyEmployees > 1000 ? `${(entryContext.companyEmployees / 1000).toFixed(1)}k` : String(entryContext.companyEmployees))
            : '—' },
          { label: 'Status', value: '—', sub: 'Define relationship' },
        ]} />
      </Section>

      <Section title="Partnership Type" icon={Handshake} color={color}>
        <div className="grid grid-cols-2 gap-2">
          {['Integration partner', 'Reseller / channel', 'Co-sell agreement', 'Supplier / vendor', 'Technology partner', 'Strategic alliance'].map(type => (
            <button
              key={type}
              type="button"
              className="px-3 py-2.5 rounded-xl border border-white/8 bg-white/[0.02] text-[10px] font-semibold text-white/45 hover:border-white/18 hover:text-white/70 hover:bg-white/[0.04] transition-all text-left"
            >
              {type}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Collaboration Opportunities" icon={Zap} color={color}>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-2.5">
          {[
            { label: 'Joint GTM motion', note: 'Co-marketing, bundling, or referral' },
            { label: 'Technical integration', note: 'API or data-sharing opportunity' },
            { label: 'Shared customer base', note: 'Potential to cross-sell to each other\'s users' },
          ].map(({ label, note }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-4 h-4 rounded border border-white/15 shrink-0" />
              <div>
                <div className="text-[11px] font-semibold text-white/70">{label}</div>
                <div className="text-[9px] text-white/30">{note}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Actions" icon={Zap} color={color}>
        <ActionRow actions={[
          { label: 'Draft proposal', icon: MessageSquare, color },
          { label: 'Log contact', icon: Phone, color },
          { label: 'Map integration', icon: Layers, color },
        ]} />
      </Section>

      <PrivacyFooter />
    </div>
  );
}

// ── Privacy footer (shown on all external views) ──────────────────────────────
function PrivacyFooter() {
  return (
    <div className="shrink-0 flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-[10px] text-white/30 border border-white/6 bg-white/[0.01]">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-white/20" />
      <span>
        This workspace shows only <strong className="text-white/45">publicly available</strong> information. Internal metrics, financials, tasks, and decisions from this company are never accessible through your workspace.
      </span>
    </div>
  );
}

// Map planet hover-menu tags → relationship ids
const PLANET_TAG_TO_REL: Record<string, Relationship> = {
  competitor: 'competitor',
  potential_client: 'opportunity',
  partner: 'partner',
};

// ── Root export ───────────────────────────────────────────────────────────────
export function WorkspaceCompanyCanvas() {
  const { entryContext, setEntryContext } = useFounderWorkspace();
  const { items } = useSavedWorkflows();

  const companyId = entryContext?.companyId;
  const companyName = entryContext?.companyName ?? 'Company';

  // If the user already tagged this company from the universe hover menu,
  // resolve the relationship from that tag — skip the picker entirely.
  const savedTag = companyId
    ? items.find(i => i.companyId === companyId && i.planetTag)?.planetTag
    : undefined;

  const relationship: Relationship | undefined =
    entryContext?.companyRelationship ??
    (savedTag ? PLANET_TAG_TO_REL[savedTag] : undefined);

  const handlePickRelationship = (rel: Relationship) => {
    setEntryContext({ ...entryContext!, companyRelationship: rel });
  };

  // No relationship set and no saved tag → show picker
  if (!relationship) {
    return (
      <RelationshipPicker
        companyName={companyName}
        onPick={handlePickRelationship}
      />
    );
  }

  if (relationship === 'own') return <OwnCompanyView />;
  if (relationship === 'opportunity') return <OpportunityView />;
  if (relationship === 'competitor') return <CompetitorView />;
  if (relationship === 'investor') return <InvestorView />;
  if (relationship === 'partner') return <PartnerView />;

  return null;
}
