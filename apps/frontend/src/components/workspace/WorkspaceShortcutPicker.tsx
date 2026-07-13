import { useState } from 'react';
import { X, LayoutGrid, Folder, Rocket, CircleDollarSign, Users, ChartLine } from 'lucide-react';
import { useFounderWorkspace, type ShortcutItem } from '../../context/FounderWorkspaceContext';
import { useProjectsStore } from '../../lib/useProjectsStore';

const ACCENT = '#C1AEFF';

const TEMPLATES: { label: string; templateTab: string; icon: typeof Rocket }[] = [
  { label: 'AI Product Roadmap', templateTab: 'roadmap', icon: Rocket },
  { label: 'Fundraising Prep', templateTab: 'fundraising', icon: CircleDollarSign },
  { label: 'Customer Interviews', templateTab: 'interviews', icon: Users },
  { label: 'Competitor Analysis', templateTab: 'competitors', icon: ChartLine },
];

export function WorkspaceShortcutPicker({ onClose }: { onClose: () => void }) {
  const { workspaces, activeWorkspaceId, addShortcut } = useFounderWorkspace();
  const { projects } = useProjectsStore();
  const [section, setSection] = useState<'workspace' | 'project' | 'template'>('template');

  const pick = (item: Omit<ShortcutItem, 'id'>) => {
    addShortcut(item);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl p-5 border max-h-[70vh] flex flex-col"
        style={{ borderColor: 'rgba(255,255,255,0.1)', background: '#141418' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="text-sm font-bold text-white">Add Shortcut</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-white/30 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/8 mb-4 shrink-0">
          {(['template', 'workspace', 'project'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all ${section === s ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col gap-1.5">
          {section === 'template' && TEMPLATES.map(t => (
            <button
              key={t.templateTab}
              type="button"
              onClick={() => pick({ label: t.label, kind: 'template', templateTab: t.templateTab })}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/18 transition-all text-left"
            >
              <t.icon className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
              <span className="text-[12px] font-semibold text-white/80">{t.label}</span>
            </button>
          ))}

          {section === 'workspace' && (
            workspaces.filter(w => w.id !== activeWorkspaceId).length === 0 ? (
              <div className="py-8 text-center text-[12px] text-white/25">No other workspaces yet.</div>
            ) : (
              workspaces.filter(w => w.id !== activeWorkspaceId).map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => pick({ label: w.name, kind: 'workspace', targetId: w.id })}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/18 transition-all text-left"
                >
                  <LayoutGrid className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
                  <span className="text-[12px] font-semibold text-white/80 truncate">{w.name}</span>
                </button>
              ))
            )
          )}

          {section === 'project' && (
            projects.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-white/25">No projects yet.</div>
            ) : (
              projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick({ label: p.name, kind: 'project', targetId: p.id })}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/18 transition-all text-left"
                >
                  <Folder className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
                  <span className="text-[12px] font-semibold text-white/80 truncate">{p.name}</span>
                </button>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}
