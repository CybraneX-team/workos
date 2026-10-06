import { randomUUID } from 'node:crypto';
import { TASK_ARCHETYPE_BY_KEY, type TaskArchetypeKey } from './archetypes.js';
import type { OutputStep } from './normalize.js';
import type { PlaybookRequest } from './schemas.js';

const id = (p: string) => `${p}-${randomUUID().slice(0, 8)}`;

/**
 * Deterministic playbook used only when the model fails twice. It is built from the archetype's own
 * guidance, so it is still on-topic, just less tailored. The UI marks these as fallback so the person
 * can regenerate later.
 */
export function fallbackPlaybook(req: PlaybookRequest, keys: TaskArchetypeKey[]): OutputStep[] {
  const a = TASK_ARCHETYPE_BY_KEY[keys[0]];
  const g = a.guidance;
  const list = (lines: string[]) => lines.map((label) => ({ id: id('c'), label, checked: false as const }));
  const half = Math.max(1, Math.ceil(g.length / 2));
  return [
    {
      id: id('step'), stepOrder: 1, type: 'checklist', isCompleted: false,
      title: 'Prepare and confirm the goal',
      instructions: `Make sure you know exactly what "done" means for: ${req.title}.`,
      checklistItems: list([`Write down the outcome for "${req.title}" in one sentence`, ...g.slice(0, 1), 'Gather what you need before starting']),
    },
    {
      id: id('step'), stepOrder: 2, type: 'checklist', isCompleted: false,
      title: `Do the ${a.label.toLowerCase()} work`,
      instructions: 'Work through these in order and tick each off as you go.',
      checklistItems: list(g.slice(1, half + 1)),
    },
    {
      id: id('step'), stepOrder: 3, type: 'checklist', isCompleted: false,
      title: 'Check quality before closing',
      instructions: 'Verify the result against the goal before you mark this complete.',
      checklistItems: list([...g.slice(half + 1), 'Confirm the result matches the outcome you wrote down'].slice(0, 5)),
    },
    {
      id: id('step'), stepOrder: 4, type: 'input_form', isCompleted: false,
      title: 'Log the outcome',
      instructions: 'Record what happened so the task can be closed with evidence.',
      formFields: [
        { id: id('f'), label: 'Outcome', type: 'select', value: '', options: ['Completed', 'Partially completed', 'Blocked'] },
        { id: id('f'), label: 'Notes and next steps', type: 'text', value: '' },
      ],
    },
  ];
}
