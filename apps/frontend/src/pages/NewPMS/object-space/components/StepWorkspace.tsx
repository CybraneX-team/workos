import React from 'react';
import { CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';
import type { TaskStep, ChecklistItem, FormField } from '../types';
import { ScriptTeleprompter } from '../widgets/ScriptTeleprompter';
import { ChecklistWidget } from '../widgets/ChecklistWidget';
import { InputFormWidget } from '../widgets/InputFormWidget';
import { ConnectorActionWidget } from '../widgets/ConnectorActionWidget';

interface StepWorkspaceProps {
  step: TaskStep;
  isFirstStep: boolean;
  isLastStep: boolean;
  onUpdateStep: (updatedStep: TaskStep) => void;
  onPrevStep: () => void;
  onNextStep: () => void;
}

export const StepWorkspace: React.FC<StepWorkspaceProps> = ({
  step,
  isFirstStep,
  isLastStep,
  onUpdateStep,
  onPrevStep,
  onNextStep,
}) => {
  const handleChecklistChange = (checklistItems: ChecklistItem[]) => {
    onUpdateStep({
      ...step,
      checklistItems,
    });
  };

  const handleFormFieldsChange = (formFields: FormField[]) => {
    onUpdateStep({
      ...step,
      formFields,
    });
  };

  const handleToggleComplete = () => {
    const isNowCompleted = !step.isCompleted;
    onUpdateStep({
      ...step,
      isCompleted: isNowCompleted,
      completedAt: isNowCompleted ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
    });
  };

  const renderWidget = () => {
    switch (step.type) {
      case 'script_viewer':
        return (
          <ScriptTeleprompter
            scriptContent={step.scriptContent}
            objectionCheats={step.objectionCheats}
          />
        );
      case 'checklist':
        return (
          <ChecklistWidget
            items={step.checklistItems}
            onChange={handleChecklistChange}
            instructions={step.instructions}
          />
        );
      case 'input_form':
        return (
          <InputFormWidget
            fields={step.formFields}
            onChange={handleFormFieldsChange}
            instructions={step.instructions}
          />
        );
      case 'connector_action':
        return (
          <ConnectorActionWidget
            connector={step.connector}
            instructions={step.instructions}
          />
        );
      default:
        return (
          <div className="p-8 text-center text-slate-500 text-sm">
            Unknown step type.
          </div>
        );
    }
  };

  return (
    <section className="flex-1 bg-[#0c101d]/90 rounded-2xl p-6 flex flex-col h-full shadow-2xl backdrop-blur-xl text-slate-100 overflow-y-auto">
      {/* Workspace Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-violet-950/80 text-violet-300">
              Step {step.stepOrder}
            </span>
            <span className="text-xs text-slate-400 uppercase font-mono tracking-wider">
              {step.type.replace('_', ' ')}
            </span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1">{step.title}</h2>
        </div>

        {/* Mark Step Completed Toggle */}
        <button
          type="button"
          onClick={handleToggleComplete}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95 ${
            step.isCompleted
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/80 shadow-sm'
              : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-700'
          }`}
        >
          <CheckCircle2 size={15} className={step.isCompleted ? 'text-emerald-400' : 'text-slate-400'} />
          <span>{step.isCompleted ? 'Completed ✓' : 'Mark Step Complete'}</span>
        </button>
      </div>

      {/* Main Dynamic Step Widget Content */}
      <div className="flex-1 space-y-4">
        {renderWidget()}
      </div>

      {/* Step Navigation Controls */}
      <div className="flex items-center justify-between pt-4 mt-6">
        <button
          type="button"
          onClick={onPrevStep}
          disabled={isFirstStep}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
            isFirstStep
              ? 'opacity-30 cursor-not-allowed border-slate-800 text-slate-600 bg-slate-950'
              : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-800'
          }`}
        >
          <ChevronLeft size={14} />
          <span>Previous Step</span>
        </button>

        <button
          type="button"
          onClick={onNextStep}
          disabled={isLastStep}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
            isLastStep
              ? 'opacity-30 cursor-not-allowed border-slate-800 text-slate-600 bg-slate-950'
              : 'bg-violet-600 hover:bg-violet-500 text-white border-violet-500 shadow-lg shadow-violet-900/30'
          }`}
        >
          <span>Next Step</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </section>
  );
};
