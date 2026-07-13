import { useMemo } from 'react';
import {
  Map, DollarSign, Mic2, Swords,
  CheckCircle2, Clock, AlertCircle, Circle,
  TrendingUp, TrendingDown, Minus,
  ChevronRight, ArrowRight,
} from 'lucide-react';
import { useProjectsStore } from '../../lib/useProjectsStore';
import { useBdtGoals, useBdtMetrics, bdtMetricDisplay, bdtMetricProgress } from '../../lib/db/metrics';
import { useAuth } from '../../lib/auth';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';

const ACCENT = '#C1AEFF';

/* ── Roadmap ────────────────────────────────────────────────────────────────── */

function RoadmapView() {
  const { projects, tasks } = useProjectsStore();
  const { profile } = useAuth();
  const { goals } = useBdtGoals(profile?.company_id ?? null);
  const { setActiveSidebarTab } = useFounderWorkspace();

  const timeline = useMemo(() => {
    const rows: Array<{
      id: string;
      label: string;
      type: 'goal' | 'project' | 'milestone';
      status: string;
      dueDate?: string;
      progress?: number;
      parentLabel?: string;
    }> = [];

    goals.forEach(g => {
      rows.push({
        id: g.id,
        label: g.title,
        type: 'goal',
        status: 'on_track',
      });
    });

    projects.forEach(p => {
      const ptasks = tasks.filter(t => t.projectId === p.id);
      const done = ptasks.filter(t => t.status === 'done').length;
      const pct = ptasks.length ? Math.round((done / ptasks.length) * 100) : 0;
      rows.push({
        id: p.id,
        label: p.name,
        type: 'project',
        status: p.status,
        progress: pct,
      });
    });

    return rows.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [goals, projects, tasks]);

  const statusColor = (s: string) => {
    if (s === 'done' || s === 'completed') return '#34d399';
    if (s === 'at_risk' || s === 'delayed') return '#fb7185';
    if (s === 'in_progress' || s === 'active') return ACCENT;
    return '#94a3b8';
  };
  const StatusIcon = ({ s }: { s: string }) => {
    if (s === 'done' || s === 'completed') return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#34d399' }} />;
    if (s === 'at_risk' || s === 'delayed') return <AlertCircle className="w-3.5 h-3.5" style={{ color: '#fb7185' }} />;
    if (s === 'in_progress' || s === 'active') return <Clock className="w-3.5 h-3.5" style={{ color: ACCENT }} />;
    return <Circle className="w-3.5 h-3.5 text-white/30" />;
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="shrink-0 flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Map className="w-4 h-4" style={{ color: '#60a5fa' }} />
          <h3 className="text-sm font-semibold text-white">AI Roadmap</h3>
          <span className="text-[10px] text-white/40">goals + project milestones</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveSidebarTab('goals');
          }}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition-all"
        >
          Manage Goals <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-1.5 pr-1 pb-2">
        {timeline.length === 0 && (
          <div className="py-14 text-center">
            <Map className="w-8 h-8 mx-auto mb-3 text-white/15" />
            <div className="text-sm font-semibold text-white/40">No roadmap items yet</div>
            <div className="text-xs text-white/25 mt-1">Create goals and projects to build your roadmap.</div>
          </div>
        )}
        {timeline.map(row => (
          <div
            key={row.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/14 transition-all group"
          >
            <StatusIcon s={row.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-xs font-semibold text-white truncate">{row.label}</span>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0"
                  style={{ background: `${statusColor(row.status)}16`, color: statusColor(row.status), border: `1px solid ${statusColor(row.status)}25` }}
                >
                  {row.type}
                </span>
              </div>
              {row.dueDate && (
                <span className="text-[10px] text-white/30">{row.dueDate}</span>
              )}
            </div>
            {typeof row.progress === 'number' && (
              <div className="shrink-0 flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${row.progress}%`, background: ACCENT }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-white/35">{row.progress}%</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Fundraising ────────────────────────────────────────────────────────────── */

const FUNDRAISING_MILESTONES = [
  { id: 'f1', label: 'Define valuation & equity story', done: false },
  { id: 'f2', label: 'Build data room (financials, cap table, product deck)', done: false },
  { id: 'f3', label: 'Map target investors (20-30 leads)', done: false },
  { id: 'f4', label: 'Warm intro strategy — map to network', done: false },
  { id: 'f5', label: 'First meetings (Seed / Series A)', done: false },
  { id: 'f6', label: 'Due diligence process started', done: false },
  { id: 'f7', label: 'Term sheet received', done: false },
  { id: 'f8', label: 'Legal close + funds wired', done: false },
];

function FundraisingView() {
  const { profile } = useAuth();
  const { metrics } = useBdtMetrics(profile?.company_id ?? null);

  const runway = useMemo(() => metrics.find(m => m.name.toLowerCase().includes('runway')), [metrics]);
  const mrr    = useMemo(() => metrics.find(m => m.name.toLowerCase().includes('mrr') || m.name.toLowerCase().includes('revenue')), [metrics]);

  const TrendIcon = ({ trend }: { trend?: string }) => {
    if (trend === 'up') return <TrendingUp className="w-3 h-3 text-emerald-400" />;
    if (trend === 'down') return <TrendingDown className="w-3 h-3 text-rose-400" />;
    return <Minus className="w-3 h-3 text-white/30" />;
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-2 mb-4">
        <DollarSign className="w-4 h-4" style={{ color: '#34d399' }} />
        <h3 className="text-sm font-semibold text-white">Fundraising Tracker</h3>
        <span className="text-[10px] text-white/40">seed → series A</span>
      </div>

      {/* key metrics */}
      <div className="shrink-0 grid grid-cols-2 gap-2.5 mb-4">
        {[runway, mrr].filter(Boolean).map(m => {
          if (!m) return null;
          const pct = bdtMetricProgress(m);
          return (
            <div key={m.id} className="rounded-xl p-3 bg-white/[0.03] border border-white/8">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-wider text-white/35">{m.name}</span>
                <TrendIcon trend={m.trend} />
              </div>
              <div className="text-lg font-bold text-white leading-none">{bdtMetricDisplay(m)}</div>
              <div className="h-1 rounded-full bg-white/10 mt-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#34d399' }} />
              </div>
            </div>
          );
        })}
        {[runway, mrr].filter(Boolean).length === 0 && (
          <div className="col-span-2 text-xs text-white/30 py-2 text-center">
            Add Runway and MRR metrics in Goals & Metrics to see them here.
          </div>
        )}
      </div>

      {/* checklist */}
      <div className="shrink-0 mb-2">
        <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5">Fundraising Checklist</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-1.5 pr-1 pb-2">
        {FUNDRAISING_MILESTONES.map((m, i) => (
          <div
            key={m.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/[0.02]"
          >
            <div
              className="w-5 h-5 rounded-full border-2 grid place-items-center shrink-0"
              style={{ borderColor: m.done ? '#34d399' : 'rgba(255,255,255,0.15)', background: m.done ? '#34d39920' : 'transparent' }}
            >
              {m.done && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs text-white/75">{m.label}</span>
            </div>
            <span className="text-[10px] text-white/25 shrink-0">Step {i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Interviews ──────────────────────────────────────────────────────────────── */

const INTERVIEW_TEMPLATES = [
  { id: 'it1', title: 'Discovery Call', desc: 'Understand the problem, current solution, and willingness to pay.' },
  { id: 'it2', title: 'Activation Interview', desc: 'Why did they sign up? What were they hoping to solve?' },
  { id: 'it3', title: 'Churn Interview', desc: 'What drove them away? What would have kept them?' },
  { id: 'it4', title: 'Power User Interview', desc: 'What keeps them coming back? What would they miss most?' },
  { id: 'it5', title: 'Investor Discovery', desc: 'Market size, founder fit, differentiation, defensibility.' },
  { id: 'it6', title: 'Hiring Interview (Engineer)', desc: 'Technical depth, values alignment, startup comfort.' },
];

function InterviewsView() {
  const { setActiveSidebarTab } = useFounderWorkspace();

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="shrink-0 flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Mic2 className="w-4 h-4" style={{ color: '#fbbf24' }} />
          <h3 className="text-sm font-semibold text-white">Interview Hub</h3>
          <span className="text-[10px] text-white/40">customer · investor · hiring</span>
        </div>
        <button
          type="button"
          onClick={() => setActiveSidebarTab('notes')}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition-all"
        >
          Open Notes <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="shrink-0 mb-2">
        <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5">Interview Templates</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-2 pr-1 pb-2">
        {INTERVIEW_TEMPLATES.map(t => (
          <div
            key={t.id}
            className="flex items-start gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/14 transition-all cursor-default"
          >
            <div
              className="w-8 h-8 rounded-lg grid place-items-center shrink-0 mt-0.5"
              style={{ background: '#fbbf2416', border: '1px solid #fbbf2430' }}
            >
              <Mic2 className="w-4 h-4 text-amber-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white mb-0.5">{t.title}</div>
              <div className="text-[11px] text-white/45 leading-relaxed">{t.desc}</div>
            </div>
            <button
              type="button"
              onClick={() => setActiveSidebarTab('notes')}
              className="shrink-0 text-[10px] text-white/30 hover:text-white/70 transition-colors mt-1"
            >
              + Note
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Competitors ─────────────────────────────────────────────────────────────── */

const SEED_COMPETITORS = [
  {
    id: 'c1', name: 'Notion', category: 'Document/Wiki',
    pros: 'Massive user base, flexible blocks, AI integration',
    cons: 'No 3D/BDT, no goal alignment, not founder-specific',
    threat: 'high' as const,
    url: 'notion.so',
  },
  {
    id: 'c2', name: 'Linear', category: 'Project Management',
    pros: 'Blazing fast, developer-loved, clean design',
    cons: 'No universe context, no metric alignment, no AI copilot',
    threat: 'medium' as const,
    url: 'linear.app',
  },
  {
    id: 'c3', name: 'Monday.com', category: 'Work Management',
    pros: 'Enterprise-friendly, rich views, automation',
    cons: 'Not built for founders, generic, no intelligence layer',
    threat: 'low' as const,
    url: 'monday.com',
  },
  {
    id: 'c4', name: 'Craft', category: 'Notes/Docs',
    pros: 'Beautiful design, native apps',
    cons: 'No PM, no metrics, no AI reasoning',
    threat: 'low' as const,
    url: 'craft.do',
  },
  {
    id: 'c5', name: 'Height (shutdown)', category: 'AI PM',
    pros: 'AI-native approach, clean issue management',
    cons: 'Shut down — opportunity to capture users',
    threat: 'low' as const,
    url: '-',
  },
];

const THREAT_COLOR = { high: '#fb7185', medium: '#fbbf24', low: '#34d399' };

function CompetitorsView() {
  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-2 mb-4">
        <Swords className="w-4 h-4" style={{ color: '#fb7185' }} />
        <h3 className="text-sm font-semibold text-white">Competitor Intelligence</h3>
        <span className="text-[10px] text-white/40">threat · differentiation · positioning</span>
      </div>

      <div className="shrink-0 flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[10px] text-white/40 flex items-center gap-1.5">
          Threat level:
          {(['high', 'medium', 'low'] as const).map(t => (
            <span
              key={t}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
              style={{ background: `${THREAT_COLOR[t]}16`, color: THREAT_COLOR[t], border: `1px solid ${THREAT_COLOR[t]}30` }}
            >
              {t}
            </span>
          ))}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-2.5 pr-1 pb-2">
        {SEED_COMPETITORS.map(c => {
          const tc = THREAT_COLOR[c.threat];
          return (
            <div
              key={c.id}
              className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden hover:border-white/14 transition-all"
            >
              <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                <div
                  className="w-8 h-8 rounded-lg grid place-items-center shrink-0 font-bold text-xs"
                  style={{ background: `${tc}16`, color: tc, border: `1px solid ${tc}30` }}
                >
                  {c.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white">{c.name}</span>
                    <span className="text-[9px] text-white/35">{c.category}</span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0"
                      style={{ background: `${tc}16`, color: tc, border: `1px solid ${tc}30` }}
                    >
                      {c.threat} threat
                    </span>
                  </div>
                  {c.url !== '-' && (
                    <span className="text-[9px] text-white/25">{c.url}</span>
                  )}
                </div>
              </div>
              <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <div className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider mb-1">Strengths</div>
                  <p className="text-[11px] text-white/50 leading-relaxed">{c.pros}</p>
                </div>
                <div>
                  <div className="text-[9px] text-rose-400 font-semibold uppercase tracking-wider mb-1">Our Edge</div>
                  <p className="text-[11px] text-white/50 leading-relaxed">{c.cons}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Router ──────────────────────────────────────────────────────────────────── */

interface WorkspaceShortcutPanelProps {
  tabId: string;
}

export function WorkspaceShortcutPanel({ tabId }: WorkspaceShortcutPanelProps) {
  switch (tabId) {
    case 'roadmap':      return <RoadmapView />;
    case 'fundraising':  return <FundraisingView />;
    case 'interviews':   return <InterviewsView />;
    case 'competitors':  return <CompetitorsView />;
    default:             return null;
  }
}
