import Stripe from 'stripe';
import type { StripeMetrics } from '@cybranex/shared-types';
export type { StripeMetrics };

function client(secretKey: string) {
  // apiVersion must match whatever version the installed Stripe SDK exports.
  // We let the SDK pick its bundled default version.
  return new Stripe(secretKey);
}

export async function validateStripeKey(secretKey: string): Promise<string> {
  const stripe = client(secretKey);
  // balance.retrieve() works for both live and test keys and confirms key validity
  await stripe.balance.retrieve();
  return secretKey.startsWith('sk_test_') ? 'Stripe (Test Mode)' : 'Stripe (Live)';
}

export async function fetchStripeMetrics(secretKey: string): Promise<StripeMetrics> {
  const stripe = client(secretKey);

  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

  // Active subscriptions → MRR
  const subscriptions = await stripe.subscriptions.list({
    status: 'active', limit: 100, expand: ['data.items.data.price'],
  });
  let mrr = 0;
  for (const sub of subscriptions.data) {
    for (const item of sub.items.data) {
      const price = item.price;
      const amount = (price.unit_amount ?? 0) / 100;
      const qty = item.quantity ?? 1;
      if (price.recurring?.interval === 'year') {
        mrr += (amount / 12) * qty;
      } else if (price.recurring?.interval === 'month') {
        mrr += (amount / (price.recurring.interval_count ?? 1)) * qty;
      }
    }
  }

  // Cancelled in last 30 days for churn rate
  const cancelled = await stripe.subscriptions.list({
    status: 'canceled', created: { gte: thirtyDaysAgo }, limit: 100,
  });
  const activeCount = subscriptions.data.length;
  const churnRate = activeCount > 0 ? (cancelled.data.length / activeCount) * 100 : 0;

  // Recent charges
  const charges = await stripe.charges.list({ limit: 10 });
  const paymentVolume30d = charges.data
    .filter((c) => c.created >= thirtyDaysAgo && c.status === 'succeeded')
    .reduce((sum, c) => sum + c.amount / 100, 0);

  const failedCount = charges.data.filter((c) => c.status === 'failed').length;
  const failedPaymentRate = charges.data.length > 0 ? (failedCount / charges.data.length) * 100 : 0;

  // Resolve customer names for recent transactions
  const recentTransactions = await Promise.all(
    charges.data.slice(0, 5).map(async (ch) => {
      let customerName = 'Unknown';
      if (ch.customer) {
        try {
          const cust = await stripe.customers.retrieve(ch.customer as string);
          if ('name' in cust && cust.name) customerName = cust.name;
          else if ('email' in cust && cust.email) customerName = cust.email;
        } catch { /* deleted customer */ }
      } else {
        customerName = ch.billing_details?.name ?? ch.description ?? 'Unknown';
      }
      return {
        id: ch.id,
        amount: ch.amount / 100,
        currency: ch.currency.toUpperCase(),
        status: ch.status as 'succeeded' | 'failed' | 'pending',
        date: new Date(ch.created * 1000).toISOString().split('T')[0],
        customer: customerName,
      };
    }),
  );

  // MRR history: query monthly charge totals for last 6 months
  const now = new Date();
  const mrrHistory = await Promise.all(
    Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const start = Math.floor(d.getTime() / 1000);
      const end = Math.floor(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime() / 1000);
      return stripe.charges
        .list({ created: { gte: start, lte: end }, limit: 100 })
        .then((res) => ({
          date: d.toLocaleString('en', { month: 'short' }),
          value: Math.round(
            res.data.filter((c) => c.status === 'succeeded').reduce((s, c) => s + c.amount / 100, 0),
          ),
        }));
    }),
  );

  const mrrRounded = Math.round(mrr);
  const prevMrr = mrrHistory[mrrHistory.length - 2]?.value ?? 0;
  const mrrGrowth = prevMrr > 0 ? Math.round(((mrrRounded - prevMrr) / prevMrr) * 1000) / 10 : 0;

  return {
    mrr: mrrRounded,
    mrrGrowth,
    arr: mrrRounded * 12,
    activeSubscribers: activeCount,
    churnRate: Math.round(churnRate * 10) / 10,
    avgRevenuePerUser: activeCount > 0 ? Math.round((mrrRounded / activeCount) * 100) / 100 : 0,
    paymentVolume30d: Math.round(paymentVolume30d),
    failedPaymentRate: Math.round(failedPaymentRate * 10) / 10,
    mrrHistory,
    recentTransactions,
  };
}
