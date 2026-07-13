/**
 * Industry OS — user-specific company planet root systems.
 * Galaxy → Star → Planet → Roots → Branches → Action nodes
 */

import type { UDomain, UExternalNode, UInternalNode } from '../lib/universalPolytopeData';
import { resolvePolytopeNodeCount } from '../lib/universalPolytopeData';
import type { CompanyTag } from '../lib/useSavedWorkflows';
import type { PersistedPlanetState } from '../lib/universeNavPersistence';

export type UserPlanetRole = 'career' | 'founder' | 'vc' | 'investor';

/** Inner branch node types — see Industry OS Inner Branch & Action Node Framework §3.3 */
export type PlanetBranchNodeType =
  | 'information'
  | 'metric'
  | 'signal'
  | 'relationship'
  | 'evidence'
  | 'decision';

export interface PlanetCitation {
  id?: string;
  url: string;
  title?: string | null;
  snippet?: string | null;
  retrievedAt?: string | null;
}

export interface PlanetActionNode {
  id: string;
  label: string;
  summary?: string | null;
  hint?: string | null;
  confidence?: number;
  nextSteps?: string[];
  sources?: PlanetCitation[];
  // Action execution fields (data model only — no execution engine yet)
  owner?: string | null;
  status?: 'suggested' | 'planned' | 'active' | 'done' | null;
  dueDate?: string | null;
  output?: string | null;
  impactScore?: 'low' | 'medium' | 'high' | null;
}

export interface PlanetBranchNode {
  id: string;
  label: string;
  nodeType: PlanetBranchNodeType;
  actions: PlanetActionNode[];
  summary?: string | null;
  relevance?: number;
  confidence?: number;
  sources?: PlanetCitation[];
  isDynamic?: boolean;
}

interface PlanetBranchTemplate {
  label: string;
  nodeType: PlanetBranchNodeType;
  actions: Omit<PlanetActionNode, 'id'>[];
}

export interface PlanetRootNode {
  id: string;
  label: string;
  description: string;
  relevance: number;
  color: string;
  branches: PlanetBranchNode[];
  confidence?: number;
  sources?: PlanetCitation[];
  isDynamic?: boolean;
}

export interface ReferenceCompanyJob {
  id: string;
  kind: 'generate' | 'refresh' | 'classify';
  status: 'pending' | 'running' | 'complete' | 'failed';
  lastError?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
}

export interface CompanyPlanetContext {
  companyId: string;
  companyName: string;
  role: UserPlanetRole;
  roleLabel: string;
  roots: PlanetRootNode[];
  // Reference company fields
  referenceCompanyId?: string;
  status?: 'pending' | 'running' | 'ready' | 'failed';
  lastError?: string | null;
  sourceUrl?: string | null;
  canonicalUrl?: string | null;
  generatedAt?: string | null;
  job?: ReferenceCompanyJob | null;
  // Classification + scoring
  classification?: 'competitor' | 'customer' | 'collaborator' | null;
  scores?: {
    threatScore?: number;
    customerPriority?: number;
    partnerPotential?: number;
  };
  classifyJob?: ReferenceCompanyJob | null;
  // Research prompt state — set when this is a live company with no reference twin yet
  needsResearch?: boolean;
  subdomainId?: string;
  companyWebsite?: string | null;
}

export interface PlanetTreeNode {
  id: string;
  label: string;
  domain?: string;
  relevance?: number;
  children?: PlanetTreeNode[];
}

const ROLE_LABELS: Record<UserPlanetRole, string> = {
  career: 'Career User',
  founder: 'Founder',
  vc: 'VC Partner',
  investor: 'Investor',
};

type PlanetRootTemplate = Omit<PlanetRootNode, 'id' | 'branches'> & {
  branches: PlanetBranchTemplate[];
};

// 6 fixed roots — always generated for every company planet
const FIXED_ROOTS_TEMPLATE: PlanetRootTemplate[] = [
  {
    label: 'Identity',
    description: 'Name, stage, size, HQ, founding year, website',
    relevance: 100,
    color: '#60a5fa',
    branches: [
      {
        label: 'Company Profile',
        nodeType: 'information',
        actions: [{ label: 'Verify company profile', hint: 'Confirm name, HQ, website, and entity status' }],
      },
      {
        label: 'Stage & Maturity',
        nodeType: 'metric',
        actions: [{ label: 'Set stage alert', hint: 'Notify when stage or size changes' }],
      },
      {
        label: 'Category Tags',
        nodeType: 'information',
        actions: [{ label: 'Tag or re-tag company', hint: 'Industry, model, geography, and segment tags' }],
      },
      {
        label: 'Relationship Classification',
        nodeType: 'decision',
        actions: [{ label: 'Assign classification', hint: 'Competitor, client, partner, or other lens' }],
      },
    ],
  },
  {
    label: 'Product & Tech',
    description: 'Core offering, differentiators, tech stack, APIs',
    relevance: 95,
    color: '#a78bfa',
    branches: [
      {
        label: 'Core Offering Map',
        nodeType: 'information',
        actions: [{ label: 'Capture differentiators', hint: 'What appears unique vs alternatives' }],
      },
      {
        label: 'Tech Stack',
        nodeType: 'evidence',
        actions: [{ label: 'Request technical docs', hint: 'Stack, APIs, and platform dependencies' }],
      },
      {
        label: 'API / Integration Surface',
        nodeType: 'metric',
        actions: [{ label: 'Run integration assessment', hint: 'APIs, auth methods, and data formats' }],
      },
      {
        label: 'Roadmap Signals',
        nodeType: 'signal',
        actions: [{ label: 'Add roadmap alert', hint: 'Releases, hiring roles, and product announcements' }],
      },
    ],
  },
  {
    label: 'Market Position',
    description: 'ICP, GTM motion, pricing model, geography',
    relevance: 90,
    color: '#34d399',
    branches: [
      {
        label: 'ICP Definition',
        nodeType: 'metric',
        actions: [{ label: 'Map ICP against ours', hint: 'Segment, size, buyer persona overlap' }],
      },
      {
        label: 'GTM Motion',
        nodeType: 'metric',
        actions: [{ label: 'Compare GTM motion', hint: 'Self-serve vs sales-led vs partner-led' }],
      },
      {
        label: 'Pricing Model',
        nodeType: 'metric',
        actions: [{ label: 'Create pricing benchmark', hint: 'Tiers, packaging, and discount patterns' }],
      },
      {
        label: 'Positioning Statement',
        nodeType: 'information',
        actions: [{ label: 'Add positioning note', hint: 'How they describe category and value' }],
      },
    ],
  },
  {
    label: 'Commercial Signals',
    description: 'Funding, revenue range, hiring velocity',
    relevance: 85,
    color: '#fbbf24',
    branches: [
      {
        label: 'Funding Signals',
        nodeType: 'signal',
        actions: [{ label: 'Add funding alert', hint: 'Rounds, investors, and capital events' }],
      },
      {
        label: 'Hiring Velocity',
        nodeType: 'signal',
        actions: [{ label: 'Track hiring spike', hint: 'Open roles and headcount growth' }],
      },
      {
        label: 'Press / News Signals',
        nodeType: 'evidence',
        actions: [{ label: 'Create market update note', hint: 'Launches, media, and regulatory events' }],
      },
      {
        label: 'Partnership Signals',
        nodeType: 'signal',
        actions: [{ label: 'Investigate partner route', hint: 'Integrations, co-sell, and channel deals' }],
      },
    ],
  },
  {
    label: 'People & Access',
    description: 'Founders, key contacts, warm intro paths',
    relevance: 80,
    color: '#f472b6',
    branches: [
      {
        label: 'Founders / Leadership',
        nodeType: 'relationship',
        actions: [{ label: 'Research leader', hint: 'Founders, CEO, and CXOs' }],
      },
      {
        label: 'Warm Intro Paths',
        nodeType: 'relationship',
        actions: [{ label: 'Request intro', hint: 'Shared investors, alumni, or customers' }],
      },
      {
        label: 'Influence Map',
        nodeType: 'relationship',
        actions: [{ label: 'Map stakeholder', hint: 'Who influences budget and adoption' }],
      },
      {
        label: 'Owner / Cadence',
        nodeType: 'relationship',
        actions: [{ label: 'Assign relationship owner', hint: 'Internal owner and check-in rhythm' }],
      },
    ],
  },
  {
    label: 'Engagement History',
    description: 'Past interactions, deal stage, notes, next action',
    relevance: 75,
    color: '#22d3ee',
    branches: [
      {
        label: 'Interaction Timeline',
        nodeType: 'evidence',
        actions: [{ label: 'Log interaction', hint: 'Calls, meetings, emails, and events' }],
      },
      {
        label: 'Deal / Relationship Stage',
        nodeType: 'decision',
        actions: [{ label: 'Move stage', hint: 'Lead, qualified, proposal, closed, or paused' }],
      },
      {
        label: 'Next Action',
        nodeType: 'decision',
        actions: [{ label: 'Set next action', hint: 'Specific step, owner, and due date' }],
      },
      {
        label: 'Follow-up Cadence',
        nodeType: 'metric',
        actions: [{ label: 'Schedule follow-up', hint: 'Next touch date and sequence' }],
      },
    ],
  },
];

/** Classification-specific dynamic root templates — placeholder nodes for non-research state. */
const DYNAMIC_NODES: Record<string, PlanetRootTemplate> = {
  'ICP Overlap': {
    label: 'ICP Overlap',
    description: 'Customer segment overlap between you and them',
    relevance: 90,
    color: '#f87171',
    branches: [
      {
        label: 'Shared Segment',
        nodeType: 'metric',
        actions: [{ label: 'Map ICP overlap', hint: 'Segment, size, and vertical match' }],
      },
      {
        label: 'Buyer Persona Overlap',
        nodeType: 'metric',
        actions: [{ label: 'Compare buyer personas', hint: 'Title, role, and pain point alignment' }],
      },
      {
        label: 'Geo Overlap',
        nodeType: 'metric',
        actions: [{ label: 'Identify geo overlap', hint: 'Markets where you both operate' }],
      },
      {
        label: 'Displacement Risk',
        nodeType: 'decision',
        actions: [{ label: 'Assess displacement risk', hint: 'Likelihood of deal collision' }],
      },
    ],
  },
  'Product Delta': {
    label: 'Product Delta',
    description: 'Feature gaps between you and them',
    relevance: 88,
    color: '#fb923c',
    branches: [
      {
        label: 'Feature Comparison',
        nodeType: 'metric',
        actions: [{ label: 'Create battlecard', hint: 'Feature-by-feature comparison' }],
      },
      {
        label: 'Pricing Delta',
        nodeType: 'metric',
        actions: [{ label: 'Build pricing benchmark', hint: 'Packaging, discounting, and terms' }],
      },
      {
        label: 'Differentiation Narrative',
        nodeType: 'decision',
        actions: [{ label: 'Draft differentiation copy', hint: 'Why your product wins' }],
      },
      {
        label: 'Roadmap Implication',
        nodeType: 'decision',
        actions: [{ label: 'Create roadmap item', hint: 'Build, ignore, or reposition' }],
      },
    ],
  },
  'GTM & Win/Loss': {
    label: 'GTM & Win/Loss',
    description: 'Where you\'ve met in deals, who won, why',
    relevance: 85,
    color: '#facc15',
    branches: [
      {
        label: 'Deal Collision Log',
        nodeType: 'evidence',
        actions: [{ label: 'Log competitor deal', hint: 'Deals where both companies appeared' }],
      },
      {
        label: 'Win Reasons',
        nodeType: 'evidence',
        actions: [{ label: 'Add win insight', hint: 'Why you won — add to playbook' }],
      },
      {
        label: 'Loss Reasons',
        nodeType: 'evidence',
        actions: [{ label: 'Create loss review', hint: 'Why you lost and what to fix' }],
      },
      {
        label: 'Messaging Gap',
        nodeType: 'decision',
        actions: [{ label: 'Revise pitch deck', hint: 'Where their story is clearer' }],
      },
    ],
  },
  'Velocity & Threat': {
    label: 'Velocity & Threat',
    description: 'Headcount growth, funding pace, and threat level',
    relevance: 78,
    color: '#ef4444',
    branches: [
      {
        label: 'Headcount Growth',
        nodeType: 'signal',
        actions: [{ label: 'Add hiring alert', hint: 'Hiring pace by role and function' }],
      },
      {
        label: 'Funding Velocity',
        nodeType: 'signal',
        actions: [{ label: 'Update threat score', hint: 'Recent funding and investor strength' }],
      },
      {
        label: 'Product Release Velocity',
        nodeType: 'signal',
        actions: [{ label: 'Create release watch', hint: 'Launch frequency and roadmap clues' }],
      },
      {
        label: 'Threat Escalation',
        nodeType: 'decision',
        actions: [{ label: 'Schedule strategy review', hint: 'Escalate to leadership if needed' }],
      },
    ],
  },
  'ICP Fit': {
    label: 'ICP Fit',
    description: 'How well this company matches your ideal customer profile',
    relevance: 90,
    color: '#4ade80',
    branches: [
      {
        label: 'Segment Fit Score',
        nodeType: 'metric',
        actions: [{ label: 'Score ICP fit', hint: 'Quantify segment, size, and vertical match' }],
      },
      {
        label: 'Persona Alignment',
        nodeType: 'metric',
        actions: [{ label: 'Map buyer persona', hint: 'Titles, pain points, and decision authority' }],
      },
      {
        label: 'Use Case Match',
        nodeType: 'evidence',
        actions: [{ label: 'Document use case', hint: 'Where your product solves their problem' }],
      },
      {
        label: 'Qualification Decision',
        nodeType: 'decision',
        actions: [{ label: 'Set qualification status', hint: 'Move to qualified or disqualify' }],
      },
    ],
  },
  'Buyer Map': {
    label: 'Buyer Map',
    description: 'Economic buyer, champion, blocker',
    relevance: 88,
    color: '#38bdf8',
    branches: [
      {
        label: 'Economic Buyer',
        nodeType: 'relationship',
        actions: [{ label: 'Identify economic buyer', hint: 'Budget owner and final approver' }],
      },
      {
        label: 'Champion',
        nodeType: 'relationship',
        actions: [{ label: 'Activate champion', hint: 'Internal supporter for your solution' }],
      },
      {
        label: 'Blocker',
        nodeType: 'relationship',
        actions: [{ label: 'Prepare blocker strategy', hint: 'Stakeholder likely to resist' }],
      },
      {
        label: 'Stakeholder Map',
        nodeType: 'decision',
        actions: [{ label: 'Build stakeholder map', hint: 'Influence and decision path' }],
      },
    ],
  },
  'Pain & Trigger': {
    label: 'Pain & Trigger',
    description: 'Specific pain, buying window trigger',
    relevance: 85,
    color: '#a78bfa',
    branches: [
      {
        label: 'Pain Hypothesis',
        nodeType: 'decision',
        actions: [{ label: 'Write pain hypothesis', hint: 'Initial assumption about their pain' }],
      },
      {
        label: 'Validated Pain',
        nodeType: 'evidence',
        actions: [{ label: 'Run discovery call', hint: 'Evidence from calls, data, or usage' }],
      },
      {
        label: 'Trigger Event',
        nodeType: 'signal',
        actions: [{ label: 'Add trigger alert', hint: 'Funding, expansion, renewal, or compliance' }],
      },
      {
        label: 'Urgency Level',
        nodeType: 'metric',
        actions: [{ label: 'Create urgency follow-up', hint: 'Low, medium, high, or immediate' }],
      },
    ],
  },
  'Deal Urgency': {
    label: 'Deal Urgency',
    description: 'Current tooling, integration fit, and buying window',
    relevance: 78,
    color: '#34d399',
    branches: [
      {
        label: 'Current Tools',
        nodeType: 'information',
        actions: [{ label: 'Map current stack', hint: 'Software, platforms, and manual tools' }],
      },
      {
        label: 'Integration Requirements',
        nodeType: 'metric',
        actions: [{ label: 'Request technical requirements', hint: 'APIs, auth, security, compliance' }],
      },
      {
        label: 'Buying Window',
        nodeType: 'signal',
        actions: [{ label: 'Create deal timeline', hint: 'When they are likely to decide' }],
      },
      {
        label: 'Next Step',
        nodeType: 'decision',
        actions: [{ label: 'Schedule next meeting', hint: 'Demo, proposal, or pilot discussion' }],
      },
    ],
  },
  'Complementary Capability': {
    label: 'Complementary Capability',
    description: 'Where their capability complements yours',
    relevance: 88,
    color: '#60a5fa',
    branches: [
      {
        label: 'Capability Gap',
        nodeType: 'metric',
        actions: [{ label: 'Map capability gap', hint: 'What they have that you lack' }],
      },
      {
        label: 'Customer Benefit',
        nodeType: 'information',
        actions: [{ label: 'Define joint value prop', hint: 'How customers benefit from the combination' }],
      },
      {
        label: 'Build vs Partner',
        nodeType: 'decision',
        actions: [{ label: 'Run build vs partner analysis', hint: 'Cost, time, and risk of building vs partnering' }],
      },
      {
        label: 'Joint Use Case',
        nodeType: 'evidence',
        actions: [{ label: 'Document joint use case', hint: 'End-to-end scenario combining both products' }],
      },
    ],
  },
  'Integration Fit': {
    label: 'Integration Fit',
    description: 'API compatibility, data model overlap',
    relevance: 88,
    color: '#818cf8',
    branches: [
      {
        label: 'API Compatibility',
        nodeType: 'metric',
        actions: [{ label: 'Request API docs', hint: 'APIs, webhooks, and SDK availability' }],
      },
      {
        label: 'Data Model Overlap',
        nodeType: 'metric',
        actions: [{ label: 'Map data model', hint: 'Object and field alignment' }],
      },
      {
        label: 'Workflow Fit',
        nodeType: 'decision',
        actions: [{ label: 'Draw workflow map', hint: 'How workflows connect end-to-end' }],
      },
      {
        label: 'POC Scope',
        nodeType: 'decision',
        actions: [{ label: 'Create integration POC', hint: 'Minimum proof to validate partnership' }],
      },
    ],
  },
  'Value Split': {
    label: 'Value Split',
    description: 'Rev share, referral, white-label model',
    relevance: 85,
    color: '#c084fc',
    branches: [
      {
        label: 'Revenue Model',
        nodeType: 'decision',
        actions: [{ label: 'Select partnership model', hint: 'Referral, rev share, reseller, or white-label' }],
      },
      {
        label: 'Customer Ownership',
        nodeType: 'decision',
        actions: [{ label: 'Define customer ownership', hint: 'Who owns relationship, billing, support' }],
      },
      {
        label: 'Commercial Terms',
        nodeType: 'decision',
        actions: [{ label: 'Draft term sheet', hint: 'Margins, exclusivity, and minimums' }],
      },
      {
        label: 'Partner Proposal',
        nodeType: 'decision',
        actions: [{ label: 'Send partnership proposal', hint: 'Concise offer to send to partner' }],
      },
    ],
  },
  'Conflict Risk': {
    label: 'Conflict Risk',
    description: 'Where partnership interests may diverge',
    relevance: 72,
    color: '#f472b6',
    branches: [
      {
        label: 'Overlap Zones',
        nodeType: 'signal',
        actions: [{ label: 'Map competitive overlap', hint: 'Areas where both companies compete directly' }],
      },
      {
        label: 'Future Trajectory',
        nodeType: 'signal',
        actions: [{ label: 'Assess roadmap conflict', hint: 'Where roadmaps may collide' }],
      },
      {
        label: 'IP Exposure',
        nodeType: 'decision',
        actions: [{ label: 'Review IP terms', hint: 'Data ownership, licensing, and exclusivity' }],
      },
      {
        label: 'Exit Clauses',
        nodeType: 'decision',
        actions: [{ label: 'Define exit conditions', hint: 'What triggers partnership dissolution' }],
      },
    ],
  },
};

/** Short labels for branch node types (side panel + 3D hints). */
export const PLANET_BRANCH_TYPE_LABELS: Record<PlanetBranchNodeType, string> = {
  information: 'Info',
  metric: 'Metric',
  signal: 'Signal',
  relationship: 'People',
  evidence: 'Evidence',
  decision: 'Decision',
};

// 4 dynamic roots per classification — shown after classify job completes
const DYNAMIC_SETS: Record<CompanyTag, string[]> = {
  competitor:   ['ICP Overlap', 'Product Delta', 'GTM & Win/Loss', 'Velocity & Threat'],
  customer:     ['ICP Fit', 'Buyer Map', 'Pain & Trigger', 'Deal Urgency'],
  collaborator: ['Complementary Capability', 'Integration Fit', 'Value Split', 'Conflict Risk'],
};

function expandTemplate(
  companyId: string,
  template: PlanetRootTemplate[],
  prefix: string,
): PlanetRootNode[] {
  return template.map((t, ri) => ({
    ...t,
    id: `${companyId}_${prefix}_root_${ri}`,
    branches: t.branches.map((b, bi) => ({
      id: `${companyId}_${prefix}_branch_${ri}_${bi}`,
      label: b.label,
      nodeType: b.nodeType,
      actions: b.actions.map((a, ai) => ({
        ...a,
        id: `${companyId}_${prefix}_action_${ri}_${bi}_${ai}`,
      })),
    })),
  }));
}

export function getRoleLabel(role: UserPlanetRole): string {
  return ROLE_LABELS[role];
}

export interface PlanetCoreDetails {
  companyId: string;
  companyName: string;
  role: UserPlanetRole;
  roleLabel: string;
  roleTag: string;
  headline: string;
  subline: string;
  metrics: { label: string; value: string }[];
  focusHint: string;
}

export function getPlanetCoreDetails(ctx: CompanyPlanetContext): PlanetCoreDetails {
  const rootCount = ctx.roots.length;
  const sorted = [...ctx.roots].sort((a, b) => b.relevance - a.relevance);
  const topRoot = sorted[0];
  const avgRel =
    rootCount > 0
      ? Math.round(ctx.roots.reduce((s, r) => s + r.relevance, 0) / rootCount)
      : 0;

  const base = {
    companyId: ctx.companyId,
    companyName: ctx.companyName,
    role: ctx.role,
    roleLabel: ctx.roleLabel,
  };

  const classification = ctx.classification;
  const classificationLabel =
    classification === 'competitor' ? 'Competitor'
    : classification === 'customer' ? 'Customer'
    : classification === 'collaborator' ? 'Collaborator'
    : 'Unclassified';

  const scoreMetric =
    classification === 'competitor' && ctx.scores?.threatScore != null
      ? { label: 'Threat score', value: `${ctx.scores.threatScore}%` }
    : classification === 'customer' && ctx.scores?.customerPriority != null
      ? { label: 'Customer priority', value: `${ctx.scores.customerPriority}%` }
    : classification === 'collaborator' && ctx.scores?.partnerPotential != null
      ? { label: 'Partner potential', value: `${ctx.scores.partnerPotential}%` }
    : { label: 'Avg relevance', value: `${avgRel}%` };

  return {
    ...base,
    roleTag: `${classificationLabel} lens`,
    headline: ctx.companyName,
    subline: classificationLabel,
    metrics: [
      { label: 'Root systems', value: String(rootCount) },
      { label: 'Top signal', value: topRoot?.label ?? '—' },
      scoreMetric,
    ],
    focusHint: 'Identity · Product · Market · Commercial · People · History',
  };
}

export function getPlanetRootsForCompany(
  companyId: string,
  companyName: string,
  role: UserPlanetRole,
): CompanyPlanetContext {
  const roots = expandTemplate(companyId, FIXED_ROOTS_TEMPLATE, role);
  return {
    companyId,
    companyName,
    role,
    roleLabel: ROLE_LABELS[role],
    roots,
  };
}

/** Return placeholder dynamic root nodes for the given classification (pre-research). */
export function getPlaceholderDynamicRoots(
  companyId: string,
  classification: CompanyTag,
  role: UserPlanetRole,
): PlanetRootNode[] {
  const keys = DYNAMIC_SETS[classification] ?? [];
  const templates = keys.map(key => DYNAMIC_NODES[key]).filter(Boolean);
  return expandTemplate(companyId, templates, `${role}_${classification}_dyn`).map(r => ({
    ...r,
    isDynamic: true,
  }));
}

export function getPlanetPathLabels(
  ctx: CompanyPlanetContext,
  rootId: string | null,
  internalPath: string[],
): { rootLabel?: string; internalPathLabels: string[] } {
  if (!rootId) return { internalPathLabels: [] };
  const root = ctx.roots.find(r => r.id === rootId);
  if (!root) return { internalPathLabels: [] };

  const internalPathLabels: string[] = [];
  if (internalPath.length >= 1) {
    const branch = root.branches.find(b => b.id === internalPath[0]);
    if (branch) {
      internalPathLabels.push(branch.label);
      if (internalPath.length >= 2) {
        const action = branch.actions.find(a => a.id === internalPath[1]);
        if (action) internalPathLabels.push(action.label);
      }
    }
  }

  return { rootLabel: root.label, internalPathLabels };
}

export function resolvePlanetRestoreTarget(
  ctx: CompanyPlanetContext,
  saved: Pick<
    PersistedPlanetState,
    'rootPolytopeDeptId' | 'rootPolytopeInternalPath' | 'rootLabel' | 'internalPathLabels'
  >,
): { rootId: string | null; internalPath: string[] } {
  let root =
    (saved.rootPolytopeDeptId
      ? ctx.roots.find(r => r.id === saved.rootPolytopeDeptId)
      : undefined)
    ?? (saved.rootLabel ? ctx.roots.find(r => r.label === saved.rootLabel) : undefined);

  if (!root) {
    return { rootId: null, internalPath: [] };
  }

  const savedPath = saved.rootPolytopeInternalPath ?? [];
  if (savedPath.length === 0) {
    return { rootId: root.id, internalPath: [] };
  }

  let branch = root.branches.find(b => b.id === savedPath[0]);
  const branchLabel = saved.internalPathLabels?.[0];
  if (!branch && branchLabel) {
    branch = root.branches.find(b => b.label === branchLabel);
  }
  if (!branch) {
    return { rootId: root.id, internalPath: [] };
  }

  if (savedPath.length < 2) {
    return { rootId: root.id, internalPath: [branch.id] };
  }

  let action = branch.actions.find(a => a.id === savedPath[1]);
  const actionLabel = saved.internalPathLabels?.[1];
  if (!action && actionLabel) {
    action = branch.actions.find(a => a.label === actionLabel);
  }

  return {
    rootId: root.id,
    internalPath: action ? [branch.id, action.id] : [branch.id],
  };
}

export function planetRootsToTree(roots: PlanetRootNode[]): PlanetTreeNode[] {
  return roots.map(root => ({
    id: root.id,
    label: root.label,
    domain: root.color,
    relevance: root.relevance,
    children: root.branches.map(branch => ({
      id: branch.id,
      label: branch.label,
      domain: root.color,
      children: branch.actions.map(action => ({
        id: action.id,
        label: action.label,
        domain: root.color,
        children: [],
      })),
    })),
  }));
}

export type PlanetExploreLevel = 'roots' | 'branches' | 'actions';

export function getExploreLevel(depth: number): PlanetExploreLevel {
  if (depth <= 0) return 'roots';
  if (depth === 1) return 'branches';
  return 'actions';
}

export interface Planet2DNode {
  id: string;
  label: string;
  color: string;
  relevance?: number;
  hint?: string;
  hasChildren: boolean;
}

export function getPlanetNodesAtPath(
  ctx: CompanyPlanetContext,
  path: string[],
): Planet2DNode[] {
  if (path.length === 0) {
    return [...ctx.roots]
      .sort((a, b) => b.relevance - a.relevance)
      .map(root => ({
        id: root.id,
        label: root.label,
        color: root.color,
        relevance: root.relevance,
        hint: root.description,
        hasChildren: root.branches.length > 0,
      }));
  }

  const root = ctx.roots.find(r => r.id === path[0]);
  if (!root) return [];

  if (path.length === 1) {
    return root.branches.map(branch => ({
      id: branch.id,
      label: branch.label,
      color: root.color,
      hasChildren: branch.actions.length > 0,
    }));
  }

  const branch = root.branches.find(b => b.id === path[1]);
  if (!branch) return [];

  return branch.actions.map(action => ({
    id: action.id,
    label: action.label,
    color: root.color,
    hint: action.hint ?? undefined,
    hasChildren: false,
  }));
}

export function canDrillInto(ctx: CompanyPlanetContext, path: string[], nodeId: string): boolean {
  const nodes = getPlanetNodesAtPath(ctx, path);
  const node = nodes.find(n => n.id === nodeId);
  return !!node?.hasChildren;
}

const ROOT_DOMAINS: UDomain[] = ['build', 'market', 'delivery', 'direction', 'people', 'control'];

function branchToInternalNode(branch: PlanetBranchNode, root: PlanetRootNode): UInternalNode {
  return {
    id: branch.id,
    label: branch.label,
    type: 'team',
    score: Math.min(98, root.relevance - 4),
    children: branch.actions.map(action => ({
      id: action.id,
      label: action.label,
      type: 'process' as const,
      score: Math.min(95, root.relevance - 8),
      children: [],
    })),
  };
}

export function rootsToPolytopeDepartments(roots: PlanetRootNode[]): UExternalNode[] {
  const active: UExternalNode[] = roots.map((root, i) => {
    const score = root.relevance;
    return {
      id: root.id,
      label: root.label,
      domain: ROOT_DOMAINS[i % ROOT_DOMAINS.length],
      color: root.color,
      cluster: 'Root',
      score,
      metrics: {
        performance: score,
        efficiency: Math.max(50, score - 6),
        capacity: Math.max(45, score - 10),
        alignment: Math.max(40, score - 12),
        risk: Math.max(8, 100 - score),
      },
      internalNodes: root.branches.map(b => branchToInternalNode(b, root)),
    };
  });

  const { inactiveCount } = resolvePolytopeNodeCount(active.length);
  const inactive: UExternalNode[] = Array.from({ length: inactiveCount }, (_, i) => ({
    id: `planet_inactive_${i}`,
    label: '',
    domain: 'inactive',
    cluster: '',
    score: 0,
    metrics: { performance: 0, efficiency: 0, capacity: 0, alignment: 0, risk: 0 },
    internalNodes: [],
  }));

  return [...active, ...inactive];
}
