// Canonical integration-adapter response shapes and connection metadata, shared between
// the backend (which produces these) and the frontend (which consumes them). Previously
// hand-duplicated, field-for-field, in both repos — this is now the single source of truth.

export interface StripeMetrics {
  mrr: number;
  mrrGrowth: number;
  arr: number;
  activeSubscribers: number;
  churnRate: number;
  avgRevenuePerUser: number;
  paymentVolume30d: number;
  failedPaymentRate: number;
  mrrHistory: Array<{ date: string; value: number }>;
  recentTransactions: Array<{
    id: string; amount: number; currency: string;
    status: 'succeeded' | 'failed' | 'pending'; date: string; customer: string;
  }>;
}

export interface GoogleAnalyticsMetrics {
  sessions30d: number;
  users30d: number;
  newUsers30d: number;
  bounceRate: number;
  avgSessionDuration: number;
  conversionRate: number;
  topChannels: Array<{ channel: string; sessions: number; pct: number }>;
  topPages: Array<{ page: string; views: number }>;
  sessionsHistory: Array<{ date: string; value: number }>;
}

export interface MetaAdsMetrics {
  spend30d: number;
  impressions30d: number;
  clicks30d: number;
  ctr: number;
  cpc: number;
  roas: number;
  conversions30d: number;
  cpa: number | null;
  currency: string;
  selectedConversionAction: string | null;
  conversionActions: Array<{ actionType: string; value: number }>;
  activeCampaigns: number;
  topCampaigns: Array<{ name: string; spend: number; roas: number; conversions: number }>;
}

export interface MetaAdAccount {
  id: string; // "act_<id>"
  name: string;
  currency: string;
  accountStatus: number; // 1 = ACTIVE
}

export interface RazorpayMetrics {
  paymentVolume30d: number;
  currency: string;
  totalTransactions30d: number;
  successRate: number;
  failedCount30d: number;
  avgOrderValue: number;
  activeSubscriptions: number;
  recentPayments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    date: string;
    method: string;
  }>;
  paymentHistory: Array<{ date: string; value: number }>;
}

export interface SalesforceMetrics {
  openPipelineValue: number;
  openDealsCount: number;
  winRate: number;
  avgDealCycleTime: number;
  closedWonValue90d: number;
  closedWonCount90d: number;
  pipelineVelocity: number;
  recentDeals: Array<{
    name: string;
    amount: number;
    stage: string;
    closeDate: string;
    status: 'open' | 'won' | 'lost';
  }>;
  stageBreakdown: Array<{
    stage: string;
    count: number;
    value: number;
  }>;
}

export interface HubSpotMetrics {
  totalContacts: number;
  newContacts30d: number;
  openDealsCount: number;
  pipelineValue: number;
  closedWonCount30d: number;
  closedWonValue30d: number;
  avgDealValue: number;
  recentDeals: Array<{
    id: string;
    name: string;
    amount: number;
    stage: string;
    closeDate: string;
    status: 'open' | 'won' | 'lost';
  }>;
  dealsByStage: Array<{ stage: string; count: number; value: number }>;
}

export interface QuickBooksMetrics {
  revenue30d: number;
  expenses30d: number;
  netIncome30d: number;
  outstandingInvoices: number;
  outstandingAmount: number;
  currency: string;
  recentInvoices: Array<{
    id: string;
    customer: string;
    amount: number;
    date: string;
    status: 'paid' | 'unpaid' | 'overdue';
  }>;
  revenueHistory: Array<{ date: string; value: number }>;
}

export interface JiraMetrics {
  workspaceName: string;
  totalOpenIssues: number;
  inProgressIssues: number;
  resolvedLast30d: number;
  openBugs: number;
  activeSprintName: string | null;
  activeSprintTotal: number;
  activeSprintDone: number;
  recentIssues: Array<{
    key: string;
    summary: string;
    type: string;
    priority: string;
    status: string;
    assignee: string | null;
  }>;
  issuesByType: Array<{ type: string; count: number }>;
  issuesByPriority: Array<{ priority: string; count: number }>;
}

export interface SlackMetrics {
  workspaceName: string;
  workspaceDomain: string;
  totalMembers: number;
  totalChannels: number;
  publicChannels: number;
  privateChannels: number;
  topChannels: Array<{
    name: string;
    memberCount: number;
    isPrivate: boolean;
    topic: string;
  }>;
}

// Previously existed only on the frontend (Startup_Digital_Twin/src/lib/integrations/types.ts);
// the backend built the identical shape as an untyped inline object literal in
// routes/integrations.ts's GET /connections handler, with nothing enforcing the two matched.
export interface IntegrationConnection {
  integrationId: string;
  connectedAt: string;
  lastSynced: string;
  accountName: string;
  sandboxMode: boolean;
}

export type IntegrationMetrics =
  | { type: 'stripe'; data: StripeMetrics }
  | { type: 'google-analytics'; data: GoogleAnalyticsMetrics }
  | { type: 'meta-ads'; data: MetaAdsMetrics }
  | { type: 'razorpay'; data: RazorpayMetrics }
  | { type: 'salesforce'; data: SalesforceMetrics }
  | { type: 'hubspot'; data: HubSpotMetrics }
  | { type: 'quickbooks'; data: QuickBooksMetrics }
  | { type: 'jira'; data: JiraMetrics }
  | { type: 'slack'; data: SlackMetrics };
