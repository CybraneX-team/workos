import express from 'express';
import { supabaseAdmin } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { requirePermission } from '../rbac.js';
import { encrypt, decrypt, signState, verifyState } from '../lib/crypto.js';
import { validateStripeKey, fetchStripeMetrics } from '../adapters/stripe.js';
import {
  buildOAuth2Client, getAuthUrl, exchangeCode,
  listProperties, fetchGAMetrics,
} from '../adapters/googleAnalytics.js';
import {
  getMetaOAuthUrl, exchangeMetaCode,
  listMetaAdAccounts, getMetaAdAccount, type MetaAdAccount,
} from '../adapters/metaAds.js';
import { validateRazorpayKeys, fetchRazorpayMetrics } from '../adapters/razorpay.js';
import {
  getSalesforceAuthUrl, exchangeSalesforceCode,
  fetchSalesforceMetrics, refreshSalesforceToken,
} from '../adapters/salesforce.js';
import { validateHubSpotToken, fetchHubSpotMetrics } from '../adapters/hubspot.js';
import {
  getQuickBooksAuthUrl, exchangeQbCode, refreshQbToken, fetchQuickBooksMetrics,
} from '../adapters/quickbooks.js';
import { validateJiraCredentials, fetchJiraMetrics } from '../adapters/jira.js';
import { validateSlackToken, fetchSlackMetrics } from '../adapters/slack.js';
import { disconnectMetaMetricSources, reconnectMetaMetricSources } from '../lib/metaMetricEngine.js';
import { buildMetaAdsBrief, enqueueInitialMetaAdsBackfill, enqueueMetaAdsSync } from '../domains/meta-ads/service.js';
import { reconcileDetachedMetaAdsExperiments } from '../domains/meta-ads/decisionInbox.js';

export const integrationsRouter = express.Router();

const AUTH = authJwt;
const REQUIRE_WRITE = requirePermission('data', 'write');
const REQUIRE_READ = requirePermission('data', 'read');

// ─── Snapshot helpers ──────────────────────────────────────────────────────────

async function saveSnapshot(companyId: string, integrationId: string, data: unknown) {
  // Only save if no snapshot exists in the last hour (to avoid over-sampling)
  const { data: last } = await supabaseAdmin
    .from('metric_snapshots')
    .select('snapshot_at')
    .eq('company_id', companyId)
    .eq('integration_id', integrationId)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last) {
    const diffMs = Date.now() - new Date(last.snapshot_at).getTime();
    if (diffMs < 60 * 60 * 1000) return; // less than 1 hour ago, skip
  }

  await supabaseAdmin.from('metric_snapshots').insert({
    company_id: companyId,
    integration_id: integrationId,
    snapshot_at: new Date().toISOString(),
    metrics: data,
  });
}

// ─── Analytics data builder ────────────────────────────────────────────────────

type MetricCategory = 'Growth' | 'Product' | 'Sales' | 'Finance' | 'Ops/People';

interface TrackedMetricPayload {
  id: string;
  name: string;
  category: MetricCategory;
  value: number;
  unit: string;
  change: number;
  dataSource: 'auto-ingested';
  integration: string;
  trend: number[];
  description: string;
}

interface MetricSpec {
  field: string;
  name: string;
  category: MetricCategory;
  unit: string;
  historyField?: string;
  description: string;
}

function buildIntegrationMetrics(
  integrationId: string,
  integrationLabel: string,
  specs: MetricSpec[],
  snapshots: Array<{ metrics: Record<string, any> }>,
): TrackedMetricPayload[] {
  if (!snapshots.length) return [];
  const current = snapshots[0].metrics;

  const fromHistory = (histArr: Array<{ value: number }> | undefined): number[] =>
    Array.isArray(histArr) ? histArr.map((h) => h.value) : [];

  const fromSnapshots = (field: string): number[] =>
    [...snapshots].reverse().map((s) => {
      const v = s.metrics[field];
      return typeof v === 'number' ? v : 0;
    });

  const pad = (arr: number[], fallback: number): number[] => {
    if (arr.length >= 12) return arr.slice(-12);
    return [...Array(Math.max(0, 12 - arr.length)).fill(fallback), ...arr];
  };

  const changeFrom = (trend: number[]): number => {
    if (trend.length < 2) return 0;
    const prev = trend[trend.length - 2];
    const curr = trend[trend.length - 1];
    if (!prev) return 0;
    return parseFloat(((curr - prev) / Math.abs(prev) * 100).toFixed(1));
  };

  return specs.map((spec): TrackedMetricPayload => {
    const rawVal = current[spec.field];
    const value = typeof rawVal === 'number' ? rawVal : 0;
    const historyArr = spec.historyField ? fromHistory(current[spec.historyField]) : [];
    const snapshotArr = fromSnapshots(spec.field);
    const baseTrend = historyArr.length ? historyArr : snapshotArr;
    const trend = pad(baseTrend, value);

    return {
      id: `${integrationId}-${spec.field}`,
      name: spec.name,
      category: spec.category,
      value,
      unit: spec.unit,
      change: changeFrom(trend),
      dataSource: 'auto-ingested',
      integration: integrationLabel,
      trend,
      description: spec.description,
    };
  });
}

const INTEGRATION_SPECS: Record<string, { label: string; specs: MetricSpec[] }> = {
  'int-stripe': {
    label: 'Stripe',
    specs: [
      { field: 'mrr',               name: 'MRR',                  category: 'Finance',    unit: '$',    historyField: 'mrrHistory', description: 'Monthly recurring revenue from Stripe subscriptions' },
      { field: 'arr',               name: 'ARR',                  category: 'Finance',    unit: '$',    description: 'Annual recurring revenue projection' },
      { field: 'churnRate',         name: 'Churn Rate',           category: 'Growth',     unit: '%',    description: 'Monthly subscriber churn rate' },
      { field: 'activeSubscribers', name: 'Active Subscribers',   category: 'Growth',     unit: '',     description: 'Total active paying subscribers' },
      { field: 'avgRevenuePerUser', name: 'ARPU',                 category: 'Finance',    unit: '$',    description: 'Average revenue per user per month' },
      { field: 'paymentVolume30d',  name: 'Payment Volume (30d)', category: 'Finance',    unit: '$',    description: 'Total payment volume in the last 30 days' },
    ],
  },
  'int-ga': {
    label: 'Google Analytics',
    specs: [
      { field: 'sessions30d',       name: 'Sessions (30d)',        category: 'Growth',     unit: '',     historyField: 'sessionsHistory', description: 'Website sessions in the last 30 days' },
      { field: 'users30d',          name: 'Users (30d)',           category: 'Growth',     unit: '',     description: 'Total users in the last 30 days' },
      { field: 'newUsers30d',       name: 'New Users (30d)',       category: 'Growth',     unit: '',     description: 'New user acquisitions in the last 30 days' },
      { field: 'bounceRate',        name: 'Bounce Rate',          category: 'Product',    unit: '%',    description: 'Percentage of sessions with only one page view' },
      { field: 'conversionRate',    name: 'Conversion Rate',      category: 'Growth',     unit: '%',    description: 'Goal conversion rate across all sessions' },
    ],
  },
  'int-meta': {
    label: 'Meta Ads',
    specs: [
      { field: 'spend30d',          name: 'Ad Spend (30d)',        category: 'Finance',    unit: '$',    description: 'Total Meta Ads spend in the last 30 days' },
      { field: 'roas',              name: 'ROAS',                  category: 'Growth',     unit: 'x',    description: 'Return on ad spend across all campaigns' },
      { field: 'ctr',               name: 'CTR',                   category: 'Growth',     unit: '%',    description: 'Click-through rate across all ad campaigns' },
      { field: 'conversions30d',    name: 'Conversions (30d)',     category: 'Sales',      unit: '',     description: 'Total conversions from Meta Ads in 30 days' },
      { field: 'cpa',               name: 'CPA',                   category: 'Finance',    unit: '$',    description: 'Cost per acquisition from Meta Ads' },
    ],
  },
  'int-razorpay': {
    label: 'Razorpay',
    specs: [
      { field: 'paymentVolume30d',  name: 'Payment Volume (30d)', category: 'Finance',    unit: '₹',    historyField: 'paymentHistory', description: 'Total payment volume in the last 30 days' },
      { field: 'successRate',       name: 'Payment Success Rate', category: 'Product',    unit: '%',    description: 'Percentage of payments successfully captured' },
      { field: 'activeSubscriptions', name: 'Active Subscriptions', category: 'Growth',  unit: '',     description: 'Active Razorpay subscription plans' },
      { field: 'totalTransactions30d', name: 'Transactions (30d)', category: 'Finance',  unit: '',     description: 'Total payment transactions in the last 30 days' },
    ],
  },
  'int-sf': {
    label: 'Salesforce',
    specs: [
      { field: 'openPipelineValue', name: 'Pipeline Value',        category: 'Sales',      unit: '$',    description: 'Total value of all open Salesforce opportunities' },
      { field: 'winRate',           name: 'Win Rate',              category: 'Sales',      unit: '%',    description: 'Percentage of deals closed as won' },
      { field: 'avgDealCycleTime',  name: 'Deal Cycle Time',       category: 'Sales',      unit: 'days', description: 'Average days from lead to close' },
      { field: 'openDealsCount',    name: 'Open Deals',            category: 'Sales',      unit: '',     description: 'Number of open opportunities in the pipeline' },
      { field: 'closedWonValue90d', name: 'Closed Won (90d)',      category: 'Sales',      unit: '$',    description: 'Revenue closed in the last 90 days' },
    ],
  },
  'int-hubspot': {
    label: 'HubSpot',
    specs: [
      { field: 'totalContacts',     name: 'Total Contacts',        category: 'Sales',      unit: '',     description: 'Total contacts in HubSpot CRM' },
      { field: 'newContacts30d',    name: 'New Contacts (30d)',    category: 'Growth',     unit: '',     description: 'New contacts added in the last 30 days' },
      { field: 'pipelineValue',     name: 'Pipeline Value',        category: 'Sales',      unit: '$',    description: 'Total value of open deals in HubSpot' },
      { field: 'closedWonValue30d', name: 'Closed Won (30d)',      category: 'Sales',      unit: '$',    description: 'Revenue closed in the last 30 days' },
      { field: 'avgDealValue',      name: 'Avg Deal Value',        category: 'Sales',      unit: '$',    description: 'Average value of all deals in HubSpot' },
    ],
  },
  'int-qb': {
    label: 'QuickBooks',
    specs: [
      { field: 'revenue30d',        name: 'Revenue (30d)',         category: 'Finance',    unit: '$',    historyField: 'revenueHistory', description: 'Total revenue recognised in the last 30 days' },
      { field: 'expenses30d',       name: 'Expenses (30d)',        category: 'Finance',    unit: '$',    description: 'Total expenses in the last 30 days' },
      { field: 'netIncome30d',      name: 'Net Income (30d)',      category: 'Finance',    unit: '$',    description: 'Net income (revenue minus expenses) in 30 days' },
      { field: 'outstandingAmount', name: 'Outstanding AR',        category: 'Finance',    unit: '$',    description: 'Total value of unpaid or overdue invoices' },
    ],
  },
  'int-jira': {
    label: 'Jira',
    specs: [
      { field: 'totalOpenIssues',   name: 'Open Issues',           category: 'Product',    unit: '',     description: 'Total open issues across all Jira projects' },
      { field: 'inProgressIssues',  name: 'In Progress',           category: 'Product',    unit: '',     description: 'Issues currently in progress' },
      { field: 'resolvedLast30d',   name: 'Resolved (30d)',        category: 'Product',    unit: '',     description: 'Issues resolved in the last 30 days' },
      { field: 'openBugs',          name: 'Open Bugs',             category: 'Product',    unit: '',     description: 'Total open bug-type issues' },
    ],
  },
  'int-slack': {
    label: 'Slack',
    specs: [
      { field: 'totalMembers',      name: 'Team Members',          category: 'Ops/People', unit: '',     description: 'Total members in the Slack workspace' },
      { field: 'totalChannels',     name: 'Channels',              category: 'Ops/People', unit: '',     description: 'Total channels in the Slack workspace' },
      { field: 'publicChannels',    name: 'Public Channels',       category: 'Ops/People', unit: '',     description: 'Number of public Slack channels' },
    ],
  },
};



function getDevMockMetrics(integrationId: string): unknown | null {
  const map: Record<string, unknown> = {
    'int-stripe': {
      type: 'stripe',
      data: {
        mrr: 14820, mrrGrowth: 7.4, arr: 177840, activeSubscribers: 143,
        churnRate: 4.2, avgRevenuePerUser: 103.6, paymentVolume30d: 14820, failedPaymentRate: 2.8,
        mrrHistory: [
          { date: 'Nov', value: 9200 }, { date: 'Dec', value: 10400 },
          { date: 'Jan', value: 11800 }, { date: 'Feb', value: 12900 },
          { date: 'Mar', value: 13800 }, { date: 'Apr', value: 14820 },
        ],
        recentTransactions: [
          { id: 'ch_dev_1', amount: 299, currency: 'USD', status: 'succeeded', date: '2026-04-30', customer: 'Acme Corp' },
          { id: 'ch_dev_2', amount: 99,  currency: 'USD', status: 'succeeded', date: '2026-04-30', customer: 'TechFlow Inc' },
          { id: 'ch_dev_3', amount: 99,  currency: 'USD', status: 'failed',    date: '2026-04-29', customer: 'Pixel Labs' },
          { id: 'ch_dev_4', amount: 499, currency: 'USD', status: 'succeeded', date: '2026-04-29', customer: 'DataSync Pro' },
          { id: 'ch_dev_5', amount: 99,  currency: 'USD', status: 'succeeded', date: '2026-04-28', customer: 'CloudWave' },
        ],
      },
    },
    'int-ga': {
      type: 'google-analytics',
      data: {
        sessions30d: 18420, users30d: 11340, newUsers30d: 4230,
        bounceRate: 42.3, avgSessionDuration: 187, conversionRate: 3.2,
        topChannels: [
          { channel: 'Organic Search', sessions: 6820, pct: 37 },
          { channel: 'Direct', sessions: 4420, pct: 24 },
          { channel: 'Referral', sessions: 3680, pct: 20 },
          { channel: 'Social', sessions: 2210, pct: 12 },
          { channel: 'Email', sessions: 1290, pct: 7 },
        ],
        topPages: [
          { page: '/home', views: 9420 }, { page: '/pricing', views: 4820 },
          { page: '/features', views: 3180 }, { page: '/blog/startup-metrics', views: 2640 },
          { page: '/signup', views: 2210 },
        ],
        sessionsHistory: [
          { date: 'Nov', value: 10200 }, { date: 'Dec', value: 11800 },
          { date: 'Jan', value: 13400 }, { date: 'Feb', value: 15100 },
          { date: 'Mar', value: 16800 }, { date: 'Apr', value: 18420 },
        ],
      },
    },
    // Meta has no mock entry: it is tested via a real sandbox ad account
    // (see /meta/connect-sandbox), not canned data.
    'int-razorpay': {
      type: 'razorpay',
      data: {
        paymentVolume30d: 182400, currency: 'INR', totalTransactions30d: 214,
        successRate: 94.4, failedCount30d: 12, avgOrderValue: 852,
        activeSubscriptions: 38,
        recentPayments: [
          { id: 'pay_dev1', amount: 1999, currency: 'INR', status: 'captured', date: '2026-04-30', method: 'card' },
          { id: 'pay_dev2', amount: 499,  currency: 'INR', status: 'captured', date: '2026-04-30', method: 'upi' },
          { id: 'pay_dev3', amount: 999,  currency: 'INR', status: 'failed',   date: '2026-04-29', method: 'card' },
          { id: 'pay_dev4', amount: 4999, currency: 'INR', status: 'captured', date: '2026-04-29', method: 'netbanking' },
          { id: 'pay_dev5', amount: 799,  currency: 'INR', status: 'captured', date: '2026-04-28', method: 'upi' },
        ],
        paymentHistory: [
          { date: 'Nov', value: 98000 }, { date: 'Dec', value: 112000 },
          { date: 'Jan', value: 134000 }, { date: 'Feb', value: 148000 },
          { date: 'Mar', value: 164000 }, { date: 'Apr', value: 182400 },
        ],
      },
    },
    'int-sf': {
      type: 'salesforce',
      data: {
        openPipelineValue: 840000, openDealsCount: 24, winRate: 42.3,
        avgDealCycleTime: 28, closedWonValue90d: 320000, closedWonCount90d: 11,
        pipelineVelocity: 12650,
        stageBreakdown: [
          { stage: 'Prospecting',        count: 8,  value: 180000 },
          { stage: 'Qualification',      count: 6,  value: 220000 },
          { stage: 'Proposal/Price Quote', count: 5, value: 280000 },
          { stage: 'Negotiation',        count: 3,  value: 110000 },
          { stage: 'Needs Analysis',     count: 2,  value: 50000 },
        ],
        recentDeals: [
          { name: 'Acme Corp — Enterprise', amount: 48000, stage: 'Negotiation',    closeDate: '2026-05-15', status: 'open' },
          { name: 'TechFlow Pro',           amount: 18000, stage: 'Closed Won',     closeDate: '2026-04-28', status: 'won'  },
          { name: 'DataSync Inc',           amount: 12000, stage: 'Closed Lost',    closeDate: '2026-04-22', status: 'lost' },
          { name: 'CloudWave SaaS',         amount: 95000, stage: 'Proposal/Price Quote', closeDate: '2026-05-30', status: 'open' },
          { name: 'Pixel Labs',             amount: 8500,  stage: 'Qualification',  closeDate: '2026-06-10', status: 'open' },
        ],
      },
    },
    'int-hubspot': {
      type: 'hubspot',
      data: {
        totalContacts: 1840, newContacts30d: 124, openDealsCount: 18,
        pipelineValue: 310000, closedWonCount30d: 5, closedWonValue30d: 68000, avgDealValue: 17222,
        recentDeals: [
          { id: 'hs_1', name: 'Acme Corp Expansion',  amount: 42000, stage: 'contractsent',         closeDate: '2026-05-20', status: 'open' },
          { id: 'hs_2', name: 'TechFlow Pro',          amount: 18000, stage: 'closedwon',            closeDate: '2026-04-28', status: 'won'  },
          { id: 'hs_3', name: 'DataSync Starter',      amount: 5400,  stage: 'closedlost',           closeDate: '2026-04-21', status: 'lost' },
          { id: 'hs_4', name: 'CloudWave Enterprise',  amount: 85000, stage: 'presentationscheduled',closeDate: '2026-05-30', status: 'open' },
          { id: 'hs_5', name: 'Pixel Labs Growth',     amount: 9200,  stage: 'qualifiedtobuy',       closeDate: '2026-06-15', status: 'open' },
        ],
        dealsByStage: [
          { stage: 'appointmentscheduled',  count: 4, value: 52000 },
          { stage: 'qualifiedtobuy',        count: 5, value: 78000 },
          { stage: 'presentationscheduled', count: 4, value: 112000 },
          { stage: 'contractsent',          count: 3, value: 52000 },
          { stage: 'decisionmakerboughtin', count: 2, value: 16000 },
        ],
      },
    },
    'int-qb': {
      type: 'quickbooks',
      data: {
        revenue30d: 52400, expenses30d: 18200, netIncome30d: 34200,
        outstandingInvoices: 7, outstandingAmount: 28600, currency: 'USD',
        recentInvoices: [
          { id: '1042', customer: 'Acme Corp',      amount: 8400,  date: '2026-04-30', status: 'paid'    },
          { id: '1041', customer: 'TechFlow Inc',   amount: 3200,  date: '2026-04-28', status: 'unpaid'  },
          { id: '1040', customer: 'DataSync Pro',   amount: 12000, date: '2026-04-25', status: 'overdue' },
          { id: '1039', customer: 'CloudWave SaaS', amount: 5600,  date: '2026-04-22', status: 'paid'    },
          { id: '1038', customer: 'Pixel Labs',     amount: 2100,  date: '2026-04-18', status: 'unpaid'  },
        ],
        revenueHistory: [
          { date: 'Nov', value: 32000 }, { date: 'Dec', value: 38000 },
          { date: 'Jan', value: 41000 }, { date: 'Feb', value: 45500 },
          { date: 'Mar', value: 49800 }, { date: 'Apr', value: 52400 },
        ],
      },
    },
    'int-jira': {
      type: 'jira',
      data: {
        workspaceName: 'FounderOS Dev',
        totalOpenIssues: 47,
        inProgressIssues: 12,
        resolvedLast30d: 38,
        openBugs: 5,
        activeSprintName: 'Sprint 14 — Launch Prep',
        activeSprintTotal: 22,
        activeSprintDone: 15,
        recentIssues: [
          { key: 'FOS-312', summary: 'Fix integration modal overflow on mobile',     type: 'Bug',   priority: 'High',   status: 'In Progress', assignee: 'Alice Chen'  },
          { key: 'FOS-311', summary: 'Add Jira & Slack metric panels to frontend',   type: 'Story', priority: 'High',   status: 'In Progress', assignee: 'Bob Sharma'  },
          { key: 'FOS-309', summary: 'Refactor auth middleware to use Supabase JWT',  type: 'Task',  priority: 'Medium', status: 'To Do',        assignee: null           },
          { key: 'FOS-306', summary: 'Unit tests for QuickBooks adapter',             type: 'Task',  priority: 'Medium', status: 'Done',         assignee: 'Carol Davis' },
          { key: 'FOS-302', summary: 'Dark mode chart colours accessibility pass',    type: 'Story', priority: 'Low',    status: 'Done',         assignee: 'Alice Chen'  },
          { key: 'FOS-298', summary: 'Rate-limit Razorpay metrics endpoint',          type: 'Bug',   priority: 'High',   status: 'Done',         assignee: 'Bob Sharma'  },
          { key: 'FOS-295', summary: 'Add CSV export to metrics page',                type: 'Story', priority: 'Low',    status: 'To Do',        assignee: null           },
          { key: 'FOS-290', summary: 'Performance: lazy-load Three.js universe',      type: 'Task',  priority: 'Medium', status: 'In Progress', assignee: 'Carol Davis' },
        ],
        issuesByType: [
          { type: 'Story', count: 18 },
          { type: 'Task',  count: 16 },
          { type: 'Bug',   count: 9  },
          { type: 'Epic',  count: 4  },
        ],
        issuesByPriority: [
          { priority: 'High',   count: 14 },
          { priority: 'Medium', count: 22 },
          { priority: 'Low',    count: 9  },
          { priority: 'Highest', count: 2 },
        ],
      },
    },
    'int-slack': {
      type: 'slack',
      data: {
        workspaceName: 'FounderOS Team',
        workspaceDomain: 'founderos',
        totalMembers: 24,
        totalChannels: 18,
        publicChannels: 13,
        privateChannels: 5,
        topChannels: [
          { name: 'general',       memberCount: 24, isPrivate: false, topic: 'Company-wide announcements and updates' },
          { name: 'engineering',   memberCount: 12, isPrivate: false, topic: 'Engineering discussions and PRs'         },
          { name: 'product',       memberCount: 10, isPrivate: false, topic: 'Product roadmap, specs, and feedback'    },
          { name: 'design',        memberCount: 7,  isPrivate: false, topic: 'Design reviews and assets'               },
          { name: 'growth',        memberCount: 8,  isPrivate: false, topic: 'Marketing and growth experiments'        },
          { name: 'founders',      memberCount: 4,  isPrivate: true,  topic: ''                                        },
          { name: 'ops-finance',   memberCount: 5,  isPrivate: true,  topic: ''                                        },
          { name: 'customer-love', memberCount: 9,  isPrivate: false, topic: 'Customer feedback and support escalations'},
        ],
      },
    },
  };
  return map[integrationId] ?? null;
}

// ─── Analytics data: TrackedMetric[] derived from stored snapshots ────────────

integrationsRouter.get('/analytics-data', AUTH, async (req, res) => {
  const companyId = req.auth!.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  // Fetch last 12 snapshots per integration (newest first). We over-fetch then group client-side.
  const { data: rows, error } = await supabaseAdmin
    .from('metric_snapshots')
    .select('integration_id, snapshot_at, metrics')
    .eq('company_id', companyId)
    .order('snapshot_at', { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  // Group by integration_id, keep last 12 per integration
  const byIntegration: Record<string, Array<{ metrics: Record<string, any> }>> = {};
  for (const row of (rows ?? [])) {
    const bucket = byIntegration[row.integration_id] ?? [];
    if (bucket.length < 12) bucket.push({ metrics: row.metrics });
    byIntegration[row.integration_id] = bucket;
  }

  // Build TrackedMetric[] from all stored snapshots
  const metrics: TrackedMetricPayload[] = [];
  for (const [integrationId, snapshots] of Object.entries(byIntegration)) {
    const cfg = INTEGRATION_SPECS[integrationId];
    if (!cfg) continue;
    metrics.push(...buildIntegrationMetrics(integrationId, cfg.label, cfg.specs, snapshots));
  }

  const lastUpdated = rows?.[0]?.snapshot_at ?? null;
  const connectedIntegrations = Object.keys(byIntegration);

  return res.json({ metrics, connectedIntegrations, lastUpdated });
});

// ─── List all connections for the authenticated company ────────────────────────

integrationsRouter.get('/connections', AUTH, async (req, res) => {
  const companyId = req.auth!.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const { data, error } = await supabaseAdmin
    .from('integration_connections')
    .select('integration_id, connected_at, last_synced_at, account_name, sandbox_mode, metadata')
    .eq('company_id', companyId);

  if (error) return res.status(500).json({ error: error.message });

  const connections = (data ?? []).map((row : any) => ({
    integrationId: row.integration_id,
    connectedAt: row.connected_at,
    lastSynced: row.last_synced_at ?? null,
    accountName: row.account_name ?? row.integration_id,
    sandboxMode: row.sandbox_mode,
  }));

  return res.json(connections);
});

// ─── Stripe: connect using caller-supplied secret key ─────────────────────────

integrationsRouter.post('/stripe/connect', AUTH, REQUIRE_WRITE, async (req, res) => {
  const { secretKey } = req.body as { secretKey?: string };
  if (!secretKey?.trim()) {
    return res.status(400).json({ error: 'secretKey is required.' });
  }
  const apiKey = secretKey.trim();
  if (!apiKey.startsWith('sk_')) {
    return res.status(400).json({ error: 'Invalid Stripe secret key — must start with sk_test_ or sk_live_.' });
  }

  const companyId = req.auth!.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  let accountName: string;
  try {
    accountName = await validateStripeKey(apiKey);
  } catch {
    return res.status(400).json({ error: 'Invalid Stripe API key — validation failed' });
  }

  const isTestMode = apiKey.startsWith('sk_test_');
  const { error } = await supabaseAdmin.from('integration_connections').upsert({
    company_id: companyId,
    integration_id: 'int-stripe',
    account_name: `${accountName}${isTestMode ? ' (Test)' : ''}`,
    sandbox_mode: false,
    access_token_enc: encrypt(apiKey),
    last_synced_at: new Date().toISOString(),
    metadata: { test_mode: isTestMode },
  }, { onConflict: 'company_id,integration_id' });

  if (error) return res.status(500).json({ error: error.message });

  return res.json({
    integrationId: 'int-stripe',
    accountName: `${accountName}${isTestMode ? ' (Test)' : ''}`,
    sandboxMode: false,
    connectedAt: new Date().toISOString(),
    lastSynced: new Date().toISOString(),
    testMode: isTestMode,
  });
});

// ─── Google Analytics: OAuth start ────────────────────────────────────────────

integrationsRouter.get('/google/auth-url', AUTH, REQUIRE_WRITE, async (req, res) => {
  const companyId = req.auth!.companyId;
  const userId = req.auth!.userId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(501).json({ error: 'Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your backend .env' });
  }

  const state = signState({ companyId, userId, integration: 'int-ga' });
  const oauth2 = buildOAuth2Client();
  return res.json({ url: getAuthUrl(oauth2, state) });
});

// ─── Google Analytics: OAuth callback (no JWT — comes from Google redirect) ───

integrationsRouter.get('/google/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query as Record<string, string>;

  if (oauthError) return res.send(oauthCallbackHtml('error', oauthError));

  const stateData = state ? verifyState(state) : null;
  if (!stateData) return res.send(oauthCallbackHtml('error', 'Invalid state — possible CSRF'));

  const { companyId } = stateData;
  const oauth2 = buildOAuth2Client();

  let tokens: import('googleapis').Auth.Credentials;
  try {
    tokens = await exchangeCode(oauth2, code);
  } catch (e) {
    return res.send(oauthCallbackHtml('error', String(e)));
  }

  oauth2.setCredentials(tokens);
  let accountName = 'Google Analytics';
  let propertyId = '';
  try {
    const props = await listProperties(oauth2);
    if (props.length > 0) {
      propertyId = props[0].id;
      accountName = `GA4 · ${props[0].name}`;
    }
  } catch { /* non-fatal */ }

  const expires = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;
  const { error } = await supabaseAdmin.from('integration_connections').upsert({
    company_id: companyId,
    integration_id: 'int-ga',
    account_name: accountName,
    sandbox_mode: false,
    access_token_enc: encrypt(tokens.access_token ?? ''),
    refresh_token_enc: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    token_expires_at: expires,
    last_synced_at: new Date().toISOString(),
    metadata: { property_id: propertyId },
  }, { onConflict: 'company_id,integration_id' });

  if (error) return res.send(oauthCallbackHtml('error', error.message));
  return res.send(oauthCallbackHtml('success', '', 'int-ga', accountName));
});

// ─── Meta Ads: OAuth start ────────────────────────────────────────────────────

integrationsRouter.get('/meta/auth-url', AUTH, REQUIRE_WRITE, async (req, res) => {
  const companyId = req.auth!.companyId;
  const userId = req.auth!.userId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    return res.status(501).json({ error: 'Meta OAuth not configured. Add META_APP_ID and META_APP_SECRET to your backend .env' });
  }

  const state = signState({ companyId, userId, integration: 'int-meta' });
  return res.json({ url: getMetaOAuthUrl(state) });
});

// ─── Meta Ads: shared helpers ──────────────────────────────────────────────────

async function upsertMetaConnection(
  companyId: string,
  accessToken: string,
  account: MetaAdAccount,
  opts?: { sandbox?: boolean; tokenExpiresAt?: string | null },
) {
  const accountName = `Meta Ads · ${account.name}${opts?.sandbox ? ' (sandbox)' : ''}`;
  const { data: previous } = await supabaseAdmin.from('integration_connections')
    .select('metadata,last_synced_at,connected_at').eq('company_id', companyId).eq('integration_id', 'int-meta').maybeSingle();
  const previousMetadata = (previous?.metadata ?? {}) as Record<string, unknown>;
  const sameAccount = previousMetadata.ad_account_id === account.id;
  const retainedMetadata = sameAccount ? previousMetadata : {};
  const { error } = await supabaseAdmin.from('integration_connections').upsert({
    company_id: companyId,
    integration_id: 'int-meta',
    account_name: accountName,
    sandbox_mode: Boolean(opts?.sandbox),
    access_token_enc: encrypt(accessToken),
    token_expires_at: opts?.tokenExpiresAt ?? null,
    last_synced_at: sameAccount ? previous?.last_synced_at ?? null : null,
    metadata: { ...retainedMetadata, ad_account_id: account.id, currency: account.currency, timezone: account.timezone ?? retainedMetadata.timezone ?? 'UTC' },
  }, { onConflict: 'company_id,integration_id' });

  if (error) throw new Error(error.message);
  if (previous && !sameAccount) {
    await supabaseAdmin.from('metric_sources')
      .update({ status: 'needs_configuration' })
      .eq('company_id', companyId)
      .eq('integration_id', 'int-meta')
      .in('source_key', ['cost_per_conversion_30d', 'selected_conversions_30d']);
  }
  await reconnectMetaMetricSources(companyId, account.id, account.currency);
  await reconcileDetachedMetaAdsExperiments(companyId, account.id);
  await enqueueInitialMetaAdsBackfill(companyId);

  return {
    integrationId: 'int-meta',
    accountName,
    sandboxMode: Boolean(opts?.sandbox),
    connectedAt: previous?.connected_at ?? new Date().toISOString(),
    lastSynced: sameAccount ? previous?.last_synced_at ?? null : null,
  };
}

// A short-lived, encrypted ticket carries the access token from the OAuth popup
// back to the authenticated SPA without ever exposing it to browser JS.
const META_TICKET_TTL_MS = 10 * 60 * 1000;

function sealMetaTicket(companyId: string, accessToken: string, tokenExpiresAt: string | null): string {
  return encrypt(JSON.stringify({ companyId, accessToken, tokenExpiresAt, exp: Date.now() + META_TICKET_TTL_MS }));
}

function openMetaTicket(ticket: string): { companyId: string; accessToken: string; tokenExpiresAt: string | null; exp: number } | null {
  try {
    const parsed = JSON.parse(decrypt(ticket));
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── Meta Ads: OAuth callback ─────────────────────────────────────────────────

function reportMetaConnectionError(context: string, error: unknown) {
  console.error('[meta-ads] connection failed', {
    context,
    message: error instanceof Error ? error.message : String(error),
  });
}

integrationsRouter.get('/meta/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query as Record<string, string>;

  if (oauthError) {
    reportMetaConnectionError('oauth_denied', oauthError);
    return res.send(oauthCallbackHtml('error', 'Meta authorization was cancelled or denied. Please try again.'));
  }

  const stateData = state ? verifyState(state) : null;
  if (!stateData) return res.send(oauthCallbackHtml('error', 'Invalid state'));

  const { companyId } = stateData;

  let accessToken: string;
  let tokenExpiresAt: string | null;
  try {
    const token = await exchangeMetaCode(code);
    accessToken = token.accessToken;
    tokenExpiresAt = token.expiresAt;
  } catch (e) {
    reportMetaConnectionError('token_exchange', e);
    return res.send(oauthCallbackHtml('error', 'Meta authorization could not be completed. Please try again.'));
  }

  let accounts: MetaAdAccount[];
  try {
    accounts = await listMetaAdAccounts(accessToken);
  } catch (e) {
    reportMetaConnectionError('account_discovery', e);
    return res.send(oauthCallbackHtml('error', 'Meta ad accounts could not be loaded. Check permissions and try again.'));
  }

  if (accounts.length === 0) {
    return res.send(oauthCallbackHtml('error', 'No Meta ad account found. Make sure your Facebook account has access to at least one ad account.'));
  }

  if (accounts.length === 1) {
    try {
      const connection = await upsertMetaConnection(companyId, accessToken, accounts[0], { tokenExpiresAt });
      return res.send(oauthCallbackHtml('success', '', 'int-meta', connection.accountName));
    } catch (e) {
      reportMetaConnectionError('save_connection', e);
      return res.send(oauthCallbackHtml('error', 'The Meta Ads connection could not be saved. Please try again.'));
    }
  }

  // Multiple ad accounts: hand off to the SPA's own account picker rather than
  // choosing one here — the popup has no authenticated app session to render it in.
  const ticket = sealMetaTicket(companyId, accessToken, tokenExpiresAt);
  return res.send(metaAccountRelayHtml(accounts, ticket));
});

// ─── Meta Ads: finalize connection after the user picks an ad account ─────────

integrationsRouter.post('/meta/finalize', AUTH, REQUIRE_WRITE, async (req, res) => {
  const { ticket, adAccountId } = req.body as { ticket?: string; adAccountId?: string };
  if (!ticket || !adAccountId) return res.status(400).json({ error: 'ticket and adAccountId are required.' });

  const companyId = req.auth!.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const opened = openMetaTicket(ticket);
  if (!opened) return res.status(400).json({ error: 'This selection has expired. Please reconnect Meta Ads.' });
  if (opened.companyId !== companyId) return res.status(403).json({ error: 'Ticket does not belong to this company.' });

  let accounts: MetaAdAccount[];
  try {
    accounts = await listMetaAdAccounts(opened.accessToken);
  } catch (e) {
    reportMetaConnectionError('finalize_account_verification', e);
    return res.status(502).json({ error: 'Meta ad accounts could not be verified. Check permissions and try again.' });
  }
  const account = accounts.find((a) => a.id === adAccountId);
  if (!account) return res.status(400).json({ error: 'That ad account is no longer accessible with this Facebook login.' });

  try {
    const connection = await upsertMetaConnection(companyId, opened.accessToken, account, { tokenExpiresAt: opened.tokenExpiresAt });
    return res.json(connection);
  } catch (e) {
    reportMetaConnectionError('finalize_save_connection', e);
    return res.status(500).json({ error: 'The Meta Ads connection could not be saved. Please try again.' });
  }
});

// ─── Meta Ads: sandbox connect (dev only) ─────────────────────────────────────
// Lets an allowlisted developer connect the no-spend sandbox ad account through
// the app UI, exercising the same code path a real OAuth connection uses. The
// sandbox account is not reachable via the OAuth /me/adaccounts flow, so this is
// the only way to drive it from inside the product. Never active in production.

function isMetaSandboxAllowed(userId: string): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (!process.env.META_SANDBOX_ACCESS_TOKEN || !process.env.META_SANDBOX_AD_ACCOUNT_ID) return false;
  if (process.env.META_SANDBOX_ALLOW_ANY_DEV_USER === 'true') return true;
  const allowed = (process.env.META_SANDBOX_ALLOWED_USER_IDS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(userId);
}

integrationsRouter.get('/meta/sandbox-available', AUTH, (req, res) => {
  return res.json({ available: isMetaSandboxAllowed(req.auth!.userId) });
});

integrationsRouter.post('/meta/connect-sandbox', AUTH, REQUIRE_WRITE, async (req, res) => {
  const companyId = req.auth!.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  if (!isMetaSandboxAllowed(req.auth!.userId)) {
    return res.status(403).json({ error: 'Sandbox connect is not available for this account.' });
  }

  const accessToken = process.env.META_SANDBOX_ACCESS_TOKEN!;
  const adAccountId = process.env.META_SANDBOX_AD_ACCOUNT_ID!;

  try {
    const account = await getMetaAdAccount(accessToken, adAccountId);
    const connection = await upsertMetaConnection(companyId, accessToken, account, { sandbox: true });
    return res.json(connection);
  } catch (e) {
    reportMetaConnectionError('sandbox_connection', e);
    return res.status(502).json({ error: 'The Meta sandbox account could not be connected. Check the backend sandbox configuration.' });
  }
});

// ─── Razorpay: connect using user-supplied Key ID + Key Secret ────────────────

integrationsRouter.post('/razorpay/connect', AUTH, REQUIRE_WRITE, async (req, res) => {
  const { keyId, keySecret } = req.body as { keyId?: string; keySecret?: string };
  if (!keyId?.trim() || !keySecret?.trim()) {
    return res.status(400).json({ error: 'keyId and keySecret are required.' });
  }

  const companyId = req.auth!.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  let accountName: string;
  try {
    accountName = await validateRazorpayKeys(keyId.trim(), keySecret.trim());
  } catch (e) {
    return res.status(400).json({ error: `Invalid Razorpay credentials: ${String(e)}` });
  }

  const { error } = await supabaseAdmin.from('integration_connections').upsert({
    company_id: companyId,
    integration_id: 'int-razorpay',
    account_name: accountName,
    sandbox_mode: false,
    access_token_enc: encrypt(keyId.trim()),
    refresh_token_enc: encrypt(keySecret.trim()),
    last_synced_at: new Date().toISOString(),
    metadata: { mode: keyId.startsWith('rzp_live_') ? 'live' : 'test' },
  }, { onConflict: 'company_id,integration_id' });

  if (error) return res.status(500).json({ error: error.message });

  return res.json({
    integrationId: 'int-razorpay',
    accountName,
    sandboxMode: false,
    connectedAt: new Date().toISOString(),
    lastSynced: new Date().toISOString(),
  });
});

// ─── HubSpot: connect using user-supplied Private App token ──────────────────

integrationsRouter.post('/hubspot/connect', AUTH, REQUIRE_WRITE, async (req, res) => {
  const { accessToken } = req.body as { accessToken?: string };
  if (!accessToken?.trim()) {
    return res.status(400).json({ error: 'accessToken is required.' });
  }

  const companyId = req.auth!.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  let accountName: string;
  try {
    accountName = await validateHubSpotToken(accessToken.trim());
  } catch (e) {
    return res.status(400).json({ error: `Invalid HubSpot token: ${String(e)}` });
  }

  const { error } = await supabaseAdmin.from('integration_connections').upsert({
    company_id: companyId,
    integration_id: 'int-hubspot',
    account_name: accountName,
    sandbox_mode: false,
    access_token_enc: encrypt(accessToken.trim()),
    last_synced_at: new Date().toISOString(),
  }, { onConflict: 'company_id,integration_id' });

  if (error) return res.status(500).json({ error: error.message });

  return res.json({
    integrationId: 'int-hubspot',
    accountName,
    sandboxMode: false,
    connectedAt: new Date().toISOString(),
    lastSynced: new Date().toISOString(),
  });
});

// ─── Salesforce: OAuth start ──────────────────────────────────────────────────

integrationsRouter.get('/salesforce/auth-url', AUTH, REQUIRE_WRITE, async (req, res) => {
  const companyId = req.auth!.companyId;
  const userId = req.auth!.userId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  if (!process.env.SALESFORCE_CLIENT_ID || !process.env.SALESFORCE_CLIENT_SECRET) {
    return res.status(501).json({
      error: 'Salesforce OAuth not configured. Add SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET to your backend .env',
    });
  }

  const state = signState({ companyId, userId, integration: 'int-sf' });
  return res.json({ url: getSalesforceAuthUrl(state) });
});

// ─── Salesforce: OAuth callback ───────────────────────────────────────────────

integrationsRouter.get('/salesforce/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query as Record<string, string>;

  if (oauthError) return res.send(oauthCallbackHtml('error', oauthError));

  const stateData = state ? verifyState(state) : null;
  if (!stateData) return res.send(oauthCallbackHtml('error', 'Invalid state — possible CSRF'));

  const { companyId } = stateData;

  let tokens: { accessToken: string; refreshToken: string; instanceUrl: string; userName: string };
  try {
    tokens = await exchangeSalesforceCode(code);
  } catch (e) {
    return res.send(oauthCallbackHtml('error', String(e)));
  }

  const accountName = `Salesforce · ${tokens.userName}`;
  const { error } = await supabaseAdmin.from('integration_connections').upsert({
    company_id: companyId,
    integration_id: 'int-sf',
    account_name: accountName,
    sandbox_mode: false,
    access_token_enc: encrypt(tokens.accessToken),
    refresh_token_enc: encrypt(tokens.refreshToken),
    last_synced_at: new Date().toISOString(),
    metadata: { instance_url: tokens.instanceUrl },
  }, { onConflict: 'company_id,integration_id' });

  if (error) return res.send(oauthCallbackHtml('error', error.message));
  return res.send(oauthCallbackHtml('success', '', 'int-sf', accountName));
});

// ─── QuickBooks: OAuth start ──────────────────────────────────────────────────

integrationsRouter.get('/quickbooks/auth-url', AUTH, REQUIRE_WRITE, async (req, res) => {
  const companyId = req.auth!.companyId;
  const userId = req.auth!.userId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  if (!process.env.QUICKBOOKS_CLIENT_ID || !process.env.QUICKBOOKS_CLIENT_SECRET) {
    return res.status(501).json({
      error: 'QuickBooks OAuth not configured. Add QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET to your backend .env',
    });
  }

  const state = signState({ companyId, userId, integration: 'int-qb' });
  return res.json({ url: getQuickBooksAuthUrl(state) });
});

// ─── QuickBooks: OAuth callback ───────────────────────────────────────────────

integrationsRouter.get('/quickbooks/callback', async (req, res) => {
  const { code, state, realmId, error: oauthError } = req.query as Record<string, string>;

  if (oauthError) return res.send(oauthCallbackHtml('error', oauthError));

  const stateData = state ? verifyState(state) : null;
  if (!stateData) return res.send(oauthCallbackHtml('error', 'Invalid state — possible CSRF'));
  if (!realmId)   return res.send(oauthCallbackHtml('error', 'Missing realmId from QuickBooks'));

  const { companyId } = stateData;

  let tokens: { accessToken: string; refreshToken: string };
  try {
    tokens = await exchangeQbCode(code);
  } catch (e) {
    return res.send(oauthCallbackHtml('error', String(e)));
  }

  const isSandbox = process.env.QUICKBOOKS_SANDBOX !== 'false';
  const accountName = `QuickBooks${isSandbox ? ' (Sandbox)' : ''}`;

  const { error } = await supabaseAdmin.from('integration_connections').upsert({
    company_id: companyId,
    integration_id: 'int-qb',
    account_name: accountName,
    sandbox_mode: isSandbox,
    access_token_enc: encrypt(tokens.accessToken),
    refresh_token_enc: encrypt(tokens.refreshToken),
    last_synced_at: new Date().toISOString(),
    metadata: { realm_id: realmId, sandbox: isSandbox },
  }, { onConflict: 'company_id,integration_id' });

  if (error) return res.send(oauthCallbackHtml('error', error.message));
  return res.send(oauthCallbackHtml('success', '', 'int-qb', accountName));
});

// ─── Jira: connect using domain + email + API token ───────────────────────────

integrationsRouter.post('/jira/connect', AUTH, REQUIRE_WRITE, async (req, res) => {
  const { domain: rawDomain, email, apiToken } = req.body as { domain?: string; email?: string; apiToken?: string };
  if (!rawDomain?.trim() || !email?.trim() || !apiToken?.trim()) {
    return res.status(400).json({ error: 'domain, email, and apiToken are required.' });
  }
  const domain = rawDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');

  const companyId = req.auth!.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  let accountName: string;
  try {
    accountName = await validateJiraCredentials(domain, email.trim(), apiToken.trim());
  } catch (e) {
    return res.status(400).json({ error: `Invalid Jira credentials: ${String(e)}` });
  }

  const displayName = `Jira · ${domain}`;
  const { error } = await supabaseAdmin.from('integration_connections').upsert({
    company_id: companyId,
    integration_id: 'int-jira',
    account_name: displayName,
    sandbox_mode: false,
    access_token_enc: encrypt(apiToken.trim()),
    refresh_token_enc: encrypt(email.trim()),
    last_synced_at: new Date().toISOString(),
    metadata: { domain, user_display_name: accountName },
  }, { onConflict: 'company_id,integration_id' });

  if (error) return res.status(500).json({ error: error.message });

  return res.json({
    integrationId: 'int-jira',
    accountName: displayName,
    sandboxMode: false,
    connectedAt: new Date().toISOString(),
    lastSynced: new Date().toISOString(),
  });
});

// ─── Slack: connect using Bot token ───────────────────────────────────────────

integrationsRouter.post('/slack/connect', AUTH, REQUIRE_WRITE, async (req, res) => {
  const { botToken } = req.body as { botToken?: string };
  if (!botToken?.trim()) {
    return res.status(400).json({ error: 'botToken is required.' });
  }

  const companyId = req.auth!.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  let workspaceName: string;
  try {
    workspaceName = await validateSlackToken(botToken.trim());
  } catch (e) {
    return res.status(400).json({ error: `Invalid Slack token: ${String(e)}` });
  }

  const accountName = `Slack · ${workspaceName}`;
  const { error } = await supabaseAdmin.from('integration_connections').upsert({
    company_id: companyId,
    integration_id: 'int-slack',
    account_name: accountName,
    sandbox_mode: false,
    access_token_enc: encrypt(botToken.trim()),
    last_synced_at: new Date().toISOString(),
    metadata: { workspace_name: workspaceName },
  }, { onConflict: 'company_id,integration_id' });

  if (error) return res.status(500).json({ error: error.message });

  return res.json({
    integrationId: 'int-slack',
    accountName,
    sandboxMode: false,
    connectedAt: new Date().toISOString(),
    lastSynced: new Date().toISOString(),
  });
});

// ─── Fetch live metrics for a connected integration ───────────────────────────

integrationsRouter.post('/meta/sync', AUTH, REQUIRE_READ, requirePermission('twin', 'read'), async (req, res) => {
  const companyId = req.auth!.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    const run = await enqueueMetaAdsSync(companyId, 'manual', req.auth!.userId);
    const brief = await buildMetaAdsBrief(companyId);
    return res.json({
      fresh: false,
      deduplicated: run.status !== 'pending',
      syncedAt: brief.connection.lastSuccessfulSyncAt,
      accountId: brief.connection.accountId ?? '',
      preview: {
        spend30d: brief.summary.spend,
        impressions30d: brief.summary.impressions,
        clicks30d: brief.summary.clicks,
        ctr: brief.summary.ctr,
        cpc: brief.summary.cpc,
        roas: brief.summary.purchaseRoas,
        conversions30d: brief.summary.selectedConversions,
        cpa: brief.summary.cpa,
        currency: brief.summary.currency ?? '',
        selectedConversionAction: brief.selectedConversionAction,
        conversionActions: brief.availableConversionActions,
        activeCampaigns: brief.campaigns.filter((campaign) => campaign.status === 'ACTIVE').length,
        topCampaigns: brief.campaigns.slice(0, 5).map((campaign) => ({ name: campaign.campaignName, spend: campaign.spend, roas: campaign.purchaseRoas, conversions: campaign.selectedConversions })),
      },
      metrics: brief.goalContext.map((metric) => ({
        id: metric.metricId,
        name: metric.label,
        current_value: metric.currentValue,
        target_value: metric.targetValue,
        normalized_score: metric.healthScore,
        unit: metric.unit,
        source_key: metric.metricKey,
        source_status: 'active',
        last_synced_at: brief.connection.lastSuccessfulSyncAt,
        last_error: brief.connection.error,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'meta_not_connected' ? 404 : 502;
    if (status === 502) reportMetaConnectionError('legacy_sync_enqueue', error);
    return res.status(status).json({
      error: status === 404 ? 'meta_not_connected' : 'Meta Ads refresh could not be queued. Please try again.',
    });
  }
});

integrationsRouter.get('/:integrationId/metrics', AUTH, REQUIRE_WRITE, async (req, res) => {
  const { integrationId } = req.params;
  const companyId = req.auth!.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const { data: conn, error } = await supabaseAdmin
    .from('integration_connections')
    .select('*')
    .eq('company_id', companyId)
    .eq('integration_id', integrationId)
    .single();

  if (error || !conn) return res.status(404).json({ error: 'Integration not connected' });

  // When the connection was created in sandbox mode (e.g. via the dev inject endpoint),
  // return mock metrics so the full backend→frontend pipeline can be tested without real credentials.
  if (conn.sandbox_mode && process.env.NODE_ENV !== 'production') {
    const mock = getDevMockMetrics(integrationId);
    if (mock) return res.json(mock);
  }

  try {
    let metrics: unknown;

    if (integrationId === 'int-stripe') {
      const apiKey = decrypt(conn.access_token_enc);
      metrics = { type: 'stripe', data: await fetchStripeMetrics(apiKey) };

    } else if (integrationId === 'int-ga') {
      const accessToken = decrypt(conn.access_token_enc);
      const refreshToken = conn.refresh_token_enc ? decrypt(conn.refresh_token_enc) : '';
      let propertyId = (conn.metadata as Record<string, string>)?.property_id ?? '';

      if (!propertyId) {
        const oauth2 = buildOAuth2Client();
        oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken || undefined });
        const props = await listProperties(oauth2);
        if (!props.length) return res.status(400).json({ error: 'No GA4 properties found on this account.' });
        propertyId = props[0].id;
        await supabaseAdmin.from('integration_connections')
          .update({ metadata: { property_id: propertyId }, account_name: `GA4 · ${props[0].name}` })
          .eq('company_id', companyId).eq('integration_id', 'int-ga');
      }

      metrics = { type: 'google-analytics', data: await fetchGAMetrics(accessToken, refreshToken, propertyId) };

    } else if (integrationId === 'int-meta') {
      const brief = await buildMetaAdsBrief(companyId);
      metrics = { type: 'meta-ads', data: {
        spend30d: brief.summary.spend,
        impressions30d: brief.summary.impressions,
        clicks30d: brief.summary.clicks,
        ctr: brief.summary.ctr,
        cpc: brief.summary.cpc,
        roas: brief.summary.purchaseRoas,
        conversions30d: brief.summary.selectedConversions,
        cpa: brief.summary.cpa,
        currency: brief.summary.currency ?? '',
        selectedConversionAction: brief.selectedConversionAction,
        conversionActions: brief.availableConversionActions,
        activeCampaigns: brief.campaigns.filter((campaign) => campaign.status === 'ACTIVE').length,
        topCampaigns: brief.campaigns.slice(0, 5).map((campaign) => ({ name: campaign.campaignName, spend: campaign.spend, roas: campaign.purchaseRoas, conversions: campaign.selectedConversions })),
      } };

    } else if (integrationId === 'int-razorpay') {
      const keyId     = decrypt(conn.access_token_enc);
      const keySecret = decrypt(conn.refresh_token_enc ?? '');
      if (!keyId || !keySecret) return res.status(400).json({ error: 'Razorpay credentials missing. Reconnect.' });
      metrics = { type: 'razorpay', data: await fetchRazorpayMetrics(keyId, keySecret) };

    } else if (integrationId === 'int-sf') {
      let accessToken  = decrypt(conn.access_token_enc);
      const instanceUrl = (conn.metadata as Record<string, string>)?.instance_url ?? '';
      if (!instanceUrl) return res.status(400).json({ error: 'Salesforce instance URL missing. Reconnect.' });

      try {
        metrics = { type: 'salesforce', data: await fetchSalesforceMetrics(accessToken, instanceUrl) };
      } catch (e) {
        if (String(e).includes('SALESFORCE_AUTH_EXPIRED') && conn.refresh_token_enc) {
          const refreshToken = decrypt(conn.refresh_token_enc);
          const refreshed = await refreshSalesforceToken(refreshToken);
          accessToken = refreshed.accessToken;
          await supabaseAdmin.from('integration_connections')
            .update({
              access_token_enc: encrypt(refreshed.accessToken),
              metadata: { ...((conn.metadata as object) ?? {}), instance_url: refreshed.instanceUrl },
            })
            .eq('company_id', companyId)
            .eq('integration_id', 'int-sf');
          metrics = { type: 'salesforce', data: await fetchSalesforceMetrics(refreshed.accessToken, refreshed.instanceUrl) };
        } else {
          throw e;
        }
      }

    } else if (integrationId === 'int-hubspot') {
      const token = decrypt(conn.access_token_enc);
      if (!token) return res.status(400).json({ error: 'HubSpot token missing. Reconnect.' });
      metrics = { type: 'hubspot', data: await fetchHubSpotMetrics(token) };

    } else if (integrationId === 'int-qb') {
      let accessToken  = decrypt(conn.access_token_enc);
      const realmId    = (conn.metadata as Record<string, string>)?.realm_id ?? '';
      if (!realmId) return res.status(400).json({ error: 'QuickBooks realm ID missing. Reconnect.' });

      try {
        metrics = { type: 'quickbooks', data: await fetchQuickBooksMetrics(accessToken, realmId) };
      } catch (e) {
        if (String(e).includes('QUICKBOOKS_AUTH_EXPIRED') && conn.refresh_token_enc) {
          const refreshToken = decrypt(conn.refresh_token_enc);
          const refreshed = await refreshQbToken(refreshToken);
          accessToken = refreshed.accessToken;
          await supabaseAdmin.from('integration_connections')
            .update({
              access_token_enc: encrypt(refreshed.accessToken),
              refresh_token_enc: encrypt(refreshed.refreshToken),
            })
            .eq('company_id', companyId)
            .eq('integration_id', 'int-qb');
          metrics = { type: 'quickbooks', data: await fetchQuickBooksMetrics(refreshed.accessToken, realmId) };
        } else {
          throw e;
        }
      }

    } else if (integrationId === 'int-jira') {
      const apiToken = decrypt(conn.access_token_enc);
      const email    = conn.refresh_token_enc ? decrypt(conn.refresh_token_enc) : '';
      const domain   = (conn.metadata as Record<string, string>)?.domain ?? '';
      if (!domain || !email || !apiToken) {
        return res.status(400).json({ error: 'Jira credentials incomplete. Reconnect.' });
      }
      metrics = { type: 'jira', data: await fetchJiraMetrics(domain, email, apiToken) };

    } else if (integrationId === 'int-slack') {
      const botToken = decrypt(conn.access_token_enc);
      if (!botToken) return res.status(400).json({ error: 'Slack token missing. Reconnect.' });
      metrics = { type: 'slack', data: await fetchSlackMetrics(botToken) };

    } else {
      return res.status(400).json({ error: `Live metrics not supported for ${integrationId}` });
    }

    // Persist snapshot for analytics (best-effort, non-blocking)
    const metricsData = (metrics as { data: unknown }).data;
    if (integrationId !== 'int-meta') saveSnapshot(companyId, integrationId, metricsData).catch(() => {});

    // Update last_synced_at
    if (integrationId !== 'int-meta') {
      await supabaseAdmin.from('integration_connections')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('integration_id', integrationId);
    }

    return res.json(metrics);
  } catch (e) {
    if (integrationId === 'int-meta') {
      reportMetaConnectionError('legacy_metrics_read', e);
      return res.status(502).json({ error: 'Meta Ads metrics are temporarily unavailable. Please try again.' });
    }
    return res.status(502).json({ error: `Failed to fetch metrics: ${String(e)}` });
  }
});

// ─── Disconnect an integration ────────────────────────────────────────────────

integrationsRouter.delete('/:integrationId/disconnect', AUTH, REQUIRE_WRITE, async (req, res) => {
  const { integrationId } = req.params;
  const companyId = req.auth!.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  if (integrationId === 'int-meta') await disconnectMetaMetricSources(companyId);

  const { error } = await supabaseAdmin.from('integration_connections')
    .delete()
    .eq('company_id', companyId)
    .eq('integration_id', integrationId);
  if (error) return res.status(500).json({ error: 'disconnect_failed' });

  if (integrationId === 'int-meta') {
    await reconcileDetachedMetaAdsExperiments(companyId, null);
  }

  return res.json({ ok: true });
});

// ─── Dev-only: return mock metrics for any integration (no credentials needed) ─
// Use this to test the full API → frontend pipeline without real accounts.
// Only active when NODE_ENV !== 'production'.

integrationsRouter.get('/dev/mock-metrics/:integrationId', AUTH, (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const result = getDevMockMetrics(req.params.integrationId);
  if (!result) {
    return res.status(404).json({ error: `No mock data for ${req.params.integrationId}` });
  }
  return res.json(result);
});

// ─── HTML page served inside the OAuth popup ──────────────────────────────────

function oauthCallbackHtml(
  outcome: 'success' | 'error',
  message = '',
  integrationId = '',
  accountName = '',
): string {
  const isSuccess = outcome === 'success';
  const msg = isSuccess ? `Connected: ${accountName}` : `Error: ${message}`;
  const color = isSuccess ? '#10b981' : '#ef4444';
  // Must target the frontend origin so the opener (the frontend window) receives the message.
  // window.location.origin here would be the *backend* URL, which is the wrong target.
  const targetOrigin = process.env.FRONTEND_URL ?? '*';

  return `<!DOCTYPE html>
<html>
<head>
  <title>${isSuccess ? 'Connected' : 'Error'}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      background:#0f172a; color:white;
      font-family:system-ui,-apple-system,sans-serif;
      display:flex; align-items:center; justify-content:center;
      height:100vh; flex-direction:column; gap:16px; text-align:center; padding:24px;
    }
    .icon { font-size:48px; }
    h2 { font-size:18px; font-weight:600; }
    p { font-size:13px; color:#94a3b8; }
    .badge { padding:4px 12px; border-radius:20px; font-size:12px; color:${color}; background:${color}18; border:1px solid ${color}40; }
  </style>
</head>
<body>
  <div class="icon">${isSuccess ? '✅' : '❌'}</div>
  <h2>${isSuccess ? 'Successfully connected!' : 'Connection failed'}</h2>
  <p>${msg}</p>
  <div class="badge">${isSuccess ? 'Closing window…' : 'Please try again'}</div>
  <script>
    if (window.opener) {
      window.opener.postMessage(
        { type: '${isSuccess ? 'oauth_success' : 'oauth_error'}', integrationId: '${integrationId}', accountName: '${accountName.replace(/'/g, "\\'")}', error: '${message.replace(/'/g, "\\'")}' },
        '${targetOrigin}'
      );
    }
    setTimeout(() => { try { window.close(); } catch(e) {} }, ${isSuccess ? 1500 : 3000});
  </script>
</body>
</html>`;
}

// Relays the ad account list + ticket to the SPA (which has the auth session
// needed to finalize the connection) instead of picking an account here.
function metaAccountRelayHtml(accounts: MetaAdAccount[], ticket: string): string {
  const targetOrigin = process.env.FRONTEND_URL ?? '*';
  const payload = JSON.stringify({ type: 'oauth_select_account', integrationId: 'int-meta', accounts, ticket })
    .replace(/</g, '\\u003c'); // defuse "</script" if ever present in an account name

  return `<!DOCTYPE html>
<html>
<head>
  <title>Choose an ad account</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      background:#0f172a; color:white;
      font-family:system-ui,-apple-system,sans-serif;
      display:flex; align-items:center; justify-content:center;
      height:100vh; flex-direction:column; gap:16px; text-align:center; padding:24px;
    }
    p { font-size:13px; color:#94a3b8; }
  </style>
</head>
<body>
  <p>Returning to Work OS to choose an ad account…</p>
  <script>
    if (window.opener) {
      window.opener.postMessage(${payload}, '${targetOrigin}');
    }
    setTimeout(() => { try { window.close(); } catch(e) {} }, 300);
  </script>
</body>
</html>`;
}
