import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { SupercycleNode } from '../../lib/supercycleData';
import type { PmsCycle } from '../../lib/usePmsStore';

const CYCLE_COLORS = ['#4fd8ff', '#c1aeff', '#22c55e', '#f0a83f', '#f05ca8', '#3fc7c9'];

type Draft = { id?: string; name: string; color: string; departmentIds: string[]; subNodeIds: string[] };

export function SupercycleCycleEditor({ cycles, departments, onCreate, onUpdate, onDelete }: {
  cycles: PmsCycle[];
  departments: SupercycleNode[];
  onCreate: (draft: Omit<Draft, 'id'>) => void;
  onUpdate: (id: string, draft: Omit<Draft, 'id'>) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { if (!open) setDraft(null); }, [open]);

  const startCreate = () => {
    setError('');
    setDraft({ name: '', color: CYCLE_COLORS[cycles.length % CYCLE_COLORS.length], departmentIds: [], subNodeIds: [] });
  };

  const toggleDepartment = (department: SupercycleNode) => {
    if (!draft) return;
    const selected = draft.departmentIds.includes(department.id);
    setDraft({
      ...draft,
      departmentIds: selected ? draft.departmentIds.filter((id) => id !== department.id) : [...draft.departmentIds, department.id],
      subNodeIds: selected ? draft.subNodeIds.filter((id) => !department.subNodes.some((subNode) => subNode.id === id)) : draft.subNodeIds,
    });
  };

  const toggleSubNode = (subNodeId: string) => {
    if (!draft) return;
    const selected = draft.subNodeIds.includes(subNodeId);
    setDraft({ ...draft, subNodeIds: selected ? draft.subNodeIds.filter((id) => id !== subNodeId) : [...draft.subNodeIds, subNodeId] });
  };

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) return setError('Give the cycle a name.');
    if (draft.departmentIds.length < 2) return setError('Choose at least two departments.');
    const validSubNodeIds = departments
      .filter((department) => draft.departmentIds.includes(department.id))
      .flatMap((department) => department.subNodes.map((subNode) => subNode.id));
    const input = {
      name: draft.name.trim(),
      color: draft.color,
      departmentIds: draft.departmentIds,
      subNodeIds: draft.subNodeIds.filter((id) => validSubNodeIds.includes(id)),
    };
    if (draft.id) onUpdate(draft.id, input); else onCreate(input);
    setDraft(null);
    setError('');
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-6 top-20 z-[70] flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-black/65 px-3 py-2 text-xs font-semibold text-cyan-100 backdrop-blur-xl transition hover:border-cyan-300/50 hover:bg-cyan-400/10"
      >
        <Pencil size={13} /> Edit cycles
      </button>
      {open && (
        <aside className="fixed bottom-6 right-6 top-20 z-[80] flex w-[400px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#060a13]/95 shadow-2xl backdrop-blur-2xl">
          <header className="flex items-start justify-between border-b border-white/10 p-5">
            <div><div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Supercycle topology</div><h2 className="mt-1 text-lg font-semibold text-white">Value cycles</h2><p className="mt-1 text-xs text-slate-500">Departments and their working nodes can participate in several cycles.</p></div>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white"><X size={17} /></button>
          </header>

          <div className="flex-1 overflow-y-auto p-4">
            {!draft && cycles.map((cycle) => (
              <div key={cycle.id} className="mb-2 rounded-xl border border-white/8 bg-white/[0.035] p-3">
                <div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full" style={{ background: cycle.color, boxShadow: `0 0 14px ${cycle.color}` }} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-white">{cycle.name}</div><div className="mt-0.5 text-[11px] text-slate-500">{cycle.departmentIds.length} departments · {(cycle.subNodeIds ?? []).length} sub-nodes</div></div><button onClick={() => setDraft({ id: cycle.id, name: cycle.name, color: cycle.color, departmentIds: cycle.departmentIds, subNodeIds: cycle.subNodeIds ?? [] })} className="rounded-md p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil size={14} /></button><button onClick={() => { if (window.confirm(`Delete “${cycle.name}”?`)) onDelete(cycle.id); }} className="rounded-md p-2 text-slate-500 hover:bg-rose-400/10 hover:text-rose-300"><Trash2 size={14} /></button></div>
              </div>
            ))}

            {!draft && cycles.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">No cycles configured.</div>}

            {draft && (
              <div>
                <label className="block text-xs text-slate-400">Cycle name<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Product launch" className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50" /></label>
                <div className="mt-5 text-xs text-slate-400">Colour<div className="mt-2 flex gap-2">{CYCLE_COLORS.map((color) => <button key={color} type="button" onClick={() => setDraft({ ...draft, color })} className="grid h-8 w-8 place-items-center rounded-full border transition" style={{ background: color, borderColor: draft.color === color ? '#fff' : 'transparent', boxShadow: draft.color === color ? `0 0 16px ${color}` : 'none' }}>{draft.color === color && <Check size={14} className="text-slate-950" />}</button>)}</div></div>
                <div className="mt-5 text-xs text-slate-400">Departments <span className="text-slate-600">({draft.departmentIds.length} selected)</span><div className="mt-2 space-y-2">{departments.map((department) => { const checked = draft.departmentIds.includes(department.id); return <button key={department.id} type="button" aria-pressed={checked} onClick={() => toggleDepartment(department)} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${checked ? 'border-cyan-400/30 bg-cyan-400/8 text-white' : 'border-white/8 bg-white/[0.025] text-slate-400 hover:text-white'}`}><span className="grid h-4 w-4 place-items-center rounded border" style={{ borderColor: checked ? department.color : 'rgba(255,255,255,.18)', background: checked ? department.color : 'transparent' }}>{checked && <Check size={11} className="text-slate-950" />}</span>{department.label}</button>; })}</div></div>
                <div className="mt-5 border-t border-white/10 pt-4 text-xs text-slate-400">Sub-nodes <span className="text-slate-600">({draft.subNodeIds.length} selected)</span><p className="mt-1 text-[11px] leading-relaxed text-slate-600">Choose working nodes from the selected departments. They appear as orbit beads when this cycle is active.</p>{draft.departmentIds.length === 0 ? <div className="mt-3 rounded-lg border border-dashed border-white/10 p-3 text-[11px] text-slate-600">Select departments first.</div> : <div className="mt-3 space-y-3">{departments.filter((department) => draft.departmentIds.includes(department.id)).map((department) => <div key={department.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3"><div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: department.color }}>{department.label}</div><div className="flex flex-wrap gap-2">{department.subNodes.map((subNode) => { const checked = draft.subNodeIds.includes(subNode.id); return <button key={subNode.id} type="button" aria-pressed={checked} onClick={() => toggleSubNode(subNode.id)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] transition ${checked ? 'border-white/30 bg-white/10 text-white' : 'border-white/8 text-slate-500 hover:text-slate-200'}`}><span className="h-1.5 w-1.5 rounded-full" style={{ background: checked ? draft.color : department.color }} />{subNode.label}</button>; })}</div></div>)}</div>}</div>
                {error && <div className="mt-3 text-xs text-rose-300">{error}</div>}
                <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setDraft(null); setError(''); }} className="px-3 py-2 text-xs text-slate-400">Cancel</button><button type="button" onClick={save} className="rounded-lg bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950">Save cycle</button></div>
              </div>
            )}
          </div>

          {!draft && <footer className="border-t border-white/10 p-4"><button disabled={cycles.length >= 6} onClick={startCreate} className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-35"><Plus size={15} />{cycles.length >= 6 ? 'Six-cycle limit reached' : 'Create cycle'}</button></footer>}
        </aside>
      )}
    </>
  );
}
