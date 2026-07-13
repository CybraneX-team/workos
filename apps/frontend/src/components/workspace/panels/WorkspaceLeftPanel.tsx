import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ChevronRight,
  Files,
  Folder,
  LayoutGrid,
  Plus,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Rocket,
  CircleDollarSign,
  Users,
  ChartLine,
  LayoutGrid as WorkspaceIcon,
} from 'lucide-react';
import { useFounderWorkspace, type ShortcutItem } from '../../../context/FounderWorkspaceContext';
import { useProjectsStore, generateAlerts } from '../../../lib/useProjectsStore';
import { LiquidGlass } from '../../ui/LiquidGlass';
import { WorkspaceCreateModal } from '../WorkspaceCreateModal';
import { WorkspaceShortcutPicker } from '../WorkspaceShortcutPicker';

function SphereNavIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke={active ? '#c4b5fd' : 'currentColor'}
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <circle
        cx="12"
        cy="12"
        r="8"
        strokeDasharray={active ? '42 8' : undefined}
        strokeDashoffset={active ? '6' : undefined}
      />
      <circle cx="12" cy="12" r="2.5" fill={active ? '#ddd6fe' : 'currentColor'} stroke="none" />
      {active && <circle cx="12" cy="4.2" r="1.1" fill="#ffffff" stroke="none" opacity={0.95} />}
      <path d="M4 12h3M17 12h3" opacity={active ? 0.7 : 1} />
      <ellipse cx="12" cy="12" rx="8" ry="3" opacity={active ? 0.55 : 0.45} />
    </svg>
  );
}

type NavItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  customIcon?: 'sphere';
  badge?: number;
};

const NAV_UNIVERSE: NavItem[] = [
  { id: 'sphere', label: 'Pulse', customIcon: 'sphere' },
  { id: 'canvas', label: 'Canvas', icon: LayoutGrid },
];

const NAV_WORK: NavItem[] = [
  { id: 'projects', label: 'Projects', icon: Folder },
  { id: 'notes', label: 'Notes', icon: FileText },
  { id: 'files', label: 'Files', icon: Files },
  { id: 'activity', label: 'Activity', icon: Activity },
];

const SHORTCUT_ICONS: Record<ShortcutItem['kind'], LucideIcon> = {
  workspace: WorkspaceIcon,
  project: Folder,
  template: Rocket,
};

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  roadmap: Rocket,
  fundraising: CircleDollarSign,
  interviews: Users,
  competitors: ChartLine,
};

function iconForShortcut(s: ShortcutItem): LucideIcon {
  if (s.kind === 'template' && s.templateTab && TEMPLATE_ICONS[s.templateTab]) {
    return TEMPLATE_ICONS[s.templateTab];
  }
  return SHORTCUT_ICONS[s.kind];
}

function NavSection({ title, items, showDivider }: { title: string; items: NavItem[]; showDivider?: boolean }) {
  const { activeSidebarTab, setActiveSidebarTab } = useFounderWorkspace();

  return (
    <div className="ws-nav-section">
      {showDivider && <hr className="ws-nav-divider" />}
      <p className="ws-nav-section-title">{title}</p>
      <ul className="ws-nav-list">
        {items.map(item => {
          const Icon = item.icon;
          const isActive = item.id === activeSidebarTab;

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setActiveSidebarTab(item.id)}
                className={`ws-nav-item w-full ${isActive ? 'ws-nav-item--active' : ''}`}
              >
                {item.customIcon === 'sphere' ? (
                  <SphereNavIcon className="w-[18px] h-[18px] shrink-0" active={isActive} />
                ) : Icon ? (
                  <Icon className="w-[18px] h-[18px] shrink-0 stroke-[1.5]" />
                ) : null}
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge != null && (
                  <span className="ws-nav-badge tabular-nums">{item.badge}</span>
                )}
                {isActive && (
                  <ChevronRight className="ws-nav-chevron w-4 h-4 shrink-0" strokeWidth={2} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Workspace switcher strip — every workspace with a live one-line summary, click to switch. */
function WorkspaceSwitcherStrip() {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace } = useFounderWorkspace();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const summaryFor = (w: (typeof workspaces)[number]): string => {
    if (w.goals.length > 0) {
      const pct = Math.round((w.goals.filter(g => g.done).length / w.goals.length) * 100);
      return `${pct}% goals complete`;
    }
    if (w.risks.length > 0) {
      const open = w.risks.filter(r => r.status !== 'Mitigated').length;
      return `${open} open risk${open !== 1 ? 's' : ''}`;
    }
    if (w.departments.length > 0) {
      return `${w.departments.length} department${w.departments.length !== 1 ? 's' : ''}`;
    }
    return 'Just getting started';
  };

  return (
    <div className="relative z-10 px-1.5 pt-2 pb-1 shrink-0">
      <p className="ws-nav-section-title">Workspaces</p>
      <ul className="ws-nav-list mb-1">
        {workspaces.map(w => {
          const isActive = w.id === activeWorkspaceId;
          return (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => setActiveWorkspaceId(w.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                  width: '100%', padding: '8px 12px', borderRadius: 14,
                  background: isActive ? 'linear-gradient(102deg, rgba(120,108,255,0.38) 0%, rgba(88,80,200,0.22) 42%, rgba(25,32,72,0.42) 100%)' : 'transparent',
                }}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isActive ? '#c4b5fd' : 'rgba(255,255,255,0.2)' }} />
                  <span className={`flex-1 text-left truncate text-[13px] ${isActive ? 'text-white font-medium' : 'text-white/70'}`}>{w.name}</span>
                </div>
                <span className="pl-3.5 text-[10px] text-white/30 truncate w-full text-left">{summaryFor(w)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => setShowCreateModal(true)}
        className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-[12px] text-white/40 hover:text-white/75 hover:bg-white/[0.03] transition-colors"
      >
        <Plus className="w-3.5 h-3.5 shrink-0" />
        New Workspace
      </button>

      {showCreateModal && (
        <WorkspaceCreateModal
          onCreate={(name, purpose) => {
            createWorkspace(name, purpose);
            setShowCreateModal(false);
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

/** Reusable workspace left nav — drop onto any page with `ws-left-nav` styling. */
export function WorkspaceLeftPanel({ className }: { className?: string }) {
  const { projects, tasks, decisions, risks, members } = useProjectsStore();
  const alerts = generateAlerts(projects, tasks, decisions, risks, members);
  const [expanded, setExpanded] = useState(false);
  const [showShortcutPicker, setShowShortcutPicker] = useState(false);
  const { setActiveSidebarTab, shortcuts, activeRole } = useFounderWorkspace();

  const handleAlertClick = (a: any) => {
    setActiveSidebarTab('projects');
    if (a.projectId) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-project', { detail: { projectId: a.projectId } }));
      }, 50);
    } else if (a.memberId) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-my-work'));
      }, 50);
    }
  };

  // Member preview mode: a simpler nav — no Files/Activity, which are founder/manager operational surfaces.
  const workNavItems = activeRole === 'member' ? NAV_WORK.filter(i => i.id === 'projects' || i.id === 'notes') : NAV_WORK;

  const shortcutNavItems: NavItem[] = shortcuts.map(s => ({
    id: s.id,
    label: s.label,
    icon: iconForShortcut(s),
  }));

  return (
    <aside className={`ws-left-nav relative flex flex-col shrink-0 h-full ${className ?? ''}`}>
      <LiquidGlass className="absolute inset-0" radius={20} depth={22} scale={13} glow={0.3} edgeHighlight={0.22} />

      <nav className="relative z-10 flex-1 flex flex-col min-h-0 overflow-y-auto">
        <WorkspaceSwitcherStrip />
        <NavSection title="MY UNIVERSE" items={NAV_UNIVERSE} showDivider />
        <NavSection title="MY WORK" items={workNavItems} showDivider />
        {shortcutNavItems.length > 0 && (
          <NavSection title="SHORTCUTS" items={shortcutNavItems} showDivider />
        )}
      </nav>

      {/* AI Suggestions collapser */}
      {alerts.length > 0 && (
        <div className="relative z-10 mx-1.5 my-2 rounded-xl bg-white/[0.03] border border-white/8 overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setExpanded(p => !p)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-left text-[11px] font-bold text-violet-300 hover:text-violet-200 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span className="flex-1 truncate">AI Suggestions ({alerts.length})</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {expanded && (
            <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2 max-h-[140px] overflow-y-auto scrollbar-hide">
              {alerts.slice(0, 4).map((a, idx) => (
                <div
                  key={idx}
                  onClick={() => handleAlertClick(a)}
                  className="group cursor-pointer flex items-start gap-1.5 text-[10px] leading-relaxed text-white/70 hover:text-white transition-colors py-0.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white/85 truncate group-hover:underline">{a.title}</div>
                    <div className="text-[9px] text-white/45 truncate">{a.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <hr className="relative z-10 ws-nav-divider mx-1" />
      <button
        type="button"
        onClick={() => setShowShortcutPicker(true)}
        className="relative z-10 ws-nav-item ws-nav-new-shortcut w-full mx-0 mb-1"
      >
        <Plus className="w-[18px] h-[18px] shrink-0 stroke-[1.75]" />
        <span className="flex-1 text-left">New Shortcut</span>
      </button>

      {showShortcutPicker && (
        <WorkspaceShortcutPicker onClose={() => setShowShortcutPicker(false)} />
      )}
    </aside>
  );
}
