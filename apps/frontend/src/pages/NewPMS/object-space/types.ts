// Departments come from the company's real departments table (see GET /api/pms/object-space/context).
// Seed/demo tasks carry their own free-text department names, so these are plain strings.
export type DepartmentCategory = string;
export type DepartmentKey = string;

export type StepType = 'checklist' | 'script_viewer' | 'input_form' | 'connector_action';

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  notes?: string;
}

export interface FormField {
  id: string;
  label: string;
  type: 'number' | 'text' | 'select' | 'counter';
  value: string | number;
  options?: string[];
  unit?: string;
  target?: number;
}

export type ConnectorType =
  | 'gmail_sender'
  | 'whatsapp_chat'
  | 'google_calendar'
  | 'google_meet'
  | 'custom_link'
  | 'crm_dialer'
  | 'github_pr'
  | 'figma'
  | 'meta_ads'
  | 'native_sales'
  | 'docusign'
  | 'web_cms'
  | 'analytics';

export interface ConnectorPayload {
  recipient?: string;
  phoneNumber?: string;
  subject?: string;
  body?: string;
  eventTitle?: string;
  eventDate?: string;
  eventTime?: string;
  customUrl?: string;
  [key: string]: unknown;
}

export interface ConnectorConfig {
  type: ConnectorType;
  label: string;
  actionUrl?: string;
  description?: string;
  payload?: ConnectorPayload;
}

export interface ObjectionCheat {
  id: string;
  title: string;
  trigger: string;
  rebuttal: string;
}

export interface TaskStep {
  id: string;
  stepOrder: number;
  title: string;
  type: StepType;
  isCompleted: boolean;
  completedAt?: string;
  instructions?: string;
  // Specific payload by type
  checklistItems?: ChecklistItem[];
  scriptContent?: string;
  objectionCheats?: ObjectionCheat[];
  formFields?: FormField[];
  connector?: ConnectorConfig;
}

export type TaskStatus = 'active' | 'in_progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface AssigneeInfo {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
}

/**
 * Where a task's steps came from. Steps live on the task (localStorage), so this is what stops us
 * regenerating (and losing progress) every time a task is opened.
 *  - pending:    no steps yet; generate on first open
 *  - generating: a request is in flight
 *  - ready:      steps came from the AI playbook
 *  - fallback:   server answered but had to use its archetype template (model output unusable)
 *  - local:      AI unavailable here (signed out, quota, offline); generic template used
 */
export type PlaybookStatus = 'pending' | 'generating' | 'ready' | 'fallback' | 'local';

export interface PlaybookMeta {
  status: PlaybookStatus;
  generatedAt?: string;
  model?: string;
  promptVersion?: string;
  confidence?: number;
  /** Short machine reason when status is local, e.g. ai_unavailable, signed_out, rate_limited. */
  reason?: string;
}

export interface TaskArchetypeTag {
  key: string;
  weight: number;
}

export interface ImplementationTask {
  id: string;
  /** AI playbook bookkeeping. Absent on tasks created before AI playbooks (they already have steps). */
  playbook?: PlaybookMeta;
  archetypes?: TaskArchetypeTag[];
  title: string;
  departmentKey: DepartmentKey;
  departmentName: string;
  category: DepartmentCategory;
  goal: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignee: AssigneeInfo;
  createdBy?: string;
  createdByName?: string;
  objectType?: string;
  due: string;
  estimatedMinutes: number;
  progress: number; // 0 to 100
  steps: TaskStep[];
  notes?: string;
  submittedAt?: string;
  submissionSummary?: {
    metricsLogged: Record<string, number | string>;
    notes: string;
  };
}

export function canEditTask(task: ImplementationTask, currentUserEmail: string = 'manager@example.com'): boolean {
  if (!task.createdBy) return true;
  return task.createdBy.trim().toLowerCase() === currentUserEmail.trim().toLowerCase();
}

export function canDeleteTask(task: ImplementationTask, currentUserEmail: string = 'manager@example.com'): boolean {
  if (!task.createdBy) return true;
  return task.createdBy.trim().toLowerCase() === currentUserEmail.trim().toLowerCase();
}

