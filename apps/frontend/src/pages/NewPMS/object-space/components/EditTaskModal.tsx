import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import type { ImplementationTask, TaskPriority, TaskStatus } from '../types';

interface EditTaskModalProps {
  isOpen: boolean;
  task: ImplementationTask | null;
  currentUser?: { name: string; email: string };
  onUpdateTask: (updatedTask: ImplementationTask) => void;
  onClose: () => void;
}

const STATUS_CONFIG: { id: TaskStatus; label: string; activeClass: string; inactiveClass: string; dotClass: string }[] = [
  {
    id: 'active',
    label: 'Active',
    activeClass: 'bg-purple-600 border-purple-600 text-white shadow-xs font-bold',
    inactiveClass: 'bg-purple-50/50 border-purple-200/80 text-purple-700 hover:bg-purple-100/70',
    dotClass: 'bg-purple-500',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    activeClass: 'bg-blue-600 border-blue-600 text-white shadow-xs font-bold',
    inactiveClass: 'bg-blue-50/50 border-blue-200/80 text-blue-700 hover:bg-blue-100/70',
    dotClass: 'bg-blue-500',
  },
  {
    id: 'completed',
    label: 'Completed',
    activeClass: 'bg-emerald-600 border-emerald-600 text-white shadow-xs font-bold',
    inactiveClass: 'bg-emerald-50/50 border-emerald-200/80 text-emerald-700 hover:bg-emerald-100/70',
    dotClass: 'bg-emerald-500',
  },
];

export const EditTaskModal: React.FC<EditTaskModalProps> = ({
  isOpen,
  task,
  currentUser = { name: 'Ronak', email: 'manager@example.com' },
  onUpdateTask,
  onClose,
}) => {
  const getTodayDateString = () => {
    try {
      return new Date().toISOString().slice(0, 10);
    } catch {
      return '2026-10-04';
    }
  };

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TaskStatus>('active');
  const [goal, setGoal] = useState('');
  const [dueDate, setDueDate] = useState(getTodayDateString());
  const [dueTime, setDueTime] = useState('18:00');
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setStatus(task.status || 'active');
      setGoal(task.goal);
      setEstimatedMinutes(task.estimatedMinutes || 60);

      // Parse existing due format
      if (task.due && task.due.includes(' at ')) {
        const [d, t] = task.due.split(' at ');
        setDueDate(d.trim() || getTodayDateString());
        setDueTime(t.trim() || '18:00');
      } else {
        setDueDate(getTodayDateString());
        setDueTime('18:00');
      }
    }
  }, [task]);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isOpen]);

  if (!isOpen || !task) return null;

  const priority: TaskPriority = status === 'active' ? 'high' : status === 'in_progress' ? 'medium' : 'low';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const formattedDue = `${dueDate} at ${dueTime}`;

    const updatedTask: ImplementationTask = {
      ...task,
      title: title.trim(),
      priority,
      status,
      goal: goal.trim(),
      due: formattedDue,
      estimatedMinutes: Number(estimatedMinutes) || 60,
      progress: status === 'completed' ? 100 : task.progress,
    };

    onUpdateTask(updatedTask);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn font-sans">
      {/* Modal Card without border and hidden scrollbars */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header without icon on top left */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-violet-950 text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold tracking-tight">Edit Task Details</h2>
            <p className="text-[11px] text-slate-300">
              Created by {task.createdByName || task.createdBy || currentUser.name} · Full permissions active
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form with hidden scrollbar */}
        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden flex-1 text-xs"
        >
          {/* Task Title */}
          <div className="space-y-1">
            <label className="block text-slate-700 font-bold">
              Task Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:bg-white text-xs"
            />
          </div>

          {/* Status Selection (Active: purple, In Progress: blue, Completed: emerald) */}
          <div className="space-y-1.5">
            <label className="block text-slate-700 font-bold">Status</label>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_CONFIG.map((opt) => {
                const isSelected = status === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStatus(opt.id)}
                    className={`py-2 px-3 rounded-xl border text-center transition-all flex items-center justify-center gap-1.5 text-xs font-semibold ${
                      isSelected ? opt.activeClass : opt.inactiveClass
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : opt.dotClass}`}
                    />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date, Time & Estimated Minutes */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-bold">Due Date</label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:border-violet-500 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-bold">Due Time</label>
              <input
                type="time"
                required
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:border-violet-500 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-bold">Est. Mins</label>
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:border-violet-500 text-xs"
              />
            </div>
          </div>

          {/* Goal & Objective */}
          <div className="space-y-1">
            <label className="block text-slate-700 font-bold">Goal / Objective</label>
            <textarea
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:border-violet-500 text-xs resize-none"
            />
          </div>

          {/* Bottom Action Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold shadow-md shadow-violet-200 active:scale-95 transition-all"
            >
              <Save size={14} />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
