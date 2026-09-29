// ─────────────────────────────────────────────────────────────────────────────
// Revenue & Growth Supercycle — types + archetype enum metadata.
//
// Phase 5: the actual skeleton (nodes, sub-nodes, stages) NO LONGER lives here.
// It is seeded per company from pms_archetype_templates and served by
// GET /api/pms/supercycle (`archetypes`), consumed via usePmsStore. This module
// now holds only:
//   - the shared TypeScript types,
//   - the fixed archetype id + display-label enum (business-model picker),
//   - the health roll-up helpers (pure functions over live instances).
// There is no hardcoded per-company data left.
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
  color: string;
  /** Ring-slot index (0-4); attached by the server skeleton. */
  slot?: number;
  subNodes: SubNode[];
  subCycle: SubCycleVariant;
};

export type SupercycleArchetype = {
  id: SupercycleArchetypeId;
  label: string;
  /** How this organisation actually makes money — shown when picking. */
  revenueModel: string;
  nodes: SupercycleNode[];
  /** Nodes flagged optional for this model, offered under "+ Add node". */
  optionalNodes: string[];
  /** Ring-slot colours (index 0-4); attached by the server skeleton. */
  slotColors?: string[];
};

export type SupercycleCycle = {
  id: string;
  name: string;
  color: string;
  departmentIds: string[];
  /** Optional sub-node memberships, scoped to the selected departments. */
  subNodeIds?: string[];
};

export const DEFAULT_ARCHETYPE: SupercycleArchetypeId = 'b2b_saas';

/** The loop's name never changes — that stability is the whole point. */
export const SUPERCYCLE_LABEL = 'Revenue & Growth';

/**
 * Fixed archetype metadata: the id set plus display labels for the
 * business-model picker and the revenue-model tooltip. This is enum metadata,
 * not per-company skeleton data — the skeleton comes from the server. The order
 * here is the order the picker tabs render in.
 */
export const ARCHETYPE_META: ReadonlyArray<{ id: SupercycleArchetypeId; label: string; revenueModel: string }> = [
  { id: 'b2b_saas', label: 'B2B SaaS', revenueModel: 'Subscriptions, enterprise contracts and recurring renewals' },
  { id: 'deep_tech', label: 'Deep-Tech / Government', revenueModel: 'Institutional sales, tenders, milestone payments, long implementation cycles' },
  { id: 'd2c', label: 'D2C / E-commerce', revenueModel: 'High-volume consumer demand, conversion, fulfilment and repeat purchase' },
  { id: 'manufacturing', label: 'Manufacturing', revenueModel: 'Channel or enterprise sales backed by production capacity and after-sales support' },
  { id: 'consulting', label: 'Professional Services', revenueModel: 'Expertise-led projects, retainers and repeat engagements' },
  { id: 'education', label: 'Education / Programmes', revenueModel: 'Institution acquisition, cohort delivery and renewals' },
];

export const ARCHETYPE_IDS: readonly SupercycleArchetypeId[] = ARCHETYPE_META.map((a) => a.id);

export function isArchetypeId(value: string): value is SupercycleArchetypeId {
  return (ARCHETYPE_IDS as readonly string[]).includes(value);
}

// ── Live instances (health roll-ups) ─────────────────────────────────────────
// A sub-cycle variant is a template; it becomes a live instance when attached
// to a real customer, opportunity or programme. These pure helpers roll live
// instance health up into node and supercycle health.

export type SupercycleInstance = {
  id: string;
  label: string;
  nodeId: string;
  /** Index into the node's subCycle.stages. */
  stageIndex: number;
  /** 0-100. Rolls up into node health, which rolls up into the core. */
  health: number | null;
};

/** Aggregate health of a node from its live instances (null when it has none). */
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
