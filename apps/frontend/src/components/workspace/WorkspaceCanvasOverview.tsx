import { useMemo, useState } from 'react';
import {
  Target, Zap, Clock, Scale, TrendingUp, TrendingDown, Minus,
  Plus, ArrowRight, AlertTriangle, Check, X, Lock, BarChart2, Bell,
} from 'lucide-react';
import {
  useProjectsStore,
  generateTaskSuggestions,
  computeAlignmentScore,
  type TaskSuggestion,
} from '../../lib/useProjectsStore';
import {
  useBdtMetrics,
  useBdtGoals,
  bdtMetricDisplay,
  bdtMetricTargetDisplay,
  bdtMetricProgress,
  bdtMetricAlerts,
} from '../../lib/db/metrics';
import { useAuth } from '../../lib/auth';
import { Bot } from 'lucide-react';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';

const ACCENT = '#C1AEFF';

const SuggestionMeta = {
  goal_gap:   { Icon: Target,       color: ACCENT,     label: 'Goal Gap'    },
  blocker:    { Icon: Lock,         color: '#fb7185',  label: 'Blocker'     },
  at_risk:    { Icon: AlertTriangle,color: '#fbbf24',  label: 'At Risk'     },
  overdue:    { Icon: Clock,        color: '#fb7185',  label: 'Overdue'     },
  decision:   { Icon: Scale,        color: '#fbbf24',  label: 'Decision'    },
  metric_gap: { Icon: BarChart2,    color: '#34d399',  label: 'Metric Gap'  },
} as const;

function priorityColor(p: TaskSuggestion['priority']) {
  return p === 'high' ? '#fb7185' : p === 'medium' ? '#fbbf24' : '#34d399';
}

export function WorkspaceCanvasOverview() {
  const { projects, tasks, decisions, risks, addTask, currentMemberId } = useProjectsStore();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { goals } = useBdtGoals(companyId);
  const { metrics } = useBdtMetrics(companyId);
  const { setActiveSidebarTab } = useFounderWorkspace();

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [created, setCreated]   = useState<Set<string>>(new Set());

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const metricAlerts = useMemo(() => bdtMetricAlerts(metrics), [metrics]);

  const suggestions = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = generateTaskSuggestions(projects, tasks, decisions, risks, goals as any, metrics as any);
    return all.filter(s => !dismissed.has(s.key));
  }, [projects, tasks, decisions, risks, goals, metrics, dismissed]);

  const stats = useMemo(() => ({
    openTasks:      tasks.filter(t => t.status !== 'done').length,
    overdue:        tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'done').length,
    openDecisions:  decisions.filter(d => d.status === 'open').length,
    atRisk:         projects.filter(p => p.status === 'at_risk' || p.status === 'delayed').length,
  }), [tasks, decisions, projects, today]);

  const handleCreate = (s: TaskSuggestion) => {
    if (s.projectId) {
      addTask(s.projectId, s.taskTitle, currentMemberId, 'todo');
      setCreated(prev => new Set(prev).add(s.key));
    } else {
      // No project yet — navigate to Goals & Metrics inside Projects
      setActiveSidebarTab('projects');
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-goals-metrics'));
      }, 60);
    }
  };

  const handleNavigate = (s: TaskSuggestion) => {
    setActiveSidebarTab('projects');
    if (s.projectId) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-project', { detail: { projectId: s.projectId } }));
      }, 60);
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto scrollbar-hide flex flex-col gap-5 pr-1 pb-6">

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
        {[
          { label: 'Open Tasks',      value: stats.openTasks,     color: '#fff' },
          { label: 'Overdue',         value: stats.overdue,       color: stats.overdue     > 0 ? '#fb7185' : '#34d399' },
          { label: 'Open Decisions',  value: stats.openDecisions, color: stats.openDecisions > 0 ? '#fbbf24' : '#34d399' },
          { label: 'At Risk',         value: stats.atRisk,        color: stats.atRisk      > 0 ? '#fbbf24' : '#34d399' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 bg-white/[0.03] border border-white/8 shrink-0">
            <div className="text-[9px] uppercase tracking-wider text-white/35 mb-1">{s.label}</div>
            <div className="text-xl font-bold tabular-nums leading-none" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Metric Alerts ──────────────────────────────────────────────── */}
      {metricAlerts.length > 0 && (
        <div className="shrink-0 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
            <Bell className="w-3 h-3" /> Metric Alerts
          </div>
          {metricAlerts.map(a => (
            <div key={a.metricId} className="flex items-center gap-2 text-[11px] text-white/60">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span><span className="font-semibold text-amber-300">{a.name}</span> is at {a.progress}% — below {a.threshold}% alert threshold</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Metric Impact ─────────────────────────────────────────────── */}
      <div className="shrink-0">
        <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/40 mb-2.5 flex items-center gap-1.5 px-0.5">
          <TrendingUp className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          Metric Impact
        </div>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))' }}>
          {metrics.map(m => {
            const pct   = bdtMetricProgress(m);
            const good  = m.trend === 'flat' ? null : (m.trend === 'up') === m.higher_is_better;
            const tc    = good === null ? '#94a3b8' : good ? '#34d399' : '#fb7185';
            const TIcon = m.trend === 'up' ? TrendingUp : m.trend === 'down' ? TrendingDown : Minus;
            return (
              <div key={m.id} className="rounded-xl p-3 bg-white/[0.03] border border-white/8 hover:border-white/15 transition-all">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] uppercase tracking-wider text-white/35">
                    {m.scope === 'company' ? 'Company' : 'Dept'}
                  </span>
                  <TIcon className="w-3 h-3" style={{ color: tc }} />
                </div>
                <div className="text-[12px] font-bold text-white leading-tight">{m.name}</div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-[15px] font-bold leading-none" style={{ color: tc }}>{bdtMetricDisplay(m)}</span>
                  <span className="text-[9px] text-white/30">/ {bdtMetricTargetDisplay(m)}</span>
                </div>
                <div className="h-1 rounded-full bg-white/10 mt-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: tc }} />
                </div>
                <div className="text-[9px] text-white/25 mt-1 tabular-nums">{pct}% to target</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Suggestive Tasks ──────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <div className="flex items-center justify-between mb-3 px-0.5">
          <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/40 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} />
            AI Suggested Actions
          </div>
          <span className="text-[10px] text-white/30">
            {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {suggestions.length === 0 && (
          <div className="py-10 text-center">
            <div className="text-2xl mb-2">🎉</div>
            <div className="text-sm font-semibold text-white/60">All caught up</div>
            <div className="text-xs text-white/30 mt-1">No suggested actions right now.</div>
          </div>
        )}

        <div className="space-y-2">
          {suggestions.map(s => {
            const { Icon, color, label } = SuggestionMeta[s.type];
            const pc       = priorityColor(s.priority);
            const isCreated = created.has(s.key);
            const alignTask = s.projectId ? tasks.find(t => t.projectId === s.projectId && t.status !== 'done') : null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const alignScore = alignTask ? computeAlignmentScore(alignTask, projects, risks, goals as any) : null;
            return (
              <div
                key={s.key}
                className="group flex items-start gap-3 p-3.5 rounded-xl border transition-all"
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
              >
                {/* type icon */}
                <span
                  className="w-8 h-8 rounded-lg grid place-items-center shrink-0 mt-0.5"
                  style={{ background: `${color}16`, border: `1px solid ${color}30` }}
                >
                  <Icon className="w-4 h-4" style={{ color }} />
                </span>

                {/* content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs font-semibold text-white leading-snug">{s.taskTitle}</span>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0"
                      style={{ background: `${pc}16`, color: pc, border: `1px solid ${pc}30` }}
                    >
                      {s.priority}
                    </span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: `${color}12`, color, border: `1px solid ${color}25` }}
                    >
                      {label}
                    </span>
                    {alignScore !== null && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 tabular-nums"
                        title="Alignment score: Goal Relevance × Urgency × Confidence"
                        style={{
                          background: alignScore >= 60 ? '#34d39916' : alignScore >= 30 ? '#fbbf2416' : '#94a3b816',
                          color: alignScore >= 60 ? '#34d399' : alignScore >= 30 ? '#fbbf24' : '#94a3b8',
                          border: `1px solid ${alignScore >= 60 ? '#34d39930' : alignScore >= 30 ? '#fbbf2430' : '#94a3b830'}`,
                        }}
                      >
                        ⬆ {alignScore}
                      </span>
                    )}
                    {s.estimatedMetricLift != null && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" title="Estimated metric lift" style={{ background: '#34d39916', color: '#34d399', border: '1px solid #34d39930' }}>
                        +{s.estimatedMetricLift} lift
                      </span>
                    )}
                    {s.dependencyUnlockCount != null && s.dependencyUnlockCount >= 2 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" title="Tasks unblocked" style={{ background: '#a78bfa16', color: '#a78bfa', border: '1px solid #a78bfa30' }}>
                        🔓 {s.dependencyUnlockCount}
                      </span>
                    )}
                    {s.agentSuitable && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5" title="Agent can help with this" style={{ background: '#60a5fa16', color: '#60a5fa', border: '1px solid #60a5fa30' }}>
                        <Bot className="w-2.5 h-2.5" /> AI
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/45 leading-relaxed">{s.why}</p>
                  {s.projectName && (
                    <span className="text-[10px] text-white/25 mt-0.5 inline-block">{s.projectName}</span>
                  )}
                </div>

                {/* actions */}
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  {isCreated ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold px-2">
                      <Check className="w-3 h-3" /> Created
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCreate(s)}
                      title={s.projectId ? 'Add as project task' : 'Go to Goals & Metrics'}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:scale-[1.03] active:scale-[0.97]"
                      style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}40`, color: ACCENT }}
                    >
                      <Plus className="w-3 h-3" />
                      {s.projectId ? 'Create' : 'Go'}
                    </button>
                  )}
                  {s.projectId && (
                    <button
                      type="button"
                      onClick={() => handleNavigate(s)}
                      title="Open project"
                      className="p-1.5 rounded-lg text-white/30 hover:text-white/75 hover:bg-white/[0.06] transition-all"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDismissed(prev => new Set(prev).add(s.key))}
                    title="Dismiss"
                    className="p-1.5 rounded-lg text-white/20 hover:text-white/55 hover:bg-white/[0.04] transition-all opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
