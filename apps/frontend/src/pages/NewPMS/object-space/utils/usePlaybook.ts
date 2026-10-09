import { useCallback, useEffect, useRef, useState } from 'react';
import { objectSpacePlaybookApi, PlaybookError } from '../../../../lib/db/objectSpacePlaybook';
import type { ImplementationTask } from '../types';
import { applyLocalTemplate, applyPlaybook, buildPlaybookRequest } from './playbook';

// One generation per task at a time, across remounts (React strict mode, reopening the workspace studio).
// The backend also dedupes, but this avoids even sending the second request.
const inflight = new Map<string, Promise<void>>();

type Toast = (message: string, tone?: 'good' | 'bad') => void;

/**
 * Generates a task's playbook the first time it is opened with no steps, and merges the result into the
 * task through `onUpdateTask` (which persists it). Steps are never regenerated automatically afterwards,
 * so progress is never lost. If AI is unavailable the person gets a generic template instead of nothing.
 */
export function usePlaybook(task: ImplementationTask, onUpdateTask: (t: ImplementationTask) => void, onToast: Toast) {
  const taskRef = useRef(task);
  taskRef.current = task;
  // Callers pass fresh closures every render; keep `generate` stable so the effect below runs once per task.
  const updateRef = useRef(onUpdateTask);
  updateRef.current = onUpdateTask;
  const toastRef = useRef(onToast);
  toastRef.current = onToast;
  const [busy, setBusy] = useState(false);

  const generate = useCallback(
    async (mode: 'auto' | 'regenerate') => {
      const id = taskRef.current.id;
      const existing = inflight.get(id);
      if (existing) {
        setBusy(true);
        await existing.finally(() => setBusy(false));
        return;
      }
      setBusy(true);
      const job = (async () => {
        try {
          const res = await objectSpacePlaybookApi.generate(buildPlaybookRequest(taskRef.current));
          const latest = taskRef.current;
          // Auto mode only fills an empty task; never overwrite steps that appeared in the meantime.
          if (mode === 'auto' && latest.steps.length > 0) return;
          updateRef.current(applyPlaybook(latest, res));
          if (res.meta.fallback) toastRef.current('AI returned an unusable playbook, so a standard one was used. You can regenerate.', 'bad');
        } catch (error) {
          const kind = error instanceof PlaybookError ? error.kind : 'unavailable';
          if (mode === 'regenerate') {
            // Keep the person's current steps; just say why nothing changed.
            toastRef.current(
              kind === 'rate_limited' ? 'AI playbook limit reached. Try again later.' : 'AI playbooks are unavailable right now. Your steps were kept.',
              'bad',
            );
            return;
          }
          if (taskRef.current.steps.length === 0) updateRef.current(applyLocalTemplate(taskRef.current, kind));
          // Signed-out is the expected state on the public prototype routes; don't nag.
          if (kind === 'rate_limited') toastRef.current('AI playbook limit reached. A standard playbook was used.', 'bad');
        }
      })().finally(() => inflight.delete(id));
      inflight.set(id, job);
      await job.finally(() => setBusy(false));
    },
    [],
  );

  // First open with no steps: generate once.
  const needsPlaybook = task.steps.length === 0;
  useEffect(() => {
    if (needsPlaybook) void generate('auto');
  }, [task.id, needsPlaybook, generate]);

  const regenerate = useCallback(() => {
    const current = taskRef.current;
    const hasProgress = current.steps.some(
      (s) => s.isCompleted || s.checklistItems?.some((c) => c.checked) || s.formFields?.some((f) => String(f.value) !== '' && f.value !== 0),
    );
    if (hasProgress && !window.confirm('Regenerating replaces the current steps and clears your progress on them. Continue?')) return;
    void generate('regenerate');
  }, [generate]);

  return { generating: busy || (needsPlaybook && inflight.has(task.id)), regenerate };
}
