// ─────────────────────────────────────────────────────────────────────────────
// Universal Polytope Data — twin (/3d) default department graph only
//
// Canonical types & BDT seed data live in bdtPolytopeData.ts.
// U_NODES here is the twin default (team/project/process trees + inactive padding).
// Runtime twin graph: usePolytopeStore('twin') → localStorage, not the BDT backend.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  UDomain,
  TeamMember,
  ProjectDetails,
  UInternalNode,
  UExternalNode,
} from './bdtPolytopeData';

export { U_DOMAIN_COLOR, resolvePolytopeNodeCount, getExternalNodeColor, isActionLeafNode, isBdtWorkspaceLeafNode, isProjectLeafNode, BDT_ACTION_LEAF_TYPES } from './bdtPolytopeData';

import type { UDomain, UExternalNode, UInternalNode, TeamMember, ProjectDetails } from './bdtPolytopeData';
import { resolvePolytopeNodeCount } from './bdtPolytopeData';

// ── Internal node definitions per department (twin / galaxy visual defaults) ─
type InternalDef = {
  label: string;
  type: UInternalNode['type'];
  score: number;
  memberCount?: number;
  members?: TeamMember[];
  projectDetails?: ProjectDetails;
  children?: InternalDef[];
};

function buildTree(parentId: string, defs: InternalDef[], depth = 1): UInternalNode[] {
  return defs.map((d, i) => ({
    id: `${parentId}_d${depth}_${i}`,
    label: d.label,
    type: d.type,
    score: d.score,
    memberCount: d.memberCount,
    members: d.members,
    projectDetails: d.projectDetails,
    children: d.children ? buildTree(`${parentId}_d${depth}_${i}`, d.children, depth + 1) : [],
  }));
}

function genMembers(count: number, roles: string[]): TeamMember[] {
  return Array.from({ length: count }).map((_, i) => ({
    name: `Member ${i + 1}`,
    role: roles[i % roles.length],
    avatarUrl: `https://i.pravatar.cc/150?u=user${Math.random()}`,
  }));
}

const DEPARTMENTS: UExternalNode[] = [
  {
    id: 'dept_engineering',
    label: 'Engineering',
    domain: 'build',
    cluster: 'Build',
    score: 20,
    metrics: { performance: 91, efficiency: 85, capacity: 78, alignment: 88, risk: 14 },
    internalNodes: buildTree('eng', [
      { label: 'Teams', type: 'team', score: 88, children: [
        { label: 'Backend Team', type: 'team', score: 90, memberCount: 5, members: genMembers(5, ['Lead', 'Backend Dev', 'DBA']), children: [] },
        { label: 'Frontend Team', type: 'team', score: 85, memberCount: 6, members: genMembers(6, ['Lead', 'Frontend Dev', 'UI Designer']), children: [] },
      ]},
      { label: 'Projects', type: 'project', score: 84, children: [
        { label: 'DB Migrations', type: 'project', score: 76, projectDetails: { status: 'In Progress', deadline: 'Q3', description: 'Migrating core database to new cluster', budget: '$50k' }, children: [] },
        { label: 'Design System', type: 'project', score: 92, projectDetails: { status: 'Completed', deadline: 'Q1', description: 'Implementing universal components', budget: '$20k' }, children: [] },
      ]},
      { label: 'Processes', type: 'process', score: 72, children: [
        { label: 'Infra & DevOps', type: 'process', score: 82, children: [
          { label: 'CI/CD Pipeline', type: 'process', score: 88, children: [] },
          { label: 'Cloud Costs', type: 'metric', score: 70, children: [] },
        ]},
        { label: 'Tech Debt Risk', type: 'risk', score: 62, children: [] },
      ]},
    ]),
  },
  {
    id: 'dept_product',
    label: 'Product',
    domain: 'direction',
    cluster: 'Direction',
    score: 91,
    metrics: { performance: 93, efficiency: 90, capacity: 85, alignment: 95, risk: 8 },
    internalNodes: buildTree('prd', [
      { label: 'Teams', type: 'team', score: 89, children: [
        { label: 'User Research', type: 'team', score: 89, memberCount: 4, members: genMembers(4, ['UX Researcher', 'Analyst']), children: [
          { label: 'Interview Ops', type: 'process', score: 87, children: [] },
          { label: 'Usability Tests', type: 'metric', score: 84, children: [] },
        ]},
      ]},
      { label: 'Projects', type: 'project', score: 90, children: [
        { label: 'Q3 Milestones', type: 'project', score: 91, projectDetails: { status: 'Planning', deadline: 'Q3', description: 'Key deliverables for Q3', budget: '$100k' }, children: [] },
        { label: 'Q4 Roadmap', type: 'project', score: 88, projectDetails: { status: 'Draft', deadline: 'Q4', description: 'Q4 strategic goals', budget: '$120k' }, children: [] },
      ]},
      { label: 'Processes', type: 'process', score: 93, children: [
        { label: 'Roadmap Planning', type: 'process', score: 94, children: [] },
        { label: 'Feature Prioritise', type: 'decision', score: 92, children: [] },
        { label: 'OKR Alignment', type: 'metric', score: 95, children: [] },
      ]},
    ]),
  },
  {
    id: 'dept_sales',
    label: 'Sales',
    domain: 'market',
    cluster: 'Market',
    score: 78,
    metrics: { performance: 80, efficiency: 74, capacity: 82, alignment: 76, risk: 22 },
    internalNodes: buildTree('sal', [
      { label: 'Teams', type: 'team', score: 79, children: [
        { label: 'Enterprise Sales', type: 'team', score: 83, memberCount: 3, members: genMembers(3, ['Account Executive', 'Sales Rep']), children: [
          { label: 'Account Execs', type: 'resource', score: 80, children: [] },
          { label: 'Deal Pipeline', type: 'process', score: 77, children: [] },
        ]},
        { label: 'SMB Sales', type: 'team', score: 75, memberCount: 5, members: genMembers(5, ['SMB Lead', 'SDR']), children: [
          { label: 'Inbound Leads', type: 'process', score: 78, children: [] },
          { label: 'Conversion Rate', type: 'metric', score: 69, children: [] },
        ]},
      ]},
      { label: 'Projects', type: 'project', score: 70, children: [
        { label: 'CRM Migration', type: 'project', score: 65, projectDetails: { status: 'In Progress', deadline: 'Q2', description: 'Migrating to Salesforce', budget: '$80k' }, children: [] },
      ]},
      { label: 'Processes', type: 'process', score: 60, children: [
        { label: 'CRM Hygiene', type: 'process', score: 65, children: [] },
        { label: 'Churn Risk', type: 'risk', score: 55, children: [] },
      ]},
    ]),
  },
  {
    id: 'dept_marketing',
    label: 'Marketing',
    domain: 'market',
    cluster: 'Market',
    score: 72,
    metrics: { performance: 75, efficiency: 68, capacity: 74, alignment: 72, risk: 26 },
    internalNodes: buildTree('mkt', [
      { label: 'Teams', type: 'team', score: 78, children: [
        { label: 'Brand & Content', type: 'team', score: 80, memberCount: 4, members: genMembers(4, ['Content Marketer', 'SEO Specialist']), children: [
          { label: 'Blog & SEO', type: 'process', score: 78, children: [] },
          { label: 'Social Media', type: 'process', score: 70, children: [] },
        ]},
      ]},
      { label: 'Projects', type: 'project', score: 68, children: [
        { label: 'Summer Campaign', type: 'project', score: 65, projectDetails: { status: 'Active', deadline: 'Aug', description: 'Summer promotional ads', budget: '$200k' }, children: [] },
      ]},
      { label: 'Processes', type: 'process', score: 65, children: [
        { label: 'Growth & Demand', type: 'process', score: 68, children: [
          { label: 'Paid Ads', type: 'resource', score: 62, children: [] },
          { label: 'CAC Metric', type: 'metric', score: 65, children: [] },
        ]},
        { label: 'Campaign Budget', type: 'risk', score: 58, children: [] },
      ]},
    ]),
  },
  {
    id: 'dept_hr',
    label: 'People & HR',
    domain: 'people',
    cluster: 'People',
    score: 84,
    metrics: { performance: 86, efficiency: 82, capacity: 80, alignment: 88, risk: 12 },
    internalNodes: buildTree('hr', [
      { label: 'Teams', type: 'team', score: 85, children: [
        { label: 'Recruitment Team', type: 'team', score: 88, memberCount: 3, members: genMembers(3, ['Recruiter', 'Sourcer']), children: [
          { label: 'Talent Acquisition', type: 'process', score: 88, children: [
            { label: 'Interview Process', type: 'process', score: 85, children: [] },
            { label: 'Offer Pipeline', type: 'metric', score: 82, children: [] },
          ]},
        ]},
      ]},
      { label: 'Projects', type: 'project', score: 84, children: [
        { label: 'L&D Programs', type: 'project', score: 84, projectDetails: { status: 'Planning', deadline: 'Q4', description: 'Learning and development rollouts', budget: '$40k' }, children: [
          { label: 'Onboarding', type: 'process', score: 90, children: [] },
          { label: 'Skills Matrix', type: 'resource', score: 78, children: [] },
        ]},
      ]},
      { label: 'Processes', type: 'process', score: 76, children: [
        { label: 'Employee NPS', type: 'metric', score: 80, children: [] },
        { label: 'Attrition Risk', type: 'risk', score: 72, children: [] },
      ]},
    ]),
  },
  {
    id: 'dept_finance',
    label: 'Finance',
    domain: 'control',
    cluster: 'Control',
    score: 93,
    metrics: { performance: 95, efficiency: 92, capacity: 90, alignment: 94, risk: 6 },
    internalNodes: buildTree('fin', [
      { label: 'Teams', type: 'team', score: 93, children: [
        { label: 'FP&A Team', type: 'team', score: 96, memberCount: 4, members: genMembers(4, ['Financial Analyst', 'Controller']), children: [
          { label: 'FP&A', type: 'process', score: 96, children: [
            { label: 'P&L Reporting', type: 'metric', score: 94, children: [] },
            { label: 'Budget Tracking', type: 'process', score: 92, children: [] },
          ]},
        ]},
      ]},
      { label: 'Projects', type: 'project', score: 90, children: [
        { label: 'Audit 2026', type: 'project', score: 88, projectDetails: { status: 'Preparation', deadline: 'Dec', description: 'Annual financial audit', budget: '$10k' }, children: [] },
      ]},
      { label: 'Processes', type: 'process', score: 88, children: [
        { label: 'Treasury Ops', type: 'resource', score: 90, children: [
          { label: 'Cash Flow Mgmt', type: 'metric', score: 93, children: [] },
          { label: 'FX Hedging', type: 'decision', score: 88, children: [] },
        ]},
        { label: 'Audit Readiness', type: 'process', score: 91, children: [] },
        { label: 'Compliance Risk', type: 'risk', score: 85, children: [] },
      ]},
    ]),
  },
  {
    id: 'dept_operations',
    label: 'Operations',
    domain: 'delivery',
    cluster: 'Delivery',
    score: 61,
    metrics: { performance: 63, efficiency: 58, capacity: 65, alignment: 60, risk: 38 },
    internalNodes: buildTree('ops', [
      { label: 'Teams', type: 'team', score: 61, children: [
        { label: 'Logistics Team', type: 'team', score: 62, memberCount: 7, members: genMembers(7, ['Ops Manager', 'Coordinator']), children: [
          { label: 'Logistics', type: 'process', score: 62, children: [
            { label: 'Last-Mile Ops', type: 'process', score: 57, children: [] },
            { label: 'Delivery SLA', type: 'metric', score: 60, children: [] },
          ]},
        ]},
      ]},
      { label: 'Projects', type: 'project', score: 55, children: [
        { label: 'Warehouse Exp', type: 'project', score: 50, projectDetails: { status: 'Delayed', deadline: 'Q4', description: 'Warehouse expansion', budget: '$1M' }, children: [] },
      ]},
      { label: 'Processes', type: 'process', score: 52, children: [
        { label: 'Supply Chain', type: 'process', score: 60, children: [
          { label: 'Vendor Mgmt', type: 'resource', score: 58, children: [] },
          { label: 'Lead Times', type: 'metric', score: 55, children: [] },
        ]},
        { label: 'Bottleneck Risk', type: 'risk', score: 45, children: [] },
      ]},
    ]),
  },
  {
    id: 'dept_data',
    label: 'Data & Analytics',
    domain: 'build',
    cluster: 'Build',
    score: 76,
    metrics: { performance: 78, efficiency: 74, capacity: 72, alignment: 79, risk: 20 },
    internalNodes: buildTree('dat', [
      { label: 'Teams', type: 'team', score: 77, children: [
        { label: 'Data Engineering', type: 'team', score: 80, memberCount: 5, members: genMembers(5, ['Data Engineer', 'Architect']), children: [
          { label: 'Data Pipelines', type: 'process', score: 77, children: [] },
          { label: 'Warehouse Mgmt', type: 'resource', score: 74, children: [] },
        ]},
        { label: 'BI & Reporting', type: 'team', score: 75, memberCount: 3, members: genMembers(3, ['BI Analyst', 'Scientist']), children: [
          { label: 'Data Quality', type: 'metric', score: 68, children: [] },
        ]},
      ]},
      { label: 'Projects', type: 'project', score: 75, children: [
        { label: 'Dashboard Suite', type: 'project', score: 78, projectDetails: { status: 'Active', deadline: 'Q3', description: 'Exec dashboard suite', budget: '$30k' }, children: [] },
        { label: 'ML Platform', type: 'project', score: 72, projectDetails: { status: 'Planning', deadline: '2027', description: 'Predictive analytics platform', budget: '$150k' }, children: [] },
      ]},
      { label: 'Processes', type: 'process', score: 65, children: [
        { label: 'Data Governance', type: 'process', score: 65, children: [] },
      ]},
    ]),
  },
  {
    id: 'dept_design',
    label: 'Design',
    domain: 'build',
    cluster: 'Build',
    score: 88,
    metrics: { performance: 91, efficiency: 87, capacity: 83, alignment: 90, risk: 10 },
    internalNodes: buildTree('des', [
      { label: 'Teams', type: 'team', score: 88, children: [
        { label: 'UX Research', type: 'team', score: 90, memberCount: 3, members: genMembers(3, ['UX Researcher']), children: [
          { label: 'Heuristic Review', type: 'process', score: 88, children: [] },
        ]},
        { label: 'Visual Design', type: 'team', score: 87, memberCount: 4, members: genMembers(4, ['UI Designer', 'Motion Designer']), children: [
          { label: 'Brand System', type: 'resource', score: 92, children: [] },
        ]},
      ]},
      { label: 'Projects', type: 'project', score: 85, children: [
        { label: 'Prototype Tests', type: 'project', score: 85, projectDetails: { status: 'Active', deadline: 'Next Month', description: 'App V2 Prototyping', budget: '$5k' }, children: [] },
        { label: 'Icon Library', type: 'project', score: 84, projectDetails: { status: 'Completed', deadline: 'Q1', description: 'New custom icon set', budget: '$10k' }, children: [] },
      ]},
      { label: 'Processes', type: 'process', score: 85, children: [
        { label: 'Design Ops', type: 'process', score: 85, children: [] },
      ]},
    ]),
  },
  {
    id: 'dept_security',
    label: 'Security',
    domain: 'control',
    cluster: 'Control',
    score: 69,
    metrics: { performance: 71, efficiency: 65, capacity: 68, alignment: 73, risk: 32 },
    internalNodes: buildTree('sec', [
      { label: 'Teams', type: 'team', score: 75, children: [
        { label: 'Cloud Security', type: 'team', score: 78, memberCount: 4, members: genMembers(4, ['Security Engineer', 'Analyst']), children: [
          { label: 'Endpoint Protection', type: 'resource', score: 82, children: [] },
        ]},
      ]},
      { label: 'Projects', type: 'project', score: 68, children: [
        { label: 'Pen Test Cycle', type: 'project', score: 68, projectDetails: { status: 'In Progress', deadline: 'Q3', description: 'Annual penetration test', budget: '$40k' }, children: [] },
        { label: 'Zero Trust Net', type: 'project', score: 65, projectDetails: { status: 'Planning', deadline: 'Q4', description: 'Zero trust architecture rollout', budget: '$200k' }, children: [] },
        { label: 'Phishing Training', type: 'project', score: 70, projectDetails: { status: 'Active', deadline: 'Ongoing', description: 'Employee phishing sim', budget: '$15k' }, children: [] },
      ]},
      { label: 'Processes', type: 'process', score: 68, children: [
        { label: 'AppSec', type: 'process', score: 73, children: [
          { label: 'SAST / DAST', type: 'process', score: 70, children: [] },
        ]},
        { label: 'Infra Security', type: 'process', score: 68, children: [
          { label: 'IAM Policy', type: 'resource', score: 72, children: [] },
        ]},
        { label: 'Incident Response', type: 'process', score: 62, children: [] },
        { label: 'Compliance Gap', type: 'risk', score: 55, children: [] },
        { label: 'Threat Intel', type: 'process', score: 75, children: [] },
        { label: 'Data Privacy', type: 'process', score: 85, children: [] },
        { label: 'Vulnerability Mgmt', type: 'process', score: 66, children: [] },
        { label: 'Access Control', type: 'decision', score: 88, children: [] },
        { label: 'Security Audits', type: 'metric', score: 80, children: [] },
        { label: 'Vendor Risk', type: 'risk', score: 55, children: [] },
        { label: 'Disaster Recovery', type: 'process', score: 64, children: [] },
      ]},
    ]),
  },
  {
    id: 'dept_customer_success',
    label: 'Customer Success',
    domain: 'delivery',
    cluster: 'Delivery',
    score: 82,
    metrics: { performance: 84, efficiency: 80, capacity: 85, alignment: 83, risk: 15 },
    internalNodes: buildTree('cs', [
      { label: 'Teams', type: 'team', score: 80, children: [
        { label: 'Support Ops', type: 'team', score: 80, memberCount: 8, members: genMembers(8, ['Support Agent', 'CSM']), children: [
          { label: 'Ticket Triage', type: 'process', score: 78, children: [] },
          { label: 'CSAT Metric', type: 'metric', score: 83, children: [] },
        ]},
      ]},
      { label: 'Projects', type: 'project', score: 85, children: [
        { label: 'Self-Serve Portal', type: 'project', score: 82, projectDetails: { status: 'Active', deadline: 'Q3', description: 'Customer self-service portal', budget: '$50k' }, children: [] },
      ]},
      { label: 'Processes', type: 'process', score: 80, children: [
        { label: 'Onboarding', type: 'process', score: 88, children: [
          { label: 'Health Scoring', type: 'metric', score: 85, children: [] },
          { label: 'Kickoff Playbook', type: 'process', score: 82, children: [] },
        ]},
        { label: 'Renewal Pipeline', type: 'process', score: 79, children: [] },
        { label: 'Escalation Risk', type: 'risk', score: 65, children: [] },
      ]},
    ]),
  },
  {
    id: 'dept_legal',
    label: 'Legal & Compliance',
    domain: 'control',
    cluster: 'Control',
    score: 89,
    metrics: { performance: 91, efficiency: 88, capacity: 86, alignment: 92, risk: 9 },
    internalNodes: buildTree('leg', [
      { label: 'Teams', type: 'team', score: 90, children: [
        { label: 'Compliance Team', type: 'team', score: 92, memberCount: 3, members: genMembers(3, ['Legal Counsel', 'Compliance Officer']), children: [] },
      ]},
      { label: 'Projects', type: 'project', score: 86, children: [
        { label: 'Data Mapping', type: 'project', score: 86, projectDetails: { status: 'Planning', deadline: 'Q4', description: 'Enterprise data mapping for privacy', budget: '$60k' }, children: [] },
      ]},
      { label: 'Processes', type: 'process', score: 88, children: [
        { label: 'Contract Mgmt', type: 'process', score: 92, children: [
          { label: 'NDA Workflow', type: 'process', score: 90, children: [] },
          { label: 'SaaS Agreements', type: 'resource', score: 88, children: [] },
        ]},
        { label: 'GDPR & Privacy', type: 'process', score: 88, children: [
          { label: 'DPA Reviews', type: 'process', score: 85, children: [] },
        ]},
        { label: 'IP Management', type: 'resource', score: 87, children: [] },
        { label: 'Regulatory Risk', type: 'risk', score: 78, children: [] },
      ]},
    ]),
  },
  {
    id: 'dept_strategy',
    label: 'Strategy',
    domain: 'direction',
    cluster: 'Direction',
    score: 95,
    metrics: { performance: 97, efficiency: 94, capacity: 92, alignment: 98, risk: 4 },
    internalNodes: buildTree('str', [
      { label: 'Teams', type: 'team', score: 95, children: [
        { label: 'Strategy Team', type: 'team', score: 96, memberCount: 4, members: genMembers(4, ['Strategist', 'Analyst']), children: [] },
      ]},
      { label: 'Projects', type: 'project', score: 91, children: [
        { label: 'M&A Pipeline', type: 'project', score: 91, projectDetails: { status: 'Active', deadline: 'Ongoing', description: 'Mergers and acquisitions tracking', budget: 'Undisclosed' }, children: [] },
      ]},
      { label: 'Processes', type: 'process', score: 94, children: [
        { label: 'Corporate OKRs', type: 'metric', score: 98, children: [
          { label: 'Goal Cascades', type: 'process', score: 96, children: [] },
          { label: 'KR Tracking', type: 'metric', score: 94, children: [] },
        ]},
        { label: 'Market Intelligence', type: 'process', score: 93, children: [
          { label: 'Competitor Intel', type: 'resource', score: 90, children: [] },
          { label: 'TAM Analysis', type: 'metric', score: 92, children: [] },
        ]},
        { label: 'Strategic Risk Reg', type: 'risk', score: 88, children: [] },
      ]},
    ]),
  },
];

const ACTIVE_DEPT_COUNT = DEPARTMENTS.length;
const { totalNodes, inactiveCount } = resolvePolytopeNodeCount(ACTIVE_DEPT_COUNT);

const inactiveNodes: UExternalNode[] = Array.from({ length: inactiveCount }).map((_, i) => ({
  id: `node_inactive_${i}`,
  label: `Node ${i + 1}`,
  domain: 'inactive' as UDomain,
  cluster: 'None',
  score: 0,
  metrics: { performance: 0, efficiency: 0, capacity: 0, alignment: 0, risk: 0 },
  internalNodes: [],
}));

export const U_NODES: UExternalNode[] = (() => {
  const result: UExternalNode[] = [];
  let ai = 0;
  let ii = 0;
  const ratio = inactiveCount / ACTIVE_DEPT_COUNT;
  let inactiveAcc = 0;
  for (let total = 0; total < totalNodes; total++) {
    inactiveAcc += ratio;
    if (ii < inactiveCount && inactiveAcc >= 1) {
      result.push(inactiveNodes[ii++]);
      inactiveAcc -= 1;
    } else if (ai < ACTIVE_DEPT_COUNT) {
      result.push(DEPARTMENTS[ai++]);
    } else {
      result.push(inactiveNodes[ii++]);
    }
  }
  return result;
})();
