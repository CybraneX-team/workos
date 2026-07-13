export interface WorkspaceCanvasCard {
  id: string;
  title: string;
  subtitle?: string;
  accent: string;
  /** all geometry is a % of the canvas stage */
  x: number;
  y: number;
  w: number;
  h: number;
  variant: 'hero' | 'chart-bars' | 'list-radar' | 'avatars' | 'gauge' | 'line';
  icon?: 'trend' | 'target' | 'shield' | 'price';
  tags?: string[];
  items?: string[];
  checks?: string[];
  metric?: string;
  extra?: string;
}

export interface WorkspaceLiveSignal {
  id: string;
  title: string;
  time: string;
  tag: string;
  tagColor: string;
  trend: 'up' | 'down';
}

export interface WorkspaceFocusTask {
  id: string;
  label: string;
  done: boolean;
}

export const WORKSPACE_CANVAS_CARDS: WorkspaceCanvasCard[] = [
  {
    id: 'company_hub',
    title: 'WorkOS',
    subtitle: 'Executive Hub',
    accent: '#6366f1',
    x: 35,
    y: 0,
    w: 30,
    h: 48,
    variant: 'hero',
    tags: ['Active Plan', 'SaaS Platform', 'Series A'],
    metric: 'Active',
  },
  {
    id: 'metrics',
    title: 'Financial Metrics',
    subtitle: 'Q2 Operating Plan',
    accent: '#10b981',
    x: 0.5,
    y: 4,
    w: 27,
    h: 42,
    variant: 'chart-bars',
    icon: 'trend',
  },
  {
    id: 'departments',
    title: 'Departments & FTE',
    accent: '#fbbf24',
    x: 72.5,
    y: 4,
    w: 27,
    h: 42,
    variant: 'list-radar',
    icon: 'target',
    items: ['Product & Eng (14)', 'Sales & GTM (8)', 'Ops & Finance (3)', 'HR & Recruiting (2)'],
    extra: '27 Total FTE',
  },
  {
    id: 'goals',
    title: 'OKRs & Key Goals',
    accent: '#f43f5e',
    x: 0.5,
    y: 56,
    w: 27,
    h: 40,
    variant: 'avatars',
    items: ['Launch Canvas v2', 'Hire VP of Eng', 'Close Seed Round'],
    metric: 'Q2 Focus',
  },
  {
    id: 'risks',
    title: 'Risks & Blockers',
    accent: '#ef4444',
    x: 35,
    y: 54,
    w: 30,
    h: 42,
    variant: 'gauge',
    icon: 'shield',
    checks: ['recruiting-delay: VP Eng', 'competitor-pricing: Meta', 'compliance-deadline: SOC2'],
    metric: '88%',
  },
  {
    id: 'gtm',
    title: 'GTM & Channels',
    accent: '#a78bfa',
    x: 72.5,
    y: 56,
    w: 27,
    h: 40,
    variant: 'line',
    icon: 'price',
    checks: ['Direct Enterprise GTM', 'Inbound SEO/Content', 'Developer Relations'],
  },
];

export const WORKSPACE_CANVAS_CONNECTIONS: [string, string][] = [
  ['metrics', 'company_hub'],
  ['departments', 'company_hub'],
  ['goals', 'company_hub'],
  ['risks', 'company_hub'],
  ['gtm', 'company_hub'],
];

export const WORKSPACE_LIVE_SIGNALS: WorkspaceLiveSignal[] = [
  {
    id: 's1',
    title: 'OpenAI launches GPT-4o with real-time voice',
    time: '2m ago',
    tag: 'AI',
    tagColor: '#818cf8',
    trend: 'up',
  },
  {
    id: 's2',
    title: 'Anthropic raises Series E at $18B valuation',
    time: '18m ago',
    tag: 'Funding',
    tagColor: '#22d3ee',
    trend: 'up',
  },
  {
    id: 's3',
    title: 'EU AI Act compliance deadline Q3 2026',
    time: '1h ago',
    tag: 'Regulatory',
    tagColor: '#fbbf24',
    trend: 'down',
  },
  {
    id: 's4',
    title: 'Enterprise AI spend up 34% YoY in NA',
    time: '3h ago',
    tag: 'Market',
    tagColor: '#34d399',
    trend: 'up',
  },
];

export const WORKSPACE_FOCUS_VISIBLE_COUNT = 3;

export const WORKSPACE_FOCUS_TASKS: WorkspaceFocusTask[] = [
  { id: 't1', label: 'Review candidate resumes for VP Eng', done: true },
  { id: 't2', label: 'Finalize investor deck for Series A', done: true },
  { id: 't3', label: 'Approve Q2 budget proposal', done: false },
  { id: 't4', label: 'Prepare weekly team sync agenda', done: false },
  { id: 't5', label: 'Review SOC2 compliance checklist', done: false },
  { id: 't6', label: 'Approve product roadmap updates', done: false },
];

export const WORKSPACE_TOOLBAR_ITEMS = [
  'Note',
  'Task',
  'File',
  'Link',
  'Table',
  'Chart',
  'Code',
  'AI Assistant',
] as const;
