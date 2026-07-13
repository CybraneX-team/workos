import type { ErpNextGenericRecord } from '../adapters/erpnext.js';

export type SalesTemplateKey = 'generic' | 'rollup' | 'unsupported';
export type SalesTone = 'good' | 'neutral' | 'warning' | 'critical';

export interface SalesMetricCard {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  description: string;
  tone: SalesTone;
}

export interface SalesBreakdownItem {
  label: string;
  value: number | string;
  unit?: string;
  tone?: SalesTone;
}

export interface SalesBreakdown {
  id: string;
  title: string;
  items: SalesBreakdownItem[];
}

export interface SalesInsight {
  id: string;
  label: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface SalesEvidenceAttribute {
  label: string;
  value: string | number;
  tone?: SalesTone;
}

export interface SalesEvidence {
  id: string;
  label: string;
  sourceDoctype: string;
  sourceId: string;
  detail?: string;
  status?: string;
  attributes?: SalesEvidenceAttribute[];
}

export interface SalesRecommendation {
  label: string;
  reason: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ReadDefinition {
  doctype: string;
  fields: string[];
  filters?: unknown[];
}

export type ReadResult = { ok: true; rows: ErpNextGenericRecord[] } | { ok: false; rows: []; error: string };
export type ReadBundle = Array<{ definition: ReadDefinition; result: ReadResult }>;

export interface SalesStoryMapping {
  key: string;
  label: string;
  status?: 'partial' | 'unsupported';
  partialReason?: string;
}

export interface MetricStory {
  templateKey: SalesTemplateKey;
  headline: string;
  healthScore: number;
  metricCards: SalesMetricCard[];
  breakdowns: SalesBreakdown[];
  insights: SalesInsight[];
  evidence: SalesEvidence[];
}

type StoryBuilder = (mappingDef: SalesStoryMapping, reads: ReadBundle) => MetricStory;

export interface CustomerRollup {
  id: string;
  name: string;
  group?: string;
  territory?: string;
  type?: string;
  orderCount: number;
  invoiceCount: number;
  orderValue: number;
  invoiceValue: number;
  latestActivity?: string;
  openRecords: number;
  problemRecords: number;
  missingGroup: boolean;
  missingTerritory: boolean;
  missingType: boolean;
  hasActivity: boolean;
}

export function sumNumber(rows: ErpNextGenericRecord[], key: string): number {
  return rows.reduce((total, row) => total + numberValue(row[key]), 0);
}

export function countBy(rows: ErpNextGenericRecord[], selector: string | ((row: ErpNextGenericRecord) => unknown), fallback = 'Missing'): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = typeof selector === 'string' ? row[selector] : selector(row);
    const label = isMissing(raw) ? fallback : String(raw);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

export function latestDate(rows: ErpNextGenericRecord[], keys: string[]): string | undefined {
  const dates = rows.flatMap(row => keys.map(key => dateValue(row[key]))).filter((date): date is Date => Boolean(date));
  if (dates.length === 0) return undefined;
  return formatDate(new Date(Math.max(...dates.map(date => date.getTime()))).toISOString());
}

export function daysBetween(start: unknown, end: unknown): number | null {
  const startDate = dateValue(start);
  const endDate = dateValue(end);
  if (!startDate || !endDate) return null;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

export function isMissing(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

export function money(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function percent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function buildSalesMetricStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  return (STORY_BUILDERS[mappingDef.key] ?? buildGenericStory)(mappingDef, reads);
}

export function buildCustomerRollups(reads: ReadBundle): CustomerRollup[] {
  const customers = rowsFor(reads, 'Customer');
  const orders = rowsFor(reads, 'Sales Order');
  const invoices = rowsFor(reads, 'Sales Invoice');
  const rollups = new Map<string, CustomerRollup>();

  const ensure = (id: unknown, fallbackName?: unknown): CustomerRollup => {
    const key = isMissing(id) ? String(fallbackName ?? 'Unknown customer') : String(id);
    const existing = rollups.get(key);
    if (existing) return existing;
    const next: CustomerRollup = {
      id: key,
      name: String(fallbackName ?? key),
      orderCount: 0,
      invoiceCount: 0,
      orderValue: 0,
      invoiceValue: 0,
      openRecords: 0,
      problemRecords: 0,
      missingGroup: true,
      missingTerritory: true,
      missingType: true,
      hasActivity: false,
    };
    rollups.set(key, next);
    return next;
  };

  for (const customer of customers) {
    const rollup = ensure(customer.name, customer.customer_name);
    rollup.name = String(customer.customer_name ?? customer.name);
    rollup.group = isMissing(customer.customer_group) ? undefined : String(customer.customer_group);
    rollup.territory = isMissing(customer.territory) ? undefined : String(customer.territory);
    rollup.type = isMissing(customer.customer_type) ? undefined : String(customer.customer_type);
    rollup.missingGroup = !rollup.group;
    rollup.missingTerritory = !rollup.territory;
    rollup.missingType = !rollup.type;
    rollup.latestActivity = maxDateString(rollup.latestActivity, customer.modified, customer.creation);
  }

  for (const order of orders) {
    const rollup = ensure(order.customer);
    rollup.orderCount += 1;
    rollup.orderValue += numberValue(order.grand_total);
    rollup.hasActivity = true;
    rollup.latestActivity = maxDateString(rollup.latestActivity, order.transaction_date, order.modified, order.creation);
    if (isOpenStatus(order.status)) rollup.openRecords += 1;
    if (isProblemStatus(order.status)) rollup.problemRecords += 1;
  }

  for (const invoice of invoices) {
    const rollup = ensure(invoice.customer);
    rollup.invoiceCount += 1;
    rollup.invoiceValue += numberValue(invoice.grand_total);
    rollup.hasActivity = true;
    rollup.latestActivity = maxDateString(rollup.latestActivity, invoice.posting_date, invoice.modified, invoice.creation);
    if (isOpenStatus(invoice.status)) rollup.openRecords += 1;
    if (isProblemStatus(invoice.status)) rollup.problemRecords += 1;
  }

  return [...rollups.values()].sort((a, b) => (b.invoiceValue + b.orderValue) - (a.invoiceValue + a.orderValue));
}

export function buildSalesRecommendations(mappingDef: SalesStoryMapping, reads: ReadBundle): SalesRecommendation[] {
  const failed = reads.filter(read => !read.result.ok);
  const rows = successfulRows(reads);
  const problem = problemRows(reads);
  const storyRecommendations = recommendationBuilders[mappingDef.key]?.(rows, reads) ?? [];
  const recommendations: SalesRecommendation[] = [];

  if (mappingDef.partialReason) {
    recommendations.push({ label: 'Partial WorkOS coverage', reason: mappingDef.partialReason, severity: 'info' });
  }
  if (failed.length > 0) {
    recommendations.push({ label: 'Verify WorkOS doctypes', reason: `${failed.length} mapped doctype(s) could not be read on this site.`, severity: 'warning' });
  }
  recommendations.push(...storyRecommendations);
  if (problem.length > 0 && !recommendations.some(action => action.label === 'Review attention statuses')) {
    recommendations.push({ label: 'Review attention statuses', reason: `${problem.length} WorkOS record(s) have lost, cancelled, overdue, or held statuses.`, severity: 'warning' });
  }
  if (rows.length === 0 && failed.length === 0) {
    recommendations.push({ label: 'No WorkOS records yet', reason: `No ${mappingDef.label} records were returned for this company site.`, severity: 'info' });
  }

  return recommendations;
}

function rowsFor(reads: ReadBundle, doctype: string): ErpNextGenericRecord[] {
  return reads.filter(read => read.definition.doctype === doctype).flatMap(read => read.result.rows);
}

function successfulRows(reads: ReadBundle): ErpNextGenericRecord[] {
  return reads.flatMap(read => read.result.rows);
}

function problemRows(reads: ReadBundle): ErpNextGenericRecord[] {
  return successfulRows(reads).filter(row => isProblemStatus(row.status ?? row.sales_stage));
}

function numberValue(value: unknown): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function dateValue(value: unknown): Date | null {
  if (isMissing(value)) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: unknown): string | undefined {
  const date = dateValue(value);
  return date ? date.toISOString().slice(0, 10) : undefined;
}

function maxDateString(...values: unknown[]): string | undefined {
  const dates = values.map(dateValue).filter((date): date is Date => Boolean(date));
  if (dates.length === 0) return undefined;
  return formatDate(new Date(Math.max(...dates.map(date => date.getTime()))).toISOString());
}

function compactAttributes(attributes: Array<SalesEvidenceAttribute | false | undefined>): SalesEvidenceAttribute[] {
  return attributes.filter((attribute): attribute is SalesEvidenceAttribute => Boolean(attribute));
}

function isOpenStatus(status: unknown): boolean {
  if (typeof status !== 'string' || !status) return true;
  return !/closed|cancelled|completed|stopped|delivered|received|billed|resolved|lost|won/i.test(status);
}

function isProblemStatus(status: unknown): boolean {
  return typeof status === 'string' && /fail|reject|cancel|overdue|late|hold|stopped|lost/i.test(status);
}

function isWonStatus(status: unknown): boolean {
  return typeof status === 'string' && /won|converted/i.test(status);
}

function isLostStatus(status: unknown): boolean {
  return typeof status === 'string' && /lost|reject/i.test(status);
}

function isOverdue(row: ErpNextGenericRecord): boolean {
  const expected = dateValue(row.expected_closing);
  if (!expected) return false;
  return expected.getTime() < Date.now() && isOpenStatus(row.status ?? row.sales_stage);
}

function metricCard(id: string, label: string, value: number | string, description: string, tone: SalesTone = 'neutral', unit?: string): SalesMetricCard {
  return { id, label, value, unit, description, tone };
}

function insight(id: string, label: string, detail: string, severity: SalesInsight['severity'] = 'info'): SalesInsight {
  return { id, label, detail, severity };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function score(totalRecords: number, penalties: number, partial = false): number {
  return clampScore((totalRecords > 0 ? 88 : 58) - penalties - (partial ? 6 : 0));
}

function breakdownFromCounts(id: string, title: string, counts: Map<string, number>, toneFor?: (label: string) => SalesTone | undefined): SalesBreakdown {
  return {
    id,
    title,
    items: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, tone: toneFor?.(label) })),
  };
}

function valueSplitBreakdown(id: string, title: string, entries: Array<{ label: string; value: number; tone?: SalesTone }>): SalesBreakdown {
  return {
    id,
    title,
    items: entries.filter(entry => entry.value > 0).map(entry => ({ ...entry, value: money(entry.value) })),
  };
}

function defaultEvidence(reads: ReadBundle): SalesEvidence[] {
  return reads.flatMap(({ definition, result }) => result.rows.slice(0, 5).map(record => ({
    id: `${definition.doctype}:${record.name}`,
    label: String(record.customer_name ?? record.customer ?? record.lead_name ?? record.party_name ?? record.territory_name ?? record.name),
    sourceDoctype: definition.doctype,
    sourceId: record.name,
    detail: formatDate(record.posting_date ?? record.transaction_date ?? record.expected_closing ?? record.modified ?? record.creation),
    status: typeof record.status === 'string' ? record.status : (typeof record.sales_stage === 'string' ? record.sales_stage : undefined),
  }))).slice(0, 24);
}

function evidence(reads: ReadBundle, build: (definition: ReadDefinition, record: ErpNextGenericRecord) => SalesEvidence): SalesEvidence[] {
  return reads.flatMap(({ definition, result }) => result.rows.slice(0, 5).map(record => build(definition, record))).slice(0, 24);
}

function buildGenericStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const rows = successfulRows(reads);
  const attention = problemRows(reads).length;
  return {
    templateKey: 'generic',
    headline: `${rows.length} WorkOS record(s) are connected to "${mappingDef.label}" in Sales.`,
    healthScore: score(rows.length, attention * 8, mappingDef.status === 'partial'),
    metricCards: [
      metricCard('records', 'Connected records', rows.length, 'WorkOS records found for this node.'),
      metricCard('attention', 'Attention statuses', attention, 'Records with lost/cancelled/overdue/held statuses.', attention > 0 ? 'warning' : 'good'),
    ],
    breakdowns: [breakdownFromCounts('source_mix', 'WorkOS source mix', countBy(rows, row => row.doctype ?? 'Record'))],
    insights: [
      insight('connected', 'Connected evidence', `${rows.length} WorkOS records were read for this Sales node in the current window.`),
    ],
    evidence: defaultEvidence(reads),
  };
}

function countRollups(rollups: CustomerRollup[], selector: (rollup: CustomerRollup) => unknown, fallback = 'Missing'): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rollup of rollups) {
    const raw = selector(rollup);
    const label = isMissing(raw) ? fallback : String(raw);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

function valueByGroup(rollups: CustomerRollup[]): Array<{ label: string; value: number; tone?: SalesTone }> {
  const values = new Map<string, number>();
  for (const rollup of rollups) {
    const group = rollup.group ?? 'Missing';
    values.set(group, (values.get(group) ?? 0) + rollup.orderValue + rollup.invoiceValue);
  }
  return [...values.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value, tone: label === 'Missing' ? 'warning' as const : undefined }));
}

function activityRecencyCounts(rollups: CustomerRollup[]): Map<string, number> {
  const counts = new Map<string, number>([
    ['Last 30 days', 0],
    ['31-90 days', 0],
    ['Over 90 days', 0],
    ['No activity', 0],
  ]);
  const now = Date.now();
  for (const rollup of rollups) {
    const latest = dateValue(rollup.latestActivity);
    const label = !latest
      ? 'No activity'
      : Math.round((now - latest.getTime()) / 86_400_000) <= 30
        ? 'Last 30 days'
        : Math.round((now - latest.getTime()) / 86_400_000) <= 90
          ? '31-90 days'
          : 'Over 90 days';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

function staleCustomerCount(rollups: CustomerRollup[], days = 90): number {
  const now = Date.now();
  return rollups.filter(rollup => {
    const latest = dateValue(rollup.latestActivity);
    return !latest || Math.round((now - latest.getTime()) / 86_400_000) > days;
  }).length;
}

function customerValue(rollup: CustomerRollup): number {
  return rollup.orderValue + rollup.invoiceValue;
}

function customerEvidence(rollups: CustomerRollup[], sourceDoctype: string): SalesEvidence[] {
  return rollups.slice(0, 24).map(rollup => {
    const value = rollup.invoiceValue || rollup.orderValue;
    const risk = rollup.problemRecords > 0
      ? `${rollup.problemRecords} problem`
      : rollup.openRecords > 0
        ? `${rollup.openRecords} open`
        : undefined;
    return {
      id: `${sourceDoctype}:${rollup.id}`,
      label: rollup.name,
      sourceDoctype,
      sourceId: rollup.id,
      detail: value > 0 ? money(value) : rollup.latestActivity,
      status: risk,
      attributes: compactAttributes([
        rollup.group ? { label: 'Group', value: rollup.group } : undefined,
        rollup.territory ? { label: 'Territory', value: rollup.territory } : undefined,
        rollup.type ? { label: 'Type', value: rollup.type } : undefined,
        { label: 'Order value', value: money(rollup.orderValue) },
        { label: 'Invoice value', value: money(rollup.invoiceValue) },
        { label: 'Orders', value: rollup.orderCount },
        { label: 'Invoices', value: rollup.invoiceCount },
        rollup.latestActivity ? { label: 'Latest activity', value: rollup.latestActivity } : undefined,
        risk ? { label: 'Status risk', value: risk, tone: rollup.problemRecords > 0 ? 'warning' : 'neutral' } : undefined,
      ]),
    };
  });
}

function accountsStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const rollups = buildCustomerRollups(reads);
  const missingTerritory = rollups.filter(row => row.missingTerritory).length;
  const missingGroup = rollups.filter(row => row.missingGroup).length;
  const missingType = rollups.filter(row => row.missingType).length;
  const segmented = rollups.length - rollups.filter(row => row.missingGroup || row.missingTerritory || row.missingType).length;
  const customerGroupCount = countRollups(rollups, row => row.group ?? 'Missing').size;
  return {
    templateKey: 'generic',
    headline: `${rollups.length} customer account(s) segmented across ${customerGroupCount} group(s); ${missingTerritory} missing territory.`,
    healthScore: score(rollups.length, missingTerritory * 4 + missingGroup * 3 + missingType * 2),
    metricCards: [
      metricCard('accounts', 'Customer accounts', rollups.length, 'Customer records available in WorkOS.'),
      metricCard('segmented', 'Fully segmented', segmented, 'Customers with group, territory, and type.', segmented === rollups.length ? 'good' : 'neutral'),
      metricCard('territory', 'Missing territory', missingTerritory, 'Accounts without territory assignment.', missingTerritory ? 'warning' : 'good'),
      metricCard('group', 'Missing group', missingGroup, 'Accounts without customer-group segmentation.', missingGroup ? 'warning' : 'good'),
    ],
    breakdowns: [
      breakdownFromCounts('customer_group', 'Customer group mix', countRollups(rollups, row => row.group ?? 'Missing')),
      breakdownFromCounts('territory', 'Territory mix', countRollups(rollups, row => row.territory ?? 'Missing')),
      breakdownFromCounts('customer_type', 'Customer type mix', countRollups(rollups, row => row.type ?? 'Missing')),
      valueSplitBreakdown('value_by_group', 'Value by customer group', valueByGroup(rollups)),
    ],
    insights: [
      insight('segmentation', 'Account segmentation', `${rollups.length - missingGroup} account(s) have a customer group and ${rollups.length - missingTerritory} have a territory.`),
      ...(missingTerritory ? [insight('missing_territory', 'Territory cleanup', `${missingTerritory} customer account(s) cannot be read by territory yet.`, 'warning')] : []),
      ...(missingType ? [insight('missing_type', 'Customer type gap', `${missingType} customer account(s) are missing customer type.`, 'warning')] : []),
    ],
    evidence: customerEvidence(rollups, 'Customer'),
  };
}

function contactsStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const contacts = rowsFor(reads, 'Contact');
  const missingEmail = contacts.filter(row => isMissing(row.email_id)).length;
  const missingPhone = contacts.filter(row => isMissing(row.phone)).length;
  const usable = contacts.length - contacts.filter(row => isMissing(row.email_id) && isMissing(row.phone)).length;
  return {
    templateKey: 'generic',
    headline: `${contacts.length} contact(s); ${usable} have at least one usable outreach channel.`,
    healthScore: score(contacts.length, missingEmail * 3 + missingPhone * 2),
    metricCards: [
      metricCard('contacts', 'Contacts', contacts.length, 'Contact records available in WorkOS.'),
      metricCard('email', 'Missing email', missingEmail, 'Contacts without email addresses.', missingEmail ? 'warning' : 'good'),
      metricCard('phone', 'Missing phone', missingPhone, 'Contacts without phone numbers.', missingPhone ? 'warning' : 'good'),
    ],
    breakdowns: [breakdownFromCounts('company', 'Company coverage', countBy(contacts, 'company_name'))],
    insights: [
      insight('coverage', 'Reachability', `${usable} contact(s) have email or phone data available for follow-up.`),
      ...(missingEmail ? [insight('missing_email', 'Email gaps', `${missingEmail} contact(s) are missing email addresses.`, 'warning')] : []),
    ],
    evidence: evidence(reads, (definition, record) => {
      const name = [record.first_name, record.last_name].filter(Boolean).join(' ') || record.name;
      return {
        id: `${definition.doctype}:${record.name}`,
        label: name,
        sourceDoctype: definition.doctype,
        sourceId: record.name,
        detail: String(record.company_name ?? ''),
        attributes: compactAttributes([
          !isMissing(record.email_id) && { label: 'Email', value: String(record.email_id) },
          !isMissing(record.phone) && { label: 'Phone', value: String(record.phone) },
          !isMissing(record.company_name) && { label: 'Company', value: String(record.company_name) },
        ]),
      };
    }),
  };
}

function customerHistoryStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const rollups = buildCustomerRollups(reads);
  const active = rollups.filter(row => row.hasActivity);
  const orderValue = rollups.reduce((total, row) => total + row.orderValue, 0);
  const invoiceValue = rollups.reduce((total, row) => total + row.invoiceValue, 0);
  const orders = rollups.reduce((total, row) => total + row.orderCount, 0);
  const invoices = rollups.reduce((total, row) => total + row.invoiceCount, 0);
  const openRecords = rollups.reduce((total, row) => total + row.openRecords, 0);
  const problemRecords = rollups.reduce((total, row) => total + row.problemRecords, 0);
  const topTenInvoiceValue = rollups.slice(0, 10).reduce((total, row) => total + row.invoiceValue, 0);
  const ordersWithoutInvoices = rollups.filter(row => row.orderCount > 0 && row.invoiceCount === 0).length;
  return {
    templateKey: 'generic',
    headline: `${active.length} customer(s) have commercial history; top 10 account for ${percent(topTenInvoiceValue, invoiceValue)} of invoice value.`,
    healthScore: score(rollups.length, problemRecords * 8 + ordersWithoutInvoices * 4, true),
    metricCards: [
      metricCard('customers', 'Active customers', active.length, 'Customers with orders or invoices in this read window.'),
      metricCard('orders', 'Order value', money(orderValue), 'Sales Order value in the read window.'),
      metricCard('invoices', 'Invoice value', money(invoiceValue), 'Sales Invoice value in the read window.'),
      metricCard('open', 'Open records', openRecords, 'Customer-linked orders or invoices still open.', openRecords ? 'warning' : 'good'),
      metricCard('orders_no_invoices', 'Orders not invoiced', ordersWithoutInvoices, 'Customers with orders but no invoice in this window.', ordersWithoutInvoices ? 'warning' : 'good'),
    ],
    breakdowns: [
      breakdownFromCounts('source_mix', 'WorkOS source mix', new Map([['Customer', rollups.length], ['Sales Order', orders], ['Sales Invoice', invoices]])),
      valueSplitBreakdown('commercial_value', 'Commercial value split', [
        { label: 'Sales Order', value: orderValue },
        { label: 'Sales Invoice', value: invoiceValue },
      ]),
      valueSplitBreakdown('value_by_group', 'Value by customer group', valueByGroup(rollups)),
      breakdownFromCounts('activity_recency', 'Activity recency', activityRecencyCounts(rollups)),
    ],
    insights: [
      insight('activity', 'Commercial activity', `Latest activity: ${latestDate(successfulRows(reads), ['posting_date', 'transaction_date', 'modified', 'creation']) ?? 'none in window'}.`),
      ...(ordersWithoutInvoices ? [insight('orders_without_invoices', 'Invoice follow-up', `${ordersWithoutInvoices} customer(s) have order activity but no invoice in this read window.`, 'warning')] : []),
      ...(problemRecords ? [insight('problem_records', 'Status risk', `${problemRecords} customer-linked commercial record(s) have problem statuses.`, 'warning')] : []),
    ],
    evidence: customerEvidence(rollups, 'Customer rollup'),
  };
}

function leadsStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const leads = rowsFor(reads, 'Lead');
  const open = leads.filter(row => isOpenStatus(row.status)).length;
  const missingSource = leads.filter(row => isMissing(leadSource(row))).length;
  const missingCompany = leads.filter(row => isMissing(row.company_name)).length;
  return {
    templateKey: 'generic',
    headline: `${leads.length} lead(s) tracked; ${open} open and ${missingSource} missing source.`,
    healthScore: score(leads.length, missingSource * 4 + missingCompany * 3 + problemRows(reads).length * 8),
    metricCards: [
      metricCard('leads', 'Total leads', leads.length, 'Lead records in WorkOS.'),
      metricCard('open', 'Open leads', open, 'Leads not marked closed, won, lost, or stopped.'),
      metricCard('missing_source', 'Missing source', missingSource, 'Leads without acquisition-source attribution.', missingSource ? 'warning' : 'good'),
    ],
    breakdowns: [
      breakdownFromCounts('status', 'Lead status mix', countBy(leads, 'status', 'No status'), label => isProblemStatus(label) ? 'warning' : undefined),
      breakdownFromCounts('source', 'Lead source mix', countBy(leads, leadSource)),
    ],
    insights: [
      insight('lead_pool', 'Lead pool quality', `${leads.length - missingCompany} lead(s) include company context and ${leads.length - missingSource} include source attribution.`),
      ...(missingSource ? [insight('source_gap', 'Attribution gap', `${missingSource} lead(s) cannot be tied back to a source.`, 'warning')] : []),
    ],
    evidence: evidence(reads, (definition, record) => ({
      id: `${definition.doctype}:${record.name}`,
      label: String(record.lead_name ?? record.name),
      sourceDoctype: definition.doctype,
      sourceId: record.name,
      detail: String(record.company_name ?? ''),
      status: typeof record.status === 'string' ? record.status : undefined,
      attributes: compactAttributes([
        !isMissing(leadSource(record)) && { label: 'Source', value: String(leadSource(record)) },
        !isMissing(record.company_name) && { label: 'Company', value: String(record.company_name) },
        !isMissing(record.modified) && { label: 'Updated', value: String(record.modified) },
      ]),
    })),
  };
}

function opportunityStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const opportunities = rowsFor(reads, 'Opportunity');
  const value = sumNumber(opportunities, 'opportunity_amount');
  const open = opportunities.filter(row => isOpenStatus(row.status ?? row.sales_stage)).length;
  const missingStage = opportunities.filter(row => isMissing(row.sales_stage)).length;
  const overdue = opportunities.filter(isOverdue).length;
  return {
    templateKey: 'generic',
    headline: `${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'} worth ${money(value)}; ${open} open and ${missingStage} missing stage.`,
    healthScore: score(opportunities.length, missingStage * 5 + overdue * 8 + problemRows(reads).length * 8, mappingDef.status === 'partial'),
    metricCards: [
      metricCard('opportunities', 'Opportunities', opportunities.length, 'Opportunity records in WorkOS.'),
      metricCard('pipeline_value', 'Pipeline value', money(value), 'Opportunity amount in the read window.'),
      metricCard('missing_stage', 'Missing stage', missingStage, 'Opportunities without sales stage.', missingStage ? 'warning' : 'good'),
      metricCard('overdue', 'Overdue closes', overdue, 'Open opportunities past expected close.', overdue ? 'warning' : 'good'),
    ],
    breakdowns: [
      breakdownFromCounts('stage', 'Stage mix', countBy(opportunities, 'sales_stage', 'No stage')),
      breakdownFromCounts('status', 'Status mix', countBy(opportunities, 'status', 'No status'), label => isProblemStatus(label) ? 'warning' : undefined),
    ],
    insights: [
      insight('pipeline', 'Pipeline shape', `${open} open opportunit${open === 1 ? 'y is' : 'ies are'} carrying ${money(sumNumber(opportunities.filter(row => isOpenStatus(row.status ?? row.sales_stage)), 'opportunity_amount'))} in value.`),
      ...(overdue ? [insight('overdue', 'Close-date risk', `${overdue} open opportunit${overdue === 1 ? 'y is' : 'ies are'} past expected close.`, 'warning')] : []),
    ],
    evidence: opportunityEvidence(reads),
  };
}

function dealStagesStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const opportunities = rowsFor(reads, 'Opportunity');
  const missingStage = opportunities.filter(row => isMissing(row.sales_stage)).length;
  const stageCounts = countBy(opportunities, 'sales_stage', 'No stage');
  const topStage = [...stageCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    templateKey: 'generic',
    headline: `${opportunities.length} deal(s) distributed across ${stageCounts.size} stage bucket(s); top bucket is ${topStage?.[0] ?? 'none'}.`,
    healthScore: score(opportunities.length, missingStage * 6 + problemRows(reads).length * 8, true),
    metricCards: [
      metricCard('deals', 'Deals staged', opportunities.length, 'Opportunity records with stage context.'),
      metricCard('stage_buckets', 'Stage buckets', stageCounts.size, 'Distinct sales stages represented.'),
      metricCard('missing_stage', 'Missing stage', missingStage, 'Deals without stage assignment.', missingStage ? 'warning' : 'good'),
    ],
    breakdowns: [breakdownFromCounts('stage', 'Deal stage distribution', stageCounts)],
    insights: [insight('stage_focus', 'Stage concentration', topStage ? `${topStage[1]} deal(s) sit in "${topStage[0]}".` : 'No stage data is available yet.')],
    evidence: opportunityEvidence(reads),
  };
}

function pipelineCoverageStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const opportunities = rowsFor(reads, 'Opportunity');
  const open = opportunities.filter(row => isOpenStatus(row.status ?? row.sales_stage));
  const openValue = sumNumber(open, 'opportunity_amount');
  const overdue = open.filter(isOverdue).length;
  const noClose = open.filter(row => isMissing(row.expected_closing)).length;
  return {
    templateKey: 'generic',
    headline: `${open.length} open opportunit${open.length === 1 ? 'y' : 'ies'} carry ${money(openValue)} in pipeline coverage; ${overdue} are overdue.`,
    healthScore: score(opportunities.length, overdue * 10 + noClose * 4, true),
    metricCards: [
      metricCard('open_pipeline', 'Open pipeline', money(openValue), 'Open Opportunity amount in WorkOS.'),
      metricCard('open_deals', 'Open deals', open.length, 'Opportunities still in flight.'),
      metricCard('overdue', 'Overdue closes', overdue, 'Open deals past expected close.', overdue ? 'warning' : 'good'),
      metricCard('missing_close', 'Missing close date', noClose, 'Open deals without expected closing.', noClose ? 'warning' : 'good'),
    ],
    breakdowns: [breakdownFromCounts('expected_close', 'Expected close mix', countBy(open, row => formatDate(row.expected_closing) ?? 'No close date'))],
    insights: [insight('coverage', 'Coverage visibility', `${open.length - noClose} open deal(s) include expected close dates for pipeline timing.`)],
    evidence: opportunityEvidence(reads),
  };
}

function proposalsStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const quotations = rowsFor(reads, 'Quotation');
  const value = sumNumber(quotations, 'grand_total');
  const problem = problemRows(reads).length;
  return {
    templateKey: 'generic',
    headline: `${quotations.length} proposal quotation(s) worth ${money(value)}; ${problem} need attention.`,
    healthScore: score(quotations.length, problem * 8, true),
    metricCards: [
      metricCard('proposals', 'Proposals', quotations.length, 'WorkOS Quotation records.'),
      metricCard('proposal_value', 'Proposal value', money(value), 'Quotation grand total in the read window.'),
      metricCard('attention', 'Attention statuses', problem, 'Cancelled, rejected, held, or lost proposal statuses.', problem ? 'warning' : 'good'),
    ],
    breakdowns: [
      breakdownFromCounts('status', 'Proposal status mix', countBy(quotations, 'status', 'No status'), label => isProblemStatus(label) ? 'warning' : undefined),
      breakdownFromCounts('party', 'Proposal party mix', countBy(quotations, 'party_name')),
    ],
    insights: [insight('proposal_value', 'Proposal value', `The proposal view is using WorkOS Quotations as the v1 proposal proxy.`)],
    evidence: commercialEvidence(reads),
  };
}

function territoriesStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const territories = rowsFor(reads, 'Territory');
  const groups = territories.filter(row => row.is_group === 1 || row.is_group === '1').length;
  const leaves = territories.length - groups;
  const missingParent = territories.filter(row => isMissing(row.parent_territory)).length;
  return {
    templateKey: 'generic',
    headline: `${territories.length} territor${territories.length === 1 ? 'y' : 'ies'} mapped; ${groups} group nodes and ${leaves} selling territories.`,
    healthScore: score(territories.length, missingParent * 2),
    metricCards: [
      metricCard('territories', 'Territories', territories.length, 'Territory records in WorkOS.'),
      metricCard('groups', 'Group territories', groups, 'Territory records marked as groups.'),
      metricCard('leaf', 'Leaf territories', leaves, 'Selling territory leaves.'),
    ],
    breakdowns: [breakdownFromCounts('parent', 'Parent territory mix', countBy(territories, 'parent_territory'))],
    insights: [insight('structure', 'Territory structure', `${leaves} territory records appear usable as selling territories.`)],
    evidence: evidence(reads, (definition, record) => ({
      id: `${definition.doctype}:${record.name}`,
      label: String(record.territory_name ?? record.name),
      sourceDoctype: definition.doctype,
      sourceId: record.name,
      detail: String(record.parent_territory ?? ''),
      attributes: compactAttributes([
        !isMissing(record.parent_territory) && { label: 'Parent', value: String(record.parent_territory) },
        { label: 'Type', value: record.is_group === 1 || record.is_group === '1' ? 'Group' : 'Leaf' },
      ]),
    })),
  };
}

function revenueStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const orders = rowsFor(reads, 'Sales Order');
  const invoices = rowsFor(reads, 'Sales Invoice');
  const orderValue = sumNumber(orders, 'grand_total');
  const invoiceValue = sumNumber(invoices, 'grand_total');
  const open = successfulRows(reads).filter(row => isOpenStatus(row.status)).length;
  return {
    templateKey: 'generic',
    headline: `${money(orderValue)} booked in Sales Orders and ${money(invoiceValue)} invoiced across ${orders.length + invoices.length} commercial record(s).`,
    healthScore: score(orders.length + invoices.length, problemRows(reads).length * 8),
    metricCards: [
      metricCard('orders', 'Order value', money(orderValue), 'Sales Order grand total in the read window.'),
      metricCard('invoices', 'Invoice value', money(invoiceValue), 'Sales Invoice grand total in the read window.'),
      metricCard('open', 'Open commercial records', open, 'Orders or invoices not in a closed terminal status.'),
    ],
    breakdowns: [
      valueSplitBreakdown('value_split', 'Revenue value split', [
        { label: 'Sales Order', value: orderValue },
        { label: 'Sales Invoice', value: invoiceValue },
      ]),
      breakdownFromCounts('status', 'Commercial status mix', countBy(successfulRows(reads), 'status', 'No status')),
    ],
    insights: [insight('revenue_split', 'Revenue split', `Invoice value is ${percent(invoiceValue, Math.max(orderValue, 1))} of order value in this read window.`)],
    evidence: commercialEvidence(reads),
  };
}

function bookingsStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const orders = rowsFor(reads, 'Sales Order');
  const value = sumNumber(orders, 'grand_total');
  const open = orders.filter(row => isOpenStatus(row.status)).length;
  const customers = countBy(orders, 'customer');
  return {
    templateKey: 'generic',
    headline: `${orders.length} booking order(s) worth ${money(value)}; ${open} still open.`,
    healthScore: score(orders.length, problemRows(reads).length * 8),
    metricCards: [
      metricCard('bookings', 'Bookings', orders.length, 'Sales Orders in the read window.'),
      metricCard('booking_value', 'Booking value', money(value), 'Sales Order grand total.'),
      metricCard('open_orders', 'Open orders', open, 'Bookings not yet closed or completed.'),
    ],
    breakdowns: [
      breakdownFromCounts('customer', 'Customer concentration', customers),
      breakdownFromCounts('status', 'Booking status mix', countBy(orders, 'status', 'No status'), label => isProblemStatus(label) ? 'warning' : undefined),
    ],
    insights: [insight('customer_concentration', 'Customer concentration', customers.size > 0 ? `${customers.size} customer(s) contribute to bookings in this window.` : 'No booking customers found.')],
    evidence: commercialEvidence(reads),
  };
}

function winRateStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const opportunities = rowsFor(reads, 'Opportunity');
  const won = opportunities.filter(row => isWonStatus(row.status ?? row.sales_stage)).length;
  const lost = opportunities.filter(row => isLostStatus(row.status ?? row.sales_stage)).length;
  const open = opportunities.filter(row => !isWonStatus(row.status ?? row.sales_stage) && !isLostStatus(row.status ?? row.sales_stage)).length;
  return {
    templateKey: 'generic',
    headline: `${percent(won, won + lost)} win rate from ${won} won and ${lost} lost opportunit${won + lost === 1 ? 'y' : 'ies'}; ${open} still open.`,
    healthScore: score(opportunities.length, lost * 6, true),
    metricCards: [
      metricCard('win_rate', 'Win rate', percent(won, won + lost), 'Won / (won + lost) from available Opportunity statuses.'),
      metricCard('won', 'Won', won, 'Opportunities marked won.'),
      metricCard('lost', 'Lost', lost, 'Opportunities marked lost.', lost ? 'warning' : 'good'),
      metricCard('open', 'Open', open, 'Opportunities not yet won or lost.'),
    ],
    breakdowns: [breakdownFromCounts('status', 'Win/loss status mix', countBy(opportunities, row => row.status ?? row.sales_stage ?? 'No status'))],
    insights: [insight('approximation', 'Win-rate basis', 'This win rate is derived from Opportunity status in the current read window, not a lifetime cohort.')],
    evidence: opportunityEvidence(reads),
  };
}

function conversionStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const leads = rowsFor(reads, 'Lead');
  const opportunities = rowsFor(reads, 'Opportunity');
  const missingSource = leads.filter(row => isMissing(leadSource(row))).length;
  return {
    templateKey: 'generic',
    headline: `${percent(opportunities.length, leads.length)} approximate lead-to-opportunity conversion from ${leads.length} lead(s) and ${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'}.`,
    healthScore: score(leads.length + opportunities.length, missingSource * 3, true),
    metricCards: [
      metricCard('leads', 'Leads', leads.length, 'Lead records in WorkOS.'),
      metricCard('opportunities', 'Opportunities', opportunities.length, 'Opportunity records in WorkOS.'),
      metricCard('conversion', 'Approx conversion', percent(opportunities.length, leads.length), 'Opportunity count divided by lead count in this window.'),
      metricCard('missing_source', 'Missing source', missingSource, 'Leads without source attribution.', missingSource ? 'warning' : 'good'),
    ],
    breakdowns: [
      breakdownFromCounts('source', 'Lead source mix', countBy(leads, leadSource)),
      breakdownFromCounts('opp_status', 'Opportunity status mix', countBy(opportunities, row => row.status ?? row.sales_stage ?? 'No status')),
    ],
    insights: [insight('caveat', 'Approximate funnel', 'This compares current-window Lead and Opportunity counts; it is not a cohort conversion model.')],
    evidence: defaultEvidence(reads),
  };
}

function salesCycleStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const opportunities = rowsFor(reads, 'Opportunity');
  const cycleDays = opportunities.map(row => daysBetween(row.creation ?? row.transaction_date, row.expected_closing)).filter((value): value is number => value !== null);
  const avgCycle = cycleDays.length ? Math.round(cycleDays.reduce((sum, value) => sum + value, 0) / cycleDays.length) : 0;
  const overdue = opportunities.filter(isOverdue).length;
  return {
    templateKey: 'generic',
    headline: `${cycleDays.length} opportunit${cycleDays.length === 1 ? 'y has' : 'ies have'} cycle dates; average expected cycle is ${avgCycle} day(s).`,
    healthScore: score(opportunities.length, overdue * 8 + (opportunities.length - cycleDays.length) * 4, true),
    metricCards: [
      metricCard('dated', 'Dated opportunities', cycleDays.length, 'Opportunities with enough dates to estimate cycle.'),
      metricCard('avg_cycle', 'Avg cycle', avgCycle, 'Average days from creation/transaction to expected close.', 'neutral', 'days'),
      metricCard('overdue', 'Overdue closes', overdue, 'Open opportunities past expected close.', overdue ? 'warning' : 'good'),
    ],
    breakdowns: [breakdownFromCounts('stage', 'Sales cycle by stage', countBy(opportunities, row => row.sales_stage ?? row.status ?? 'No stage'))],
    insights: [insight('cycle_basis', 'Cycle basis', 'Sales cycle is estimated from available creation/transaction and expected close dates.')],
    evidence: opportunityEvidence(reads),
  };
}

function pipelineHealthStory(mappingDef: SalesStoryMapping, reads: ReadBundle): MetricStory {
  const opportunities = rowsFor(reads, 'Opportunity');
  const open = opportunities.filter(row => isOpenStatus(row.status ?? row.sales_stage));
  const openValue = sumNumber(open, 'opportunity_amount');
  const unvalued = open.filter(row => numberValue(row.opportunity_amount) <= 0).length;
  const problem = problemRows(reads).length;
  return {
    templateKey: 'generic',
    headline: `${open.length} open opportunit${open.length === 1 ? 'y' : 'ies'} worth ${money(openValue)}; ${unvalued} have no value.`,
    healthScore: score(opportunities.length, unvalued * 5 + problem * 8, true),
    metricCards: [
      metricCard('open', 'Open opportunities', open.length, 'Opportunities still active.'),
      metricCard('open_value', 'Open value', money(openValue), 'Open Opportunity amount.'),
      metricCard('unvalued', 'Unvalued open deals', unvalued, 'Open opportunities with zero/missing amount.', unvalued ? 'warning' : 'good'),
      metricCard('attention', 'Attention statuses', problem, 'Lost, held, cancelled, or stopped opportunities.', problem ? 'warning' : 'good'),
    ],
    breakdowns: [
      breakdownFromCounts('stage', 'Open pipeline by stage', countBy(open, 'sales_stage', 'No stage')),
      breakdownFromCounts('status', 'Pipeline status mix', countBy(opportunities, row => row.status ?? row.sales_stage ?? 'No status'), label => isProblemStatus(label) ? 'warning' : undefined),
    ],
    insights: [insight('health', 'Pipeline health', `${open.length - unvalued} open opportunit${open.length - unvalued === 1 ? 'y has' : 'ies have'} value assigned.`)],
    evidence: opportunityEvidence(reads),
  };
}

function opportunityEvidence(reads: ReadBundle): SalesEvidence[] {
  return evidence(reads, (definition, record) => ({
    id: `${definition.doctype}:${record.name}`,
    label: String(record.customer_name ?? record.name),
    sourceDoctype: definition.doctype,
    sourceId: record.name,
    detail: !isMissing(record.opportunity_amount) ? money(numberValue(record.opportunity_amount)) : formatDate(record.modified ?? record.creation),
    status: typeof record.status === 'string' ? record.status : (typeof record.sales_stage === 'string' ? record.sales_stage : undefined),
    attributes: compactAttributes([
      !isMissing(record.sales_stage) && { label: 'Stage', value: String(record.sales_stage) },
      !isMissing(record.opportunity_amount) && { label: 'Amount', value: money(numberValue(record.opportunity_amount)) },
      !isMissing(record.expected_closing) && { label: 'Close', value: String(record.expected_closing), tone: isOverdue(record) ? 'warning' : undefined },
      !isMissing(record.modified) && { label: 'Updated', value: String(record.modified) },
    ]),
  }));
}

function commercialEvidence(reads: ReadBundle): SalesEvidence[] {
  return evidence(reads, (definition, record) => ({
    id: `${definition.doctype}:${record.name}`,
    label: String(record.customer ?? record.customer_name ?? record.party_name ?? record.name),
    sourceDoctype: definition.doctype,
    sourceId: record.name,
    detail: !isMissing(record.grand_total) ? money(numberValue(record.grand_total)) : formatDate(record.posting_date ?? record.transaction_date ?? record.modified ?? record.creation),
    status: typeof record.status === 'string' ? record.status : undefined,
    attributes: compactAttributes([
      !isMissing(record.grand_total) && { label: 'Value', value: money(numberValue(record.grand_total)) },
      !isMissing(record.transaction_date) && { label: 'Date', value: String(record.transaction_date) },
      !isMissing(record.posting_date) && { label: 'Posted', value: String(record.posting_date) },
      record.docstatus !== undefined && record.docstatus !== null && { label: 'Docstatus', value: Number(record.docstatus) },
    ]),
  }));
}

const STORY_BUILDERS: Record<string, StoryBuilder> = {
  sales_accounts_accounts: accountsStory,
  sales_accounts_contacts: contactsStory,
  sales_accounts_customer_history: customerHistoryStory,
  sales_pipeline_leads: leadsStory,
  sales_pipeline_opportunities: opportunityStory,
  sales_pipeline_deal_stages: dealStagesStory,
  sales_pipeline_pipeline_coverage: pipelineCoverageStory,
  sales_pipeline_proposals: proposalsStory,
  sales_revops_territories: territoriesStory,
  sales_performance_revenue: revenueStory,
  sales_performance_bookings: bookingsStory,
  sales_performance_win_rate: winRateStory,
  sales_performance_conversion: conversionStory,
  sales_performance_sales_cycle: salesCycleStory,
  sales_performance_pipeline_health: pipelineHealthStory,
};

const recommendationBuilders: Record<string, (rows: ErpNextGenericRecord[], reads: ReadBundle) => SalesRecommendation[]> = {
  sales_accounts_accounts: (_rows, reads) => {
    const rollups = buildCustomerRollups(reads);
    return customerRecommendations(rollups, false);
  },
  sales_accounts_customer_history: (_rows, reads) => {
    const rollups = buildCustomerRollups(reads);
    return customerRecommendations(rollups, true);
  },
  sales_accounts_contacts: rows => {
    const unreachable = rows.filter(row => isMissing(row.email_id) && isMissing(row.phone)).length;
    return unreachable ? [{ label: 'Complete contact details', reason: `${unreachable} contact(s) have neither email nor phone.`, severity: 'warning' }] : [];
  },
  sales_pipeline_leads: rows => {
    const missingSource = rows.filter(row => isMissing(leadSource(row))).length;
    return missingSource ? [{ label: 'Fix lead attribution', reason: `${missingSource} lead(s) are missing source data.`, severity: 'warning' }] : [];
  },
  sales_pipeline_opportunities: (_rows, reads) => opportunityRecommendations(reads),
  sales_pipeline_deal_stages: (_rows, reads) => opportunityRecommendations(reads),
  sales_pipeline_pipeline_coverage: (_rows, reads) => opportunityRecommendations(reads),
  sales_performance_pipeline_health: (_rows, reads) => opportunityRecommendations(reads),
  sales_performance_sales_cycle: (_rows, reads) => opportunityRecommendations(reads),
};

function leadSource(row: ErpNextGenericRecord): string | number | null | undefined {
  return row.utm_source ?? row.source;
}

function opportunityRecommendations(reads: ReadBundle): SalesRecommendation[] {
  const opportunities = rowsFor(reads, 'Opportunity');
  const missingStage = opportunities.filter(row => isMissing(row.sales_stage)).length;
  const overdue = opportunities.filter(isOverdue).length;
  const recommendations: SalesRecommendation[] = [];
  if (missingStage) recommendations.push({ label: 'Assign sales stages', reason: `${missingStage} opportunit${missingStage === 1 ? 'y is' : 'ies are'} missing stage.`, severity: 'warning' });
  if (overdue) recommendations.push({ label: 'Review overdue closes', reason: `${overdue} open opportunit${overdue === 1 ? 'y is' : 'ies are'} past expected close.`, severity: 'warning' });
  return recommendations;
}

function customerRecommendations(rollups: CustomerRollup[], includeCommercial = true): SalesRecommendation[] {
  const missingGroup = rollups.filter(row => row.missingGroup).length;
  const missingTerritory = rollups.filter(row => row.missingTerritory).length;
  const noRecentActivity = staleCustomerCount(rollups);
  const topValueRollups = [...rollups].sort((a, b) => customerValue(b) - customerValue(a));
  const highValueThreshold = topValueRollups.length > 0 ? customerValue(topValueRollups[Math.min(4, topValueRollups.length - 1)]) : 0;
  const highValueStale = highValueThreshold > 0
    ? rollups.filter(row => customerValue(row) >= highValueThreshold && staleCustomerCount([row]) > 0).length
    : 0;
  const problemRecords = rollups.reduce((total, row) => total + row.problemRecords, 0);
  const openRecords = rollups.reduce((total, row) => total + row.openRecords, 0);
  const ordersWithoutInvoices = rollups.filter(row => row.orderCount > 0 && row.invoiceCount === 0).length;
  const recommendations: SalesRecommendation[] = [];

  if (missingGroup) recommendations.push({ label: 'Complete customer groups', reason: `${missingGroup} customer account(s) are missing customer group segmentation.`, severity: 'warning' });
  if (missingTerritory) recommendations.push({ label: 'Assign territories', reason: `${missingTerritory} customer account(s) are missing territory context.`, severity: 'warning' });
  if (includeCommercial && noRecentActivity) recommendations.push({ label: 'Review stale customers', reason: `${noRecentActivity} customer account(s) have no activity in the last 90 days or no activity date.`, severity: 'info' });
  if (includeCommercial && highValueStale) recommendations.push({ label: 'Re-engage high-value customers', reason: `${highValueStale} high-value customer account(s) look stale.`, severity: 'warning' });
  if (includeCommercial && problemRecords) recommendations.push({ label: 'Resolve customer status risks', reason: `${problemRecords} customer-linked commercial record(s) have problem statuses.`, severity: 'warning' });
  if (includeCommercial && openRecords) recommendations.push({ label: 'Follow up open commercial records', reason: `${openRecords} customer-linked order/invoice record(s) are still open.`, severity: 'info' });
  if (includeCommercial && ordersWithoutInvoices) recommendations.push({ label: 'Convert orders to invoices', reason: `${ordersWithoutInvoices} customer account(s) have orders but no invoice in this read window.`, severity: 'warning' });

  return recommendations;
}
