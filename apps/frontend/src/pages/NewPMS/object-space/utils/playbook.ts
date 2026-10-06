import type { PlaybookRequest, PlaybookResponse } from '../../../../lib/db/objectSpacePlaybook';
import type { ImplementationTask, TaskStep } from '../types';

export function buildPlaybookRequest(task: ImplementationTask): PlaybookRequest {
  return {
    taskKey: task.id,
    title: task.title,
    goal: task.goal,
    objectType: task.objectType,
    // The task model has a single assignee, so every Object Space task is a personal task for now.
    isTeamTask: false,
    assignee: { name: task.assignee.name, jobTitle: task.assignee.role || 'Team member' },
    department: { key: task.departmentKey, name: task.departmentName, category: task.category },
    dueLabel: task.due,
    priority: task.priority,
    estimatedMinutes: task.estimatedMinutes,
  };
}

/** Generic steps used when AI generation is unavailable, so a task is never left without a way to work. */
export function localTemplateSteps(task: ImplementationTask): TaskStep[] {
  const stamp = Date.now();
  const done = task.status === 'completed';
  return [
    {
      id: `step-${stamp}-1`,
      stepOrder: 1,
      title: 'Prepare and confirm the goal',
      type: 'checklist',
      isCompleted: done,
      instructions: `Make sure you know exactly what "done" means for: ${task.title}.`,
      checklistItems: [
        { id: `c-${stamp}-1`, label: 'Verify prerequisites and target details', checked: done },
        { id: `c-${stamp}-2`, label: 'Execute the main procedure', checked: done },
        { id: `c-${stamp}-3`, label: 'Document outcomes and next steps', checked: done },
      ],
    },
  ];
}

function progressOf(steps: TaskStep[]): number {
  if (!steps.length) return 0;
  return Math.round((steps.filter((s) => s.isCompleted).length / steps.length) * 100);
}

/** Merge a generated playbook into the latest copy of the task. */
export function applyPlaybook(task: ImplementationTask, res: PlaybookResponse): ImplementationTask {
  // A task that was already marked completed gets completed steps, so progress stays consistent.
  const steps = task.status === 'completed' ? res.steps.map((s) => ({ ...s, isCompleted: true })) : res.steps;
  return {
    ...task,
    steps,
    progress: task.status === 'completed' ? 100 : progressOf(steps),
    archetypes: res.archetypes,
    playbook: {
      status: res.meta.fallback ? 'fallback' : 'ready',
      generatedAt: new Date().toISOString(),
      model: res.meta.model,
      promptVersion: res.meta.promptVersion,
      confidence: res.confidence,
      ...(res.meta.fallbackReason ? { reason: res.meta.fallbackReason } : {}),
    },
  };
}

export function applyLocalTemplate(task: ImplementationTask, reason: string): ImplementationTask {
  const steps = localTemplateSteps(task);
  return {
    ...task,
    steps,
    progress: task.status === 'completed' ? 100 : progressOf(steps),
    archetypes: undefined,
    playbook: { status: 'local', generatedAt: new Date().toISOString(), reason },
  };
}

const ARCHETYPE_LABELS: Record<string, string> = {
  delivery: 'Delivery', implementation: 'Implementation', migration: 'Migration', maintenance: 'Maintenance',
  outreach: 'Outreach', follow_up: 'Follow-Up', negotiation: 'Negotiation', relationship_nurture: 'Relationship Nurture',
  escalation: 'Escalation', resolution: 'Resolution', debugging: 'Debugging', crisis_response: 'Crisis Response',
  research: 'Research', analysis: 'Analysis', planning: 'Planning', documentation: 'Documentation',
  review: 'Review', audit: 'Audit', decision: 'Decision', coordination: 'Coordination',
  onboarding: 'Onboarding', delegation: 'Delegation', hiring: 'Hiring', training: 'Training',
};

export function archetypeLabel(key: string): string {
  return ARCHETYPE_LABELS[key] ?? key.replace(/_/g, ' ');
}
