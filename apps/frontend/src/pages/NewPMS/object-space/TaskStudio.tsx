import React, { useEffect, useState } from 'react';
import {
  Save,
  MessageSquare,
  Edit2,
  Trash2,
  ShieldCheck,
  Lock,
  Sparkles,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import type { ImplementationTask, TaskStep } from './types';
import { canEditTask, canDeleteTask } from './types';
import { StepTimeline } from './components/StepTimeline';
import { StepWorkspace } from './components/StepWorkspace';
import { AddStepModal } from './components/AddStepModal';
import { TaskReportModal } from './components/TaskReportModal';
import { usePlaybook } from './utils/usePlaybook';
import { archetypeLabel } from './utils/playbook';

export interface TaskStudioProps {
  task: ImplementationTask;
  currentUser?: { name: string; email: string };
  onUpdateTask: (updatedTask: ImplementationTask) => void;
  onBackToHub: () => void;
  onToast: (msg: string, tone?: 'good' | 'bad') => void;
  onEditTask?: (task: ImplementationTask) => void;
  onDeleteTask?: (task: ImplementationTask) => void;
  isReportOpen?: boolean;
  setIsReportOpen?: (open: boolean) => void;
}

export const TaskStudio: React.FC<TaskStudioProps> = ({
  task,
  currentUser = { name: 'Ronak', email: 'manager@example.com' },
  onUpdateTask,
  onToast,
  onEditTask,
  onDeleteTask,
  isReportOpen: controlledReportOpen,
  setIsReportOpen: controlledSetReportOpen,
}) => {
  const [activeStepId, setActiveStepId] = useState<string>(
    task.steps[0]?.id || ''
  );
  const [isAddStepOpen, setIsAddStepOpen] = useState(false);
  const [internalReportOpen, setInternalReportOpen] = useState(false);
  const [isNotesDrawerOpen, setIsNotesDrawerOpen] = useState(false);
  const [assigneeNotes, setAssigneeNotes] = useState(task.notes || '');

  const { generating, regenerate } = usePlaybook(task, onUpdateTask, onToast);

  // Steps can arrive after the workspace opens (AI playbook): select the first one when they do.
  useEffect(() => {
    if (!task.steps.some((st) => st.id === activeStepId)) setActiveStepId(task.steps[0]?.id || '');
  }, [task.steps, activeStepId]);

  const isReportOpen = controlledReportOpen ?? internalReportOpen;
  const setIsReportOpen = controlledSetReportOpen ?? setInternalReportOpen;

  const isOwner = canEditTask(task, currentUser.email);
  const isDeletable = canDeleteTask(task, currentUser.email);

  const activeStepIndex = task.steps.findIndex((s) => s.id === activeStepId);
  const activeStep = task.steps[activeStepIndex] || task.steps[0];

  const handleUpdateStep = (updatedStep: TaskStep) => {
    const updatedSteps = task.steps.map((s) =>
      s.id === updatedStep.id ? updatedStep : s
    );

    const completedCount = updatedSteps.filter((s) => s.isCompleted).length;
    const progress = Math.round((completedCount / updatedSteps.length) * 100);

    onUpdateTask({
      ...task,
      steps: updatedSteps,
      progress,
    });
  };

  const handleAddStep = (newStep: TaskStep) => {
    const updatedSteps = [...task.steps, newStep];
    const completedCount = updatedSteps.filter((s) => s.isCompleted).length;
    const progress = Math.round((completedCount / updatedSteps.length) * 100);

    onUpdateTask({
      ...task,
      steps: updatedSteps,
      progress,
    });
    setActiveStepId(newStep.id);
    onToast(`Added custom step: "${newStep.title}"`, 'good');
  };

  const handleSaveDraft = () => {
    onUpdateTask({
      ...task,
      notes: assigneeNotes,
    });
    onToast('Implementation draft saved', 'good');
  };

  const handleSubmitFinalReport = (summaryNotes: string) => {
    onUpdateTask({
      ...task,
      status: 'completed',
      progress: 100,
      notes: summaryNotes,
      submittedAt: new Date().toISOString(),
    });
    setIsReportOpen(false);
    onToast('Task submitted successfully! Department rollups updated.', 'good');
  };

  const isFirstStep = activeStepIndex === 0;
  const isLastStep = activeStepIndex === task.steps.length - 1;

  const handlePrevStep = () => {
    if (!isFirstStep) {
      setActiveStepId(task.steps[activeStepIndex - 1].id);
    }
  };

  const handleNextStep = () => {
    if (!isLastStep) {
      setActiveStepId(task.steps[activeStepIndex + 1].id);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#05070f] text-slate-100 absolute inset-0 overflow-hidden font-sans z-10 pt-[84px]">
      {task.steps.length > 0 && task.playbook && (
        <div className="mx-5 mt-4 -mb-1 flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
          <Sparkles size={12} className={task.playbook.status === 'ready' ? 'text-violet-400' : 'text-slate-500'} />
          {task.playbook.status === 'ready' && (
            <span>
              AI playbook
              {task.archetypes?.length ? ` · ${task.archetypes.map((a) => archetypeLabel(a.key)).join(' + ')}` : ''}
            </span>
          )}
          {task.playbook.status === 'fallback' && <span>Standard playbook (AI output was unusable)</span>}
          {task.playbook.status === 'local' && <span>Standard playbook (AI unavailable here)</span>}
          {isOwner && (
            <button
              type="button"
              onClick={regenerate}
              disabled={generating}
              className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-slate-800 bg-[#0c101d]/90 hover:bg-slate-800 hover:text-violet-300 disabled:opacity-50 text-slate-300 font-semibold transition-colors"
              title="Replace these steps with a freshly generated playbook"
            >
              {generating ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              <span>{generating ? 'Generating…' : 'Regenerate'}</span>
            </button>
          )}
        </div>
      )}

      {task.steps.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-5 text-center z-10">
          <Loader2 size={26} className="animate-spin text-violet-400" />
          <div className="text-sm font-bold text-slate-100">Building your playbook…</div>
          <p className="max-w-sm text-xs text-slate-400">
            Reading the task, working out what kind of work it is, and writing steps for {task.assignee.name} in {task.departmentName}.
          </p>
        </div>
      ) : (
      /* Main Split View: Left Stepper + Right Workspace (Dark Theme) */
      <div className="flex-1 flex flex-col lg:flex-row gap-5 p-5 overflow-hidden z-10 min-h-0">
        <StepTimeline
          steps={task.steps}
          activeStepId={activeStep?.id || ''}
          onSelectStep={(id) => setActiveStepId(id)}
          onOpenAddStepModal={() => setIsAddStepOpen(true)}
        />

        {activeStep && (
          <StepWorkspace
            step={activeStep}
            isFirstStep={isFirstStep}
            isLastStep={isLastStep}
            onUpdateStep={handleUpdateStep}
            onPrevStep={handlePrevStep}
            onNextStep={handleNextStep}
          />
        )}
      </div>
      )}

      {/* Bottom Sticky Action Tray with Ownership & CRUD actions */}
      <footer className="px-6 py-2.5 bg-[#080c18]/95 flex items-center justify-between z-20 text-xs shrink-0 shadow-2xl backdrop-blur-xl flex-wrap gap-2 text-slate-200">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-800 font-medium transition-colors"
          >
            <Save size={13} />
            <span>Save Draft</span>
          </button>

          <button
            type="button"
            onClick={() => setIsNotesDrawerOpen(!isNotesDrawerOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-800 font-medium transition-colors"
          >
            <MessageSquare size={13} />
            <span>Assignee Working Notes {assigneeNotes ? '●' : ''}</span>
          </button>

          {/* Owner Edit & Delete Actions */}
          {isOwner && onEditTask && (
            <button
              type="button"
              onClick={() => onEditTask(task)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-violet-950/60 hover:text-violet-300 hover:border-violet-700/80 text-slate-200 border border-slate-800 font-medium transition-colors"
              title="Edit Task Details"
            >
              <Edit2 size={13} />
              <span>Edit Details</span>
            </button>
          )}

          {isDeletable && onDeleteTask && (
            <button
              type="button"
              onClick={() => onDeleteTask(task)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800 text-slate-200 border border-slate-800 font-medium transition-colors"
              title="Delete Task"
            >
              <Trash2 size={13} />
              <span>Delete</span>
            </button>
          )}
        </div>

        {/* Ownership & Permission Pill */}
        <div className="flex items-center gap-3">
          {isOwner ? (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-950/60 text-emerald-300 text-[11px] font-semibold">
              <ShieldCheck size={12} className="text-emerald-400" />
              <span>Created by You (Full Permissions)</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900/90 text-slate-400 text-[11px] font-medium">
              <Lock size={12} className="text-slate-500" />
              <span>Assigned by {task.createdByName || task.createdBy || 'Team Lead'} (Read-Only)</span>
            </span>
          )}

          <div className="text-[11px] text-slate-500 font-mono hidden md:block">
            Due: {task.due} · {task.estimatedMinutes} mins
          </div>
        </div>
      </footer>

      {/* Floating Notes Drawer (Dark Mode) */}
      {isNotesDrawerOpen && (
        <div className="absolute bottom-14 left-6 w-96 bg-[#0c101d]/95 rounded-2xl p-4 shadow-2xl z-30 space-y-2 animate-fadeIn backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-100">Assignee Scratchpad Notes</span>
            <button
              type="button"
              onClick={() => setIsNotesDrawerOpen(false)}
              className="text-slate-400 hover:text-slate-200 text-xs"
            >
              ✕
            </button>
          </div>
          <textarea
            rows={4}
            value={assigneeNotes}
            onChange={(e) => setAssigneeNotes(e.target.value)}
            placeholder="Log thoughts, customer context, or handoff notes here..."
            className="w-full bg-slate-950/90 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 resize-none font-mono"
          />
        </div>
      )}

      {/* Modals */}
      {isAddStepOpen && (
        <AddStepModal
          currentStepCount={task.steps.length}
          onAddStep={handleAddStep}
          onClose={() => setIsAddStepOpen(false)}
        />
      )}

      {isReportOpen && (
        <TaskReportModal
          task={task}
          onSubmitReport={handleSubmitFinalReport}
          onClose={() => setIsReportOpen(false)}
        />
      )}
    </div>
  );
};
