import type { SalesforceMetrics } from '@cybranex/shared-types';
export type { SalesforceMetrics };

async function sfQuery<T>(
  accessToken: string,
  instanceUrl: string,
  soql: string,
): Promise<{ records: T[]; totalSize: number }> {
  const url = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('SALESFORCE_AUTH_EXPIRED');
    throw new Error(`Salesforce API ${res.status}: ${body}`);
  }
  return res.json() as Promise<{ records: T[]; totalSize: number }>;
}

export async function fetchSalesforceMetrics(
  accessToken: string,
  instanceUrl: string,
): Promise<SalesforceMetrics> {
  // Open pipeline by stage
  const stageRes = await sfQuery<{ StageName: string; opCount: number; totalAmount: number }>(
    accessToken, instanceUrl,
    'SELECT StageName, COUNT(Id) opCount, SUM(Amount) totalAmount FROM Opportunity WHERE IsClosed = false GROUP BY StageName',
  );
  const stageBreakdown = stageRes.records.map((r) => ({
    stage: r.StageName,
    count: r.opCount ?? 0,
    value: r.totalAmount ?? 0,
  }));
  const openPipelineValue = stageBreakdown.reduce((s, r) => s + r.value, 0);
  const openDealsCount = stageBreakdown.reduce((s, r) => s + r.count, 0);

  // Win / loss counts — last 90 days
  const [wonRes, lostRes, wonValueRes] = await Promise.all([
    sfQuery<{ expr0: number }>(
      accessToken, instanceUrl,
      'SELECT COUNT(Id) FROM Opportunity WHERE IsWon = true AND CloseDate = LAST_N_DAYS:90',
    ),
    sfQuery<{ expr0: number }>(
      accessToken, instanceUrl,
      'SELECT COUNT(Id) FROM Opportunity WHERE IsWon = false AND IsClosed = true AND CloseDate = LAST_N_DAYS:90',
    ),
    sfQuery<{ expr0: number }>(
      accessToken, instanceUrl,
      'SELECT SUM(Amount) FROM Opportunity WHERE IsWon = true AND CloseDate = LAST_N_DAYS:90',
    ),
  ]);

  const wonCount  = (wonRes.records[0]      as any)?.expr0 ?? 0;
  const lostCount = (lostRes.records[0]     as any)?.expr0 ?? 0;
  const closedWonValue90d = (wonValueRes.records[0] as any)?.expr0 ?? 0;
  const winRate = (wonCount + lostCount) > 0 ? (wonCount / (wonCount + lostCount)) * 100 : 0;

  // Average deal cycle time from won deals (last 90 days)
  const cycleRes = await sfQuery<{ CreatedDate: string; CloseDate: string }>(
    accessToken, instanceUrl,
    'SELECT CreatedDate, CloseDate FROM Opportunity WHERE IsWon = true AND CloseDate = LAST_N_DAYS:90 LIMIT 100',
  );
  let avgDealCycleTime = 0;
  if (cycleRes.records.length > 0) {
    const days = cycleRes.records.map((r) =>
      (new Date(r.CloseDate).getTime() - new Date(r.CreatedDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    avgDealCycleTime = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
  }

  const pipelineVelocity = Math.round(
    (openPipelineValue * (winRate / 100)) / Math.max(avgDealCycleTime, 1),
  );

  // Recent deals
  const recentRes = await sfQuery<{
    Name: string; Amount: number; StageName: string; CloseDate: string; IsWon: boolean; IsClosed: boolean;
  }>(
    accessToken, instanceUrl,
    'SELECT Name, Amount, StageName, CloseDate, IsWon, IsClosed FROM Opportunity ORDER BY LastModifiedDate DESC LIMIT 10',
  );
  const recentDeals = recentRes.records.map((r) => ({
    name: r.Name,
    amount: r.Amount ?? 0,
    stage: r.StageName,
    closeDate: r.CloseDate,
    status: (!r.IsClosed ? 'open' : r.IsWon ? 'won' : 'lost') as 'open' | 'won' | 'lost',
  }));

  return {
    openPipelineValue: Math.round(openPipelineValue),
    openDealsCount,
    winRate: Math.round(winRate * 10) / 10,
    avgDealCycleTime,
    closedWonValue90d: Math.round(closedWonValue90d),
    closedWonCount90d: wonCount,
    pipelineVelocity,
    recentDeals,
    stageBreakdown,
  };
}

export function getSalesforceAuthUrl(state: string): string {
  const clientId   = process.env.SALESFORCE_CLIENT_ID ?? '';
  const redirectUri = process.env.SALESFORCE_REDIRECT_URI
    ?? 'http://localhost:8080/api/integrations/salesforce/callback';
  return [
    'https://login.salesforce.com/services/oauth2/authorize',
    `?response_type=code`,
    `&client_id=${encodeURIComponent(clientId)}`,
    `&redirect_uri=${encodeURIComponent(redirectUri)}`,
    `&scope=${encodeURIComponent('api refresh_token')}`,
    `&state=${encodeURIComponent(state)}`,
  ].join('');
}

export async function exchangeSalesforceCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  instanceUrl: string;
  userName: string;
}> {
  const params = new URLSearchParams({
    grant_type:    'authorization_code',
    client_id:     process.env.SALESFORCE_CLIENT_ID ?? '',
    client_secret: process.env.SALESFORCE_CLIENT_SECRET ?? '',
    redirect_uri:  process.env.SALESFORCE_REDIRECT_URI ?? 'http://localhost:8080/api/integrations/salesforce/callback',
    code,
  });
  const res = await fetch('https://login.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Salesforce code exchange failed: ${await res.text()}`);
  const data = await res.json() as {
    access_token: string; refresh_token: string; instance_url: string; id: string;
  };

  let userName = 'Salesforce';
  try {
    const idRes = await fetch(data.id, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (idRes.ok) {
      const idData = await idRes.json() as { display_name?: string; username?: string };
      userName = idData.display_name ?? idData.username ?? 'Salesforce';
    }
  } catch { /* non-fatal */ }

  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    instanceUrl:  data.instance_url,
    userName,
  };
}

export async function refreshSalesforceToken(refreshToken: string): Promise<{
  accessToken: string;
  instanceUrl: string;
}> {
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     process.env.SALESFORCE_CLIENT_ID ?? '',
    client_secret: process.env.SALESFORCE_CLIENT_SECRET ?? '',
    refresh_token: refreshToken,
  });
  const res = await fetch('https://login.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Salesforce token refresh failed: ${await res.text()}`);
  const data = await res.json() as { access_token: string; instance_url: string };
  return { accessToken: data.access_token, instanceUrl: data.instance_url };
}
