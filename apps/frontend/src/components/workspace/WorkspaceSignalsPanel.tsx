import { useState, useMemo } from 'react';
import {
  Zap, TrendingUp, Users, Shield, Cpu, Globe,
  Bookmark, Search, ChevronRight, ExternalLink,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSavedWorkflows } from '../../lib/useSavedWorkflows';

const ACCENT = '#C1AEFF';

/* ── seed data ──────────────────────────────────────────────────────────────── */

type SignalCategory = 'market' | 'competitor' | 'technology' | 'regulatory' | 'customer';

interface Signal {
  id: string;
  category: SignalCategory;
  title: string;
  source: string;
  summary: string;
  relevance: 'high' | 'medium' | 'low';
  ageLabel: string;
  tags: string[];
}

const SIGNALS: Signal[] = [
  // Market
  {
    id: 's_mrr_growth',
    category: 'market',
    title: 'B2B SaaS growth accelerating — SMB segment up 23% YoY',
    source: 'SaaS Capital Report',
    summary: 'SMB-focused SaaS tools are outperforming enterprise segment. Founders who nail self-serve + trials are seeing faster revenue ramp.',
    relevance: 'high',
    ageLabel: '2d ago',
    tags: ['SaaS', 'SMB', 'Growth'],
  },
  {
    id: 's_ai_budgets',
    category: 'market',
    title: 'AI tooling budgets expanding — 78% of Series A-C companies allocating >$50k/yr',
    source: 'Sequoia Benchmarks',
    summary: 'AI-native product companies are winning procurement faster. Positioning around AI capabilities opens budget lines that didn\'t exist 18 months ago.',
    relevance: 'high',
    ageLabel: '4d ago',
    tags: ['AI', 'Budgets', 'Series A'],
  },
  {
    id: 's_enterprise',
    category: 'market',
    title: 'Enterprise digital transformation budgets up 18% in H1 2026',
    source: 'Gartner Forecast',
    summary: 'Enterprises are increasing investment in internal tooling and workflow automation. Buyers are consolidating onto platforms rather than point solutions.',
    relevance: 'medium',
    ageLabel: '1w ago',
    tags: ['Enterprise', 'Digital Transformation'],
  },
  {
    id: 's_plg',
    category: 'market',
    title: 'Product-led growth median CAC payback drops to 11 months',
    source: 'OpenView Partners',
    summary: 'PLG companies recovering CAC faster than sales-led peers. Free tier → paid conversion strategies becoming the dominant go-to-market.',
    relevance: 'medium',
    ageLabel: '5d ago',
    tags: ['PLG', 'CAC', 'Conversion'],
  },
  // Competitor
  {
    id: 's_comp_notion',
    category: 'competitor',
    title: 'Notion AI launched Workspace Agents — autonomous task creation from docs',
    source: 'ProductHunt / TechCrunch',
    summary: 'Notion\'s agents can read a document and auto-create tasks, assign owners, and set due dates. Direct overlap with our card → task conversion feature. Our advantage: 3D universe context + BDT alignment.',
    relevance: 'high',
    ageLabel: '3d ago',
    tags: ['Notion', 'AI Agents', 'Competitive'],
  },
  {
    id: 's_comp_linear',
    category: 'competitor',
    title: 'Linear raised Series C at $1B valuation with 40,000 teams',
    source: 'Bloomberg',
    summary: 'Linear\'s clean, fast PM UX is the new baseline expectation. Their differentiation: speed + developer trust. Our differentiation: goal alignment + digital twin context.',
    relevance: 'medium',
    ageLabel: '1w ago',
    tags: ['Linear', 'Series C', 'PM Tools'],
  },
  {
    id: 's_comp_height',
    category: 'competitor',
    title: 'Height shut down — users flocking to alternatives',
    source: 'Height Blog / Twitter',
    summary: 'Height\'s shutdown creates a moment to capture their users. They valued "AI native" project management. Positioning timing is right.',
    relevance: 'high',
    ageLabel: '6d ago',
    tags: ['Opportunity', 'Height', 'Migration'],
  },
  // Technology
  {
    id: 's_wasm',
    category: 'technology',
    title: 'WebGL 2 + Three.js R170 brings 40% rendering performance gains',
    source: 'Three.js GitHub',
    summary: 'New instanced rendering APIs could make the 3D universe canvas significantly faster. Worth evaluating for the universe tile rendering.',
    relevance: 'medium',
    ageLabel: '2w ago',
    tags: ['Three.js', 'Performance', '3D'],
  },
  {
    id: 's_react19',
    category: 'technology',
    title: 'React 19 Compiler achieves 2–4× re-render reduction in benchmarks',
    source: 'React Blog',
    summary: 'The React Compiler eliminates need for manual memo/useMemo in most cases. Significant latency improvement for complex workspace panels.',
    relevance: 'medium',
    ageLabel: '3w ago',
    tags: ['React', 'Performance', 'DX'],
  },
  {
    id: 's_supabase_realtime',
    category: 'technology',
    title: 'Supabase Realtime v3 adds broadcast channels with 10ms latency',
    source: 'Supabase Blog',
    summary: 'Enables real-time collaborative workspace editing — multiple founders/team members seeing task updates live without polling.',
    relevance: 'high',
    ageLabel: '1w ago',
    tags: ['Supabase', 'Realtime', 'Collaboration'],
  },
  // Regulatory
  {
    id: 's_eu_ai',
    category: 'regulatory',
    title: 'EU AI Act enforcement: high-risk AI systems must comply by Aug 2026',
    source: 'European Commission',
    summary: 'AI systems used for HR decisions, credit scoring, or employment management are "high risk." Our workspace AI is advisory — low risk tier — but document this explicitly.',
    relevance: 'medium',
    ageLabel: '1w ago',
    tags: ['EU AI Act', 'Compliance', 'Risk'],
  },
  {
    id: 's_soc2',
    category: 'regulatory',
    title: 'SOC 2 Type II now baseline requirement for enterprise procurement',
    source: 'Vanta Benchmark Report',
    summary: '94% of enterprise procurement now requires SOC 2 Type II before signing. Plan compliance sprint before enterprise sales motion begins.',
    relevance: 'high',
    ageLabel: '2w ago',
    tags: ['SOC 2', 'Enterprise', 'Security'],
  },
  // Customer
  {
    id: 's_nps_api',
    category: 'customer',
    title: 'Power user NPS interviews: #1 request is API + webhook access',
    source: 'Internal Customer Research',
    summary: '6/10 power users mentioned wanting to connect external data into the workspace. Integration-first strategy unlocks the long tail of workflow automation.',
    relevance: 'high',
    ageLabel: '3d ago',
    tags: ['NPS', 'API', 'Integrations'],
  },
  {
    id: 's_churn_int',
    category: 'customer',
    title: 'Churn analysis: top exit reason is "missing integrations with existing stack"',
    source: 'Churnkey Exit Survey',
    summary: 'Teams are leaving because WorkOS doesn\'t connect to Slack, Jira, GitHub. Prioritize native integrations in the next product sprint.',
    relevance: 'high',
    ageLabel: '5d ago',
    tags: ['Churn', 'Integrations', 'Retention'],
  },
  {
    id: 's_onboarding',
    category: 'customer',
    title: 'Activation analysis: users who set a goal on day 1 retain 3× better',
    source: 'Internal Analytics',
    summary: 'Onboarding flow should guide new users to create their first goal immediately. Consider a goal-first onboarding wizard as the activation hook.',
    relevance: 'high',
    ageLabel: '1w ago',
    tags: ['Onboarding', 'Activation', 'Retention'],
  },
];

const CATEGORY_META: Record<SignalCategory, { label: string; color: string; Icon: LucideIcon }> = {
  market:      { label: 'Market',      color: '#34d399', Icon: TrendingUp },
  competitor:  { label: 'Competitor',  color: '#fb7185', Icon: Globe },
  technology:  { label: 'Technology',  color: '#60a5fa', Icon: Cpu },
  regulatory:  { label: 'Regulatory',  color: '#fbbf24', Icon: Shield },
  customer:    { label: 'Customer',    color: ACCENT,    Icon: Users },
};

const RELEVANCE_COLOR = { high: '#fb7185', medium: '#fbbf24', low: '#94a3b8' };

/* ── component ──────────────────────────────────────────────────────────────── */

export function WorkspaceSignalsPanel() {
  const { save, items: savedItems } = useSavedWorkflows();
  const [activeCategory, setActiveCategory] = useState<SignalCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = SIGNALS;
    if (activeCategory !== 'all') list = list.filter(s => s.category === activeCategory);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [activeCategory, query]);

  const alreadySaved = (id: string) =>
    saved.has(id) || savedItems.some(i => i.rootId === `signal_${id}`);

  const saveToCanvas = (s: Signal) => {
    const meta = CATEGORY_META[s.category];
    save({
      level: 'root',
      companyId: 'demo',
      companyName: 'WorkOS',
      role: 'founder',
      roleLabel: 'Founder',
      rootId: `signal_${s.id}`,
      rootLabel: s.title,
      rootColor: meta.color,
      rootDescription: s.summary,
      note: `Signal from ${s.source} · ${s.ageLabel}. Tags: ${s.tags.join(', ')}.`,
    });
    setSaved(prev => new Set(prev).add(s.id));
  };

  const stats = useMemo(() => {
    const high = SIGNALS.filter(s => s.relevance === 'high').length;
    const newCount = SIGNALS.filter(s => s.ageLabel.includes('d ago')).length;
    return { high, newCount };
  }, []);

  return (
    <div className="w-full h-full flex flex-col min-h-0">

      {/* header */}
      <div className="shrink-0 flex items-center gap-3 px-1 pb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4" style={{ color: '#fbbf24' }} />
          <h3 className="text-sm font-semibold text-white">Signals Intelligence</h3>
          <span className="text-[10px] text-white/40">market · competitor · tech</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/25">
            {stats.high} high-relevance
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/8 text-white/50 border border-white/10">
            {stats.newCount} new
          </span>
        </div>
      </div>

      {/* search */}
      <div className="shrink-0 relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search signals…"
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25 transition-colors"
        />
      </div>

      {/* category filter */}
      <div className="shrink-0 flex items-center gap-1.5 mb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${activeCategory === 'all' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
        >
          All
        </button>
        {(Object.keys(CATEGORY_META) as SignalCategory[]).map(cat => {
          const { label, color, Icon } = CATEGORY_META[cat];
          const active = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
              style={active
                ? { background: `${color}22`, color, border: `1px solid ${color}44` }
                : { color: 'rgba(255,255,255,0.4)', border: '1px solid transparent' }}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          );
        })}
      </div>

      {/* signals list */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1 space-y-2 pb-2">
        {filtered.length === 0 && (
          <div className="py-10 text-center text-xs text-white/30">No signals match your filter.</div>
        )}

        {filtered.map(s => {
          const { color, Icon } = CATEGORY_META[s.category];
          const rc = RELEVANCE_COLOR[s.relevance];
          const isSaved = alreadySaved(s.id);
          const isOpen = expanded === s.id;
          return (
            <div
              key={s.id}
              className="rounded-xl border transition-all overflow-hidden"
              style={isOpen
                ? { background: 'rgba(255,255,255,0.04)', borderColor: `${color}40` }
                : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              {/* header row */}
              <div
                className="flex items-start gap-3 p-3.5 cursor-pointer"
                onClick={() => setExpanded(isOpen ? null : s.id)}
              >
                <span
                  className="w-8 h-8 rounded-lg grid place-items-center shrink-0 mt-0.5"
                  style={{ background: `${color}16`, border: `1px solid ${color}30` }}
                >
                  <Icon className="w-4 h-4" style={{ color }} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs font-semibold text-white leading-snug">{s.title}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] text-white/35">{s.source}</span>
                    <span className="text-[9px] text-white/25">·</span>
                    <span className="text-[9px] text-white/35">{s.ageLabel}</span>
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{ background: `${rc}16`, color: rc, border: `1px solid ${rc}30` }}
                    >
                      {s.relevance}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 shrink-0 text-white/25 transition-transform mt-1 ${isOpen ? 'rotate-90' : ''}`}
                />
              </div>

              {/* expanded body */}
              {isOpen && (
                <div className="px-3.5 pb-3.5 pt-0 border-t border-white/5">
                  <p className="text-[12px] text-white/65 leading-relaxed my-2.5">{s.summary}</p>
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {s.tags.map(tag => (
                      <span
                        key={tag}
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.06] text-white/45 border border-white/8"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => saveToCanvas(s)}
                      disabled={isSaved}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
                      style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}40`, color: ACCENT }}
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      {isSaved ? 'Saved to Canvas' : 'Save to Canvas'}
                    </button>
                    <a
                      href="#"
                      onClick={e => e.preventDefault()}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-white/40 hover:text-white/70 border border-white/8 hover:border-white/18 transition-all"
                    >
                      <ExternalLink className="w-3 h-3" /> Source
                    </a>
                    {isSaved && (
                      <span className="ml-auto text-[10px] text-emerald-400 flex items-center gap-1">
                        ✓ Node card created
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
