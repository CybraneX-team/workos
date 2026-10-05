import React from 'react';
import {
  CheckCircle2,
  Circle,
  Plus,
  ListChecks,
  MessageSquare,
  FormInput,
  Zap,
  ChevronRight,
} from 'lucide-react';
import type { TaskStep, StepType } from '../types';

interface StepTimelineProps {
  steps: TaskStep[];
  activeStepId: string;
  onSelectStep: (stepId: string) => void;
  onOpenAddStepModal: () => void;
}

export const StepTimeline: React.FC<StepTimelineProps> = ({
  steps,
  activeStepId,
  onSelectStep,
  onOpenAddStepModal,
}) => {
  const getStepIcon = (type: StepType, isCompleted: boolean) => {
    if (isCompleted) {
      return <CheckCircle2 size={16} className="text-emerald-600 fill-emerald-100" />;
    }
    switch (type) {
      case 'checklist':
        return <ListChecks size={15} className="text-emerald-600" />;
      case 'script_viewer':
        return <MessageSquare size={15} className="text-violet-600" />;
      case 'input_form':
        return <FormInput size={15} className="text-blue-600" />;
      case 'connector_action':
        return <Zap size={15} className="text-amber-600" />;
      default:
        return <Circle size={15} className="text-slate-400" />;
    }
  };

  const completedCount = steps.filter((s) => s.isCompleted).length;
  const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <aside className="w-full lg:w-80 shrink-0 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col h-full shadow-sm">
      {/* Header */}
      <div className="pb-4 mb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Implementation Flow
          </span>
          <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            {progressPercent}% Complete
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Steps List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {steps.map((step, index) => {
          const isActive = step.id === activeStepId;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectStep(step.id)}
              className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 relative ${
                isActive
                  ? 'bg-violet-50/80 border-violet-400 shadow-sm text-slate-900'
                  : step.isCompleted
                  ? 'bg-emerald-50/40 border-emerald-200/80 hover:border-emerald-300 text-slate-800'
                  : 'bg-slate-50/60 border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              {/* Vertical connecting line indicator */}
              {index < steps.length - 1 && (
                <div
                  className={`absolute left-[21px] top-9 bottom-[-10px] w-0.5 ${
                    step.isCompleted ? 'bg-emerald-200' : 'bg-slate-200'
                  }`}
                />
              )}

              {/* Step number badge / icon */}
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border z-10 ${
                  isActive
                    ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                    : step.isCompleted
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {getStepIcon(step.type, step.isCompleted)}
              </div>

              {/* Text info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`text-xs font-semibold truncate ${
                      isActive
                        ? 'text-violet-950 font-bold'
                        : step.isCompleted
                        ? 'text-slate-800'
                        : 'text-slate-700'
                    }`}
                  >
                    {step.title}
                  </span>
                  {isActive && <ChevronRight size={14} className="text-violet-600 shrink-0" />}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">
                    Step {step.stepOrder} · {step.type.replace('_', ' ')}
                  </span>
                  {step.completedAt && (
                    <span className="text-[10px] text-emerald-600 font-mono font-medium">
                      ✓ {step.completedAt}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Add Custom Step CTA */}
      <div className="pt-3 mt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={onOpenAddStepModal}
          className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 hover:border-violet-400 bg-slate-50 hover:bg-violet-50 text-xs font-semibold text-slate-700 hover:text-violet-700 transition-all flex items-center justify-center gap-2 group"
        >
          <Plus size={14} className="group-hover:scale-110 transition-transform text-violet-600" />
          <span>Add Custom Sub-Step</span>
        </button>
      </div>
    </aside>
  );
};
