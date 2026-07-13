import { useState } from 'react';
import { X, LayoutGrid } from 'lucide-react';

const ACCENT = '#C1AEFF';

interface WorkspaceCreateModalProps {
  onCreate: (name: string, purpose?: string) => void;
  onClose: () => void;
}

export function WorkspaceCreateModal({ onCreate, onClose }: WorkspaceCreateModalProps) {
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), purpose.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl p-5 border"
        style={{ borderColor: 'rgba(255,255,255,0.1)', background: '#141418' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}35` }}>
              <LayoutGrid className="w-4 h-4" style={{ color: ACCENT }} />
            </div>
            <h3 className="text-sm font-bold text-white">New Workspace</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-white/30 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/35 mb-1.5 block">Name</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Series A Fundraise"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/25 outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/35 mb-1.5 block">What's this workspace for? <span className="normal-case text-white/20">(optional)</span></label>
            <textarea
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="A short note on the goal of this workspace…"
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/25 outline-none focus:border-white/25 resize-none"
            />
          </div>
          <p className="text-[10px] text-white/25 leading-relaxed">
            This workspace starts empty — its own goals, departments, risks, and GTM plan, separate from every other workspace.
          </p>
          <button
            type="submit"
            disabled={!name.trim()}
            className="mt-1 w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: `${ACCENT}26`, border: `1px solid ${ACCENT}44`, color: ACCENT }}
          >
            Create Workspace
          </button>
        </form>
      </div>
    </div>
  );
}
