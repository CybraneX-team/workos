import { useMemo } from 'react';
import {
  Target, TrendingUp, TrendingDown, Minus, CheckCircle2, Circle, Gauge,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';
import { useBdtGoals, useBdtMetrics, bdtMetricDisplay, bdtMetricTargetDisplay, bdtMetricProgress } from '../../lib/db/metrics';
import type { BdtMetric } from '../../lib/db/metrics';

const ACCENT = '#C1AEFF';
const B = 'rgba(255,255,255,0.08)';

function metricIsGood(m: BdtMetric): boolean | null {
  if (m.trend === 'flat') return null;
  return (m.trend === 'up') === m.higher_is_better;
}

function computeHealthScore(goalCompletionPct: number, onTrackMetricPct: number | null): number {
  if (onTrackMetricPct == null) return Math.round(goalCompletionPct);
  return Math.round(goalCompletionPct * 0.5 + onTrackMetricPct * 0.5);
}

function HealthGauge({ value }: { value: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const color = value >= 70 ? '#34d399' : value >= 40 ? '#fbbf24' : '#fb7185';
  return (
    <div className="relative shrink-0" style={{ width: 76, height: 76 }}>
      <svg viewBox="0 0 76 76" className="w-full h-full -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
        <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}
          style={{ filter: `drop-shadow(0 0 6px ${color}80)`, transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold" style={{ color }}>{value}</span>
        <span className="text-[8px] text-white/30 uppercase tracking-wider -mt-0.5">Health</span>
      </div>
    </div>
  );
}

function MetricCard({ m }: { m: BdtMetric }) {
  const pct = bdtMetricProgress(m);
  const good = metricIsGood(m);
  const tc = good === null ? '#94a3b8' : good ? '#34d399' : '#fb7185';
  const TIcon = m.trend === 'up' ? TrendingUp : m.trend === 'down' ? TrendingDown : Minus;
  return (
    <div className="rounded-xl p-3 border" style={{ borderColor: B, background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/40 truncate">{m.name}</span>
        <TIcon className="w-3 h-3 shrink-0" style={{ color: tc }} />
      </div>
      <div className="flex items-baseline gap-1.5 mb-1.5">
        <span className="text-base font-bold leading-none" style={{ color: tc }}>{bdtMetricDisplay(m)}</span>
        <span className="text-[10px] text-white/25">/ {bdtMetricTargetDisplay(m)} target</span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: tc }} />
      </div>
    </div>
  );
}

export function WorkspaceGoalsMetricsPanel() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { goals: bdtGoals } = useBdtGoals(companyId);
  const { metrics } = useBdtMetrics(companyId);
  const { goals: workspaceGoals, goalProgress, toggleGoal } = useFounderWorkspace();

  const goalCompletionPct = useMemo(() => {
    if (bdtGoals.length) {
      const done = bdtGoals.filter(g => (g.progress ?? 0) >= 100).length;
      return Math.round((done / bdtGoals.length) * 100);
    }
    return goalProgress;
  }, [bdtGoals, goalProgress]);

  const onTrackMetricPct = useMemo(() => {
    const judged = metrics.map(metricIsGood).filter((g): g is boolean => g !== null);
    if (!judged.length) return null;
    return Math.round((judged.filter(Boolean).length / judged.length) * 100);
  }, [metrics]);

  const healthScore = computeHealthScore(goalCompletionPct, onTrackMetricPct);

  const companyMetrics = metrics.filter(m => m.scope === 'company');
  const deptMetrics = metrics.filter(m => m.scope === 'department');

  return (
    <div className="w-full h-full overflow-y-auto scrollbar-hide flex flex-col gap-5 pb-6 pr-1">

      {/* ── Header + Health Score ──────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-4 rounded-2xl p-4 border" style={{ borderColor: B, background: 'rgba(255,255,255,0.02)' }}>
        <HealthGauge value={healthScore} />
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Gauge className="w-3.5 h-3.5" style={{ color: ACCENT }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35">Goals & Metrics</span>
          </div>
          <p className="text-[12px] text-white/50 max-w-sm leading-relaxed">
            {healthScore >= 70
              ? 'Strong shape — most goals and metrics are on track.'
              : healthScore >= 40
                ? 'Mixed signal — some goals or metrics need attention.'
                : 'Needs attention — goal completion or metric trends are lagging.'}
            {' '}Combines goal completion ({goalCompletionPct}%) and on-track metrics{onTrackMetricPct != null ? ` (${onTrackMetricPct}%)` : ''}.
          </p>
        </div>
      </div>

      {/* ── Company OKRs (real, backend-persisted) ────────────────────── */}
      {bdtGoals.length > 0 && (
        <div>
          <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
            Company OKRs
          </div>
          <div className="flex flex-col gap-2.5">
            {bdtGoals.map(g => (
              <div key={g.id} className="rounded-xl p-3.5 border" style={{ borderColor: B, background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-white">{g.title}</span>
                  <span className="text-[11px] font-bold shrink-0" style={{ color: (g.progress ?? 0) >= 100 ? '#34d399' : ACCENT }}>
                    {g.progress ?? 0}%
                  </span>
                </div>
                <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-2">
                  <div className="h-full rounded-full" style={{ width: `${g.progress ?? 0}%`, background: (g.progress ?? 0) >= 100 ? '#34d399' : ACCENT }} />
                </div>
                {g.links.length > 0 && (
                  <div className="mt-2.5 pl-0.5 flex flex-col gap-1">
                    {g.links.map(link => (
                      <div key={link.id} className="flex items-center justify-between text-[10px] text-white/40">
                        <span>{link.metric_name ?? 'Metric'}</span>
                        <span className="text-white/55">
                          {link.value ?? '—'}{link.unit ?? ''} / {link.target ?? '—'}{link.unit ?? ''} target
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── This Workspace's Goals (lightweight, always available) ────── */}
      <div>
        <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5 flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          This Workspace's Goals
        </div>
        {workspaceGoals.length === 0 ? (
          <div className="py-8 text-center rounded-xl border border-dashed" style={{ borderColor: B }}>
            <div className="text-sm text-white/35">No goals yet</div>
            <div className="text-[11px] text-white/20 mt-1">Add your first OKR to start tracking progress.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {workspaceGoals.map(g => (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleGoal(g.id)}
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all hover:bg-white/[0.03]"
                style={{ borderColor: B, background: 'rgba(255,255,255,0.015)' }}
              >
                {g.done ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <Circle className="w-4 h-4 shrink-0 text-white/25" />}
                <span className={`text-[12px] flex-1 ${g.done ? 'text-white/35 line-through' : 'text-white/80'}`}>{g.label}</span>
                {g.owner && <span className="text-[10px] text-white/25 shrink-0">{g.owner}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Metrics Dashboard ──────────────────────────────────────────── */}
      {(companyMetrics.length > 0 || deptMetrics.length > 0) && (
        <div className="flex flex-col gap-4">
          {companyMetrics.length > 0 && (
            <div>
              <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5">Company Metrics</div>
              <div className="grid grid-cols-2 gap-2">
                {companyMetrics.map(m => <MetricCard key={m.id} m={m} />)}
              </div>
            </div>
          )}
          {deptMetrics.length > 0 && (
            <div>
              <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35 mb-2.5">Department Metrics</div>
              <div className="grid grid-cols-2 gap-2">
                {deptMetrics.map(m => <MetricCard key={m.id} m={m} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {companyMetrics.length === 0 && deptMetrics.length === 0 && (
        <div className="py-8 text-center rounded-xl border border-dashed" style={{ borderColor: B }}>
          <div className="text-sm text-white/35">No metrics tracked yet</div>
          <div className="text-[11px] text-white/20 mt-1">Metrics you connect will show trend and target progress here.</div>
        </div>
      )}
    </div>
  );
}
