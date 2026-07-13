import { useMemo, useState } from 'react';
import {
  Orbit, Target, Layers, CheckSquare, FileText, FolderOpen,
  TrendingUp, TrendingDown, Minus, Zap,
  AlertTriangle, Scale, Clock, Plus,
} from 'lucide-react';
import { useProjectsStore, generateAlerts } from '../../lib/useProjectsStore';
import { useBdtMetrics, useBdtGoals, bdtMetricDisplay, bdtMetricProgress } from '../../lib/db/metrics';
import { useAuth } from '../../lib/auth';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';
import { useCanonicalMetrics, isMetricAdmin } from '../../lib/db/canonicalMetrics';
import { useTeamMembers } from '../../lib/db/team';
import { MetricCreateWizard, MetricRollupHealthPanel } from './metrics/MetricSystem';

const ACCENT = '#C1AEFF';
const B = 'rgba(255,255,255,0.06)';

/* ── main ────────────────────────────────────────────────────────────────────── */
export function WorkspaceSpherePanel() {
  const {
    projects, tasks, decisions, risks, members, files,
  } = useProjectsStore();
  const { profile, role } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { goals } = useBdtGoals(companyId);
  const { metrics } = useBdtMetrics(companyId);
  const { setActiveSidebarTab, notes, departments } = useFounderWorkspace();
  const { rollups, createMetric, createDraft } = useCanonicalMetrics(companyId, { target_type: 'department', status: 'active' });
  const { members: teamMembers } = useTeamMembers(companyId);
  const canEditMetrics = isMetricAdmin(role);
  const [metricWizardTarget, setMetricWizardTarget] = useState<{ id: string; label: string } | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const stats = useMemo(() => {
    const openTasks   = tasks.filter(t => t.status !== 'done').length;
    const doneTasks   = tasks.filter(t => t.status === 'done').length;
    const overdue     = tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'done').length;
    const activeProjs = projects.filter(p => p.status !== 'done').length;
    const totalGoals  = goals.length;
    const openDecisions = decisions.filter(d => d.status === 'open').length;
    return { openTasks, doneTasks, overdue, activeProjs, totalGoals, openDecisions, notes: (notes || []).length, files: files.length };
  }, [tasks, projects, goals, decisions, notes, files, today]);

  const alerts = useMemo(() => generateAlerts(projects, tasks, decisions, risks, members), [projects, tasks, decisions, risks, members]);
  const topAlerts = alerts.slice(0, 4);

  const alertIconAndColor = (type: string) => {
    if (type === 'overdue' || type === 'blocker') return { Icon: Clock, color: '#fb7185' };
    if (type === 'at_risk' || type === 'risk') return { Icon: AlertTriangle, color: '#fbbf24' };
    if (type === 'decision') return { Icon: Scale, color: '#fbbf24' };
    return { Icon: Zap, color: ACCENT };
  };

  const topMetrics = useMemo(() => metrics.slice(0, 4), [metrics]);

  const metricStrip = [
    { icon: CheckSquare, label: 'Open Tasks', value: stats.openTasks, color: stats.overdue > 0 ? '#fb7185' : '#fff', tab: 'tasks' },
    { icon: Layers, label: 'Active Projects', value: stats.activeProjs, color: ACCENT, tab: 'projects' },
    { icon: Target, label: 'Goals', value: stats.totalGoals, color: '#34d399', tab: 'goals-metrics' },
    { icon: Scale, label: 'Open Decisions', value: stats.openDecisions, color: stats.openDecisions > 0 ? '#fbbf24' : '#94a3b8', tab: 'decisions' },
    { icon: CheckSquare, label: 'Tasks Done', value: stats.doneTasks, color: '#34d399', tab: 'tasks' },
    { icon: AlertTriangle, label: 'Overdue', value: stats.overdue, color: stats.overdue > 0 ? '#fb7185' : '#94a3b8', tab: 'tasks' },
    { icon: FileText, label: 'Notes', value: stats.notes, color: '#94a3b8', tab: 'notes' },
    { icon: FolderOpen, label: 'Files', value: stats.files, color: '#94a3b8', tab: 'files' },
  ] as const;

  return (
    <div className="w-full h-full overflow-y-auto scrollbar-hide flex flex-col pr-1 pb-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 pb-4" style={{ borderBottom: `1px solid ${B}` }}>
        <Orbit className="w-4 h-4" style={{ color: ACCENT }} />
        <div>
          <h3 className="text-sm font-bold text-white">Pulse</h3>
          <div className="text-[10px] text-white/35">Live overview of your digital twin</div>
        </div>
        <div className="ml-auto text-[10px] text-white/25">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* ── Stat strip ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-4" style={{ borderBottom: `1px solid ${B}` }}>
        {metricStrip.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setActiveSidebarTab(s.tab as Parameters<typeof setActiveSidebarTab>[0])}
            className="flex flex-col items-start gap-1 py-3 text-left hover:bg-white/[0.02] transition-colors"
            style={{ borderLeft: i % 4 > 0 ? `1px solid ${B}` : 'none', borderTop: i >= 4 ? `1px solid ${B}` : 'none', paddingLeft: i % 4 > 0 ? 10 : 2, paddingRight: 4 }}
          >
            <s.icon className="w-3.5 h-3.5" style={{ color: s.color }} />
            <span className="text-lg font-bold tabular-nums leading-none" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[8px] uppercase tracking-wider text-white/30 truncate w-full">{s.label}</span>
          </button>
        ))}
      </div>

      {/* ── Key Metrics ─────────────────────────────────────────────────────── */}
      {topMetrics.length > 0 && (
        <div className="shrink-0 py-4" style={{ borderBottom: `1px solid ${B}` }}>
          <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" style={{ color: ACCENT }} />
            Key Metrics
            <button
              type="button"
              onClick={() => setActiveSidebarTab('goals-metrics')}
              className="ml-auto text-[10px] text-white/30 hover:text-white/60 transition-colors"
            >
              All metrics →
            </button>
          </div>
          <div className="grid grid-cols-2">
            {topMetrics.map((m, i) => {
              const pct = bdtMetricProgress(m);
              const good = m.trend === 'flat' ? null : (m.trend === 'up') === m.higher_is_better;
              const tc = good === null ? '#94a3b8' : good ? '#34d399' : '#fb7185';
              const TIcon = m.trend === 'up' ? TrendingUp : m.trend === 'down' ? TrendingDown : Minus;
              return (
                <div key={m.id} className="py-2" style={{ borderLeft: i % 2 > 0 ? `1px solid ${B}` : 'none', paddingLeft: i % 2 > 0 ? 12 : 0 }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-white/35 truncate">{m.name}</span>
                    <TIcon className="w-3 h-3 shrink-0" style={{ color: tc }} />
                  </div>
                  <div className="text-base font-bold leading-none mb-1.5" style={{ color: tc }}>{bdtMetricDisplay(m)}</div>
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: tc }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Active Alerts ───────────────────────────────────────────────────── */}
      <div className="shrink-0 py-4" style={{ borderBottom: `1px solid ${B}` }}>
        <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} />
          Active Alerts
          <span className="ml-1.5 text-[9px] text-white/25 font-normal normal-case tracking-normal">
            {alerts.length} total
          </span>
        </div>

        {topAlerts.length === 0 && (
          <div className="py-5 text-center text-xs text-white/30">No active alerts. All clear!</div>
        )}

        <div>
          {topAlerts.map((a, i) => {
            const { Icon, color } = alertIconAndColor(a.type);
            return (
              <div
                key={i}
                className="flex items-start gap-3 py-2.5"
                style={{ borderTop: i > 0 ? `1px solid ${B}` : 'none' }}
              >
                <span
                  className="w-7 h-7 rounded-lg grid place-items-center shrink-0 mt-0.5"
                  style={{ background: `${color}16`, border: `1px solid ${color}30` }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white leading-snug">{a.title}</div>
                  {a.detail && (
                    <div className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{a.detail}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Department Health ───────────────────────────────────────────────── */}
      {departments.length > 0 && (
        <div className="shrink-0 py-4" style={{ borderBottom: `1px solid ${B}` }}>
          <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
            Department Health
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {departments.map((department) => {
              const rollup = rollups.find(r => r.target_type === 'department' && r.target_id === department.id);
              return (
                <div key={department.id} className="rounded-xl p-3" style={{ border: `1px solid ${B}`, background: 'rgba(255,255,255,0.015)' }}>
                  <MetricRollupHealthPanel rollup={rollup} title={department.name} />
                  {canEditMetrics && (
                    <button
                      type="button"
                      onClick={() => setMetricWizardTarget({ id: department.id, label: department.name })}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{ background: `${ACCENT}20`, border: `1px solid ${ACCENT}40`, color: ACCENT }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Create department metric
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Quick Navigate ──────────────────────────────────────────────────── */}
      <div className="shrink-0 pt-4">
        <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5">Quick Navigate</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {([
            { tab: 'tasks',          label: 'My Work',         Icon: CheckSquare, color: ACCENT },
            { tab: 'projects',       label: 'Projects',        Icon: Layers,      color: '#60a5fa' },
            { tab: 'goals-metrics',  label: 'Goals & Metrics', Icon: Target,      color: '#34d399' },
            { tab: 'decisions',      label: 'Decisions',       Icon: Scale,       color: '#fbbf24' },
            { tab: 'roadmap',        label: 'Roadmap',         Icon: TrendingUp,  color: '#a78bfa' },
            { tab: 'competitors',    label: 'Competitors',     Icon: AlertTriangle, color: '#fb7185' },
          ] as const).map(({ tab, label, Icon, color }) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveSidebarTab(tab as Parameters<typeof setActiveSidebarTab>[0])}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all text-left group"
              style={{ border: `1px solid ${B}`, background: 'rgba(255,255,255,0.015)' }}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
              <span className="text-[11px] font-semibold text-white/65 group-hover:text-white transition-colors">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {metricWizardTarget && companyId && (
        <MetricCreateWizard
          companyId={companyId}
          members={teamMembers}
          targetType="department"
          targetId={metricWizardTarget.id}
          targetLabel={`Department Health: ${metricWizardTarget.label}`}
          createMetric={createMetric}
          createDraft={createDraft}
          onClose={() => setMetricWizardTarget(null)}
        />
      )}
    </div>
  );
}
