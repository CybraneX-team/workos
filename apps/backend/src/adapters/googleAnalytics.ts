import { google } from 'googleapis';
import type { Auth } from 'googleapis';
// Canonical shape now lives in @cybranex/shared-types (was hand-duplicated in the frontend
// as GoogleAnalyticsMetrics) — aliased to the old local name so call sites are unchanged.
import type { GoogleAnalyticsMetrics as GAMetrics } from '@cybranex/shared-types';
export type { GAMetrics };

export function buildOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:8080/api/integrations/google/callback',
  );
}

export function getAuthUrl(oauth2: Auth.OAuth2Client, state: string): string {
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/analytics.manage.users.readonly',
    ],
    state,
  });
}

export async function exchangeCode(oauth2: Auth.OAuth2Client, code: string) {
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

export async function listProperties(
  oauth2: Auth.OAuth2Client,
): Promise<Array<{ id: string; name: string }>> {
  const admin = google.analyticsadmin({ version: 'v1beta', auth: oauth2 });

  const accountsRes = await admin.accounts.list();
  const accounts = accountsRes.data.accounts ?? [];

  const results: Array<{ id: string; name: string }> = [];
  for (const account of accounts) {
    if (!account.name) continue;
    const propsRes = await admin.properties.list({ filter: `parent:${account.name}` });
    for (const p of propsRes.data.properties ?? []) {
      results.push({ id: p.name ?? '', name: p.displayName ?? p.name ?? '' });
    }
  }
  return results;
}

export async function fetchGAMetrics(
  accessToken: string,
  refreshToken: string,
  propertyId: string,
): Promise<GAMetrics> {
  const oauth2 = buildOAuth2Client();
  oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

  const dataApi = google.analyticsdata({ version: 'v1beta', auth: oauth2 });
  const propName = propertyId.startsWith('properties/') ? propertyId : `properties/${propertyId}`;

  const [overviewRes, channelsRes, pagesRes, historyRes] = await Promise.all([
    dataApi.properties.runReport({
      property: propName,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' },
          { name: 'bounceRate' }, { name: 'averageSessionDuration' },
        ],
      },
    }),
    dataApi.properties.runReport({
      property: propName,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '5',
      },
    }),
    dataApi.properties.runReport({
      property: propName,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: '5',
      },
    }),
    dataApi.properties.runReport({
      property: propName,
      requestBody: {
        dateRanges: [{ startDate: '180daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'yearMonth' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ dimension: { dimensionName: 'yearMonth' } }],
      },
    }),
  ]);

  const ov = overviewRes.data.rows?.[0]?.metricValues ?? [];
  const sessions30d = parseInt(ov[0]?.value ?? '0');
  const users30d = parseInt(ov[1]?.value ?? '0');
  const newUsers30d = parseInt(ov[2]?.value ?? '0');
  const bounceRate = Math.round(parseFloat(ov[3]?.value ?? '0') * 1000) / 10;
  const avgSessionDuration = Math.round(parseFloat(ov[4]?.value ?? '0'));
  const conversionRate = sessions30d > 0 ? Math.round((newUsers30d / sessions30d) * 1000) / 10 : 0;

  const channelRows = channelsRes.data.rows ?? [];
  const totalSessions = channelRows.reduce((s, r) => s + parseInt(r.metricValues?.[0]?.value ?? '0'), 0) || 1;
  const topChannels = channelRows.map((r) => {
    const s = parseInt(r.metricValues?.[0]?.value ?? '0');
    return { channel: r.dimensionValues?.[0]?.value ?? '', sessions: s, pct: Math.round((s / totalSessions) * 100) };
  });

  const topPages = (pagesRes.data.rows ?? []).map((r) => ({
    page: r.dimensionValues?.[0]?.value ?? '',
    views: parseInt(r.metricValues?.[0]?.value ?? '0'),
  }));

  const MONTH_NAMES: Record<string, string> = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
    '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
  };
  const sessionsHistory = (historyRes.data.rows ?? []).slice(-6).map((r) => {
    const ym = r.dimensionValues?.[0]?.value ?? '';
    return { date: MONTH_NAMES[ym.slice(4)] ?? ym, value: parseInt(r.metricValues?.[0]?.value ?? '0') };
  });

  return { sessions30d, users30d, newUsers30d, bounceRate, avgSessionDuration, conversionRate, topChannels, topPages, sessionsHistory };
}
