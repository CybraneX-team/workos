import { api } from '../api';
import type { TaskPriority, TaskStep } from '../../pages/NewPMS/object-space/types';

// Client for POST /api/pms/object-space/playbook. The backend is stateless: it classifies the task,
// generates typed steps, and returns them. The caller stores the steps on its own task.

export interface PlaybookRequest {
  taskKey: string;
  title: string;
  goal?: string;
  labels?: string[];
  objectType?: string;
  isTeamTask?: boolean;
  collaborators?: Array<{ name: string; jobTitle?: string }>;
  assignee: { name: string; jobTitle: string; role?: string };
  department: { key?: string; name: string; category?: string };
  dueLabel?: string;
  priority?: TaskPriority;
  estimatedMinutes?: number;
}

export interface PlaybookResponse {
  archetypes: Array<{ key: string; weight: number }>;
  confidence: number;
  steps: TaskStep[];
  meta: {
    model: string;
    promptVersion: string;
    archetypeVersion: string;
    fallback: boolean;
    fallbackReason?: string;
    broadClassification: boolean;
    latencyMs: number;
  };
}

/** Why a playbook could not be generated. `unavailable` and `signed_out` mean "use the local template quietly". */
export type PlaybookErrorKind = 'signed_out' | 'unavailable' | 'rate_limited' | 'invalid' | 'failed';

export class PlaybookError extends Error {
  kind: PlaybookErrorKind;
  retryAfterSeconds?: number;
  constructor(kind: PlaybookErrorKind, message: string, retryAfterSeconds?: number) {
    super(message);
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// lib/api throws `${status}: ${body}`; turn that back into something the UI can branch on.
function classify(error: unknown): PlaybookError {
  const message = error instanceof Error ? error.message : String(error);
  const status = Number(/^(\d{3}):/.exec(message)?.[1] ?? 0);
  if (status === 401 || status === 403) return new PlaybookError('signed_out', message);
  if (status === 429) {
    const retry = Number(/"retryAfterSeconds"\s*:\s*(\d+)/.exec(message)?.[1] ?? 0) || undefined;
    return new PlaybookError('rate_limited', message, retry);
  }
  if (status === 503) return new PlaybookError('unavailable', message);
  if (status === 400) return new PlaybookError('invalid', message);
  // No status = network failure, timeout, or the backend is down: same treatment as unavailable.
  if (!status) return new PlaybookError('unavailable', message);
  return new PlaybookError('failed', message);
}

export const objectSpacePlaybookApi = {
  async generate(request: PlaybookRequest): Promise<PlaybookResponse> {
    try {
      return await api.post<PlaybookResponse>('/api/pms/object-space/playbook', request);
    } catch (error) {
      throw classify(error);
    }
  },
};
