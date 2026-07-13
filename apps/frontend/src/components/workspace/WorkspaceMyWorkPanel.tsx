import { Check, Clock, Layers } from 'lucide-react';
import { useProjectsStore } from '../../lib/useProjectsStore';

const ACCENT = '#C1AEFF';
const B = 'rgba(255,255,255,0.08)';

export function WorkspaceMyWorkPanel() {
  const { tasks, projects, currentMemberId, updateTask } = useProjectsStore();

  const myTasks = tasks
    .filter(t => t.assigneeId === currentMemberId && t.status !== 'done')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

  const doneCount = tasks.filter(t => t.assigneeId === currentMemberId && t.status === 'done').length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full h-full overflow-y-auto scrollbar-hide flex flex-col gap-4 pb-6 pr-1">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">My Work</h3>
          <div className="text-[11px] text-white/35 mt-0.5">
            {myTasks.length} open task{myTasks.length !== 1 ? 's' : ''} assigned to you · {doneCount} done
          </div>
        </div>
      </div>

      {myTasks.length === 0 ? (
        <div className="py-12 text-center rounded-xl border border-dashed" style={{ borderColor: B }}>
          <Check className="w-6 h-6 mx-auto mb-2 text-emerald-400/60" />
          <div className="text-sm text-white/40">Nothing assigned to you right now</div>
          <div className="text-[11px] text-white/20 mt-1">New tasks from your projects will show up here.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {myTasks.map(t => {
            const project = projects.find(p => p.id === t.projectId);
            const overdue = !!t.dueDate && t.dueDate < today;
            return (
              <div key={t.id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border" style={{ borderColor: B, background: 'rgba(255,255,255,0.015)' }}>
                <button
                  type="button"
                  onClick={() => updateTask(t.id, { status: 'done' })}
                  className="w-4.5 h-4.5 shrink-0 rounded-full border border-white/20 hover:border-emerald-400 hover:bg-emerald-400/10 transition-all"
                  aria-label="Mark task done"
                />
                <span className="flex-1 text-[12px] text-white/80 truncate">{t.title}</span>
                {project && (
                  <span className="flex items-center gap-1 text-[10px] text-white/30 shrink-0">
                    <Layers className="w-3 h-3" /> {project.name}
                  </span>
                )}
                {t.dueDate && (
                  <span className="flex items-center gap-1 text-[10px] shrink-0" style={{ color: overdue ? '#fb7185' : 'rgba(255,255,255,0.3)' }}>
                    <Clock className="w-3 h-3" /> {t.dueDate}
                  </span>
                )}
                {t.status === 'in_progress' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: `${ACCENT}1f`, color: ACCENT, border: `1px solid ${ACCENT}40` }}>
                    In progress
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
