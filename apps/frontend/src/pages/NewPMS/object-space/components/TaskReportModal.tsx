import React, { useState } from 'react';
import { Sparkles, Trophy } from 'lucide-react';
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn font-sans">
      <div className="w-full max-w-lg bg-[#0c101d] rounded-3xl p-6 shadow-2xl shadow-black/80 space-y-5">
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-950/50 text-emerald-400">
              <Trophy size={18} />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-100">Finalize & Submit Implementation Task</h3>
              <p className="text-xs text-slate-400">{task.title}</p>
            </div>
          </div>
        </div>

        {/* Execution Summary Stats Card */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-900/60">
            <div className="text-[11px] text-slate-400">Steps Completed</div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {completedSteps} / {totalSteps}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-900/60">
            <div className="text-[11px] text-slate-400">Execution Status</div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              Ready for Review
            </div>
          </div>
        </div>

        {/* Logged Metrics Preview */}
        {loggedMetrics.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-slate-900/60 space-y-2">
            <div className="text-xs font-semibold text-slate-300">Recorded Metric Outputs</div>
            <div className="grid grid-cols-2 gap-2">
              {loggedMetrics.map((m, idx) => (
                <div key={idx} className="p-2 rounded-lg bg-slate-900 text-xs shadow-sm">
                  <span className="text-slate-500 block text-[10px]">{m.label}</span>
                  <span className="font-bold font-mono text-slate-200">{String(m.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Wrap-Up Summary & Notes
            </label>
            <textarea
              rows={3}
              required
              value={summaryNotes}
              onChange={(e) => setSummaryNotes(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 hover:text-white transition-colors"
            >
              Back to Workspace
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/60"
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
