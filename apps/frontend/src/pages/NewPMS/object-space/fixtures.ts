import type { AssigneeInfo, ImplementationTask } from './types';

export const OBJECT_NODE_TYPES = [
  { type: 'ORGANIZATION', symbol: '🏢', label: 'ORGANIZATION', color: '#8b5cf6' },
  { type: 'CUSTOMER', symbol: '●●', label: 'CUSTOMER', color: '#10b981' },
  { type: 'INVOICE', symbol: '⎈', label: 'INVOICE', color: '#3b82f6' },
  { type: 'OPPORTUNITY', symbol: '◎', label: 'OPPORTUNITY', color: '#a855f7' },
  { type: 'PERSON', symbol: '○', label: 'PERSON', color: '#6366f1' },
  { type: 'PRODUCT', symbol: '◈', label: 'PRODUCT', color: '#059669' },
  { type: 'DEPARTMENT', symbol: '⌘', label: 'DEPARTMENT', color: '#2563eb' },
  { type: 'ASSET', symbol: '≡', label: 'ASSET', color: '#0284c7' },
];

export const TEAM_MEMBERS_ROSTER: AssigneeInfo[] = [
  { id: 'user-manager', name: 'Ronak (You)', email: 'manager@example.com', role: 'Engineering Manager' },
  { id: 'user-001', name: 'Alex Mercer', email: 'alex.mercer@acmecorp.com', role: 'Outbound SDR' },
  { id: 'user-002', name: 'Elena Rostova', email: 'elena.rostova@acmecorp.com', role: 'Inbound Specialist' },
  { id: 'user-003', name: 'Jordan Lee', email: 'jordan.lee@acmecorp.com', role: 'Staff Engineer' },
  { id: 'user-004', name: 'Sarah Connor', email: 'sarah.connor@acmecorp.com', role: 'VP Operations' },
  { id: 'user-005', name: 'Marcus Vance', email: 'marcus.vance@acmecorp.com', role: 'Product Lead' },
  { id: 'user-006', name: 'Maya Patel', email: 'maya.patel@acmecorp.com', role: 'QA Lead' },
];

export const INITIAL_TASKS: ImplementationTask[] = [
  // 1. Outbound Sales Blitz (In Progress)
  {
    id: 'task-sales-001',
    title: 'Outbound Prospecting & Call Blitz',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Complete target dial volume, connect with decision-makers, and book qualified discovery demos.',
    priority: 'high',
    status: 'in_progress',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Today, 5:00 PM',
    estimatedMinutes: 90,
    progress: 50,
    steps: [
      {
        id: 'step-sales-1',
        stepOrder: 1,
        title: 'Pre-Flight ICP & Audio Prep',
        type: 'checklist',
        isCompleted: true,
        completedAt: '10:15 AM',
        checklistItems: [
          { id: 'c1', label: "Filter today's Tier-1 target accounts in CRM", checked: true },
          { id: 'c2', label: 'Review top 3 objection talk tracks (Budget, Competitor, Bad Timing)', checked: true },
          { id: 'c3', label: 'Test VoIP headset and audio input levels', checked: true },
        ],
      },
      {
        id: 'step-sales-2',
        stepOrder: 2,
        title: 'Pitch & Objection Cheat-Sheet',
        type: 'script_viewer',
        isCompleted: true,
        completedAt: '10:25 AM',
        scriptContent: `**Pattern Interrupt Hook**:
*"Hi [First Name], this is Alex with WorkOS. I know you weren't expecting my call, do you have 30 seconds for me to share why I called, and you can let me know if it's relevant?"*

**Core Value Proposition**:
*"We help scale-ups unify their fragmented tools into a single Business OS. Most engineering and revenue leaders we talk to save 12+ hours per week per manager."*`,
        objectionCheats: [
          {
            id: 'obj-1',
            title: 'No Budget Right Now',
            trigger: '"We have frozen all software spend for this quarter."',
            rebuttal: '"Totally understand. Most of our current enterprise partners were in the same boat when we first met. We are not asking for spend today — simply sharing a 15-min architectural blueprint so you have it ready when planning next cycle. Would Thursday afternoon work?"',
          },
          {
            id: 'obj-2',
            title: 'Using a Competitor',
            trigger: '"We already use a combination of Jira, HubSpot and Monday."',
            rebuttal: '"That makes sense, they are common tools. Where our partners find the biggest gap is cross-department data reconciliation between Jira and CRM. How are your team leads currently syncing delivery status with executive goals?"',
          },
        ],
      },
      {
        id: 'step-sales-3',
        stepOrder: 3,
        title: 'Calling Sprint 1 (Batch 1)',
        type: 'input_form',
        isCompleted: false,
        formFields: [
          { id: 'f_dials', label: 'Dials Completed', type: 'counter', value: 18, target: 20 },
          { id: 'f_connected', label: 'Conversations (Connected)', type: 'counter', value: 4 },
          { id: 'f_gatekeeper', label: 'Gatekeeper / Voicemail', type: 'counter', value: 12 },
          { id: 'f_booked', label: 'Qualified Demos Booked', type: 'counter', value: 2 },
        ],
      },
      {
        id: 'step-sales-4',
        stepOrder: 4,
        title: 'Schedule Demos & Calendar Bridge',
        type: 'connector_action',
        isCompleted: false,
        connector: {
          type: 'google_calendar',
          label: 'Open Google Calendar Invite',
          actionUrl: 'https://calendar.google.com/calendar/r/eventedit',
          description: '1-click bridge to send pre-formatted Google Calendar invites with Zoom meeting room link.',
        },
      },
    ],
  },

  // 2. Tier-1 Re-Engagement (In Progress)
  {
    id: 'task-sales-002',
    title: 'Tier-1 Re-Engagement & Follow-Up Sequence',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Touch stalled accounts with value-led triggers and customer success case studies.',
    priority: 'urgent',
    status: 'in_progress',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Today, 6:30 PM',
    estimatedMinutes: 45,
    progress: 33,
    steps: [
      {
        id: 'step-re-1',
        stepOrder: 1,
        title: 'Trigger Event & News Audit',
        type: 'checklist',
        isCompleted: true,
        completedAt: '11:40 AM',
        checklistItems: [
          { id: 're1', label: 'Check target account for recent hiring or funding news', checked: true },
          { id: 're2', label: 'Locate 2 new decision makers on LinkedIn Sales Navigator', checked: true },
        ],
      },
      {
        id: 'step-re-2',
        stepOrder: 2,
        title: 'Send Custom Value Trigger',
        type: 'connector_action',
        isCompleted: false,
        connector: {
          type: 'gmail_sender',
          label: 'Send Personalized Email via Gmail',
          actionUrl: 'https://mail.google.com',
          description: 'Dispatch customer ROI blueprint directly to VP of Engineering.',
        },
      },
      {
        id: 'step-re-3',
        stepOrder: 3,
        title: 'Update Pipeline Cadence in CRM',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 're3', label: 'Advance deal stage to "Re-engaged"', checked: false },
          { id: 're4', label: 'Set 48-hour follow-up task reminder', checked: false },
        ],
      },
    ],
  },

  // 3. Enterprise Multi-Threading (Assigned / Queue)
  {
    id: 'task-sales-003',
    title: 'Enterprise Multi-Threading & VP Outreach',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Map 3+ stakeholders in enterprise target accounts and initiate multi-channel touches.',
    priority: 'medium',
    status: 'active',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Tomorrow, 12:00 PM',
    estimatedMinutes: 60,
    progress: 0,
    steps: [
      {
        id: 'step-ent-1',
        stepOrder: 1,
        title: 'Org Chart & Champion Mapping',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'ent1', label: 'Map VP of Product, VP of Eng, and RevOps Lead', checked: false },
          { id: 'ent2', label: 'Find mutual connections or alumni links', checked: false },
        ],
      },
      {
        id: 'step-ent-2',
        stepOrder: 2,
        title: 'Executive Pitch Track',
        type: 'script_viewer',
        isCompleted: false,
        scriptContent: `**Executive Opening**:
*"Hi [First Name], noticed your recent announcement on expanding the platform team. We work with engineering VPs to eliminate tool silos without adding headcount."*`,
      },
      {
        id: 'step-ent-3',
        stepOrder: 3,
        title: 'Log Touchpoints',
        type: 'input_form',
        isCompleted: false,
        formFields: [
          { id: 'f_touches', label: 'Stakeholders Touched', type: 'counter', value: 0, target: 5 },
          { id: 'f_notes', label: 'Executive Context', type: 'text', value: '' },
        ],
      },
    ],
  },

  // 4. Mid-Market Discovery & Demo Handoff (Completed)
  {
    id: 'task-sales-004',
    title: 'Mid-Market Account Discovery & AE Handoff',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Complete discovery call notes, qualify enterprise readiness, and hand off deal to Account Executive.',
    priority: 'high',
    status: 'completed',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Completed Today',
    estimatedMinutes: 45,
    progress: 100,
    submittedAt: 'Today, 2:15 PM',
    notes: 'Discovery meeting completed with Lumina Cloud CTO. Handoff package dispatched to AE team.',
    steps: [
      {
        id: 'step-comp-1',
        stepOrder: 1,
        title: 'Discovery Call Debrief & Pain Points',
        type: 'checklist',
        isCompleted: true,
        completedAt: '1:45 PM',
        checklistItems: [
          { id: 'c10', label: 'Prospect pain point logged: cross-team delivery delays', checked: true },
          { id: 'c11', label: 'Budget timeline verified for Q4 deployment', checked: true },
        ],
      },
      {
        id: 'step-comp-2',
        stepOrder: 2,
        title: 'AE Briefing & Calendar Transfer',
        type: 'checklist',
        isCompleted: true,
        completedAt: '2:15 PM',
        checklistItems: [
          { id: 'c12', label: 'Invite forwarded to assigned Account Executive', checked: true },
          { id: 'c13', label: 'Opportunity record created in CRM pipeline', checked: true },
        ],
      },
    ],
  },

  // 5. Customer Account Expansion (In Progress)
  {
    id: 'task-sales-005',
    title: 'Customer Account Expansion & Health Audit',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Audit tier-1 enterprise account telemetry and prepare expansion proposals.',
    priority: 'high',
    status: 'in_progress',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Today, 7:00 PM',
    estimatedMinutes: 40,
    progress: 60,
    steps: [
      {
        id: 'step-cust-1',
        stepOrder: 1,
        title: 'Telemetry & License Utilization Check',
        type: 'checklist',
        isCompleted: true,
        completedAt: '12:10 PM',
        checklistItems: [
          { id: 'cust1', label: 'Confirm 92% seat utilization across engineering team', checked: true },
          { id: 'cust2', label: 'Identify 3 unassigned departments ready for expansion', checked: true },
        ],
      },
      {
        id: 'step-cust-2',
        stepOrder: 2,
        title: 'Expansion Pitch Draft',
        type: 'script_viewer',
        isCompleted: false,
        scriptContent: `**Expansion Script**:
*"Hi [First Name], congratulations on reaching 90%+ adoption across your core team. We wanted to share the multi-team tier so your design team can join the workspace."*`,
      },
    ],
  },

  // 6. Opportunity Pipeline Review & Stage Advance (Assigned)
  {
    id: 'task-sales-006',
    title: 'Opportunity Pipeline Stage Review',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Review stalled pipeline opportunities and sync stages with sales leadership.',
    priority: 'medium',
    status: 'active',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Tomorrow, 10:00 AM',
    estimatedMinutes: 30,
    progress: 0,
    steps: [
      {
        id: 'step-opp-1',
        stepOrder: 1,
        title: 'Pipeline Hygiene Check',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'opp1', label: 'Verify close dates for current quarter deals', checked: false },
          { id: 'opp2', label: 'Flag deals without next steps scheduled', checked: false },
        ],
      },
    ],
  },

  // 7. Invoice & Milestone Verification (Assigned)
  {
    id: 'task-sales-007',
    title: 'Invoice & Billing Milestone Handshake',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Verify signed contract PO details before finance billing dispatch.',
    priority: 'low',
    status: 'active',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Tomorrow, 3:00 PM',
    estimatedMinutes: 25,
    progress: 0,
    steps: [
      {
        id: 'step-inv-1',
        stepOrder: 1,
        title: 'Contract Terms Confirmation',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'inv1', label: 'Check payment terms Net-30 in order form', checked: false },
          { id: 'inv2', label: 'Confirm customer VAT and entity tax ID', checked: false },
        ],
      },
    ],
  },

  // 8. Asset & Product Demo Certification (Completed)
  {
    id: 'task-sales-008',
    title: 'Asset & Product Demo Certification',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Complete product walkthrough certification on the latest WorkOS release.',
    priority: 'medium',
    status: 'completed',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Completed Yesterday',
    estimatedMinutes: 50,
    progress: 100,
    submittedAt: 'Yesterday, 4:30 PM',
    notes: 'Certification passed with 100% score.',
    steps: [
      {
        id: 'step-ast-1',
        stepOrder: 1,
        title: 'Product Walkthrough Exam',
        type: 'checklist',
        isCompleted: true,
        completedAt: 'Yesterday, 4:00 PM',
        checklistItems: [
          { id: 'ast1', label: 'Demonstrate multi-department workspace switching', checked: true },
          { id: 'ast2', label: 'Execute sample live lead routing trigger', checked: true },
        ],
      },
    ],
  },

  // 9. Q4 Quota Attainment & Pipeline Forecast (In Progress)
  {
    id: 'task-sales-009',
    title: 'Q4 Quota Attainment & Forecast Review',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Review month-to-date dials, qualified opportunities, and quota pacing.',
    priority: 'high',
    status: 'in_progress',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Today, 4:00 PM',
    estimatedMinutes: 35,
    progress: 45,
    steps: [
      {
        id: 'step-q4-1',
        stepOrder: 1,
        title: 'Forecast Model Reconciliation',
        type: 'checklist',
        isCompleted: true,
        completedAt: '1:15 PM',
        checklistItems: [
          { id: 'q4-1', label: 'Verify 14 staged demo meetings in CRM pipeline', checked: true },
          { id: 'q4-2', label: 'Calculate conversion rate delta vs last month', checked: true },
        ],
      },
    ],
  },

  // 10. Strategic Account Org Chart Mapping (Assigned)
  {
    id: 'task-sales-010',
    title: 'Strategic Account Org Chart Mapping',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Map executive decision makers for Fortune 500 prospect accounts.',
    priority: 'medium',
    status: 'active',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Tomorrow, 11:00 AM',
    estimatedMinutes: 40,
    progress: 0,
    steps: [
      {
        id: 'step-org-1',
        stepOrder: 1,
        title: 'Stakeholder Map',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'org1', label: 'Map VP Technology, Chief Architect, and RevOps Director', checked: false },
        ],
      },
    ],
  },

  // 11. Inbound Webinar Lead Follow-Up Blitz (In Progress)
  {
    id: 'task-sales-011',
    title: 'Inbound Webinar Lead Follow-Up Blitz',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Connect with high-intent attendees from the product launch webinar.',
    priority: 'urgent',
    status: 'in_progress',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Today, 5:30 PM',
    estimatedMinutes: 45,
    progress: 75,
    steps: [
      {
        id: 'step-web-1',
        stepOrder: 1,
        title: 'Priority Attendee Triage',
        type: 'checklist',
        isCompleted: true,
        completedAt: '2:30 PM',
        checklistItems: [
          { id: 'web1', label: 'Segment 45 registered enterprise attendees by company size', checked: true },
        ],
      },
    ],
  },

  // 12. Competitor Battlecard & Pricing Review (Completed)
  {
    id: 'task-sales-012',
    title: 'Competitor Battlecard & Pricing Review',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Update sales objection battlecard with latest competitor pricing changes.',
    priority: 'medium',
    status: 'completed',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Completed Today',
    estimatedMinutes: 30,
    progress: 100,
    submittedAt: 'Today, 11:00 AM',
    notes: 'Battlecard updated and shared in sales channel.',
    steps: [
      {
        id: 'step-bat-1',
        stepOrder: 1,
        title: 'Pricing Comparison Sheet',
        type: 'checklist',
        isCompleted: true,
        completedAt: '10:45 AM',
        checklistItems: [
          { id: 'bat1', label: 'Cross-reference competitor per-seat add-on pricing', checked: true },
        ],
      },
    ],
  },

  // 13. Technical POC Discovery & Security Review (In Progress)
  {
    id: 'task-sales-013',
    title: 'Technical POC Discovery & Security Review',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Gather technical prerequisites for upcoming SOC2 enterprise pilot.',
    priority: 'high',
    status: 'in_progress',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Today, 6:00 PM',
    estimatedMinutes: 50,
    progress: 20,
    steps: [
      {
        id: 'step-poc-1',
        stepOrder: 1,
        title: 'Security Questionnaire Dispatch',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'poc1', label: 'Verify SSO/SAML configuration requirements', checked: false },
        ],
      },
    ],
  },

  // 14. Executive Sponsor Check-In & NPS Survey (Assigned)
  {
    id: 'task-sales-014',
    title: 'Executive Sponsor Check-In & Feedback',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Schedule executive quarterly alignment meeting with key account champion.',
    priority: 'medium',
    status: 'active',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Tomorrow, 2:00 PM',
    estimatedMinutes: 30,
    progress: 0,
    steps: [
      {
        id: 'step-nps-1',
        stepOrder: 1,
        title: 'Executive Meeting Request',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'nps1', label: 'Draft personalized email with Q3 value highlights', checked: false },
        ],
      },
    ],
  },

  // 15. Mid-Market Pilot Agreement Sign-Off (Completed)
  {
    id: 'task-sales-015',
    title: 'Mid-Market Pilot Agreement Sign-Off',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Confirm signed DocuSign pilot agreement and initiate onboarding handover.',
    priority: 'urgent',
    status: 'completed',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Completed Today',
    estimatedMinutes: 20,
    progress: 100,
    submittedAt: 'Today, 1:00 PM',
    notes: 'Pilot signed by Apex Logistics CTO.',
    steps: [
      {
        id: 'step-plt-1',
        stepOrder: 1,
        title: 'Contract Handover',
        type: 'checklist',
        isCompleted: true,
        completedAt: '12:55 PM',
        checklistItems: [
          { id: 'plt1', label: 'Attach executed agreement to CRM account profile', checked: true },
        ],
      },
    ],
  },

  // 16. CRM Data Enrichment & Cleanliness Audit (Assigned)
  {
    id: 'task-sales-016',
    title: 'CRM Data Enrichment & Cleanliness Audit',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Clean up stale account records and fill missing contact job titles.',
    priority: 'low',
    status: 'active',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Tomorrow, 4:00 PM',
    estimatedMinutes: 45,
    progress: 0,
    steps: [
      {
        id: 'step-crm-1',
        stepOrder: 1,
        title: 'Run Apollo Data Enrichment Batch',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'crm1', label: 'Enrich 100 target accounts with verified phone numbers', checked: false },
        ],
      },
    ],
  },

  // 17. Partner Channel Referral Outreach (In Progress)
  {
    id: 'task-sales-017',
    title: 'Partner Channel Referral Outreach',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Engage consulting partners for joint enterprise co-selling opportunities.',
    priority: 'medium',
    status: 'in_progress',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Today, 6:30 PM',
    estimatedMinutes: 40,
    progress: 50,
    steps: [
      {
        id: 'step-prt-1',
        stepOrder: 1,
        title: 'Partner Briefing',
        type: 'checklist',
        isCompleted: true,
        completedAt: '3:00 PM',
        checklistItems: [
          { id: 'prt1', label: 'Send partner co-sell collateral packet', checked: true },
        ],
      },
    ],
  },

  // 18. Enterprise MSA Redline Collaboration (Assigned)
  {
    id: 'task-sales-018',
    title: 'Enterprise MSA Redline Collaboration',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Coordinate legal review of customer standard terms and indemnification clauses.',
    priority: 'high',
    status: 'active',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Tomorrow, 5:00 PM',
    estimatedMinutes: 60,
    progress: 0,
    steps: [
      {
        id: 'step-msa-1',
        stepOrder: 1,
        title: 'Legal Team Submission',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'msa1', label: 'Submit redlines to in-house legal counsel', checked: false },
        ],
      },
    ],
  },

  // 19. Sales Enablement Script Roleplay (Completed)
  {
    id: 'task-sales-019',
    title: 'Sales Enablement Script Roleplay',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Complete weekly cold call objection simulation and coaching session.',
    priority: 'low',
    status: 'completed',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Completed Today',
    estimatedMinutes: 30,
    progress: 100,
    submittedAt: 'Today, 9:30 AM',
    notes: 'Score 9.5/10 on pattern interrupt talk track.',
    steps: [
      {
        id: 'step-rol-1',
        stepOrder: 1,
        title: 'Peer Roleplay Session',
        type: 'checklist',
        isCompleted: true,
        completedAt: '9:25 AM',
        checklistItems: [
          { id: 'rol1', label: 'Handle pricing pushback objection with VP scenario', checked: true },
        ],
      },
    ],
  },

  // 20. Renewal Risk Assessment & Mitigation Plan (Assigned)
  {
    id: 'task-sales-020',
    title: 'Renewal Risk Assessment & Mitigation',
    departmentKey: 'outbound_sales',
    departmentName: 'Outbound Sales & BDR',
    category: 'Revenue & Commercial Operations',
    goal: 'Identify accounts with low usage and formulate proactive save strategies.',
    priority: 'high',
    status: 'active',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Outbound SDR',
    },
    due: 'Tomorrow, 3:30 PM',
    estimatedMinutes: 45,
    progress: 0,
    steps: [
      {
        id: 'step-rnw-1',
        stepOrder: 1,
        title: 'Telemetry Audit for At-Risk Tier',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'rnw1', label: 'Review login frequency drops over past 30 days', checked: false },
        ],
      },
    ],
  },

  // 2. Inbound Lead Qualification
  {
    id: 'task-sales-002',
    title: 'Inbound Lead Triage & First-Touch Response',
    departmentKey: 'inbound_sales',
    departmentName: 'Inbound Lead Qualification',
    category: 'Revenue & Commercial Operations',
    goal: 'Respond quickly to high-intent web leads, qualify fit, and route to account executives.',
    priority: 'urgent',
    status: 'active',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Inbound SDR',
    },
    due: 'Within 15 mins of lead submission',
    estimatedMinutes: 30,
    progress: 0,
    steps: [
      {
        id: 'step-inbound-1',
        stepOrder: 1,
        title: 'Lead Enrichment & Firmographic Audit',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'in1', label: 'Verify company size (> 20 employees) and annual revenue tier', checked: false },
          { id: 'in2', label: 'Check tech stack compatibility (Slack, Google Workspace, GitHub)', checked: false },
          { id: 'in3', label: 'Confirm prospect holds VP/Director/Lead purchasing authority', checked: false },
        ],
      },
      {
        id: 'step-inbound-2',
        stepOrder: 2,
        title: 'Dispatch Personalized Intro Email',
        type: 'connector_action',
        isCompleted: false,
        connector: {
          type: 'gmail_sender',
          label: 'Compose in Gmail',
          actionUrl: 'https://mail.google.com/mail/?view=cm&fs=1',
          description: '1-click email intent with personalized intro, company pain point, and scheduler link.',
        },
      },
      {
        id: 'step-inbound-3',
        stepOrder: 3,
        title: 'BANT Qualification Scoring',
        type: 'input_form',
        isCompleted: false,
        formFields: [
          { id: 'bant_budget', label: 'Budget Confirmed (1-5 Scale)', type: 'select', value: '4', options: ['1 - Low', '2 - Unknown', '3 - Moderate', '4 - Approved Budget', '5 - Enterprise Budget'] },
          { id: 'bant_authority', label: 'Decision Authority Level', type: 'select', value: 'VP Level', options: ['Manager', 'Director', 'VP Level', 'C-Suite / Founder'] },
          { id: 'bant_timeline', label: 'Implementation Timeline', type: 'select', value: 'Under 30 Days', options: ['Immediate (< 14 days)', 'Under 30 Days', 'This Quarter', 'Exploratory (6+ months)'] },
        ],
      },
      {
        id: 'step-inbound-4',
        stepOrder: 4,
        title: 'Deal Handoff & AE Assignment',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'h1', label: 'Convert lead to CRM Opportunity with deal value estimate', checked: false },
          { id: 'h2', label: 'Tag assigned Account Executive and notify in Slack #sales-wins', checked: false },
        ],
      },
    ],
  },

  // 3. Software Engineering: PR Review Sprint
  {
    id: 'task-eng-001',
    title: 'Daily Pull Request Triage & Code Review',
    departmentKey: 'engineering',
    departmentName: 'Software Engineering',
    category: 'Product, Design & Engineering',
    goal: 'Review assigned pull requests promptly, maintain high code quality, and prevent regressions.',
    priority: 'high',
    status: 'in_progress',
    assignee: {
      id: 'user-002',
      name: 'Elena Rostova',
      email: 'elena.r@acmecorp.com',
      role: 'Staff Engineer',
    },
    due: 'Today, 2:00 PM',
    estimatedMinutes: 45,
    progress: 50,
    steps: [
      {
        id: 'step-eng-1',
        stepOrder: 1,
        title: 'Open GitHub Review Queue',
        type: 'connector_action',
        isCompleted: true,
        completedAt: '11:00 AM',
        connector: {
          type: 'github_pr',
          label: 'Open Assigned Pull Requests',
          actionUrl: 'https://github.com/pulls',
          description: 'Jump straight into assigned PR diffs on GitHub.',
        },
      },
      {
        id: 'step-eng-2',
        stepOrder: 2,
        title: 'Engineering Quality Checklist',
        type: 'checklist',
        isCompleted: true,
        completedAt: '11:20 AM',
        checklistItems: [
          { id: 'eq1', label: 'Business logic strictly satisfies user story requirements', checked: true },
          { id: 'eq2', label: 'TypeScript types are complete and strict (no "any" or loose casts)', checked: true },
          { id: 'eq3', label: 'Unit and integration tests are present and passing in CI', checked: true },
          { id: 'eq4', label: 'Multi-tenant company_id scoping enforced on all database queries', checked: true },
          { id: 'eq5', label: 'No credentials, tokens, or raw error leakages to frontend', checked: true },
        ],
      },
      {
        id: 'step-eng-3',
        stepOrder: 3,
        title: 'Submit Review Verdict',
        type: 'input_form',
        isCompleted: false,
        formFields: [
          { id: 'pr_number', label: 'PR Number / Branch', type: 'text', value: 'PR #142 (native-sales-engine)' },
          { id: 'verdict', label: 'Review Decision', type: 'select', value: 'Approved with comments', options: ['Approve', 'Request Changes', 'Approved with comments'] },
          { id: 'notes', label: 'Architecture Feedback & Notes', type: 'text', value: 'Looks solid. Added 1 note on memoizing the decimal calculation handler.' },
        ],
      },
    ],
  },

  // 4. Paid Ads Optimization
  {
    id: 'task-mkt-001',
    title: 'Paid Ads Creative & Budget Optimization',
    departmentKey: 'paid_marketing',
    departmentName: 'Paid Performance Marketing',
    category: 'Marketing, Growth & Brand',
    goal: 'Audit active campaigns, retire underperforming ad sets, and launch fresh creative assets.',
    priority: 'medium',
    status: 'active',
    assignee: {
      id: 'user-003',
      name: 'Maya Lin',
      email: 'maya.lin@acmecorp.com',
      role: 'Growth Lead',
    },
    due: 'Tomorrow, 12:00 PM',
    estimatedMinutes: 60,
    progress: 0,
    steps: [
      {
        id: 'step-mkt-1',
        stepOrder: 1,
        title: 'Performance Telemetry Capture',
        type: 'input_form',
        isCompleted: false,
        formFields: [
          { id: 'mkt_spend', label: '7-Day Total Ad Spend ($)', type: 'number', value: 4500 },
          { id: 'mkt_cac', label: 'Blended Customer Acquisition Cost ($)', type: 'number', value: 68 },
          { id: 'mkt_roas', label: 'Return on Ad Spend (ROAS)', type: 'number', value: 3.4 },
        ],
      },
      {
        id: 'step-mkt-2',
        stepOrder: 2,
        title: 'Ad Fatigue & Frequency Audit',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'af1', label: 'Pause ad sets with frequency > 3.8 and CTR drops > 25%', checked: false },
          { id: 'af2', label: 'Identify top performing copy hook for scaling', checked: false },
        ],
      },
      {
        id: 'step-mkt-3',
        stepOrder: 3,
        title: 'Launch Meta Campaign Studio',
        type: 'connector_action',
        isCompleted: false,
        connector: {
          type: 'meta_ads',
          label: 'Open Meta Campaign Studio',
          actionUrl: '/api/integrations/meta',
          description: 'Upload fresh video and carousel assets with fail-closed sandbox checks.',
        },
      },
    ],
  },

  // 5. Customer Success QBR Preparation
  {
    id: 'task-cs-001',
    title: 'Quarterly Business Review (QBR) Preparation',
    departmentKey: 'customer_success',
    departmentName: 'Customer Success & AM',
    category: 'Revenue & Commercial Operations',
    goal: 'Deliver executive-ready usage metrics and ROI presentation for client leadership.',
    priority: 'high',
    status: 'active',
    assignee: {
      id: 'user-001',
      name: 'Alex Mercer',
      email: 'alex.mercer@acmecorp.com',
      role: 'Customer Success Lead',
    },
    due: 'Thursday, 3:00 PM',
    estimatedMinutes: 60,
    progress: 0,
    steps: [
      {
        id: 'step-cs-1',
        stepOrder: 1,
        title: 'Usage & Health Audit',
        type: 'checklist',
        isCompleted: false,
        checklistItems: [
          { id: 'cs1', label: 'Export 90-day active seat utilization percentage', checked: false },
          { id: 'cs2', label: 'Verify zero unresolved P0/P1 support escalation tickets', checked: false },
          { id: 'cs3', label: 'Confirm key workflow milestones completed by customer team', checked: false },
        ],
      },
      {
        id: 'step-cs-2',
        stepOrder: 2,
        title: 'Value Realization Summary',
        type: 'input_form',
        isCompleted: false,
        formFields: [
          { id: 'hours_saved', label: 'Estimated Team Hours Saved / Month', type: 'number', value: 140 },
          { id: 'roi_multiple', label: 'Calculated ROI Multiple (e.g. 4.8x)', type: 'number', value: 4.8 },
          { id: 'key_win', label: 'Primary Client Win / Case Metric', type: 'text', value: 'Shortened sales cycle from 24 days to 9 days.' },
        ],
      },
      {
        id: 'step-cs-3',
        stepOrder: 3,
        title: 'Open Presentation Deck Template',
        type: 'connector_action',
        isCompleted: false,
        connector: {
          type: 'google_calendar',
          label: 'Open Google Slides QBR Template',
          actionUrl: 'https://docs.google.com/presentation',
          description: 'Embed validated usage graphs and value figures into client-facing deck.',
        },
      },
    ],
  },
];
