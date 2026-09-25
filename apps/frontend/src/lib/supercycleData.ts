// ─────────────────────────────────────────────────────────────────────────────
// Revenue & Growth Supercycle — organisation variants
//
// Lives inside the BDT polytope's core: diving through the core arrives in the
// supercycle sphere. See components/supercycle/.
//
// The design rule from the spec is that the TOP level never changes shape —
// every organisation runs one Revenue & Growth loop with five department
// nodes. Only the labels, sub-nodes and sub-cycle stages differ by business
// model. That is why the six archetypes below are pure data against one
// geometry rather than six implementations: a user can compare two companies
// at the supercycle level precisely because the ring looks identical.
// ─────────────────────────────────────────────────────────────────────────────

/** Which business model an organisation's supercycle is configured for. */
export type SupercycleArchetypeId =
  | 'b2b_saas'
  | 'deep_tech'
  | 'd2c'
  | 'manufacturing'
  | 'consulting'
  | 'education';

/** One repeatable workflow a sub-node runs. Stages are ordered and form a loop. */
export type SubCycleVariant = {
  id: string;
  label: string;
  /** Ordered stages, e.g. Qualify → Discovery → Demo → Proposal → Close. */
  stages: string[];
};

/** A major responsibility inside a department node (e.g. Enterprise Sales). */
export type SubNode = {
  id: string;
  label: string;
};

/** One of the five department nodes riding the supercycle ring. */
export type SupercycleNode = {
  id: string;
  label: string;
  /** Ring colour. Kept per-node rather than per-archetype so the same
   *  function reads as the same colour across every business model. */
  color: string;
  subNodes: SubNode[];
  subCycle: SubCycleVariant;
};

export type SupercycleArchetype = {
  id: SupercycleArchetypeId;
  label: string;
  /** How this organisation actually makes money — shown when picking. */
  revenueModel: string;
  /** Exactly five: more than that and the ring stops being readable. */
  nodes: SupercycleNode[];
  /** Nodes the spec flags as optional for this model, offered under "+ Add node". */
  optionalNodes: string[];
};

export type SupercycleCycle = {
  id: string;
  name: string;
  color: string;
  departmentIds: string[];
  /** Optional sub-node memberships, scoped to the selected departments. */
  subNodeIds?: string[];
};

// Slot colours. Index 0-4 map to the five ring positions, so "the money slot"
// is always the same hue whichever archetype is loaded.
export const SUPERCYCLE_SLOT_COLORS = [
  '#4fa8ff', // product / solution / merchandising — what we make
  '#a855f7', // marketing — how we reach
  '#22c55e', // sales — how we win
  '#f0a83f', // finance — how we collect
  '#2dd4bf', // success — how we keep
];

const node = (
  slot: number,
  id: string,
  label: string,
  subNodes: string[],
  subCycleLabel: string,
  stages: string[],
): SupercycleNode => ({
  id,
  label,
  color: SUPERCYCLE_SLOT_COLORS[slot],
  subNodes: subNodes.map((s) => ({ id: `${id}_${s.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, label: s })),
  subCycle: { id: `${id}_cycle`, label: subCycleLabel, stages },
});

export const SUPERCYCLE_ARCHETYPES: Record<SupercycleArchetypeId, SupercycleArchetype> = {
  b2b_saas: {
    id: 'b2b_saas',
    label: 'B2B SaaS',
    revenueModel: 'Subscriptions, enterprise contracts and recurring renewals',
    optionalNodes: ['Partnerships'],
    nodes: [
      node(0, 'product', 'Product', ['Core product', 'Growth features'], 'Feature-led growth',
        ['Feedback', 'Prioritise', 'Build', 'Release', 'Measure']),
      node(1, 'marketing', 'Marketing', ['ABM', 'Performance', 'Content'], 'Demand generation',
        ['Segment', 'Campaign', 'Engage', 'Capture', 'Nurture']),
      node(2, 'sales', 'Sales', ['Enterprise', 'SMB', 'Channel'], 'Enterprise sales',
        ['Qualify', 'Discovery', 'Demo', 'Proposal', 'Negotiate', 'Close']),
      node(3, 'finance', 'Finance', ['Pricing', 'Billing', 'Collections'], 'Subscription billing',
        ['Price', 'Contract', 'Invoice', 'Collect', 'Recognise']),
      node(4, 'success', 'Customer Success', ['Onboarding', 'Adoption', 'Renewal'], 'High-touch SaaS success',
        ['Onboard', 'Adopt', 'Monitor', 'Support', 'Renew', 'Expand']),
    ],
  },

  deep_tech: {
    id: 'deep_tech',
    label: 'Deep-Tech / Government',
    revenueModel: 'Institutional sales, tenders, milestone payments, long implementation cycles',
    optionalNodes: ['Partnerships', 'Government Relations', 'Legal'],
    nodes: [
      node(0, 'solution', 'Solution', ['Solution design', 'Technical presales'], 'Solution engineering',
        ['Need', 'Design', 'Pilot', 'Validate', 'Customise']),
      node(1, 'inst_marketing', 'Institutional Mktg', ['Thought leadership', 'Events', 'Outreach'], 'Institutional demand',
        ['Target', 'Educate', 'Demonstrate', 'Engage', 'Qualify']),
      node(2, 'sales', 'Sales', ['Government', 'Institutional', 'Consultant-led'], 'Tender / consultative sales',
        ['Opportunity', 'Eligibility', 'Technical', 'Bid', 'Commercial', 'Award']),
      node(3, 'finance', 'Finance', ['Advance', 'Milestone billing', 'Grants'], 'Milestone finance',
        ['Budget', 'Advance', 'Milestone', 'Certification', 'Invoice', 'Collection']),
      node(4, 'implementation', 'Implementation', ['Deployment', 'Training', 'Acceptance'], 'Implementation success',
        ['Kickoff', 'Deploy', 'Train', 'Accept', 'Support', 'Extend']),
    ],
  },

  d2c: {
    id: 'd2c',
    label: 'D2C / E-commerce',
    revenueModel: 'High-volume consumer demand, conversion, fulfilment and repeat purchase',
    optionalNodes: ['Fulfilment / Logistics'],
    nodes: [
      node(0, 'merchandising', 'Merchandising', ['Assortment', 'Pricing', 'Bundles'], 'Merchandising cycle',
        ['Demand signal', 'Select', 'Price', 'Launch', 'Measure']),
      node(1, 'growth_marketing', 'Growth Mktg', ['Paid media', 'Creators', 'CRM'], 'Performance growth',
        ['Audience', 'Creative', 'Campaign', 'Convert', 'Retarget', 'Optimise']),
      node(2, 'commerce', 'Commerce', ['Storefront', 'Marketplace', 'Promotions'], 'Conversion cycle',
        ['Visit', 'Browse', 'Cart', 'Checkout', 'Purchase']),
      node(3, 'finance', 'Finance', ['Payments', 'Refunds', 'Margin'], 'Transaction finance',
        ['Collect', 'Reconcile', 'Refund', 'Margin review']),
      node(4, 'retention', 'Retention / CX', ['Support', 'Loyalty', 'Repeat purchase'], 'Retention cycle',
        ['Deliver', 'Support', 'Engage', 'Reorder', 'Loyalty']),
    ],
  },

  manufacturing: {
    id: 'manufacturing',
    label: 'Manufacturing',
    revenueModel: 'Channel or enterprise sales backed by production capacity and after-sales support',
    optionalNodes: ['Distribution', 'Operations', 'Supply Chain'],
    nodes: [
      node(0, 'product_engg', 'Product / Engg', ['Configuration', 'Costing', 'Portfolio'], 'Product commercialisation',
        ['Requirement', 'Configure', 'Cost', 'Validate', 'Offer']),
      node(1, 'marketing', 'Marketing', ['Industry campaigns', 'Dealers', 'Exhibitions'], 'Industrial demand',
        ['Segment', 'Campaign', 'Dealer / event', 'Lead', 'Nurture']),
      node(2, 'sales', 'Sales', ['Direct', 'Dealer', 'Key accounts'], 'Industrial sales',
        ['Lead', 'Technical need', 'Quote', 'Negotiate', 'Order']),
      node(3, 'comm_finance', 'Commercial Finance', ['Costing', 'Credit', 'Billing'], 'Order-to-cash',
        ['Cost', 'Credit approve', 'Invoice', 'Collect', 'Reconcile']),
      node(4, 'service', 'Service', ['Installation', 'Warranty', 'AMC'], 'After-sales growth',
        ['Install', 'Commission', 'Support', 'Maintain', 'Upgrade']),
    ],
  },

  consulting: {
    id: 'consulting',
    label: 'Professional Services',
    revenueModel: 'Expertise-led projects, retainers and repeat engagements',
    optionalNodes: ['Delivery'],
    nodes: [
      node(0, 'offering', 'Offering', ['Service design', 'Methodologies'], 'Offer development',
        ['Insight', 'Package', 'Price', 'Validate', 'Refresh']),
      node(1, 'marketing', 'Marketing', ['Thought leadership', 'Events', 'Referrals'], 'Reputation-led marketing',
        ['Publish', 'Engage', 'Event / referral', 'Lead', 'Nurture']),
      node(2, 'biz_dev', 'Business Dev.', ['Advisory sales', 'Account expansion'], 'Consultative BD',
        ['Relationship', 'Diagnose', 'Scope', 'Proposal', 'Negotiate', 'Win']),
      node(3, 'finance', 'Finance', ['Project pricing', 'Milestone invoices'], 'Professional services billing',
        ['Scope', 'Price', 'Contract', 'Milestone bill', 'Collect']),
      node(4, 'client_success', 'Client Success', ['Delivery quality', 'Relationship', 'Renewal'], 'Account growth',
        ['Kickoff', 'Deliver', 'Review', 'Extend', 'Retainer']),
    ],
  },

  education: {
    id: 'education',
    label: 'Education / Programmes',
    revenueModel: 'Institution acquisition, cohort delivery and renewals',
    optionalNodes: ['Academic Partnerships', 'Faculty Success', 'Government Relations'],
    nodes: [
      node(0, 'programme', 'Programme', ['Curriculum', 'Platform', 'Certification'], 'Programme design',
        ['Need', 'Design', 'Validate', 'Package', 'Improve']),
      node(1, 'inst_marketing', 'Institutional Mktg', ['Academic outreach', 'Events', 'Content'], 'Institutional awareness',
        ['Target', 'Educate', 'Demo / event', 'Enquiry', 'Nurture']),
      node(2, 'inst_sales', 'Institutional Sales', ['University', 'School', 'Government'], 'Institutional sales',
        ['Lead', 'Academic discovery', 'Demo', 'Proposal', 'Approval', 'Agreement']),
      node(3, 'finance', 'Finance', ['Semester pricing', 'Bulk pricing', 'Invoicing'], 'Institution billing',
        ['Pricing', 'PO / agreement', 'Invoice', 'Collection', 'Reconcile']),
      node(4, 'prog_success', 'Programme Success', ['Onboarding', 'Delivery', 'Outcomes'], 'Programme success',
        ['Launch', 'Train', 'Deliver', 'Measure outcomes', 'Renew']),
    ],
  },
};

export const SUPERCYCLE_ARCHETYPE_LIST: SupercycleArchetype[] = Object.values(SUPERCYCLE_ARCHETYPES);

export const DEFAULT_ARCHETYPE: SupercycleArchetypeId = 'b2b_saas';

/** The loop's name never changes — that stability is the whole point. */
export const SUPERCYCLE_LABEL = 'Revenue & Growth';

// ── Live instances ───────────────────────────────────────────────────────────
// A sub-cycle variant is a template; it becomes a live instance when attached
// to a real customer, opportunity or programme. Instances are what actually
// move around a sub-cycle track, and each one links down into execution.

export type SupercycleInstance = {
  id: string;
  label: string;
  nodeId: string;
  /** Index into the node's subCycle.stages. */
  stageIndex: number;
  /** 0-100. Rolls up into node health, which rolls up into the core. */
  health: number | null;
};

/** Placeholder instances so the track reads as populated before it is wired
 *  to real opportunities. Replaced by real data once Object Space exists. */
export const SAMPLE_INSTANCES: SupercycleInstance[] = [
  { id: 'inst_thapar', label: 'Thapar University', nodeId: 'sales', stageIndex: 3, health: 72 },
  { id: 'inst_acme', label: 'Acme Corp renewal', nodeId: 'success', stageIndex: 4, health: 88 },
  { id: 'inst_q3', label: 'Q3 demand push', nodeId: 'marketing', stageIndex: 1, health: 64 },
  { id: 'inst_billing', label: 'Billing migration', nodeId: 'finance', stageIndex: 2, health: 45 },
  { id: 'inst_v2', label: 'Platform v2', nodeId: 'product', stageIndex: 2, health: 79 },
];

/** Aggregate health of a node from its live instances (100 when it has none). */
export function nodeHealth(nodeId: string, instances: SupercycleInstance[]): number | null {
  const own = instances.filter((i) => i.nodeId === nodeId);
  const measured = own.filter((instance): instance is SupercycleInstance & { health: number } => instance.health !== null);
  if (measured.length === 0) return null;
  return Math.round(measured.reduce((sum, i) => sum + i.health, 0) / measured.length);
}

/** Aggregate health of the whole supercycle — drives the core's glow. */
export function supercycleHealth(nodes: SupercycleNode[], instances: SupercycleInstance[]): number | null {
  const measured = nodes.map((node) => nodeHealth(node.id, instances)).filter((health): health is number => health !== null);
  if (measured.length === 0) return null;
  return Math.round(measured.reduce((sum, health) => sum + health, 0) / measured.length);
}
