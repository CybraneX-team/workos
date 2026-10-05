import React, { useState } from 'react';
import { X, Sparkles, Trophy } from 'lucide-react';
import type { ImplementationTask } from '../types';

interface TaskReportModalProps {
  task: ImplementationTask;
  onSubmitReport: (summaryNotes: string) => void;
  onClose: () => void;
}

export const TaskReportModal: React.FC<TaskReportModalProps> = ({
  task,
  onSubmitReport,
  onClose,
}) => {
  const [summaryNotes, setSummaryNotes] = useState(
    'All implementation steps executed according to SOP guidelines. Logged outcomes in system.'
  );

  const totalSteps = task.steps.length;
  const completedSteps = task.steps.filter((s) => s.isCompleted).length;

  // Extract all logged form metrics
  const loggedMetrics: Array<{ label: string; value: string | number }> = [];
  task.steps.forEach((step) => {
    if (step.formFields) {
      step.formFields.forEach((field) => {
        loggedMetrics.push({
          label: field.label,
          value: field.value,
        });
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitReport(summaryNotes);
    onClose();
  };

  React.useEffect(() => {
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Trophy size={18} />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">Finalize & Submit Implementation Task</h3>
              <p className="text-xs text-slate-500">{task.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        {/* Execution Summary Stats Card */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] text-slate-500">Steps Completed</div>
            <div className="text-lg font-bold font-mono text-emerald-600 mt-0.5">
              {completedSteps} / {totalSteps}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] text-slate-500">Execution Status</div>
            <div className="text-lg font-bold font-mono text-emerald-600 mt-0.5">
              Ready for Review
            </div>
          </div>
        </div>

        {/* Logged Metrics Preview */}
        {loggedMetrics.length > 0 && (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-xs font-semibold text-slate-800">Recorded Metric Outputs</div>
            <div className="grid grid-cols-2 gap-2">
              {loggedMetrics.map((m, idx) => (
                <div key={idx} className="p-2 rounded-lg bg-white border border-slate-200 text-xs shadow-sm">
                  <span className="text-slate-500 block text-[10px]">{m.label}</span>
                  <span className="font-bold font-mono text-slate-900">{String(m.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Wrap-Up Summary & Notes
            </label>
            <textarea
              rows={3}
              required
              value={summaryNotes}
              onChange={(e) => setSummaryNotes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              Back to Cockpit
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Sparkles size={14} />
              <span>Submit Task & Feed Rollups</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
