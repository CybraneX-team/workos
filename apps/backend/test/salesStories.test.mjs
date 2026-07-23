import assert from 'node:assert/strict';
import { buildCustomerRollups, buildSalesMetricStory, buildSalesRecommendations } from '../dist/domains/workos-erp/erpnextSalesStories.js';
import { MAPPING_SOURCE_DOCTYPES } from '../dist/domains/workos-erp/erpnextSales.js';
import { readFile } from 'node:fs/promises';

const ok = rows => ({ ok: true, rows });
const read = (doctype, rows) => ({ definition: { doctype, fields: [] }, result: ok(rows) });
const mapping = (key, label = key, partial = false) => ({ key, label, status: partial ? 'partial' : undefined });

function card(story, id) {
  return story.metricCards.find(item => item.id === id);
}

{
  const reads = [
    read('Customer', [
      { name: 'CUST-1', customer_name: 'Acme Robotics', customer_group: 'Enterprise', territory: 'West', customer_type: 'Company', modified: '2026-07-01' },
      { name: 'CUST-2', customer_name: 'Beta Labs', customer_group: '', territory: '', customer_type: '', modified: '2025-01-01' },
      { name: 'CUST-3', customer_name: 'Dormant Co', customer_group: 'SMB', territory: 'East', customer_type: 'Company', modified: '2024-01-01' },
    ]),
    read('Sales Order', [
      { name: 'SO-1', customer: 'CUST-1', grand_total: 120000, status: 'To Bill', transaction_date: '2026-07-02' },
      { name: 'SO-2', customer: 'CUST-2', grand_total: 25000, status: 'On Hold', transaction_date: '2026-06-01' },
    ]),
    read('Sales Invoice', [
      { name: 'SI-1', customer: 'CUST-1', grand_total: 90000, status: 'Paid', posting_date: '2026-07-04' },
    ]),
  ];
  const rollups = buildCustomerRollups(reads);
  const acme = rollups.find(row => row.id === 'CUST-1');
  const beta = rollups.find(row => row.id === 'CUST-2');
  const dormant = rollups.find(row => row.id === 'CUST-3');

  assert.equal(acme?.orderCount, 1);
  assert.equal(acme?.invoiceCount, 1);
  assert.equal(acme?.orderValue, 120000);
  assert.equal(acme?.invoiceValue, 90000);
  assert.equal(acme?.latestActivity, '2026-07-04');
  assert.equal(beta?.missingGroup, true);
  assert.equal(beta?.problemRecords, 1);
  assert.equal(dormant?.hasActivity, false);
}

{
  const story = buildSalesMetricStory(mapping('sales_accounts_accounts', 'Accounts'), [
    read('Customer', [
      { name: 'CUST-1', customer_name: 'Acme Robotics', customer_group: 'Enterprise', territory: 'West', customer_type: 'Company', modified: '2026-07-01' },
      { name: 'CUST-2', customer_name: 'Beta Labs', customer_group: '', territory: '', customer_type: '', modified: '2026-06-01' },
    ]),
  ]);
  const actions = buildSalesRecommendations(mapping('sales_accounts_accounts', 'Accounts'), [
    read('Customer', [
      { name: 'CUST-1', customer_name: 'Acme Robotics', customer_group: 'Enterprise', territory: 'West', customer_type: 'Company' },
      { name: 'CUST-2', customer_name: 'Beta Labs', customer_group: '', territory: '', customer_type: '' },
    ]),
  ]);

  assert.match(story.headline, /2 customer account\(s\) segmented across 2 group\(s\)/);
  assert.equal(card(story, 'segmented')?.value, 1);
  assert.equal(story.breakdowns.some(item => item.id === 'value_by_group'), true);
  assert.equal(story.evidence[0].attributes?.some(item => item.label === 'Group'), true);
  assert.equal(actions.some(action => action.label === 'Complete customer groups'), true);
  assert.equal(actions.some(action => action.label === 'Assign territories'), true);
}

{
  const story = buildSalesMetricStory(mapping('sales_accounts_customer_history', 'customer history', true), [
    read('Customer', [
      { name: 'CUST-1', customer_name: 'Acme Robotics', customer_group: 'Enterprise', territory: 'West', customer_type: 'Company', modified: '2026-07-01' },
      { name: 'CUST-2', customer_name: 'Beta Labs', customer_group: 'SMB', territory: 'East', customer_type: 'Company', modified: '2025-01-01' },
    ]),
    read('Sales Order', [
      { name: 'SO-1', customer: 'CUST-1', grand_total: 120000, status: 'To Bill', transaction_date: '2026-07-02' },
      { name: 'SO-2', customer: 'CUST-2', grand_total: 30000, status: 'On Hold', transaction_date: '2025-01-10' },
    ]),
    read('Sales Invoice', [
      { name: 'SI-1', customer: 'CUST-1', grand_total: 90000, status: 'Paid', posting_date: '2026-07-04' },
    ]),
  ]);
  const actions = buildSalesRecommendations(mapping('sales_accounts_customer_history', 'customer history', true), [
    read('Customer', [
      { name: 'CUST-1', customer_name: 'Acme Robotics', customer_group: 'Enterprise', territory: 'West', customer_type: 'Company', modified: '2026-07-01' },
      { name: 'CUST-2', customer_name: 'Beta Labs', customer_group: 'SMB', territory: 'East', customer_type: 'Company', modified: '2025-01-01' },
    ]),
    read('Sales Order', [
      { name: 'SO-1', customer: 'CUST-1', grand_total: 120000, status: 'To Bill', transaction_date: '2026-07-02' },
      { name: 'SO-2', customer: 'CUST-2', grand_total: 30000, status: 'On Hold', transaction_date: '2025-01-10' },
    ]),
    read('Sales Invoice', [
      { name: 'SI-1', customer: 'CUST-1', grand_total: 90000, status: 'Paid', posting_date: '2026-07-04' },
    ]),
  ]);

  assert.match(story.headline, /2 customer\(s\) have commercial history/);
  assert.equal(card(story, 'orders_no_invoices')?.value, 1);
  assert.equal(story.breakdowns.some(item => item.id === 'activity_recency'), true);
  assert.equal(story.breakdowns.some(item => item.id === 'value_by_group'), true);
  assert.equal(story.insights.some(item => item.id === 'problem_records'), true);
  assert.equal(story.evidence[0].attributes?.some(item => item.label === 'Invoice value'), true);
  assert.equal(actions.some(action => action.label === 'Convert orders to invoices'), true);
  assert.equal(actions.some(action => action.label === 'Resolve customer status risks'), true);
}

{
  const story = buildSalesMetricStory(mapping('sales_pipeline_leads', 'Leads'), [
    read('CRM Lead', [
      { name: 'LEAD-1', lead_name: 'Acme', status: 'Open', source: 'Website', organization: 'Acme Robotics', modified: '2026-07-01' },
      { name: 'LEAD-2', lead_name: 'Beta', status: 'Open', source: '', organization: '', modified: '2026-07-02' },
    ]),
  ]);

  assert.match(story.headline, /2 lead\(s\) tracked/);
  assert.equal(card(story, 'missing_source')?.value, 1);
  assert.equal(story.breakdowns.some(item => item.id === 'source'), true);
  assert.equal(story.evidence[0].attributes?.some(item => item.label === 'Source'), true);
}

{
  const story = buildSalesMetricStory(mapping('sales_pipeline_opportunities', 'opportunities'), [
    read('CRM Deal', [
      { name: 'DEAL-1', organization: 'Acme', status: 'Proposal/Quotation', deal_value: 50000, expected_closure_date: '2025-01-01' },
      { name: 'DEAL-2', organization: 'Beta', status: 'Lost', deal_value: 10000 },
    ]),
  ]);

  assert.equal(card(story, 'pipeline_value')?.value, '60,000');
  // CRM Deal has no separate stage field — status doubles as the stage, so a
  // deal can never be "missing stage". Guards the dealStage() fallback.
  assert.equal(card(story, 'missing_stage')?.value, 0);
  assert.equal(story.insights.some(item => item.id === 'overdue'), true);
}

{
  const story = buildSalesMetricStory(mapping('sales_performance_revenue', 'Revenue'), [
    read('Sales Order', [{ name: 'SO-1', customer: 'Acme', grand_total: 120000, status: 'To Bill', transaction_date: '2026-07-01', docstatus: 1 }]),
    read('Sales Invoice', [{ name: 'SI-1', customer: 'Acme', grand_total: 80000, status: 'Paid', posting_date: '2026-07-03', docstatus: 1 }]),
  ]);

  assert.equal(card(story, 'orders')?.value, '120,000');
  assert.equal(card(story, 'invoices')?.value, '80,000');
  assert.equal(story.breakdowns.some(item => item.id === 'value_split'), true);
}

{
  const story = buildSalesMetricStory(mapping('sales_performance_win_rate', 'win rate', true), [
    read('CRM Deal', [
      { name: 'DEAL-WON', status: 'Won', deal_value: 100 },
      { name: 'DEAL-LOST', status: 'Lost', deal_value: 50 },
      { name: 'DEAL-OPEN', status: 'Qualification', deal_value: 75 },
    ]),
  ]);

  assert.equal(card(story, 'win_rate')?.value, '50%');
  assert.equal(card(story, 'won')?.value, 1);
  assert.equal(card(story, 'lost')?.value, 1);
}

{
  const story = buildSalesMetricStory(mapping('sales_performance_conversion', 'conversion', true), [
    read('CRM Lead', [
      { name: 'LEAD-1', lead_name: 'Acme', source: 'Website' },
      { name: 'LEAD-2', lead_name: 'Beta', source: '' },
    ]),
    read('CRM Deal', [{ name: 'DEAL-1', status: 'Qualification', deal_value: 500 }]),
  ]);

  assert.equal(card(story, 'conversion')?.value, '50%');
  assert.equal(card(story, 'missing_source')?.value, 1);
}

{
  const story = buildSalesMetricStory(mapping('sales_accounts_contacts', 'contacts'), [
    read('Contact', [
      { name: 'CON-1', first_name: 'Ada', last_name: 'Lovelace', email_id: 'ada@example.com', phone: '', company_name: 'Acme' },
      { name: 'CON-2', first_name: 'No', last_name: 'Channel', email_id: '', phone: '', company_name: 'Beta' },
    ]),
  ]);
  const actions = buildSalesRecommendations(mapping('sales_accounts_contacts', 'contacts'), [
    read('Contact', [
      { name: 'CON-1', first_name: 'Ada', email_id: 'ada@example.com' },
      { name: 'CON-2', first_name: 'No', email_id: '', phone: '' },
    ]),
  ]);

  assert.equal(card(story, 'email')?.value, 1);
  assert.equal(actions.some(action => action.label === 'Complete contact details'), true);
}

{
  const story = buildSalesMetricStory(mapping('sales_pipeline_leads', 'Leads'), [read('CRM Lead', [])]);

  assert.equal(card(story, 'leads')?.value, 0);
  assert.equal(story.healthScore < 70, true);
}

// Segment breakdowns on the pipeline nodes.
{
  const story = buildSalesMetricStory(mapping('sales_pipeline_leads', 'Leads'), [
    read('CRM Lead', [
      { name: 'LEAD-1', lead_name: 'Ada', status: 'Open', source: 'Facebook', industry: 'Technology', territory: 'West', no_of_employees: '11-50' },
      { name: 'LEAD-2', lead_name: 'Bo', status: 'Open', source: 'Web', industry: 'Technology', territory: '', no_of_employees: '1-10' },
      { name: 'LEAD-3', lead_name: 'Cy', status: 'Open', source: 'Web', industry: '', territory: '', no_of_employees: '' },
    ]),
  ]);

  const industry = story.breakdowns.find(item => item.id === 'industry');
  assert.equal(industry?.items.find(item => item.label === 'Technology')?.value, 2);
  assert.equal(industry?.items.find(item => item.label === 'Missing')?.value, 1);
  assert.equal(story.breakdowns.some(item => item.id === 'territory'), true);
  assert.equal(story.breakdowns.some(item => item.id === 'size'), true);
}

// ICP segments: cross-tab formation and Missing fallback.
{
  const icp = mapping('sales_accounts_icp_segments', 'ICP segments', true);
  const reads = [
    read('CRM Organization', [
      { name: 'ORG-1', organization_name: 'Acme', industry: 'Technology', territory: 'West', no_of_employees: '51-200', annual_revenue: 5000000 },
      { name: 'ORG-2', organization_name: 'Beta', industry: 'Technology', territory: '', no_of_employees: '51-200', annual_revenue: 200000 },
      { name: 'ORG-3', organization_name: 'Gamma', industry: '', territory: '', no_of_employees: '', annual_revenue: 0 },
    ]),
    read('Customer', [
      { name: 'CUST-1', customer_name: 'Acme Robotics', customer_group: 'Enterprise', territory: 'West', industry: 'Technology', market_segment: 'Upper Income' },
    ]),
  ];
  const story = buildSalesMetricStory(icp, reads);
  const actions = buildSalesRecommendations(icp, reads);

  assert.equal(card(story, 'organizations')?.value, 3);
  assert.equal(card(story, 'won_accounts')?.value, 1);
  assert.equal(card(story, 'profiled')?.value, 2);
  assert.equal(card(story, 'missing_industry')?.value, 1);

  const grid = story.breakdowns.find(item => item.id === 'icp_grid');
  assert.equal(grid?.items.find(item => item.label === 'Technology · 51-200')?.value, 2);
  // Unset dimensions must fall back to Missing, not be dropped — otherwise the grid
  // silently under-reports its own coverage.
  assert.equal(grid?.items.some(item => item.label === 'Missing · Missing'), true);
  assert.equal(story.breakdowns.some(item => item.id === 'customer_market_segment'), true);
  assert.equal(actions.some(action => action.label === 'Set organization industries'), true);
}

// The real tenant shape (verified 2026-07-22 against erp-asd-g9bi.localhost): organizations
// fully carry industry and size, NO organization has a territory, and there are no Customer
// rows at all. Territory must not be scored, or every tenant that simply does not use CRM
// territories reads as unhealthy.
//
// `territory: null` is deliberate — Frappe returns null, not '', for an unset Link field, and
// Frappe treats the two as distinct. Asserting against '' here would pass while production
// silently behaved differently.
{
  const icp = mapping('sales_accounts_icp_segments', 'ICP segments', true);
  const reads = [
    read('CRM Organization', [
      { name: 'ORG-1', organization_name: 'Acme', industry: 'Technology', territory: null, no_of_employees: '1-10', annual_revenue: 100000 },
      { name: 'ORG-2', organization_name: 'Beta', industry: 'Defense', territory: null, no_of_employees: '1-10', annual_revenue: 90000 },
    ]),
    read('Customer', []),
  ];
  const story = buildSalesMetricStory(icp, reads);
  const actions = buildSalesRecommendations(icp, reads);

  assert.equal(card(story, 'missing_industry')?.value, 0);
  assert.equal(card(story, 'won_accounts')?.value, 0);
  // Only the 'partial' penalty applies — no territory penalty.
  assert.equal(story.healthScore, 82);
  // The territory breakdown still renders, entirely Missing, rather than vanishing.
  const territory = story.breakdowns.find(item => item.id === 'org_territory');
  assert.equal(territory?.items.length, 1);
  assert.equal(territory?.items[0].label, 'Missing');
  assert.equal(story.insights.some(item => item.id === 'territory_unused'), true);
  assert.equal(story.insights.some(item => item.id === 'no_won_accounts'), true);
  assert.equal(actions.some(action => action.label === 'Set organization industries'), false);
}

// Both doctypes empty must not throw.
{
  const icp = mapping('sales_accounts_icp_segments', 'ICP segments', true);
  const story = buildSalesMetricStory(icp, [read('CRM Organization', []), read('Customer', [])]);

  assert.equal(card(story, 'organizations')?.value, 0);
  assert.equal(story.breakdowns.find(item => item.id === 'icp_grid')?.items.length, 0);
  assert.equal(story.evidence.length, 0);
}

// Regression guard for the silent-empty-dashboard failure mode.
//
// The story builders look rows up by doctype *string* (`rowsFor(reads, 'CRM
// Deal')`). If a mapping in erpnextSales.ts is repointed to a different doctype
// and its story builder is not updated to match, rowsFor returns [] — the node
// renders a confident, empty, entirely wrong summary with no error anywhere.
// That is exactly what happened during the Frappe CRM migration.
//
// So: every doctype a mapping reads must be referenced by the stories module.
{
  const storiesSource = await readFile(
    new URL('../src/domains/workos-erp/erpnextSalesStories.ts', import.meta.url),
    'utf8',
  );
  const orphans = [];
  for (const [key, doctypes] of Object.entries(MAPPING_SOURCE_DOCTYPES)) {
    for (const doctype of doctypes) {
      if (!storiesSource.includes(`'${doctype}'`)) orphans.push(`${key} -> ${doctype}`);
    }
  }
  assert.deepEqual(
    orphans,
    [],
    `Mapping doctypes never referenced in erpnextSalesStories.ts (their stories would silently render empty):\n  ${orphans.join('\n  ')}`,
  );
}

console.log('salesStories.test.mjs passed');
