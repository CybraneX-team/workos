import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { usePolytopeStore } from '../lib/usePolytopeStore';
import { useTeamMembers } from '../lib/db/team';

export type WorkspaceMode = 'explore' | 'decision' | 'execution' | 'review' | 'agent';
export type WorkspaceRole = 'founder' | 'manager' | 'member';

// ── Entry context: describes where the workspace was opened from ──────────────
export type WorkspaceEntryLevel = 'universe' | 'industry' | 'subdomain' | 'company' | 'node';
export interface WorkspaceEntryContext {
  level: WorkspaceEntryLevel;
  // Full hierarchy preserved at every level so in-workspace drill-down always has data
  allIndustries?: Array<{
    id: string; name: string; color: string; description?: string;
    subdomains: Array<{
      id: string; name: string; description?: string;
      companies: Array<{ id: string; name: string; description?: string; stage?: string; employees?: number; isLive?: boolean }>;
    }>;
  }>;
  // Industry level
  industryId?: string;
  industryName?: string;
  industryColor?: string;
  industryDescription?: string;
  subdomains?: Array<{ id: string; name: string; description?: string; companyCount: number; color?: string }>;
  totalCompanyCount?: number;
  // Subdomain level
  subdomainId?: string;
  subdomainName?: string;
  subdomainDescription?: string;
  companies?: Array<{ id: string; name: string; description?: string; stage?: string; employees?: number; isLive?: boolean }>;
  // Company level
  companyId?: string;
  companyName?: string;
  companyDescription?: string;
  companyStage?: string;
  companyEmployees?: number;
  companyIsLive?: boolean;
  companyRelationship?: 'own' | 'opportunity' | 'competitor' | 'investor' | 'partner';
  companyRole?: string;
  // Node level
  rootId?: string;
  rootLabel?: string;
  rootDescription?: string;
  branchId?: string;
  branchLabel?: string;
  actionId?: string;
  actionLabel?: string;
  nodeHint?: string;
  breadcrumbs?: string[];
}

export interface AuditEntry {
  id: string;
  action: string;
  detail?: string;
  at: string; // ISO timestamp
}

export interface OKRGoal {
  id: string;
  label: string;
  done: boolean;
  category?: 'growth' | 'product' | 'finance' | 'talent' | 'compliance';
  timeline?: string;
  owner?: string;
}

export interface DepartmentFTE {
  id: string;
  name: string;
  fte: number;
  roles: string[];
}

export interface RiskBlocker {
  id: string;
  label: string;
  status: 'Active' | 'Mitigated';
  impact: 'High' | 'Medium' | 'Low';
}

export interface GTMChannel {
  id: string;
  name: string;
  budget: number; // percentage (0-100)
  impact: string;
}

export interface FocusTask {
  id: string;
  label: string;
  done: boolean;
  status?: 'in_progress' | 'done' | 'highlighted';
}

export interface NoteBlock {
  id: string;
  type: 'text' | 'h1' | 'h2' | 'h3' | 'todo' | 'table';
  content: string;
  checked?: boolean;
  tableData?: string[][];
}

export interface Note {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  blocks: NoteBlock[];
}


export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  file?: { name: string; size: string | number; type: string };
}

export interface WorkspaceFile {
  id: string;
  name: string;
  size: string;
  type: 'image' | 'pdf' | 'excel' | 'text' | 'other';
  uploadedAt: Date;
  chatTitle: string;
  content: string;
}

export interface ShortcutItem {
  id: string;
  label: string;
  kind: 'workspace' | 'project' | 'template';
  targetId?: string;
  templateTab?: string;
}

export interface WorkspaceState {
  id: string;
  name: string;
  purpose?: string;
  goals: OKRGoal[];
  departments: DepartmentFTE[];
  risks: RiskBlocker[];
  gtmChannels: GTMChannel[];
  tasks: FocusTask[];
  shortcuts: ShortcutItem[];
  cashBalance: number;
  baseMRR: number;
  mrrGrowthRate: number;
  chatMessages: ChatMessage[];
  isVoiceChat: boolean;
  activeDetailCard: string | null;
  selectedDeptId: string;
  notes: Note[];
  uploadedFiles?: WorkspaceFile[];
  auditLog?: AuditEntry[];
}

interface FounderWorkspaceContextType {
  // OKRs & Goals
  goals: OKRGoal[];
  toggleGoal: (id: string) => void;
  addGoal: (label: string, category?: 'growth' | 'product' | 'finance' | 'talent' | 'compliance', timeline?: string, owner?: string) => void;
  deleteGoal: (id: string) => void;
  goalProgress: number;

  // Financial Metrics
  cashBalance: number;
  baseMRR: number;
  mrrGrowthRate: number; // 0 to 50 %
  setMrrGrowthRate: (rate: number) => void;
  operatingBurn: number;
  projectedRunway: number; // in months
  monthlyRev: number;

  // Departments & FTE
  departments: DepartmentFTE[];
  hireHeadcount: (deptId: string, role: string) => void;
  totalFTE: number;

  // Risks & Blockers
  risks: RiskBlocker[];
  mitigateRisk: (id: string) => void;
  addRisk: (label: string, impact: 'High' | 'Medium' | 'Low') => void;
  confidenceScore: number;

  // GTM & Channels
  gtmChannels: GTMChannel[];
  updateGTMChannelBudget: (id: string, budget: number) => void;

  // Focus Today Tasks
  tasks: FocusTask[];
  toggleTask: (id: string) => void;
  addTask: (label: string, status?: 'in_progress' | 'done' | 'highlighted') => void;
  updateTaskStatus: (id: string, status: 'in_progress' | 'done' | 'highlighted') => void;
  dismissTask: (id: string) => void;
  
  resetWorkspace: () => void;

  // Multi-workspace support
  workspaces: WorkspaceState[];
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
  createWorkspace: (name: string, purpose?: string) => void;
  deleteWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;

  // Shortcuts (per-workspace, user-managed)
  shortcuts: ShortcutItem[];
  addShortcut: (item: Omit<ShortcutItem, 'id'>) => void;
  removeShortcut: (id: string) => void;

  // Notes API
  notes: Note[];
  addNote: (title: string, blocks?: NoteBlock[]) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;


  // Chat & UI states per workspace
  chatMessages: ChatMessage[];
  setChatMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  isVoiceChat: boolean;
  setIsVoiceChat: (val: boolean) => void;
  activeDetailCard: string | null;
  setActiveDetailCard: (cardId: string | null) => void;
  selectedDeptId: string;
  setSelectedDeptId: (deptId: string) => void;

  // Sidebar coordination
  activeSidebarTab: string;
  setActiveSidebarTab: (tab: string) => void;

  // Workspace mode + role lens
  workspaceMode: WorkspaceMode;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  activeRole: WorkspaceRole;
  setActiveRole: (role: WorkspaceRole) => void;

  // Workspace expansion states
  scrollExpansion: number;
  setScrollExpansion: (val: number | ((prev: number) => number)) => void;
  isFullscreen: boolean;
  setIsFullscreen: (val: boolean) => void;

  // Files API
  uploadedFiles: WorkspaceFile[];
  addUploadedFile: (file: Omit<WorkspaceFile, 'id' | 'uploadedAt'>) => void;
  deleteUploadedFile: (id: string) => void;

  // Audit trail
  auditLog: AuditEntry[];

  // Entry context — describes where workspace was opened from
  entryContext: WorkspaceEntryContext | null;
  setEntryContext: (ctx: WorkspaceEntryContext | null) => void;
}

const FounderWorkspaceContext = createContext<FounderWorkspaceContextType | undefined>(undefined);

const DEFAULT_GOALS: OKRGoal[] = [
  { id: 'g1', label: 'Launch Canvas v2', done: false, category: 'product', timeline: 'Q3 2026', owner: 'Product & Eng' },
  { id: 'g2', label: 'Hire VP of Eng', done: false, category: 'talent', timeline: 'Q3 2026', owner: 'HR & Recruiting' },
  { id: 'g3', label: 'Close Seed Round', done: false, category: 'finance', timeline: 'Q3 2026', owner: 'Ops & Finance' },
];

const DEFAULT_DEPARTMENTS: DepartmentFTE[] = [
  { id: 'eng', name: 'Product & Eng', fte: 14, roles: ['Director of Engineering', 'Tech Lead', '6x Fullstack Devs', '3x Frontend Devs', '3x AI Engineers'] },
  { id: 'gtm', name: 'Sales & GTM', fte: 8, roles: ['VP of Sales', '2x Account Executives', '4x SDRs', 'Developer Advocate'] },
  { id: 'ops', name: 'Ops & Finance', fte: 3, roles: ['Chief of Staff', 'Finance Manager', 'Operations Specialist'] },
  { id: 'hr', name: 'HR & Recruiting', fte: 2, roles: ['Senior Recruiter', 'HR Generalist'] },
];

const DEFAULT_RISKS: RiskBlocker[] = [
  { id: 'r1', label: 'Recruiting delay: VP Eng candidate dropoff', status: 'Active', impact: 'High' },
  { id: 'r2', label: 'Competitor pricing: Meta undercutting API costs', status: 'Active', impact: 'Medium' },
  { id: 'r3', label: 'Compliance deadline: SOC2 audit readiness gap', status: 'Active', impact: 'High' },
];

const DEFAULT_GTM: GTMChannel[] = [
  { id: 'direct', name: 'Direct Enterprise GTM', budget: 50, impact: 'High LTV' },
  { id: 'seo', name: 'Inbound SEO/Content', budget: 30, impact: 'Low CAC' },
  { id: 'devrel', name: 'Developer Relations', budget: 20, impact: 'Viral Growth' },
];

const DEFAULT_TASKS: FocusTask[] = [
  { id: 't1', label: 'Review candidate resumes for VP Eng', done: false, status: 'in_progress' },
  { id: 't2', label: 'Finalize investor deck for Series A', done: false, status: 'highlighted' },
  { id: 't3', label: 'Approve Q2 budget proposal', done: false, status: 'in_progress' },
  { id: 't4', label: 'Review SOC2 compliance checklist', done: false, status: 'in_progress' },
];

const DEFAULT_NOTES: Note[] = [
  {
    id: 'n1',
    title: 'Canvas v2 Launch Strategy',
    createdAt: new Date('2026-06-10T10:00:00Z'),
    updatedAt: new Date('2026-06-15T14:30:00Z'),
    blocks: [
      { id: 'n1-b1', type: 'h1', content: 'Canvas v2 Launch Strategy' },
      { id: 'n1-b2', type: 'h3', content: 'Objectives' },
      { id: 'n1-b3', type: 'text', content: 'Our primary objective is to transition from beta to general availability by mid-Q3 2026. This includes stabilizing core canvas rendering, polishing the UI aesthetics, and integrating notes capabilities seamlessly.' },
      { id: 'n1-b4', type: 'todo', content: 'Stabilize core canvas drag-and-drop animations', checked: false },
      { id: 'n1-b5', type: 'todo', content: 'Optimize rendering of side panels on screen expand', checked: true },
      { id: 'n1-b6', type: 'todo', content: 'Connect AI Copilot message actions for saving notes', checked: false },
      { id: 'n1-b7', type: 'h3', content: 'Launch Channels & Budget Allocation' },
      {
        id: 'n1-b8',
        type: 'table',
        content: '',
        tableData: [
          ['Channel', 'Allocation', 'Expected Impact'],
          ['Direct Enterprise', '50%', 'High LTV, long sales cycles'],
          ['Inbound SEO', '30%', 'Low CAC, self-serve growth'],
          ['DevRel & Community', '20%', 'Viral adoption among builders']
        ]
      }
    ]
  },
  {
    id: 'n2',
    title: 'Seed Pitch Deck Outline',
    createdAt: new Date('2026-06-12T09:00:00Z'),
    updatedAt: new Date('2026-06-15T15:20:00Z'),
    blocks: [
      { id: 'n2-b1', type: 'h1', content: 'Seed Pitch Deck Outline' },
      { id: 'n2-b2', type: 'text', content: 'A summary of key slides and milestones for the upcoming Seed round fund-raising. We aim to secure $2M to scale the engineering and GTM teams.' },
      { id: 'n2-b3', type: 'h2', content: 'Slide Structure' },
      { id: 'n2-b4', type: 'todo', content: 'Slide 1: The Problem (Fractured team workflows in hybrid setups)', checked: true },
      { id: 'n2-b5', type: 'todo', content: 'Slide 2: The Solution (WorkOS Active Canvas & Collaborative Copilot)', checked: true },
      { id: 'n2-b6', type: 'todo', content: 'Slide 3: Market Size & TAM (Targeting developer-led fast-growing startups)', checked: false },
      { id: 'n2-b7', type: 'todo', content: 'Slide 4: Business Model (SaaS with usage-based AI token pricing)', checked: false },
      { id: 'n2-b8', type: 'h2', content: 'Financial Summary Table' },
      {
        id: 'n2-b9',
        type: 'table',
        content: '',
        tableData: [
          ['Metric', 'Current State', '12-Month Target'],
          ['Cash Balance', '$1.5M', '$3.5M (post-funding)'],
          ['Monthly Revenue', '$135k', '$350k'],
          ['Headcount (FTE)', '27', '42']
        ]
      }
    ]
  }
];

const DEFAULT_FILES: WorkspaceFile[] = [
  {
    id: 'f_soc2',
    name: 'SOC2_Compliance_Checklist.pdf',
    size: '420 KB',
    type: 'pdf',
    uploadedAt: new Date('2026-06-12T14:00:00Z'),
    chatTitle: 'Security Audit Prep Q3',
    content: JSON.stringify([
      { section: 'CC1.1', title: 'Control Environment', requirement: 'The entity demonstrates a commitment to integrity and ethical values.', status: 'Compliant', owner: 'Chief of Staff' },
      { section: 'CC2.1', title: 'Communication & Information', requirement: 'The entity communicates information necessary to support the functioning of internal control.', status: 'In Progress', owner: 'HR & Recruiting' },
      { section: 'CC5.1', title: 'Control Activities', requirement: 'The entity selects and develops control activities that contribute to mitigation of risks.', status: 'Attention Needed', owner: 'Product & Eng' },
      { section: 'CC6.2', title: 'User Registration & Access', requirement: 'New user credentials are authorized and registered before access is granted.', status: 'Compliant', owner: 'Product & Eng' },
      { section: 'CC6.3', title: 'Access Modification/Revocation', requirement: 'User access is modified or revoked on a timely basis upon termination/transfer.', status: 'Compliant', owner: 'HR & Recruiting' },
      { section: 'CC8.1', title: 'Change Management', requirement: 'The entity authorizes, designs, develops, and tests changes to infrastructure.', status: 'In Progress', owner: 'Product & Eng' }
    ])
  },
  {
    id: 'f_runway',
    name: 'Q3_Runway_Burn_Projections.xlsx',
    size: '1.2 MB',
    type: 'excel',
    uploadedAt: new Date('2026-06-13T10:30:00Z'),
    chatTitle: 'Financial Planning & Runway',
    content: JSON.stringify({
      headers: ['Month', 'Base MRR', 'Growth Rate', 'FTE Headcount', 'Operating Burn', 'Net Burn', 'Projected Runway'],
      rows: [
        ['June 2026', '$125,000', '8.0%', '27', '$193,500', '$58,500', '25.6 months'],
        ['July 2026', '$135,000', '8.0%', '27', '$193,500', '$47,700', '31.4 months'],
        ['August 2026', '$145,800', '10.0%', '28', '$199,000', '$38,620', '38.8 months'],
        ['September 2026', '$160,380', '10.0%', '28', '$199,000', '$22,582', '66.4 months'],
        ['October 2026', '$176,418', '12.0%', '29', '$204,500', '$6,912', '217.0 months']
      ],
      summary: {
        startingCash: '$1.5M',
        burnTarget: '< $50k/mo',
        breakEvenGoal: 'Q4 2026'
      }
    })
  },
  {
    id: 'f_onboarding',
    name: 'Engineer_Onboarding_Guide.txt',
    size: '15 KB',
    type: 'text',
    uploadedAt: new Date('2026-06-14T09:15:00Z'),
    chatTitle: 'Team Onboarding & Alignment',
    content: `=========================================
WORKOS DEVELOPER ONBOARDING GUIDE
=========================================

Welcome to the team! This guide will get you set up and running on the WorkOS Active Canvas platform in under 20 minutes.

Prerequisites
-------------
- Node.js >= v18.0.0
- pnpm >= v8.0.0
- Git

Getting Started
---------------
1. Clone the repository and navigate to the project root:
   $ git clone https://github.com/cybranex/workos.git
   $ cd workos

2. Install dependencies:
   $ pnpm install

3. Run the development servers:
   $ pnpm run dev
   This will simultaneously spin up the backend API and the frontend dev server.

Architecture Overview
---------------------
Our project is organized into two primary subfolders:
- /backend: Express server handle simulated OKR computations and workspace state synchronization.
- /frontend: React/Vite client utilizing Vanilla CSS custom properties for rich glassmorphism graphics and physics transitions.

Need Help?
----------
Post in #engineering-onboarding on Slack or trigger the AI Copilot with "Explain system schema details" in the workspace canvas chat.

Happy coding!
`
  }
];

export function FounderWorkspaceProvider({ children, initialEntryContext }: { children: ReactNode; initialEntryContext?: WorkspaceEntryContext | null }) {
  const { profile } = useAuth();
  const polytopeStore = usePolytopeStore('bdt');
  const { members } = useTeamMembers(profile?.company_id);

  useEffect(() => {
    if (profile?.company_id) void polytopeStore.loadDepartments();
  }, [profile?.company_id, polytopeStore.loadDepartments]);

  useEffect(() => {
    if (polytopeStore.loaded) {
      polytopeStore.setCompanySize(profile?.bdt_company_size ?? null);
    }
  }, [polytopeStore.loaded, profile?.bdt_company_size]); // eslint-disable-line react-hooks/exhaustive-deps

  // Multi-workspace state initialization
  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>(() => [
    {
      id: 'default',
      name: 'Workspace 1',
      goals: DEFAULT_GOALS,
      departments: DEFAULT_DEPARTMENTS,
      risks: DEFAULT_RISKS,
      gtmChannels: DEFAULT_GTM,
      tasks: DEFAULT_TASKS,
      shortcuts: [],
      cashBalance: 1500000,
      baseMRR: 125000,
      mrrGrowthRate: 8,
      chatMessages: [
        {
          id: 'welcome',
          sender: 'assistant',
          text: 'Hello! I am your WorkOS AI Copilot. I have access to your workspace metrics (runway, OKRs, FTE count, risks, and GTM strategy). Ask me to analyze metrics, add new objectives, or run simulations!',
          timestamp: new Date(),
        },
      ],
      isVoiceChat: false,
      activeDetailCard: null,
      selectedDeptId: 'eng',
      notes: DEFAULT_NOTES,
      uploadedFiles: DEFAULT_FILES,
    },
  ]);

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('default');
  const [activeSidebarTab, setActiveSidebarTab] = useState<string>('canvas');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('explore');
  const [activeRole, setActiveRole] = useState<WorkspaceRole>('founder');
  const [scrollExpansion, setScrollExpansionState] = useState(0);
  const [isFullscreen, setIsFullscreenState] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [entryContext, setEntryContext] = useState<WorkspaceEntryContext | null>(initialEntryContext ?? null);

  const logAudit = (action: string, detail?: string) => {
    const entry: AuditEntry = { id: `a_${Date.now()}`, action, detail, at: new Date().toISOString() };
    setAuditLog(prev => [entry, ...prev].slice(0, 200));
  };

  const setScrollExpansion = (val: number | ((prev: number) => number)) => {
    setScrollExpansionState(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      const clamped = Math.max(0, Math.min(100, next));
      if (clamped === 100) {
        setIsFullscreenState(true);
      } else {
        setIsFullscreenState(false);
      }
      return clamped;
    });
  };

  const setIsFullscreen = (val: boolean) => {
    setIsFullscreenState(val);
    setScrollExpansionState(val ? 100 : 0);
  };

  // Resolve active workspace state
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  const goals = activeWorkspace.goals;
  const canonicalDepartments = useMemo<DepartmentFTE[]>(() => {
    if (!polytopeStore.departments.length || !profile?.company_id) return [];
    return polytopeStore.departments
      .filter(d => d.domain !== 'inactive' && !d.isDraft)
      .map(d => {
        const assignedMembers = members.filter(m => m.department_id === d.id && m.status === 'active');
        const roles = assignedMembers
          .map(m => m.title || m.role_name || m.role)
          .filter(Boolean);
        return {
          id: d.id,
          name: d.label,
          fte: assignedMembers.length,
          roles: roles.length ? roles : ['No assigned members'],
        };
      });
  }, [members, polytopeStore.departments, profile?.company_id]);

  const departments = canonicalDepartments.length ? canonicalDepartments : activeWorkspace.departments;
  const risks = activeWorkspace.risks;
  const gtmChannels = activeWorkspace.gtmChannels;
  const tasks = activeWorkspace.tasks;
  const mrrGrowthRate = activeWorkspace.mrrGrowthRate;
  const chatMessages = activeWorkspace.chatMessages;
  const isVoiceChat = activeWorkspace.isVoiceChat;
  const activeDetailCard = activeWorkspace.activeDetailCard;
  const selectedDeptId = activeWorkspace.selectedDeptId;
  const notes = activeWorkspace.notes || [];
  const uploadedFiles = activeWorkspace.uploadedFiles || [];
  const shortcuts = activeWorkspace.shortcuts || [];

  // Helper to update active workspace fields
  const updateActiveWorkspace = (updater: (prev: WorkspaceState) => Partial<WorkspaceState>) => {
    setWorkspaces(prev => prev.map(w => w.id === activeWorkspaceId ? { ...w, ...updater(w) } : w));
  };

  // Financial parameters — per-workspace so a fresh workspace doesn't inherit
  // another workspace's cash/revenue (a new workspace starts genuinely at zero).
  const cashBalance = activeWorkspace.cashBalance;
  const baseMRR = activeWorkspace.baseMRR;

  // Dynamic metrics calculated on active workspace values
  const totalFTE = departments.reduce((acc, curr) => acc + curr.fte, 0);
  const operatingBurn = 45000 + totalFTE * 5500;
  const monthlyRev = Math.round(baseMRR * (1 + mrrGrowthRate / 100));
  const netBurn = Math.max(10000, operatingBurn - monthlyRev);
  const projectedRunway = Number((cashBalance / netBurn).toFixed(1));

  const goalProgress = goals.length > 0
    ? Math.round((goals.filter(g => g.done).length / goals.length) * 100)
    : 0;

  const confidenceScore = Math.min(
    100,
    50 + risks.filter(r => r.status === 'Mitigated').length * 16.6
  );

  // Switch active mrr growth rate
  const setMrrGrowthRate = (rate: number) => {
    logAudit('MRR growth rate updated', `${rate}%/mo`);
    updateActiveWorkspace(() => ({ mrrGrowthRate: rate }));
  };

  // Switch chat messages list
  const setChatMessages = (messagesOrUpdater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    updateActiveWorkspace(w => {
      const nextMsgs = typeof messagesOrUpdater === 'function' 
        ? messagesOrUpdater(w.chatMessages) 
        : messagesOrUpdater;
      return { chatMessages: nextMsgs };
    });
  };

  // Set active detail card
  const setActiveDetailCard = (cardId: string | null) => {
    updateActiveWorkspace(() => ({ activeDetailCard: cardId }));
  };

  // Set voice chat state
  const setIsVoiceChat = (val: boolean) => {
    updateActiveWorkspace(() => ({ isVoiceChat: val }));
  };

  // Set selected department ID
  const setSelectedDeptId = (deptId: string) => {
    updateActiveWorkspace(() => ({ selectedDeptId: deptId }));
  };

  // Sync OKR goal completions to Focus Tasks
  const toggleGoal = (id: string) => {
    updateActiveWorkspace(w => {
      const updatedGoals = w.goals.map(g => g.id === id ? { ...g, done: !g.done } : g);
      const targetGoal = w.goals.find(g => g.id === id);
      const nextDone = targetGoal ? !targetGoal.done : false;

      const updatedTasks = w.tasks.map(t => {
        if (targetGoal && (t.label.toLowerCase().includes(targetGoal.label.toLowerCase()) ||
            (id === 'g2' && t.id === 't1') ||
            (id === 'g3' && t.id === 't2'))) {
          return { ...t, done: nextDone };
        }
        return t;
      });

      if (targetGoal) logAudit(nextDone ? 'Goal completed' : 'Goal re-opened', targetGoal.label);
      return { goals: updatedGoals, tasks: updatedTasks };
    });
  };

  const addGoal = (
    label: string,
    category?: 'growth' | 'product' | 'finance' | 'talent' | 'compliance',
    timeline?: string,
    owner?: string
  ) => {
    logAudit('Goal added', label);
    updateActiveWorkspace(w => ({
      goals: [
        ...w.goals,
        {
          id: `g_${Date.now()}`,
          label,
          done: false,
          category: category || 'product',
          timeline: timeline || 'Q3 2026',
          owner: owner || 'CEO',
        },
      ],
      tasks: [
        ...w.tasks,
        {
          id: `t_${Date.now()}`,
          label: `Align teams on OKR: ${label}`,
          done: false,
          status: 'in_progress',
        },
      ],
    }));
  };

  const deleteGoal = (id: string) => {
    updateActiveWorkspace(w => {
      const g = w.goals.find(x => x.id === id);
      if (g) logAudit('Goal deleted', g.label);
      return { goals: w.goals.filter(x => x.id !== id) };
    });
  };

  const hireHeadcount = (deptId: string, role: string) => {
    updateActiveWorkspace(w => {
      const updatedTasks = [
        { id: `t_${Date.now()}`, label: `Invite or assign ${role} to ${departments.find(d => d.id === deptId)?.name ?? 'a department'}`, done: false },
        ...w.tasks,
      ];

      return { tasks: updatedTasks };
    });
  };

  const mitigateRisk = (id: string) => {
    updateActiveWorkspace(w => {
      const targetRisk = w.risks.find(r => r.id === id);
      if (!targetRisk) return {};

      const nextMitigated: 'Active' | 'Mitigated' = targetRisk.status === 'Mitigated' ? 'Active' : 'Mitigated';
      logAudit(nextMitigated === 'Mitigated' ? 'Risk mitigated' : 'Risk re-opened', targetRisk.label);
      const updatedRisks = w.risks.map(r => r.id === id ? { ...r, status: nextMitigated } : r);


      const updatedTasks = w.tasks.map(t => {
        if ((id === 'r1' && t.id === 't1') ||
            (id === 'r3' && t.id === 't4') ||
            t.label.toLowerCase().includes(targetRisk.label.toLowerCase())) {
          return { ...t, done: nextMitigated === 'Mitigated' };
        }
        return t;
      });

      return { risks: updatedRisks, tasks: updatedTasks };
    });
  };

  const addRisk = (label: string, impact: 'High' | 'Medium' | 'Low') => {
    logAudit('Risk added', `${label} (${impact})`);
    updateActiveWorkspace(w => ({
      risks: [...w.risks, { id: `r_${Date.now()}`, label, status: 'Active', impact }],
      tasks: [...w.tasks, { id: `t_${Date.now()}`, label: `Mitigate risk: ${label}`, done: false }],
    }));
  };

  const updateGTMChannelBudget = (id: string, budget: number) => {
    updateActiveWorkspace(w => {
      const target = w.gtmChannels.find(c => c.id === id);
      if (!target) return {};

      const diff = budget - target.budget;
      const otherChannels = w.gtmChannels.filter(c => c.id !== id);
      const otherSum = otherChannels.reduce((sum, c) => sum + c.budget, 0);

      let updatedGtm;
      if (otherSum === 0) {
        updatedGtm = w.gtmChannels.map(c => {
          if (c.id === id) return { ...c, budget };
          return { ...c, budget: Math.round((100 - budget) / otherChannels.length) };
        });
      } else {
        const updatedOther = otherChannels.map(c => {
          const share = c.budget / otherSum;
          return { ...c, budget: Math.max(0, Math.round(c.budget - diff * share)) };
        });

        const total = budget + updatedOther.reduce((sum, c) => sum + c.budget, 0);
        if (total !== 100 && updatedOther.length > 0) {
          updatedOther[updatedOther.length - 1].budget += (100 - total);
        }

        updatedGtm = w.gtmChannels.map(c => {
          if (c.id === id) return { ...c, budget };
          const updated = updatedOther.find(uo => uo.id === c.id);
          return updated ? updated : c;
        });
      }

      return { gtmChannels: updatedGtm };
    });
  };

  const toggleTask = (id: string) => {
    updateActiveWorkspace(w => {
      const targetTask = w.tasks.find(t => t.id === id);
      if (targetTask) logAudit(targetTask.done ? 'Task re-opened' : 'Task completed', targetTask.label);
      const updatedTasks = w.tasks.map(t => {
        if (t.id === id) {
          const nextDone = !t.done;
          const nextStatus: 'in_progress' | 'done' | 'highlighted' = nextDone ? 'done' : 'in_progress';
          return { ...t, done: nextDone, status: nextStatus };
        }
        return t;
      });

      // Synchronize back to goals and risks
      const nextDone = targetTask ? !targetTask.done : false;

      let nextRisks = w.risks;
      let nextGoals = w.goals;

      if (id === 't1') {
        nextRisks = w.risks.map(r => r.id === 'r1' ? { ...r, status: nextDone ? 'Mitigated' : 'Active' } : r);
        nextGoals = w.goals.map(g => g.id === 'g2' ? { ...g, done: nextDone } : g);
      } else if (id === 't2') {
        nextGoals = w.goals.map(g => g.id === 'g3' ? { ...g, done: nextDone } : g);
      } else if (id === 't4') {
        nextRisks = w.risks.map(r => r.id === 'r3' ? { ...r, status: nextDone ? 'Mitigated' : 'Active' } : r);
      }

      return { tasks: updatedTasks, risks: nextRisks, goals: nextGoals };
    });
  };

  const addTask = (label: string, status: 'in_progress' | 'done' | 'highlighted' = 'in_progress') => {
    logAudit('Task added', label);
    updateActiveWorkspace(w => ({
      tasks: [...w.tasks, { id: `t_${Date.now()}`, label, done: status === 'done', status }],
    }));
  };

  const updateTaskStatus = (id: string, status: 'in_progress' | 'done' | 'highlighted') => {
    updateActiveWorkspace(w => {
      const t = w.tasks.find(x => x.id === id);
      if (t) logAudit(`Task ${status === 'done' ? 'completed' : `moved to ${status}`}`, t.label);
      const updatedTasks = w.tasks.map(t => {
        if (t.id === id) {
          return { ...t, status, done: status === 'done' };
        }
        return t;
      });

      const nextDone = status === 'done';
      let nextRisks = w.risks;
      let nextGoals = w.goals;

      if (id === 't1') {
        nextRisks = w.risks.map(r => r.id === 'r1' ? { ...r, status: nextDone ? 'Mitigated' : 'Active' } : r);
        nextGoals = w.goals.map(g => g.id === 'g2' ? { ...g, done: nextDone } : g);
      } else if (id === 't2') {
        nextGoals = w.goals.map(g => g.id === 'g3' ? { ...g, done: nextDone } : g);
      } else if (id === 't4') {
        nextRisks = w.risks.map(r => r.id === 'r3' ? { ...r, status: nextDone ? 'Mitigated' : 'Active' } : r);
      }

      return { tasks: updatedTasks, risks: nextRisks, goals: nextGoals };
    });
  };

  const dismissTask = (id: string) => {
    updateActiveWorkspace(w => {
      const t = w.tasks.find(x => x.id === id);
      if (t) logAudit('Task dismissed', t.label);
      return { tasks: w.tasks.filter(t => t.id !== id) };
    });
  };

  const resetWorkspace = () => {
    logAudit('Workspace reset to defaults');
    updateActiveWorkspace(() => ({
      goals: DEFAULT_GOALS,
      departments: DEFAULT_DEPARTMENTS,
      risks: DEFAULT_RISKS,
      gtmChannels: DEFAULT_GTM,
      tasks: DEFAULT_TASKS,
      mrrGrowthRate: 8,
    }));
  };

  // Create workspace method — a new workspace starts genuinely empty (no cloned
  // demo data) so it doesn't just look like a duplicate of an existing one.
  const createWorkspace = (name: string, purpose?: string) => {
    const newId = `ws_${Date.now()}`;
    const ts = Date.now();
    const newWorkspace: WorkspaceState = {
      id: newId,
      name,
      purpose,
      goals: [],
      departments: [],
      risks: [],
      gtmChannels: [],
      tasks: [],
      shortcuts: [],
      cashBalance: 0,
      baseMRR: 0,
      mrrGrowthRate: 0,
      chatMessages: [
        {
          id: 'welcome',
          sender: 'assistant',
          text: `Hello! Welcome to ${name}. I am your WorkOS AI Copilot — ask me to help you set up goals, departments, or a GTM plan for this workspace.`,
          timestamp: new Date(),
        },
      ],
      isVoiceChat: false,
      activeDetailCard: null,
      selectedDeptId: '',
      notes: [
        {
          id: `n_welcome_${ts}`,
          title: `Getting Started with ${name}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          blocks: [
            { id: `b_welcome_h1_${ts}`, type: 'h1', content: `Getting Started with ${name}` },
            ...(purpose ? [{ id: `b_welcome_purpose_${ts}`, type: 'text' as const, content: purpose }] : []),
            { id: `b_welcome_h3_${ts}`, type: 'h3', content: 'Next steps' },
            { id: `b_welcome_todo1_${ts}`, type: 'todo' as const, content: 'Add your first goal in Review mode', checked: false },
            { id: `b_welcome_todo2_${ts}`, type: 'todo' as const, content: 'Log a decision that needs a call', checked: false },
            { id: `b_welcome_todo3_${ts}`, type: 'todo' as const, content: 'Add a department or risk to track', checked: false },
          ],
        },
      ],
      uploadedFiles: [],
    };

    setWorkspaces(prev => [...prev, newWorkspace]);
    setActiveWorkspaceId(newId);
    setActiveNoteId(null);
    setActiveSidebarTab('canvas');
  };

  const addShortcut = (item: Omit<ShortcutItem, 'id'>) => {
    const newItem: ShortcutItem = { ...item, id: `sc_${Date.now()}` };
    updateActiveWorkspace(w => ({ shortcuts: [...(w.shortcuts || []), newItem] }));
  };

  const removeShortcut = (id: string) => {
    updateActiveWorkspace(w => ({ shortcuts: (w.shortcuts || []).filter(s => s.id !== id) }));
  };

  const deleteWorkspace = (id: string) => {
    if (workspaces.length <= 1) return;
    setWorkspaces(prev => {
      const filtered = prev.filter(w => w.id !== id);
      if (activeWorkspaceId === id) {
        const fallbackIndex = prev.findIndex(w => w.id === id) - 1;
        const fallback = prev[fallbackIndex >= 0 ? fallbackIndex : 1];
        setActiveWorkspaceId(fallback.id);
        setActiveNoteId(null);
      }
      return filtered;
    });
  };

  const handleSetActiveWorkspaceId = (id: string) => {
    setActiveWorkspaceId(id);
    setActiveNoteId(null);
  };

  const renameWorkspace = (id: string, name: string) => {
    logAudit('Workspace renamed', name);
    setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name } : w));
  };

  const addNote = (title: string, blocks?: NoteBlock[]) => {
    logAudit('Note created', title || 'Untitled Note');
    const newNote: Note = {
      id: `note_${Date.now()}`,
      title: title || 'Untitled Note',
      createdAt: new Date(),
      updatedAt: new Date(),
      blocks: blocks || [
        { id: `b_h1_${Date.now()}`, type: 'h1', content: title || 'Untitled Note' },
        { id: `b_text_${Date.now()}`, type: 'text', content: '' }
      ]
    };
    updateActiveWorkspace(w => ({
      notes: [...(w.notes || []), newNote]
    }));
    setActiveNoteId(newNote.id);
  };

  const updateNote = (id: string, updates: Partial<Note>) => {
    updateActiveWorkspace(w => ({
      notes: (w.notes || []).map(n => n.id === id ? { ...n, ...updates, updatedAt: new Date() } : n)
    }));
  };

  const deleteNote = (id: string) => {
    updateActiveWorkspace(w => {
      const n = (w.notes || []).find(x => x.id === id);
      if (n) logAudit('Note deleted', n.title);
      return { notes: (w.notes || []).filter(n => n.id !== id) };
    });
    if (activeNoteId === id) {
      setActiveNoteId(null);
    }
  };

  const addUploadedFile = (file: Omit<WorkspaceFile, 'id' | 'uploadedAt'>) => {
    logAudit('File uploaded', file.name);
    updateActiveWorkspace(w => ({
      uploadedFiles: [
        ...(w.uploadedFiles || []),
        {
          ...file,
          id: `file_${Date.now()}`,
          uploadedAt: new Date()
        }
      ]
    }));
  };

  const deleteUploadedFile = (id: string) => {
    updateActiveWorkspace(w => {
      const f = (w.uploadedFiles || []).find(x => x.id === id);
      if (f) logAudit('File deleted', f.name);
      return { uploadedFiles: (w.uploadedFiles || []).filter(f => f.id !== id) };
    });
  };

  return (
    <FounderWorkspaceContext.Provider
      value={{
        goals,
        toggleGoal,
        addGoal,
        deleteGoal,
        goalProgress,
        cashBalance,
        baseMRR,
        mrrGrowthRate,
        setMrrGrowthRate,
        operatingBurn,
        projectedRunway,
        monthlyRev,
        departments,
        hireHeadcount,
        totalFTE,
        risks,
        mitigateRisk,
        addRisk,
        confidenceScore,
        gtmChannels,
        updateGTMChannelBudget,
        tasks,
        toggleTask,
        addTask,
        updateTaskStatus,
        dismissTask,
        resetWorkspace,
        
        // Multi-workspace API
        workspaces,
        activeWorkspaceId,
        setActiveWorkspaceId: handleSetActiveWorkspaceId,
        createWorkspace,
        deleteWorkspace,
        renameWorkspace,

        // Shortcuts API
        shortcuts,
        addShortcut,
        removeShortcut,

        // Notes API
        notes,
        addNote,
        updateNote,
        deleteNote,
        activeNoteId,
        setActiveNoteId,
        chatMessages,
        setChatMessages,
        isVoiceChat,
        setIsVoiceChat,
        activeDetailCard,
        setActiveDetailCard,
        selectedDeptId,
        setSelectedDeptId,

        // Sidebar sync
        activeSidebarTab,
        setActiveSidebarTab,

        // Mode + role
        workspaceMode,
        setWorkspaceMode,
        activeRole,
        setActiveRole,

        scrollExpansion,
        setScrollExpansion,
        isFullscreen,
        setIsFullscreen,

        // Files API
        uploadedFiles,
        addUploadedFile,
        deleteUploadedFile,

        // Audit trail
        auditLog,

        // Entry context
        entryContext,
        setEntryContext,
      }}
    >

      {children}
    </FounderWorkspaceContext.Provider>
  );
}

export function useFounderWorkspace() {
  const context = useContext(FounderWorkspaceContext);
  if (context === undefined) {
    throw new Error('useFounderWorkspace must be used within a FounderWorkspaceProvider');
  }
  return context;
}
