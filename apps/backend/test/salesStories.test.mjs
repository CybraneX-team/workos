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
