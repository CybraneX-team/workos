/* ================================================================
   WorkOS — Database Query Layer
   All graph layout constants + query functions are derived here.
   Import from this file everywhere — never import raw arrays.
================================================================ */

export { INDUSTRIES, INDUSTRY_MAP } from './industries';
export { COMPANIES, COMPANY_MAP } from './companies';
export { SIGNALS, SIGNAL_MAP } from './signals';
export type {
  IndustryRecord, CompanyRecord, SignalRecord,
  NodeStatus, CompanyStage, Country, GraphLayoutConfig,
} from './schema';

import { INDUSTRIES, INDUSTRY_MAP } from './industries';
import { COMPANIES, COMPANY_MAP } from './companies';
import { SIGNALS } from './signals';
import type { IndustryRecord, CompanyRecord, GraphLayoutConfig } from './schema';

/* ──────────────────────────────────────────────────
   Query helpers
────────────────────────────────────────────────── */

export function getIndustry(id: string): IndustryRecord | undefined {
  return INDUSTRY_MAP.get(id);
}

export function getCompany(id: string): CompanyRecord | undefined {
  return COMPANY_MAP.get(id);
}

export function getCompaniesByIndustry(industryId: string): CompanyRecord[] {
  return COMPANIES.filter(c => c.industryId === industryId);
}

export function searchCompanies(query: string): CompanyRecord[] {
  const q = query.toLowerCase();
  return COMPANIES.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.description.toLowerCase().includes(q) ||
    c.country.toLowerCase().includes(q) ||
    c.stage.toLowerCase().includes(q)
  );
}

export function getIndustriesWithCompanies() {
  return INDUSTRIES.map(ind => ({
    ...ind,
    companies: getCompaniesByIndustry(ind.id),
  }));
}

/* ──────────────────────────────────────────────────
   Graph3D Layout Config
   Derived from DB — imported by Graph3D.tsx
────────────────────────────────────────────────── */

function addVec3(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export const GRAPH_LAYOUT: GraphLayoutConfig = (() => {
  const CLUSTER_CENTER: Record<string, [number, number, number]> = {};
  const BUBBLE_RADIUS: Record<string, number> = {};
  const INDUSTRY_CLR: Record<string, string> = {};
  const POS3D: Record<string, [number, number, number]> = {};
  const COMPANY_INDUSTRY: Record<string, string> = {};

  // Build from industries
  for (const ind of INDUSTRIES) {
    CLUSTER_CENTER[ind.id] = ind.position3D;
    BUBBLE_RADIUS[ind.id] = ind.bubbleRadius;
    INDUSTRY_CLR[ind.id] = ind.color;
    POS3D[ind.id] = ind.position3D;
  }

  // Build from companies
  for (const comp of COMPANIES) {
    const ind = INDUSTRY_MAP.get(comp.industryId);
    if (!ind) continue;
    POS3D[comp.id] = addVec3(ind.position3D, comp.offset3D);
    COMPANY_INDUSTRY[comp.id] = comp.industryId;
  }

  // Signal positions
  for (const sig of SIGNALS) {
    POS3D[sig.id] = sig.position3D;
  }

  // Your company's internal nodes — kept in twinGraph.ts for ownership
  const YOUR_INTERNAL: Record<string, [number, number, number]> = {
    'dept-product': [8,  7,  6],  'dept-growth':  [9, -5, -3],
    'dept-eng':     [-5,-5, -2],  'dept-support': [-5, 7,  6],
    'feat-strategy':   [2, 11,  8], 'feat-data':      [-9, 1,  2],
    'feat-benchmarks': [2, -9, -4], 'feat-team':      [12, 1,  2],
    'feat-analytics':  [9, -7, -3],
    'kpi-prod-velocity': [10, 9, 7],  'kpi-prod-nps':       [9,  6, 8],
    'kpi-prod-bugs':     [10, 5, 6],  'kpi-growth-cac':     [11,-4,-2],
    'kpi-growth-ltv':    [10,-7,-4],  'kpi-growth-activation':[11,-6,-1],
    'kpi-eng-velocity':  [-7,-4,-1],  'kpi-eng-uptime':     [-6,-7,-3],
    'kpi-eng-debt':      [-7,-6, 0],  'kpi-sup-response':   [-7, 9, 7],
    'kpi-sup-csat':      [-6, 6, 8],  'kpi-sup-tickets':    [-7, 5, 6],
  };
  for (const [id, pos] of Object.entries(YOUR_INTERNAL)) {
    POS3D[id] = pos;
  }

  return { CLUSTER_CENTER, BUBBLE_RADIUS, INDUSTRY_CLR, POS3D, COMPANY_INDUSTRY };
})();
