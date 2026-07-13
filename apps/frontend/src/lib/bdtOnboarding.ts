/**
 * BDT onboarding — catalog selection helpers for the onboarding department picker.
 * Department seeding itself is owned by the backend (POST /api/companies), which
 * builds the full BDT tree from its committed seed; the frontend only collects the
 * user's selected framework source_keys + custom labels.
 */
import { getExternalNodeColor, type UDomain } from './bdtPolytopeData';
import { getFrameworkDepartments, getDepartmentColors } from './bdtCatalog';

export const BDT_CACHE_KEY = 'polytope_departments_bdt_v5';

export type BdtCatalogEntry = {
  id: string;
  label: string;
  domain: UDomain;
  cluster: string;
  color: string;
  description: string;
};

export type CustomDepartmentEntry = {
  id: string;
  label: string;
  color: string;
  selected: boolean;
};

const CUSTOM_DEPT_PALETTE = ['#A78BFA', '#F472B6', '#38BDF8', '#4ADE80', '#FB923C', '#C084FC', '#2DD4BF'];

export function getDepartmentColor(deptId: string, fallbackDomain?: UDomain): string {
  const colors = getDepartmentColors();
  if (colors[deptId]) return colors[deptId];
  const dept = getFrameworkDepartments().find(d => d.id === deptId);
  if (dept) return getExternalNodeColor(dept);
  return fallbackDomain ? getExternalNodeColor({ domain: fallbackDomain }) : '#94A3B8';
}

/** Chip styles: unselected = neutral + color dot; selected = that department's accent only */
export function getDepartmentChipStyle(color: string, selected: boolean): {
  background: string;
  color: string;
  border: string;
} {
  if (!selected) {
    return {
      background: '#161618',
      color: '#6B6B6B',
      border: '1px solid rgba(255,255,255,0.06)',
    };
  }
  return {
    background: `${color}1A`,
    color,
    border: `1px solid ${color}66`,
  };
}

export function pickCustomDepartmentColor(index: number): string {
  return CUSTOM_DEPT_PALETTE[index % CUSTOM_DEPT_PALETTE.length];
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'department';
}

export function createCustomDepartmentEntry(label: string, index: number, selected = true): CustomDepartmentEntry {
  const id = `custom_${Date.now()}_${index}_${slugify(label)}`;
  return {
    id,
    label: label.trim(),
    color: pickCustomDepartmentColor(index),
    selected,
  };
}

const CLUSTER_BLURB: Record<string, string> = {
  Build: 'Product creation & engineering',
  Direction: 'Strategy & product direction',
  Market: 'Revenue & market motion',
  People: 'Talent & culture',
  Control: 'Finance, legal & security',
  Delivery: 'Operations & customer delivery',
};

/** Labels from legacy AI onboarding → framework department ids */
const LABEL_ALIASES: Record<string, string> = {
  'product management': 'dept_product',
  'customer support': 'dept_customer_success',
  'customer success': 'dept_customer_success',
  'finance & hr': 'dept_finance',
  'finance and hr': 'dept_finance',
  'hr': 'dept_hr',
  'people': 'dept_hr',
  'people & hr': 'dept_hr',
  'legal': 'dept_legal',
  'legal & compliance': 'dept_legal',
  'risk & compliance': 'dept_security',
  'data': 'dept_data',
  'data & analytics': 'dept_data',
  'analytics': 'dept_data',
  'growth': 'dept_marketing',
};

export function getBdtCatalog(): BdtCatalogEntry[] {
  const colors = getDepartmentColors();
  return getFrameworkDepartments().map(d => ({
    id: d.id,
    label: d.label,
    domain: d.domain,
    cluster: d.cluster,
    color: d.color ?? colors[d.id] ?? getExternalNodeColor(d),
    description: CLUSTER_BLURB[d.cluster] ?? d.cluster,
  }));
}

export function getDefaultSelectedCatalogIds(): string[] {
  return [];
}

export function matchCatalogDepartmentId(label: string): string | null {
  const norm = label.toLowerCase().trim();
  if (!norm) return null;
  if (LABEL_ALIASES[norm]) return LABEL_ALIASES[norm];

  const framework = getFrameworkDepartments();
  const exact = framework.find(d => d.label.toLowerCase() === norm);
  if (exact) return exact.id;

  const partial = framework.find(d => {
    const dl = d.label.toLowerCase();
    return dl.includes(norm) || norm.includes(dl);
  });
  return partial?.id ?? null;
}

export function mapSuggestedLabelsToCatalogIds(labels: string[]): string[] {
  const ids = new Set<string>();
  for (const label of labels) {
    const id = matchCatalogDepartmentId(label);
    if (id) ids.add(id);
    if (label.toLowerCase().includes('finance') && label.toLowerCase().includes('hr')) {
      ids.add('dept_finance');
      ids.add('dept_hr');
    }
  }
  return Array.from(ids);
}

