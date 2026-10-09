import React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import type { ImplementationTask } from '../types';

interface DeleteTaskModalProps {
  isOpen: boolean;
  task: ImplementationTask | null;
  onConfirm: () => void;
  onClose: () => void;
}

export const DeleteTaskModal: React.FC<DeleteTaskModalProps> = ({
  isOpen,
  task,
  onConfirm,
  onClose,
}) => {
  React.useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isOpen]);

  if (!isOpen || !task) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn font-sans">
      <div className="relative w-full max-w-md bg-[#0c101d] rounded-3xl shadow-2xl shadow-black/80 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-rose-950/30 flex items-center justify-between text-rose-200">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-900/40 text-rose-400">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-rose-200">Delete Task & 3D Orbit Node</h2>
              <span className="text-[10px] text-rose-400">Irreversible Action</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3 text-xs text-slate-300">
          <p>
            Are you sure you want to permanently delete:
          </p>
          <div className="p-3 rounded-2xl bg-slate-900 font-semibold text-slate-100">
            {task.title}
          </div>
          <p className="text-[11px] text-slate-400">
            This will permanently remove the task record, all associated SOP checklist progress, and its 3D satellite node from the constellation universe.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-3.5 bg-slate-900/40 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700/60 text-slate-300 font-semibold text-xs hover:bg-slate-750 hover:text-white transition-colors"
          >
            Keep Task
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-950/60 active:scale-95 transition-all"
          >
            <Trash2 size={13} />
            <span>Confirm Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
