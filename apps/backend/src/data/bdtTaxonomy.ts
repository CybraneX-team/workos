import type { BranchKind, NodeType } from '@cybranex/shared-types';

/** The deliberately shallow department model used by all newly seeded BDTs. */
export const BDT_TAXONOMY_VERSION = 'v5' as const;

export type BdtWorkspaceKind = 'team' | 'systems' | 'metrics' | 'projects' | 'focus' | 'commercial';
export type BdtProviderCapability = 'meta_ads';
export type BdtFocusPresentation =
  | 'native_operations_shell' | 'meta_ads_hub'
  | 'commercial_product_catalogue' | 'commercial_pricing' | 'commercial_inventory'
  | 'commercial_customers' | 'commercial_leads' | 'commercial_deals'
  | 'commercial_quotes' | 'commercial_orders_invoices' | 'commercial_collections';

export type BdtTaxonomyNode = {
  readonly sourceKey: string;
  readonly label: string;
  readonly meaning: string;
  readonly nodeType: NodeType;
  readonly workspaceKind: BdtWorkspaceKind;
  readonly mappedUniversalCategory: BranchKind;
  readonly providerCapabilities: readonly BdtProviderCapability[];
  readonly presentation?: BdtFocusPresentation;
};

export type BdtTaxonomyDepartment = {
  readonly departmentLabel: string;
  readonly sourceKey: string;
  readonly nodes: readonly BdtTaxonomyNode[];
};

type Focus = readonly [sourceKey: string, label: string, meaning: string, providers?: readonly BdtProviderCapability[], presentation?: BdtFocusPresentation];
type RawDepartment = readonly [label: string, sourceKey: string, focus: Focus];

const SHARED_NODES: readonly Omit<BdtTaxonomyNode, 'sourceKey'>[] = [
  { label: 'Team', meaning: 'People accountable for this department.', nodeType: 'team', workspaceKind: 'team', mappedUniversalCategory: 'resources_capacity', providerCapabilities: [] },
  { label: 'Systems', meaning: 'Connected systems and their operational status.', nodeType: 'resource', workspaceKind: 'systems', mappedUniversalCategory: 'dependencies', providerCapabilities: [] },
  { label: 'Metrics', meaning: 'Department performance, health, and measurement.', nodeType: 'metric', workspaceKind: 'metrics', mappedUniversalCategory: 'metrics_health', providerCapabilities: [] },
  { label: 'Projects', meaning: 'Work in progress for this department, saved on this device.', nodeType: 'project', workspaceKind: 'projects', mappedUniversalCategory: 'core_workstreams', providerCapabilities: [] },
];

const RAW_TAXONOMY: readonly RawDepartment[] = [
  ['Engineering', 'dept_engineering', ['eng_application_delivery', 'Application Delivery', 'Owns implementation and release of customer-facing software.']],
  ['Product', 'dept_product', ['commercial_product', 'Commercial Product', 'Commercial capability anchor.']],
  ['Sales', 'dept_sales', ['commercial_sales', 'Commercial Sales', 'Commercial capability anchor.']],
  ['Marketing', 'dept_marketing', ['mkt_paid_acquisition', 'Paid Acquisition', 'Owns paid-media acquisition execution.', ['meta_ads'], 'meta_ads_hub']],
  ['People & HR', 'dept_hr', ['hr_people_operations', 'People Operations', 'Owns employee administration and employment lifecycle.']],
  ['Finance', 'dept_finance', ['fin_financial_planning', 'Financial Planning', 'Owns forward-looking company financial plans.']],
  ['Operations', 'dept_operations', ['ops_process_capacity', 'Process & Capacity', 'Owns operational throughput, workflow, and capacity.', [], 'native_operations_shell']],
  ['Data & Analytics', 'dept_data', ['data_analytics_products', 'Analytics Products', 'Owns reusable business analytics surfaces.']],
  ['Design', 'dept_design', ['des_product_experience', 'Product Experience', 'Owns product interaction design.']],
  ['Security', 'dept_security', ['sec_security_assurance', 'Security Assurance', 'Owns evidence that security controls work.']],
  ['Customer Success', 'dept_customer_success', ['cs_success_management', 'Customer Success Management', 'Owns ongoing customer value delivery.']],
  ['Legal & Compliance', 'dept_legal', ['leg_commercial_agreements', 'Commercial Agreements', 'Owns legally binding commercial terms.']],
  ['Strategy', 'dept_strategy', ['str_corporate_direction', 'Corporate Direction', 'Owns enduring company direction.']],
];

function workspaceKey(departmentKey: string, workspaceKind: BdtWorkspaceKind): string {
  return `${departmentKey.replace(/^dept_/, '')}_workspace_${workspaceKind}`;
}

const COMMERCIAL_NODES: Record<string, readonly BdtTaxonomyNode[]> = {
  dept_product: [
    { sourceKey: 'prod_product_catalogue', label: 'Product Catalogue', meaning: 'Owns catalogue groups and product identity.', nodeType: 'resource', workspaceKind: 'commercial', mappedUniversalCategory: 'resources_capacity', providerCapabilities: [], presentation: 'commercial_product_catalogue' },
    { sourceKey: 'prod_pricing_management', label: 'Pricing Management', meaning: 'Owns current product pricing decisions.', nodeType: 'decision', workspaceKind: 'commercial', mappedUniversalCategory: 'decision_queue', providerCapabilities: [], presentation: 'commercial_pricing' },
    { sourceKey: 'prod_inventory_readiness', label: 'Inventory Readiness', meaning: 'Shows current stock readiness signals.', nodeType: 'signal', workspaceKind: 'commercial', mappedUniversalCategory: 'metrics_health', providerCapabilities: [], presentation: 'commercial_inventory' },
  ],
  dept_sales: [
    { sourceKey: 'sales_customers_contacts', label: 'Customers & Contacts', meaning: 'Owns accounts, contacts, and billing details.', nodeType: 'resource', workspaceKind: 'commercial', mappedUniversalCategory: 'resources_capacity', providerCapabilities: [], presentation: 'commercial_customers' },
    { sourceKey: 'sales_lead_management', label: 'Lead Management', meaning: 'Owns lead capture, qualification, and conversion.', nodeType: 'process', workspaceKind: 'commercial', mappedUniversalCategory: 'core_workstreams', providerCapabilities: [], presentation: 'commercial_leads' },
    { sourceKey: 'sales_deal_management', label: 'Deal Management', meaning: 'Owns the native deal pipeline.', nodeType: 'process', workspaceKind: 'commercial', mappedUniversalCategory: 'core_workstreams', providerCapabilities: [], presentation: 'commercial_deals' },
    { sourceKey: 'sales_quotations', label: 'Quotations', meaning: 'Owns quote preparation and lifecycle.', nodeType: 'action', workspaceKind: 'commercial', mappedUniversalCategory: 'core_workstreams', providerCapabilities: [], presentation: 'commercial_quotes' },
    { sourceKey: 'sales_orders_invoices', label: 'Orders & Invoices', meaning: 'Owns operational sales documents.', nodeType: 'process', workspaceKind: 'commercial', mappedUniversalCategory: 'core_workstreams', providerCapabilities: [], presentation: 'commercial_orders_invoices' },
    { sourceKey: 'sales_collections', label: 'Collections', meaning: 'Owns outstanding balances and payment recording.', nodeType: 'signal', workspaceKind: 'commercial', mappedUniversalCategory: 'metrics_health', providerCapabilities: [], presentation: 'commercial_collections' },
  ],
};

export const BDT_TAXONOMY: readonly BdtTaxonomyDepartment[] = RAW_TAXONOMY.map(([departmentLabel, sourceKey, focus]) => {
  const commercialNodes = COMMERCIAL_NODES[sourceKey];
  if (commercialNodes) return { departmentLabel, sourceKey, nodes: commercialNodes };
  const [focusKey, focusLabel, focusMeaning, providerCapabilities = [], presentation] = focus;
  return {
    departmentLabel,
    sourceKey,
    nodes: [
      ...SHARED_NODES.map(node => ({
        ...node,
        sourceKey: workspaceKey(sourceKey, node.workspaceKind),
        // Systems owns connection status for the same provider used by this department's focus.
        providerCapabilities: node.workspaceKind === 'systems' ? providerCapabilities : node.providerCapabilities,
      })),
      {
        sourceKey: focusKey,
        label: focusLabel,
        meaning: focusMeaning,
        nodeType: 'branch' as const,
        workspaceKind: 'focus' as const,
        mappedUniversalCategory: 'purpose_scope' as const,
        providerCapabilities,
        ...(presentation ? { presentation } : {}),
      },
    ],
  };
});
