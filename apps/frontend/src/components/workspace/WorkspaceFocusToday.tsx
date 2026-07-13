import { useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';
import { LiquidGlass } from '../ui/LiquidGlass';

function FocusTaskCheck({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ws-focus-check flex items-center justify-center shrink-0 w-4.5 h-4.5 rounded-full border transition-all ${done
        ? 'bg-emerald-500 border-emerald-400 text-white shadow-[0_0_8px_rgba(16,185,129,0.4)]'
        : 'border-white/20 hover:border-white/40 bg-white/5'
        }`}
      aria-label={done ? 'Mark task as open' : 'Mark task as completed'}
    >
      {done && <Check className="w-3 h-3 stroke-[3]" />}
    </button>
  );
}

export function WorkspaceFocusToday() {
  const { tasks, toggleTask, addTask } = useFounderWorkspace();
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');

  const total = tasks.length;
  const doneCount = tasks.filter(t => t.done).length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskText.trim()) {
      addTask(newTaskText.trim());
      setNewTaskText('');
      setIsAdding(false);
    }
  };

  return (
    <LiquidGlass
      className="relative flex-1 w-full rounded-2xl overflow-hidden"
      radius={16}
      depth={18}
      scale={13}
      glow={0.3}
      edgeHighlight={0.22}
    >
    <div className="ws-focus-panel h-full flex flex-col min-h-0">
      <div className="ws-focus-header flex items-center justify-between mb-1">
        <h2 className="ws-focus-title text-sm font-semibold text-white">Focus Today</h2>
        <button
          type="button"
          onClick={() => setIsAdding(prev => !prev)}
          className="p-1 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
          aria-label="Add new focus task"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>

      <p className="ws-focus-status text-[11px] text-white/45">
        {doneCount} of {total} tasks completed
      </p>

      <div className="ws-focus-progress-row flex items-center gap-2">
        <div className="ws-focus-progress-track flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="ws-focus-progress-fill h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="ws-focus-pct text-[11px] text-white/65 font-bold tabular-nums min-w-[28px] text-right">{pct}%</span>
      </div>

      {isAdding && (
        <form onSubmit={handleAddTask} className="mb-3 flex items-center gap-1.5">
          <input
            type="text"
            value={newTaskText}
            onChange={e => setNewTaskText(e.target.value)}
            placeholder="Add dynamic task..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
            autoFocus
          />
          <button
            type="submit"
            className="px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-xs font-semibold text-purple-300 transition-colors"
          >
            Add
          </button>
        </form>
      )}

      <ul className="ws-focus-list space-y-2 overflow-y-auto flex-1 min-h-0 mt-2 pr-1">
        {tasks.map(task => (
          <li key={task.id} className="group">
            <div className="ws-focus-task flex items-start gap-2.5 py-0.5">
              <FocusTaskCheck done={task.done} onClick={() => toggleTask(task.id)} />
              <span className={`text-[12px] leading-tight select-none cursor-pointer transition-colors ${task.done
                ? 'ws-focus-task-label ws-focus-task-label--done text-white/35 line-through decoration-white/20'
                : 'ws-focus-task-label text-white/80 hover:text-white'
                }`}
                onClick={() => toggleTask(task.id)}
              >
                {task.label}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
    </LiquidGlass>
  );
}

