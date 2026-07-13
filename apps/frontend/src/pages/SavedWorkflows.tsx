import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bookmark, BookmarkX, Search, X, ChevronRight, ChevronDown, ChevronUp,
  ExternalLink, Trash2, StickyNote, Clock, Briefcase, TrendingUp, GraduationCap,
  Globe, Layers, Filter, Sparkles,
} from 'lucide-react';
import {
  useSavedWorkflows,
  ROLE_COLORS,
  ROLE_ORDER,
  type SavedWorkflowItem,
  type SavedWorkflowGroup,
  type SavedWorkflowCompanyGroup,
} from '../lib/useSavedWorkflows';
import type { UserPlanetRole } from '../data/companyPlanetRoots';
import { useBdtSavedTrails } from '../lib/useBdtSavedTrails';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ROLE_ICONS: Record<UserPlanetRole, any> = {
  career: GraduationCap,
  founder: Briefcase,
  vc: TrendingUp, // Let's use TrendingUp for vc, or maybe some other icon. TrendingUp is fine.
  investor: TrendingUp,
};

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onClose, activeTab = 'workspaces' }: { onClose?: () => void; activeTab?: 'workspaces' | 'trails' }) {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Bookmark className="w-7 h-7" style={{ color: 'rgba(255,255,255,0.25)' }} />
      </div>

      <h2 className="text-xl font-semibold text-white mb-2 tracking-tight">
        {activeTab === 'workspaces' ? 'No saved workspaces' : 'No saved BDT trails'}
      </h2>
      <p className="text-sm text-white/35 max-w-xs leading-relaxed mb-8">
        {activeTab === 'workspaces'
          ? 'Explore the 3D Universe and bookmark any root, branch, or action node to build your library.'
          : 'Record operating routes across Business Digital Twin (BDT) departments to see them here.'
        }
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => { onClose?.(); navigate(activeTab === 'workspaces' ? '/3d' : '/universal'); }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/10"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.75)',
          }}
        >
          <Globe className="w-4 h-4" />
          {activeTab === 'workspaces' ? 'Open 3D Universe' : 'Open Business Twin'}
        </button>
        <button
          onClick={() => { onClose?.(); navigate('/overview'); }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/[0.04]"
          style={{
            border: '1px solid rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          Dashboard
        </button>
      </div>

      {activeTab === 'workspaces' && (
        <div
          className="mt-10 flex items-start gap-3 text-left rounded-xl px-4 py-3.5 max-w-sm"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
          <p className="text-[11px] text-white/25 leading-relaxed">
            <span className="text-white/40 font-medium">Tip:</span> Hover any node in the Planet 2D view to reveal the bookmark icon.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Note Editor ───────────────────────────────────────────────────────────────

function NoteEditor({ item, onUpdate }: { item: SavedWorkflowItem; onUpdate: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(item.note ?? '');
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) taRef.current?.focus();
  }, [open]);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[11px] font-medium transition-colors rounded-md px-2 py-0.5"
        style={{
          color: item.note ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
          background: item.note ? 'rgba(255,255,255,0.04)' : 'transparent',
          border: '1px solid transparent',
        }}
        title={open ? 'Close note' : item.note ? 'Edit note' : 'Add note'}
      >
        <StickyNote className="w-2.5 h-2.5" />
        {item.note ? 'Note' : 'Add note'}
      </button>
      {open && (
        <div className="mt-2">
          <textarea
            ref={taRef}
            rows={2}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Add a note..."
            className="w-full text-xs resize-none rounded-lg px-3 py-2 outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.65)',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)')}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              onUpdate(draft);
            }}
          />
        </div>
      )}
      {!open && item.note && (
        <p className="mt-1 text-[10px] text-white/25 italic line-clamp-1">{item.note}</p>
      )}
    </div>
  );
}

// ── Saved Item Card ───────────────────────────────────────────────────────────

function SavedItemCard({
  item,
  onRemove,
  onUpdateNote,
}: {
  item: SavedWorkflowItem;
  onRemove: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();

  const breadcrumb = [
    item.rootLabel,
    item.branchLabel,
    item.actionLabel,
  ].filter(Boolean);

  const isPlanetLevel = item.level === 'planet';
  const tagColor = item.rootColor || ROLE_COLORS[item.role];

  return (
    <div
      className="relative rounded-xl transition-all duration-200 overflow-hidden group"
      style={{
        background: hovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.025)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.055)'}`,
        padding: '12px 14px 12px 18px',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Left accent */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
        style={{ background: tagColor, opacity: hovered ? 0.7 : 0.35 }}
      />

      <div className="flex items-start justify-between gap-3">
        {/* Left: breadcrumb + meta */}
        <div className="flex-1 min-w-0">
          {/* Breadcrumb or Tag Badge */}
          <div className="flex items-center gap-1 flex-wrap mb-1">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-2.5 h-2.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.15)' }} />}
                <span
                  className="text-[12px] leading-tight"
                  style={{
                    color: i === 0 ? item.rootColor : i === breadcrumb.length - 1 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)',
                    fontWeight: i === 0 || i === breadcrumb.length - 1 ? 500 : 400,
                  }}
                >
                  {crumb}
                </span>
              </span>
            ))}
          </div>

          {/* Hint */}
          {item.actionHint && (
            <p className="text-[11px] text-white/25 mb-1.5 leading-snug">{item.actionHint}</p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
              <Clock className="w-2.5 h-2.5" />
              {timeAgo(item.savedAt)}
            </span>
            <span className="w-px h-2.5" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-widest"
              style={{
                background: `${ROLE_COLORS[item.role]}10`,
                color: `${ROLE_COLORS[item.role]}bb`,
                border: `1px solid ${ROLE_COLORS[item.role]}20`,
              }}
            >
              {isPlanetLevel ? 'Planet' : item.level}
            </span>
          </div>

          {/* Note */}
          <div className="mt-2">
            <NoteEditor item={item} onUpdate={(note) => onUpdateNote(item.id, note)} />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {item.level === 'action' && item.branchId && item.actionId && (
            <button
              onClick={() => navigate('/3d', { state: { actionWorkspaceContext: item } })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:bg-white/10"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.55)',
              }}
              title="Open workspace"
            >
              <ExternalLink className="w-3 h-3" />
              Open
            </button>
          )}
          <button
            onClick={() => onRemove(item.id)}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
            style={{
              border: '1px solid transparent',
              color: 'rgba(248,113,113,0.35)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = '#f87171';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,113,113,0.2)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = 'rgba(248,113,113,0.35)';
              (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
            }}
            title="Remove"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function BdtTrailCard({
  trail,
  onRemove,
  onUpdateNote,
  onClose,
}: {
  trail: any;
  onRemove: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  onClose?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();

  return (
    <div
      className="relative rounded-xl transition-all duration-200 overflow-hidden group mb-3"
      style={{
        background: hovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.025)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.055)'}`,
        padding: '12px 14px 12px 18px',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Left accent */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full text-purple-400"
        style={{ backgroundColor: 'currentColor', opacity: hovered ? 0.7 : 0.35 }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className="text-xs font-semibold text-white/90 truncate mb-1">
            {trail.title}
          </h3>

          {/* Sequence description */}
          <div className="flex items-center gap-1.5 flex-wrap mb-2 text-[10px] text-white/50 leading-relaxed">
            <span className="font-semibold text-purple-300">{trail.anchor.deptLabel}</span>
            <span className="opacity-40">({trail.anchor.nodeLabel})</span>
            {trail.stops.map((stop: any, idx: number) => (
              <span key={idx} className="flex items-center gap-1.5">
                <ChevronRight className="w-2.5 h-2.5 text-white/20" />
                <span className="font-semibold text-cyan-300">{stop.deptLabel}</span>
                {stop.nodeLabel && <span className="opacity-40">({stop.nodeLabel})</span>}
              </span>
            ))}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
              <Clock className="w-2.5 h-2.5" />
              {timeAgo(trail.savedAt)}
            </span>
            <span className="w-px h-2.5" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-widest"
              style={{
                background: 'rgba(168, 85, 247, 0.1)',
                color: '#c084fc',
                border: '1px solid rgba(168, 85, 247, 0.2)',
              }}
            >
              {trail.stops.length + 1} Hops
            </span>
          </div>

          {/* Note */}
          <div className="mt-2">
            <NoteEditor item={trail as any} onUpdate={(note) => onUpdateNote(trail.id, note)} />
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={() => {
              navigate(`/universal?replayTrail=${trail.id}`);
              onClose?.();
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-semibold transition-all bg-purple-600/30 hover:bg-purple-600 border border-purple-500/30 text-purple-300 hover:text-white"
            title="Replay operating route"
          >
            Replay
          </button>
          <button
            onClick={() => onRemove(trail.id)}
            className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10 text-rose-400/50 hover:text-rose-400"
            title="Delete trail"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Company Group ─────────────────────────────────────────────────────────────

function CompanyGroup({
  group,
  roleColor,
  onRemove,
  onUpdateNote,
}: {
  group: SavedWorkflowCompanyGroup;
  roleColor: string;
  onRemove: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-3">
      <button
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg mb-1.5 transition-all hover:bg-white/[0.03] text-left group"
        onClick={() => setCollapsed(c => !c)}
      >
        {/* Company avatar */}
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[10px] font-bold"
          style={{
            background: `${roleColor}14`,
            border: `1px solid ${roleColor}25`,
            color: roleColor,
          }}
        >
          {group.companyName[0]?.toUpperCase()}
        </div>
        <span className="text-xs font-medium text-white/55 flex-1 group-hover:text-white/80 transition-colors">{group.companyName}</span>
        <span
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded mr-1"
          style={{
            background: `${roleColor}10`,
            color: `${roleColor}99`,
          }}
        >
          {group.items.length}
        </span>
        {collapsed
          ? <ChevronDown className="w-3 h-3 text-white/15 group-hover:text-white/30 transition-colors" />
          : <ChevronUp className="w-3 h-3 text-white/15 group-hover:text-white/30 transition-colors" />
        }
      </button>

      {!collapsed && (
        <div className="space-y-1.5 ml-2 pl-4" style={{ borderLeft: `1px solid rgba(255,255,255,0.06)` }}>
          {group.items.map(item => (
            <SavedItemCard
              key={item.id}
              item={item}
              onRemove={onRemove}
              onUpdateNote={onUpdateNote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Role Section ──────────────────────────────────────────────────────────────

function RoleSection({
  group,
  onRemove,
  onUpdateNote,
}: {
  group: SavedWorkflowGroup;
  onRemove: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const RoleIcon = ROLE_ICONS[group.role];
  const total = group.companies.reduce((s, c) => s + c.items.length, 0);

  return (
    <div
      className="mb-3 rounded-2xl overflow-hidden"
      style={{
        border: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      {/* Role header */}
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 transition-all hover:bg-white/[0.02] text-left"
        style={{
          borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.05)',
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `${group.roleColor}12`,
            border: `1px solid ${group.roleColor}25`,
          }}
        >
          <RoleIcon style={{ color: group.roleColor, width: 15, height: 15 }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
              {group.roleLabel}
            </span>
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: `${group.roleColor}12`,
                color: `${group.roleColor}cc`,
              }}
            >
              {total} saved
            </span>
          </div>
          <p className="text-[10px] text-white/20 mt-0.5">
            {group.companies.length} {group.companies.length === 1 ? 'company' : 'companies'}
          </p>
        </div>
        {collapsed
          ? <ChevronDown className="w-3.5 h-3.5 text-white/20" />
          : <ChevronUp className="w-3.5 h-3.5 text-white/20" />
        }
      </button>

      {!collapsed && (
        <div className="px-4 py-3">
          {group.companies.map(company => (
            <CompanyGroup
              key={company.companyId}
              group={company}
              roleColor={group.roleColor}
              onRemove={onRemove}
              onUpdateNote={onUpdateNote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SavedWorkflows({ onClose }: { onClose?: () => void }) {
  const { items: _items, totalCount, remove, updateNote, clear, grouped } = useSavedWorkflows();
  const { savedTrails, removeTrail, updateNote: updateBdtNote, clear: clearBdtTrails, totalCount: bdtTotalCount } = useBdtSavedTrails();

  const [activeTab, setActiveTab] = useState<'workspaces' | 'trails'>('workspaces');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserPlanetRole | 'all'>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Filter
  const filteredGroups = useMemo(() => {
    let result = grouped;

    if (roleFilter !== 'all') {
      result = result.filter(g => g.role === roleFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result
        .map(g => ({
          ...g,
          companies: g.companies
            .map(c => ({
              ...c,
              items: c.items.filter(item =>
                item.companyName.toLowerCase().includes(q) ||
                (item.rootLabel ?? '').toLowerCase().includes(q) ||
                (item.branchLabel ?? '').toLowerCase().includes(q) ||
                (item.actionLabel ?? '').toLowerCase().includes(q) ||
                (item.note ?? '').toLowerCase().includes(q)
              ),
            }))
            .filter(c => c.items.length > 0),
        }))
        .filter(g => g.companies.length > 0);
    }

    return result;
  }, [grouped, roleFilter, search]);

  const filteredTrails = useMemo(() => {
    if (activeTab !== 'trails') return [];
    if (!search.trim()) return savedTrails;
    const q = search.toLowerCase();
    return savedTrails.filter(trail => 
      trail.title.toLowerCase().includes(q) ||
      (trail.note ?? '').toLowerCase().includes(q) ||
      trail.anchor.deptLabel.toLowerCase().includes(q) ||
      trail.anchor.nodeLabel.toLowerCase().includes(q) ||
      trail.stops.some(stop => 
        stop.deptLabel.toLowerCase().includes(q) ||
        (stop.nodeLabel ?? '').toLowerCase().includes(q)
      )
    );
  }, [savedTrails, activeTab, search]);

  const isEmpty = activeTab === 'workspaces' ? totalCount === 0 : bdtTotalCount === 0;
  const filteredEmpty = activeTab === 'workspaces' 
    ? (!isEmpty && filteredGroups.length === 0)
    : (!isEmpty && filteredTrails.length === 0);

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-[460px] h-full flex flex-col shadow-2xl transition-transform rounded-l-2xl overflow-hidden"
        style={{
          background: '#0a0a0f',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* ── Main content area ── */}
        <div className="relative z-10 flex-1 flex flex-col overflow-hidden">

        {/* ── Top bar ── */}
        <div
          className="shrink-0 px-5 pt-4 pb-3"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(10,10,15,0.95)',
          }}
        >
          {/* Top level tabs */}
          <div className="flex border-b border-white/5 mb-4">
            <button
              onClick={() => { setActiveTab('workspaces'); setRoleFilter('all'); }}
              className={`flex-1 pb-2 text-xs font-semibold text-center transition-all ${activeTab === 'workspaces' ? 'text-purple-300 border-b-2 border-purple-500' : 'text-white/40 hover:text-white/60'}`}
            >
              Workspaces ({totalCount})
            </button>
            <button
              onClick={() => { setActiveTab('trails'); setRoleFilter('all'); }}
              className={`flex-1 pb-2 text-xs font-semibold text-center transition-all ${activeTab === 'trails' ? 'text-purple-300 border-b-2 border-purple-500' : 'text-white/40 hover:text-white/60'}`}
            >
              BDT Trails ({bdtTotalCount})
            </button>
          </div>

          {/* Row 1: Title + Close */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-[14px] font-semibold text-white/85 tracking-tight">
                {activeTab === 'workspaces' 
                  ? (roleFilter === 'all' ? 'Saved Workflows' : `${roleFilter.charAt(0).toUpperCase() + roleFilter.slice(1)} Mode`)
                  : 'Saved BDT Trails'
                }
              </h1>
              <p className="text-[10px] text-white/20 mt-0.5 truncate">
                {activeTab === 'workspaces'
                  ? 'Roots · Branches · Action nodes — grouped by company'
                  : 'Operating routes recorded across departments'
                }
              </p>
            </div>

            {/* Export button */}
            <button
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all hover:bg-white/[0.06] shrink-0"
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              <ExternalLink className="w-3 h-3" />
              Export
            </button>

            {/* Clear all */}
            {((activeTab === 'workspaces' ? totalCount : bdtTotalCount) > 0) && (
              <div className="shrink-0">
                {showClearConfirm ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-white/30">Clear?</span>
                    <button
                      onClick={() => { 
                        if (activeTab === 'workspaces') {
                          clear(); 
                        } else {
                          clearBdtTrails();
                        }
                        setShowClearConfirm(false); 
                      }}
                      className="text-[10px] px-2 py-1 rounded-md font-medium transition-all hover:brightness-110"
                      style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.18)' }}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="text-[10px] px-2 py-1 rounded-md font-medium transition-all hover:bg-white/[0.05]"
                      style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/[0.07]"
                    style={{
                      color: 'rgba(248,113,113,0.4)',
                      border: '1px solid rgba(248,113,113,0.08)',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.color = '#f87171';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.color = 'rgba(248,113,113,0.4)';
                    }}
                    title="Clear all"
                  >
                    <BookmarkX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 shrink-0"
              style={{ color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.07)' }}
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Row 2: Search */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <Search className="w-3.5 h-3.5 text-white/20 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search workflows…"
              className="flex-1 bg-transparent text-[12px] outline-none"
              style={{ color: 'rgba(255,255,255,0.65)', minWidth: 0 }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="w-4 h-4 rounded flex items-center justify-center hover:bg-white/10 transition-all shrink-0"
              >
                <X className="w-3 h-3 text-white/30" />
              </button>
            )}
          </div>

          {/* Row 2: Filter tabs */}
          {activeTab === 'workspaces' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setRoleFilter('all')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
                style={{
                  background: roleFilter === 'all' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: `1px solid ${roleFilter === 'all' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`,
                  color: roleFilter === 'all' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)',
                }}
              >
                <Layers className="w-3 h-3" />
                <span className="text-[11px] font-medium">All Modes</span>
                <span
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: roleFilter === 'all' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)',
                  }}
                >
                  {totalCount}
                </span>
              </button>

              {ROLE_ORDER.map(role => {
                const g = grouped.find(gr => gr.role === role);
                if (!g) return null;
                const count = g.companies.reduce((s, c) => s + c.items.length, 0);
                const RoleIcon = ROLE_ICONS[role];
                const color = ROLE_COLORS[role];
                const active = roleFilter === role;
                return (
                  <button
                    key={role}
                    onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
                    style={{
                      background: active ? `${color}12` : 'transparent',
                      border: `1px solid ${active ? `${color}28` : 'rgba(255,255,255,0.05)'}`,
                      color: active ? color : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    <RoleIcon className="w-3 h-3" style={{ color: active ? color : 'rgba(255,255,255,0.3)' }} />
                    <span className="text-[11px] font-medium capitalize">{role}</span>
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: `${color}12`, color: active ? color : 'rgba(255,255,255,0.25)' }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}

              {search && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] ml-auto"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.3)',
                  }}
                >
                  <Filter className="w-3 h-3" />
                  "{search}"
                  <button onClick={() => setSearch('')} className="ml-1 hover:text-white/60 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}
        >
          {isEmpty ? (
            <EmptyState onClose={onClose} activeTab={activeTab} />
          ) : filteredEmpty ? (
            <div className="flex flex-col items-center py-24 text-center">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <Search className="w-5 h-5 text-white/15" />
              </div>
              <p className="text-sm font-medium text-white/30 mb-1">No results found</p>
              <p className="text-xs text-white/18 mb-5">Try a different search or filter</p>
              <button
                onClick={() => { setSearch(''); setRoleFilter('all'); }}
                className="text-[11px] px-4 py-2 rounded-xl transition-all hover:bg-white/[0.04]"
                style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="p-6 max-w-4xl mx-auto w-full">
              {activeTab === 'workspaces' ? (
                filteredGroups.map(group => (
                  <RoleSection
                    key={group.role}
                    group={group}
                    onRemove={remove}
                    onUpdateNote={updateNote}
                  />
                ))
              ) : (
                filteredTrails.map(trail => (
                  <BdtTrailCard
                    key={trail.id}
                    trail={trail}
                    onRemove={removeTrail}
                    onUpdateNote={updateBdtNote}
                    onClose={onClose}
                  />
                ))
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
