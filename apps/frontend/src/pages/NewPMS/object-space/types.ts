export type DepartmentCategory =
  | 'Revenue & Commercial Operations'
  | 'Marketing, Growth & Brand'
  | 'Product, Design & Engineering'
  | 'Operations, Supply Chain & Legal'
  | 'People, Talent & HR'
  | 'Finance, Accounting & RevOps';

export type DepartmentKey =
  | 'outbound_sales'
  | 'inbound_sales'
  | 'customer_success'
  | 'paid_marketing'
  | 'content_seo'
  | 'engineering'
  | 'qa_release'
  | 'uiux_design'
  | 'inventory_logistics'
  | 'legal_compliance'
  | 'recruiting'
  | 'people_ops'
  | 'accounts_receivable'
  | 'accounts_payable';

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

export interface ImplementationTask {
  id: string;
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

export interface DepartmentInfo {
  key: DepartmentKey;
  name: string;
  category: DepartmentCategory;
  icon: string;
  color: string;
  description: string;
}

export function canEditTask(task: ImplementationTask, currentUserEmail: string = 'manager@example.com'): boolean {
  if (!task.createdBy) return true;
  return task.createdBy.trim().toLowerCase() === currentUserEmail.trim().toLowerCase();
}

export function canDeleteTask(task: ImplementationTask, currentUserEmail: string = 'manager@example.com'): boolean {
  if (!task.createdBy) return true;
  return task.createdBy.trim().toLowerCase() === currentUserEmail.trim().toLowerCase();
}

