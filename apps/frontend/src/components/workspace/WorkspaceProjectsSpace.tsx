import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Folder, Plus, X, ChevronRight, ArrowLeft, Users, Target, Trash2,
  Clock, Briefcase, LayoutGrid, UserCircle2, Flag,
  Scale, AlertTriangle, FileText, MessageSquare, Send, Check, Bot,
  Zap, Activity, ChevronDown, ChevronUp, Layers,
} from 'lucide-react';
import { useSavedWorkflows } from '../../lib/useSavedWorkflows';
import {
  useProjectsStore,
  PROJECT_STATUS_META,
  TASK_STATUS_META,
  MEMBER_ROLE_META,
  DECISION_META,
  RISK_META,
  memberInitials,
  taskProgress,
  memberLoad,
  generateAlerts,
  type Project,
  type ProjectTask,
  type TaskStatus,
  type ProjectType,
  type Member,
  type RiskSeverity,
  type SuggestiveAlert,
} from '../../lib/useProjectsStore';
import {
  HORIZON_ORDER,
  HORIZON_META,
  type Horizon,
} from '../../lib/useGoalsStore';
import {
  useBdtGoals,
} from '../../lib/db/metrics';
import { useCanonicalMetrics, isMetricAdmin } from '../../lib/db/canonicalMetrics';
import { useTeamMembers } from '../../lib/db/team';
import {
  EmptyMetricsState,
  MetricCard,
  MetricCreateWizard,
  MetricRollupHealthPanel,
} from './metrics/MetricSystem';
import { useAuth } from '../../lib/auth';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';

const ACCENT = '#C1AEFF';
const MEMBER_COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee'];
function memberColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
}

const TASK_ORDER: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
const TYPE_OPTIONS: ProjectType[] = ['project', 'product', 'initiative', 'experiment'];

/* ── shared bits ─────────────────────────────────────────────────────────── */

function Avatar({ member, size = 24 }: { member?: Member; size?: number }) {
  if (!member) {
    return (
      <span className="rounded-full grid place-items-center shrink-0 bg-white/5 text-white/30 border border-white/10" style={{ width: size, height: size }}>
        <UserCircle2 style={{ width: size * 0.6, height: size * 0.6 }} />
      </span>
    );
  }
  const color = memberColor(member.id);
  return (
    <span
      title={`${member.name} · ${MEMBER_ROLE_META[member.role].label}`}
      className="rounded-full grid place-items-center font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `${color}26`, color, border: `1px solid ${color}55` }}
    >
      {memberInitials(member.name)}
    </span>
  );
}

function AvatarStack({ ids, members }: { ids: string[]; members: Member[] }) {
  const list = ids.map(id => members.find(m => m.id === id)).filter(Boolean) as Member[];
  return (
    <div className="flex items-center">
      {list.slice(0, 4).map((m, i) => (
        <span key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}>
          <Avatar member={m} size={24} />
        </span>
      ))}
      {list.length > 4 && <span className="ml-1 text-[10px] text-white/40">+{list.length - 4}</span>}
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${color}1f`, color, border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
}

/* ── reusable draggable kanban (cards modeled on the Tasks page) ──────────── */

function ProjectKanban({ tasks, members, onMove, onDelete, projectNameFor, onSelectTask }: {
  tasks: ProjectTask[];
  members: Member[];
  onMove: (id: string, status: TaskStatus) => void;
  onDelete?: (id: string) => void;
  projectNameFor?: (t: ProjectTask) => string;
  onSelectTask?: (id: string) => void;
}) {
  const { tasks: allTasks } = useProjectsStore();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const dragCounter = useRef<Record<TaskStatus, number>>({ todo: 0, in_progress: 0, review: 0, done: 0 });

  const reset = () => { dragCounter.current = { todo: 0, in_progress: 0, review: 0, done: 0 }; };

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => setDraggedId(id), 0);
  };
  const onDragEnd = () => { setDraggedId(null); setDragOver(null); reset(); };
  const onDragEnterCol = (e: React.DragEvent, s: TaskStatus) => { e.preventDefault(); dragCounter.current[s]++; setDragOver(s); };
  const onDragLeaveCol = (e: React.DragEvent, s: TaskStatus) => {
    e.preventDefault();
    dragCounter.current[s]--;
    if (dragCounter.current[s] <= 0) { dragCounter.current[s] = 0; setDragOver(prev => (prev === s ? null : prev)); }
  };
  const onDropCol = (e: React.DragEvent, s: TaskStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) onMove(id, s);
    setDragOver(null); setDraggedId(null); reset();
  };

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {TASK_ORDER.map(status => {
        const meta = TASK_STATUS_META[status];
        const items = tasks.filter(t => t.status === status);
        const isOver = dragOver === status;
        return (
          <div
            key={status}
            onDragOver={e => e.preventDefault()}
            onDragEnter={e => onDragEnterCol(e, status)}
            onDragLeave={e => onDragLeaveCol(e, status)}
            onDrop={e => onDropCol(e, status)}
            className="rounded-2xl flex flex-col h-full min-h-0 overflow-hidden transition-all duration-200"
            style={isOver
              ? { background: `${meta.color}0d`, border: `1px dashed ${meta.color}66`, boxShadow: `0 0 15px ${meta.color}26`, transform: 'scale(1.01)' }
              : { background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="px-4 py-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</h3>
              </div>
              <span className="text-[10px] font-bold text-white/30 px-2 py-0.5 rounded-full bg-white/5">{items.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-hide">
              {items.length === 0 ? (
                <div className="h-24 flex items-center justify-center border border-dashed border-white/5 rounded-xl text-[10px] text-white/20 uppercase tracking-wider font-semibold">
                  Drop here
                </div>
              ) : (
                items.map(t => {
                  const assignee = members.find(m => m.id === t.assigneeId);
                  const dragging = draggedId === t.id;
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={e => onDragStart(e, t.id)}
                      onDragEnd={onDragEnd}
                      onClick={() => onSelectTask?.(t.id)}
                      className={`group relative bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-white/20 rounded-xl p-3 transition-all duration-200 flex flex-col gap-2.5 shadow-lg select-none cursor-pointer ${dragging ? 'opacity-30 scale-95 border-dashed border-white/20' : 'active:cursor-grabbing'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-xs font-semibold leading-relaxed ${status === 'done' ? 'text-white/40 line-through' : 'text-white/80'}`}>{t.title}</span>
                        {onDelete && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 text-white/30 hover:text-rose-400 rounded transition-all shrink-0"
                            title="Delete task"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {(() => {
                        const blocker = t.blockedByTaskId ? allTasks.find(x => x.id === t.blockedByTaskId) : null;
                        const isBlocked = blocker && blocker.status !== 'done';
                        if (!isBlocked || !blocker) return null;
                        return (
                          <div className="text-[10px] text-amber-300 font-medium flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg w-fit">
                            <span>🔒 Blocked:</span>
                            <span className="truncate max-w-[120px] font-semibold">{blocker.title}</span>
                          </div>
                        );
                      })()}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          {projectNameFor && (
                            <span className="text-[9px] text-white/45 px-1.5 py-0.5 rounded bg-white/5 truncate max-w-[110px]">{projectNameFor(t)}</span>
                          )}
                          {t.dueDate && (
                            <span className="text-[9px] text-white/35 flex items-center gap-1 shrink-0">
                              <Clock className="w-2.5 h-2.5" />{new Date(t.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                        <Avatar member={assignee} size={20} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── new project form ────────────────────────────────────────────────────── */

function NewProjectForm({ members, goalOptions, onCreate, onClose }: {
  members: Member[];
  goalOptions: { id: string; title: string }[];
  onCreate: (input: { name: string; type: ProjectType; memberIds: string[]; goalId?: string; goalLink?: string; description?: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>('project');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [goalId, setGoalId] = useState('');

  const toggle = (id: string) => setMemberIds(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  return (
    <div className="fixed inset-0 z-[140] grid place-items-center p-6" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="ws-sn-detail w-full max-w-md rounded-2xl p-6 bg-[#0e0e14] border border-white/12 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-white flex items-center gap-2"><Plus className="w-4 h-4" style={{ color: ACCENT }} /> New Project</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>

        <label className="text-[10px] uppercase tracking-wider text-white/40">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="e.g. Pricing Positioning Sprint"
          className="w-full mt-1 mb-4 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30" />

        <label className="text-[10px] uppercase tracking-wider text-white/40">Type</label>
        <div className="flex flex-wrap gap-1.5 mt-1 mb-4">
          {TYPE_OPTIONS.map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-lg border capitalize transition-all"
              style={type === t ? { background: `${ACCENT}22`, borderColor: `${ACCENT}55`, color: ACCENT } : { background: 'transparent', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
              {t}
            </button>
          ))}
        </div>

        <label className="text-[10px] uppercase tracking-wider text-white/40">Assign members</label>
        <div className="flex flex-wrap gap-1.5 mt-1 mb-4">
          {members.map(m => {
            const on = memberIds.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => toggle(m.id)}
                className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-lg border transition-all"
                style={on ? { background: `${memberColor(m.id)}22`, borderColor: `${memberColor(m.id)}55`, color: '#fff' } : { background: 'transparent', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                <Avatar member={m} size={18} /> {m.name}
              </button>
            );
          })}
        </div>

        <label className="text-[10px] uppercase tracking-wider text-white/40">Link to goal (optional)</label>
        <select value={goalId} onChange={e => setGoalId(e.target.value)}
          className="w-full mt-1 mb-6 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/85 focus:outline-none focus:border-white/30">
          <option value="" className="bg-[#0e0e14]">No goal</option>
          {goalOptions.map(g => <option key={g.id} value={g.id} className="bg-[#0e0e14]">{g.title}</option>)}
        </select>

        <div className="flex items-center gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-white/55 hover:text-white border border-white/10">Cancel</button>
          <button type="button" disabled={!name.trim()}
            onClick={() => { const g = goalOptions.find(x => x.id === goalId); onCreate({ name: name.trim(), type, memberIds, goalId: goalId || undefined, goalLink: g?.title }); onClose(); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ background: `${ACCENT}26`, border: `1px solid ${ACCENT}55`, color: ACCENT }}>
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── superspace ──────────────────────────────────────────────────────────── */

function ProjectCard({ project, tasks, members, goalTitle, onOpen }: { project: Project; tasks: ProjectTask[]; members: Member[]; goalTitle?: string; onOpen: () => void }) {
  const prog = taskProgress(tasks);
  const status = PROJECT_STATUS_META[project.status];
  return (
    <article onClick={onOpen} className="ws-sn-card group cursor-pointer rounded-2xl p-4 flex flex-col gap-3 ws-glass" style={{ ['--sn-accent' as string]: ACCENT, borderColor: 'rgba(255,255,255,0.08)' }}>
      <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full opacity-70" style={{ background: `linear-gradient(${status.color}, transparent)` }} />
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-white/8 text-white/55 capitalize">{project.type}</span>
        <Chip label={status.label} color={status.color} />
        <ChevronRight className="w-4 h-4 ml-auto text-white/25 transition-transform group-hover:translate-x-0.5" />
      </div>
      <h4 className="text-sm font-bold text-white leading-snug">{project.name}</h4>
      {project.description && <p className="text-[11px] text-white/45 leading-relaxed line-clamp-2">{project.description}</p>}
      <div>
        <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
          <span>Health</span><span className="tabular-nums" style={{ color: status.color }}>{project.health}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${project.health}%`, background: status.color }} />
        </div>
      </div>
      <div className="mt-auto pt-1 flex items-center justify-between">
        <AvatarStack ids={project.memberIds} members={members} />
        <span className="text-[10px] text-white/40 tabular-nums">{prog.done}/{prog.total} tasks</span>
      </div>
      {(goalTitle ?? project.goalLink) && (
        <div className="flex items-center gap-1.5 text-[10px] text-white/45 pt-1 border-t border-white/5">
          <Target className="w-3 h-3" style={{ color: ACCENT }} /> {goalTitle ?? project.goalLink}
        </div>
      )}
    </article>
  );
}

function Superspace({ onOpenProject, onSelectTask }: { onOpenProject: (id: string) => void; onSelectTask?: (id: string) => void }) {
  const { projects, tasks, members, decisions, risks, milestones, createProject, syncAllHealths } = useProjectsStore();
  const { profile } = useAuth();
  const { goals } = useBdtGoals(profile?.company_id ?? null);
  const goalTitle = (p: Project) => goals.find(g => g.id === p.goalId)?.title ?? p.goalLink;
  const [showForm, setShowForm] = useState(false);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showResourceLoad, setShowResourceLoad] = useState(false);
  const [showDelaysPanel, setShowDelaysPanel] = useState(false);

  // Sync health on mount so cards reflect live data
  useEffect(() => { syncAllHealths(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => ({
    total: projects.length,
    onTrack: projects.filter(p => p.status === 'on_track').length,
    atRisk: projects.filter(p => p.status === 'at_risk' || p.status === 'delayed').length,
    openTasks: tasks.filter(t => t.status !== 'done').length,
  }), [projects, tasks]);

  const alerts = useMemo(
    () => generateAlerts(projects, tasks, decisions, risks, members),
    [projects, tasks, decisions, risks, members],
  );

  const load = useMemo(
    () => memberLoad(tasks.filter(t => t.status !== 'done'), projects),
    [tasks, projects],
  );

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const overdueTasks = useMemo(() => tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'done'), [tasks, today]);
  const overdueMilestones = useMemo(() => milestones.filter(m => m.dueDate && m.dueDate < today && !m.done), [milestones, today]);
  const blockedTasks = useMemo(() => tasks.filter(t => {
    if (!t.blockedByTaskId) return false;
    const b = tasks.find(x => x.id === t.blockedByTaskId);
    return b && b.status !== 'done';
  }), [tasks]);
  const blockedMilestones = useMemo(() => milestones.filter(m => {
    if (!m.dependsOnMilestoneId) return false;
    const b = milestones.find(x => x.id === m.dependsOnMilestoneId);
    return b && !b.done;
  }), [milestones]);

  const openDecisions = decisions.filter(d => d.status === 'open');

  const alertColor = (s: SuggestiveAlert['severity']) =>
    s === 'high' ? '#fb7185' : s === 'medium' ? '#fbbf24' : '#34d399';

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-3 px-1 pb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4" style={{ color: ACCENT }} />
          <h3 className="text-sm font-semibold text-white">Superspace</h3>
          <span className="text-[10px] text-white/40">all projects &amp; products</span>
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}44`, color: ACCENT }}>
          <Plus className="w-3.5 h-3.5" /> New Project
        </button>
      </div>

      {/* stat bar */}
      <div className="shrink-0 grid grid-cols-4 gap-2 px-1 pb-3">
        {[
          { label: 'Projects', value: stats.total, color: '#fff' },
          { label: 'On track', value: stats.onTrack, color: '#34d399' },
          { label: 'At risk', value: stats.atRisk, color: '#fbbf24' },
          { label: 'Open tasks', value: stats.openTasks, color: ACCENT },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 bg-white/[0.03] border border-white/8">
            <div className="text-[9px] uppercase tracking-wider text-white/35">{s.label}</div>
            <div className="text-xl font-bold mt-0.5 tabular-nums" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* suggestive alerts */}
      {alerts.length > 0 && (
        <div className="shrink-0 mb-3 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAlerts(p => !p)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white/60 hover:text-white transition-colors"
          >
            <Zap className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} />
            <span className="flex-1 text-left">{alerts.length} action{alerts.length > 1 ? 's' : ''} needed</span>
            {showAlerts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showAlerts && (
            <div className="px-3 pb-3 space-y-1.5">
              {alerts.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.03]">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: alertColor(a.severity) }} />
                  <div>
                    <div className="text-xs font-semibold text-white/85">{a.title}</div>
                    <div className="text-[11px] text-white/45 mt-0.5">{a.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* open decisions queue */}
      {openDecisions.length > 0 && (
        <div className="shrink-0 mb-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-yellow-300/60 mb-2 flex items-center gap-1.5">
            <Scale className="w-3 h-3" /> {openDecisions.length} Decision{openDecisions.length > 1 ? 's' : ''} Awaiting Approval
          </div>
          <div className="space-y-1.5">
            {openDecisions.slice(0, 4).map(d => {
              const proj = projects.find(p => p.id === d.projectId);
              return (
                <div key={d.id} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                  <span className="flex-1 text-white/80">{d.title}</span>
                  {proj && <span className="text-[10px] text-white/35 shrink-0">{proj.name}</span>}
                  <button
                    type="button"
                    onClick={() => onOpenProject(d.projectId)}
                    className="text-[10px] text-yellow-300 hover:underline shrink-0"
                  >Review</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* resource load toggle */}
      <div className="shrink-0 mb-3">
        <button
          type="button"
          onClick={() => setShowResourceLoad(p => !p)}
          className="flex items-center gap-1.5 text-[11px] text-white/45 hover:text-white/75 transition-colors"
        >
          <Activity className="w-3.5 h-3.5" />
          Resource load
          {showResourceLoad ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showResourceLoad && (
          <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
            {members.map(m => {
              const l = load[m.id] ?? { total: 0, overdue: 0, projectNames: [] };
              const overAllocated = l.total > 4;
              const color = l.overdue > 0 ? '#fb7185' : overAllocated ? '#fbbf24' : '#34d399';
              return (
                <div key={m.id} className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/8">
                  <Avatar member={m} size={24} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-white/80 truncate">{m.name}</div>
                    <div className="text-[9px] text-white/35">{l.total} open{l.overdue > 0 ? ` · ${l.overdue} overdue` : ''}</div>
                  </div>
                  <div
                    className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold shrink-0"
                    style={{ background: `${color}22`, color, border: `1px solid ${color}40` }}
                  >{l.total}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* delays & blockers panel */}
      <div className="shrink-0 mb-3">
        <button
          type="button"
          onClick={() => setShowDelaysPanel(p => !p)}
          className="flex items-center gap-1.5 text-[11px] text-white/45 hover:text-white/75 transition-colors"
        >
          <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#fb7185' }} />
          Delays &amp; Blockers
          {showDelaysPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showDelaysPanel && (
          <div className="mt-2 space-y-1.5 rounded-xl border border-white/8 bg-white/[0.02] p-3 max-h-[160px] overflow-y-auto scrollbar-hide">
            {overdueTasks.length === 0 && overdueMilestones.length === 0 && blockedTasks.length === 0 && blockedMilestones.length === 0 && (
              <div className="text-[11px] text-white/35 px-1 py-1">No delays or active blockers! Excellent execution.</div>
            )}
            
            {overdueTasks.map(t => (
              <div key={t.id} onClick={() => onSelectTask?.(t.id)} className="flex items-center gap-2 text-xs py-1 border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/5 rounded px-1 transition-all">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                <span className="text-white/40 uppercase tracking-wider text-[8px] px-1.5 py-0.5 bg-white/5 rounded shrink-0">Overdue Task</span>
                <span className="flex-1 text-white/80 truncate">{t.title}</span>
                <span className="text-[10px] text-rose-400 shrink-0">due {new Date(t.dueDate!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
            
            {overdueMilestones.map(m => (
              <div key={m.id} className="flex items-center gap-2 text-xs py-1 border-b border-white/5 last:border-0 px-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                <span className="text-white/40 uppercase tracking-wider text-[8px] px-1.5 py-0.5 bg-white/5 rounded shrink-0">Overdue Milestone</span>
                <span className="flex-1 text-white/80 truncate">{m.title}</span>
                <span className="text-[10px] text-rose-400 shrink-0">due {new Date(m.dueDate!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}

            {blockedTasks.map(t => {
              const blocker = tasks.find(x => x.id === t.blockedByTaskId);
              return (
                <div key={t.id} onClick={() => onSelectTask?.(t.id)} className="flex items-center gap-2 text-xs py-1 border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/5 rounded px-1 transition-all">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-white/40 uppercase tracking-wider text-[8px] px-1.5 py-0.5 bg-white/5 rounded shrink-0">Blocked Task</span>
                  <span className="flex-1 text-white/80 truncate">{t.title}</span>
                  <span className="text-[10px] text-amber-300 shrink-0 truncate max-w-[150px]">blocked by "{blocker?.title ?? 'Unknown'}"</span>
                </div>
              );
            })}

            {blockedMilestones.map(m => {
              const blocker = milestones.find(x => x.id === m.dependsOnMilestoneId);
              return (
                <div key={m.id} className="flex items-center gap-2 text-xs py-1 border-b border-white/5 last:border-0 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-white/40 uppercase tracking-wider text-[8px] px-1.5 py-0.5 bg-white/5 rounded shrink-0">Blocked Milestone</span>
                  <span className="flex-1 text-white/80 truncate">{m.title}</span>
                  <span className="text-[10px] text-amber-300 shrink-0 truncate max-w-[150px]">depends on "{blocker?.title ?? 'Unknown'}"</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1 pb-2">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {projects.map(p => (
            <ProjectCard key={p.id} project={p} tasks={tasks.filter(t => t.projectId === p.id)} members={members} goalTitle={goalTitle(p)} onOpen={() => onOpenProject(p.id)} />
          ))}
        </div>
      </div>

      {showForm && <NewProjectForm members={members} goalOptions={goals.map(g => ({ id: g.id, title: g.title }))} onCreate={createProject} onClose={() => setShowForm(false)} />}
    </div>
  );
}

/* ── project sub-sections ────────────────────────────────────────────────── */

function ProjectMilestones({ projectId }: { projectId: string }) {
  const { milestones, addMilestone, toggleMilestone, deleteMilestone, updateMilestone } = useProjectsStore();
  const items = milestones.filter(m => m.projectId === projectId);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <form onSubmit={e => { e.preventDefault(); if (title.trim()) { addMilestone(projectId, title.trim(), due || undefined); setTitle(''); setDue(''); } }} className="shrink-0 flex items-center gap-2 mb-3">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a milestone…" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25" />
        <input type="date" value={due} onChange={e => setDue(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white/80 focus:outline-none" />
        <button type="submit" className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: `${ACCENT}26`, border: `1px solid ${ACCENT}44`, color: ACCENT }}>Add</button>
      </form>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1 space-y-2">
        {items.length === 0 && <div className="text-xs text-white/30 px-1">No milestones yet.</div>}
        {items.map(m => {
          const parent = items.find(x => x.id === m.dependsOnMilestoneId);
          const isBlocked = parent && !parent.done;
          return (
            <div key={m.id} className="group flex flex-col gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/8">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => toggleMilestone(m.id)} className="w-5 h-5 rounded-md grid place-items-center shrink-0" style={{ background: m.done ? ACCENT : 'transparent', border: `1.5px solid ${m.done ? ACCENT : 'rgba(255,255,255,0.25)'}` }}>{m.done && <Check className="w-3 h-3 text-black/80" strokeWidth={3} />}</button>
                <Flag className="w-3.5 h-3.5 shrink-0" style={{ color: ACCENT }} />
                <span className={`flex-1 text-[13px] ${m.done ? 'text-white/40 line-through' : 'text-white/85'}`}>{m.title}</span>
                {m.dueDate && <span className="text-[10px] text-white/40 flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{new Date(m.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                <button type="button" onClick={() => deleteMilestone(m.id)} className="opacity-0 group-hover:opacity-100 p-1 text-white/25 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center gap-4 pl-8 text-[10px] text-white/45 flex-wrap">
                <div className="flex items-center gap-1">
                  <span>Depends on:</span>
                  <select
                    value={m.dependsOnMilestoneId ?? ''}
                    onChange={e => updateMilestone(m.id, { dependsOnMilestoneId: e.target.value || undefined })}
                    className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[9px] text-white/80 focus:outline-none cursor-pointer"
                  >
                    <option value="">None</option>
                    {items.filter(x => x.id !== m.id).map(x => (
                      <option key={x.id} value={x.id} className="bg-[#0e0e14]">{x.title}</option>
                    ))}
                  </select>
                </div>
                {isBlocked && parent && (
                  <span className="text-amber-300 font-semibold flex items-center gap-0.5 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    🔒 Blocked by: {parent.title}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectDecisions({ projectId }: { projectId: string }) {
  const { decisions, addDecision, setDecisionStatus, deleteDecision } = useProjectsStore();
  const items = decisions.filter(d => d.projectId === projectId);
  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <form onSubmit={e => { e.preventDefault(); if (title.trim()) { addDecision(projectId, title.trim(), rationale.trim() || undefined); setTitle(''); setRationale(''); } }} className="shrink-0 flex items-center gap-2 mb-3">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Decision to make…" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25" />
        <input value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Rationale (optional)" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25" />
        <button type="submit" className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: `${ACCENT}26`, border: `1px solid ${ACCENT}44`, color: ACCENT }}>Add</button>
      </form>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1 space-y-2">
        {items.length === 0 && <div className="text-xs text-white/30 px-1">No decisions logged.</div>}
        {items.map(d => {
          const meta = DECISION_META[d.status];
          return (
            <div key={d.id} className="group p-3 rounded-xl bg-white/[0.03] border border-white/8">
              <div className="flex items-center gap-2">
                <Scale className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
                <span className="flex-1 text-[13px] text-white/85">{d.title}</span>
                <Chip label={meta.label} color={meta.color} />
                <button type="button" onClick={() => deleteDecision(d.id)} className="opacity-0 group-hover:opacity-100 p-1 text-white/25 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {d.rationale && <p className="text-[11px] text-white/45 mt-1.5 pl-5">{d.rationale}</p>}
              {d.status === 'open' && (
                <div className="flex items-center gap-2 mt-2.5 pl-5">
                  <button type="button" onClick={() => setDecisionStatus(d.id, 'approved')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20"><Check className="w-3 h-3" /> Approve</button>
                  <button type="button" onClick={() => setDecisionStatus(d.id, 'rejected')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20"><X className="w-3 h-3" /> Reject</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectRisks({ projectId }: { projectId: string }) {
  const { risks, addRisk, toggleRisk, deleteRisk } = useProjectsStore();
  const items = risks.filter(r => r.projectId === projectId);
  const [title, setTitle] = useState('');
  const [sev, setSev] = useState<RiskSeverity>('medium');
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <form onSubmit={e => { e.preventDefault(); if (title.trim()) { addRisk(projectId, title.trim(), sev); setTitle(''); } }} className="shrink-0 flex items-center gap-2 mb-3">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Log a risk…" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25" />
        <select value={sev} onChange={e => setSev(e.target.value as RiskSeverity)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white/80 focus:outline-none">
          {(['low', 'medium', 'high'] as RiskSeverity[]).map(s => <option key={s} value={s} className="bg-[#0e0e14]">{RISK_META[s].label}</option>)}
        </select>
        <button type="submit" className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: `${ACCENT}26`, border: `1px solid ${ACCENT}44`, color: ACCENT }}>Add</button>
      </form>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1 space-y-2">
        {items.length === 0 && <div className="text-xs text-white/30 px-1">No risks logged.</div>}
        {items.map(r => {
          const meta = RISK_META[r.severity];
          return (
            <div key={r.id} className="group flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/8">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: r.mitigated ? '#34d399' : meta.color }} />
              <span className={`flex-1 text-[13px] ${r.mitigated ? 'text-white/40 line-through' : 'text-white/85'}`}>{r.title}</span>
              <Chip label={meta.label} color={meta.color} />
              <button type="button" onClick={() => toggleRisk(r.id)} className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors" style={r.mitigated ? { color: '#34d399', background: 'rgba(52,211,153,0.1)', borderColor: 'rgba(52,211,153,0.25)' } : { color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}>{r.mitigated ? 'Mitigated' : 'Mitigate'}</button>
              <button type="button" onClick={() => deleteRisk(r.id)} className="opacity-0 group-hover:opacity-100 p-1 text-white/25 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectFiles({ projectId }: { projectId: string }) {
  const { files, addFile, deleteFile } = useProjectsStore();
  const items = files.filter(f => f.projectId === projectId);
  const [name, setName] = useState('');
  const [ref, setRef] = useState('');
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <form onSubmit={e => { e.preventDefault(); if (name.trim()) { addFile(projectId, name.trim(), ref.trim() ? 'link' : 'note', ref.trim() || undefined); setName(''); setRef(''); } }} className="shrink-0 flex items-center gap-2 mb-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="File or resource name…" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25" />
        <input value={ref} onChange={e => setRef(e.target.value)} placeholder="Link (optional)" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25" />
        <button type="submit" className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: `${ACCENT}26`, border: `1px solid ${ACCENT}44`, color: ACCENT }}>Add</button>
      </form>
      <p className="shrink-0 text-[10px] text-white/30 mb-3 px-1">Links &amp; notes for now — real file uploads arrive with backend storage.</p>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1 space-y-2">
        {items.length === 0 && <div className="text-xs text-white/30 px-1">No files yet.</div>}
        {items.map(f => (
          <div key={f.id} className="group flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/8">
            <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: ACCENT }} />
            <span className="flex-1 text-[13px] text-white/85">{f.name}</span>
            {f.ref && f.ref !== '#' && <a href={f.ref} target="_blank" rel="noreferrer" className="text-[10px] text-sky-300 hover:underline">open</a>}
            <span className="text-[9px] uppercase tracking-wider text-white/35">{f.kind}</span>
            <button type="button" onClick={() => deleteFile(f.id)} className="opacity-0 group-hover:opacity-100 p-1 text-white/25 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectSources({ projectId }: { projectId: string }) {
  const { projects, tasks, linkCardToProject, unlinkCardFromProject } = useProjectsStore();
  const { items: savedNodes } = useSavedWorkflows();
  const project = projects.find(p => p.id === projectId);
  const projectTasks = tasks.filter(t => t.projectId === projectId);

  if (!project) return null;

  // Linked cards are those explicitly linked or referenced by project tasks
  const linkedCards = savedNodes.filter(node =>
    (project.sourceCardIds || []).includes(node.id) ||
    projectTasks.some(t => t.sourceCardId === node.id)
  );

  // Available cards that can be linked (not already linked)
  const availableCards = savedNodes.filter(node => !linkedCards.some(lc => lc.id === node.id));

  const handleLink = (cardId: string) => {
    if (cardId) linkCardToProject(projectId, cardId);
  };

  const handleUnlink = (cardId: string) => {
    unlinkCardFromProject(projectId, cardId);
  };

  const levelLabel = (level: string) => {
    switch (level) {
      case 'action': return 'Action Node';
      case 'branch': return 'Branch';
      case 'root': return 'Root System';
      default: return 'Company Planet';
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 flex items-center justify-between gap-3 mb-3">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          Linked Source Cards
        </h3>
        {availableCards.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-white/45">Link card:</label>
            <select
              value=""
              onChange={e => handleLink(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white/85 focus:outline-none focus:border-white/20 cursor-pointer"
            >
              <option value="" className="bg-[#0e0e14]">-- Select Card --</option>
              {availableCards.map(node => (
                <option key={node.id} value={node.id} className="bg-[#0e0e14]">
                  {node.actionLabel || node.branchLabel || node.rootLabel || node.companyName} ({node.roleLabel})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1 space-y-2">
        {linkedCards.length === 0 && (
          <div className="text-xs text-white/30 px-1 py-4">No source cards linked to this project yet. Use "Add to Project" from saved cards, or select one above.</div>
        )}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {linkedCards.map(node => {
            const title = node.actionLabel || node.branchLabel || node.rootLabel || node.companyName;
            const trail = [node.companyName, node.rootLabel, node.branchLabel].filter(Boolean);
            const isTaskLinked = projectTasks.some(t => t.sourceCardId === node.id);

            return (
              <div
                key={node.id}
                className="group relative flex flex-col justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.05] transition-all"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-white/10 text-white/50">
                      {node.roleLabel}
                    </span>
                    <span className="text-[9px] text-white/35">
                      {levelLabel(node.level)}
                    </span>
                    {isTaskLinked && (
                      <span className="ml-auto text-[9px] font-semibold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                        Task Linked
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-white leading-snug">{title}</h4>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[10px] text-white/40">
                    {trail.map((t, idx) => (
                      <span key={idx} className="flex items-center gap-1">
                        {idx > 0 && <ChevronRight className="w-2.5 h-2.5 text-white/20" />}
                        <span className="truncate max-w-[100px]">{t}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/5 mt-3 pt-2">
                  <span className="text-[9px] text-white/25 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    saved {new Date(node.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUnlink(node.id)}
                    className="p-1 rounded text-white/35 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Unlink card"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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

function projectAIReply(input: string, ctx: { name: string; done: number; total: number; openRisks: number; openDecisions: number }): string {
  const p = input.toLowerCase();
  const pct = ctx.total ? Math.round((ctx.done / ctx.total) * 100) : 0;
  if (!input.trim() || p.includes('status') || p.includes('summary') || p.includes('where')) {
    return `${ctx.name}: ${ctx.done}/${ctx.total} tasks done (${pct}%), ${ctx.openRisks} open risk${ctx.openRisks !== 1 ? 's' : ''}, ${ctx.openDecisions} open decision${ctx.openDecisions !== 1 ? 's' : ''}. ${ctx.openRisks ? 'Suggest tackling the highest-severity risk next.' : 'No blocking risks right now.'}`;
  }
  if (p.includes('risk')) return `There ${ctx.openRisks === 1 ? 'is' : 'are'} ${ctx.openRisks} open risk${ctx.openRisks !== 1 ? 's' : ''} on ${ctx.name}. Want me to turn one into a mitigation task?`;
  if (p.includes('task') || p.includes('next')) return `${ctx.total - ctx.done} task${(ctx.total - ctx.done) !== 1 ? 's' : ''} remain. Finish the in-progress items first, then unblock dependencies.`;
  return `On ${ctx.name} (${ctx.done}/${ctx.total} done): noted. Ask me for a status summary or a risk review anytime.`;
}

function ProjectChat({ projectId }: { projectId: string }) {
  const { chat, members, currentMemberId, addChat, tasks, risks, decisions, projects } = useProjectsStore();
  const msgs = chat.filter(c => c.projectId === projectId);
  const project = projects.find(p => p.id === projectId);
  const pt = tasks.filter(t => t.projectId === projectId);
  const ctx = {
    name: project?.name ?? 'this project',
    done: pt.filter(t => t.status === 'done').length,
    total: pt.length,
    openRisks: risks.filter(r => r.projectId === projectId && !r.mitigated).length,
    openDecisions: decisions.filter(d => d.projectId === projectId && d.status === 'open').length,
  };
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs.length]);

  const sendMember = () => { if (text.trim()) { addChat(projectId, currentMemberId, 'member', text.trim()); setText(''); } };
  const askAI = () => {
    const q = text.trim();
    if (q) addChat(projectId, currentMemberId, 'member', q);
    setText('');
    window.setTimeout(() => addChat(projectId, 'ai', 'ai', projectAIReply(q, ctx)), 400);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col rounded-xl bg-white/[0.02] border border-white/8 overflow-hidden">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3 space-y-3">
        {msgs.length === 0 && <div className="text-xs text-white/30 px-1">No messages yet. Say hello, or tap AI for a status.</div>}
        {msgs.map(m => {
          const isAI = m.role === 'ai';
          const author = members.find(x => x.id === m.authorId);
          const mine = m.authorId === currentMemberId && !isAI;
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              {isAI
                ? <span className="w-7 h-7 rounded-full grid place-items-center shrink-0" style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}44` }}><Bot className="w-4 h-4" style={{ color: ACCENT }} /></span>
                : <Avatar member={author} size={28} />}
              <div className="max-w-[78%]">
                <div className={`text-[9px] text-white/35 mb-0.5 ${mine ? 'text-right' : ''}`}>{isAI ? 'AI Assistant' : author?.name ?? 'Member'}</div>
                <div className="rounded-2xl px-3 py-2 text-[12px] leading-relaxed" style={isAI ? { background: `${ACCENT}14`, border: `1px solid ${ACCENT}30`, color: 'rgba(255,255,255,0.82)' } : mine ? { background: 'rgba(255,255,255,0.1)', color: '#fff' } : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.82)' }}>{m.text}</div>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={e => { e.preventDefault(); sendMember(); }} className="shrink-0 p-3 border-t border-white/8 flex items-center gap-2">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Message the team…" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25" />
        <button type="button" onClick={askAI} title="Ask the AI assistant" className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-semibold" style={{ background: `${ACCENT}1f`, border: `1px solid ${ACCENT}3a`, color: ACCENT }}><Bot className="w-3.5 h-3.5" /> AI</button>
        <button type="submit" className="w-8 h-8 rounded-xl grid place-items-center shrink-0" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}><Send className="w-3.5 h-3.5" /></button>
      </form>
    </div>
  );
}

/* ── project space ───────────────────────────────────────────────────────── */

type ProjectTab = 'board' | 'milestones' | 'decisions' | 'risks' | 'files' | 'chat' | 'sources';

function ProjectSpace({ projectId, onBack, onSelectTask }: { projectId: string; onBack: () => void; onSelectTask?: (id: string) => void }) {
  const { projects, tasks, members, addTask, updateTask, deleteTask, deleteProject, setProjectMembers, updateProject } = useProjectsStore();
  const { profile } = useAuth();
  const { goals } = useBdtGoals(profile?.company_id ?? null);
  const project = projects.find(p => p.id === projectId);
  const [newTask, setNewTask] = useState('');
  const [newAssignee, setNewAssignee] = useState<string>('');
  const [manageMembers, setManageMembers] = useState(false);
  const [tab, setTab] = useState<ProjectTab>('board');

  if (!project) {
    return <div className="w-full h-full grid place-items-center text-white/40 text-sm">Project not found.<button onClick={onBack} className="ml-2 underline">Back</button></div>;
  }

  const projectTasks = tasks.filter(t => t.projectId === projectId);
  const prog = taskProgress(projectTasks);
  const status = PROJECT_STATUS_META[project.status];
  const projMembers = project.memberIds.map(id => members.find(m => m.id === id)).filter(Boolean) as Member[];

  return (
    <div className="ws-sn-detail w-full h-full flex flex-col min-h-0">
      {/* header */}
      <div className="shrink-0">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 transition-colors mb-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Superspace
        </button>
        <div className="rounded-2xl p-5 mb-3 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${status.color}14, rgba(255,255,255,0.02))`, border: `1px solid ${status.color}30` }}>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-white/8 text-white/55 capitalize flex items-center gap-1"><Briefcase className="w-3 h-3" /> {project.type}</span>
            <Chip label={status.label} color={status.color} />
            <span className="ml-auto text-[11px] text-white/40 tabular-nums">{prog.done}/{prog.total} done · {prog.pct}%</span>
            <button type="button" onClick={() => { if (confirm('Delete this project and its tasks?')) { deleteProject(projectId); onBack(); } }} className="p-1.5 rounded-lg text-white/30 hover:text-rose-300 hover:bg-rose-500/10"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <h2 className="text-xl font-bold text-white">{project.name}</h2>
          {project.description && <p className="text-[13px] text-white/60 mt-1.5 max-w-2xl">{project.description}</p>}
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-[11px] text-white/55">
              <Target className="w-3.5 h-3.5" style={{ color: ACCENT }} />
              <select
                value={project.goalId ?? ''}
                onChange={e => { const g = goals.find(x => x.id === e.target.value); updateProject(projectId, { goalId: e.target.value || undefined, goalLink: g?.title }); }}
                className="bg-transparent text-white/70 text-[11px] focus:outline-none cursor-pointer hover:text-white"
                title="Link this project to a goal"
              >
                <option value="" className="bg-[#0e0e14]">No goal linked</option>
                {goals.map(g => <option key={g.id} value={g.id} className="bg-[#0e0e14]">{g.title}</option>)}
              </select>
            </span>
            <button type="button" onClick={() => setManageMembers(m => !m)} className="flex items-center gap-1.5 text-[11px] text-white/55 hover:text-white">
              <Users className="w-3.5 h-3.5" /> <AvatarStack ids={project.memberIds} members={members} /> <span className="underline ml-1">Manage</span>
            </button>
          </div>
          {manageMembers && (
            <div className="mt-3 pt-3 border-t border-white/8 flex flex-wrap gap-1.5">
              {members.map(m => {
                const on = project.memberIds.includes(m.id);
                return (
                  <button key={m.id} type="button"
                    onClick={() => setProjectMembers(projectId, on ? project.memberIds.filter(x => x !== m.id) : [...project.memberIds, m.id])}
                    className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border transition-all"
                    style={on ? { background: `${memberColor(m.id)}22`, borderColor: `${memberColor(m.id)}55`, color: '#fff' } : { background: 'transparent', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}>
                    <Avatar member={m} size={16} /> {m.name} <span className="text-[9px] opacity-60">{MEMBER_ROLE_META[m.role].label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* sub-tabs */}
      <div className="shrink-0 flex items-center gap-1 p-0.5 mb-3 rounded-lg bg-white/5 border border-white/10 w-fit max-w-full overflow-x-auto scrollbar-hide">
        {([
          { id: 'board', label: 'Board', Icon: LayoutGrid },
          { id: 'milestones', label: 'Milestones', Icon: Flag },
          { id: 'decisions', label: 'Decisions', Icon: Scale },
          { id: 'risks', label: 'Risks', Icon: AlertTriangle },
          { id: 'files', label: 'Files', Icon: FileText },
          { id: 'chat', label: 'Chat', Icon: MessageSquare },
          { id: 'sources', label: 'Sources', Icon: Layers },
        ] as const).map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap ${tab === id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/75'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'board' ? (
        <>
          <form
            onSubmit={(e) => { e.preventDefault(); if (newTask.trim()) { addTask(projectId, newTask.trim(), newAssignee || project.ownerId, 'todo'); setNewTask(''); } }}
            className="shrink-0 flex items-center gap-2 mb-3"
          >
            <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add a task…" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25" />
            <select value={newAssignee} onChange={e => setNewAssignee(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white/80 focus:outline-none">
              <option value="" className="bg-[#0e0e14]">Owner</option>
              {projMembers.map(m => <option key={m.id} value={m.id} className="bg-[#0e0e14]">{m.name}</option>)}
            </select>
            <button type="submit" className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: `${ACCENT}26`, border: `1px solid ${ACCENT}44`, color: ACCENT }}>Add</button>
          </form>
          <ProjectKanban
            tasks={projectTasks}
            members={members}
            onMove={(id, s) => updateTask(id, { status: s })}
            onDelete={deleteTask}
            onSelectTask={onSelectTask}
          />
        </>
      ) : tab === 'milestones' ? <ProjectMilestones projectId={projectId} />
        : tab === 'decisions' ? <ProjectDecisions projectId={projectId} />
        : tab === 'risks' ? <ProjectRisks projectId={projectId} />
        : tab === 'files' ? <ProjectFiles projectId={projectId} />
        : tab === 'chat' ? <ProjectChat projectId={projectId} />
        : <ProjectSources projectId={projectId} />}
    </div>
  );
}

/* ── member space ─────────────────────────────────────────────────────────────── */

function MemberSpace({ onSelectTask }: { onSelectTask?: (id: string) => void }) {
  const { projects, tasks, members, currentMemberId, updateTask } = useProjectsStore();
  const { profile } = useAuth();
  const { goals } = useBdtGoals(profile?.company_id ?? null);
  const me = members.find(m => m.id === currentMemberId);
  const myTasks = tasks.filter(t => t.assigneeId === currentMemberId);
  const projName = (id: string) => projects.find(p => p.id === id)?.name ?? 'Project';
  const open = myTasks.filter(t => t.status !== 'done').length;
  const doneCount = myTasks.length - open;

  const today = new Date().toISOString().slice(0, 10);
  const openTasks = myTasks.filter(t => t.status !== 'done');

  // Today plan: sort by due date soonest first, then in_progress > review > todo
  const todayPlan = [...openTasks].sort((a, b) => {
    const ad = a.dueDate ?? '9999';
    const bd = b.dueDate ?? '9999';
    if (ad !== bd) return ad < bd ? -1 : 1;
    const order = ['in_progress', 'review', 'todo'];
    return order.indexOf(a.status) - order.indexOf(b.status);
  });

  // Goal context per task
  const goalForTask = (t: ProjectTask) => {
    const proj = projects.find(p => p.id === t.projectId);
    return goals.find(g => g.id === proj?.goalId)?.title ?? proj?.goalLink;
  };

  // Personal metrics
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const completedThisWeek = myTasks.filter(t => t.status === 'done' && t.createdAt >= oneWeekAgo).length;
  const completedPrevWeek = myTasks.filter(t => t.status === 'done' && t.createdAt >= twoWeeksAgo && t.createdAt < oneWeekAgo).length;
  const velocityTrend = completedThisWeek > completedPrevWeek ? '↑' : completedThisWeek < completedPrevWeek ? '↓' : '→';
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const dueThisWeek = myTasks.filter(t => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd).length;
  const doneTasks = myTasks.filter(t => t.status === 'done');
  const onTimePct = doneTasks.length
    ? Math.round(doneTasks.filter(t => !t.dueDate || t.dueDate >= t.createdAt.slice(0, 10)).length / doneTasks.length * 100)
    : 100;
  const overdue = openTasks.filter(t => t.dueDate && t.dueDate < today).length;
  // Quality: tasks completed without being sent back from done (approximated as done tasks / total assigned)
  const qualityPct = myTasks.length ? Math.round((doneTasks.length / myTasks.length) * 100) : 0;
  // Active projects count
  const activeProjectCount = new Set(openTasks.map(t => t.projectId)).size;

  const [activeTab, setActiveTab] = useState<'today' | 'all'>('today');

  return (
    <div className="ws-sn-detail w-full h-full flex flex-col min-h-0">
      {/* header */}
      <div className="shrink-0 flex items-center gap-2 px-1 pb-3">
        <Avatar member={me} size={32} />
        <div>
          <h3 className="text-sm font-semibold text-white">My Work</h3>
          <span className="text-[10px] text-white/40">{open} open · {doneCount} done across {new Set(myTasks.map(t => t.projectId)).size} projects</span>
        </div>
      </div>

      {/* personal metrics */}
      <div className="shrink-0 grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
        {[
          { label: 'Velocity', value: `${completedThisWeek}${velocityTrend}`, color: '#34d399', title: 'Tasks done this week vs last' },
          { label: 'Due soon', value: dueThisWeek, color: ACCENT, title: 'Tasks due within 7 days' },
          { label: 'Overdue', value: overdue, color: overdue > 0 ? '#fb7185' : '#34d399', title: 'Overdue open tasks' },
          { label: 'On-time', value: `${onTimePct}%`, color: onTimePct >= 80 ? '#34d399' : '#fbbf24', title: 'Tasks completed on or before due date' },
          { label: 'Quality', value: `${qualityPct}%`, color: qualityPct >= 70 ? '#34d399' : '#fbbf24', title: 'Completion rate across all assigned tasks' },
          { label: 'Projects', value: activeProjectCount, color: '#a78bfa', title: 'Active projects with open tasks' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 bg-white/[0.03] border border-white/8" title={s.title}>
            <div className="text-[9px] uppercase tracking-wider text-white/35 mb-1">{s.label}</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div className="shrink-0 flex items-center gap-1 p-0.5 mb-3 rounded-lg bg-white/5 border border-white/10 w-fit">
        {[{ id: 'today', label: 'Today Plan' }, { id: 'all', label: 'All Tasks' }].map(tab => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
              activeTab === tab.id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/75'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'today' ? (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1 space-y-2">
          {todayPlan.length === 0 && (
            <div className="text-xs text-white/30 px-1 py-8 text-center">No open tasks — you&apos;re all caught up 🎉</div>
          )}
          {todayPlan.map(t => {
            const st = TASK_STATUS_META[t.status];
            const isOverdue = t.dueDate && t.dueDate < today;
            const goalCtx = goalForTask(t);
            const blocker = tasks.find(x => x.id === t.blockedByTaskId);
            const isBlocked = blocker && blocker.status !== 'done';
            return (
              <div key={t.id} onClick={() => onSelectTask?.(t.id)} className="group flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/8 hover:border-white/15 transition-all cursor-pointer">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); updateTask(t.id, { status: t.status === 'done' ? 'todo' : 'done' }); }}
                  className="mt-0.5 w-5 h-5 rounded-full border shrink-0 flex items-center justify-center transition-all"
                  style={t.status === 'done'
                    ? { background: '#34d399', borderColor: '#34d399' }
                    : { background: 'transparent', borderColor: 'rgba(255,255,255,0.25)' }}
                >
                  {t.status === 'done' && <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-white/85 leading-snug">{t.title}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${st.color}22`, color: st.color }}>{st.label}</span>
                    <span className="text-[9px] text-white/35">{projName(t.projectId)}</span>
                    {t.dueDate && (
                      <span className={`text-[9px] flex items-center gap-0.5 font-medium ${isOverdue ? 'text-rose-400' : 'text-white/40'}`}>
                        <Clock className="w-2.5 h-2.5" />
                        {isOverdue ? 'Overdue · ' : ''}{new Date(t.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {goalCtx && (
                      <span className="text-[9px] flex items-center gap-0.5" style={{ color: `${ACCENT}99` }}>
                        <Target className="w-2.5 h-2.5" />{goalCtx}
                      </span>
                    )}
                    {isBlocked && blocker && (
                      <span className="text-[9px] flex items-center gap-0.5 text-amber-300 font-semibold bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                        🔒 Blocked by: {blocker.title}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ProjectKanban
          tasks={myTasks}
          members={members}
          onMove={(id, s) => updateTask(id, { status: s })}
          projectNameFor={t => projName(t.projectId)}
          onSelectTask={onSelectTask}
        />
      )}
    </div>
  );
}

/* ── goals & metrics (Goal Superalignment + Metric Impact) ───────────────── */

function NewGoalForm({ onCreate, onClose }: {
  onCreate: (input: { title: string; horizon: Horizon }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [horizon, setHorizon] = useState<Horizon>('quarterly');

  return (
    <div className="fixed inset-0 z-[140] grid place-items-center p-6" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="ws-sn-detail w-full max-w-md rounded-2xl p-6 bg-[#0e0e14] border border-white/12 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-white flex items-center gap-2"><Target className="w-4 h-4" style={{ color: ACCENT }} /> New Goal</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>

        <label className="text-[10px] uppercase tracking-wider text-white/40">Goal</label>
        <input value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="e.g. Reach $250k MRR"
          className="w-full mt-1 mb-4 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30" />

        <label className="text-[10px] uppercase tracking-wider text-white/40">Horizon</label>
        <div className="flex flex-wrap gap-1.5 mt-1 mb-4">
          {HORIZON_ORDER.map(h => (
            <button key={h} type="button" onClick={() => setHorizon(h)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-all"
              style={horizon === h ? { background: `${HORIZON_META[h].color}22`, borderColor: `${HORIZON_META[h].color}55`, color: HORIZON_META[h].color } : { background: 'transparent', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
              {HORIZON_META[h].label}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-white/35 mb-6">
          Metrics are now production objects. Create this goal first, then attach a canonical metric from the goal row.
        </p>

        <div className="flex items-center gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-white/55 hover:text-white border border-white/10">Cancel</button>
          <button type="button" disabled={!title.trim()}
            onClick={() => { onCreate({ title: title.trim(), horizon }); onClose(); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ background: `${ACCENT}26`, border: `1px solid ${ACCENT}55`, color: ACCENT }}>
            Create Goal
          </button>
        </div>
      </div>
    </div>
  );
}

function GoalsMetrics() {
  const { projects, tasks, members } = useProjectsStore();
  const { profile, role } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { goals, createGoal, deleteGoal } = useBdtGoals(companyId);
  const {
    metrics,
    rollups,
    loading: metricsLoading,
    createMetric,
    createDraft,
    updateMetricValue,
  } = useCanonicalMetrics(companyId, { status: 'active' });
  const { members: teamMembers } = useTeamMembers(companyId);
  const canEditMetrics = isMetricAdmin(role);
  const [showForm, setShowForm] = useState(false);
  const [metricWizardTarget, setMetricWizardTarget] = useState<{
    target_type: 'company' | 'goal';
    target_id: string;
    label: string;
  } | null>(null);
  const handleCreateGoal = ({ title, horizon }: { title: string; horizon: string }) => {
    createGoal({ title, horizon });
  };

  const projsForGoal = (goalId: string, title: string) => projects.filter(p =>
    p.goalId ? p.goalId === goalId : (p.goalLink?.trim().toLowerCase() === title.trim().toLowerCase()),
  );
  const goalProgress = (goalId: string, title: string): number | null => {
    const ps = projsForGoal(goalId, title);
    if (!ps.length) return null;
    const pcts = ps.map(p => taskProgress(tasks.filter(t => t.projectId === p.id)).pct);
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  };

  const horizons = HORIZON_ORDER.filter(h => goals.some(g => g.horizon === h));
  const companyRollup = rollups.find(r => r.target_type === 'company' && r.target_id === companyId);
  const goalRollup = (goalId: string) => rollups.find(r => r.target_type === 'goal' && r.target_id === goalId);
  const goalMetric = (goalId: string) => metrics.find(m => m.links.some(l => l.target_type === 'goal' && l.target_id === goalId));
  const openCompanyMetricWizard = () => {
    if (!companyId) return;
    setMetricWizardTarget({ target_type: 'company', target_id: companyId, label: 'Company Health' });
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-3 px-1 pb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4" style={{ color: ACCENT }} />
          <h3 className="text-sm font-semibold text-white">Goals &amp; Metrics</h3>
          <span className="text-[10px] text-white/40">alignment &amp; impact</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canEditMetrics && companyId && (
            <button type="button" onClick={openCompanyMetricWizard} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}44`, color: ACCENT }}>
              <Plus className="w-3.5 h-3.5" /> New Metric
            </button>
          )}
          <button type="button" onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}44`, color: ACCENT }}>
            <Plus className="w-3.5 h-3.5" /> New Goal
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1 pb-2 space-y-5">
        <MetricRollupHealthPanel rollup={companyRollup} title="Company Health" />

        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-white/45">Canonical Metrics</div>
            {metricsLoading && <span className="text-[10px] text-white/30">Loading...</span>}
          </div>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {metrics.map(m => (
              <MetricCard key={m.id} metric={m} canEdit={canEditMetrics} onUpdateValue={updateMetricValue} />
            ))}
          </div>
          {!metricsLoading && metrics.length === 0 && (
            <EmptyMetricsState canEdit={canEditMetrics && Boolean(companyId)} onCreate={openCompanyMetricWizard} />
          )}
        </div>

        {/* goal hierarchy */}
        <div>
          <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-white/45 mb-2 px-1">Goal hierarchy</div>
          <div className="space-y-4">
            {horizons.map(h => (
              <div key={h}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: HORIZON_META[h].color }} />
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: HORIZON_META[h].color }}>{HORIZON_META[h].label}</span>
                </div>
                <div className="space-y-2">
                  {goals.filter(g => g.horizon === h).map(g => {
                    const owner = members.find(m => m.id === g.owner_id);
                    const legacyProg = goalProgress(g.id, g.title);
                    const rollup = goalRollup(g.id);
                    const prog = rollup?.health_score ?? legacyProg;
                    const metric = goalMetric(g.id);
                    const ps = projsForGoal(g.id, g.title);
                    return (
                      <div key={g.id} className="group flex items-center gap-4 p-3.5 rounded-xl bg-white/[0.03] border border-white/8 hover:border-white/15 transition-all">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-white">{g.title}</span>
                            {metric && <Chip label={metric.name} color={ACCENT} />}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/40">
                            <span>{ps.length} project{ps.length !== 1 ? 's' : ''}</span>
                            {owner && <span className="flex items-center gap-1"><Avatar member={owner} size={16} /> {owner.name}</span>}
                          </div>
                        </div>
                        <div className="w-40 shrink-0">
                          {prog === null ? (
                            <span className="text-[10px] text-white/30">No linked metrics</span>
                          ) : (
                            <>
                              <div className="flex justify-between text-[10px] text-white/40 mb-1"><span>Progress</span><span style={{ color: ACCENT }}>{prog}%</span></div>
                              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${prog}%`, background: `linear-gradient(90deg, ${ACCENT}, #9bd9ff)` }} /></div>
                            </>
                          )}
                        </div>
                        {canEditMetrics && (
                          <button
                            type="button"
                            onClick={() => setMetricWizardTarget({ target_type: 'goal', target_id: g.id, label: `Goal: ${g.title}` })}
                            className="opacity-0 group-hover:opacity-100 p-1 text-white/25 hover:text-white transition-all"
                            title="Create metric for this goal"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button type="button" onClick={() => deleteGoal(g.id)} className="opacity-0 group-hover:opacity-100 p-1 text-white/25 hover:text-rose-300 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/30 mt-3 px-1 flex items-center gap-1.5"><Flag className="w-3 h-3" /> Goal progress now rolls up from canonical metric links. Local project/task completion is visual-only until those objects are rebuilt.</p>
        </div>
      </div>

      {showForm && <NewGoalForm onCreate={handleCreateGoal} onClose={() => setShowForm(false)} />}
      {metricWizardTarget && companyId && (
        <MetricCreateWizard
          companyId={companyId}
          members={teamMembers}
          targetType={metricWizardTarget.target_type}
          targetId={metricWizardTarget.target_id}
          targetLabel={metricWizardTarget.label}
          createMetric={createMetric}
          createDraft={createDraft}
          onClose={() => setMetricWizardTarget(null)}
        />
      )}
    </div>
  );
}

/* ── main ────────────────────────────────────────────────────────────────── */

import { WorkspaceTaskDetailDrawer } from './WorkspaceTaskDetailDrawer';

export function WorkspaceProjectsSpace() {
  const [view, setView] = useState<'super' | 'member' | 'goals'>('super');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const { workspaceMode } = useFounderWorkspace();

  // Auto-switch sub-view when workspace mode changes
  useEffect(() => {
    setProjectId(null);
    if (workspaceMode === 'execution') setView('member');
    else if (workspaceMode === 'review') setView('goals');
    else setView('super');
  }, [workspaceMode]);

  useEffect(() => {
    const handleOpenProject = (e: Event & { detail?: { projectId: string } }) => {
      if (e.detail?.projectId) {
        setProjectId(e.detail.projectId);
      }
    };
    const handleOpenMyWork = () => {
      setProjectId(null);
      setView('member');
    };
    const handleOpenTask = (e: Event & { detail?: { taskId: string } }) => {
      if (e.detail?.taskId) {
        setSelectedTaskId(e.detail.taskId);
      }
    };
    const handleOpenGoalsMetrics = () => {
      setProjectId(null);
      setView('goals');
    };

    window.addEventListener('open-project' as any, handleOpenProject);
    window.addEventListener('open-my-work' as any, handleOpenMyWork);
    window.addEventListener('open-task' as any, handleOpenTask);
    window.addEventListener('open-goals-metrics' as any, handleOpenGoalsMetrics);
    return () => {
      window.removeEventListener('open-project' as any, handleOpenProject);
      window.removeEventListener('open-my-work' as any, handleOpenMyWork);
      window.removeEventListener('open-task' as any, handleOpenTask);
      window.removeEventListener('open-goals-metrics' as any, handleOpenGoalsMetrics);
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      {projectId ? (
        <ProjectSpace projectId={projectId} onBack={() => setProjectId(null)} onSelectTask={setSelectedTaskId} />
      ) : (
        <>
          <div className="shrink-0 flex items-center gap-1 p-0.5 mb-3 rounded-lg bg-white/5 border border-white/10 w-fit">
            {([
              { id: 'super', label: 'Superspace', Icon: LayoutGrid },
              { id: 'member', label: 'My Work', Icon: UserCircle2 },
              { id: 'goals', label: 'Goals & Metrics', Icon: Target },
            ] as const).map(({ id, label, Icon }) => (
              <button key={id} type="button" onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${view === id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/75'}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0">
            {view === 'super' ? <Superspace onOpenProject={setProjectId} onSelectTask={setSelectedTaskId} />
              : view === 'member' ? <MemberSpace onSelectTask={setSelectedTaskId} />
              : <GoalsMetrics />}
          </div>
        </>
      )}

      {selectedTaskId && (
        <WorkspaceTaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      )}
    </div>
  );
}
