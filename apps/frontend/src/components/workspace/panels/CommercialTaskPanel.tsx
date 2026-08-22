import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { bdtTasks, type BdtTask, type TaskAssignee } from '../../../lib/db/bdtTasks';
import { GlassCard, SectionTitle } from './PanelShell';

const input = 'w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none';
const button = 'rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40';
const labels: Record<string,string> = { todo:'To do', in_progress:'In progress', blocked:'Blocked', done:'Done', cancelled:'Cancelled' };

export function CommercialTaskPanel({ nodeId }: { nodeId: string }) {
  const [tasks, setTasks] = useState<BdtTask[]>([]);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [manager, setManager] = useState(false);
  const [title, setTitle] = useState(''); const [assignee, setAssignee] = useState('');
  const [note, setNote] = useState<Record<string,string>>({}); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const result = await bdtTasks.list(nodeId); setTasks(result.items);
      const canManage = result.items.some(item => item.canManage);
      try {
        const people = await bdtTasks.assignees(nodeId);
        setManager(true); setAssignees(people.items); if (!assignee && people.items[0]) setAssignee(people.items[0].id);
      } catch { setManager(canManage); if (!canManage) setAssignees([]); }
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load tasks'); }
  }, [nodeId, assignee]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); const focus = () => void load(); window.addEventListener('focus', focus); return () => { window.clearInterval(timer); window.removeEventListener('focus', focus); }; }, [load]);
  const create = async (event: React.FormEvent) => { event.preventDefault(); try { await bdtTasks.create({ nodeId, assigneeMemberId: assignee, title }); setTitle(''); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create task'); } };
  const progress = async (task: BdtTask, status: string) => { const workNote = note[task.id] ?? task.work_note ?? ''; const blockedReason = status === 'blocked' ? workNote : null; try { await bdtTasks.progress(task.id, { status, workNote, blockedReason }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update task'); } };
  return <GlassCard>
    <div className="flex items-center justify-between gap-3"><SectionTitle icon={RefreshCw}>TASKS</SectionTitle><button className={button} onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /></button></div>
    {error && <p className="mb-3 text-xs text-rose-200">{error}</p>}
    {manager && <form onSubmit={create} className="mb-4 flex flex-wrap gap-2"><input value={title} onChange={e=>setTitle(e.target.value)} required placeholder="Assign a task" className="min-w-[180px] flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none" /><select value={assignee} onChange={e=>setAssignee(e.target.value)} className={input}>{assignees.map(person=><option key={person.id} value={person.id}>{[person.first_name,person.last_name].filter(Boolean).join(' ') || person.role}</option>)}</select><button className={button}><Plus className="mr-1 inline h-3.5 w-3.5" />Assign</button></form>}
    {tasks.length === 0 ? <p className="text-sm text-white/45">No tasks assigned to this node.</p> : <div className="space-y-2">{tasks.map(task => <div key={task.id} className="rounded-lg border border-white/10 bg-white/[.03] p-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-medium">{task.title}</p><p className="mt-1 text-xs text-white/45">{labels[task.status]} · {task.priority}{task.due_on ? ` · due ${task.due_on}` : ''}{task.overdue ? ' · overdue' : ''}</p></div>{task.related && <span className="text-xs text-white/40">{task.related.available ? task.related.label : `${task.related.label ?? 'Record'} removed`}</span>}</div>{task.canProgress && task.status !== 'cancelled' && <div className="mt-3 flex flex-wrap gap-2"><input value={note[task.id] ?? task.work_note ?? ''} onChange={e=>setNote(prev=>({...prev,[task.id]:e.target.value}))} placeholder={task.status === 'blocked' ? 'Blocked reason' : 'Work / completion note'} className="min-w-[180px] flex-1 rounded border border-white/10 bg-black/20 px-2 py-1 text-xs text-white" />{(['todo','in_progress','blocked','done'] as const).map(status=><button key={status} type="button" onClick={()=>void progress(task,status)} className={button}>{labels[status]}</button>)}</div>}{task.canManage && <div className="mt-2 flex gap-2">{task.status === 'cancelled' || task.status === 'done' ? <button className={button} onClick={()=>void bdtTasks.reopen(task.id).then(load)}>Reopen</button> : <button className={button} onClick={()=>{ const reason=window.prompt('Cancellation reason'); if(reason) void bdtTasks.cancel(task.id,reason).then(load); }}>Cancel</button>}</div>}</div>)}</div>}
  </GlassCard>;
}
