import type { RazorpayMetrics } from '@cybranex/shared-types';
export type { RazorpayMetrics };

const RZP_BASE = 'https://api.razorpay.com/v1';

function basicAuth(keyId: string, keySecret: string): string {
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

interface RzpPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  description?: string;
  created_at: number;
}

interface RzpCollection<T> {
  count: number;
  items: T[];
}

interface RzpSubscription {
  id: string;
  status: string;
}

async function rzpFetch<T>(keyId: string, keySecret: string, path: string): Promise<T> {
  const res = await fetch(`${RZP_BASE}${path}`, {
    headers: { Authorization: basicAuth(keyId, keySecret) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Razorpay ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}


export async function validateRazorpayKeys(keyId: string, keySecret: string): Promise<string> {
  await rzpFetch<RzpCollection<RzpPayment>>(keyId, keySecret, '/payments?count=1');
  const mode = keyId.startsWith('rzp_live_') ? 'Live' : 'Test';
  return `Razorpay · ${mode}`;
}

export async function fetchRazorpayMetrics(keyId: string, keySecret: string): Promise<RazorpayMetrics> {
  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

  const paymentsRes = await rzpFetch<RzpCollection<RzpPayment>>(
    keyId, keySecret,
    `/payments?from=${thirtyDaysAgo}&to=${now}&count=100`,
  );
  const payments = paymentsRes.items ?? [];

  const captured = payments.filter((p) => p.status === 'captured');
  const failed = payments.filter((p) => p.status === 'failed');

  const paymentVolume30d = captured.reduce((s, p) => s + p.amount / 100, 0);
  const avgOrderValue = captured.length > 0 ? paymentVolume30d / captured.length : 0;
  const successRate = payments.length > 0 ? (captured.length / payments.length) * 100 : 0;
  const currency = captured[0]?.currency ?? payments[0]?.currency ?? 'INR';

  const recentPayments = payments.slice(0, 5).map((p) => ({
    id: p.id,
    amount: p.amount / 100,
    currency: p.currency,
    status: p.status,
    date: new Date(p.created_at * 1000).toISOString().split('T')[0],
    method: p.method,
  }));

  let activeSubscriptions = 0;
  try {
    const subsRes = await rzpFetch<RzpCollection<RzpSubscription>>(
      keyId, keySecret, '/subscriptions?count=100',
    );
    activeSubscriptions = (subsRes.items ?? []).filter((s) => s.status === 'active').length;
  } catch { /* subscriptions may not be enabled on this account */ }

  const d = new Date();
  const paymentHistory = await Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      const monthStart = new Date(d.getFullYear(), d.getMonth() - (5 - i), 1);
      const monthEnd   = new Date(d.getFullYear(), d.getMonth() - (5 - i) + 1, 0, 23, 59, 59);
      const from = Math.floor(monthStart.getTime() / 1000);
      const to   = Math.floor(monthEnd.getTime()   / 1000);
      try {
        const res = await rzpFetch<RzpCollection<RzpPayment>>(
          keyId, keySecret, `/payments?from=${from}&to=${to}&count=100`,
        );
        const monthCaptured = (res.items ?? []).filter((p) => p.status === 'captured');
        return {
          date: monthStart.toLocaleString('en', { month: 'short' }),
          value: Math.round(monthCaptured.reduce((s, p) => s + p.amount / 100, 0)),
        };
      } catch {
        return { date: monthStart.toLocaleString('en', { month: 'short' }), value: 0 };
      }
    }),
  );

  return {
    paymentVolume30d: Math.round(paymentVolume30d),
    currency,
    totalTransactions30d: payments.length,
    successRate: Math.round(successRate * 10) / 10,
    failedCount30d: failed.length,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    activeSubscriptions,
    recentPayments,
    paymentHistory,
  };
}
