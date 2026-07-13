import { WorkspaceSignalsPanel } from '../WorkspaceSignalsPanel';
import { WorkspaceFocusToday } from '../WorkspaceFocusToday';
import { LiquidGlass } from '../../ui/LiquidGlass';

/** Right rail — live signals intelligence + focus today. */
export function WorkspaceRightPanel({ className }: { className?: string }) {
  return (
    <aside className={`ws-right-panel flex flex-col gap-3 shrink-0 h-full min-h-0 ${className ?? ''}`}>

      {/* ── Signals Intelligence ─────────────────────────────────────────── */}
      <LiquidGlass
        className="relative rounded-2xl flex-1 min-h-0 overflow-hidden"
        radius={16}
        depth={20}
        scale={13}
        glow={0.3}
        edgeHighlight={0.22}
      >
        <div className="p-3 pt-3.5 h-full flex flex-col min-h-0">
          <WorkspaceSignalsPanel />
        </div>
      </LiquidGlass>

      {/* ── Focus Today ──────────────────────────────────────────────────── */}
      <WorkspaceFocusToday />

    </aside>
  );
}
