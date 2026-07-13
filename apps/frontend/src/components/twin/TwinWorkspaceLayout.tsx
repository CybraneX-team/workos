import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  WorkspaceLeftPanel,
  WorkspaceActiveCanvasPanel,
  WorkspaceRightPanel,
} from '../workspace/panels';
import type { TwinWorkspacePhase } from '../../lib/twinWorkspaceTransition';
import { FounderWorkspaceProvider, useFounderWorkspace, type WorkspaceEntryContext } from '../../context/FounderWorkspaceContext';
import { WorkspaceModeBar } from '../workspace/WorkspaceModeBar';

export interface TwinWorkspaceLayoutProps {
  phase: TwinWorkspacePhase;
  onClose?: () => void;
  entryContext?: WorkspaceEntryContext | null;
}

/** Panel chrome only — universe stays visible as the background (no workspace shell). */
export function TwinWorkspaceLayout({ phase, onClose, entryContext }: TwinWorkspaceLayoutProps) {
  if (phase !== 'entering' && phase !== 'open' && phase !== 'closing') return null;

  return (
    <FounderWorkspaceProvider initialEntryContext={entryContext}>
      <TwinWorkspaceLayoutInner phase={phase} onClose={onClose} />
    </FounderWorkspaceProvider>
  );
}

function TwinWorkspaceLayoutInner({ phase, onClose }: TwinWorkspaceLayoutProps) {
  const [isCollapsing, setIsCollapsing] = useState(false);
  const { scrollExpansion, isFullscreen } = useFounderWorkspace();

  const isClosing = phase === 'closing';
  const panelMotionClass = isClosing
    ? 'twin-workspace-panel--out'
    : 'twin-workspace-panel--in';

  const handleCloseClick = () => {
    if (isFullscreen || scrollExpansion > 0) {
      setIsCollapsing(true);
      window.dispatchEvent(new CustomEvent('collapse-workspace-canvas'));
      setTimeout(() => {
        setIsCollapsing(false);
        onClose?.();
      }, 2200);
    } else {
      onClose?.();
    }
  };

  // Allow inner surfaces (e.g. the empty saved-nodes state) to request a full close.
  useEffect(() => {
    const handleRequestClose = () => handleCloseClick();
    window.addEventListener('request-close-workspace', handleRequestClose);
    return () => window.removeEventListener('request-close-workspace', handleRequestClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, scrollExpansion]);

  // Hide the TopBar once the workspace starts expanding (scrollExpansion > 0 or fullscreen).
  // In collapsed state (scrollExpansion === 0) the TopBar is visible and the pill floats above canvas.
  const shouldHideTopBar = scrollExpansion > 0 || isFullscreen;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('workspace_toggled', { detail: shouldHideTopBar }));
  }, [shouldHideTopBar]);
  // Always restore TopBar when workspace closes
  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('workspace_toggled', { detail: false }));
  }, []);

  const p = scrollExpansion / 100;

  // Inline styles for grid morphing when 0 < scrollExpansion < 100
  const shellStyle: CSSProperties | undefined = (scrollExpansion > 0 && scrollExpansion < 100)
    ? {
        gridTemplateColumns: `${(1 - p) * 228}px minmax(0, 1fr) ${(1 - p) * 268}px`,
        gridTemplateRows: `${(1 - p) * 34}vh minmax(0, 1fr)`,
        gap: `${(1 - p) * 12}px`,
        paddingLeft: `${(1 - p) * 12}px`,
        paddingRight: `${(1 - p) * 12}px`,
        paddingBottom: `${(1 - p) * 8}px`,
      }
    : undefined;

  return (
    <div
      className={`twin-workspace-shell ${isClosing
        ? 'twin-workspace-shell--closing'
        : phase === 'open'
          ? 'twin-workspace-shell--open'
          : 'twin-workspace-shell--entering'
        } ${scrollExpansion > 0 && scrollExpansion < 100 ? 'twin-workspace-shell--scrolling' : ''}`}
      style={shellStyle}
    >
      {/* ── Fullscreen pill — floats at page top when canvas is fullscreen ── */}
      <div
        className="twin-workspace-topbar"
        style={{
          opacity: (isFullscreen && !isClosing) ? 1 : 0,
          transform: (isFullscreen && !isClosing) ? 'translateY(0)' : 'translateY(-14px)',
          pointerEvents: (isFullscreen && !isClosing) ? 'auto' : 'none',
          transition: isFullscreen
            ? 'opacity 0.4s cubic-bezier(0.16,1,0.3,1) 0.6s, transform 0.4s cubic-bezier(0.16,1,0.3,1) 0.6s'
            : 'opacity 0.18s ease, transform 0.18s ease',
        }}
      >
        <WorkspaceModeBar placement="top" />
      </div>

      {/* ── Close button — grid row 1 center, hidden in fullscreen ── */}
      <button
        type="button"
        onClick={handleCloseClick}
        disabled={isClosing || isCollapsing}
        className="twin-workspace-close group"
        aria-label="Close workspace"
        style={{
          // CSS animation fill-mode:forwards overrides inline opacity; clearing animation removes that lock
          animation: isFullscreen ? 'none' : undefined,
          opacity: isFullscreen ? 0 : undefined,
          pointerEvents: isFullscreen ? 'none' : undefined,
          transition: 'opacity 0.25s ease',
        }}
      >
        <span className="twin-workspace-close__chevrons" aria-hidden>
          <ChevronDown
            className="twin-workspace-close__chevron twin-workspace-close__chevron--first"
            strokeWidth={2.25}
          />
          <ChevronDown
            className="twin-workspace-close__chevron twin-workspace-close__chevron--second"
            strokeWidth={2.25}
          />
        </span>
        <span className="twin-workspace-close__label">Close Workspace</span>
      </button>

      <div className="twin-workspace-fullscreen-hover-zone" />

      <div
        className={`twin-workspace-panel twin-workspace-panel--left ${panelMotionClass}`}
      >
        <WorkspaceLeftPanel className="h-full" />
      </div>

      <div className="twin-workspace-fullscreen-hover-zone-right" />

      <div
        className={`twin-workspace-panel twin-workspace-panel--right ${panelMotionClass}`}
      >
        <WorkspaceRightPanel className="h-full max-h-full" />
      </div>


      <div className={`twin-workspace-panel twin-workspace-panel--canvas ${panelMotionClass}`}>
        <WorkspaceActiveCanvasPanel />
      </div>
    </div>
  );
}


