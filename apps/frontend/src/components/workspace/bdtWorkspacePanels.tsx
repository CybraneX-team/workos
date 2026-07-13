import { useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, GitBranch, Radio, Zap } from 'lucide-react';
import type { UInternalNode } from '../../lib/usePolytopeStore';

function statusColor(status: string) {
  if (status === 'critical' || status === 'Blocked') return '#f87171';
  if (status === 'warning' || status === 'In Progress') return '#fbbf24';
  return '#34d399';
}

export function SignalPanel({ node, primaryColor }: { node: UInternalNode; primaryColor: string }) {
  const s = node.signalDetails;
  if (!s) return null;
  const sevColor = s.severity === 'critical' ? '#ef4444' : s.severity === 'high' ? '#f97316' : s.severity === 'medium' ? '#fbbf24' : '#60a5fa';

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 rounded-xl border border-white/10 bg-[#111]">
        <Radio className="w-5 h-5 shrink-0 mt-0.5" style={{ color: sevColor }} />
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40 mb-1">Signal · {s.severity}</p>
          <p className="text-sm text-white/90 leading-relaxed">{s.summary}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-[#111] border border-white/5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Source</p>
          <p className="text-sm text-white/80">{s.source}</p>
        </div>
        <div className="p-3 rounded-xl bg-[#111] border border-white/5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Detected</p>
          <p className="text-sm text-white/80">{s.detectedAt ?? 'Recently'}</p>
        </div>
      </div>
      {s.suggestedAction && (
        <div className="p-4 rounded-xl border" style={{ borderColor: `${primaryColor}44`, background: `${primaryColor}11` }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: primaryColor }}>Suggested response</p>
          <p className="text-sm text-white/80">{s.suggestedAction}</p>
        </div>
      )}
    </div>
  );
}

export function DecisionPanel({ node, primaryColor }: { node: UInternalNode; primaryColor: string }) {
  const d = node.decisionDetails;
  const [selected, setSelected] = useState<string | null>(d?.recommendation ?? null);
  if (!d) return null;

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-[#111] border border-white/10">
        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Decision required</p>
        <h3 className="text-lg font-semibold text-white mb-2">{d.question}</h3>
        <p className="text-sm text-white/55 leading-relaxed">{d.context}</p>
      </div>
      <div className="space-y-3">
        {d.options.map(opt => {
          const active = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelected(opt.id)}
              className="w-full text-left p-4 rounded-xl border transition-all"
              style={{
                borderColor: active ? primaryColor : 'rgba(255,255,255,0.08)',
                background: active ? `${primaryColor}15` : '#111',
                boxShadow: active ? `0 0 0 1px ${primaryColor}55` : undefined,
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-white">{opt.label}</span>
                {d.recommendation === opt.id && (
                  <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${primaryColor}22`, color: primaryColor }}>
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-xs text-white/50 mb-1">{opt.description}</p>
              <p className="text-xs" style={{ color: primaryColor + 'aa' }}>Impact: {opt.impact}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MetricPanel({ node, primaryColor }: { node: UInternalNode; primaryColor: string }) {
  const m = node.metricDetails;
  if (!m) return null;
  const color = statusColor(m.status);
  const numVal = typeof m.value === 'number' ? m.value : parseFloat(String(m.value));
  const numTarget = typeof m.target === 'number' ? m.target : parseFloat(String(m.target));
  const pct = Number.isFinite(numVal) && Number.isFinite(numTarget) && numTarget > 0
    ? Math.min(100, Math.round((numVal / numTarget) * 100))
    : 72;

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-xl bg-[#111] border border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4" style={{ color: primaryColor }} />
          <p className="text-[10px] uppercase tracking-widest text-white/40">Metric</p>
        </div>
        <h3 className="text-xl font-bold text-white mb-1">{m.name}</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold" style={{ color }}>{m.value}</span>
          {m.unit && <span className="text-sm text-white/40">{m.unit}</span>}
          <span className="text-sm text-white/30 ml-2">target {m.target}{m.unit ? ` ${m.unit}` : ''}</span>
        </div>
        <div className="mt-4 h-2 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${primaryColor})` }} />
        </div>
        <p className="text-xs text-white/40 mt-2 capitalize">Trend: {m.trend} · Status: {m.status}</p>
      </div>
    </div>
  );
}

export function ActionPanel({ node, primaryColor }: { node: UInternalNode; primaryColor: string }) {
  const a = node.actionDetails;
  const steps = a?.checklist ?? node.workflowSteps ?? [];

  return (
    <div className="space-y-4">
      {a && (
        <div className="p-4 rounded-xl bg-[#111] border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4" style={{ color: primaryColor }} />
            <span className="text-sm font-semibold text-white">{a.verb}</span>
          </div>
          <p className="text-sm text-white/60">{a.description}</p>
        </div>
      )}
      {steps.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">Execution checklist</p>
          <div className="flex flex-col gap-2">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-[#111] border border-white/5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-white/25" />
                <span className="text-sm text-white/80">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjectPanel({ node, primaryColor }: { node: UInternalNode; primaryColor: string }) {
  const p = node.projectDetails;
  if (!p) return null;

  const milestones = p.milestones ?? [
    { label: 'Kickoff & scope', done: true },
    { label: 'Execution phase', done: p.status === 'Completed' || p.status === 'Active' || p.status === 'In Progress' },
    { label: 'Stakeholder review', done: p.status === 'Completed' },
    { label: 'Delivery & retrospective', done: p.status === 'Completed' },
  ];

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-xl bg-[#111] border border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch className="w-4 h-4" style={{ color: primaryColor }} />
          <span className="text-[10px] uppercase tracking-widest text-white/40">Project</span>
        </div>
        <h3 className="text-xl font-bold text-white mb-2">{node.label}</h3>
        <p className="text-sm text-white/60 leading-relaxed">{p.description}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-[#111] border border-white/5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Status</p>
          <p className="text-sm font-medium" style={{ color: statusColor(p.status ?? '') }}>{p.status}</p>
        </div>
        <div className="p-3 rounded-xl bg-[#111] border border-white/5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Deadline</p>
          <p className="text-sm text-white/80">{p.deadline ?? '—'}</p>
        </div>
        <div className="p-3 rounded-xl bg-[#111] border border-white/5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Budget</p>
          <p className="text-sm text-white/80">{p.budget ?? '—'}</p>
        </div>
        <div className="p-3 rounded-xl bg-[#111] border border-white/5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Owner</p>
          <p className="text-sm text-white/80">{p.owner ?? node.owner ?? 'Project Lead'}</p>
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">Milestones</p>
        <div className="space-y-2">
          {milestones.map((ms, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-[#111] border border-white/5">
              <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: ms.done ? primaryColor : 'rgba(255,255,255,0.2)' }} />
              <span className={`text-sm ${ms.done ? 'text-white/80' : 'text-white/45'}`}>{ms.label}</span>
            </div>
          ))}
        </div>
      </div>
      {(p.risks?.length ?? 0) > 0 && (
        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400/80">Risks</p>
          </div>
          <ul className="text-sm text-white/60 space-y-1">
            {p.risks!.map((r, i) => <li key={i}>• {r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export function BdtTypePanel({ node, primaryColor }: { node: UInternalNode; primaryColor: string }) {
  if (node.type === 'signal') return <SignalPanel node={node} primaryColor={primaryColor} />;
  if (node.type === 'decision') return <DecisionPanel node={node} primaryColor={primaryColor} />;
  if (node.type === 'metric') return <MetricPanel node={node} primaryColor={primaryColor} />;
  if (node.type === 'project' && node.projectDetails) return <ProjectPanel node={node} primaryColor={primaryColor} />;
  if (node.type === 'action') return <ActionPanel node={node} primaryColor={primaryColor} />;
  return null;
}
