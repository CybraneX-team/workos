import { useState } from 'react';
import { ArrowRight, Save, RotateCcw, Trash2, Check, X, Bookmark } from 'lucide-react';
import type { BdtWorkflowTrailSession } from '../../lib/useWorkflowTrail';
import type { UExternalNode } from '../../lib/usePolytopeStore';
import { U_DOMAIN_COLOR } from '../../lib/usePolytopeStore';

export interface WorkflowTrailRibbonProps {
  session: BdtWorkflowTrailSession | null;
  departments: UExternalNode[];
  onSave?: (title: string, note?: string) => void;
  onCancel?: () => void;
  onUndo?: () => void;
  isReplay?: boolean;
  replayStepIndex?: number;
  onReplayNext?: () => void;
  onReplayPrev?: () => void;
}

export default function WorkflowTrailRibbon({
  session,
  departments,
  onSave,
  onCancel,
  onUndo,
  isReplay = false,
  replayStepIndex = 0,
  onReplayNext,
  onReplayPrev,
}: WorkflowTrailRibbonProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  if (!session) return null;

  const handleStartSave = () => {
    setTitle(`${session.anchor.nodeLabel} Path`);
    setNote('');
    setIsSaving(true);
  };

  const handleConfirmSave = () => {
    if (onSave) {
      onSave(title || `${session.anchor.nodeLabel} Path`, note);
    }
    setIsSaving(false);
  };

  const getDeptColor = (deptId: string) => {
    const dept = departments.find(d => d.id === deptId);
    if (!dept) return '#8b5cf6';
    return U_DOMAIN_COLOR[dept.domain] || '#8b5cf6';
  };

  const anchorColor = getDeptColor(session.anchor.deptId);

  return (
    <div
      className="relative z-30 flex flex-col w-full px-8 py-3 gap-2 border-b transition-all"
      style={{
        background: 'rgba(13, 12, 22, 0.45)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Trail Flow Container */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-[9px] font-bold tracking-widest text-white/30 uppercase mr-1">
            {isReplay ? 'REPLAYING PATH' : 'ACTIVE TRAIL'}
          </span>

          {/* Anchor node */}
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              background: `${anchorColor}12`,
              border: `1px solid ${anchorColor}35`,
              color: '#ffffff',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: anchorColor }} />
            <span>{session.anchor.deptLabel}</span>
            <span className="text-white/40 font-normal">({session.anchor.nodeLabel})</span>
          </div>

          {/* Stops */}
          {session.stops.map((stop, index) => {
            const stopColor = getDeptColor(stop.deptId);
            const isActive = isReplay 
              ? index + 1 === replayStepIndex
              : index === session.stops.length - 1;

            return (
              <div key={index} className="flex items-center gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-white/20" />
                <div
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background: isActive ? `${stopColor}25` : `${stopColor}08`,
                    border: `1px solid ${isActive ? stopColor : 'rgba(255,255,255,0.06)'}`,
                    color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
                    boxShadow: isActive ? `0 0 10px ${stopColor}20` : 'none',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stopColor }} />
                  <span>{stop.deptLabel}</span>
                  {stop.nodeLabel && (
                    <span className="text-[10px] opacity-60 font-normal">({stop.nodeLabel})</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Trail Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isReplay ? (
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg p-0.5">
              <button
                type="button"
                onClick={onReplayPrev}
                disabled={replayStepIndex === 0}
                className="px-2.5 py-1 text-xs font-medium rounded hover:bg-white/5 text-white/60 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                Prev
              </button>
              <span className="text-[10px] text-white/30 px-1 font-mono">
                {replayStepIndex} / {session.stops.length}
              </span>
              <button
                type="button"
                onClick={onReplayNext}
                disabled={replayStepIndex === session.stops.length}
                className="px-2.5 py-1 text-xs font-medium rounded bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 text-purple-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                Next
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="p-1 text-white/30 hover:text-rose-400 rounded hover:bg-rose-500/10 transition-colors ml-1"
                title="Exit Replay"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onUndo}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 border border-white/5 hover:bg-white/5 hover:text-white transition-all"
                title="Undo last hop"
              >
                <RotateCcw className="w-3 h-3" />
                Undo
              </button>

              <button
                type="button"
                onClick={onCancel}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400/70 border border-rose-500/10 hover:bg-rose-500/10 hover:text-rose-400 transition-all"
                title="Discard active trail"
              >
                <Trash2 className="w-3 h-3" />
                Cancel
              </button>

              <button
                type="button"
                onClick={handleStartSave}
                className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-semibold bg-purple-600/90 hover:bg-purple-600 border border-purple-500/30 text-white shadow-lg transition-all"
                title="Save this trail route"
              >
                <Save className="w-3.5 h-3.5" />
                Save Path
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save Popup Dialog */}
      {isSaving && (
        <div
          className="flex flex-col md:flex-row items-end md:items-center gap-3 p-4 rounded-xl border mt-2 animate-in fade-in slide-in-from-top-2 duration-200"
          style={{
            background: 'rgba(25, 22, 40, 0.8)',
            borderColor: 'rgba(139, 127, 204, 0.25)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          }}
        >
          <div className="flex-1 w-full space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] text-purple-300 font-semibold uppercase tracking-wider">
              <Bookmark className="w-3.5 h-3.5" />
              Save Operating Route
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Enter trail title..."
                className="flex-1 text-xs px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white outline-none focus:border-purple-500/50 transition-colors"
              />
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add optional notes about this route..."
                className="flex-[2] text-xs px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white outline-none focus:border-purple-500/50 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={() => setIsSaving(false)}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-white/50 hover:bg-white/5 transition-all border border-transparent"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmSave}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 text-white shadow-lg transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              Confirm Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
