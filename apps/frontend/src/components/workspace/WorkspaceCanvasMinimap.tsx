import { Crosshair, Minus, Plus } from 'lucide-react';
import { WORKSPACE_CANVAS_CARDS } from '../../lib/workspaceLayoutData';

export function WorkspaceCanvasMinimap() {
  return (
    <div className="ws-minimap-wrap">
      <div className="ws-minimap-panel">
        <div className="ws-minimap-view relative overflow-hidden">
          {WORKSPACE_CANVAS_CARDS.map(c => (
            <div
              key={c.id}
              className="absolute w-2 h-1.5 rounded-[1px]"
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                background: c.accent,
                opacity: 0.85,
              }}
            />
          ))}
          <div className="ws-minimap-viewport" aria-hidden />
        </div>
      </div>

      <div className="ws-minimap-controls">
        <button type="button" className="ws-minimap-control-btn" aria-label="Zoom in">
          <Plus className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
        <button type="button" className="ws-minimap-control-btn" aria-label="Zoom out">
          <Minus className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
        <button type="button" className="ws-minimap-control-btn" aria-label="Recenter canvas">
          <Crosshair className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
