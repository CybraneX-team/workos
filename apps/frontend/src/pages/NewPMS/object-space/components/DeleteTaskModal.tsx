import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn font-sans">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between text-rose-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-100 text-rose-600">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold">Delete Task & 3D Orbit Node</h2>
              <span className="text-[10px] text-rose-600">Irreversible Action</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3 text-xs text-slate-600">
          <p>
            Are you sure you want to permanently delete:
          </p>
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 font-semibold text-slate-900">
            {task.title}
          </div>
          <p className="text-[11px] text-slate-500">
            This will permanently remove the task record, all associated SOP checklist progress, and its 3D satellite node from the constellation universe.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors"
          >
            Keep Task
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-200 active:scale-95 transition-all"
          >
            <Trash2 size={13} />
            <span>Confirm Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
