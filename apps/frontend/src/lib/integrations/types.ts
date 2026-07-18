// Canonical shapes now live in @cybranex/shared-types (previously hand-duplicated here,
// field-for-field, against the backend's adapters/*.ts interfaces).
export type {
  IntegrationConnection,
  StripeMetrics,
  GoogleAnalyticsMetrics,
  MetaAdsMetrics,
  RazorpayMetrics,
  SalesforceMetrics,
  HubSpotMetrics,
  QuickBooksMetrics,
  JiraMetrics,
  SlackMetrics,
  IntegrationMetrics,
  MetaAdsAttention,
  MetaAdsOperatingBrief,
  MetaAdsSyncRun,
} from '@cybranex/shared-types';

// Kept as a locally-named alias — existing call sites (IntegrationModal.tsx, service.ts)
// use this name for the account-picker feature; the shared canonical name is MetaAdAccount.
export type { MetaAdAccount as MetaAdAccountOption } from '@cybranex/shared-types';
