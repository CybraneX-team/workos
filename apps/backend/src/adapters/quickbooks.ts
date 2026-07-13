import type { QuickBooksMetrics } from '@cybranex/shared-types';
export type { QuickBooksMetrics };

const QB_AUTH_URL   = 'https://appcenter.intuit.com/connect/oauth2';
const QB_TOKEN_URL  = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_SANDBOX    = 'https://sandbox-quickbooks.api.intuit.com';
const QB_PROD       = 'https://quickbooks.api.intuit.com';

function qbBase() {
  return process.env.QUICKBOOKS_SANDBOX === 'false' ? QB_PROD : QB_SANDBOX;
}

function basicAuth() {
  return 'Basic ' + Buffer.from(
    `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`,
  ).toString('base64');
}

export function getQuickBooksAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.QUICKBOOKS_CLIENT_ID!,
    redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI!,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state,
  });
  return `${QB_AUTH_URL}?${params.toString()}`;
}

export async function exchangeQbCode(code: string): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI!,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`QuickBooks token exchange failed (${res.status}): ${text}`);
  }
  const data = await res.json() as { access_token: string; refresh_token: string };
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export async function refreshQbToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  });
  if (!res.ok) throw new Error('QUICKBOOKS_AUTH_EXPIRED');
  const data = await res.json() as { access_token: string; refresh_token: string };
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

async function qbFetch<T>(accessToken: string, realmId: string, path: string): Promise<T> {
  const res = await fetch(`${qbBase()}/v3/company/${realmId}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('QUICKBOOKS_AUTH_EXPIRED');
    throw new Error(`QuickBooks ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function extractPnlSection(plData: any, group: string): number {
  const rows: any[] = plData?.Rows?.Row ?? [];
  for (const row of rows) {
    if (row.group === group) {
      const cols: any[] = row.Summary?.ColData ?? [];
      return Math.abs(parseFloat(cols[1]?.value ?? cols[0]?.value ?? '0') || 0);
    }
  }
  return 0;
}


export async function fetchQuickBooksMetrics(accessToken: string, realmId: string): Promise<QuickBooksMetrics> {
  const now = new Date();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const [plData, invoicesData] = await Promise.all([
    qbFetch<any>(
      accessToken, realmId,
      `/reports/ProfitAndLoss?start_date=${fmt(thirtyDaysAgo)}&end_date=${fmt(now)}&minorversion=65`,
    ),
    qbFetch<any>(
      accessToken, realmId,
      `/query?query=SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS 10&minorversion=65`,
    ),
  ]);

  const revenue30d  = extractPnlSection(plData, 'Income');
  const expenses30d = extractPnlSection(plData, 'Expenses');

  const invoices: any[] = invoicesData?.QueryResponse?.Invoice ?? [];
  const today = new Date();

  const recentInvoices = invoices.map((inv: any) => {
    const balance  = parseFloat(inv.Balance ?? '0');
    const dueDate  = inv.DueDate ? new Date(inv.DueDate) : null;
    const status: 'paid' | 'unpaid' | 'overdue' =
      balance <= 0 ? 'paid' : dueDate && dueDate < today ? 'overdue' : 'unpaid';
    return {
      id: inv.Id,
      customer: inv.CustomerRef?.name ?? 'Unknown',
      amount: parseFloat(inv.TotalAmt ?? '0'),
      date: inv.TxnDate ?? '',
      status,
    };
  });

  const outstandingAmount   = invoices.reduce((s: number, inv: any) => s + parseFloat(inv.Balance ?? '0'), 0);
  const outstandingInvoices = recentInvoices.filter((i) => i.status !== 'paid').length;

  const revenueHistory = await Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      const d   = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      try {
        const pl = await qbFetch<any>(
          accessToken, realmId,
          `/reports/ProfitAndLoss?start_date=${fmt(d)}&end_date=${fmt(end)}&minorversion=65`,
        );
        return { date: d.toLocaleString('en', { month: 'short' }), value: Math.round(extractPnlSection(pl, 'Income')) };
      } catch {
        return { date: d.toLocaleString('en', { month: 'short' }), value: 0 };
      }
    }),
  );

  return {
    revenue30d:  Math.round(revenue30d),
    expenses30d: Math.round(expenses30d),
    netIncome30d: Math.round(revenue30d - expenses30d),
    outstandingInvoices,
    outstandingAmount: Math.round(outstandingAmount),
    currency: 'USD',
    recentInvoices,
    revenueHistory,
  };
}
