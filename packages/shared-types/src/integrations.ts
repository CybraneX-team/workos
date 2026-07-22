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
  timezone?: string;
}

export type MetaAdsFindingSeverity = 'info' | 'warning' | 'critical';
export type MetaAdsFindingScope = 'integration' | 'account' | 'campaign' | 'adset' | 'ad';
export type MetaAdsConnectionState =
  | 'disconnected'
  | 'backfilling'
  | 'refreshing'
  | 'healthy'
  | 'no_spend'
  | 'needs_configuration'
  | 'stale'
  | 'failed'
  | 'historical';
export type MetaAdsSyncStatus = 'pending' | 'running' | 'complete' | 'failed';
export type MetaAdsSyncReason = 'initial_backfill' | 'daily' | 'manual' | 'recovery';
export type MetaAdsDiagnosticCoverage = 'not_started' | 'preparing' | 'current' | 'partial';
export type MetaAdsExperimentMetric = 'ctr' | 'cpa' | 'purchase_roas';
export type MetaAdsExperimentStatus = 'planned' | 'measuring' | 'completed' | 'cancelled';
export type MetaAdsExperimentOutcome = 'improved' | 'worsened' | 'no_clear_change' | 'inconclusive';
export type MetaAdsExperimentConfidence = 'medium' | 'high';

export interface MetaAdsConnectionHealth {
  connected: boolean;
  state: MetaAdsConnectionState;
  accountId: string | null;
  accountName: string | null;
  currency: string | null;
  timezone: string | null;
  dataThrough: string | null;
  lastSuccessfulSyncAt: string | null;
  lastAttemptedAt: string | null;
  dataAgeHours: number | null;
  error: string | null;
  adsManagerUrl: string | null;
}

export interface MetaAdsSummaryValues {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  purchaseRoas: number;
  selectedConversions: number;
  cpa: number | null;
}

export interface MetaAdsSummary extends MetaAdsSummaryValues {
  periodStart: string | null;
  periodEnd: string | null;
  currency: string | null;
  previous: MetaAdsSummaryValues | null;
  deltas: {
    spendPct: number | null;
    ctrPct: number | null;
    purchaseRoasPct: number | null;
    selectedConversionsPct: number | null;
    cpaPct: number | null;
  };
}

export interface MetaAdsSeriesPoint extends MetaAdsSummaryValues {
  date: string;
}

export interface MetaAdsCampaignSummary extends MetaAdsSummaryValues {
  campaignId: string;
  campaignName: string;
  status: string;
  spendShare: number;
  purchaseRoasDeltaPct: number | null;
  adsManagerUrl: string;
}

export interface MetaAdsGoalContext {
  metricId: string;
  metricKey: string;
  label: string;
  unit: string;
  currentValue: number | null;
  targetValue: number | null;
  healthScore: number | null;
  owner: { id: string; name: string } | null;
  goals: Array<{ id: string; title: string }>;
}

export interface MetaAdsFinding {
  id: string;
  fingerprint: string;
  severity: MetaAdsFindingSeverity;
  scope: MetaAdsFindingScope;
  kind: string;
  title: string;
  explanation: string;
  affectedPeriod: { start: string | null; end: string | null };
  evidence: Record<string, string | number | boolean | null>;
  estimatedSpendExposure: number;
  action: {
    kind: 'open_goal' | 'configure_conversion' | 'reconnect_meta' | 'open_ads_manager' | 'review_paid_acquisition';
    label: string;
    href: string;
  };
  firstDetectedAt: string;
  lastDetectedAt: string;
  episode?: number;
  confidence?: MetaAdsExperimentConfidence | null;
  diagnosis?: MetaAdsDiagnostic | null;
  recommendation?: MetaAdsRecommendation | null;
  workflowState?: 'open' | 'dismissed' | 'planned' | 'measuring' | 'completed' | null;
}

export interface MetaAdsDiagnostic {
  kind: string;
  summary: string;
  likelyDriver: string;
  confidence: MetaAdsExperimentConfidence;
  affectedObject: {
    scope: Extract<MetaAdsFindingScope, 'account' | 'campaign' | 'adset' | 'ad'>;
    id: string;
    name: string;
    campaignId?: string | null;
    campaignName?: string | null;
    adsetId?: string | null;
    adsetName?: string | null;
    creativeId?: string | null;
    creativeName?: string | null;
    creativeFormat?: string | null;
    thumbnailUrl?: string | null;
  };
  evidence: Record<string, string | number | boolean | null>;
}

export interface MetaAdsRecommendation {
  kind: 'rotate_creative' | 'replace_conversion_outlier' | 'rebalance_campaign';
  hypothesis: string;
  change: string;
  keepConstant: string[];
  primaryMetric: MetaAdsExperimentMetric;
  primaryDirection: 'higher' | 'lower';
  guardrailMetric: string;
  measurementScope: 'account' | 'campaign' | 'adset';
  measurementScopeId: string;
  measurementScopeName: string;
  adsManagerUrl: string;
}

export interface MetaAdsDeliverySummary {
  scope: 'adset' | 'ad';
  id: string;
  name: string;
  status: string;
  campaignId: string;
  campaignName: string;
  adsetId: string | null;
  adsetName: string | null;
  creativeId: string | null;
  creativeName: string | null;
  creativeFormat: string | null;
  thumbnailUrl: string | null;
  spend: number;
  spendShare: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach: number;
  frequency: number;
  outboundClicks: number;
  landingPageViews: number;
  landingPageViewRate: number | null;
  purchaseRoas: number;
  selectedConversions: number;
  cpa: number | null;
  adsManagerUrl: string;
}

export interface MetaAdsAssignee {
  memberId: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  isCurrentUser: boolean;
}

export interface MetaAdsExperimentMetrics {
  periodStart: string;
  periodEnd: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  purchaseRoas: number;
  purchaseCount: number;
  selectedConversions: number;
  cpa: number | null;
}

export interface MetaAdsExperimentEvent {
  id: string;
  type: 'started' | 'updated' | 'applied' | 'extended' | 'evaluated' | 'cancelled' | 'owner_removed';
  actorName: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface MetaAdsExperiment {
  id: string;
  findingId: string;
  findingEpisode: number;
  accountId: string;
  accountName: string | null;
  formerAccount: boolean;
  status: MetaAdsExperimentStatus;
  outcome: MetaAdsExperimentOutcome | null;
  title: string;
  hypothesis: string;
  recommendedChange: string;
  scope: Extract<MetaAdsFindingScope, 'account' | 'campaign' | 'adset' | 'ad'>;
  scopeId: string;
  scopeName: string;
  measurementScope: 'account' | 'campaign' | 'adset';
  measurementScopeId: string;
  measurementScopeName: string;
  primaryMetric: MetaAdsExperimentMetric;
  primaryDirection: 'higher' | 'lower';
  guardrailMetric: string;
  selectedConversionAction: string | null;
  recommendation: MetaAdsRecommendation;
  sourceEvidence: Record<string, unknown>;
  owner: { memberId: string | null; name: string; missing: boolean };
  dueDate: string;
  overdue: boolean;
  createdAt: string;
  appliedAt: string | null;
  appliedLocalDate: string | null;
  implementationNote: string | null;
  keptBudgetConstant: boolean | null;
  baseline7: MetaAdsExperimentMetrics | null;
  baseline14: MetaAdsExperimentMetrics | null;
  evaluationStart: string | null;
  evaluationDue7: string | null;
  evaluationDue14: string | null;
  measurementProgress: { completeDays: number; targetDays: 7 | 14 } | null;
  evaluationDays: 7 | 14 | null;
  resultMetrics: MetaAdsExperimentMetrics | null;
  resultExplanation: string | null;
  confidence: MetaAdsExperimentConfidence | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  adsManagerUrl: string;
  events?: MetaAdsExperimentEvent[];
}

export interface MetaAdsDecisionInbox {
  generatedAt: string;
  accountId: string | null;
  accountName: string | null;
  timezone: string | null;
  dataThrough: string | null;
  coverage: MetaAdsDiagnosticCoverage;
  coverageWarnings: string[];
  counts: {
    open: number;
    planned: number;
    measuring: number;
    overdue: number;
    completed: number;
  };
  findings: MetaAdsFinding[];
  activeExperiments: MetaAdsExperiment[];
  recentResults: MetaAdsExperiment[];
  deliveryDrivers: MetaAdsDeliverySummary[];
}

export interface MetaAdsSyncRun {
  id: string;
  accountId: string;
  reason: MetaAdsSyncReason;
  status: MetaAdsSyncStatus;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  attempt: number;
  maxAttempts: number;
  error: string | null;
  dataThrough: string | null;
  diagnosticCoverage?: MetaAdsDiagnosticCoverage;
  warnings?: string[];
}

export interface MetaAdsOperatingBrief {
  connection: MetaAdsConnectionHealth;
  summary: MetaAdsSummary;
  series: MetaAdsSeriesPoint[];
  campaigns: MetaAdsCampaignSummary[];
  goalContext: MetaAdsGoalContext[];
  findings: MetaAdsFinding[];
  topFindings: MetaAdsFinding[];
  selectedConversionAction: string | null;
  availableConversionActions: Array<{ actionType: string; value: number }>;
  latestSyncRun: MetaAdsSyncRun | null;
}

export interface MetaAdsAttention {
  count: number;
  warningCount: number;
  criticalCount: number;
  highestPriorityFinding: MetaAdsFinding | null;
  dataAgeHours: number | null;
  decisionCount?: number;
  overdueCount?: number;
  authoringApprovalCount?: number;
  authoringFailureCount?: number;
}

export type MetaAdsAuthoringMode = 'disabled' | 'sandbox_only' | 'allowlisted_real';
export type MetaAdsAuthoringStatus =
  | 'draft'
  | 'generating'
  | 'submitted'
  | 'publish_approved'
  | 'publishing'
  | 'published_paused'
  | 'launch_approved'
  | 'launching'
  | 'scheduled'
  | 'active'
  | 'pending_meta_review'
  | 'paused'
  | 'failed'
  | 'cancelled';
export type MetaAdsCreativeAspectRatio = '1:1' | '4:5' | '9:16';
export type MetaAdsCreativeAssetSource = 'upload' | 'gemini';
export type MetaAdsCampaignJobKind = 'publish_paused' | 'launch' | 'pause';
export type MetaAdsCampaignJobStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface MetaAdsPageIdentity {
  pageId: string;
  pageName: string;
  instagramActorId: string | null;
  instagramUsername: string | null;
  /**
   * Whether the Page has accepted Meta's Lead Generation Terms of Service — a one-time manual
   * step in Page settings that no API can perform. Optional because drafts saved before
   * lead-form support have no such field; preflight reads it from live readiness, never from a
   * stored snapshot.
   */
  leadgenTosAccepted?: boolean;
}

export interface MetaAdsAuthoringReadiness {
  mode: MetaAdsAuthoringMode;
  connected: boolean;
  permitted: boolean;
  launchEnabled: boolean;
  accountId: string | null;
  accountName: string | null;
  currency: string | null;
  timezone: string | null;
  sandbox: boolean;
  tokenExpiresAt: string | null;
  accountStatus: number | null;
  pages: MetaAdsPageIdentity[];
  maxLifetimeBudgetMinor: number;
  blockers: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}

export interface MetaAdsBrandKit {
  businessName: string;
  brandVoice: string;
  valueProposition: string;
  targetAudience: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoAssetId: string | null;
  requiredPhrases: string[];
  prohibitedPhrases: string[];
  updatedAt: string | null;
}

export interface MetaAdsCreativeAsset {
  id: string;
  source: MetaAdsCreativeAssetSource;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  aspectRatio: MetaAdsCreativeAspectRatio | null;
  signedUrl: string;
  prompt: string | null;
  model: string | null;
  createdAt: string;
}

export interface MetaAdsCreativeConcept {
  id: string;
  name: string;
  rationale: string;
  primaryText: string;
  headline: string;
  description: string;
  callToAction: 'LEARN_MORE' | 'SHOP_NOW' | 'SIGN_UP' | 'CONTACT_US' | 'GET_QUOTE';
  assetIds: Partial<Record<MetaAdsCreativeAspectRatio, string>>;
}

export interface MetaAdsCreativeGenerationJob {
  id: string;
  draftId: string;
  status: MetaAdsCampaignJobStatus;
  attempt: number;
  maxAttempts: number;
  error: string | null;
  concepts: MetaAdsCreativeConcept[];
  requestedAt: string;
  completedAt: string | null;
}

export interface MetaAdsErpProductContext {
  itemCode: string;
  itemName: string;
  disabled: boolean;
  currency: string | null;
  price: number | null;
  stockQuantity: number | null;
  source: 'erpnext';
  confirmedAt: string;
}

export interface MetaAdsCampaignBrief {
  goal: string;
  offer: string;
  proofPoints: string[];
  targetCustomer: string;
  landingPageUrl: string;
  callToAction: MetaAdsCreativeConcept['callToAction'];
  regulatedCategory: 'none' | 'credit' | 'employment' | 'housing' | 'politics' | 'alcohol' | 'gambling' | 'tobacco' | 'healthcare' | 'financial_products' | 'crypto' | 'adult' | 'weapons';
}

export interface MetaAdsCampaignAudience {
  countries: string[];
  ageMin: number;
  ageMax: number;
  languageIds: number[];
}

export interface MetaAdsDraftAd {
  id: string;
  conceptId: string | null;
  assetId: string;
  name: string;
  primaryText: string;
  headline: string;
  description: string;
  callToAction: MetaAdsCreativeConcept['callToAction'];
}

/**
 * Where an ad sends the person who clicks it. `website` is the original behaviour (a link ad
 * pointing at `brief.landingPageUrl`); `lead_form` publishes a Meta instant form instead and
 * routes submissions into Frappe CRM.
 */
export type MetaAdsCampaignDestination = 'website' | 'lead_form';

/**
 * Meta's own standard question types. Their answer keys are assigned by Meta, not by us —
 * verified against Graph v25: FIRST_NAME -> `first_name`, LAST_NAME -> `last_name`,
 * EMAIL -> `email`, PHONE -> `phone_number` (note: not `phone`).
 */
export type MetaAdsLeadFormQuestionType = 'FIRST_NAME' | 'LAST_NAME' | 'EMAIL' | 'PHONE' | 'CUSTOM';

export interface MetaAdsLeadFormQuestion {
  /** Meta's answer key. Standard types get a Meta-assigned key; CUSTOM questions carry ours. */
  key: string;
  type: MetaAdsLeadFormQuestionType;
  /** Shown to the person filling the form. Meta supplies a default for standard types. */
  label: string;
  /** Target `CRM Lead` fieldname, or null to collect the answer without syncing it. */
  crmField: string | null;
}

export interface MetaAdsLeadFormSpec {
  /**
   * Content hash over the question set plus the copy Meta bakes into a form at creation time.
   * Forms are reused when this matches, because Frappe CRM allows exactly one enabled
   * `Lead Sync Source` per form — minting one form per campaign would multiply sync sources
   * and their polling against Meta.
   */
  questionSetHash: string;
  questions: MetaAdsLeadFormQuestion[];
  /** Required by Meta on every lead form. */
  privacyPolicyUrl: string;
  /** Optional "thank you" destination shown after submission. */
  followUpUrl: string;
  contextHeadline: string;
  contextDescription: string;
}

export interface MetaAdsCampaignDraftContent {
  name: string;
  destination: MetaAdsCampaignDestination;
  brief: MetaAdsCampaignBrief;
  identity: MetaAdsPageIdentity | null;
  audience: MetaAdsCampaignAudience;
  lifetimeBudgetMinor: number;
  startTime: string;
  endTime: string;
  specialAdCategories: string[];
  dsaBeneficiary: string;
  dsaPayor: string;
  productContext: MetaAdsErpProductContext | null;
  concepts: MetaAdsCreativeConcept[];
  ads: MetaAdsDraftAd[];
  /** Present only when `destination` is `lead_form`. */
  leadForm: MetaAdsLeadFormSpec | null;
}

export interface MetaAdsPreflightIssue {
  code: string;
  severity: 'blocking' | 'warning';
  field: string | null;
  message: string;
}

export interface MetaAdsCampaignPreflight {
  checkedAt: string;
  ready: boolean;
  snapshotHash: string;
  issues: MetaAdsPreflightIssue[];
}

export interface MetaAdsCampaignApproval {
  id: string;
  kind: 'publish' | 'launch';
  approvedBy: string | null;
  approvedByName: string;
  version: number;
  snapshotHash: string;
  note: string | null;
  approvedAt: string;
}

export interface MetaAdsCampaignEvent {
  id: string;
  type: string;
  actorName: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface MetaAdsCampaignJob {
  id: string;
  draftId: string;
  kind: MetaAdsCampaignJobKind;
  status: MetaAdsCampaignJobStatus;
  attempt: number;
  maxAttempts: number;
  error: string | null;
  requestedAt: string;
  completedAt: string | null;
  steps: Array<{
    key: string;
    status: 'pending' | 'running' | 'complete' | 'failed';
    metaObjectId: string | null;
    error: string | null;
  }>;
}

export interface MetaAdsCampaignDraft {
  id: string;
  accountId: string;
  status: MetaAdsAuthoringStatus;
  version: number;
  content: MetaAdsCampaignDraftContent;
  preflight: MetaAdsCampaignPreflight | null;
  approvals: MetaAdsCampaignApproval[];
  latestJob: MetaAdsCampaignJob | null;
  metaObjects: {
    campaignId: string | null;
    adsetId: string | null;
    creativeIds: string[];
    adIds: string[];
  };
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  events?: MetaAdsCampaignEvent[];
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
  lastSynced: string | null;
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
