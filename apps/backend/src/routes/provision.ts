import { Router } from 'express';
import { supabaseAdmin, pool } from '../db.js';
import { env } from '../config.js';

export const provisionRouter = Router();

function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    + '-' + Math.random().toString(36).slice(2, 6);
}

async function computeOffset3D(): Promise<{ x: number; y: number; z: number }> {
  const { count } = await supabaseAdmin
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  const idx = count ?? 0;
  const phi = (1 + Math.sqrt(5)) / 2;
  const radius = 9 + Math.floor(idx / 8) * 4;
  const az = 2 * Math.PI * (idx / phi);
  const el = Math.asin(((2 * (idx % 8) + 1) / 8) - 1) * 0.6;
  return {
    x: Math.round(radius * Math.cos(el) * Math.cos(az) * 10) / 10,
    y: Math.round(radius * Math.sin(el) * 10) / 10,
    z: Math.round(radius * Math.cos(el) * Math.sin(az) * 10) / 10,
  };
}


function mapBuyerCountToStage(buyerCount: number): string {
  if (buyerCount >= 500000) return 'Pre-IPO';
  if (buyerCount >= 100000) return 'Series D+';
  if (buyerCount >= 50000) return 'Series C';
  if (buyerCount >= 10000) return 'Series B';
  if (buyerCount >= 2500) return 'Series A';
  if (buyerCount >= 500) return 'Seed';
  if (buyerCount >= 100) return 'Pre-seed';
  return 'Idea';
}

function normalizeCurrency(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const currency = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

// POST /api/simulator/provision
// Called by the Unicorn Simulator backend when an Active Founder completes onboarding.
provisionRouter.post('/provision', async (req: any, res: any) => {
  const secret = req.headers['x-simulator-secret'];
  if (secret !== env.SIMULATOR_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { email, username, foundation, metricsInput = {}, teamMembers = [] } = req.body;
  if (!email || !foundation?.businessName) {
    return res.status(400).json({ error: 'email and foundation.businessName are required' });
  }

  try {
    // ── 1. Find or create Supabase auth user ──────────────────────────────────
    let userId: string;
    let plainPassword: string | null = null;
    let isNewUser = false;

    // Try to find existing user in auth.users by email (direct DB query bypasses pagination)
    const { rows: existingRows } = await pool.query<{ id: string }>(
      'SELECT id FROM auth.users WHERE email = $1 LIMIT 1',
      [email],
    );

    const simulatorCurrency = normalizeCurrency(foundation.currency);

    if (existingRows.length > 0) {
      userId = existingRows[0].id;
    } else {
      plainPassword = generatePassword();
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: plainPassword,
        email_confirm: true,
        user_metadata: {
          first_name: username || foundation.businessName,
          last_name: '',
        },
      });
      if (createErr || !created.user) {
        console.error('[provision] createUser error', createErr);
        return res.status(500).json({ error: 'failed_to_create_user', details: createErr?.message });
      }
      userId = created.user.id;
      isNewUser = true;
    }

    // ── 2. Check if user already has a company ────────────────────────────────
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('company_id')
      .eq('id', userId)
      .maybeSingle();

    let companyId: string;

    if (existingProfile?.company_id) {
      companyId = existingProfile.company_id;
      if (simulatorCurrency) {
        const { error: currencyErr } = await supabaseAdmin
          .from('companies')
          .update({ currency: simulatorCurrency })
          .eq('id', companyId);
        if (currencyErr) {
          console.error('[provision] company currency update failed', currencyErr);
        }
      }
    } else {
      // ── 3. Create the company ─────────────────────────────────────────────
      const offset3d = await computeOffset3D();
      const buyerCount = Number(metricsInput.buyerCount) || 0;
      const stage = mapBuyerCountToStage(buyerCount);
      const totalTeam = (teamMembers as any[]).reduce((s: number, m: any) => s + (Number(m.quantity) || 1), 0);
      const mrr = Number(metricsInput.revenue) || 0;
      const burn = (Number(metricsInput.rent) || 0)
        + (Number(metricsInput.salaries) || 0)
        + (Number(metricsInput.costOfSales) || 0)
        + (Number(metricsInput.marketing) || 0);

      const { data: company, error: compErr } = await supabaseAdmin
        .from('companies')
        .insert({
          name: foundation.businessName,
          slug: toSlug(foundation.businessName),
          industry_id: null,
          stage,
          country: foundation.country || 'India',
          description: foundation.pitch || null,
          mrr_usd: mrr,
          annual_revenue: mrr * 12,
          employees: Math.max(totalTeam, 1),
          burn_rate_usd: burn,
          status: 'active',
          offset_3d: offset3d,
          currency: simulatorCurrency,
        })
        .select()
        .single();

      if (compErr || !company) {
        console.error('[provision] company insert', compErr?.code, compErr?.message);
        return res.status(500).json({ error: 'failed_to_create_company', details: compErr?.message });
      }
      companyId = company.id;

      // ── 4. Add founder member ──────────────────────────────────────────────
      await supabaseAdmin.from('company_members').insert({
        company_id: companyId,
        user_id: userId,
        role: 'founder',
        status: 'active',
      });

      // ── 5. Upsert user profile ─────────────────────────────────────────────
      const { error: profileErr } = await supabaseAdmin.from('user_profiles').upsert(
        {
          id: userId,
          company_id: companyId,
          role: 'founder',
          first_name: username || foundation.businessName,
          last_name: '',
          onboarding_completed: true,
        },
        { onConflict: 'id' },
      );
      if (profileErr) console.error('[provision] profile upsert', profileErr);
    }

    // ── 6. Insert simulator snapshot (best-effort) ────────────────────────────
    const m = metricsInput;
    const totalTeamCount = (teamMembers as any[]).reduce((s: number, t: any) => s + (Number(t.quantity) || 1), 0);
    const burnTotal = (Number(m.rent) || 0) + (Number(m.salaries) || 0)
      + (Number(m.costOfSales) || 0) + (Number(m.marketing) || 0);

    try {
      await pool.query(
        `INSERT INTO public.metric_snapshots (company_id, integration_id, metrics)
         VALUES ($1, 'simulator', $2::jsonb)`,
        [
          companyId,
          JSON.stringify({
            revenue:         Number(m.revenue) || 0,
            burn:            burnTotal,
            cpa:             Number(m.costPerAcquisition) || 0,
            cltv:            Number(m.customerLifetimeValue) || 0,
            headcount:       totalTeamCount,
            userAcquisition: Number(m.userAcquisition) || 0,
            conversionRate:  Number(m.conversionFirstPurchase) || 0,
            buyerCount:      Number(m.buyerCount) || 0,
            aov:             Number(m.averageOrderValue) || 0,
            arpu:            Number(m.averageRevenuePerUser) || 0,
            rent:            Number(m.rent) || 0,
            salaries:        Number(m.salaries) || 0,
            marketing:       Number(m.marketing) || 0,
            costOfSales:     Number(m.costOfSales) || 0,
          }),
        ],
      );
      console.log(`[provision] inserted metric_snapshot for company ${companyId}`);
    } catch (metricsErr: any) {
      console.error('[provision] metric_snapshot insert failed (non-fatal):', metricsErr.message);
    }

    return res.status(200).json({
      userId,
      companyId,
      email,
      password: isNewUser ? plainPassword : null,
      isNewUser,
      digitalTwinUrl: env.FRONTEND_URL,
    });
  } catch (err: any) {
    console.error('[provision] unexpected error', err);
    return res.status(500).json({ error: 'provision_failed', details: err.message });
  }
});
