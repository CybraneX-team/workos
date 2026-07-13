/* ================================================================
   WorkOS — Twin Graph Builder
   Derives TwinNode[] and TwinEdge[] from the DB.
   mockData.ts imports from here instead of defining nodes inline.
================================================================ */

import { useState, useEffect, useMemo } from 'react';
import type { TwinNode, TwinEdge } from '../types';
import { INDUSTRIES } from '../db/industries';
import { COMPANIES, getCompaniesByIndustry } from '../db/index';
import { SIGNALS } from '../db/signals';
import { getActiveCompanies, getCompanyById, companyToTwinNodeData } from '../lib/db/companies';
import { useCompanyMetrics } from '../lib/db/metrics';
import { computeHealth } from '../lib/health';

/* ──────────────────────────────────────────────────
   Internal nodes for YOUR company (WorkOS)
────────────────────────────────────────────────── */

const YOUR_DEPT_NODES: TwinNode[] = [
  { id: 'dept-product', label: 'Product',     type: 'department', status: 'healthy',
    children: ['kpi-prod-velocity','kpi-prod-nps','kpi-prod-bugs'],
    metrics: { velocity: 92, nps: 42, bugs: 3 } },
  { id: 'dept-growth',  label: 'Growth',      type: 'department', status: 'warning',
    children: ['kpi-growth-cac','kpi-growth-ltv','kpi-growth-activation'],
    metrics: { cac: 95, ltv: 1200, activation: 68 } },
  { id: 'dept-eng',     label: 'Engineering', type: 'department', status: 'healthy',
    children: ['kpi-eng-velocity','kpi-eng-uptime','kpi-eng-debt'],
    metrics: { sprintVel: 88, uptime: 99.7, techDebt: 12 } },
  { id: 'dept-support', label: 'Support',     type: 'department', status: 'healthy',
    children: ['kpi-sup-response','kpi-sup-csat','kpi-sup-tickets'],
    metrics: { responseTime: 2.1, csat: 90, tickets: 45 } },
];

const YOUR_KPI_NODES: TwinNode[] = [
  { id: 'kpi-prod-velocity',    label: 'Feature Velocity', type: 'kpi', status: 'healthy', metrics: { value: 92 } },
  { id: 'kpi-prod-nps',         label: 'NPS',              type: 'kpi', status: 'healthy', metrics: { value: 42 } },
  { id: 'kpi-prod-bugs',        label: 'Bug Rate',         type: 'kpi', status: 'healthy', metrics: { value: 3 } },
  { id: 'kpi-growth-cac',       label: 'CAC',              type: 'kpi', status: 'warning', metrics: { value: 95 } },
  { id: 'kpi-growth-ltv',       label: 'LTV',              type: 'kpi', status: 'healthy', metrics: { value: 1200 } },
  { id: 'kpi-growth-activation',label: 'Activation',       type: 'kpi', status: 'warning', metrics: { value: 68 } },
  { id: 'kpi-eng-velocity',     label: 'Sprint Velocity',  type: 'kpi', status: 'healthy', metrics: { value: 88 } },
  { id: 'kpi-eng-uptime',       label: 'Uptime',           type: 'kpi', status: 'healthy', metrics: { value: 99.7 } },
  { id: 'kpi-eng-debt',         label: 'Tech Debt',        type: 'kpi', status: 'warning', metrics: { value: 12 } },
  { id: 'kpi-sup-response',     label: 'Response Time',    type: 'kpi', status: 'healthy', metrics: { value: 2.1 } },
  { id: 'kpi-sup-csat',         label: 'CSAT',             type: 'kpi', status: 'healthy', metrics: { value: 90 } },
  { id: 'kpi-sup-tickets',      label: 'Ticket Vol',       type: 'kpi', status: 'healthy', metrics: { value: 45 } },
];

const FEATURE_NODES: TwinNode[] = [
  { id: 'feat-strategy',   label: 'Strategy',      type: 'feature', route: '/twin/strategy',   icon: 'Compass',   description: 'Decisions & Goals' },
  { id: 'feat-data',       label: 'Data Ingestion', type: 'feature', route: '/twin/data',       icon: 'Database',  description: 'Connect & import data' },
  { id: 'feat-benchmarks', label: 'Benchmarks',    type: 'feature', route: '/twin/benchmarks', icon: 'BarChart3', description: 'Industry comparisons' },
  { id: 'feat-team',       label: 'Team & RBAC',   type: 'feature', route: '/twin/team',       icon: 'Users',     description: 'Roles & permissions' },
  { id: 'feat-analytics',  label: 'Analytics',     type: 'feature', route: '/twin/analytics',  icon: 'Activity',  description: 'Metrics & Simulation' },
];

/* ──────────────────────────────────────────────────
   Build industry nodes (with children = company ids)
────────────────────────────────────────────────── */

const industryNodes: TwinNode[] = INDUSTRIES.map(ind => ({
  id: ind.id,
  label: ind.label,
  type: 'industry' as const,
  description: ind.description,
  children: getCompaniesByIndustry(ind.id).map(c => c.id),
}));

/* ──────────────────────────────────────────────────
   Build company nodes
────────────────────────────────────────────────── */

const companyNodes: TwinNode[] = COMPANIES.map(comp => {
  const isYou = comp.id === 'comp-you';
  return {
    id: comp.id,
    label: comp.name,
    type: 'company' as const,
    status: comp.status,
    description: comp.description,
    ...(isYou
      ? {
          children: [
            'dept-product','dept-growth','dept-eng','dept-support',
            'feat-strategy','feat-data','feat-benchmarks','feat-team','feat-analytics',
          ],
        }
      : {}),
    metrics: {
      mrr: comp.mrrUSD,
      team: comp.employees,
      valuation: comp.valuation,
      stage: comp.stage,
    },
  };
});

/* ──────────────────────────────────────────────────
   Build signal nodes
────────────────────────────────────────────────── */

const signalNodes: TwinNode[] = SIGNALS.map(sig => ({
  id: sig.id,
  label: sig.label,
  type: 'signal' as const,
  status: sig.status,
  description: sig.description,
}));

/* ──────────────────────────────────────────────────
   Export nodes
────────────────────────────────────────────────── */

export const twinNodes: TwinNode[] = [
  ...industryNodes,
  ...companyNodes,
  ...YOUR_DEPT_NODES,
  ...YOUR_KPI_NODES,
  ...FEATURE_NODES,
  ...signalNodes,
];

/* ──────────────────────────────────────────────────
   Build edges
────────────────────────────────────────────────── */

const edges: TwinEdge[] = [];

// Industry → Companies
for (const ind of INDUSTRIES) {
  for (const comp of getCompaniesByIndustry(ind.id)) {
    edges.push({
      from: ind.id,
      to: comp.id,
      strength: comp.status === 'healthy' ? 0.8 : 0.5,
      ...(comp.id === 'comp-you' ? { label: 'primary' } : {}),
    });
  }
}

// Your company → departments + features
const YOU = 'comp-you';
for (const dept of YOUR_DEPT_NODES) {
  edges.push({ from: YOU, to: dept.id, strength: 1.0 });
}
for (const feat of FEATURE_NODES) {
  edges.push({ from: YOU, to: feat.id, strength: 0.9 });
}

// Departments → KPIs
const DEPT_KPIS: Record<string, string[]> = {
  'dept-product': ['kpi-prod-velocity','kpi-prod-nps','kpi-prod-bugs'],
  'dept-growth':  ['kpi-growth-cac','kpi-growth-ltv','kpi-growth-activation'],
  'dept-eng':     ['kpi-eng-velocity','kpi-eng-uptime','kpi-eng-debt'],
  'dept-support': ['kpi-sup-response','kpi-sup-csat','kpi-sup-tickets'],
};
for (const [deptId, kpis] of Object.entries(DEPT_KPIS)) {
  for (const kpiId of kpis) {
    edges.push({ from: deptId, to: kpiId, strength: 1.0 });
  }
}

// Signals → Industries + Companies
for (const sig of SIGNALS) {
  const strengths = sig.edgeStrengths ?? {};
  for (const indId of sig.affectedIndustries) {
    edges.push({ from: sig.id, to: indId, strength: strengths[indId] ?? 0.5 });
  }
  for (const compId of sig.affectedCompanies ?? []) {
    edges.push({ from: sig.id, to: compId, strength: strengths[compId] ?? 0.4 });
  }
}

export const twinEdges: TwinEdge[] = edges;

/* ──────────────────────────────────────────────────
   EMERGE_PARENT — for Graph3D company-view zoom
   Maps every internal node → its parent company id
────────────────────────────────────────────────── */

export const EMERGE_PARENT: Record<string, string> = {
  'dept-product': YOU, 'dept-growth': YOU,
  'dept-eng': YOU,     'dept-support': YOU,
  'feat-strategy': YOU,   'feat-data': YOU,
  'feat-benchmarks': YOU, 'feat-team': YOU, 'feat-analytics': YOU,
  'kpi-prod-velocity': YOU, 'kpi-prod-nps': YOU, 'kpi-prod-bugs': YOU,
  'kpi-growth-cac': YOU, 'kpi-growth-ltv': YOU, 'kpi-growth-activation': YOU,
  'kpi-eng-velocity': YOU, 'kpi-eng-uptime': YOU, 'kpi-eng-debt': YOU,
  'kpi-sup-response': YOU, 'kpi-sup-csat': YOU, 'kpi-sup-tickets': YOU,
};

/* ──────────────────────────────────────────────────
   useTwinGraph — merges static DB + Supabase live companies
   Live companies are those onboarded through the platform.
   They are placed via _pos3D and added to their industry node.
────────────────────────────────────────────────── */
function toTwinNode(c: ReturnType<typeof companyToTwinNodeData>, industryId: string | null): TwinNode {
  return {
    id: c.id,
    label: c.label,
    type: c.type,
    status: c.status,
    description: c.description,
    metrics: c.metrics,
    _pos3D: c._pos3D ?? undefined,
    _industryId: industryId ?? undefined,
  };
}

export function useTwinGraph(authCompanyId: string | null | undefined): {
  nodes: TwinNode[];
  edges: TwinEdge[];
  myCompanyNodeId: string | null;
  emergeParent: Record<string, string>;
} {
  const [liveNodes, setLiveNodes] = useState<TwinNode[]>([]);
  const [liveEdges, setLiveEdges] = useState<TwinEdge[]>([]);

  // Fetch all active companies (for the full graph)
  useEffect(() => {
    getActiveCompanies().then(companies => {
      const newNodes: TwinNode[] = [];
      const newEdges: TwinEdge[] = [];
      for (const c of companies) {
        const nodeData = companyToTwinNodeData(c);
        newNodes.push(toTwinNode(nodeData, c.industry_id ?? null));
        if (c.industry_id) {
          newEdges.push({ from: c.industry_id, to: nodeData.id, strength: 0.7 });
        }
      }
      setLiveNodes(newNodes);
      setLiveEdges(newEdges);
    });
  }, []);

  // Directly fetch the auth user's company so it always appears
  // even if getActiveCompanies() is slow or filtered differently
  const [myNode, setMyNode] = useState<TwinNode | null>(null);
  const [myEdge, setMyEdge] = useState<{ from: string; to: string; strength: number } | null>(null);
  useEffect(() => {
    if (!authCompanyId) return;
    getCompanyById(authCompanyId).then(c => {
      if (!c) return;
      const nodeData = companyToTwinNodeData(c);
      setMyNode(toTwinNode(nodeData, c.industry_id ?? null));
      if (c.industry_id) {
        setMyEdge({ from: c.industry_id, to: nodeData.id, strength: 0.9 });
      }
    });
  }, [authCompanyId]);

  const myCompanyNodeId = authCompanyId ? `live-${authCompanyId}` : null;

  // Hide comp-you if user is authenticated (authCompanyId !== undefined),
  // even before their company loads (null = authenticated but no company yet)
  const hideCompYou = authCompanyId !== undefined;

  // Merge: deduplicate by id (myNode takes precedence)
  const allLiveNodes = useMemo(() => {
    const map = new Map<string, TwinNode>();
    for (const n of liveNodes) map.set(n.id, n);
    if (myNode) map.set(myNode.id, myNode);  // overwrite/add
    return Array.from(map.values());
  }, [liveNodes, myNode]);

  const allLiveEdges = useMemo(() => {
    const map = new Map<string, typeof liveEdges[0]>();
    for (const e of liveEdges) map.set(`${e.from}-${e.to}`, e);
    if (myEdge) map.set(`${myEdge.from}-${myEdge.to}`, myEdge);
    return Array.from(map.values());
  }, [liveEdges, myEdge]);

  const finalNodes = hideCompYou
    ? [...twinNodes.filter(n => n.id !== 'comp-you'), ...allLiveNodes]
    : [...twinNodes, ...allLiveNodes];

  // When hiding comp-you: remap its edges to the live company (so dept/feat
  // connections survive) instead of deleting them.  Drop edges that point to
  // other static companies (those are demo data).
  const finalEdges = hideCompYou
    ? [
        ...twinEdges
          .filter(e => e.from !== 'comp-you' && e.to !== 'comp-you')  // keep non-comp-you edges
          .concat(
            myCompanyNodeId
              ? twinEdges
                  .filter(e => e.from === 'comp-you' || e.to === 'comp-you')
                  .map(e => ({
                    ...e,
                    from: e.from === 'comp-you' ? myCompanyNodeId : e.from,
                    to:   e.to   === 'comp-you' ? myCompanyNodeId : e.to,
                  }))
              : [],
          ),
        ...allLiveEdges,
      ]
    : [...twinEdges, ...allLiveEdges];

  const { metrics } = useCompanyMetrics(authCompanyId ?? null);
  const overlay = useMemo(
    () => computeHealth(metrics, myCompanyNodeId),
    [metrics, myCompanyNodeId],
  );

  const overlaidNodes = useMemo(() => {
    if (
      Object.keys(overlay.nodeStatus).length === 0 &&
      Object.keys(overlay.nodeMetrics).length === 0
    ) {
      return finalNodes;
    }

    return finalNodes.map((n) => {
      const status = overlay.nodeStatus[n.id];
      const nodeMetrics = overlay.nodeMetrics[n.id];
      if (!status && !nodeMetrics) return n;
      return {
        ...n,
        ...(status ? { status } : {}),
        ...(nodeMetrics ? { metrics: { ...(n.metrics ?? {}), ...nodeMetrics } } : {}),
      };
    });
  }, [finalNodes, overlay.nodeMetrics, overlay.nodeStatus]);

  // Remap comp-you → live company id when user has a company.
  // If user is logged in but has no company yet (null), keep EMERGE_PARENT as-is
  // (dept/feat nodes won't appear since comp-you is hidden and no company focused).
  const emergeParent: Record<string, string> = myCompanyNodeId
    ? Object.fromEntries(
        Object.entries(EMERGE_PARENT).map(([child, parent]) => [
          child,
          parent === 'comp-you' ? myCompanyNodeId : parent,
        ])
      )
    : EMERGE_PARENT;

  return { nodes: overlaidNodes, edges: finalEdges, myCompanyNodeId, emergeParent };
}
