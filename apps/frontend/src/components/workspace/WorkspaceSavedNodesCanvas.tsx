import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bookmark, BookmarkX, ExternalLink, Clock, ChevronRight, ArrowLeft,
  Sparkles, Layers, Compass, StickyNote, Network,
  MessageSquare, Send, ListTodo, Target, Link2, Activity, Database,
  Users, Plus, History, GitBranch, Scale, Bot, Mic, Folder,
} from 'lucide-react';
import {
  useSavedWorkflows,
  ROLE_COLORS,
  ROLE_ORDER,
  COMPANY_TAG_ICONS,
  COMPANY_TAG_COLORS,
  COMPANY_TAG_LABELS,
  SYNC_STATUS_META,
  SYNC_STATUS_ORDER,
  CONNECTION_TYPE_META,
  type SavedWorkflowItem,
  type CardConnectionType,
} from '../../lib/useSavedWorkflows';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';
import { useProjectsStore } from '../../lib/useProjectsStore';
import { useVoice } from '../../context/VoiceContext';
import { ActionNodeWorkspace } from './ActionNodeWorkspace';
import type {
  UserPlanetRole,
  PlanetActionNode,
  PlanetBranchNode,
  PlanetRootNode,
  CompanyPlanetContext,
} from '../../data/companyPlanetRoots';

export interface WorkspaceSavedNodesCanvasProps {
  isFullscreen?: boolean;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function nodeTitle(item: SavedWorkflowItem): string {
  return item.actionLabel || item.branchLabel || item.rootLabel || item.companyName;
}

function levelLabel(level: SavedWorkflowItem['level']): string {
  switch (level) {
    case 'action': return 'Action Node';
    case 'branch': return 'Branch';
    case 'root': return 'Root System';
    default: return 'Company Planet';
  }
}

function confidenceFor(level: SavedWorkflowItem['level']): number {
  switch (level) {
    case 'action': return 88;
    case 'branch': return 76;
    case 'root': return 68;
    default: return 60;
  }
}

function crumbs(item: SavedWorkflowItem): string[] {
  return [item.companyName, item.rootLabel, item.branchLabel, item.actionLabel]
    .filter(Boolean) as string[];
}

/** Rebuild the rich ActionNodeWorkspace inputs from a saved card (no id re-resolution). */
function buildNodesFromSaved(item: SavedWorkflowItem) {
  if (!item.actionId) return null;
  const action: PlanetActionNode = {
    id: item.actionId,
    label: item.actionLabel ?? 'Action',
    hint: item.actionHint,
  };
  const branch: PlanetBranchNode = {
    id: item.branchId ?? `${item.actionId}_branch`,
    label: item.branchLabel ?? '',
    nodeType: 'decision',
    actions: [action],
  };
  const root: PlanetRootNode = {
    id: item.rootId ?? `${item.actionId}_root`,
    label: item.rootLabel ?? '',
    description: item.rootDescription ?? '',
    relevance: 80,
    color: item.rootColor ?? '#C1AEFF',
    branches: [branch],
  };
  const context: CompanyPlanetContext = {
    companyId: item.companyId,
    companyName: item.companyName,
    role: item.role,
    roleLabel: item.roleLabel,
    roots: [root],
  };
  return { root, branch, action, context };
}

/* ── empty state ─────────────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-6 select-none">
      <div className="relative mb-7 ws-sn-orb">
        <span className="ws-sn-ring absolute inset-0 rounded-full border border-[#C1AEFF]/40" />
        <span className="ws-sn-ring absolute inset-0 rounded-full border border-[#C1AEFF]/30" style={{ animationDelay: '1.4s' }} />
        <div
          className="relative w-20 h-20 rounded-full grid place-items-center"
          style={{
            background: 'radial-gradient(circle at 35% 30%, rgba(193,174,255,0.35), rgba(99,102,241,0.12) 60%, transparent 75%)',
            border: '1px solid rgba(193,174,255,0.35)',
            boxShadow: '0 0 40px rgba(193,174,255,0.25), inset 0 0 24px rgba(193,174,255,0.15)',
          }}
        >
          <Bookmark className="w-8 h-8 text-[#EDD9FF]" strokeWidth={1.5} />
        </div>
      </div>

      <h3
        className="text-2xl font-bold tracking-tight mb-2"
        style={{ background: 'linear-gradient(90deg,#EDD9FF,#9bd9ff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
      >
        No saved nodes yet
      </h3>
      <p className="text-sm text-white/45 max-w-md leading-relaxed mb-7">
        Explore the universe, open any company planet, and tap{' '}
        <span className="text-white/70 font-medium">Save Workflow</span> on a node.
        Everything you bookmark lands here as a card you can re-open and work on.
      </p>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('request-close-workspace'))}
        className="group flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110 hover:-translate-y-0.5"
        style={{
          background: 'linear-gradient(135deg, rgba(193,174,255,0.18), rgba(95,208,230,0.12))',
          border: '1px solid rgba(193,174,255,0.34)',
          color: '#EDD9FF',
          boxShadow: '0 6px 24px rgba(193,174,255,0.18)',
        }}
      >
        <Compass className="w-4 h-4 transition-transform group-hover:rotate-12" />
        Explore the Universe
      </button>
    </div>
  );
}

/* ── small building blocks ───────────────────────────────────────────────── */

function RelChip({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string; }) {
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
      style={{ background: `${color}14`, border: `1px solid ${color}30` }}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
      <span className="text-white/40 text-[10px] uppercase tracking-wide">{label}</span>
      <span className="text-white/85 font-medium truncate">{value}</span>
    </div>
  );
}

type ChatMsg = { id: string; role: 'user' | 'card'; text: string };

function respondTo(prompt: string, item: SavedWorkflowItem): string {
  const t = nodeTitle(item);
  const p = prompt.toLowerCase();
  const where = crumbs(item).join(' › ');
  if (p.includes('task') || p.includes('next step') || p.includes('do ')) {
    return `Three next steps for "${t}":\n1. Validate why this ${levelLabel(item.level).toLowerCase()} matters to your ${item.roleLabel} goals.\n2. Gather one piece of evidence — a metric, doc, or interview.\n3. Decide: convert it to a task, or watch it for signals.\n\nTip: use “Convert to Task” to push step 1 onto your board.`;
  }
  if (p.includes('summar')) {
    return `“${t}” is a ${levelLabel(item.level).toLowerCase()} saved from ${where}, seen through the ${item.roleLabel} lens${item.planetTag ? ` and tagged ${COMPANY_TAG_LABELS[item.planetTag]}` : ''}. ${item.actionHint || item.rootDescription || 'No extra context was captured at save time.'}`;
  }
  if (p.includes('why') || p.includes('matter')) {
    return `As a ${item.roleLabel}, ${item.planetTag ? `this ${COMPANY_TAG_LABELS[item.planetTag]} directly shapes your positioning. ` : ''}${item.actionHint || item.rootDescription || `“${t}” is on your radar and can be turned into concrete work whenever you're ready.`}`;
  }
  return `About “${t}” (${where}): ${item.actionHint || item.rootDescription || 'no stored context yet'}. Ask me to summarize it, explain why it matters, or generate tasks.`;
}

/* ── card chat (text + voice) ────────────────────────────────────────────── */

function CardChat({ item, accent }: { item: SavedWorkflowItem; accent: string }) {
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 'intro', role: 'card', text: `Ask me anything about “${nodeTitle(item)}”. I can summarize it, explain why it matters, or generate tasks.` },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { voiceState, toggle: toggleVoice, sendContextUpdate } = useVoice();
  const ctxSent = useRef(false);

  const contextLine = `The user opened the saved node "${nodeTitle(item)}" (${crumbs(item).join(' › ')}), viewed as ${item.roleLabel}. ${item.actionHint || item.rootDescription || ''} Help them reason about it and end with one suggested action.`;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  // Feed the node's context into the live voice session once it connects.
  useEffect(() => {
    if (mode === 'voice' && voiceState === 'listening' && !ctxSent.current) {
      sendContextUpdate(contextLine);
      ctxSent.current = true;
    }
    if (voiceState === 'idle') ctxSent.current = false;
  }, [mode, voiceState, sendContextUpdate, contextLine]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    setMessages(prev => [...prev, { id: `u_${Date.now()}`, role: 'user', text: q }]);
    setInput('');
    setThinking(true);
    window.setTimeout(() => {
      setMessages(prev => [...prev, { id: `c_${Date.now()}`, role: 'card', text: respondTo(q, item) }]);
      setThinking(false);
    }, 600);
  };

  const voiceActive = voiceState === 'listening' || voiceState === 'speaking';
  const voiceLabel =
    voiceState === 'connecting' ? 'Connecting…' :
    voiceState === 'listening' ? 'Listening…' :
    voiceState === 'speaking' ? 'AI speaking…' :
    voiceState === 'error' ? 'Tap to retry' :
    'Tap to talk';
  const voiceColor = voiceState === 'error' ? '#fb7185' : accent;

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 flex flex-col h-[440px] overflow-hidden">
      {/* header + mode toggle */}
      <div className="shrink-0 px-3 py-2.5 border-b border-white/8 flex items-center gap-2">
        <MessageSquare className="w-3.5 h-3.5" style={{ color: accent }} />
        <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-white/45">Card Chat</span>
        <div className="ml-auto flex items-center gap-0.5 p-0.5 rounded-lg bg-white/5 border border-white/10">
          {([
            { id: 'text', label: 'Text', Icon: MessageSquare },
            { id: 'voice', label: 'Voice', Icon: Mic },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
                mode === id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/75'
              }`}
            >
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'text' ? (
        <>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3 space-y-3">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-line ${m.role === 'user' ? 'text-white' : 'text-white/75'}`}
                  style={m.role === 'user'
                    ? { background: `${accent}26`, border: `1px solid ${accent}40` }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2.5 bg-white/[0.04] border border-white/8 flex gap-1">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 px-3 pt-2 flex flex-wrap gap-1.5">
            {['Summarize', 'Why it matters', 'Generate tasks'].map(qp => (
              <button
                key={qp}
                type="button"
                onClick={() => send(qp)}
                className="text-[10px] font-medium px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/55 hover:text-white hover:bg-white/10 transition-all"
              >
                {qp}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="shrink-0 p-3 flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about this node…"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25 transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              className="w-8 h-8 rounded-xl grid place-items-center shrink-0 transition-all disabled:opacity-40"
              style={{ background: `${accent}26`, border: `1px solid ${accent}44`, color: accent }}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </>
      ) : (
        /* voice mode */
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-5 text-center">
          <button
            type="button"
            onClick={toggleVoice}
            className="relative w-24 h-24 rounded-full grid place-items-center transition-all hover:scale-105"
            style={{
              background: `radial-gradient(circle at 35% 30%, ${voiceColor}40, ${voiceColor}12 60%, transparent 75%)`,
              border: `1.5px solid ${voiceColor}66`,
              boxShadow: voiceActive ? `0 0 36px ${voiceColor}55` : `0 0 16px ${voiceColor}22`,
            }}
          >
            {voiceActive && <span className="ws-sn-ring absolute inset-0 rounded-full border" style={{ borderColor: `${voiceColor}66` }} />}
            <Mic className="w-8 h-8" style={{ color: voiceColor }} />
          </button>
          <div className="text-sm font-semibold" style={{ color: voiceColor }}>{voiceLabel}</div>
          <p className="text-[11px] text-white/40 max-w-[210px] leading-relaxed">
            Voice uses your live AI assistant with this node’s context loaded automatically.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── PM task / project picker modal ───────────────────────────────────── */

function ConvertToPMModal({
  nodeTitle: title,
  onClose,
  onDone,
  mode,
}: {
  nodeTitle: string;
  onClose: () => void;
  onDone: (projectId: string | null, kind: 'task' | 'project') => void;
  mode: 'task' | 'project';
}) {
  const { projects } = useProjectsStore();
  const [sel, setSel] = useState(projects[0]?.id ?? '');

  return (
    <div className="fixed inset-0 z-[160] grid place-items-center p-6" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6 bg-[#0e0e14] border border-white/12 shadow-2xl">
        <h3 className="text-base font-bold text-white mb-4">
          {mode === 'task' ? 'Add to PM Project Board' : 'Create Project from Node'}
        </h3>
        {mode === 'task' && (
          <>
            <label className="text-[10px] uppercase tracking-wider text-white/40">Choose project</label>
            <select
              value={sel}
              onChange={e => setSel(e.target.value)}
              className="w-full mt-1 mb-5 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
            >
              {projects.map(p => <option key={p.id} value={p.id} className="bg-[#0e0e14]">{p.name}</option>)}
              {projects.length === 0 && <option value="" className="bg-[#0e0e14]">No projects yet</option>}
            </select>
            <p className="text-[11px] text-white/40 mb-5">
              Task “{title} — follow up” will be added to the selected project&apos;s To&nbsp;Do column.
            </p>
          </>
        )}
        {mode === 'project' && (
          <p className="text-[11px] text-white/55 mb-5">
            A new project named “{title}” will be created in Superspace with you as owner.
          </p>
        )}
        <div className="flex items-center gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-white/55 hover:text-white border border-white/10">Cancel</button>
          <button
            type="button"
            disabled={mode === 'task' && !sel}
            onClick={() => onDone(mode === 'task' ? sel : null, mode)}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.35)', color: '#34d399' }}
          >
            {mode === 'task' ? 'Add Task' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── detail overlay (selected node) — Information Card with tabs ──────────── */

type DetailTab = 'overview' | 'relationships' | 'evidence' | 'history';

function NodeDetail({ item, onBack, onRemove, onOpenWorkspace }: { item: SavedWorkflowItem; onBack: () => void; onRemove: () => void; onOpenWorkspace: () => void; }) {
  const accent = item.rootColor || ROLE_COLORS[item.role] || '#C1AEFF';
  const roleColor = ROLE_COLORS[item.role] || '#C1AEFF';
  const TagIcon = item.planetTag ? COMPANY_TAG_ICONS[item.planetTag] : null;
  const trail = crumbs(item);
  const confidence = confidenceFor(item.level);

  const { addTask: addFounderTask, addGoal } = useFounderWorkspace();
  const { projects, addTask: addPMTask, createProject } = useProjectsStore();
  const { items: allItems, updateItem, connections, addConnection, removeConnection } = useSavedWorkflows();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pmModal, setPmModal] = useState<'task' | 'project' | null>(null);
  const [connectType, setConnectType] = useState<CardConnectionType>('dependency');
  const [connectTargetId, setConnectTargetId] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = (m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const convertToTask = () => { addFounderTask(`${nodeTitle(item)} — follow up`, 'in_progress'); showToast('Added to your Tasks board'); };
  const linkToGoal = () => { addGoal(`Advance: ${nodeTitle(item)}`, item.role === 'founder' ? 'growth' : 'product'); showToast('Linked to a new goal'); };

  const handlePMDone = (projectId: string | null, kind: 'task' | 'project') => {
    setPmModal(null);
    if (kind === 'task' && projectId) {
      addPMTask(projectId, `${nodeTitle(item)} — follow up`, null, 'todo', item.id);
      showToast('Added to project board ✔');
    } else if (kind === 'project') {
      createProject({ name: nodeTitle(item), type: 'initiative', memberIds: [], description: item.actionHint || item.rootDescription, sourceCardId: item.id });
      showToast('Project created in Superspace ✔');
    }
  };

  const TABS: { id: DetailTab; label: string; Icon: any }[] = [
    { id: 'overview', label: 'Overview', Icon: Sparkles },
    { id: 'relationships', label: 'Relationships', Icon: GitBranch },
    { id: 'evidence', label: 'Evidence', Icon: Database },
    { id: 'history', label: 'History', Icon: History },
  ];

  return (
    <div className="ws-sn-detail flex-1 min-h-0 overflow-y-auto scrollbar-hide p-5 lg:p-7">
      <div className="max-w-5xl mx-auto">
        {/* top bar */}
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All saved nodes
          </button>
          <span
            className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-400/10 text-amber-300/90 border border-amber-400/25"
            title="Saved locally on this device. Cloud sync to the twin comes in a later phase."
          >
            <Database className="w-3 h-3" /> Draft · local
          </span>
        </div>

        {/* hero / identity */}
        <div
          className="rounded-2xl p-5 mb-4 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${accent}16, rgba(255,255,255,0.02))`, border: `1px solid ${accent}33` }}
        >
          <div className="absolute -top-16 -right-10 w-52 h-52 rounded-full pointer-events-none opacity-40" style={{ background: `radial-gradient(circle, ${accent}45, transparent 70%)` }} />
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest" style={{ background: `${roleColor}22`, color: roleColor, border: `1px solid ${roleColor}44` }}>
              {item.roleLabel}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-white/50 border border-white/10 flex items-center gap-1">
              <Layers className="w-3 h-3" /> {levelLabel(item.level)}
            </span>
            {item.planetTag && TagIcon && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: `${COMPANY_TAG_COLORS[item.planetTag]}1f`, color: COMPANY_TAG_COLORS[item.planetTag], border: `1px solid ${COMPANY_TAG_COLORS[item.planetTag]}40` }}>
                <TagIcon className="w-3 h-3" /> {COMPANY_TAG_LABELS[item.planetTag]}
              </span>
            )}
            {/* Sync status — click to cycle */}
            {(() => {
              const s = item.syncStatus ?? 'draft';
              const m = SYNC_STATUS_META[s];
              const nextIdx = (SYNC_STATUS_ORDER.indexOf(s) + 1) % SYNC_STATUS_ORDER.length;
              const next = SYNC_STATUS_ORDER[nextIdx];
              return (
                <button
                  type="button"
                  onClick={() => { updateItem(item.id, { syncStatus: next }); showToast(`Status → ${SYNC_STATUS_META[next].label}`); }}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 transition-all hover:brightness-125 cursor-pointer"
                  title={`Sync status: ${m.label}. Click to advance.`}
                  style={{ background: `${m.color}20`, color: m.color, border: `1px solid ${m.color}40` }}
                >
                  <Database className="w-3 h-3" /> {m.label}
                </button>
              );
            })()}
            <span className="ml-auto text-[10px] text-white/35 flex items-center gap-1">
              <Clock className="w-3 h-3" /> saved {timeAgo(item.savedAt)}
            </span>
          </div>
          <h2 className="text-xl font-bold text-white leading-tight" style={{ textShadow: `0 0 30px ${accent}40` }}>{nodeTitle(item)}</h2>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap text-xs">
            {trail.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="w-3 h-3 text-white/20" />}
                <span className={i === trail.length - 1 ? 'text-white/90 font-medium' : 'text-white/45'}>{c}</span>
              </span>
            ))}
          </div>
        </div>

        {/* primary actions */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {item.actionId ? (
            <button type="button" onClick={onOpenWorkspace} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110 hover:-translate-y-0.5" style={{ background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, boxShadow: `0 4px 20px ${accent}1f` }}>
              <ExternalLink className="w-4 h-4" /> Open Workspace
            </button>
          ) : (
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('request-close-workspace'))} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110 hover:-translate-y-0.5" style={{ background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, boxShadow: `0 4px 20px ${accent}1f` }}>
              <Compass className="w-4 h-4" /> Locate in Universe
            </button>
          )}
          <button type="button" onClick={convertToTask} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 transition-all hover:-translate-y-0.5">
            <ListTodo className="w-4 h-4" /> Convert to Task
          </button>
          {projects.length > 0 && (
            <button type="button" onClick={() => setPmModal('task')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-violet-300 bg-violet-500/10 border border-violet-500/25 hover:bg-violet-500/20 transition-all hover:-translate-y-0.5">
              <Plus className="w-4 h-4" /> Add to Project
            </button>
          )}
          <button type="button" onClick={() => setPmModal('project')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/25 hover:bg-indigo-500/20 transition-all hover:-translate-y-0.5">
            <Folder className="w-4 h-4" /> Convert to Project
          </button>
          <button type="button" onClick={linkToGoal} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-sky-300 bg-sky-500/10 border border-sky-500/25 hover:bg-sky-500/20 transition-all hover:-translate-y-0.5">
            <Target className="w-4 h-4" /> Link to Goal
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setMoreOpen(o => !o)} className="flex items-center gap-1 px-2.5 py-2.5 rounded-xl text-xs font-medium text-white/45 hover:text-white/80 transition-colors">
              More <ChevronRight className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-90' : ''}`} />
            </button>
            <button type="button" onClick={onRemove} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white/55 hover:text-rose-300 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/30 transition-all">
              <BookmarkX className="w-4 h-4" /> Remove
            </button>
          </div>
        </div>

        {/* secondary actions — progressive disclosure */}
        {moreOpen && (
          <div className="flex items-center gap-1.5 flex-wrap mb-4 ws-sn-detail">
            {[
              { icon: Scale, label: 'Compare' },
              { icon: Users, label: 'Assign' },
              { icon: Bot, label: 'Run Agent' },
              { icon: Activity, label: 'Simulate' },
            ].map(({ icon: Icon, label }) => (
              <button key={label} type="button" onClick={() => showToast(`${label} connects once projects & agents are wired (next phases)`)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white/40 bg-white/[0.02] border border-white/8 hover:text-white/70 hover:bg-white/5 transition-all">
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        )}

        {/* body: tabbed info (left) + chat (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-4">
          <div className="lg:col-span-3">
            {/* tab bar */}
            <div className="flex items-center gap-1 mb-4 border-b border-white/8">
              {TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold -mb-px border-b-2 transition-colors ${
                    tab === id ? 'text-white' : 'text-white/40 hover:text-white/70 border-transparent'
                  }`}
                  style={tab === id ? { borderColor: accent, color: '#fff' } : { borderColor: 'transparent' }}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>

            {/* tab content */}
            <div className="ws-sn-detail">
              {tab === 'overview' && (
                <div className="space-y-4">
                  <p className="text-[13px] text-white/70 leading-relaxed">
                    {item.actionHint || item.rootDescription ||
                      `A ${levelLabel(item.level).toLowerCase()} saved from the ${item.companyName} planet, viewed through the ${item.roleLabel} lens. No extra context was captured at save time — open the chat to summarize it.`}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Source', value: 'IDT' },
                      { label: 'Updated', value: timeAgo(item.savedAt) },
                      { label: 'Level', value: levelLabel(item.level).split(' ')[0] },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg p-2.5 bg-white/[0.03] border border-white/8">
                        <div className="text-[9px] text-white/35 uppercase tracking-wide">{s.label}</div>
                        <div className="text-sm font-bold text-white mt-1">{s.value}</div>
                      </div>
                    ))}
                    <div className="rounded-lg p-2.5 bg-white/[0.03] border border-white/8">
                      <div className="text-[9px] text-white/35 uppercase tracking-wide">Confidence</div>
                      <div className="text-sm font-bold text-white mt-1">{confidence}%</div>
                      <div className="h-1 rounded-full bg-white/10 mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${confidence}%`, background: accent }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'relationships' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <RelChip icon={Network} label="Company" value={item.companyName} color={accent} />
                    <RelChip icon={Layers} label="Lens" value={item.roleLabel} color={roleColor} />
                    {item.planetTag && <RelChip icon={Link2} label="Relation" value={COMPANY_TAG_LABELS[item.planetTag]} color={COMPANY_TAG_COLORS[item.planetTag]} />}
                    {item.rootLabel && <RelChip icon={GitBranch} label="Root" value={item.rootLabel} color={item.rootColor || accent} />}
                    {item.branchLabel && <RelChip icon={GitBranch} label="Branch" value={item.branchLabel} color={accent} />}
                  </div>

                  {/* Card connections */}
                  {(() => {
                    const myConns = connections.filter(c => c.fromId === item.id || c.toId === item.id);
                    const otherIds = myConns.map(c => c.fromId === item.id ? c.toId : c.fromId);
                    const connItems = otherIds.map(id => allItems.find(x => x.id === id)).filter(Boolean) as SavedWorkflowItem[];
                    return (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2">Canvas connections</div>
                        {connItems.length > 0 ? (
                          <div className="space-y-1.5 mb-3">
                            {myConns.map(c => {
                              const peerId = c.fromId === item.id ? c.toId : c.fromId;
                              const peer = allItems.find(x => x.id === peerId);
                              if (!peer) return null;
                              const cm = CONNECTION_TYPE_META[c.type];
                              return (
                                <div key={`${c.fromId}-${c.toId}`} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/8">
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${cm.color}20`, color: cm.color, border: `1px solid ${cm.color}35` }}>
                                    {cm.label}
                                  </span>
                                  <span className="text-[12px] text-white/75 truncate flex-1">{nodeTitle(peer)}</span>
                                  <button type="button" onClick={() => removeConnection(item.id, peerId)} className="p-1 rounded text-white/20 hover:text-rose-300 transition-colors">
                                    <Plus className="w-3 h-3 rotate-45" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-white/30 mb-3">No connections yet. Link this card to others below.</p>
                        )}

                        {/* Add connection form */}
                        {allItems.filter(x => x.id !== item.id).length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            <select
                              value={connectTargetId}
                              onChange={e => setConnectTargetId(e.target.value)}
                              className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 flex-1 min-w-0"
                            >
                              <option value="">Select card…</option>
                              {allItems.filter(x => x.id !== item.id).map(x => (
                                <option key={x.id} value={x.id}>{nodeTitle(x)}</option>
                              ))}
                            </select>
                            <select
                              value={connectType}
                              onChange={e => setConnectType(e.target.value as CardConnectionType)}
                              className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70"
                            >
                              {(Object.keys(CONNECTION_TYPE_META) as CardConnectionType[]).map(t => (
                                <option key={t} value={t}>{CONNECTION_TYPE_META[t].label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={!connectTargetId}
                              onClick={() => {
                                if (!connectTargetId) return;
                                addConnection(item.id, connectTargetId, connectType);
                                setConnectTargetId('');
                                showToast('Connection added');
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-40"
                              style={{ background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}
                            >
                              <Plus className="w-3 h-3" /> Connect
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {tab === 'evidence' && (
                <div className="space-y-2.5">
                  {item.note && (
                    <div className="flex items-start gap-2 text-[12px] text-white/70 rounded-lg p-3 bg-white/[0.03] border border-white/8">
                      <StickyNote className="w-3.5 h-3.5 mt-0.5 text-amber-300/80 shrink-0" />
                      <span className="italic">"{item.note}"</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[12px] text-white/55 rounded-lg p-3 bg-white/[0.03] border border-white/8">
                    <Compass className="w-3.5 h-3.5 text-white/35 shrink-0" />
                    Saved from the 3D Universe · {timeAgo(item.savedAt)}
                  </div>
                  <button type="button" onClick={() => showToast('Attaching docs & snapshots arrives with twin sync')} className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors px-1 pt-1">
                    <Plus className="w-3.5 h-3.5" /> Add evidence
                  </button>
                </div>
              )}

              {tab === 'history' && (
                <div className="relative pl-4">
                  <div className="absolute left-[5px] top-0 bottom-0 w-px bg-white/8" />
                  {[
                    ...(item.syncStatus && item.syncStatus !== 'draft'
                      ? [{ label: `Status advanced to ${SYNC_STATUS_META[item.syncStatus].label}`, at: item.savedAt, color: SYNC_STATUS_META[item.syncStatus].color }]
                      : []),
                    { label: 'Saved to workspace', at: item.savedAt, color: accent },
                  ].map((e, i) => (
                    <div key={i} className="relative mb-4 last:mb-0">
                      <div className="absolute -left-[11px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#0f0f17]" style={{ background: i === 0 ? e.color : '#334155' }} />
                      <div className="rounded-xl p-3 bg-white/[0.03] border border-white/8">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-semibold text-white">{e.label}</span>
                          <span className="text-[10px] text-white/30 shrink-0">{timeAgo(e.at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-white/25 mt-3 px-1">Full sync history available once twin write-back is connected.</p>
                </div>
              )}
            </div>
          </div>

          {/* chat */}
          <div className="lg:col-span-2">
            <CardChat item={item} accent={accent} />
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-xl text-xs font-medium text-white bg-[#16161c]/95 border border-white/15 shadow-2xl backdrop-blur-md animate-slide-up-fade">
          {toast}
        </div>
      )}
      {pmModal && (
        <ConvertToPMModal
          nodeTitle={nodeTitle(item)}
          mode={pmModal}
          onClose={() => setPmModal(null)}
          onDone={handlePMDone}
        />
      )}
    </div>
  );
}

/* ── node card ───────────────────────────────────────────────────────────── */

function NodeCard({ item, index, onOpen, onRemove }: { item: SavedWorkflowItem; index: number; onOpen: () => void; onRemove: () => void; }) {
  const accent = item.rootColor || ROLE_COLORS[item.role] || '#C1AEFF';
  const TagIcon = item.planetTag ? COMPANY_TAG_ICONS[item.planetTag] : null;
  const trail = crumbs(item);

  return (
    <article
      onClick={onOpen}
      className="ws-sn-card group cursor-pointer rounded-2xl p-4 flex flex-col gap-3 ws-glass"
      style={{
        animationDelay: `${Math.min(index * 55, 600)}ms`,
        ['--sn-accent' as string]: accent,
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full opacity-70" style={{ background: `linear-gradient(${accent}, transparent)` }} />

      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: `${ROLE_COLORS[item.role]}22`, color: ROLE_COLORS[item.role] }}>
          {item.roleLabel}
        </span>
        {item.planetTag && TagIcon && (
          <span title={COMPANY_TAG_LABELS[item.planetTag]} style={{ color: COMPANY_TAG_COLORS[item.planetTag] }}>
            <TagIcon className="w-3.5 h-3.5" />
          </span>
        )}
        <span className="ml-auto text-[9px] text-white/30 flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" /> {timeAgo(item.savedAt)}
        </span>
        {/* sync status dot */}
        {(() => {
          const s = item.syncStatus ?? 'draft';
          const m = SYNC_STATUS_META[s];
          return (
            <span className="w-2 h-2 rounded-full shrink-0" title={m.label} style={{ background: m.color }} />
          );
        })()}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1 rounded-md text-white/25 hover:text-rose-300 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
          title="Remove from saved"
        >
          <BookmarkX className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-start gap-2 min-w-0">
        <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0 mt-0.5" style={{ background: `${accent}1f`, border: `1px solid ${accent}3a` }}>
          <Network className="w-4 h-4" style={{ color: accent }} />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-white leading-snug truncate">{nodeTitle(item)}</h4>
          <span className="text-[10px] text-white/35">{levelLabel(item.level)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap text-[10px] text-white/40 leading-tight">
        {trail.slice(0, 3).map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-2.5 h-2.5 text-white/20" />}
            <span className="truncate max-w-[110px]">{c}</span>
          </span>
        ))}
      </div>

      {(item.actionHint || item.rootDescription) && (
        <p className="text-[11px] text-white/45 leading-relaxed line-clamp-2">
          {item.actionHint || item.rootDescription}
        </p>
      )}

      <div className="mt-auto pt-1 flex items-center text-[10px] font-semibold" style={{ color: accent }}>
        Open node
        <ChevronRight className="w-3 h-3 ml-0.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </article>
  );
}

/* ── main ────────────────────────────────────────────────────────────────── */

export function WorkspaceSavedNodesCanvas({ isFullscreen = false }: WorkspaceSavedNodesCanvasProps) {
  const { items, remove } = useSavedWorkflows();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openedWorkspaceId, setOpenedWorkspaceId] = useState<string | null>(null);
  const [closingWorkspace, setClosingWorkspace] = useState(false);
  const [roleFilter, setRoleFilter] = useState<UserPlanetRole | 'all'>('all');

  const closeOpenedWorkspace = () => {
    setClosingWorkspace(true);
    window.setTimeout(() => { setOpenedWorkspaceId(null); setClosingWorkspace(false); }, 300);
  };

  const rolesPresent = useMemo(
    () => ROLE_ORDER.filter(r => items.some(i => i.role === r)),
    [items],
  );

  const filtered = useMemo(
    () => (roleFilter === 'all' ? items : items.filter(i => i.role === roleFilter)),
    [items, roleFilter],
  );

  const selected = selectedId ? items.find(i => i.id === selectedId) ?? null : null;
  const opened = openedWorkspaceId ? items.find(i => i.id === openedWorkspaceId) ?? null : null;
  const openedNodes = opened ? buildNodesFromSaved(opened) : null;

  // When a node was just "Exported to Workspace", open straight into its card.
  useEffect(() => {
    let pending: string | null = null;
    try { pending = localStorage.getItem('ws_pending_node_v1'); } catch { /* ignore */ }
    if (pending) {
      try { localStorage.removeItem('ws_pending_node_v1'); } catch { /* ignore */ }
      if (items.some(i => i.id === pending)) setSelectedId(pending);
    }
    // run once on mount — the pending flag is set right before this view opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full node workspace — a smooth full-cover overlay (portaled out of the
  // clipped canvas frame so it fills the screen cleanly with no double chrome).
  const workspaceOverlay = opened && openedNodes
    ? createPortal(
        <div className={`fixed inset-0 z-[120] bg-[#07070b] ws-node-ws-overlay ${closingWorkspace ? 'ws-node-ws-overlay--closing' : ''}`}>
          <ActionNodeWorkspace
            fullScreen
            embedded
            actionNode={openedNodes.action}
            branchNode={openedNodes.branch}
            rootNode={openedNodes.root}
            context={openedNodes.context}
            onClose={closeOpenedWorkspace}
          />
        </div>,
        document.body,
      )
    : null;

  if (items.length === 0) {
    return (
      <div className="w-full h-full flex flex-col min-h-0">
        <EmptyState />
      </div>
    );
  }

  if (selected) {
    return (
      <div className="w-full h-full flex flex-col min-h-0">
        <NodeDetail
          item={selected}
          onBack={() => setSelectedId(null)}
          onRemove={() => { remove(selected.id); setSelectedId(null); }}
          onOpenWorkspace={() => setOpenedWorkspaceId(selected.id)}
        />
        {workspaceOverlay}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-3 px-1 pb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-[#C1AEFF]" />
          <h3 className="text-sm font-semibold text-white">Saved Nodes</h3>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60 tabular-nums">{items.length}</span>
        </div>

        {rolesPresent.length > 1 && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => setRoleFilter('all')}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                roleFilter === 'all' ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-white/8 text-white/45 hover:text-white/75'
              }`}
            >
              All
            </button>
            {rolesPresent.map(r => {
              const label = items.find(i => i.role === r)?.roleLabel ?? r;
              const on = roleFilter === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all"
                  style={{
                    background: on ? `${ROLE_COLORS[r]}22` : 'transparent',
                    borderColor: on ? `${ROLE_COLORS[r]}55` : 'rgba(255,255,255,0.08)',
                    color: on ? ROLE_COLORS[r] : 'rgba(255,255,255,0.45)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1 pb-2">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${isFullscreen ? 4 : 3}, minmax(0,1fr))` }}>
          {filtered.map((item, i) => (
            <NodeCard key={item.id} item={item} index={i} onOpen={() => setSelectedId(item.id)} onRemove={() => remove(item.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
