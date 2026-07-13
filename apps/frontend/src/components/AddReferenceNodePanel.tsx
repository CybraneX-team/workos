import { useState } from 'react';
import { X, Plus, CheckCircle2, Loader2, Layers } from 'lucide-react';
import type { PlanetBranchNodeType } from '../data/companyPlanetRoots';
import { PLANET_BRANCH_TYPE_LABELS } from '../data/companyPlanetRoots';
import type { CreateReferenceCompanyNodeInput } from '../lib/db/referenceCompanies';

export interface AddReferenceNodePanelProps {
  /** Fixed by the drill level: a branch is added inside a root, an action inside a branch. */
  nodeKind: 'branch' | 'action';
  /** Parent node id — the focused root (for a branch) or focused branch (for an action). */
  parentNodeId: string;
  /** Human label of the parent, shown as context ("inside X"). */
  parentLabel: string;
  accentColor?: string;
  onClose: () => void;
  onCreate: (input: CreateReferenceCompanyNodeInput) => Promise<void>;
}

const NODE_TYPES = Object.keys(PLANET_BRANCH_TYPE_LABELS) as PlanetBranchNodeType[];

const inputStyle = 'w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/30';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5E5E5E' }}>{children}</label>;
}

/**
 * Docked, drill-contextual add-node panel for IDT reference-company planets.
 * Mirrors the BDT CreateDepartmentPanel placement: a left-rail card whose parent
 * is implied by where the user has drilled, not chosen from a dropdown.
 */
export function AddReferenceNodePanel({
  nodeKind,
  parentNodeId,
  parentLabel,
  accentColor = '#C1AEFF',
  onClose,
  onCreate,
}: AddReferenceNodePanelProps) {
  const [label, setLabel] = useState('');
  const [summary, setSummary] = useState('');
  const [nodeType, setNodeType] = useState<PlanetBranchNodeType>('signal');
  const [relevance, setRelevance] = useState(75);
  const [confidence, setConfidence] = useState(70); // 0–100 UI, sent as 0–1
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBranch = nodeKind === 'branch';
  const isValid = label.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        nodeKind,
        parentNodeId,
        label: label.trim(),
        summary: summary.trim() || undefined,
        nodeType: isBranch ? nodeType : undefined,
        relevance,
        confidence: confidence / 100,
      });
      setDone(true);
      setTimeout(onClose, 850);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add node');
      setSaving(false);
    }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-xl flex flex-col"
      style={{
        width: '264px',
        maxHeight: '460px',
        background: 'rgba(10,10,12,0.92)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: `1px solid ${accentColor}33`,
      }}
    >
      <div className="h-1 w-full shrink-0" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />

      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-3.5 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0" style={{ background: `${accentColor}1f`, border: `1px solid ${accentColor}40` }}>
            <Layers className="w-3.5 h-3.5" style={{ color: accentColor }} />
          </span>
          <div>
            <h3 className="text-[13px] font-bold text-white leading-tight">Add {isBranch ? 'node' : 'action'}</h3>
            <p className="text-[10px] text-white/40 leading-tight mt-0.5">
              {isBranch ? 'Inside' : 'Under'} <span className="text-white/70 font-medium">{parentLabel}</span>
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {done ? (
        <div className="flex flex-col items-center gap-2.5 py-8 px-4">
          <CheckCircle2 className="w-9 h-9" style={{ color: accentColor }} />
          <p className="text-[13px] font-semibold text-white">{isBranch ? 'Node' : 'Action'} added</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 px-4 pb-3 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {isBranch && (
            <div className="flex flex-col gap-1">
              <FieldLabel>Node type</FieldLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {NODE_TYPES.map(t => {
                  const active = nodeType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNodeType(t)}
                      className="text-[10px] font-semibold px-1.5 py-1.5 rounded-lg border transition-all"
                      style={active
                        ? { background: `${accentColor}22`, borderColor: `${accentColor}55`, color: accentColor }
                        : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: '#94a3b8' }}
                    >
                      {PLANET_BRANCH_TYPE_LABELS[t]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <FieldLabel>{isBranch ? 'Label *' : 'Action label *'}</FieldLabel>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              autoFocus
              placeholder={isBranch ? 'e.g. Competitor cut prices 15%' : 'e.g. Review pricing response'}
              className={inputStyle}
            />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>Summary (optional)</FieldLabel>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={2}
              placeholder="Context for this node…"
              className={`${inputStyle} resize-none`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-white/40">
              <span>Relevance</span><span className="tabular-nums" style={{ color: accentColor }}>{relevance}%</span>
            </div>
            <input type="range" min={0} max={100} value={relevance} onChange={e => setRelevance(Number(e.target.value))} className="w-full" style={{ accentColor }} />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-white/40">
              <span>Confidence</span><span className="tabular-nums" style={{ color: accentColor }}>{confidence}%</span>
            </div>
            <input type="range" min={0} max={100} value={confidence} onChange={e => setConfidence(Number(e.target.value))} className="w-full" style={{ accentColor }} />
          </div>

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-lg text-[11px] font-medium text-white/55 hover:text-white hover:bg-white/5">Cancel</button>
            <button
              type="submit"
              disabled={!isValid || saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-semibold disabled:opacity-40"
              style={{ background: `${accentColor}26`, border: `1px solid ${accentColor}55`, color: accentColor }}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add {isBranch ? 'node' : 'action'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
