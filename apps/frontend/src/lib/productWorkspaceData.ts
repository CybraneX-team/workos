import { INDUSTRIES } from '../db/industries';

export type WorkspaceZoneId =
  | 'strategy'
  | 'operations'
  | 'growth'
  | 'finance'
  | 'people'
  | 'insights';

export interface WorkspaceZone {
  id: WorkspaceZoneId;
  label: string;
  description: string;
  accent: string;
  /** Lucide icon name key — resolved in ProductWorkspace */
  icon: 'target' | 'cog' | 'trending' | 'wallet' | 'users' | 'bookmark';
}

export const WORKSPACE_ZONES: WorkspaceZone[] = [
  { id: 'strategy', label: 'Strategy', description: 'Direction, OKRs, market positioning', accent: '#fde047', icon: 'target' },
  { id: 'operations', label: 'Operations', description: 'Supply chain, production, delivery', accent: '#06b6d4', icon: 'cog' },
  { id: 'growth', label: 'Growth', description: 'GTM, partnerships, expansion', accent: '#f97316', icon: 'trending' },
  { id: 'finance', label: 'Finance', description: 'Runway, unit economics, fundraising', accent: '#22d3ee', icon: 'wallet' },
  { id: 'people', label: 'People', description: 'Hiring, culture, org design', accent: '#0ea5e9', icon: 'users' },
  { id: 'insights', label: 'Pinned insights', description: 'Cross-sector signals you saved', accent: '#C1AEFF', icon: 'bookmark' },
];

export interface ContextInsight {
  id: string;
  title: string;
  summary: string;
  sourceIndustry: string;
  sourceIndustryColor: string;
  relevanceScore: number;
  tags: string[];
  suggestedZone: WorkspaceZoneId;
}

export interface CompanyVital {
  label: string;
  value: string;
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
}

function industryLabel(id: string | null | undefined): { label: string; color: string } {
  const ind = INDUSTRIES.find(i => i.id === id);
  return ind ? { label: ind.label, color: ind.color } : { label: 'General', color: '#8b5cf6' };
}

export function buildCompanyVitals(company: {
  mrr_usd?: number;
  employees?: number;
  runway_months?: number;
  burn_rate_usd?: number;
  stage?: string;
} | null): CompanyVital[] {
  if (!company) {
    return [
      { label: 'Health score', value: '78', delta: '+4', trend: 'up' },
      { label: 'Active departments', value: '13', trend: 'flat' },
      { label: 'Alignment', value: '82%', delta: '+2%', trend: 'up' },
    ];
  }
  const mrr = company.mrr_usd ?? 0;
  const runway = company.runway_months ?? 0;
  return [
    {
      label: 'MRR',
      value: mrr >= 1000 ? `$${(mrr / 1000).toFixed(1)}k` : `$${mrr}`,
      trend: mrr > 0 ? 'up' : 'flat',
    },
    {
      label: 'Team',
      value: String(company.employees ?? 0),
      trend: 'flat',
    },
    {
      label: 'Runway',
      value: runway > 0 ? `${runway} mo` : '—',
      trend: runway >= 12 ? 'up' : runway >= 6 ? 'flat' : 'down',
    },
    {
      label: 'Stage',
      value: (company.stage ?? 'seed').replace('_', ' '),
      trend: 'flat',
    },
  ];
}

/** Context-aware insights from adjacent industries (demo data; replace with API later). */
export function getContextInsights(
  companyIndustryId: string | null | undefined,
  companyName: string,
): ContextInsight[] {
  const home = industryLabel(companyIndustryId);
  const others = INDUSTRIES.filter(i => i.id !== companyIndustryId).slice(0, 6);

  const templates: Omit<ContextInsight, 'id' | 'sourceIndustry' | 'sourceIndustryColor'>[] = [
    {
      title: 'Freight consolidation benchmark',
      summary: 'Peers in logistics cut last-mile cost 12–18% by batching regional shipments twice weekly.',
      relevanceScore: 91,
      tags: ['cost', 'delivery'],
      suggestedZone: 'operations',
    },
    {
      title: 'Supplier payment terms trend',
      summary: 'Manufacturing founders extending net-45 on raw materials while keeping net-15 on finished goods.',
      relevanceScore: 84,
      tags: ['cash', 'supply chain'],
      suggestedZone: 'finance',
    },
    {
      title: 'Quality audit cadence',
      summary: 'Textile operators running bi-weekly inline QC vs monthly batch checks — defect rate down 23%.',
      relevanceScore: 88,
      tags: ['quality', 'ops'],
      suggestedZone: 'operations',
    },
    {
      title: 'Channel partner playbook',
      summary: 'Retail-adjacent startups co-selling through 2–3 distributor anchors before D2C scale.',
      relevanceScore: 76,
      tags: ['GTM', 'partners'],
      suggestedZone: 'growth',
    },
    {
      title: 'Hiring velocity in ops roles',
      summary: 'Teams your size adding one ops lead per $40k MRR band; average time-to-fill 34 days.',
      relevanceScore: 72,
      tags: ['hiring', 'org'],
      suggestedZone: 'people',
    },
    {
      title: 'Regulatory filing window',
      summary: 'Export-heavy categories seeing consolidated compliance dashboards reduce audit prep by ~40 hrs/qtr.',
      relevanceScore: 69,
      tags: ['compliance'],
      suggestedZone: 'strategy',
    },
  ];

  return templates.map((t, i) => {
    const src = others[i % others.length];
    return {
      id: `insight_${i}`,
      ...t,
      sourceIndustry: src.label,
      sourceIndustryColor: src.color,
      title: home.label === 'Manufacturing' && i === 2
        ? t.title
        : `${t.title} · ${companyName.slice(0, 12)}${companyName.length > 12 ? '…' : ''}`,
    };
  });
}

export function getIndustryContext(companyIndustryId: string | null | undefined) {
  return industryLabel(companyIndustryId);
}
