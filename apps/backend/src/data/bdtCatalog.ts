// ─────────────────────────────────────────────────────────────────────────────
// BDT Catalog — canonical taxonomy for the Business Digital Twin department model.
//
// This is the single source of truth for node enums, the per-department Level-1
// node definitions, framework department metadata, and company-size configs.
// The backend owns it; routes/departments.ts imports the enums for validation,
// and the frontend consumes the lot via GET /api/bdt/catalog.
//
// Ported from the former frontend module Startup_Digital_Twin/src/lib/bdtPolytopeData.ts.
// SQL CHECK constraints (migrations 018/020/025/028) must stay aligned with the
// enum value-lists below.
//
// The enum/shape TYPES below now live in @cybranex/shared-types (previously hand-duplicated
// in the frontend) — this file re-exports them and remains the source of truth for the actual
// DATA (DEPT_META, DEPT_LEVEL1_NODES, DEPT_SIZE_CONFIGS, the runtime Sets, label maps).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Domain, NodeType, BranchKind, NodeLevel, CompanySize,
  DeptLevel1Def as SharedDeptLevel1Def, DeptMeta as SharedDeptMeta, SizeConfig,
} from '@cybranex/shared-types';
export type { Domain, NodeType, BranchKind, NodeLevel, CompanySize };

export const DOMAINS = new Set<Domain>(['direction', 'build', 'delivery', 'market', 'control', 'people']);
export const NODE_TYPES = new Set<NodeType>(['team', 'process', 'project', 'resource', 'decision', 'risk', 'metric', 'branch', 'action', 'signal']);
export const BRANCH_KINDS = new Set<BranchKind>(['purpose_scope', 'objectives_okrs', 'core_workstreams', 'metrics_health', 'resources_capacity', 'dependencies', 'risks_controls', 'decision_queue']);
export const NODE_LEVELS = new Set<NodeLevel>(['level1', 'branch', 'internal', 'action']);

export const U_BRANCH_KIND_LABELS: Record<BranchKind, string> = {
  purpose_scope:      'Purpose & Scope',
  objectives_okrs:    'Objectives / OKRs',
  core_workstreams:   'Core Workstreams',
  metrics_health:     'Metrics & Health',
  resources_capacity: 'Resources & Capacity',
  dependencies:       'Dependencies',
  risks_controls:     'Risks & Controls',
  decision_queue:     'Decision Queue',
};

export const DEPT_SIZE_CONFIGS: Record<CompanySize, SizeConfig> = {
  micro: {
    label: '6-root (Founder / Micro)',
    rootCount: 6,
    visibleDeptIds: ['dept_strategy', 'dept_product', 'dept_sales', 'dept_customer_success', 'dept_finance', 'dept_hr'],
    mergedGroups: {
      'Build':     ['dept_engineering', 'dept_design', 'dept_data'],
      'GTM':       ['dept_marketing', 'dept_sales'],
      'Ops & Risk':['dept_operations', 'dept_security', 'dept_legal'],
    },
  },
  msme: {
    label: '9-root (MSME)',
    rootCount: 9,
    visibleDeptIds: [
      'dept_strategy', 'dept_product', 'dept_engineering',
      'dept_sales', 'dept_marketing', 'dept_customer_success',
      'dept_finance', 'dept_operations', 'dept_hr',
    ],
    mergedGroups: {
      'Risk & Legal': ['dept_security', 'dept_legal'],
      'Build':        ['dept_design', 'dept_data'],
    },
  },
  standard: {
    label: '13-root (Universal)',
    rootCount: 13,
    visibleDeptIds: [
      'dept_strategy', 'dept_product', 'dept_engineering', 'dept_design', 'dept_data',
      'dept_sales', 'dept_marketing', 'dept_customer_success',
      'dept_hr', 'dept_finance', 'dept_operations', 'dept_security', 'dept_legal',
    ],
  },
  enterprise: {
    label: '16+ (Enterprise)',
    rootCount: 16,
    // NOTE: references dept_procurement/dept_it/dept_rd, which have no entry in the
    // 13 framework departments below. Pre-existing asymmetry — preserved intentionally.
    visibleDeptIds: [
      'dept_strategy', 'dept_product', 'dept_engineering', 'dept_design', 'dept_data',
      'dept_sales', 'dept_marketing', 'dept_customer_success',
      'dept_hr', 'dept_finance', 'dept_operations', 'dept_security', 'dept_legal',
      'dept_procurement', 'dept_it', 'dept_rd',
    ],
  },
};

/** Per-department accent colors — Company Department framework §6. */
export const BDT_DEPARTMENT_COLORS: Record<string, string> = {
  dept_strategy: '#F2C94C',
  dept_product: '#6C63FF',
  dept_engineering: '#2F80ED',
  dept_design: '#BB6BD9',
  dept_data: '#56CCF2',
  dept_sales: '#F2994A',
  dept_marketing: '#EB5757',
  dept_customer_success: '#00BFA6',
  dept_hr: '#27AE60',
  dept_finance: '#219653',
  dept_operations: '#2D9CDB',
  dept_security: '#E8A317',
  dept_legal: '#D97706',
};

export type DeptLevel1Def = SharedDeptLevel1Def;

/** Spec-sourced Level-1 node definitions (max 6 per dept) for all 13 framework departments. */
export const DEPT_LEVEL1_NODES: Record<string, DeptLevel1Def[]> = {
  dept_engineering: [
    { sourceKey: 'eng_products_platforms',   label: 'Products & Platforms',    mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'eng_development',          label: 'Development',             mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'eng_architecture_quality', label: 'Architecture & Quality',  mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'eng_delivery_operations',  label: 'Delivery & Operations',   mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'eng_performance',          label: 'Engineering Performance', mappedUniversalCategory: 'metrics_health' },
    { sourceKey: 'eng_resources',            label: 'Engineering Resources',   mappedUniversalCategory: 'resources_capacity' },
  ],
  dept_product: [
    { sourceKey: 'prod_portfolio',   label: 'Product Portfolio',    mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'prod_discovery',   label: 'Discovery & Research', mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'prod_roadmaps',    label: 'Roadmaps & Releases',  mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'prod_insights',    label: 'Customer Insights',    mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'prod_performance', label: 'Product Performance',  mappedUniversalCategory: 'metrics_health' },
    { sourceKey: 'prod_resources',   label: 'Product Resources',    mappedUniversalCategory: 'resources_capacity' },
  ],
  dept_sales: [
    { sourceKey: 'sales_accounts',    label: 'Customers & Accounts',    mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'sales_pipeline',    label: 'Pipeline & Opportunities', mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'sales_revops',      label: 'Revenue Operations',       mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'sales_partners',    label: 'Partnerships & Channels',  mappedUniversalCategory: 'dependencies' },
    { sourceKey: 'sales_performance', label: 'Sales Performance',        mappedUniversalCategory: 'metrics_health' },
    { sourceKey: 'sales_resources',   label: 'Sales Resources',          mappedUniversalCategory: 'resources_capacity' },
  ],
  dept_marketing: [
    { sourceKey: 'mkt_paid_acquisition',   label: 'Paid Acquisition',     mappedUniversalCategory: 'metrics_health' },
    { sourceKey: 'mkt_organic_growth',     label: 'Organic Growth',       mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'mkt_demand_attribution', label: 'Demand & Attribution', mappedUniversalCategory: 'dependencies' },
    { sourceKey: 'mkt_brand_intelligence', label: 'Brand & Intelligence', mappedUniversalCategory: 'core_workstreams' },
  ],
  dept_hr: [
    { sourceKey: 'hr_talent_acquisition', label: 'Talent Acquisition',   mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'hr_people_ops',  label: 'People Operations',      mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'hr_learning',    label: 'Learning & Development', mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'hr_culture',     label: 'Culture & Engagement',   mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'hr_performance', label: 'Workforce Performance',  mappedUniversalCategory: 'metrics_health' },
    { sourceKey: 'hr_resources',   label: 'HR Resources',           mappedUniversalCategory: 'resources_capacity' },
  ],
  dept_finance: [
    { sourceKey: 'fin_ops',         label: 'Financial Operations',  mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'fin_planning',    label: 'Planning & Forecasting', mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'fin_treasury_capital', label: 'Treasury & Capital',    mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'fin_procurement', label: 'Procurement & Spend',   mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'fin_compliance',  label: 'Compliance & Audit',    mappedUniversalCategory: 'risks_controls' },
    { sourceKey: 'fin_performance', label: 'Financial Performance', mappedUniversalCategory: 'metrics_health' },
  ],
  dept_operations: [
    { sourceKey: 'ops_delivery',     label: 'Service Delivery',          mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'ops_supply_chain', label: 'Supply Chain & Logistics',  mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'ops_vendors',      label: 'Vendors & Procurement',     mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'ops_process',      label: 'Process Excellence',        mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'ops_performance',  label: 'Operational Performance',   mappedUniversalCategory: 'metrics_health' },
    { sourceKey: 'ops_resources',    label: 'Operational Resources',     mappedUniversalCategory: 'resources_capacity' },
  ],
  dept_data: [
    { sourceKey: 'data_engineering', label: 'Data Engineering',      mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'data_bi',          label: 'Business Intelligence', mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'data_analytics',   label: 'Analytics & Insights',  mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'data_ai_models',   label: 'AI & Models',           mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'data_governance',  label: 'Data Governance',       mappedUniversalCategory: 'risks_controls' },
    { sourceKey: 'data_performance', label: 'Data Performance',      mappedUniversalCategory: 'metrics_health' },
  ],
  dept_design: [
    { sourceKey: 'des_systems',        label: 'Design Systems',        mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'des_ux_research',    label: 'UX Research',           mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'des_product_design', label: 'Product Design',        mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'des_brand',          label: 'Brand & Visual Design', mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'des_performance',    label: 'Design Performance',    mappedUniversalCategory: 'metrics_health' },
    { sourceKey: 'des_resources',      label: 'Design Resources',      mappedUniversalCategory: 'resources_capacity' },
  ],
  dept_security: [
    { sourceKey: 'sec_identity',    label: 'Identity & Access',              mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'sec_infra',       label: 'Infrastructure Security',        mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'sec_appsec',      label: 'Application Security',           mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'sec_monitoring',  label: 'Monitoring & Incident Response', mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'sec_governance',  label: 'Governance & Compliance',        mappedUniversalCategory: 'risks_controls' },
    { sourceKey: 'sec_performance', label: 'Security Performance',           mappedUniversalCategory: 'metrics_health' },
  ],
  dept_customer_success: [
    { sourceKey: 'cs_accounts',    label: 'Customer Accounts',    mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'cs_onboarding',  label: 'Onboarding & Adoption', mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'cs_support',     label: 'Support & Service',    mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'cs_retention',   label: 'Retention & Expansion', mappedUniversalCategory: 'dependencies' },
    { sourceKey: 'cs_customer_performance', label: 'Customer Performance', mappedUniversalCategory: 'metrics_health' },
    { sourceKey: 'cs_resources',   label: 'CS Resources',         mappedUniversalCategory: 'resources_capacity' },
  ],
  dept_legal: [
    { sourceKey: 'leg_contracts',   label: 'Contracts & Agreements',    mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'leg_regulatory',  label: 'Regulatory Compliance',     mappedUniversalCategory: 'risks_controls' },
    { sourceKey: 'leg_ip',          label: 'IP & Data Rights',          mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'leg_advisory',    label: 'Legal Advisory & Disputes', mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'leg_performance', label: 'Legal Performance & Risk',  mappedUniversalCategory: 'metrics_health' },
    { sourceKey: 'leg_resources',   label: 'Legal Resources',           mappedUniversalCategory: 'resources_capacity' },
  ],
  dept_strategy: [
    { sourceKey: 'str_corporate',    label: 'Corporate Strategy',    mappedUniversalCategory: 'purpose_scope' },
    { sourceKey: 'str_growth',       label: 'Growth Initiatives',    mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'str_intelligence', label: 'Market Intelligence',   mappedUniversalCategory: 'core_workstreams' },
    { sourceKey: 'str_partnerships', label: 'Partnerships & M&A',    mappedUniversalCategory: 'dependencies' },
    { sourceKey: 'str_performance',  label: 'Strategic Performance', mappedUniversalCategory: 'metrics_health' },
    { sourceKey: 'str_resources',    label: 'Strategic Resources',   mappedUniversalCategory: 'resources_capacity' },
  ],
};

export type DeptMeta = SharedDeptMeta;

/** 13 framework departments as metadata shells; internal nodes come from the seed / real data. */
export const DEPT_META: DeptMeta[] = [
  { id: 'dept_engineering', label: 'Engineering', domain: 'build', cluster: 'Build', score: 85, color: BDT_DEPARTMENT_COLORS.dept_engineering, metrics: { performance: 91, efficiency: 85, capacity: 78, alignment: 88, risk: 14 } },
  { id: 'dept_product', label: 'Product', domain: 'direction', cluster: 'Direction', score: 91, color: BDT_DEPARTMENT_COLORS.dept_product, metrics: { performance: 93, efficiency: 90, capacity: 85, alignment: 95, risk: 8 } },
  { id: 'dept_sales', label: 'Sales', domain: 'market', cluster: 'Market', score: 78, color: BDT_DEPARTMENT_COLORS.dept_sales, metrics: { performance: 80, efficiency: 74, capacity: 82, alignment: 76, risk: 22 } },
  { id: 'dept_marketing', label: 'Marketing', domain: 'market', cluster: 'Market', score: 72, color: BDT_DEPARTMENT_COLORS.dept_marketing, metrics: { performance: 75, efficiency: 68, capacity: 74, alignment: 72, risk: 26 } },
  { id: 'dept_hr', label: 'People & HR', domain: 'people', cluster: 'People', score: 84, color: BDT_DEPARTMENT_COLORS.dept_hr, metrics: { performance: 86, efficiency: 82, capacity: 80, alignment: 88, risk: 12 } },
  { id: 'dept_finance', label: 'Finance', domain: 'control', cluster: 'Control', score: 93, color: BDT_DEPARTMENT_COLORS.dept_finance, metrics: { performance: 95, efficiency: 92, capacity: 90, alignment: 94, risk: 6 } },
  { id: 'dept_operations', label: 'Operations', domain: 'delivery', cluster: 'Delivery', score: 61, color: BDT_DEPARTMENT_COLORS.dept_operations, metrics: { performance: 63, efficiency: 58, capacity: 65, alignment: 60, risk: 38 } },
  { id: 'dept_data', label: 'Data & Analytics', domain: 'build', cluster: 'Build', score: 76, color: BDT_DEPARTMENT_COLORS.dept_data, metrics: { performance: 78, efficiency: 74, capacity: 72, alignment: 79, risk: 20 } },
  { id: 'dept_design', label: 'Design', domain: 'build', cluster: 'Build', score: 88, color: BDT_DEPARTMENT_COLORS.dept_design, metrics: { performance: 91, efficiency: 87, capacity: 83, alignment: 90, risk: 10 } },
  { id: 'dept_security', label: 'Security', domain: 'control', cluster: 'Control', score: 69, color: BDT_DEPARTMENT_COLORS.dept_security, metrics: { performance: 71, efficiency: 65, capacity: 68, alignment: 73, risk: 32 } },
  { id: 'dept_customer_success', label: 'Customer Success', domain: 'delivery', cluster: 'Delivery', score: 82, color: BDT_DEPARTMENT_COLORS.dept_customer_success, metrics: { performance: 84, efficiency: 80, capacity: 85, alignment: 83, risk: 15 } },
  { id: 'dept_legal', label: 'Legal & Compliance', domain: 'control', cluster: 'Control', score: 89, color: BDT_DEPARTMENT_COLORS.dept_legal, metrics: { performance: 91, efficiency: 88, capacity: 86, alignment: 92, risk: 9 } },
  { id: 'dept_strategy', label: 'Strategy', domain: 'direction', cluster: 'Direction', score: 95, color: BDT_DEPARTMENT_COLORS.dept_strategy, metrics: { performance: 97, efficiency: 94, capacity: 92, alignment: 98, risk: 4 } },
];

/** The full catalog payload served by GET /api/bdt/catalog. */
export function buildBdtCatalog() {
  return {
    departments: DEPT_META,
    level1: DEPT_LEVEL1_NODES,
    enums: {
      domains: [...DOMAINS],
      nodeTypes: [...NODE_TYPES],
      branchKinds: [...BRANCH_KINDS],
      nodeLevels: [...NODE_LEVELS],
      branchKindLabels: U_BRANCH_KIND_LABELS,
    },
    sizeConfigs: DEPT_SIZE_CONFIGS,
  };
}
