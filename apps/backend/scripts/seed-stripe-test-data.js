#!/usr/bin/env node
/**
 * Stripe test-data seeder
 *
 * Creates realistic test data in a Stripe test account so that
 * fetchStripeMetrics() returns non-zero numbers during development.
 *
 * Usage:
 *   node scripts/seed-stripe-test-data.js sk_test_YOUR_KEY_HERE
 *
 * Safe to run multiple times — each run adds more customers/subscriptions.
 * Data only exists in test mode (keys starting with sk_test_).
 */

import Stripe from 'stripe';

const key = process.argv[2];
if (!key) {
  console.error('Usage: node scripts/seed-stripe-test-data.js sk_test_...');
  process.exit(1);
}
if (!key.startsWith('sk_test_')) {
  console.error('Only test keys (sk_test_) are allowed. Never run this with a live key.');
  process.exit(1);
}

const stripe = new Stripe(key);

const CUSTOMERS = [
  { name: 'Acme Corp',      email: 'billing@acmecorp.io' },
  { name: 'TechFlow Inc',   email: 'billing@techflow.io' },
  { name: 'DataSync Pro',   email: 'accounts@datasyncp.ro' },
  { name: 'CloudWave',      email: 'pay@cloudwave.dev' },
  { name: 'Pixel Labs',     email: 'billing@pixellabs.io' },
  { name: 'NovaMind AI',    email: 'finance@novamind.ai' },
  { name: 'Orbis Analytics',email: 'billing@orbisanalytics.com' },
];

const PLAN_AMOUNTS = [99, 199, 299, 499]; // USD/month

async function run() {
  console.log('Creating test product and prices...');

  const product = await stripe.products.create({
    name: 'SaaS Platform',
    description: 'Monthly subscription — seeded by dev script',
  });

  const prices = await Promise.all(
    PLAN_AMOUNTS.map((amount) =>
      stripe.prices.create({
        product: product.id,
        unit_amount: amount * 100,
        currency: 'usd',
        recurring: { interval: 'month' },
        nickname: `$${amount}/mo`,
      }),
    ),
  );

  console.log(`Created product ${product.id} with ${prices.length} prices.`);

  for (const cust of CUSTOMERS) {
    const customer = await stripe.customers.create({
      name: cust.name,
      email: cust.email,
      payment_method: 'pm_card_visa', // Stripe's built-in test card
      invoice_settings: { default_payment_method: 'pm_card_visa' },
    });

    const price = prices[Math.floor(Math.random() * prices.length)];

    await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      default_payment_method: 'pm_card_visa',
    });

    console.log(`  ✓ ${cust.name} → ${price.nickname}`);
  }

  // Simulate 1 cancelled subscription for churn rate calculation
  const churnCustomer = await stripe.customers.create({
    name: 'Churned User Co',
    email: 'billing@churned.io',
    payment_method: 'pm_card_visa',
    invoice_settings: { default_payment_method: 'pm_card_visa' },
  });
  const churnSub = await stripe.subscriptions.create({
    customer: churnCustomer.id,
    items: [{ price: prices[0].id }],
    default_payment_method: 'pm_card_visa',
  });
  await stripe.subscriptions.cancel(churnSub.id);
  console.log('  ✓ Churned User Co → cancelled (for churn rate)');

  console.log('\nDone! Your Stripe test account now has:');
  console.log(`  • ${CUSTOMERS.length} active subscriptions`);
  console.log('  • 1 cancelled subscription');
  console.log('  • Mix of $99/$199/$299/$499 plans');
  console.log('\nYou can now connect with your sk_test_ key and see real metrics.');
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
