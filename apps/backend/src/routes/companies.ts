import { Router } from 'express';
import { authJwt } from '../middleware/authJwt.js';
import { supabaseAdmin, pool } from '../db.js';
import { requirePermission } from '../rbac.js';
import { BDT_SEED_DEPARTMENTS, type BdtSeedDepartment } from '../data/bdtSeed.js';
import { provisionEnv } from '../config.js';

export const companiesRouter = Router();
companiesRouter.use(authJwt);

function toSlug(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
}

async function computeOffset3D(industryId: string): Promise<{ x: number; y: number; z: number }> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM public.companies
      WHERE industry_id = $1
        AND status = 'active'`,
    [industryId],
  );

  const idx = Number(rows[0]?.count ?? 0);
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

function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const COUNTRY_CURRENCIES: Record<string, string> = {
  argentina: 'ARS', australia: 'AUD', austria: 'EUR', bahrain: 'BHD',
  bangladesh: 'BDT', belgium: 'EUR', brazil: 'BRL', canada: 'CAD', chile: 'CLP',
  china: 'CNY', colombia: 'COP', 'czech republic': 'CZK', czechia: 'CZK',
  denmark: 'DKK', egypt: 'EGP', finland: 'EUR', france: 'EUR', germany: 'EUR',
  ghana: 'GHS', greece: 'EUR', 'hong kong': 'HKD', hungary: 'HUF', india: 'INR',
  indonesia: 'IDR', ireland: 'EUR', israel: 'ILS', italy: 'EUR', japan: 'JPY',
  kenya: 'KES', kuwait: 'KWD', malaysia: 'MYR', mexico: 'MXN', nepal: 'NPR',
  netherlands: 'EUR', 'new zealand': 'NZD', nigeria: 'NGN', norway: 'NOK',
  oman: 'OMR', pakistan: 'PKR', peru: 'PEN', philippines: 'PHP', poland: 'PLN',
  portugal: 'EUR', qatar: 'QAR', romania: 'RON', russia: 'RUB',
  'russian federation': 'RUB', 'saudi arabia': 'SAR', singapore: 'SGD',
  'south africa': 'ZAR', 'south korea': 'KRW', korea: 'KRW', spain: 'EUR',
  'sri lanka': 'LKR', sweden: 'SEK', switzerland: 'CHF', taiwan: 'TWD',
  thailand: 'THB', turkey: 'TRY', uae: 'AED', 'united arab emirates': 'AED',
  uk: 'GBP', 'united kingdom': 'GBP', 'great britain': 'GBP', ukraine: 'UAH',
  usa: 'USD', us: 'USD', 'united states': 'USD',
  'united states of america': 'USD', vietnam: 'VND', other: 'USD',
};

function currencyForCountry(country: string): string {
  return COUNTRY_CURRENCIES[country.trim().toLowerCase()] ?? 'USD';
}

function normalizeCurrency(value: unknown): string | null {
  const currency = stringOrNull(value)?.toUpperCase() ?? null;
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return '***';
  return `${email[0]}***${email.slice(atIndex)}`;
}

// Custom-department palette + defaults — mirror the frontend onboarding shells
// (Startup_Digital_Twin/src/lib/bdtOnboarding.ts) so the look is consistent.
const CUSTOM_DEPT_PALETTE = ['#A78BFA', '#F472B6', '#38BDF8', '#4ADE80', '#FB923C', '#C084FC', '#2DD4BF'];
const DEFAULT_DEPT_METRICS = { performance: 75, efficiency: 75, capacity: 75, alignment: 75, risk: 25 };

/**
 * Assemble the JSONB department payload for import_bdt_departments_from_json:
 * the selected framework departments (full Level-1 tree from the committed seed)
 * plus a bare shell per custom label. Falls back to all 13 framework departments
 * when nothing was selected, preserving the "company always has departments" rule.
 */
function buildSeedPayload(sourceKeys: string[], customLabels: string[]): BdtSeedDepartment[] {
  const selected = BDT_SEED_DEPARTMENTS.filter(
    (d) => typeof d.source_key === 'string' && sourceKeys.includes(d.source_key),
  );

  const customs: BdtSeedDepartment[] = customLabels
    .map((raw) => stringOrNull(raw))
    .filter((label): label is string => Boolean(label))
    .map((label, i) => ({
      label,
      domain: 'delivery',
      cluster: 'Custom',
      color: CUSTOM_DEPT_PALETTE[i % CUSTOM_DEPT_PALETTE.length],
      score: 75,
      metrics: { ...DEFAULT_DEPT_METRICS },
      internalNodes: [],
    }));

  const payload = [...selected, ...customs];
  return payload.length > 0 ? payload : [...BDT_SEED_DEPARTMENTS];
}

companiesRouter.post('/', async (req: any, res: any) => {
  if (req.auth.companyId) {
    return res.status(409).json({ error: 'already_has_company' });
  }

  const body = req.body ?? {};
  const name = stringOrNull(body.name);
  const industryId = stringOrNull(body.industry_id);
  const stage = stringOrNull(body.stage) ?? 'Seed';
  const country = stringOrNull(body.country) ?? 'India';
  const currency = normalizeCurrency(body.currency) ?? currencyForCountry(country);

  if (!name || !industryId) {
    return res.status(400).json({ error: 'missing_required_company_fields' });
  }

  try {
    const { count: activeMemberships, error: membershipErr } = await supabaseAdmin
      .from('company_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.auth.userId)
      .eq('status', 'active');

    if (membershipErr) {
      console.error('[companies] active membership check failed', membershipErr);
      return res.status(500).json({ error: 'company_create_failed', details: membershipErr.message });
    }
    if ((activeMemberships ?? 0) > 0) {
      return res.status(409).json({ error: 'already_has_company' });
    }

    const offset_3d = await computeOffset3D(industryId);
    const payload = {
      name,
      slug: toSlug(name),
      industry_id: industryId,
      subdomain_id: stringOrNull(body.subdomain_id),
      stage,
      country,
      currency,
      founded_year: numberOrNull(body.founded_year),
      description: stringOrNull(body.description),
      website: stringOrNull(body.website),
      mrr_usd: numberOrNull(body.mrr_usd) ?? 0,
      employees: numberOrNull(body.employees) ?? 1,
      burn_rate_usd: numberOrNull(body.burn_rate_usd) ?? 0,
      runway_months: numberOrNull(body.runway_months) ?? 0,
      target_market: stringOrNull(body.target_market),
      business_model: stringOrNull(body.business_model),
      problem_solved: stringOrNull(body.problem_solved),
      usp: stringOrNull(body.usp),
      competitors: Array.isArray(body.competitors) ? body.competitors : null,
      bdt_company_size: ['micro', 'msme', 'standard', 'enterprise'].includes(body.bdtCompanySize)
        ? body.bdtCompanySize
        : 'standard',
      status: 'active',
      offset_3d,
    };

    const { data: company, error: companyErr } = await supabaseAdmin
      .from('companies')
      .insert(payload)
      .select()
      .single();

    if (companyErr || !company) {
      console.error('[companies] create error', companyErr);
      return res.status(500).json({ error: 'company_create_failed', details: companyErr?.message });
    }

    const { error: memberErr } = await supabaseAdmin.from('company_members').insert({
      company_id: company.id,
      user_id: req.auth.userId,
      role: 'founder',
      status: 'active',
    });

    if (memberErr) {
      await supabaseAdmin.from('companies').delete().eq('id', company.id);
      console.error('[companies] founder membership create failed', memberErr);
      return res.status(500).json({ error: 'company_create_failed', details: memberErr.message });
    }

    const profile = body.profile && typeof body.profile === 'object' ? body.profile : {};
    const profilePatch: Record<string, unknown> = {
      id: req.auth.userId,
      company_id: company.id,
      role: 'founder',
      onboarding_completed: true,
    };
    for (const key of ['first_name', 'last_name', 'title']) {
      if (key in profile) profilePatch[key] = stringOrNull(profile[key]);
    }

    const { error: profileErr } = await supabaseAdmin
      .from('user_profiles')
      .upsert(profilePatch, { onConflict: 'id' });

    if (profileErr) {
      console.error('[companies] founder profile update failed', profileErr);
      return res.status(500).json({ error: 'company_create_failed', details: profileErr.message });
    }

    try {
      // Single seeding path: build the selected departments' full BDT tree from the
      // committed seed and persist it (departments + Level-1 nodes + children) via the
      // import RPC. One inserter → no slug-collision duplicates.
      const sourceKeys = Array.isArray(body.bdt_department_source_keys)
        ? body.bdt_department_source_keys.filter((k: unknown): k is string => typeof k === 'string')
        : [];
      const customLabels = Array.isArray(body.bdt_custom_departments)
        ? body.bdt_custom_departments.filter((l: unknown): l is string => typeof l === 'string')
        : [];
      const seedDepartments = buildSeedPayload(sourceKeys, customLabels);
      const selection = {
        source_keys: sourceKeys,
        custom_labels: customLabels,
        imported_at: new Date().toISOString(),
      };
      await pool.query(
        `SELECT public.import_bdt_departments_from_json($1, $2::jsonb, $3::jsonb)`,
        [company.id, JSON.stringify(seedDepartments), JSON.stringify(selection)],
      );
    } catch (departmentErr: any) {
      console.error('[companies] department seed failed', departmentErr);
      return res.status(500).json({ error: 'company_create_failed', details: departmentErr.message });
    }

    // Provision an isolated ERPNext site for this company (see erpnextProvision.ts).
    // Enqueued, not awaited inline — site creation takes tens of seconds. A failed
    // enqueue is logged but does not fail company creation; the ERPNext chat feature
    // just reports "not yet configured" until a job exists and completes.
    // target_env scopes this job to a worker that provisions in the matching place,
    // so a local dev worker can't claim a prod signup's job off the shared queue
    // (see config.ts provisionEnv + migration 033).
    const { error: provisionEnqueueErr } = await supabaseAdmin.from('erpnext_provision_jobs').insert({
      company_id: company.id,
      payload: { company_slug: company.slug },
      target_env: provisionEnv,
    });
    if (provisionEnqueueErr) {
      console.error('[companies] erpnext provision job enqueue failed', provisionEnqueueErr);
    }

    return res.status(201).json({ company });
  } catch (err: any) {
    console.error('[companies] create unexpected error', err);
    return res.status(500).json({ error: 'company_create_failed', details: err.message });
  }
});

companiesRouter.patch('/:companyId', requirePermission('settings', 'write'), async (req: any, res: any) => {
  const companyId = req.params.companyId;
  if (!req.auth.companyId || req.auth.companyId !== companyId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const body = req.body ?? {};
  const patch: Record<string, unknown> = {};

  if ('name' in body) {
    const name = stringOrNull(body.name);
    if (!name) return res.status(400).json({ error: 'name_required' });
    patch.name = name;
  }
  if ('stage' in body) patch.stage = stringOrNull(body.stage);
  if ('industry_id' in body) patch.industry_id = stringOrNull(body.industry_id);
  if ('country' in body) {
    const country = stringOrNull(body.country);
    patch.country = country;
    if (country && !('currency' in body)) patch.currency = currencyForCountry(country);
  }
  if ('currency' in body) {
    const currency = normalizeCurrency(body.currency);
    if (!currency) return res.status(400).json({ error: 'invalid_currency' });
    patch.currency = currency;
  }
  if ('website' in body) patch.website = stringOrNull(body.website);
  if ('description' in body) patch.description = stringOrNull(body.description);
  if ('bdtCompanySize' in body) {
    const size = stringOrNull(body.bdtCompanySize);
    if (!size || !['micro', 'msme', 'standard', 'enterprise'].includes(size)) {
      return res.status(400).json({ error: 'invalid_bdt_company_size' });
    }
    patch.bdt_company_size = size;
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'no_company_fields' });
  }

  const { data, error } = await supabaseAdmin
    .from('companies')
    .update(patch)
    .eq('id', companyId)
    .select()
    .single();

  if (error || !data) {
    console.error('[companies] update error', error);
    return res.status(500).json({ error: 'company_update_failed', details: error?.message });
  }

  return res.status(200).json({ company: data });
});

// GET /api/companies/joinable?search=&page=&pageSize=
// Same listing used by the onboarding "Join a Workspace" screen, enriched
// with each company's founder email (masked) — auth.users isn't reachable
// from the anon/RLS client, so this has to be served from the backend.
companiesRouter.get('/joinable', async (req: any, res: any) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.max(1, Number(req.query.pageSize) || 4);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = String(req.query.search ?? '').trim().replace(/[(),]/g, ' ');

  try {
    let query = supabaseAdmin
      .from('companies')
      .select('id, name, slug, stage, industry_id, country, employees, description, created_at', { count: 'exact' })
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (search) {
      query = query.or([
        `name.ilike.%${search}%`,
        `slug.ilike.%${search}%`,
        `industry_id.ilike.%${search}%`,
        `country.ilike.%${search}%`,
        `description.ilike.%${search}%`,
      ].join(','));
    }

    const { data: companies, error, count } = await query;
    if (error) {
      console.error('[companies] joinable list error', error);
      return res.status(500).json({ error: 'list_failed', details: error.message });
    }

    const companyIds = (companies ?? []).map((c) => c.id);
    let founderEmailByCompany = new Map<string, string>();

    if (companyIds.length > 0) {
      const { data: founders } = await supabaseAdmin
        .from('company_members')
        .select('company_id, user_id')
        .in('company_id', companyIds)
        .eq('role', 'founder')
        .eq('status', 'active');

      const founderUserIds = [...new Set((founders ?? []).map((f) => f.user_id))];
      if (founderUserIds.length > 0) {
        const { rows: founderEmails } = await pool.query<{ id: string; email: string }>(
          `SELECT id, email FROM auth.users WHERE id = ANY($1::uuid[])`,
          [founderUserIds],
        );
        const emailByUserId = new Map(founderEmails.map((f) => [f.id, f.email]));
        founderEmailByCompany = new Map(
          (founders ?? [])
            .filter((f) => emailByUserId.has(f.user_id))
            .map((f) => [f.company_id, emailByUserId.get(f.user_id)!]),
        );
      }
    }

    const enriched = (companies ?? []).map((c) => ({
      ...c,
      founderEmailMasked: founderEmailByCompany.has(c.id)
        ? maskEmail(founderEmailByCompany.get(c.id)!)
        : null,
    }));

    return res.status(200).json({ companies: enriched, total: count ?? 0 });
  } catch (err: any) {
    console.error('[companies] joinable list unexpected error', err);
    return res.status(500).json({ error: 'list_failed', details: err.message });
  }
});

// GET /api/companies/:companyId/connection-requests
// Founder-side half of the Discover feature (backend/src/routes/incubatorDiscover.ts):
// pending requests from incubators wanting to manage this already-founder-owned
// company. Listed here (not auto-applied) because connecting must be
// consent-gated the same way roster-claim/invite-claim already are.
companiesRouter.get('/:companyId/connection-requests', requirePermission('settings', 'read'), async (req: any, res: any) => {
  const companyId = req.params.companyId;
  if (!req.auth.companyId || req.auth.companyId !== companyId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const { rows } = await pool.query(
    `select ccr.id, ccr.status, ccr.message, ccr.created_at, i.id as incubator_id, i.name as incubator_name
       from public.company_connection_requests ccr
       join public.incubators i on i.id = ccr.incubator_id
      where ccr.company_id = $1 and ccr.status = 'pending'
      order by ccr.created_at desc`,
    [companyId],
  );

  return res.status(200).json({ requests: rows });
});

// POST /api/companies/:companyId/connection-requests/:requestId/respond
// { accept: boolean }. On accept: claims managed_by_incubator_id only if it's
// still unset (never overwrites an existing relationship) — mirrors the
// guard in incubatorRoster.ts's claim flow.
companiesRouter.post(
  '/:companyId/connection-requests/:requestId/respond',
  requirePermission('settings', 'write'),
  async (req: any, res: any) => {
    const { companyId, requestId } = req.params;
    if (!req.auth.companyId || req.auth.companyId !== companyId) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const accept = req.body?.accept === true;

    const { rows: requestRows } = await pool.query(
      `select id, incubator_id, status from public.company_connection_requests where id = $1 and company_id = $2`,
      [requestId, companyId],
    );
    const request = requestRows[0];
    if (!request) {
      return res.status(404).json({ error: 'request_not_found' });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'already_responded' });
    }

    if (accept) {
      const { rowCount } = await pool.query(
        `update public.companies set managed_by_incubator_id = $1
          where id = $2 and managed_by_incubator_id is null`,
        [request.incubator_id, companyId],
      );
      if (rowCount === 0) {
        return res.status(409).json({ error: 'already_managed_by_another_incubator' });
      }
    }

    await pool.query(
      `update public.company_connection_requests
          set status = $1, responded_at = now()
        where id = $2`,
      [accept ? 'accepted' : 'declined', requestId],
    );

    return res.status(200).json({ status: accept ? 'accepted' : 'declined' });
  },
);
