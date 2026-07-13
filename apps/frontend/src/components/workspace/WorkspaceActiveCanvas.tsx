import { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Building2,
  Maximize2,
  Minimize2,
  Share2,
  ShieldAlert,
  SlidersHorizontal,
  Tag,
  Target,
  TrendingUp,
  Plus,
  Check,
  Send,
  User,
  UploadCloud,
  FileText,
  X,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Database,
  Mic,
  Volume2,
  Layers,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  Copy,
  RefreshCw,
  Compass,
  Scale,
  Zap,
  CheckCircle,
  Bot,
  Network,
} from 'lucide-react';
import {
  WORKSPACE_CANVAS_CARDS,
  WORKSPACE_CANVAS_CONNECTIONS,
  type WorkspaceCanvasCard,
} from '../../lib/workspaceLayoutData';
import { WorkspaceCanvasFrame } from './WorkspaceCanvasFrame';
import { api } from '../../lib/api';
import { useFounderWorkspace, type NoteBlock, type Note, type WorkspaceMode, type AuditEntry, type ShortcutItem } from '../../context/FounderWorkspaceContext';
import { BrainIcon } from './BrainIcon';
import Orb from '../Orb';
import { WorkspaceFilesDashboard } from './WorkspaceFilesDashboard';
import { WorkspaceSavedNodesCanvas } from './WorkspaceSavedNodesCanvas';
import { WorkspaceHierarchyNodesCanvas } from './WorkspaceHierarchyNodesCanvas';
import { WorkspaceProjectsSpace } from './WorkspaceProjectsSpace';
import { WorkspaceCanvasOverview } from './WorkspaceCanvasOverview';
import { WorkspaceAgentSurface } from './WorkspaceAgentSurface';
import { WorkspaceShortcutPanel } from './WorkspaceShortcutPanel';
import { WorkspaceMyWorkPanel } from './WorkspaceMyWorkPanel';
import { WorkspaceDecisionsPanel } from './WorkspaceDecisionsPanel';
import { WorkspaceGoalsMetricsPanel } from './WorkspaceGoalsMetricsPanel';
import { WorkspaceCreateModal } from './WorkspaceCreateModal';
import { WorkspaceSpherePanel } from './WorkspaceSpherePanel';
import { WorkspaceModeBar } from './WorkspaceModeBar';
import { WorkspaceUniverseCanvas } from './WorkspaceUniverseCanvas';
import { WorkspaceIndustryCanvas } from './WorkspaceIndustryCanvas';
import { WorkspaceSubdomainCanvas } from './WorkspaceSubdomainCanvas';
import { WorkspaceCompanyCanvas } from './WorkspaceCompanyCanvas';

/* ── tiny chart primitives ─────────────────────────────────────── */

function MiniBars({ color }: { color: string }) {
  const heights = [38, 58, 44, 72, 50, 66, 82, 60];
  return (
    <div className="flex items-end gap-[3px] h-12 mt-auto">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-[2px]"
          style={{ height: `${h}%`, background: `${color}${i % 2 ? 'cc' : '77'}` }}
        />
      ))}
    </div>
  );
}

function MiniRadar({ color }: { color: string }) {
  const ring = (s: number) =>
    [
      [50, 50 - 42 * s],
      [50 + 40 * s, 50 - 13 * s],
      [50 + 25 * s, 50 + 34 * s],
      [50 - 25 * s, 50 + 34 * s],
      [50 - 40 * s, 50 - 13 * s],
    ]
      .map(p => p.join(','))
      .join(' ');
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {[1, 0.66, 0.33].map(s => (
        <polygon
          key={s}
          points={ring(s)}
          fill="none"
          stroke={color}
          strokeWidth={0.8}
          strokeOpacity={0.25}
        />
      ))}
      {[0, 1, 2, 3, 4].map(i => {
        const pts = ring(1).split(' ')[i];
        return (
          <line
            key={i}
            x1="50"
            y1="50"
            x2={pts.split(',')[0]}
            y2={pts.split(',')[1]}
            stroke={color}
            strokeWidth={0.6}
            strokeOpacity={0.2}
          />
        );
      })}
      <polygon
        points={[
          [50, 18],
          [80, 42],
          [66, 74],
          [30, 70],
          [20, 40],
        ]
          .map(p => p.join(','))
          .join(' ')}
        fill={`${color}33`}
        stroke={color}
        strokeWidth={1.2}
        strokeOpacity={0.85}
      />
    </svg>
  );
}

function MiniArea({ color, id }: { color: string; id: string }) {
  return (
    <svg viewBox="0 0 120 44" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.45} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        fill={`url(#area-${id})`}
        points="0,34 16,30 32,20 48,26 64,12 80,18 96,8 120,14 120,44 0,44"
      />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeOpacity={0.9}
        points="0,34 16,30 32,20 48,26 64,12 80,18 96,8 120,14"
      />
    </svg>
  );
}

function MiniLine({ color, id }: { color: string; id: string }) {
  return (
    <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id={`line-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        fill={`url(#line-${id})`}
        points="0,30 18,26 34,30 52,18 70,24 88,10 106,16 120,4 120,40 0,40"
      />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeOpacity={0.9}
        points="0,30 18,26 34,30 52,18 70,24 88,10 106,16 120,4"
      />
    </svg>
  );
}

function GaugeRing({ color, value }: { color: string; value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: 56, height: 56 }}>
      <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={4} />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          style={{ filter: `drop-shadow(0 0 4px ${color}aa)` }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[13px] font-bold"
        style={{ color }}
      >
        {value}%
      </span>
    </div>
  );
}

function CardIcon({ kind, color, id }: { kind?: WorkspaceCanvasCard['icon']; color: string; id?: string }) {
  const cls = 'w-3.5 h-3.5';
  const style = { color };

  if (id === 'company_hub') {
    return <Building2 className={cls} style={style} strokeWidth={2} />;
  }
  if (id === 'departments') {
    return <SlidersHorizontal className={cls} style={style} strokeWidth={2} />;
  }

  switch (kind) {
    case 'trend':
      return <TrendingUp className={cls} style={style} strokeWidth={2} />;
    case 'target':
      return <Target className={cls} style={style} strokeWidth={2} />;
    case 'shield':
      return <ShieldAlert className={cls} style={style} strokeWidth={2} />;
    case 'price':
      return <Tag className={cls} style={style} strokeWidth={2} />;
    default:
      return null;
  }
}

function CheckRow({ label, color, done }: { label: string; color: string; done?: boolean }) {
  return (
    <li className="flex items-center gap-1.5 text-[10px] text-white/75">
      <svg viewBox="0 0 12 12" className={`w-3 h-3 shrink-0 transition-colors ${done ? 'text-emerald-400' : ''}`} style={{ color: done ? undefined : color }} fill="none">
        <path
          d={done ? "M2.5 6.2 4.8 8.6 9.6 3.4" : "M2 6h8"}
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={done ? 'line-through text-white/40' : ''}>{label}</span>
    </li>
  );
}

/* ── card body per variant ─────────────────────────────────────── */

function CardHeader({ card }: { card: WorkspaceCanvasCard }) {
  return (
    <div className="flex items-start justify-between gap-2 mb-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <CardIcon kind={card.icon} color={card.accent} id={card.id} />
        <span
          className="ws-card-eyebrow truncate"
          style={{ color: `${card.accent}` }}
        >
          {card.title}
        </span>
      </div>
    </div>
  );
}

function CardBody({ card }: { card: WorkspaceCanvasCard }) {
  const {
    goals,
    goalProgress,
    projectedRunway,
    operatingBurn,
    monthlyRev,
    departments,
    totalFTE,
    risks,
    confidenceScore,
    gtmChannels,
  } = useFounderWorkspace();

  switch (card.id) {
    case 'company_hub':
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, color-mix(in srgb, ${card.accent} 40%, transparent), transparent)`,
                  border: `1px solid color-mix(in srgb, ${card.accent} 35%, transparent)`,
                }}
              >
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white leading-tight">{card.title}</h3>
                <span className="text-[11px] text-white/45">{card.subtitle}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-3">
            <span className="ws-hero-tag text-[9px] px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-md">
              Runway: {projectedRunway} Mo
            </span>
            <span className="ws-hero-tag text-[9px] px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-md">
              OKRs: {goalProgress}%
            </span>
            <span className="ws-hero-tag text-[9px] px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-md">
              FTE: {totalFTE}
            </span>
          </div>

          <div className="mt-auto pt-3 h-16">
            <MiniArea color={card.accent} id={card.id} />
          </div>
        </div>
      );

    case 'metrics':
      return (
        <div className="flex flex-col h-full">
          <CardHeader card={card} />
          <p className="text-[10px] text-white/40 mb-2 font-medium">
            Runway: <span className="text-emerald-400 font-bold">{projectedRunway} Months</span>
          </p>
          <div className="grid grid-cols-2 gap-1 mb-2 text-[10px] text-white/60">
            <div>Burn: <span className="text-red-400 font-semibold">${Math.round(operatingBurn / 1000)}k</span></div>
            <div>Rev: <span className="text-emerald-400 font-semibold">${Math.round(monthlyRev / 1000)}k</span></div>
          </div>
          <MiniBars color={card.accent} />
        </div>
      );

    case 'departments':
      return (
        <div className="flex flex-col h-full">
          <CardHeader card={card} />
          {departments.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[9px] text-white/25 text-center px-2">No departments yet — add one in Team.</div>
          ) : (
            <div className="flex gap-2 flex-1 min-h-0">
              <ul className="flex-1 space-y-1 text-[9px] text-white/70">
                {departments.map(d => (
                  <li key={d.id} className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: card.accent }} />
                      {d.name.split(' ')[0]}
                    </span>
                    <span className="font-semibold text-white/40">{d.fte}</span>
                  </li>
                ))}
              </ul>
              <div className="w-[38%] shrink-0">
                <MiniRadar color={card.accent} />
              </div>
            </div>
          )}
          <span className="text-[9px] text-white/35 self-end mt-1">{totalFTE} Total FTE</span>
        </div>
      );

    case 'goals':
      return (
        <div className="flex flex-col h-full">
          <CardHeader card={card} />
          {goals.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[9px] text-white/25 text-center px-2">No goals yet — add your first OKR in Review mode.</div>
          ) : (
            <ul className="space-y-1 text-[10px] text-white/80 mb-auto">
              {goals.slice(0, 3).map(g => (
                <li key={g.id} className="flex items-center gap-1.5 truncate">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${g.done ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <span className={g.done ? 'line-through text-white/40' : ''}>{g.label}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-white/5">
            <span className="text-[9px] text-white/45">OKR Goals Complete</span>
            <span className="text-[11px] font-bold text-rose-400">{goalProgress}%</span>
          </div>
        </div>
      );

    case 'risks':
      return (
        <div className="flex flex-col h-full">
          <CardHeader card={card} />
          {risks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[9px] text-white/25 text-center px-2">No risks logged yet.</div>
          ) : (
            <div className="flex items-center gap-3 flex-1">
              <ul className="flex-1 space-y-1">
                {risks.slice(0, 3).map(r => (
                  <CheckRow key={r.id} label={r.label.split(':')[1]?.trim() || r.label} color={card.accent} done={r.status === 'Mitigated'} />
                ))}
              </ul>
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <GaugeRing color={card.accent} value={confidenceScore} />
                <span className="text-[8px] text-white/45">Risk Index</span>
              </div>
            </div>
          )}
        </div>
      );

    case 'gtm':
      return (
        <div className="flex flex-col h-full">
          <CardHeader card={card} />
          {gtmChannels.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[9px] text-white/25 text-center px-2">No GTM channels yet.</div>
          ) : (
          <ul className="space-y-1 mb-1">
            {gtmChannels.map(c => (
              <CheckRow key={c.id} label={`${c.name.split(' ')[0]} (${c.budget}%)`} color={card.accent} />
            ))}
          </ul>
          )}
          <div className="mt-auto h-12">
            <MiniLine color={card.accent} id={card.id} />
          </div>
        </div>
      );

    default:
      return null;
  }
}

function CompactCardBody({ card }: { card: WorkspaceCanvasCard }) {
  const {
    goalProgress,
    projectedRunway,
    totalFTE,
    confidenceScore,
    gtmChannels,
    workspaces,
    activeWorkspaceId,
  } = useFounderWorkspace();

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  let metricValue = '';
  let metricLabel = '';

  switch (card.id) {
    case 'company_hub':
      metricValue = 'Series A';
      metricLabel = 'Active Plan';
      break;
    case 'metrics':
      metricValue = `${projectedRunway} Mo`;
      metricLabel = 'Cash Runway';
      break;
    case 'departments':
      metricValue = `${totalFTE}`;
      metricLabel = 'Total FTEs';
      break;
    case 'goals':
      metricValue = `${goalProgress}%`;
      metricLabel = 'OKR Progress';
      break;
    case 'risks':
      metricValue = `${confidenceScore}%`;
      metricLabel = 'Confidence';
      break;
    case 'gtm':
      metricValue = `${gtmChannels.length}`;
      metricLabel = 'GTM Channels';
      break;
  }

  return (
    <div className="flex flex-col h-full justify-between py-0.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <CardIcon kind={card.icon} color={card.accent} id={card.id} />
        <span
          className="ws-card-eyebrow truncate text-[10px]"
          style={{ color: card.accent }}
        >
          {card.id === 'company_hub' ? activeWorkspace.name : card.title}
        </span>
      </div>

      <div className="mt-1">
        <div className="text-[20px] font-black text-white tracking-tight leading-none" style={{ textShadow: `0 0 10px ${card.accent}44` }}>
          {metricValue}
        </div>
        <span className="text-[9px] text-white/40 font-medium block mt-1 truncate">
          {metricLabel}
        </span>
      </div>
    </div>
  );
}

/* ── Activity Feed ────────────────────────────────────────────────────────── */

function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function WorkspaceShortcutRouter({ shortcut }: { shortcut: ShortcutItem }) {
  const { setActiveWorkspaceId, setActiveSidebarTab } = useFounderWorkspace();

  useEffect(() => {
    if (shortcut.kind === 'workspace' && shortcut.targetId) {
      setActiveWorkspaceId(shortcut.targetId);
      setActiveSidebarTab('canvas');
    } else if (shortcut.kind === 'project' && shortcut.targetId) {
      setActiveSidebarTab('projects');
      window.dispatchEvent(new CustomEvent('open-project', { detail: { projectId: shortcut.targetId } }));
    }
  }, [shortcut, setActiveWorkspaceId, setActiveSidebarTab]);

  if (shortcut.kind === 'template' && shortcut.templateTab) {
    return <WorkspaceShortcutPanel tabId={shortcut.templateTab} />;
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-sm text-white/30">Opening {shortcut.label}…</div>
    </div>
  );
}

function WorkspaceActivityFeed() {
  const { auditLog } = useFounderWorkspace();

  if (auditLog.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center">
        <div className="text-2xl mb-3">📋</div>
        <div className="text-sm font-semibold text-white/50">No activity yet</div>
        <div className="text-xs text-white/25 mt-1">Actions in this workspace appear here in real time.</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto scrollbar-hide pb-6">
      <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/40 mb-3 flex items-center gap-1.5 px-0.5">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
        Audit Trail · {auditLog.length} events
      </div>
      <div className="relative pl-4">
        <div className="absolute left-[5px] top-0 bottom-0 w-px bg-white/8" />
        {(auditLog as AuditEntry[]).map((entry, i) => (
          <div key={entry.id} className="relative mb-4 last:mb-0">
            <div
              className="absolute -left-[11px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#0f0f17]"
              style={{ background: i === 0 ? '#c1aeff' : '#334155' }}
            />
            <div className="rounded-xl p-3 bg-white/[0.03] border border-white/8">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[12px] font-semibold text-white">{entry.action}</span>
                <span className="text-[10px] text-white/30 shrink-0">{timeAgoShort(entry.at)}</span>
              </div>
              {entry.detail && (
                <p className="text-[11px] text-white/45 leading-snug truncate" title={entry.detail}>{entry.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Mode Lens Banner ─────────────────────────────────────────────────────── */
const DASHBOARD_TABS_SET = new Set(['notes','files','projects','sphere','roadmap','fundraising','interviews','competitors','activity']);

type ModeLensConfig = {
  color: string;
  label: string;
  description: string;
  stats: { label: string; value: string | number }[];
};

function WorkspaceModeLensBanner() {
  const {
    workspaceMode, activeSidebarTab, activeRole,
    tasks, goals, goalProgress,
    risks, confidenceScore, projectedRunway,
  } = useFounderWorkspace();

  const isDashboard = DASHBOARD_TABS_SET.has(activeSidebarTab);

  const visible = (
    (workspaceMode === 'execution' && activeSidebarTab === 'projects') ||
    (workspaceMode === 'decision'  && activeSidebarTab === 'projects') ||
    (workspaceMode === 'review'    && activeSidebarTab === 'projects') ||
    (workspaceMode === 'explore'   && !isDashboard) ||
    (workspaceMode === 'agent'     && !isDashboard)
  );

  if (!visible) return null;

  const resolveStatus = (t: { status?: string; done?: boolean }) =>
    t.status ?? (t.done ? 'done' : 'in_progress');

  const priorityTasks = tasks.filter(t => resolveStatus(t) === 'highlighted').length;
  const activeTasks   = tasks.filter(t => resolveStatus(t) === 'in_progress').length;
  const doneTasks     = tasks.filter(t => resolveStatus(t) === 'done').length;
  const openRisks     = risks.filter(r => r.status !== 'Mitigated').length;
  const doneGoals     = goals.filter(g => g.done).length;

  const cfg: ModeLensConfig = (() => {
    switch (workspaceMode) {
      case 'execution': return {
        color: '#c1aeff',
        label: 'Execution Lens',
        description: 'Focus on what ships — priority tasks and active work items.',
        stats: [
          { label: 'Priority', value: priorityTasks },
          { label: 'Active',   value: activeTasks },
          { label: 'Done',     value: doneTasks },
        ],
      };
      case 'decision': return {
        color: '#fbbf24',
        label: 'Decision Lens',
        description: 'Surface what needs a call — open risks, stalled goals, low confidence.',
        stats: [
          { label: 'Open Risks',  value: openRisks },
          { label: 'Confidence', value: `${confidenceScore}%` },
          ...(activeRole === 'founder' ? [{ label: 'Runway', value: `${projectedRunway}mo` }] : []),
        ],
      };
      case 'review': return {
        color: '#34d399',
        label: 'Review Lens',
        description: 'Measure what matters — OKR health, milestone completion, momentum.',
        stats: [
          { label: 'OKR Progress', value: `${goalProgress}%` },
          { label: 'Milestones',  value: `${doneGoals}/${goals.length}` },
          ...(activeRole !== 'member' ? [{ label: 'Active Risks', value: openRisks }] : []),
        ],
      };
      case 'explore': return {
        color: '#60a5fa',
        label: 'Explore',
        description: 'Full picture — browse all nodes, cards, and connections in your universe.',
        stats: [],
      };
      case 'agent': return {
        color: '#f472b6',
        label: 'Agent Lens',
        description: 'AI twin engaged — monitoring signals, running simulations, ready to act.',
        stats: [],
      };
    }
  })();

  const ModeIcon: Record<WorkspaceMode, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
    explore: Compass, decision: Scale, execution: Zap, review: CheckCircle, agent: Bot,
  };
  const Icon = ModeIcon[workspaceMode];

  return (
    <div
      className="shrink-0 ws-canvas-inset mb-3 flex items-center gap-3"
      style={{
        padding: '10px 16px 10px 14px',
        borderRadius: 12,
        background: `${cfg.color}18`,
        border: `1px solid ${cfg.color}40`,
        borderLeft: `3px solid ${cfg.color}`,
      }}
    >
      <Icon className="w-4 h-4 shrink-0" style={{ color: cfg.color }} />
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
        <span
          className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
          style={{ background: `${cfg.color}25`, color: cfg.color, border: `1px solid ${cfg.color}45` }}
        >
          {activeRole === 'founder' ? 'Founder' : activeRole === 'manager' ? 'Manager' : 'Member'}
        </span>
        <span className="text-[11px] text-white/55 min-w-0 truncate">{cfg.description}</span>
      </div>
      {cfg.stats.length > 0 && (
        <div className="flex items-center gap-2 shrink-0">
          {cfg.stats.map(s => (
            <div
              key={s.label}
              className="text-center px-3 py-2 rounded-lg"
              style={{ background: `${cfg.color}20`, border: `1px solid ${cfg.color}40` }}
            >
              <div className="text-[14px] font-black leading-none mb-1" style={{ color: cfg.color }}>
                {s.value}
              </div>
              <div className="text-[9px] uppercase tracking-wider leading-none" style={{ color: `${cfg.color}cc` }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// WorkspaceNotesDashboard Component
// ==========================================
function WorkspaceNotesDashboard() {
  const {
    notes,
    addNote,
    updateNote,
    deleteNote,
    activeNoteId,
    setActiveNoteId
  } = useFounderWorkspace();

  const [searchQuery, setSearchQuery] = useState('');
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [activeBlockIdForFormat, setActiveBlockIdForFormat] = useState<string | null>(null);

  // Create and open a new note when the dock "Note" (or Link / Code) button is clicked
  useEffect(() => {
    const handler = () => addNote('Untitled Note');
    window.addEventListener('workspace-dock-note', handler);
    return () => window.removeEventListener('workspace-dock-note', handler);
  }, [addNote]);

  const activeNote = notes.find(n => n.id === activeNoteId);

  // Markdown parsing utility
  const parseMarkdown = (text: string) => {
    if (!text) return '';
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Bold: **text**
    html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    html = html.replace(/\*([\s\S]*?)\*/g, '<em>$1</em>');
    html = html.replace(/_([\s\S]*?)_/g, '<em>$1</em>');
    // Underline: <u>text</u>
    html = html.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/gi, '<span class="underline">$1</span>');
    // Links: [text](url)
    html = html.replace(/\[([\s\S]*?)\]\(([\s\S]*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-400 underline hover:text-indigo-300">$1</a>');

    return html;
  };

  const handleBlockContentChange = (blockId: string, newContent: string) => {
    if (!activeNote) return;
    const updatedBlocks = activeNote.blocks.map(b =>
      b.id === blockId ? { ...b, content: newContent } : b
    );
    updateNote(activeNote.id, { blocks: updatedBlocks });
  };

  const handleBlockCheckedChange = (blockId: string, checked: boolean) => {
    if (!activeNote) return;
    const updatedBlocks = activeNote.blocks.map(b =>
      b.id === blockId ? { ...b, checked } : b
    );
    updateNote(activeNote.id, { blocks: updatedBlocks });
  };

  const handleTableDataChange = (blockId: string, rowIndex: number, colIndex: number, val: string) => {
    if (!activeNote) return;
    const updatedBlocks = activeNote.blocks.map(b => {
      if (b.id === blockId && b.tableData) {
        const newData = b.tableData.map((row, rIdx) =>
          rIdx === rowIndex
            ? row.map((col, cIdx) => cIdx === colIndex ? val : col)
            : row
        );
        return { ...b, tableData: newData };
      }
      return b;
    });
    updateNote(activeNote.id, { blocks: updatedBlocks });
  };

  const addTableRow = (blockId: string) => {
    if (!activeNote) return;
    const updatedBlocks = activeNote.blocks.map(b => {
      if (b.id === blockId && b.tableData) {
        const colsCount = b.tableData[0]?.length || 2;
        const newRow = Array(colsCount).fill('');
        return { ...b, tableData: [...b.tableData, newRow] };
      }
      return b;
    });
    updateNote(activeNote.id, { blocks: updatedBlocks });
  };

  const addTableColumn = (blockId: string) => {
    if (!activeNote) return;
    const updatedBlocks = activeNote.blocks.map(b => {
      if (b.id === blockId && b.tableData) {
        const newData = b.tableData.map(row => [...row, '']);
        return { ...b, tableData: newData };
      }
      return b;
    });
    updateNote(activeNote.id, { blocks: updatedBlocks });
  };

  const deleteBlock = (blockId: string) => {
    if (!activeNote) return;
    const updatedBlocks = activeNote.blocks.filter(b => b.id !== blockId);
    updateNote(activeNote.id, { blocks: updatedBlocks });
  };

  const moveBlock = (blockId: string, direction: 'up' | 'down') => {
    if (!activeNote) return;
    const idx = activeNote.blocks.findIndex(b => b.id === blockId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === activeNote.blocks.length - 1) return;

    const newBlocks = [...activeNote.blocks];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const temp = newBlocks[idx];
    newBlocks[idx] = newBlocks[targetIdx];
    newBlocks[targetIdx] = temp;
    updateNote(activeNote.id, { blocks: newBlocks });
  };

  const addBlockBelow = (blockId: string, type: NoteBlock['type']) => {
    if (!activeNote) return;
    const idx = activeNote.blocks.findIndex(b => b.id === blockId);
    if (idx === -1) return;

    const newBlock: NoteBlock = {
      id: `b_${Date.now()}`,
      type,
      content: '',
      checked: type === 'todo' ? false : undefined,
      tableData: type === 'table' ? [['Column 1', 'Column 2'], ['', '']] : undefined
    };

    const newBlocks = [...activeNote.blocks];
    newBlocks.splice(idx + 1, 0, newBlock);
    updateNote(activeNote.id, { blocks: newBlocks });
  };

  const appendBlock = (type: NoteBlock['type']) => {
    if (!activeNote) return;
    const newBlock: NoteBlock = {
      id: `b_${Date.now()}`,
      type,
      content: '',
      checked: type === 'todo' ? false : undefined,
      tableData: type === 'table' ? [['Column 1', 'Column 2'], ['', '']] : undefined
    };
    updateNote(activeNote.id, { blocks: [...activeNote.blocks, newBlock] });
  };

  const insertTextAtCursor = (prefix: string, suffix: string) => {
    if (activeBlockIdForFormat) {
      const el = document.getElementById(`block-input-${activeBlockIdForFormat}`) as HTMLTextAreaElement | HTMLInputElement;
      if (el) {
        const start = el.selectionStart || 0;
        const end = el.selectionEnd || 0;
        const text = el.value;
        const selected = text.substring(start, end);
        const replacement = prefix + selected + suffix;
        const newValue = text.substring(0, start) + replacement + text.substring(end);

        handleBlockContentChange(activeBlockIdForFormat, newValue);

        setTimeout(() => {
          el.focus();
          el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
        }, 0);
      }
    }
  };

  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.blocks.some(block => block.content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getNotePreview = (note: Note) => {
    const textBlocks = note.blocks.filter(b => b.type === 'text' || b.type === 'todo');
    const combined = textBlocks.map(b => b.content).join(' ');
    if (combined.length > 80) {
      return combined.substring(0, 80) + '...';
    }
    return combined || 'Empty note content';
  };

  if (activeNoteId && activeNote) {
    return (
      <div className="flex flex-col h-full min-h-0 w-full overflow-hidden bg-white/[0.01] border border-white/5 rounded-2xl p-4 md:p-6 backdrop-blur-md">
        {/* Editor Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-4 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setActiveNoteId(null)}
              className="p-1.5 hover:bg-white/5 hover:text-white rounded-lg border border-white/10 text-white/60 transition-all flex items-center gap-1 cursor-pointer shrink-0 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <input
              type="text"
              value={activeNote.title}
              onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
              className="bg-transparent border-none text-lg font-black text-white focus:outline-none focus:ring-0 flex-1 py-1 truncate"
              placeholder="Untitled Note"
            />
          </div>
          <span className="text-[10px] text-white/35 font-mono shrink-0">
            Saved: {activeNote.updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Editor Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white/[0.02] border border-white/10 rounded-xl px-3 py-2 mt-3 mb-4 shrink-0 text-xs">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => insertTextAtCursor('**', '**')}
              className="p-1 px-2 hover:bg-white/5 rounded text-white/70 hover:text-white font-bold transition-all cursor-pointer"
              title="Bold"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => insertTextAtCursor('*', '*')}
              className="p-1 px-2 hover:bg-white/5 rounded text-white/70 hover:text-white italic transition-all cursor-pointer"
              title="Italic"
            >
              I
            </button>
            <button
              type="button"
              onClick={() => insertTextAtCursor('<u>', '</u>')}
              className="p-1 px-2 hover:bg-white/5 rounded text-white/70 hover:text-white underline transition-all cursor-pointer"
              title="Underline"
            >
              U
            </button>
            <button
              type="button"
              onClick={() => insertTextAtCursor('[', '](https://)')}
              className="p-1 px-2 hover:bg-white/5 rounded text-white/70 hover:text-white transition-all cursor-pointer"
              title="Add Link"
            >
              Link
            </button>
          </div>
          <div className="w-[1px] h-4 bg-white/10" />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => appendBlock('h1')}
              className="p-1 px-2 hover:bg-white/5 rounded text-indigo-300 hover:text-white transition-all cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> H1
            </button>
            <button
              type="button"
              onClick={() => appendBlock('h2')}
              className="p-1 px-2 hover:bg-white/5 rounded text-indigo-300 hover:text-white transition-all cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> H2
            </button>
            <button
              type="button"
              onClick={() => appendBlock('h3')}
              className="p-1 px-2 hover:bg-white/5 rounded text-indigo-300 hover:text-white transition-all cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> H3
            </button>
            <button
              type="button"
              onClick={() => appendBlock('text')}
              className="p-1 px-2 hover:bg-white/5 rounded text-indigo-300 hover:text-white transition-all cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Text
            </button>
            <button
              type="button"
              onClick={() => appendBlock('todo')}
              className="p-1 px-2 hover:bg-white/5 rounded text-indigo-300 hover:text-white transition-all cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> To-do
            </button>
            <button
              type="button"
              onClick={() => appendBlock('table')}
              className="p-1 px-2 hover:bg-white/5 rounded text-indigo-300 hover:text-white transition-all cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Table
            </button>
          </div>
        </div>

        {/* Editor Workspace Canvas */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin pb-10">
          {activeNote.blocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 border border-dashed border-white/5 rounded-2xl">
              <p className="text-xs text-white/30 font-semibold uppercase tracking-wider">Empty Note</p>
              <button
                type="button"
                onClick={() => appendBlock('text')}
                className="mt-3 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-xs text-indigo-300 rounded-lg cursor-pointer"
              >
                + Add text block
              </button>
            </div>
          ) : (
            activeNote.blocks.map((block) => {
              const isFocused = focusedBlockId === block.id;
              return (
                <div key={block.id} className="group relative flex items-start gap-3 w-full pr-10">

                  {/* Left Block handle (Notion style) */}
                  <div className="flex items-center h-full min-h-[20px] pt-1 opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
                    <button
                      type="button"
                      onClick={() => addBlockBelow(block.id, 'text')}
                      className="p-0.5 text-white/30 hover:text-indigo-400 rounded cursor-pointer"
                      title="Add block below"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Block content area */}
                  <div className="flex-1 min-w-0">
                    {block.type === 'h1' && (
                      isFocused ? (
                        <input
                          id={`block-input-${block.id}`}
                          type="text"
                          value={block.content}
                          onChange={(e) => handleBlockContentChange(block.id, e.target.value)}
                          onFocus={() => {
                            setFocusedBlockId(block.id);
                            setActiveBlockIdForFormat(block.id);
                          }}
                          onBlur={() => setTimeout(() => setFocusedBlockId(null), 150)}
                          className="text-xl font-black text-white bg-transparent border-b border-white/10 focus:border-indigo-500 focus:outline-none w-full pb-1"
                          placeholder="Heading 1"
                        />
                      ) : (
                        <h1
                          onClick={() => setFocusedBlockId(block.id)}
                          className="text-xl font-black text-white cursor-pointer hover:bg-white/[0.02] p-1 rounded min-h-[2rem]"
                        >
                          {block.content || <span className="text-white/20 italic">Heading 1</span>}
                        </h1>
                      )
                    )}

                    {block.type === 'h2' && (
                      isFocused ? (
                        <input
                          id={`block-input-${block.id}`}
                          type="text"
                          value={block.content}
                          onChange={(e) => handleBlockContentChange(block.id, e.target.value)}
                          onFocus={() => {
                            setFocusedBlockId(block.id);
                            setActiveBlockIdForFormat(block.id);
                          }}
                          onBlur={() => setTimeout(() => setFocusedBlockId(null), 150)}
                          className="text-lg font-extrabold text-white bg-transparent border-b border-white/10 focus:border-indigo-500 focus:outline-none w-full pb-1"
                          placeholder="Heading 2"
                        />
                      ) : (
                        <h2
                          onClick={() => setFocusedBlockId(block.id)}
                          className="text-lg font-extrabold text-white cursor-pointer hover:bg-white/[0.02] p-1 rounded min-h-[1.8rem]"
                        >
                          {block.content || <span className="text-white/20 italic">Heading 2</span>}
                        </h2>
                      )
                    )}

                    {block.type === 'h3' && (
                      isFocused ? (
                        <input
                          id={`block-input-${block.id}`}
                          type="text"
                          value={block.content}
                          onChange={(e) => handleBlockContentChange(block.id, e.target.value)}
                          onFocus={() => {
                            setFocusedBlockId(block.id);
                            setActiveBlockIdForFormat(block.id);
                          }}
                          onBlur={() => setTimeout(() => setFocusedBlockId(null), 150)}
                          className="text-md font-bold text-white bg-transparent border-b border-white/10 focus:border-indigo-500 focus:outline-none w-full pb-1"
                          placeholder="Heading 3"
                        />
                      ) : (
                        <h3
                          onClick={() => setFocusedBlockId(block.id)}
                          className="text-md font-bold text-white cursor-pointer hover:bg-white/[0.02] p-1 rounded min-h-[1.6rem]"
                        >
                          {block.content || <span className="text-white/20 italic">Heading 3</span>}
                        </h3>
                      )
                    )}

                    {block.type === 'text' && (
                      isFocused ? (
                        <textarea
                          id={`block-input-${block.id}`}
                          value={block.content}
                          onChange={(e) => handleBlockContentChange(block.id, e.target.value)}
                          onFocus={() => {
                            setFocusedBlockId(block.id);
                            setActiveBlockIdForFormat(block.id);
                          }}
                          onBlur={() => setTimeout(() => setFocusedBlockId(null), 150)}
                          className="w-full bg-transparent text-white/95 text-xs leading-relaxed focus:outline-none border-l border-white/10 pl-2.5 py-1 focus:border-indigo-500/60 resize-none overflow-hidden min-h-[3rem]"
                          placeholder="Type raw Markdown..."
                          style={{ height: 'auto' }}
                          ref={el => {
                            if (el) {
                              el.style.height = 'auto';
                              el.style.height = el.scrollHeight + 'px';
                            }
                          }}
                        />
                      ) : (
                        <div
                          onClick={() => setFocusedBlockId(block.id)}
                          className="text-white/80 text-xs leading-relaxed cursor-pointer hover:bg-white/[0.01] p-1 rounded min-h-[1.2rem] whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: parseMarkdown(block.content) || '<span class="text-white/20 italic">Empty text block. Click to edit...</span>' }}
                        />
                      )
                    )}

                    {block.type === 'todo' && (
                      <div className="flex items-start gap-2.5 py-0.5">
                        <input
                          type="checkbox"
                          checked={block.checked || false}
                          onChange={(e) => handleBlockCheckedChange(block.id, e.target.checked)}
                          className="mt-1 w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <input
                          id={`block-input-${block.id}`}
                          type="text"
                          value={block.content}
                          onChange={(e) => handleBlockContentChange(block.id, e.target.value)}
                          onFocus={() => {
                            setFocusedBlockId(block.id);
                            setActiveBlockIdForFormat(block.id);
                          }}
                          className={`flex-1 bg-transparent text-xs text-white/95 focus:outline-none border-b border-transparent focus:border-indigo-500/30 pb-0.5 ${block.checked ? 'line-through text-white/45' : ''}`}
                          placeholder="To-do item..."
                        />
                      </div>
                    )}

                    {block.type === 'table' && block.tableData && (
                      <div className="py-2 overflow-x-auto select-none">
                        <div className="inline-block min-w-full align-middle">
                          <table className="min-w-full border-collapse border border-white/10 rounded-lg overflow-hidden bg-white/[0.01]">
                            <tbody>
                              {block.tableData.map((row, rIdx) => (
                                <tr key={rIdx} className={rIdx === 0 ? 'bg-white/[0.03] border-b border-white/10' : 'border-b border-white/5'}>
                                  {row.map((cell, cIdx) => (
                                    <td key={cIdx} className="border-r border-white/5 p-1 min-w-[120px]">
                                      <input
                                        type="text"
                                        value={cell}
                                        onChange={(e) => handleTableDataChange(block.id, rIdx, cIdx, e.target.value)}
                                        className={`bg-transparent text-[11px] text-white focus:outline-none w-full px-2 py-1 ${rIdx === 0 ? 'font-bold text-white/90' : 'text-white/70'}`}
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="flex gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => addTableRow(block.id)}
                              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] text-white/50 hover:text-white rounded cursor-pointer transition-colors"
                            >
                              + Add Row
                            </button>
                            <button
                              type="button"
                              onClick={() => addTableColumn(block.id)}
                              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] text-white/50 hover:text-white rounded cursor-pointer transition-colors"
                            >
                              + Add Column
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Actions Bar on hover */}
                  <div className="absolute right-0 top-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-lg border border-white/10 z-10">
                    <button type="button" onClick={() => moveBlock(block.id, 'up')} className="p-0.5 text-white/40 hover:text-white rounded transition-colors" title="Move Up"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => moveBlock(block.id, 'down')} className="p-0.5 text-white/40 hover:text-white rounded transition-colors" title="Move Down"><ChevronDown className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => deleteBlock(block.id)} className="p-0.5 text-white/40 hover:text-rose-400 rounded transition-colors" title="Delete Block"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>

                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 w-full overflow-hidden">

      {/* Landing page header controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <FileText className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white tracking-wide uppercase">Workspace Notes</h3>
            <p className="text-[10px] text-white/40">Notion-style block notes isolated to this canvas</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-1 max-w-md md:justify-end">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes or content..."
            className="w-full md:w-56 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
          <button
            type="button"
            onClick={() => addNote('New Note')}
            className="px-4 py-2 bg-indigo-600/35 hover:bg-indigo-600/50 border border-indigo-500/30 rounded-xl text-xs font-bold text-indigo-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 shadow-lg shadow-indigo-950/20"
          >
            <Plus className="w-4 h-4" />
            <span>Create Note</span>
          </button>
        </div>
      </div>

      {/* Landing cards list */}
      <div className="flex-1 overflow-y-auto pr-1 pb-10">
        {filteredNotes.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-2xl bg-white/[0.005]">
            <FileText className="w-8 h-8 text-white/10 mb-2" />
            <p className="text-xs text-white/30 font-semibold uppercase tracking-wider">No Notes Found</p>
            <button
              type="button"
              onClick={() => addNote('New Note')}
              className="mt-3 text-[11px] font-bold text-indigo-400 hover:underline cursor-pointer"
            >
              Deploy your first note
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => setActiveNoteId(note.id)}
                className="group relative bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 hover:border-indigo-500/30 rounded-2xl p-4 aspect-square flex flex-col justify-between transition-all duration-200 cursor-pointer shadow-lg hover:shadow-[0_8px_30px_rgb(0,0,0,0.15)] hover:scale-[1.01]"
              >

                {/* Note title and date */}
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors truncate leading-snug">
                      {note.title || 'Untitled Note'}
                    </h4>

                    {/* Delete Icon on Hover */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNote(note.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 text-white/30 hover:text-rose-400 rounded-md transition-all cursor-pointer shrink-0"
                      title="Delete Note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Apple Notes style content preview snippet */}
                  <p className="text-[10px] text-white/45 font-medium line-clamp-3 leading-relaxed whitespace-pre-wrap">
                    {getNotePreview(note)}
                  </p>
                </div>

                {/* Footer date */}
                <div className="border-t border-white/5 pt-2.5 mt-auto flex items-center justify-between text-[9px] text-white/30 font-semibold">
                  <span>
                    {note.updatedAt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400">
                    Open Note →
                  </span>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  file?: {
    name: string;
    size: string;
    type: string;
  };
}
interface ParsedMessage {
  thinkingContent: string | null;
  mainContent: string;
}

const parseMessageText = (text: string): ParsedMessage => {
  const thinkingMatch = text.match(/^:::thinking\n([\s\S]*?)\n:::\n\n?([\s\S]*)$/);
  if (thinkingMatch) {
    return {
      thinkingContent: thinkingMatch[1],
      mainContent: thinkingMatch[2],
    };
  }
  return {
    thinkingContent: null,
    mainContent: text,
  };
};

function ThinkingBlock({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(true);
  const steps = content
    .split('\n')
    .map(line => line.replace(/^>\s*/, '').trim())
    .filter(Boolean);

  return (
    <div className="mb-3 rounded-xl border border-purple-500/10 bg-purple-500/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-purple-300 hover:text-purple-200 bg-purple-500/[0.04] hover:bg-purple-500/[0.08] transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <BrainIcon size={12} className="text-purple-400 animate-pulse" />
          <span>Thinking Process</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5 text-purple-400/70" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-purple-400/70" />
        )}
      </button>
      {isOpen && (
        <div className="p-3 text-[11px] font-mono text-purple-200/60 space-y-1.5 border-t border-purple-500/10 bg-black/20">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-purple-400 select-none">›</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



function WorkspaceChatCopilot() {
  const {
    goalProgress,
    cashBalance,
    projectedRunway,
    totalFTE,
    confidenceScore,
    gtmChannels,
    chatMessages: messages,
    setChatMessages: setMessages,
    isVoiceChat,
    setIsVoiceChat,
    workspaces,
    activeWorkspaceId,
    addNote,
    addUploadedFile,
  } = useFounderWorkspace();

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; text: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

  const showToastMessage = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 3000);
  };

  const handleLikeMessage = (_msgId: string) => {
    showToastMessage("Thank you for the feedback!");
  };

  const handleDislikeMessage = (_msgId: string) => {
    showToastMessage("Feedback submitted. We will improve.");
  };

  const handleCopyMessage = (text: string) => {
    const cleanText = text.replace(/^:::thinking\n[\s\S]*?\n:::\n\n?/, '');
    navigator.clipboard.writeText(cleanText);
    showToastMessage("Copied to clipboard!");
  };

  const handleRegenerateMessage = (msgId: string) => {
    showToastMessage("Regenerating AI response...");
    setTimeout(() => {
      setMessages(prev => prev.map((m) => m.id === msgId ? {
        ...m,
        text: m.text.includes("thinking")
          ? m.text
          : `:::thinking\n> Regenerating response...\n> Optimizing metrics...\n:::\n\n${m.text}`
      } : m));
    }, 500);
  };

  const handleSaveMessageToNotes = (msgId: string) => {
    const assistantMsgIndex = messages.findIndex(m => m.id === msgId);
    if (assistantMsgIndex === -1) return;

    const assistantMsg = messages[assistantMsgIndex];
    let userPrompt = "";
    for (let i = assistantMsgIndex - 1; i >= 0; i--) {
      if (messages[i].sender === 'user') {
        userPrompt = messages[i].text;
        break;
      }
    }

    const cleanText = assistantMsg.text.replace(/^:::thinking\n[\s\S]*?\n:::\n\n?/, '');
    const title = cleanText.substring(0, 30).replace(/[#*`]/g, '').trim() || "AI Copilot Response";

    const blocks: NoteBlock[] = [
      { id: `b_h1_${Date.now()}`, type: 'h1', content: title },
      { id: `b_h3_${Date.now()}`, type: 'h3', content: `Prompt: ${userPrompt || "Direct Simulation"}` },
      { id: `b_text_${Date.now()}`, type: 'text', content: cleanText }
    ];

    addNote(title, blocks);
    showToastMessage("Saved to Notes!");
  };

  const handleSaveSelectionToNotes = (text: string) => {
    const title = text.substring(0, 30).trim() || "Saved Snippet";
    const blocks: NoteBlock[] = [
      { id: `b_h1_${Date.now()}`, type: 'h1', content: title },
      { id: `b_text_${Date.now()}`, type: 'text', content: text }
    ];
    addNote(title, blocks);
    showToastMessage("Saved to Notes!");
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection) return;
    const selectedText = selection.toString().trim();
    if (selectedText.length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      const container = document.querySelector('.ws-chat-messages-container');
      if (container && container.contains(range.commonAncestorContainer)) {
        setTooltipPos({
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
          text: selectedText
        });
        return;
      }
    }
    setTooltipPos(null);
  };

  const handleChatContainerMouseUp = () => {
    setTimeout(handleTextSelection, 10);
  };

  const handleChatScroll = () => {
    setTooltipPos(null);
  };

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [activeView, setActiveView] = useState<'upload' | 'nodes'>('upload');
  const [showNodesDrawer, setShowNodesDrawer] = useState(false);

  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [voiceText, setVoiceText] = useState('Tap the microphone to start talking');
  const voiceIntensityRef = useRef(0);
  const voiceDriverId = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (voiceDriverId.current) {
        cancelAnimationFrame(voiceDriverId.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isVoiceChat) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (voiceDriverId.current) {
        cancelAnimationFrame(voiceDriverId.current);
        voiceDriverId.current = null;
      }
      voiceIntensityRef.current = 0;
      setVoiceState('idle');
      setVoiceText('Tap the microphone to start talking');
    }
  }, [isVoiceChat]);

  const generateVoiceResponse = () => {
    const responses = [
      `Our projected cash runway is currently tracking at ${projectedRunway} months, with cash reserves of approximately ${(cashBalance).toLocaleString()} dollars.`,
      `We have completed ${goalProgress} percent of our current O K R roster. Total headcount is ${totalFTE} operators.`,
      `The workspace confidence score is ${confidenceScore} percent, with active blockers and risks under mitigation.`,
      `I am ready to simulate new objectives or payroll expansion. You can switch back to text mode to input custom queries.`,
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  };

  const startVoiceInteraction = () => {
    if (voiceState !== 'idle') {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (voiceDriverId.current) {
        cancelAnimationFrame(voiceDriverId.current);
        voiceDriverId.current = null;
      }
      voiceIntensityRef.current = 0;
      setVoiceState('idle');
      setVoiceText('Tap the microphone to start talking');
      return;
    }

    setVoiceState('listening');
    setVoiceText('Listening... (Reacting to your speech)');

    if (voiceDriverId.current) cancelAnimationFrame(voiceDriverId.current);
    const listenStartTime = performance.now();

    const driveListening = () => {
      const elapsed = (performance.now() - listenStartTime) / 1000;
      if (elapsed > 3.5) {
        setVoiceState('thinking');
        setVoiceText('Analyzing audio query...');
        const thinkStartTime = performance.now();

        const driveThinking = () => {
          const thinkElapsed = (performance.now() - thinkStartTime) / 1000;
          if (thinkElapsed > 1.5) {
            setVoiceState('speaking');
            const responseText = generateVoiceResponse();
            setVoiceText(responseText);

            if ('speechSynthesis' in window) {
              window.speechSynthesis.cancel();
              const utter = new SpeechSynthesisUtterance(responseText);
              utter.rate = 0.92;
              utter.pitch = 1.05;

              const pickVoice = () => {
                const voices = window.speechSynthesis.getVoices();
                return (
                  voices.find(v => /Samantha|Daniel|Google UK|Google US|Aaron/i.test(v.name)) ||
                  voices.find(v => v.lang.startsWith('en')) ||
                  null
                );
              };
              const voice = pickVoice();
              if (voice) utter.voice = voice;

              const speakStartTime = performance.now();
              const driveSpeaking = () => {
                const speakElapsed = (performance.now() - speakStartTime) / 1000;
                voiceIntensityRef.current = 0.15 + 0.65 * Math.abs(Math.sin(speakElapsed * 9.5)) * (0.5 + 0.5 * Math.sin(speakElapsed * 3.3 + 0.8));
                voiceDriverId.current = requestAnimationFrame(driveSpeaking);
              };
              voiceDriverId.current = requestAnimationFrame(driveSpeaking);

              utter.onend = utter.onerror = () => {
                if (voiceDriverId.current) cancelAnimationFrame(voiceDriverId.current);
                voiceDriverId.current = null;
                voiceIntensityRef.current = 0;
                setVoiceState('idle');
                setVoiceText('Tap to speak again');
              };

              window.speechSynthesis.speak(utter);
            } else {
              const speakStartTime = performance.now();
              const driveSpeakingFallback = () => {
                const speakElapsed = (performance.now() - speakStartTime) / 1000;
                if (speakElapsed > 4.5) {
                  voiceIntensityRef.current = 0;
                  setVoiceState('idle');
                  setVoiceText('Tap to speak again');
                  return;
                }
                voiceIntensityRef.current = 0.15 + 0.65 * Math.abs(Math.sin(speakElapsed * 9.5)) * (0.5 + 0.5 * Math.sin(speakElapsed * 3.3 + 0.8));
                voiceDriverId.current = requestAnimationFrame(driveSpeakingFallback);
              };
              voiceDriverId.current = requestAnimationFrame(driveSpeakingFallback);
            }
            return;
          }
          voiceIntensityRef.current = 0.05 + 0.04 * Math.sin(thinkElapsed * 5.0);
          voiceDriverId.current = requestAnimationFrame(driveThinking);
        };
        voiceDriverId.current = requestAnimationFrame(driveThinking);
        return;
      }

      voiceIntensityRef.current = 0.2 + 0.55 * Math.abs(Math.sin(elapsed * 7.5)) * (0.6 + 0.4 * Math.cos(elapsed * 2.8));
      voiceDriverId.current = requestAnimationFrame(driveListening);
    };

    voiceDriverId.current = requestAnimationFrame(driveListening);
  };

  const getNodeMetric = (id: string) => {
    switch (id) {
      case 'company_hub':
        return { value: 'Series A', label: 'Active Plan' };
      case 'metrics':
        return { value: `${projectedRunway} Mo`, label: 'Cash Runway' };
      case 'departments':
        return { value: `${totalFTE} FTEs`, label: 'Operator Payroll' };
      case 'goals':
        return { value: `${goalProgress}%`, label: 'OKRs Complete' };
      case 'risks':
        return { value: `${confidenceScore}%`, label: 'Confidence Index' };
      case 'gtm':
        return { value: `${gtmChannels.length} Channels`, label: 'GTM Strategy' };
      default:
        return { value: '-', label: 'Metric' };
    }
  };

  const handleNodeQuickQuery = (node: WorkspaceCanvasCard) => {
    const queryMap: Record<string, string> = {
      company_hub: 'What is our OKRs milestone and payroll headcount?',
      metrics: 'How does our cash runway look?',
      departments: 'Show our payroll departments and operator headcount',
      goals: 'List our active OKRs and goals',
      risks: 'What active blockers and risks are registered?',
      gtm: 'What is our GTM and channels wedge strategy?',
    };
    const queryText = queryMap[node.id] || `Tell me about the ${node.title} node`;
    handleSend(queryText);
  };

  const handleFileUpload = (file: File) => {
    setStagedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const triggerScroll = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSend = (text: string) => {
    if (!text.trim() && !stagedFile) return;

    const sizeStr = stagedFile
      ? stagedFile.size > 1024 * 1024
        ? `${(stagedFile.size / (1024 * 1024)).toFixed(1)} MB`
        : `${(stagedFile.size / 1024).toFixed(0)} KB`
      : '';

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: text.trim() || `Uploaded file: ${stagedFile?.name}`,
      timestamp: new Date(),
      file: stagedFile ? {
        name: stagedFile.name,
        size: sizeStr,
        type: stagedFile.type,
      } : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    const fileToUpload = stagedFile;
    setStagedFile(null);
    triggerScroll();

    // Resolve directory folder name (from first user message of the chat)
    const firstUserMsg = messages.find(m => m.sender === 'user');
    const rawFolderTitle = firstUserMsg
      ? firstUserMsg.text
      : (text.trim() || `Uploads: ${fileToUpload?.name || 'Session'}`);

    // Clean and truncate folder name to look premium
    const folderName = rawFolderTitle.length > 40
      ? rawFolderTitle.slice(0, 37) + '...'
      : rawFolderTitle;

    if (fileToUpload) {
      const lowerName = fileToUpload.name.toLowerCase();
      const mime = fileToUpload.type.toLowerCase();
      let fileType: 'image' | 'pdf' | 'excel' | 'text' | 'other' = 'other';
      if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(lowerName)) {
        fileType = 'image';
      } else if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
        fileType = 'pdf';
      } else if (mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('csv') || /\.(xlsx?|csv|ods)$/.test(lowerName)) {
        fileType = 'excel';
      } else if (mime.startsWith('text/') || /\.(txt|md|html|json|js|ts|tsx|jsx|css)$/.test(lowerName)) {
        fileType = 'text';
      }

      const saveFile = (contentStr: string) => {
        addUploadedFile({
          name: fileToUpload.name,
          size: sizeStr,
          type: fileType,
          chatTitle: folderName,
          content: contentStr
        });
      };

      if (fileType === 'text') {
        const reader = new FileReader();
        reader.onload = (e) => {
          saveFile(e.target?.result as string || 'Empty text file');
        };
        reader.onerror = () => {
          saveFile('Error reading file contents');
        };
        reader.readAsText(fileToUpload);
      } else if (fileType === 'image') {
        const reader = new FileReader();
        reader.onload = (e) => {
          saveFile(e.target?.result as string || '');
        };
        reader.onerror = () => {
          saveFile('https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=1000');
        };
        reader.readAsDataURL(fileToUpload);
      } else if (fileType === 'pdf' || fileType === 'excel') {
        saveFile('File content parsing is not implemented yet — this file was saved but its contents were not extracted or analysed.');
      } else {
        saveFile('Binary or unreadable file format');
      }
    }

    if (fileToUpload) {
      // File uploads aren't sent to the inventory chat — no channel to receive
      // file content, and parsing isn't implemented. Honest local confirmation only.
      setTimeout(() => {
        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          sender: 'assistant',
          text: `I've saved your file **${fileToUpload.name}** (${sizeStr}) to this chat's Files tab. I can't automatically read file contents yet, so I can't analyse what's inside it — you can open it from the Files tab.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMsg]);
        triggerScroll();
      }, 400);
      return;
    }

    // Every message goes to the real backend — no client-side topic pre-filtering.
    // Full history is resent each turn so the model has session context (session-only,
    // same lifetime as `messages` — no server-side persistence).
    (async () => {
      const history = [...messages, userMsg].map((m) => ({
        sender: m.sender,
        text: m.sender === 'assistant' ? parseMessageText(m.text).mainContent : m.text,
      }));

      let replyText: string;
      let toolTrace: string[] = [];
      try {
        const result = await api.post<{
          reply: string;
          toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
        }>('/api/erpnext/chat', { messages: history });
        replyText = result.reply;
        toolTrace = (result.toolCalls ?? []).map(
          (call) => `Called WorkOS: ${call.name}(${JSON.stringify(call.args)})`,
        );
      } catch (err) {
        // api.ts throws `${status}: ${rawResponseText}` — the backend sends a real,
        // specific `message` field for known error cases (e.g. still provisioning);
        // prefer that over a generic wrapper when present.
        const backendMessage = (() => {
          if (!(err instanceof Error)) return null;
          const bodyText = err.message.replace(/^\d+:\s*/, '');
          try {
            const parsed = JSON.parse(bodyText) as { message?: string };
            return typeof parsed.message === 'string' ? parsed.message : null;
          } catch {
            return null;
          }
        })();
        replyText = backendMessage
          ?? `I couldn't reach the inventory system just now (${err instanceof Error ? err.message : 'unknown error'}). Try again in a moment.`;
      }

      const reasoningPrefix = toolTrace.length
        ? `:::thinking\n${toolTrace.map((step) => `> ${step}`).join('\n')}\n:::\n\n`
        : '';

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender: 'assistant',
        text: reasoningPrefix + replyText,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      triggerScroll();
    })();
  };

  const suggestedChips = [
    { text: 'Check stock levels', prompt: 'How much stock of WIDGET-A do we have?' },
    { text: 'Low stock check', prompt: 'What items are running low on stock?' },
    { text: 'Open opportunities', prompt: 'What open sales opportunities do we have?' },
    { text: 'Our leads', prompt: 'List our current leads' },
  ];

  return (
    <div
      onDragOver={isVoiceChat ? undefined : handleDragOver}
      onDragLeave={isVoiceChat ? undefined : handleDragLeave}
      onDrop={isVoiceChat ? undefined : handleDrop}
      className="flex flex-col h-full min-h-0 bg-[#151518]/75 rounded-2xl border border-white/5 overflow-hidden relative"
    >
      {/* Premium Header with Mode Toggle */}
      <div className="px-5 py-3 border-b border-white/5 bg-white/[0.01] flex items-center justify-between shrink-0 z-20 relative">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-[11px] font-bold text-white/80 tracking-wider uppercase">WorkOS Copilot</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Floating Pill selector for Saved Nodes when conversation is active */}
          {messages.length > 1 && !isVoiceChat && (
            <button
              type="button"
              onClick={() => setShowNodesDrawer(!showNodesDrawer)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#121215]/90 hover:bg-[#1a1a1f] border border-white/10 hover:border-white/20 text-white/70 hover:text-white rounded-full text-[9px] font-semibold transition-all shadow-lg backdrop-blur-md cursor-pointer select-none"
            >
              <Database className="w-2.5 h-2.5 text-indigo-400" />
              <span>Saved Nodes</span>
              {showNodesDrawer
                ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                : <ChevronDown className="w-2.5 h-2.5 opacity-50" />
              }
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsVoiceChat(!isVoiceChat)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer border ${isVoiceChat
              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 hover:text-white'
              : 'bg-white/[0.03] border-white/10 hover:border-white/20 text-white/70 hover:text-white'
              }`}
          >
            {isVoiceChat ? (
              <>
                <Send className="w-3 h-3 text-indigo-400" />
                <span>Text Mode</span>
              </>
            ) : (
              <>
                <Mic className="w-3 h-3 text-rose-400 animate-pulse" />
                <span>Voice Mode</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Saved Nodes Drawer — slides down from below header when showNodesDrawer is true */}
      <div
        className="absolute left-0 right-0 top-[45px] z-30 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden"
        style={{
          maxHeight: showNodesDrawer && messages.length > 1 && !isVoiceChat ? '260px' : '0px',
          opacity: showNodesDrawer && messages.length > 1 && !isVoiceChat ? 1 : 0,
          pointerEvents: showNodesDrawer && messages.length > 1 && !isVoiceChat ? 'auto' : 'none',
        }}
      >
        <div className="bg-[#111114]/96 backdrop-blur-xl border-b border-white/5 px-4 pt-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px] font-bold text-white/80 tracking-wide uppercase">Workspace Nodes</span>
              <span className="text-[9px] text-white/30 font-mono">{WORKSPACE_CANVAS_CARDS.length} synced</span>
            </div>
            <button
              type="button"
              onClick={() => setShowNodesDrawer(false)}
              className="p-1 rounded-md text-white/35 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-[160px] scrollbar-thin pr-0.5">
            {WORKSPACE_CANVAS_CARDS.map(node => {
              const metric = getNodeMetric(node.id);
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    handleNodeQuickQuery(node);
                    setShowNodesDrawer(false);
                  }}
                  className="flex items-center gap-2 p-2 rounded-lg border border-white/5 bg-white/[0.02] hover:border-indigo-500/25 hover:bg-indigo-500/[0.04] transition-all cursor-pointer text-left group"
                >
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 border"
                    style={{ background: `${node.accent}12`, borderColor: `${node.accent}24` }}
                  >
                    <CardIcon kind={node.icon} color={node.accent} id={node.id} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold text-white/80 group-hover:text-indigo-300 transition-colors truncate leading-tight">
                      {node.id === 'company_hub' ? activeWorkspace.name : node.title}
                    </p>
                    <p className="text-[9px] text-white/35 truncate leading-tight">{metric.value}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 relative">
        {/* Voice Chat View (Always mounted to prevent glitched WebGL re-initializations) */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center p-6 select-none bg-[#09090b]/40 transition-all duration-300 ${isVoiceChat ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
            }`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/5 via-transparent to-transparent pointer-events-none" />

          <div className="w-64 h-64 relative flex items-center justify-center">
            <Orb
              hoverIntensity={0}
              rotateOnHover={false}
              hue={0}
              forceHoverState={false}
              backgroundColor="#0d0d0f"
              intensityRef={voiceIntensityRef}
            />
          </div>

          <div className="mt-8 flex flex-col items-center gap-2 z-10 max-w-sm">
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border transition-colors ${voiceState === 'listening' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20 animate-pulse' :
              voiceState === 'thinking' ? 'text-purple-400 bg-purple-500/10 border-purple-500/20 animate-pulse' :
                voiceState === 'speaking' ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' :
                  'text-white/40 bg-white/5 border-white/10'
              }`}>
              {voiceState === 'listening' ? 'Listening' :
                voiceState === 'thinking' ? 'Analyzing' :
                  voiceState === 'speaking' ? 'Speaking' :
                    'Ready'}
            </span>
            <p className="text-xs text-white/90 font-medium text-center h-12 leading-relaxed px-4 transition-all duration-300">
              {voiceText}
            </p>
          </div>

          {/* Action Button */}
          <div className="mt-6 z-10">
            <button
              type="button"
              onClick={startVoiceInteraction}
              className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all duration-300 cursor-pointer shadow-lg shadow-black/40 ${voiceState === 'listening'
                ? 'bg-rose-500 text-white border-rose-400 hover:bg-rose-600 scale-105 animate-pulse'
                : voiceState === 'speaking'
                  ? 'bg-indigo-500 text-white border-indigo-400 hover:bg-indigo-600'
                  : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10 hover:text-white hover:scale-105'
                }`}
              title={voiceState === 'idle' ? 'Start voice query' : 'Stop voice query'}
            >
              {voiceState === 'listening' ? (
                <Mic className="w-5 h-5 animate-pulse" />
              ) : voiceState === 'speaking' ? (
                <Volume2 className="w-5 h-5 animate-bounce" />
              ) : (
                <Mic className="w-5 h-5 text-white/60" />
              )}
            </button>
          </div>
        </div>

        {/* Original Text Chat View (Always mounted to keep scroll position & state) */}
        <div
          className={`absolute inset-0 flex flex-col min-h-0 transition-all duration-300 ${isVoiceChat ? 'opacity-0 z-0 pointer-events-none' : 'opacity-100 z-10 pointer-events-auto'
            }`}
        >
          {/* Messages list */}
          <div
            onMouseUp={handleChatContainerMouseUp}
            onKeyUp={handleChatContainerMouseUp}
            onScroll={handleChatScroll}
            className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0 ws-chat-messages-container"
          >
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`group flex gap-3 max-w-[85%] ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                  }`}
              >
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${msg.sender === 'user'
                    ? 'bg-indigo-500/20 border-indigo-400/30 text-indigo-300'
                    : 'bg-purple-500/20 border-purple-400/30 text-purple-300'
                    }`}
                >
                  {msg.sender === 'user' ? (
                    <User className="w-3.5 h-3.5" />
                  ) : (
                    <BrainIcon size={14} />
                  )}
                </div>

                {/* Bubble Container */}
                <div className="flex flex-col min-w-0">
                  <div
                    className={`p-3.5 rounded-2xl text-[13px] leading-relaxed border backdrop-blur-md ${msg.sender === 'user'
                      ? 'bg-indigo-500/10 border-indigo-500/20 text-white rounded-tr-none'
                      : 'bg-white/[0.03] border-white/5 text-white/90 rounded-tl-none'
                      }`}
                  >
                    {msg.file ? (
                      <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/10 max-w-[280px]">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-indigo-500/20 text-indigo-300 shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">{msg.file.name}</p>
                          <p className="text-[10px] text-white/40">{msg.file.size}</p>
                        </div>
                      </div>
                    ) : (
                      (() => {
                        const { thinkingContent, mainContent } = parseMessageText(msg.text);
                        return (
                          <>
                            {thinkingContent && <ThinkingBlock content={thinkingContent} />}
                            {mainContent.split('\n').map((line, idx) => {
                              if (line.startsWith('### ')) {
                                return <h3 key={idx} className="text-sm font-bold text-white mb-2 mt-1 first:mt-0">{line.replace('### ', '')}</h3>;
                              }
                              if (line.startsWith('- ') || line.startsWith(' - ')) {
                                let cleaned = line.replace(/^(\s*-\s*)/, '');
                                let isChecked = false;
                                let isUnchecked = false;
                                if (cleaned.startsWith('[x] ')) {
                                  cleaned = cleaned.replace('[x] ', '');
                                  isChecked = true;
                                } else if (cleaned.startsWith('[ ] ')) {
                                  cleaned = cleaned.replace('[ ] ', '');
                                  isUnchecked = true;
                                }

                                const parts = cleaned.split('**');
                                const renderedContent = parts.map((part, pIdx) =>
                                  pIdx % 2 === 1 ? <strong key={pIdx} className="text-white font-semibold">{part}</strong> : part
                                );

                                return (
                                  <div key={idx} className="flex items-start gap-2 ml-1 text-white/80 my-0.5">
                                    {isChecked && <Check className="w-3 h-3 text-emerald-400 mt-1 shrink-0" />}
                                    {isUnchecked && <span className="w-3 h-3 border border-white/20 rounded-sm mt-1 shrink-0" />}
                                    {!isChecked && !isUnchecked && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />}
                                    <span>{renderedContent}</span>
                                  </div>
                                );
                              }

                              const parts = line.split('**');
                              const renderedLine = parts.map((part, pIdx) =>
                                pIdx % 2 === 1 ? <strong key={pIdx} className="text-white font-semibold">{part}</strong> : part
                              );

                              return <p key={idx} className="mb-1 last:mb-0">{renderedLine}</p>;
                            })}
                          </>
                        );
                      })()
                    )}
                  </div>

                  {msg.sender === 'assistant' && (
                    <div className="flex items-center gap-3 mt-1.5 ml-1 text-white/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        type="button"
                        onClick={() => handleLikeMessage(msg.id)}
                        className="p-1 hover:bg-white/5 hover:text-white/80 rounded transition-colors cursor-pointer"
                        title="Good reply"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDislikeMessage(msg.id)}
                        className="p-1 hover:bg-white/5 hover:text-white/80 rounded transition-colors cursor-pointer"
                        title="Bad reply"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.text)}
                        className="p-1 hover:bg-white/5 hover:text-white/80 rounded transition-colors cursor-pointer"
                        title="Copy message"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegenerateMessage(msg.id)}
                        className="p-1 hover:bg-white/5 hover:text-white/80 rounded transition-colors cursor-pointer"
                        title="Regenerate response"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveMessageToNotes(msg.id)}
                        className="p-1 hover:bg-white/5 hover:text-indigo-400 rounded transition-colors cursor-pointer text-indigo-400"
                        title="Save to Notes"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {messages.length === 1 && activeView === 'upload' && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 hover:border-indigo-500/30 hover:bg-indigo-500/[0.02] rounded-2xl p-8 h-[65%] mt-6 transition-all cursor-pointer group text-center select-none"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white/[0.03] group-hover:bg-indigo-500/10 group-hover:text-indigo-400 text-white/40 border border-white/5 transition-all mb-3">
                  <UploadCloud className="w-6 h-6 animate-pulse" />
                </div>
                <p className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">
                  Drag & drop files here, or click to upload
                </p>
                <p className="text-[10px] text-white/45 mt-1">
                  Supports CSV, PDF, JSON, XLS, XLSX, TXT up to 10MB
                </p>
              </div>
            )}

            {messages.length === 1 && activeView === 'nodes' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4 h-[65%] mt-6 overflow-y-auto min-h-0 scrollbar-thin">
                {WORKSPACE_CANVAS_CARDS.map(node => {
                  const metric = getNodeMetric(node.id);
                  return (
                    <div
                      key={node.id}
                      onClick={() => handleNodeQuickQuery(node)}
                      className="p-3.5 rounded-xl border border-white/5 bg-white/[0.02] hover:border-indigo-500/20 hover:bg-indigo-500/[0.02] transition-all cursor-pointer flex flex-col justify-between group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center border"
                            style={{
                              background: `${node.accent}12`,
                              borderColor: `${node.accent}24`,
                            }}
                          >
                            <CardIcon kind={node.icon} color={node.accent} id={node.id} />
                          </div>
                          <span className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors">
                            {node.id === 'company_hub' ? activeWorkspace.name : node.title}
                          </span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-white/40 font-mono">NODE_OK</span>
                      </div>
                      <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-sm font-black text-white/90">{metric.value}</span>
                        <span className="text-[10px] text-white/40">{metric.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {messages.length === 1 && (
              <div className="flex justify-center items-center gap-2 mt-4 select-none">
                <button
                  type="button"
                  onClick={() => setActiveView('upload')}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${activeView === 'upload'
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 shadow-lg shadow-indigo-500/5'
                    : 'bg-white/[0.02] border-white/5 text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
                    }`}
                >
                  File Upload
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('nodes')}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${activeView === 'nodes'
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 shadow-lg shadow-indigo-500/5'
                    : 'bg-white/[0.02] border-white/5 text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
                    }`}
                >
                  Saved Nodes
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested prompt chips (visible only if dialogue is starting or quiet) */}
          {messages.length === 1 && (
            <div className="px-6 py-2 flex flex-wrap gap-2 justify-center">
              {suggestedChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(chip.prompt)}
                  className="text-[11px] font-medium text-indigo-200/70 hover:text-white px-3 py-1.5 rounded-lg bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/10 hover:border-indigo-500/20 transition-all cursor-pointer"
                >
                  {chip.text}
                </button>
              ))}
            </div>
          )}

          {/* Input container */}
          <div className="p-4 border-t border-white/5 bg-[#0d0d0f]/90 flex flex-col gap-3">
            {/* Staged File Preview */}
            {stagedFile && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.04] border border-white/10 max-w-[280px] animate-slide-up-fade">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/20 text-indigo-300 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">{stagedFile.name}</p>
                    <p className="text-[10px] text-white/40">
                      {stagedFile.size > 1024 * 1024
                        ? `${(stagedFile.size / (1024 * 1024)).toFixed(1)} MB`
                        : `${(stagedFile.size / 1024).toFixed(0)} KB`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStagedFile(null)}
                  className="p-1 text-white/40 hover:text-white rounded-md hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Input Box Card */}
            <div className="flex gap-2 items-center w-full">
              {/* Main input wrapper */}
              <div className="relative flex-1 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] focus-within:border-indigo-500/40 focus-within:bg-white/[0.03] transition-all px-3 py-1.5 min-w-0">
                {/* <Sparkles className="w-4 h-4 text-indigo-400/60 pointer-events-none shrink-0" /> */}

                <input
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSend(inputValue);
                  }}
                  placeholder="Type a message to analyze metrics or run simulations..."
                  className="flex-1 bg-transparent text-xs text-white placeholder-white/35 focus:outline-none min-w-0"
                />


              </div>

              {/* Attach Button (outside) */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 bg-white/[0.03] border border-white/10 hover:bg-white/5 hover:border-white/20 text-white/60 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
                title="Attach file"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              {/* Send Button */}
              <button
                type="button"
                onClick={() => handleSend(inputValue)}
                className="p-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:text-white rounded-xl transition-colors shrink-0 cursor-pointer flex items-center justify-center"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {isDragging && !isVoiceChat && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#070914]/85 border-2 border-indigo-500/40 rounded-2xl backdrop-blur-md animate-slide-up-fade pointer-events-none">
          <div className="scale-105 transition-transform duration-300 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4 animate-bounce">
              <UploadCloud className="w-8 h-8" />
            </div>
            <p className="text-sm font-bold text-white">Drop your files here</p>
            <p className="text-xs text-white/50 mt-1">Ready to attach to Copilot chat</p>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".csv,.pdf,.json,.xls,.xlsx,.txt"
      />

      {/* Floating Selected Text Tooltip */}
      {tooltipPos && createPortal(
        <div
          className="fixed z-[9999] bg-[#121215]/95 border border-white/10 hover:border-white/20 text-white rounded-full px-2.5 py-1 text-[9px] font-bold shadow-2xl flex items-center gap-1 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none cursor-pointer"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
          onMouseDown={(e) => e.preventDefault()} // prevent loss of selection
          onClick={(e) => {
            e.stopPropagation();
            handleSaveSelectionToNotes(tooltipPos.text);
            window.getSelection()?.removeAllRanges();
            setTooltipPos(null);
          }}
        >
          <Plus className="w-3 h-3 text-indigo-400" />
          <span>Save</span>
        </div>,
        document.body
      )}

      {/* Floating Toast Notification */}
      {toast.visible && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#121215]/90 border border-emerald-500/30 text-emerald-300 rounded-xl px-4 py-2.5 text-xs font-semibold shadow-2xl flex items-center gap-2 backdrop-blur-md animate-in slide-in-from-bottom-5 duration-300">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

/* ── connection geometry (0–100 stage space) ───────────────────── */

type Pt = { x: number; y: number };

function edgeAnchors(from: WorkspaceCanvasCard, to: WorkspaceCanvasCard): [Pt, Pt] {
  const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const dx = tc.x - fc.x;
  const dy = tc.y - fc.y;

  const anchor = (card: WorkspaceCanvasCard, towardX: number, towardY: number): Pt => {
    if (Math.abs(towardX) >= Math.abs(towardY)) {
      // horizontal exit
      return {
        x: towardX >= 0 ? card.x + card.w : card.x,
        y: card.y + card.h / 2,
      };
    }
    return {
      x: card.x + card.w / 2,
      y: towardY >= 0 ? card.y + card.h : card.y,
    };
  };

  return [anchor(from, dx, dy), anchor(to, -dx, -dy)];
}

function curvePath(s: Pt, e: Pt): string {
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const cx = s.x + dx * 0.5;
    return `M ${s.x} ${s.y} C ${cx} ${s.y}, ${cx} ${e.y}, ${e.x} ${e.y}`;
  }
  const cy = s.y + dy * 0.5;
  return `M ${s.x} ${s.y} C ${s.x} ${cy}, ${e.x} ${cy}, ${e.x} ${e.y}`;
}

export function WorkspaceActiveCanvas() {
  const [renderedCard, setRenderedCard] = useState<string | null>(null);
  const [canvasView, setCanvasView] = useState<'nodes' | 'overview' | 'workspace-nodes'>('overview');

  const {
    goals,
    toggleGoal,
    addGoal,
    goalProgress,
    cashBalance,
    baseMRR,
    mrrGrowthRate,
    setMrrGrowthRate,
    operatingBurn,
    projectedRunway,
    monthlyRev,
    departments,
    hireHeadcount,
    totalFTE,
    risks,
    mitigateRisk,
    addRisk,
    confidenceScore,
    gtmChannels,
    updateGTMChannelBudget,
    activeDetailCard,
    setActiveDetailCard,
    selectedDeptId,
    setSelectedDeptId,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    createWorkspace,
    deleteWorkspace,
    activeSidebarTab,
    scrollExpansion,
    setScrollExpansion,
    isFullscreen,
    setIsFullscreen,
    activeRole,
    workspaceMode,
    entryContext,
    shortcuts,
  } = useFounderWorkspace();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const activeShortcut = useMemo(() => shortcuts.find(s => s.id === activeSidebarTab) ?? null, [shortcuts, activeSidebarTab]);

  const [showFullscreenHint, setShowFullscreenHint] = useState(false);
  useEffect(() => {
    if (!isFullscreen) return;
    const seen = window.localStorage.getItem('ws_fullscreen_hint_seen_v1');
    if (seen) return;
    setShowFullscreenHint(true);
    window.localStorage.setItem('ws_fullscreen_hint_seen_v1', '1');
    const timer = window.setTimeout(() => setShowFullscreenHint(false), 5000);
    return () => window.clearTimeout(timer);
  }, [isFullscreen]);

  const canvasWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = canvasWrapRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const isScrollingDown = e.deltaY > 0;

      if (isScrollingDown) {
        if (scrollExpansion < 100) {
          e.preventDefault();
          const step = Math.max(3, Math.min(25, Math.abs(e.deltaY) * 0.45));
          setScrollExpansion((prev) => Math.min(100, prev + step));
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [scrollExpansion, setScrollExpansion]);

  // Listen for mode-bar canvas view switch events
  useEffect(() => {
    const handler = (e: Event) => {
      const view = (e as CustomEvent<{ view: 'nodes' | 'overview' | 'workspace-nodes' }>).detail?.view;
      if (view === 'nodes' || view === 'overview' || view === 'workspace-nodes') setCanvasView(view);
    };
    window.addEventListener('workspace-set-canvas-view', handler);
    return () => window.removeEventListener('workspace-set-canvas-view', handler);
  }, []);

  const visibleWorkspaces = useMemo(() => {
    if (workspaces.length <= 2) return workspaces;
    const activeIndex = workspaces.findIndex(w => w.id === activeWorkspaceId);
    const startIdx = activeIndex <= 0 ? 0 : activeIndex - 1;
    return workspaces.slice(startIdx, startIdx + 2);
  }, [workspaces, activeWorkspaceId]);

  const isDetailTransition = activeDetailCard !== null || renderedCard !== null;
  const transClass = isDetailTransition
    ? 'duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
    : 'duration-[2200ms] ease-[cubic-bezier(0.645,0.045,0.355,1)]';

  useEffect(() => {
    if (activeDetailCard) {
      setRenderedCard(activeDetailCard);
    } else {
      const timer = setTimeout(() => {
        setRenderedCard(null);
      }, 500); // matches duration-500 card details transition
      return () => clearTimeout(timer);
    }
  }, [activeDetailCard]);

  const selectedDept = departments.find(d => d.id === selectedDeptId) || departments[0];


  // Forms states
  const [newGoalText, setNewGoalText] = useState('');
  const [newRiskText, setNewRiskText] = useState('');
  const [newRiskImpact, setNewRiskImpact] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [newRoleText, setNewRoleText] = useState('');

  useEffect(() => {
    const handleCollapse = () => {
      setIsFullscreen(false);
      setActiveDetailCard(null);
    };
    window.addEventListener('collapse-workspace-canvas', handleCollapse);
    return () => {
      window.removeEventListener('collapse-workspace-canvas', handleCollapse);
    };
  }, [setIsFullscreen, setActiveDetailCard]);

  const cardMap = useMemo(
    () => Object.fromEntries(WORKSPACE_CANVAS_CARDS.map(c => [c.id, c])),
    [],
  );

  const connections = useMemo(
    () =>
      WORKSPACE_CANVAS_CONNECTIONS.map(([from, to]) => {
        const a = cardMap[from];
        const b = cardMap[to];
        if (!a || !b) return null;
        const [s, e] = edgeAnchors(a, b);
        return { id: `${from}-${to}`, path: curvePath(s, e), s, e };
      }).filter(Boolean) as { id: string; path: string; s: Pt; e: Pt }[],
    [cardMap],
  );

  const handleCardClick = (e: React.MouseEvent, cardId: string) => {
    if ((e.target as HTMLElement).closest('.ws-card-close')) {
      e.stopPropagation();
      return;
    }
    setActiveDetailCard(cardId);
  };

  const handleAddGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGoalText.trim()) {
      addGoal(newGoalText.trim());
      setNewGoalText('');
    }
  };

  const handleAddRiskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRiskText.trim()) {
      addRisk(newRiskText.trim(), newRiskImpact);
      setNewRiskText('');
    }
  };

  const handleAddRoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRoleText.trim()) {
      hireHeadcount(selectedDeptId, newRoleText.trim());
      setNewRoleText('');
    }
  };

  return (
    <div
      ref={canvasWrapRef}
      className={`ws-canvas-wrap flex-1 min-h-0 flex flex-col justify-end px-1 pb-0 ${isFullscreen ? 'ws-canvas-wrap--fullscreen' : ''
        } ${scrollExpansion > 0 && scrollExpansion < 100 ? 'ws-canvas-wrap--scrolling' : ''}`}
    >
      {/* ── Floating pill — only visible when workspace is fully collapsed ── */}
      <div
        className="shrink-0"
        style={{
          position: 'relative',
          zIndex: 10,
          overflow: 'hidden',
          opacity: (scrollExpansion === 0 && !isFullscreen) ? 1 : 0,
          maxHeight: (scrollExpansion === 0 && !isFullscreen) ? '46px' : '0px',
          transform: (scrollExpansion === 0 && !isFullscreen) ? 'translateY(0)' : 'translateY(6px)',
          pointerEvents: (scrollExpansion === 0 && !isFullscreen) ? 'auto' : 'none',
          transition: (scrollExpansion === 0 && !isFullscreen)
            ? 'opacity 0.38s ease 0.1s, max-height 0.38s ease 0.1s, transform 0.38s cubic-bezier(0.16,1,0.3,1) 0.1s'
            : 'opacity 0.22s ease, max-height 0.22s ease, transform 0.18s ease',
          marginBottom: -30,
        }}
      >
        <WorkspaceModeBar placement="external" />
      </div>

      <div className="ws-canvas-trapezium flex-1 min-h-0 min-w-0">
        <WorkspaceCanvasFrame
          isFullscreen={isFullscreen}
        >
          <div className="ws-canvas-toolbar ws-canvas-inset shrink-0 flex items-center justify-between gap-3 pb-2 pt-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                {visibleWorkspaces.map(ws => {
                  const isActive = ws.id === activeWorkspaceId;
                  return (
                    <div
                      key={ws.id}
                      onClick={() => setActiveWorkspaceId(ws.id)}
                      className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer select-none ${isActive
                        ? 'bg-white/10 border-white/20 text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)]'
                        : 'bg-transparent border-white/5 text-white/50 hover:text-white/80 hover:bg-white/5'
                        }`}
                    >
                      <span className="max-w-[80px] md:max-w-[120px] truncate">{ws.name}</span>
                      {workspaces.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteWorkspace(ws.id);
                          }}
                          className="p-0.5 rounded-md hover:bg-white/15 text-white/30 hover:text-white/80 transition-colors"
                          title="Close Workspace"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Straight vertical line */}
                <div className="w-[1px] h-4 bg-white/15 mx-1" />

                {/* Plus button to add a new workspace tab */}
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors flex items-center justify-center"
                  title="Add Workspace Tab"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Back button when a detail card is open */}
              {activeDetailCard && (
                <>
                  <div className="w-[1px] h-4 bg-white/15 mx-1" />
                  <button
                    type="button"
                    onClick={() => setActiveDetailCard(null)}
                    className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white px-2 py-1.5 rounded-md bg-white/5 border border-white/10 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                </>
              )}
            </div>


            <div className="flex items-center gap-2 shrink-0">
              {!['tasks', 'decisions', 'goals', 'goals-metrics', 'notes', 'files', 'projects', 'sphere', 'roadmap', 'fundraising', 'interviews', 'competitors'].includes(activeSidebarTab) && !activeShortcut && !activeDetailCard && (
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/5 border border-white/10 mr-1">
                  {([
                    { id: 'overview',         label: 'Overview', Icon: Building2 },
                    { id: 'workspace-nodes',  label: 'Nodes',    Icon: Network   },
                    { id: 'nodes',            label: 'Saved',    Icon: Layers    },
                  ] as const).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCanvasView(id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${canvasView === id
                        ? 'bg-white/10 text-white shadow-[0_1px_4px_rgba(0,0,0,0.3)]'
                        : 'text-white/45 hover:text-white/80'
                        }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className={`ws-icon-btn ${isFullscreen ? 'ws-icon-btn--active' : ''}`}
                aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                className="ws-btn-share flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            </div>
          </div>

          <div className="ws-canvas-toolbar-divider ws-canvas-inset" />

          <div className="flex-1 min-h-0 overflow-hidden ws-canvas-stage-pad pb-3 pt-0 flex flex-col gap-0">
            <WorkspaceModeLensBanner />
            <div className="relative flex-1 min-h-0 overflow-hidden">
            {activeSidebarTab === 'tasks' ? (
              <WorkspaceMyWorkPanel />
            ) : activeSidebarTab === 'decisions' ? (
              <WorkspaceDecisionsPanel />
            ) : activeSidebarTab === 'goals' || activeSidebarTab === 'goals-metrics' ? (
              <WorkspaceGoalsMetricsPanel />
            ) : activeSidebarTab === 'notes' ? (
              <WorkspaceNotesDashboard />
            ) : activeSidebarTab === 'files' ? (
              <WorkspaceFilesDashboard />
            ) : activeSidebarTab === 'projects' ? (
              <WorkspaceProjectsSpace />
            ) : activeSidebarTab === 'sphere' ? (
              <WorkspaceSpherePanel />
            ) : activeSidebarTab === 'activity' ? (
              <WorkspaceActivityFeed />
            ) : activeSidebarTab === 'roadmap' || activeSidebarTab === 'fundraising' || activeSidebarTab === 'interviews' || activeSidebarTab === 'competitors' ? (
              <WorkspaceShortcutPanel tabId={activeSidebarTab} />
            ) : activeShortcut ? (
              <WorkspaceShortcutRouter shortcut={activeShortcut} />
            ) : canvasView === 'overview' ? (
              activeRole !== 'member' && workspaceMode === 'agent'
                ? <WorkspaceAgentSurface />
                : entryContext?.level === 'universe'
                  ? <WorkspaceUniverseCanvas />
                  : entryContext?.level === 'industry'
                    ? <WorkspaceIndustryCanvas />
                    : entryContext?.level === 'subdomain'
                      ? <WorkspaceSubdomainCanvas />
                      : entryContext?.level === 'company'
                        ? <WorkspaceCompanyCanvas />
                        : <WorkspaceCanvasOverview />
            ) : canvasView === 'nodes' && !activeDetailCard ? (
              <WorkspaceSavedNodesCanvas isFullscreen={isFullscreen} />
            ) : canvasView === 'workspace-nodes' ? (
              <WorkspaceHierarchyNodesCanvas isFullscreen={isFullscreen} />
            ) : (
              <div
                className={`ws-canvas-stage-area absolute transition-all ${transClass} ${activeDetailCard ? 'ws-canvas-stage-area--active' : ''
                  }`}
                style={
                  activeDetailCard
                    ? {
                      left: '0%',
                      right: '0%',
                      top: '0px',
                      bottom: '0px',
                      height: '100%',
                    }
                    : isFullscreen
                      ? {
                        left: '2%',
                        right: '2%',
                        top: '8px',
                        bottom: '8px',
                        height: 'calc(100% - 16px)',
                      }
                      : {
                        left: '8%',
                        right: '8%',
                        top: '16px',
                        bottom: 'calc(100% - 436px)',
                        height: '420px',
                      }
                }
              >
                {/* glowing curved connectors */}
                <svg
                  className={`absolute inset-0 w-full h-full pointer-events-none overflow-visible transition-opacity duration-[2200ms] ease-[cubic-bezier(0.645,0.045,0.355,1)] ${activeDetailCard || isFullscreen ? 'opacity-0' : 'opacity-100'
                    }`}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  {connections.map(c => (
                    <path
                      key={`${c.id}-glow`}
                      d={c.path}
                      fill="none"
                      stroke="rgba(125, 211, 252, 0.12)"
                      strokeWidth={4}
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                    />
                  ))}
                  {connections.map(c => (
                    <path
                      key={c.id}
                      d={c.path}
                      fill="none"
                      stroke="rgba(147, 197, 253, 0.85)"
                      strokeWidth={1.25}
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                    />
                  ))}
                </svg>

                {/* connector node dots (kept circular via separate layer) */}
                <div className={`transition-opacity duration-300 ${activeDetailCard || isFullscreen ? 'opacity-0' : 'opacity-100'}`}>
                  {connections.map(c => (
                    <div key={`${c.id}-nodes`} className="pointer-events-none">
                      <span
                        className="ws-conn-node"
                        style={{ left: `${c.s.x}%`, top: `${c.s.y}%` }}
                      />
                      <span
                        className="ws-conn-node"
                        style={{ left: `${c.e.x}%`, top: `${c.e.y}%` }}
                      />
                    </div>
                  ))}
                </div>

                {/* cards — 3D glass slab — filtered by role */}
                {WORKSPACE_CANVAS_CARDS.filter(c => {
                  if (activeRole === 'founder') return true;
                  if (activeRole === 'manager') return c.id !== 'metrics';
                  // member (Preview Mode): hide financial and risk-sensitive cards, keep the rest
                  return c.id !== 'metrics' && c.id !== 'risks' && c.id !== 'gtm';
                }).map((card, index) => {
                  const isActive = activeDetailCard === card.id;
                  const isAnyActive = activeDetailCard !== null;
                  const isHidden = isAnyActive && !isActive;

                  return (
                    <article
                      key={card.id}
                      onClick={(e) => !isActive && handleCardClick(e, card.id)}
                      className={`ws-glass-block absolute transition-all ${transClass} ${card.variant === 'hero' ? 'ws-glass-block--hero' : ''
                        } ${isActive ? 'ws-glass-block--active' : ''} ${isActive
                          ? 'z-50 cursor-default'
                          : 'cursor-pointer hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)]'
                        } ${isHidden
                          ? 'opacity-0 scale-90 pointer-events-none translate-y-4'
                          : 'opacity-100 scale-100 translate-y-0'
                        }`}
                      style={{
                        left: isActive ? '0%' : isFullscreen ? `${index * (15.5 + 1.4)}%` : `${card.x}%`,
                        top: isActive ? '0%' : isFullscreen ? '0px' : `${card.y}%`,
                        width: isActive ? '100%' : isFullscreen ? '15.5%' : `${card.w}%`,
                        height: isActive ? '100%' : isFullscreen ? '110px' : `${card.h}%`,
                        ['--card-accent' as string]: card.accent,
                      }}
                    >
                      <div
                        className={`ws-glass-block__face transition-all ${transClass}`}
                        style={{
                          padding: isActive ? '24px 32px' : '11px 12px',
                        }}
                      >
                        {/* Overview Content */}
                        <div className={`w-full h-full relative transition-all ${transClass} ${isActive ? 'opacity-0 pointer-events-none absolute inset-0' : 'opacity-100'
                          }`}>
                          {/* Compact Card Body (fullscreen view) */}
                          <div className={`absolute inset-0 transition-all ${transClass} ${isFullscreen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none'
                            }`}>
                            <CompactCardBody card={card} />
                          </div>
                          {/* Normal Card Body (standard grid view) */}
                          <div className={`absolute inset-0 transition-all ${transClass} ${isFullscreen ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100 pointer-events-auto'
                            }`}>
                            <CardBody card={card} />
                          </div>
                        </div>

                        {/* Detailed Content Container */}
                        {renderedCard === card.id && (
                          <div
                            className={`absolute inset-0 overflow-y-auto transition-all ${transClass} ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
                              }`}
                            style={{
                              padding: '24px 32px',
                            }}
                          >
                            {renderedCard === 'company_hub' && (
                              <div className="space-y-4 max-w-5xl mx-auto">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 animate-slide-up-fade">
                                  <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex flex-col justify-between">
                                    <span className="text-[11px] text-white/40">FTE Headcount</span>
                                    <span className="text-xl font-bold text-indigo-400 mt-2">{totalFTE} Operators</span>
                                  </div>
                                  <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex flex-col justify-between">
                                    <span className="text-[11px] text-white/40">Runway Duration</span>
                                    <span className="text-xl font-bold text-emerald-400 mt-2">{projectedRunway} Months</span>
                                  </div>
                                  <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex flex-col justify-between">
                                    <span className="text-[11px] text-white/40">OKR Accomplishments</span>
                                    <span className="text-xl font-bold text-rose-400 mt-2">{goalProgress}% Complete</span>
                                  </div>
                                  <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex flex-col justify-between">
                                    <span className="text-[11px] text-white/40">Confidence Score</span>
                                    <span className="text-xl font-bold text-amber-400 mt-2">{confidenceScore}%</span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl animate-slide-up-fade delay-100">
                                    <h3 className="text-xs font-semibold tracking-wider text-white/50 uppercase mb-3 flex items-center gap-1.5">
                                      <Target className="w-3.5 h-3.5 text-rose-400" />
                                      OKR Milestones
                                    </h3>
                                    <ul className="space-y-2">
                                      {goals.map(g => (
                                        <li key={g.id} className="flex items-center justify-between text-xs py-1 border-b border-white/5">
                                          <span className={g.done ? 'line-through text-white/40' : 'text-white/80'}>{g.label}</span>
                                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${g.done ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                            {g.done ? 'Accomplished' : 'Pending'}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl animate-slide-up-fade delay-150">
                                    <h3 className="text-xs font-semibold tracking-wider text-white/50 uppercase mb-3 flex items-center gap-1.5">
                                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                                      Risk Vectors
                                    </h3>
                                    <ul className="space-y-2">
                                      {risks.map(r => (
                                        <li key={r.id} className="flex items-center justify-between text-xs py-1 border-b border-white/5">
                                          <span className={r.status === 'Mitigated' ? 'line-through text-white/40' : 'text-white/80'}>{r.label.split(':')[1] || r.label}</span>
                                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${r.status === 'Mitigated' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                            {r.status}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            )}

                            {renderedCard === 'metrics' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
                                <div className="space-y-4 animate-slide-up-fade">
                                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col justify-between">
                                    <div>
                                      <span className="text-[11px] text-white/40 block">Projected Cash Runway</span>
                                      <div className="flex items-baseline gap-2 mt-1">
                                        <span className="text-4xl font-extrabold text-emerald-400">{projectedRunway}</span>
                                        <span className="text-sm text-white/60">months remaining</span>
                                      </div>
                                    </div>
                                    <div className="mt-4 text-xs text-white/50 border-t border-white/5 pt-3">
                                      Assumes cash reserves of <span className="text-white font-semibold">${(cashBalance).toLocaleString()}</span>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                                      <span className="text-[10px] text-white/40 block">Base MRR</span>
                                      <span className="text-lg font-bold text-white">${baseMRR.toLocaleString()}</span>
                                    </div>
                                    <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                                      <span className="text-[10px] text-white/40 block">Operating Burn (Est)</span>
                                      <span className="text-lg font-bold text-red-400">${operatingBurn.toLocaleString()}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="p-5 bg-white/5 border border-white/10 rounded-2xl flex flex-col justify-between animate-slide-up-fade delay-100">
                                  <div>
                                    <h3 className="text-xs font-bold tracking-wider text-white/50 uppercase mb-4 flex items-center gap-1.5">
                                      <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                                      Financial Runway Simulator
                                    </h3>
                                    <p className="text-xs text-white/60 mb-6 leading-relaxed">
                                      Adjust your MRR Growth Rate to simulate how business performance stretches your startup cash runway.
                                    </p>

                                    <div className="space-y-2">
                                      <div className="flex justify-between items-baseline text-xs">
                                        <span className="text-white/65">MRR Growth Rate</span>
                                        <span className="text-indigo-400 font-bold">{mrrGrowthRate}% / Month</span>
                                      </div>
                                      <input
                                        type="range"
                                        min="0"
                                        max="50"
                                        value={mrrGrowthRate}
                                        onChange={e => setMrrGrowthRate(Number(e.target.value))}
                                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                      />
                                    </div>
                                  </div>

                                  <div className="mt-6 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs">
                                    <strong className="text-indigo-300">Runway Forecast:</strong> Under an assumed <span className="font-semibold text-white">{mrrGrowthRate}%</span> growth rate, monthly revenues are projected at <span className="font-semibold text-white">${monthlyRev.toLocaleString()}</span>, resulting in a sustainable operating period.
                                  </div>
                                </div>
                              </div>
                            )}

                            {renderedCard === 'departments' && (
                              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-5xl mx-auto">
                                {/* Dept Selectors */}
                                <div className="md:col-span-5 space-y-2 animate-slide-up-fade">
                                  <h3 className="text-xs font-bold tracking-wider text-white/50 uppercase mb-3">Company Divisions</h3>
                                  {departments.map(d => (
                                    <button
                                      key={d.id}
                                      type="button"
                                      onClick={() => setSelectedDeptId(d.id)}
                                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left border transition-all ${selectedDeptId === d.id
                                        ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-[0_0_12px_rgba(245,158,11,0.1)]'
                                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                        }`}
                                    >
                                      <span className="text-xs font-semibold">{d.name}</span>
                                      <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white font-bold">{d.fte} FTE</span>
                                    </button>
                                  ))}
                                </div>

                                {/* Roles & Hiring */}
                                <div className="md:col-span-7 p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col justify-between min-h-[300px] animate-slide-up-fade delay-100">
                                  <div>
                                    <div className="flex items-start justify-between border-b border-white/10 pb-2 mb-3">
                                      <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">{selectedDept.name} Roster</h4>
                                      <span className="text-[10px] text-white/40">Total payroll includes {selectedDept.fte} positions</span>
                                    </div>
                                    <ul className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                                      {selectedDept.roles.map((role, idx) => (
                                        <li key={idx} className="text-xs text-white/70 flex items-center gap-2">
                                          <span className="w-1 h-1 rounded-full bg-amber-400" />
                                          {role}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  <form onSubmit={handleAddRoleSubmit} className="mt-4 border-t border-white/5 pt-3">
                                    <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1.5">Plan Headcount Expansion</label>
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={newRoleText}
                                        onChange={e => setNewRoleText(e.target.value)}
                                        placeholder="Role Title (e.g. Senior Frontend Dev)"
                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-amber-500/50"
                                      />
                                      <button
                                        type="submit"
                                        className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-xs font-bold text-amber-300 transition-colors flex items-center gap-1"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        Hire
                                      </button>
                                    </div>
                                  </form>
                                </div>
                              </div>
                            )}

                            {renderedCard === 'goals' && (
                              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-5xl mx-auto">
                                {/* Goal Progress Dial */}
                                <div className="md:col-span-5 p-5 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center animate-slide-up-fade">
                                  <span className="text-[11px] text-white/40 block mb-4 uppercase tracking-widest font-semibold">OKR Completion Progress</span>
                                  <div className="w-28 h-28 relative">
                                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                      <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
                                      <circle
                                        cx="50"
                                        cy="50"
                                        r="40"
                                        fill="none"
                                        stroke="#f43f5e"
                                        strokeWidth={8}
                                        strokeLinecap="round"
                                        strokeDasharray={2 * Math.PI * 40}
                                        strokeDashoffset={2 * Math.PI * 40 * (1 - goalProgress / 100)}
                                        style={{ filter: 'drop-shadow(0 0 8px rgba(244,63,94,0.4))' }}
                                      />
                                    </svg>
                                    <span className="absolute inset-0 flex items-center justify-center text-2xl font-black text-white">
                                      {goalProgress}%
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-rose-300 font-semibold mt-4">
                                    {goals.filter(g => g.done).length} of {goals.length} Goals Logged
                                  </span>
                                </div>

                                {/* OKR Tasks Checklist */}
                                <div className="md:col-span-7 p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col justify-between min-h-[300px] animate-slide-up-fade delay-100">
                                  <div>
                                    <h3 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Executive Objectives</h3>
                                    <ul className="space-y-2 overflow-y-auto max-h-[160px] pr-1">
                                      {goals.map(g => (
                                        <li
                                          key={g.id}
                                          onClick={() => toggleGoal(g.id)}
                                          className="flex items-center gap-2.5 p-2 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 cursor-pointer transition-all"
                                        >
                                          <button
                                            type="button"
                                            className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${g.done ? 'bg-rose-500 border-rose-400 text-white' : 'border-white/20 bg-white/5'
                                              }`}
                                          >
                                            {g.done && <Check className="w-3 h-3 stroke-[3]" />}
                                          </button>
                                          <span className={`text-xs ${g.done ? 'line-through text-white/35' : 'text-white/80'}`}>{g.label}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  <form onSubmit={handleAddGoalSubmit} className="mt-4 border-t border-white/5 pt-3">
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={newGoalText}
                                        onChange={e => setNewGoalText(e.target.value)}
                                        placeholder="Add new goal/OKR..."
                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-rose-500/50"
                                      />
                                      <button
                                        type="submit"
                                        className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 rounded-lg text-xs font-bold text-rose-300 transition-colors"
                                      >
                                        Add OKR
                                      </button>
                                    </div>
                                  </form>
                                </div>
                              </div>
                            )}

                            {renderedCard === 'risks' && (
                              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-5xl mx-auto">
                                {/* Risk Index Dial */}
                                <div className="md:col-span-4 p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center animate-slide-up-fade">
                                  <span className="text-[10px] text-white/40 block mb-4 uppercase tracking-widest font-semibold">Security & Risk Index</span>
                                  <GaugeRing color="#ef4444" value={confidenceScore} />
                                  <span className="text-[10px] text-red-300 font-semibold mt-4 text-center leading-relaxed">
                                    Confidence Health: {confidenceScore}%
                                  </span>
                                </div>

                                {/* Blockers Board */}
                                <div className="md:col-span-8 p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col justify-between min-h-[300px] animate-slide-up-fade delay-100">
                                  <div>
                                    <h3 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Mitigation Board</h3>
                                    <ul className="space-y-2 overflow-y-auto max-h-[160px] pr-1">
                                      {risks.map(r => (
                                        <li key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                                          <div>
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded mr-2 font-bold ${r.impact === 'High' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                                              }`}>
                                              {r.impact}
                                            </span>
                                            <span className={`text-xs ${r.status === 'Mitigated' ? 'line-through text-white/35' : 'text-white/80'}`}>
                                              {r.label}
                                            </span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => mitigateRisk(r.id)}
                                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${r.status === 'Mitigated'
                                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                              : 'bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30'
                                              }`}
                                          >
                                            {r.status === 'Mitigated' ? 'Reopen Blocker' : 'Mitigate Blocker'}
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  <form onSubmit={handleAddRiskSubmit} className="mt-4 border-t border-white/5 pt-3">
                                    <div className="flex gap-2 items-center">
                                      <input
                                        type="text"
                                        value={newRiskText}
                                        onChange={e => setNewRiskText(e.target.value)}
                                        placeholder="Log new blocker..."
                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-red-500/50"
                                      />
                                      <select
                                        value={newRiskImpact}
                                        onChange={e => setNewRiskImpact(e.target.value as any)}
                                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 focus:outline-none"
                                      >
                                        <option value="High" className="bg-[#0c1020]">High</option>
                                        <option value="Medium" className="bg-[#0c1020]">Medium</option>
                                        <option value="Low" className="bg-[#0c1020]">Low</option>
                                      </select>
                                      <button
                                        type="submit"
                                        className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-xs font-bold text-red-300 transition-colors"
                                      >
                                        Report
                                      </button>
                                    </div>
                                  </form>
                                </div>
                              </div>
                            )}

                            {renderedCard === 'gtm' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
                                <div className="space-y-4 animate-slide-up-fade">
                                  <h3 className="text-xs font-bold tracking-wider text-white/50 uppercase">Capital Allocation By Channel</h3>
                                  <p className="text-xs text-white/50 leading-relaxed">
                                    Adjust channel allocations. Raising budget on one channel automatically balances resources across remaining channels.
                                  </p>

                                  <div className="space-y-4 pt-2">
                                    {gtmChannels.map(c => (
                                      <div key={c.id} className="space-y-1">
                                        <div className="flex justify-between items-baseline text-xs">
                                          <span className="text-white/85 font-medium">{c.name}</span>
                                          <span className="text-purple-300 font-bold">{c.budget}%</span>
                                        </div>
                                        <input
                                          type="range"
                                          min="0"
                                          max="100"
                                          value={c.budget}
                                          onChange={e => updateGTMChannelBudget(c.id, Number(e.target.value))}
                                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col justify-between animate-slide-up-fade delay-100">
                                  <div>
                                    <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2.5">GTM Strategy Analytics</h4>
                                    <ul className="space-y-3">
                                      {gtmChannels.map(c => (
                                        <li key={c.id} className="flex justify-between items-start text-xs border-b border-white/5 pb-2">
                                          <div>
                                            <span className="font-semibold text-white/90">{c.name.split(' ')[0]}</span>
                                            <p className="text-[10px] text-white/40 mt-0.5">Focus: {c.impact}</p>
                                          </div>
                                          <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded text-[10px]">
                                            {c.budget > 40 ? 'Primary Wedge' : c.budget > 15 ? 'Balanced' : 'Incidental'}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs mt-4">
                                    <strong className="text-purple-300">Omnichannel Impact:</strong> Dynamic budget weighting guarantees a balanced marketing push aligned with Series A runway targets.
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}

                {isFullscreen && !activeDetailCard && (
                  <div className="absolute inset-x-0 bottom-0 top-[134px] flex flex-col min-h-0 animate-slide-up-fade">
                    <WorkspaceChatCopilot />
                  </div>
                )}
              </div>
            )}
            </div>{/* end relative inner */}
          </div>
        </WorkspaceCanvasFrame>
      </div>

      {showCreateModal && (
        <WorkspaceCreateModal
          onCreate={(name, purpose) => {
            createWorkspace(name, purpose);
            setShowCreateModal(false);
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {showFullscreenHint && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/80 animate-slide-up-fade"
          style={{ background: 'rgba(10,10,18,0.85)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)' }}
        >
          Hover the left or right edge of the screen to reveal your panels
        </div>
      )}
    </div>
  );
}
