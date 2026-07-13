import { Compass, Scale, Zap, CheckCircle, Bot, Minimize2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useFounderWorkspace,
  type WorkspaceMode,
  type WorkspaceRole,
} from '../../context/FounderWorkspaceContext';

const ACCENT = '#C1AEFF';

const MODES: { id: WorkspaceMode; label: string; Icon: LucideIcon; color: string; tab: string }[] = [
  { id: 'explore', label: 'Explore', Icon: Compass, color: '#60a5fa', tab: 'canvas' },
  { id: 'decision', label: 'Decision', Icon: Scale, color: '#fbbf24', tab: 'decisions' },
  { id: 'execution', label: 'My Work', Icon: Zap, color: ACCENT, tab: 'tasks' },
  { id: 'review', label: 'Review', Icon: CheckCircle, color: '#34d399', tab: 'goals-metrics' },
  { id: 'agent', label: 'Agent', Icon: Bot, color: '#f472b6', tab: 'canvas' },
];

const ROLES: { id: WorkspaceRole; label: string; color: string }[] = [
  { id: 'founder', label: 'Founder', color: ACCENT },
  { id: 'manager', label: 'Manager', color: '#60a5fa' },
  { id: 'member', label: 'Member', color: '#34d399' },
];

interface WorkspaceModeBarProps {
  /** 'top'      = full-width bar at page top, replacing the TopBar (always visible when workspace is open).
   *  'external' = floating glass pill above the canvas frame (legacy).
   *  'internal' = inside the canvas frame (legacy). */
  placement?: 'top' | 'external' | 'internal';
}

export function WorkspaceModeBar({ placement = 'top' }: WorkspaceModeBarProps) {
  const {
    workspaceMode, setWorkspaceMode,
    activeRole, setActiveRole,
    setActiveSidebarTab,
    setIsFullscreen,
  } = useFounderWorkspace();

  const handleMode = (mode: typeof MODES[number]) => {
    setWorkspaceMode(mode.id);
    setActiveSidebarTab(mode.tab as Parameters<typeof setActiveSidebarTab>[0]);
    // For explore/agent, also switch canvas view
    if (mode.id === 'explore') {
      window.dispatchEvent(new CustomEvent('workspace-set-canvas-view', { detail: { view: 'nodes' } }));
    } else if (mode.id === 'agent') {
      window.dispatchEvent(new CustomEvent('workspace-set-canvas-view', { detail: { view: 'overview' } }));
    }
  };

  /* ── Top placement — pill centered in the TopBar zone (fullscreen only) ─── */
  if (placement === 'top') {
    return (
      <div className="flex items-center justify-center h-full w-full px-4">
        {/* The actual pill — same design language as external */}
        <div
          className="flex items-center gap-0 px-2 rounded-xl border border-white/[0.1]"
          style={{
            height: 36,
            background: 'rgba(10,10,18,0.62)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
            pointerEvents: 'auto',
          }}
        >
          {/* Mode pills */}
          <div className="flex items-center gap-0.5">
            {MODES.map(mode => {
              const active = workspaceMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleMode(mode)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                  style={active
                    ? { background: `${mode.color}1a`, color: mode.color, border: `1px solid ${mode.color}35` }
                    : { color: 'rgba(255,255,255,0.38)', border: '1px solid transparent' }}
                >
                  <mode.Icon className="w-3 h-3 shrink-0" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="w-px h-3.5 bg-white/10 mx-2 shrink-0" />

          {/* Role lens */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[9px] uppercase tracking-wider text-white/22 mr-0.5 font-bold">Preview Mode</span>
            {ROLES.map(r => {
              const active = activeRole === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setActiveRole(r.id)}
                  className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-all"
                  style={active
                    ? { background: `${r.color}18`, color: r.color, border: `1px solid ${r.color}40` }
                    : { color: 'rgba(255,255,255,0.28)', border: '1px solid transparent' }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="w-px h-3.5 bg-white/10 mx-2 shrink-0" />

          {/* Exit fullscreen */}
          <button
            type="button"
            title="Exit fullscreen"
            onClick={() => setIsFullscreen(false)}
            className="p-1.5 rounded-md text-white/35 hover:text-white/80 hover:bg-white/8 transition-all"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (placement === 'internal') {
    return (
      <div className="shrink-0 flex items-center gap-0 pl-4 pr-3 border-b border-white/[0.07]" style={{ height: 38 }}>

        {/* Mode pills */}
        <div className="flex items-center gap-0 flex-1 min-w-0">
          {MODES.map(mode => {
            const active = workspaceMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                title={mode.label}
                onClick={() => handleMode(mode)}
                className="flex items-center gap-1.5 px-2.5 h-full text-[11px] font-semibold transition-colors relative"
                style={active
                  ? { color: mode.color, borderBottom: `2px solid ${mode.color}`, background: `${mode.color}12` }
                  : { color: 'rgba(255,255,255,0.32)', borderBottom: '2px solid transparent' }}
              >
                <mode.Icon className="w-3 h-3 shrink-0" />
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-white/10 mx-2 shrink-0" />

        {/* Role lens */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[9px] uppercase tracking-wider text-white/25 mr-1 font-bold">Preview Mode</span>
          {ROLES.map(r => {
            const active = activeRole === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setActiveRole(r.id)}
                className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all"
                style={active
                  ? { background: `${r.color}18`, color: r.color, border: `1px solid ${r.color}40` }
                  : { color: 'rgba(255,255,255,0.28)', border: '1px solid transparent' }}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-white/10 mx-2 shrink-0" />

        {/* Exit fullscreen */}
        <button
          type="button"
          title="Exit fullscreen"
          onClick={() => setIsFullscreen(false)}
          className="p-1.5 rounded-md text-white/35 hover:text-white hover:bg-white/8 transition-all"
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  /* ── External (floating above the canvas frame) ──────────────────────── */
  return (
    <div
      className="flex items-center gap-0 p-2 py-5 mx-auto max-w-6xl justify-center rounded-xl border border-white/[0.1]"
      style={{
        height: 34,
        background: 'rgba(10,10,18,0.55)',
        backdropFilter: 'blur(16px)',
        pointerEvents: 'auto',
      }}
    >
      {/* Mode pills */}
      <div className="flex items-center gap-0.5 flex-1 min-w-0">
        {MODES.map(mode => {
          const active = workspaceMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleMode(mode)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
              style={active
                ? { background: `${mode.color}1a`, color: mode.color, border: `1px solid ${mode.color}35` }
                : { color: 'rgba(255,255,255,0.38)', border: '1px solid transparent' }}
            >
              <mode.Icon className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-3.5 bg-white/10 mx-2 shrink-0" />

      {/* Role lens */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[9px] uppercase tracking-wider text-white/22 mr-1 font-bold hidden sm:inline">Preview Mode</span>
        {ROLES.map(r => {
          const active = activeRole === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setActiveRole(r.id)}
              className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-all"
              style={active
                ? { background: `${r.color}18`, color: r.color, border: `1px solid ${r.color}40` }
                : { color: 'rgba(255,255,255,0.28)', border: '1px solid transparent' }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
