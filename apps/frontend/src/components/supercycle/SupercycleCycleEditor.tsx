import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronUp, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';
import type { BdtSupercycleInput, SupercycleDepartment, SupercycleRoute } from '../../lib/db/bdtSupercycle';

type DraftDepartment = { departmentId: string; nodeIds: string[] };
type DraftRoute = { label: string; color: string; departmentIds: string[] };
type EditorView = 'routes' | 'route' | 'workspaces';
const ROUTE_COLORS = ['#4fd8ff', '#c1aeff', '#22c55e', '#f0a83f', '#f05ca8', '#3fc7c9'];

function cloneInitialRoutes(routes: SupercycleRoute[]): DraftRoute[] {
  return routes.length
    ? routes.map((route) => ({ label: route.label, color: route.color, departmentIds: [...route.departmentIds] }))
    : [];
}

/** The department/workspace list is the union of the routes, never a second selection task for the user. */
function reconcileDepartments(current: DraftDepartment[], routes: DraftRoute[], lookup: Map<string, SupercycleDepartment>): DraftDepartment[] {
  const orderedIds: string[] = [];
  routes.forEach((route) => route.departmentIds.forEach((departmentId) => {
    if (!orderedIds.includes(departmentId)) orderedIds.push(departmentId);
  }));
  const existing = new Map(current.map((department) => [department.departmentId, department]));
  return orderedIds.map((departmentId) => existing.get(departmentId) ?? {
    departmentId,
    nodeIds: (lookup.get(departmentId)?.nodes ?? []).map((node) => node.id),
  });
}

export function SupercycleCycleEditor({ availableDepartments, initial, initialRoutes, onSave, onDelete }: {
  availableDepartments: SupercycleDepartment[]; initial: SupercycleDepartment[]; initialRoutes: SupercycleRoute[]; onSave: (value: BdtSupercycleInput) => Promise<void>; onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<EditorView>('routes');
  const [departments, setDepartments] = useState<DraftDepartment[]>([]);
  const [routes, setRoutes] = useState<DraftRoute[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftRoute, setDraftRoute] = useState<DraftRoute | null>(null);
  const [expandedDepartmentId, setExpandedDepartmentId] = useState<string | null>(null);
  const lookup = useMemo(() => new Map(availableDepartments.map((department) => [department.id, department])), [availableDepartments]);

  useEffect(() => {
    if (!open) return;
    const nextDepartments = initial.map((department) => ({ departmentId: department.id, nodeIds: department.nodes.map((node) => node.id) }));
    const nextRoutes = cloneInitialRoutes(initialRoutes);
    setDepartments(reconcileDepartments(nextDepartments, nextRoutes, lookup));
    setRoutes(nextRoutes);
    setError(null); setView('routes'); setDraftRoute(null); setEditingIndex(null); setExpandedDepartmentId(null);
  }, [open, initial, initialRoutes, lookup]);

  const startCreate = () => {
    setEditingIndex(null);
    setDraftRoute({ label: '', color: ROUTE_COLORS[routes.length % ROUTE_COLORS.length], departmentIds: [] });
    setError(null); setView('route'); setExpandedDepartmentId(null);
  };
  const startEdit = (index: number) => { setEditingIndex(index); setDraftRoute({ ...routes[index], departmentIds: [...routes[index].departmentIds] }); setError(null); setView('route'); setExpandedDepartmentId(null); };
  const returnToRoutes = () => { setView('routes'); setDraftRoute(null); setEditingIndex(null); setError(null); setExpandedDepartmentId(null); };
  const updateRouteDepartment = (departmentId: string) => setDraftRoute((current) => current && ({
    ...current,
    departmentIds: current.departmentIds.includes(departmentId) ? current.departmentIds.filter((id) => id !== departmentId) : [...current.departmentIds, departmentId],
  }));
  const moveDraftDepartment = (index: number, delta: number) => setDraftRoute((current) => {
    if (!current) return current;
    const next = [...current.departmentIds]; const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...current, departmentIds: next };
  });
  const saveRoute = () => {
    if (!draftRoute) return;
    if (!draftRoute.label.trim()) return setError('Give the route a name.');
    if (draftRoute.departmentIds.length < 2) return setError('Choose at least two departments.');
    const candidate: DraftRoute = { ...draftRoute, label: draftRoute.label.trim() };
    if (routes.some((route, index) => index !== editingIndex && route.label.toLocaleLowerCase() === candidate.label.toLocaleLowerCase())) return setError('Route names must be unique.');
    const nextRoutes = editingIndex === null ? [...routes, candidate] : routes.map((route, index) => index === editingIndex ? candidate : route);
    setRoutes(nextRoutes);
    setDepartments((current) => reconcileDepartments(current, nextRoutes, lookup));
    returnToRoutes();
  };
  const removeRoute = (index: number) => {
    const route = routes[index];
    if (!window.confirm(`Delete “${route.label}”?`)) return;
    const nextRoutes = routes.filter((_, routeIndex) => routeIndex !== index);
    setRoutes(nextRoutes);
    setDepartments((current) => reconcileDepartments(current, nextRoutes, lookup));
  };
  const moveRoute = (index: number, delta: number) => {
    const nextRoutes = [...routes]; const target = index + delta;
    if (target < 0 || target >= nextRoutes.length) return;
    [nextRoutes[index], nextRoutes[target]] = [nextRoutes[target], nextRoutes[index]];
    setRoutes(nextRoutes); setDepartments((current) => reconcileDepartments(current, nextRoutes, lookup));
  };
  const toggleWorkspace = (departmentId: string, nodeId: string) => setDepartments((current) => {
    const configured = current.find((department) => department.departmentId === departmentId);
    const existingIds = configured?.nodeIds ?? (lookup.get(departmentId)?.nodes ?? []).map((node) => node.id);
    const nodeIds = existingIds.includes(nodeId) ? existingIds.filter((id) => id !== nodeId) : [...existingIds, nodeId];
    return configured
      ? current.map((department) => department.departmentId === departmentId ? { ...department, nodeIds } : department)
      : [...current, { departmentId, nodeIds }];
  });
  const saveRepresentation = async () => {
    if (!routes.length) return setError('Create at least one route.');
    if (departments.some((department) => department.nodeIds.length === 0)) return setError('Select at least one workspace for every route department.');
    setSaving(true); setError(null);
    try { await onSave({ departments, routes }); setOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save Supercycle'); }
    finally { setSaving(false); }
  };

  const routeDepartmentSet = new Set(draftRoute?.departmentIds ?? []);
  const availableForRoute = availableDepartments.filter((department) => !routeDepartmentSet.has(department.id));
  return <>
    <button onClick={() => setOpen(true)} className="fixed right-6 top-20 z-[70] flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-black/65 px-3 py-2 text-xs font-semibold text-cyan-100 backdrop-blur-xl transition hover:border-cyan-300/50 hover:bg-cyan-400/10"><Pencil size={13} /> Edit cycles</button>
    {open && <aside className="fixed bottom-6 right-6 top-20 z-[80] flex w-[390px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#060a13]/95 shadow-2xl backdrop-blur-2xl">
      <header className="flex items-start justify-between border-b border-white/10 p-5"><div><div className="text-[10px] uppercase tracking-[.28em] text-cyan-300">Supercycle topology</div><h2 className="mt-1 text-lg font-semibold text-white">{view === 'routes' ? 'Value routes' : view === 'route' ? (editingIndex === null ? 'Create route' : 'Edit route') : 'Workspace access'}</h2><p className="mt-1 text-xs text-slate-500">{view === 'routes' ? 'A department can participate in several routes.' : view === 'route' ? 'Choose an ordered path through existing departments.' : 'Choose the real workspaces opened from each department.'}</p></div><button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white"><X size={17} /></button></header>

      <div className="flex-1 overflow-y-auto p-4">
        {view === 'routes' && <div>
          {routes.map((route, index) => <div key={`${route.label}-${index}`} className="mb-2 rounded-xl border border-white/8 bg-white/[.035] p-3"><div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full" style={{ background: route.color, boxShadow: `0 0 14px ${route.color}` }} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-white">{route.label}</div><div className="mt-0.5 text-[11px] text-slate-500">{route.departmentIds.length} departments · ordered</div></div><button onClick={() => moveRoute(index, -1)} disabled={index === 0} className="rounded-md p-1.5 text-slate-500 hover:bg-white/5 hover:text-white disabled:opacity-30"><ArrowUp size={14} /></button><button onClick={() => moveRoute(index, 1)} disabled={index === routes.length - 1} className="rounded-md p-1.5 text-slate-500 hover:bg-white/5 hover:text-white disabled:opacity-30"><ArrowDown size={14} /></button><button onClick={() => startEdit(index)} className="rounded-md p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil size={14} /></button><button onClick={() => removeRoute(index)} className="rounded-md p-2 text-slate-500 hover:bg-rose-400/10 hover:text-rose-300"><Trash2 size={14} /></button></div></div>)}
          {!routes.length && <div className="rounded-xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">No routes configured yet.</div>}
          <button onClick={startCreate} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950"><Plus size={15} /> Create route</button>
          <button disabled={!departments.length} onClick={() => { setError(null); setView('workspaces'); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"><Settings2 size={15} /> Configure workspaces ({departments.length})</button>
        </div>}

        {view === 'route' && draftRoute && <div>
          <label className="block text-xs text-slate-400">Route name<input autoFocus value={draftRoute.label} onChange={(event) => setDraftRoute({ ...draftRoute, label: event.target.value })} placeholder="e.g. Product launch" className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50" /></label>
          <div className="mt-5 text-xs text-slate-400">Colour<div className="mt-2 flex gap-2">{ROUTE_COLORS.map((color) => <button key={color} onClick={() => setDraftRoute({ ...draftRoute, color })} className="grid h-8 w-8 place-items-center rounded-full border transition" style={{ background: color, borderColor: draftRoute.color === color ? '#fff' : 'transparent', boxShadow: draftRoute.color === color ? `0 0 16px ${color}` : 'none' }}>{draftRoute.color === color && <Check size={14} className="text-slate-950" />}</button>)}</div></div>
          <div className="mt-5"><div className="text-xs text-slate-400">Route departments <span className="text-slate-600">({draftRoute.departmentIds.length} selected)</span></div><div className="mt-2 space-y-2">{draftRoute.departmentIds.map((departmentId, index) => {
            const department = lookup.get(departmentId);
            const configured = departments.find((entry) => entry.departmentId === departmentId);
            const selectedNodeIds = configured?.nodeIds ?? (department?.nodes ?? []).map((node) => node.id);
            const expanded = expandedDepartmentId === departmentId;
            return <div key={departmentId} className="rounded-lg border border-cyan-400/25 bg-cyan-400/[.07]">
              <div className="flex items-center gap-2 px-3 py-2.5"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cyan-300 text-xs font-bold text-slate-950">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm text-white">{department?.label ?? 'Unavailable department'}</span><button onClick={() => setExpandedDepartmentId(expanded ? null : departmentId)} className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-cyan-100 hover:bg-cyan-300/10">{selectedNodeIds.length} nodes {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button><button onClick={() => moveDraftDepartment(index, -1)} disabled={index === 0} className="text-slate-400 disabled:opacity-30"><ArrowUp size={14} /></button><button onClick={() => moveDraftDepartment(index, 1)} disabled={index === draftRoute.departmentIds.length - 1} className="text-slate-400 disabled:opacity-30"><ArrowDown size={14} /></button><button onClick={() => updateRouteDepartment(departmentId)} className="text-rose-300 hover:text-rose-200"><X size={15} /></button></div>
              {expanded && <div className="border-t border-cyan-400/15 px-3 py-2"><div className="mb-1 text-[11px] text-slate-400">Direct workspace nodes</div>{department?.nodes.map((node) => <label key={node.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-200 hover:bg-white/5"><input type="checkbox" checked={selectedNodeIds.includes(node.id)} onChange={() => toggleWorkspace(departmentId, node.id)} />{node.label}</label>)}</div>}
            </div>;
          })}</div></div>
          <div className="mt-5 text-xs text-slate-400">Add a department<div className="mt-2 space-y-2">{availableForRoute.map((department) => <button key={department.id} onClick={() => updateRouteDepartment(department.id)} className="flex w-full items-center gap-3 rounded-lg border border-white/8 bg-white/[.025] px-3 py-2.5 text-left text-sm text-slate-400 transition hover:border-cyan-400/30 hover:text-white"><Plus size={15} className="text-cyan-300" />{department.label}</button>)}{!availableForRoute.length && <div className="rounded-lg border border-dashed border-white/10 p-3 text-center text-xs text-slate-500">Every available department is already in this route.</div>}</div></div>
          {error && <div className="mt-3 text-xs text-rose-300">{error}</div>}<div className="mt-5 flex justify-end gap-2"><button onClick={returnToRoutes} className="px-3 py-2 text-xs text-slate-400">Cancel</button><button onClick={saveRoute} className="rounded-lg bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950">Save route</button></div>
        </div>}

        {view === 'workspaces' && <div><button onClick={() => { setError(null); setView('routes'); }} className="mb-4 flex items-center gap-1 text-xs text-cyan-200 hover:text-cyan-100"><ArrowLeft size={14} /> Back to routes</button><div className="space-y-3">{departments.map((configured) => { const department = lookup.get(configured.departmentId); if (!department) return null; return <div key={department.id} className="rounded-xl border border-white/8 bg-white/[.025] p-3"><div className="text-sm font-medium text-white">{department.label}</div><div className="mt-2 space-y-1 border-t border-white/8 pt-2">{department.nodes.map((node) => <label key={node.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-300 hover:bg-white/5"><input type="checkbox" checked={configured.nodeIds.includes(node.id)} onChange={() => toggleWorkspace(department.id, node.id)} />{node.label}</label>)}</div></div>; })}</div></div>}
      </div>
      {error && view !== 'route' && <p className="px-4 pb-2 text-xs text-rose-300">{error}</p>}<footer className="flex gap-2 border-t border-white/10 p-4"><button disabled={saving} onClick={async () => { if (!window.confirm('Remove this shared Supercycle representation?')) return; setSaving(true); try { await onDelete(); setOpen(false); } finally { setSaving(false); } }} className="rounded-lg border border-rose-400/25 px-3 py-2 text-xs text-rose-200 disabled:opacity-40"><Trash2 size={13} className="mr-1 inline" />Remove</button>{view !== 'route' && <button disabled={saving} onClick={saveRepresentation} className="ml-auto rounded-lg bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : 'Save representation'}</button>}</footer>
    </aside>}
  </>;
}
