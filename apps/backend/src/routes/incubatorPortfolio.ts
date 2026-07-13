import { Router } from 'express';
import { pool, supabaseAdmin } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { requireIncubator } from '../middleware/requireIncubator.js';
import { COMPANY_STAGE_ENUM } from '../adapters/excel/rosterExtraction.js';

export const incubatorPortfolioRouter = Router();
incubatorPortfolioRouter.use(authJwt, requireIncubator);

const PORTFOLIO_COLUMNS =
  'id, name, slug, stage, stage_label, industry_id, sector, country, founded_year, website, description, ' +
  'mrr_usd, employees, annual_revenue, burn_rate_usd, runway_months, ' +
  'kind, source, roster_contact_email, roster_contact_name, incubator_notes, ' +
  'claimed_from_invite_id, created_at, updated_at';

// postgrest-js can only statically parse a *literal* select string into a
// result type; PORTFOLIO_COLUMNS is a computed const, so the query result
// falls back to an unparseable placeholder type. Cast through this instead
// of fighting the generic overloads — we own the select string and its shape.
interface PortfolioCompanyRow {
  id: string;
  name: string;
  slug: string;
  stage: string;
  stage_label: string | null;
  industry_id: string | null;
  sector: string | null;
  country: string;
  founded_year: number | null;
  website: string | null;
  description: string | null;
  mrr_usd: number;
  employees: number;
  annual_revenue: number;
  burn_rate_usd: number;
  runway_months: number;
  kind: string;
  source: string;
  roster_contact_email: string | null;
  roster_contact_name: string | null;
  incubator_notes: string | null;
  claimed_from_invite_id: string | null;
  created_at: string;
  updated_at: string;
}

type DerivedStatus = 'provisional' | 'invited' | 'claimed';

function deriveStatus(kind: string, latestInviteStatus: string | null): DerivedStatus {
  if (kind === 'active') return 'claimed';
  if (latestInviteStatus && ['pending', 'sent', 'opened'].includes(latestInviteStatus)) return 'invited';
  return 'provisional';
}

async function latestInvitesByCompany(incubatorId: string, companyIds: string[]) {
  if (companyIds.length === 0) return new Map<string, any>();
  const { data, error } = await supabaseAdmin
    .from('startup_invites')
    .select('id, company_id, status, email, sent_at, opened_at, claimed_at, expires_at, created_at')
    .eq('incubator_id', incubatorId)
    .in('company_id', companyIds)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[incubatorPortfolio] invite lookup failed', error);
    return new Map<string, any>();
  }
  const map = new Map<string, any>();
  for (const invite of data ?? []) {
    if (!map.has(invite.company_id)) map.set(invite.company_id, invite);
  }
  return map;
}

async function cohortsByCompany(companyIds: string[]) {
  if (companyIds.length === 0) return new Map<string, Array<{ id: string; name: string }>>();
  const { data, error } = await supabaseAdmin
    .from('cohort_members')
    .select('company_id, cohorts(id, name)')
    .in('company_id', companyIds);
  if (error) {
    console.error('[incubatorPortfolio] cohort lookup failed', error);
    return new Map<string, Array<{ id: string; name: string }>>();
  }
  const map = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of (data ?? []) as any[]) {
    const cohort = Array.isArray(row.cohorts) ? row.cohorts[0] : row.cohorts;
    if (!cohort) continue;
    const list = map.get(row.company_id) ?? [];
    list.push({ id: cohort.id, name: cohort.name });
    map.set(row.company_id, list);
  }
  return map;
}

incubatorPortfolioRouter.get('/', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;

    const { data: companiesRaw, error } = await supabaseAdmin
      .from('companies')
      .select(PORTFOLIO_COLUMNS)
      .eq('managed_by_incubator_id', incubatorId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[incubatorPortfolio] list failed', error);
      return res.status(500).json({ error: 'list_failed' });
    }
    const companies = (companiesRaw ?? []) as unknown as PortfolioCompanyRow[];

    const companyIds = companies.map((c) => c.id);
    const [inviteMap, cohortMap] = await Promise.all([
      latestInvitesByCompany(incubatorId, companyIds),
      cohortsByCompany(companyIds),
    ]);

    let rows = companies.map((c) => {
      const invite = inviteMap.get(c.id) ?? null;
      return {
        ...c,
        status: deriveStatus(c.kind, invite?.status ?? null),
        latestInvite: invite,
        cohorts: cohortMap.get(c.id) ?? [],
      };
    });

    const statusFilter = typeof req.query.status === 'string' ? req.query.status : null;
    if (statusFilter) rows = rows.filter((r) => r.status === statusFilter);

    const cohortFilter = typeof req.query.cohortId === 'string' ? req.query.cohortId : null;
    if (cohortFilter) rows = rows.filter((r) => r.cohorts.some((c) => c.id === cohortFilter));

    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : null;
    if (search) rows = rows.filter((r) => r.name.toLowerCase().includes(search));

    return res.json(rows);
  } catch (err) {
    console.error('[incubatorPortfolio] list unexpected error', err);
    return res.status(500).json({ error: 'list_unexpected_error' });
  }
});

incubatorPortfolioRouter.get('/:companyId', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;

    const { data: companyRaw, error } = await supabaseAdmin
      .from('companies')
      .select(PORTFOLIO_COLUMNS)
      .eq('id', req.params.companyId)
      .eq('managed_by_incubator_id', incubatorId)
      .maybeSingle();
    if (error || !companyRaw) {
      return res.status(404).json({ error: 'company_not_found' });
    }
    const company = companyRaw as unknown as PortfolioCompanyRow;

    const [inviteMap, cohortMap] = await Promise.all([
      latestInvitesByCompany(incubatorId, [company.id]),
      cohortsByCompany([company.id]),
    ]);
    const invite = inviteMap.get(company.id) ?? null;

    let liveMetrics: { normalized: any[]; latestSnapshot: Record<string, unknown> | null } | null = null;
    if (company.kind === 'active') {
      // D2a: the incubator retains read access to a claimed startup's live
      // metrics, scoped by the managed_by_incubator_id check above (not by
      // RLS — normalized_metrics/metric_snapshots access here mirrors how
      // backend/src/routes/metrics.ts reads them, just gated by the
      // incubator relationship instead of a founder's own companyId).
      const { rows: normalized } = await pool.query(
        `select metric_key, value, unit, period_end from public.latest_metrics_for_company($1)`,
        [company.id],
      );
      const { data: snapshot } = await supabaseAdmin
        .from('metric_snapshots')
        .select('metrics, snapshot_at')
        .eq('company_id', company.id)
        .order('snapshot_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      liveMetrics = {
        normalized,
        latestSnapshot: snapshot ? { ...snapshot.metrics, _snapshotAt: snapshot.snapshot_at } : null,
      };
    }

    return res.json({
      ...company,
      status: deriveStatus(company.kind, invite?.status ?? null),
      latestInvite: invite,
      cohorts: cohortMap.get(company.id) ?? [],
      liveMetrics,
    });
  } catch (err) {
    console.error('[incubatorPortfolio] detail unexpected error', err);
    return res.status(500).json({ error: 'detail_unexpected_error' });
  }
});

incubatorPortfolioRouter.patch('/:companyId', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.website === 'string') patch.website = body.website.trim() || null;
    if (typeof body.description === 'string') patch.description = body.description.trim() || null;
    if (typeof body.country === 'string' && body.country.trim()) patch.country = body.country.trim();
    if (typeof body.incubatorNotes === 'string') patch.incubator_notes = body.incubatorNotes.trim() || null;
    if (typeof body.rosterContactEmail === 'string') patch.roster_contact_email = body.rosterContactEmail.trim() || null;
    if (typeof body.rosterContactName === 'string') patch.roster_contact_name = body.rosterContactName.trim() || null;

    if (typeof body.foundedYear !== 'undefined') {
      const year = Number(body.foundedYear);
      if (Number.isInteger(year) && year >= 1900 && year <= new Date().getUTCFullYear() + 1) {
        patch.founded_year = year;
      } else if (body.foundedYear === null) {
        patch.founded_year = null;
      }
    }

    if (typeof body.stage === 'string') {
      if (!(COMPANY_STAGE_ENUM as readonly string[]).includes(body.stage)) {
        return res.status(400).json({ error: 'invalid_stage' });
      }
      patch.stage = body.stage;
    }

    // Free-text product-maturity label ("MVP in Market", ...) shown alongside
    // the enum stage; independent of the funding-round enum above.
    if (typeof body.stageLabel === 'string') {
      patch.stage_label = body.stageLabel.trim() || null;
    }

    if (typeof body.sector === 'string') {
      // Free text — an incubator's sector label need not exist in the global
      // industries taxonomy. Best-effort link industry_id when it happens to
      // match, but never reject an unrecognized sector.
      const sector = body.sector.trim();
      patch.sector = sector || null;
      if (sector) {
        const { data: industry } = await supabaseAdmin
          .from('industries')
          .select('id')
          .ilike('label', sector)
          .maybeSingle();
        if (industry) patch.industry_id = industry.id;
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'no_fields' });
    }

    const { data, error } = await supabaseAdmin
      .from('companies')
      .update(patch)
      .eq('id', req.params.companyId)
      .eq('managed_by_incubator_id', incubatorId)
      .select(PORTFOLIO_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error('[incubatorPortfolio] update failed', error);
      return res.status(500).json({ error: 'update_failed' });
    }
    if (!data) {
      return res.status(404).json({ error: 'company_not_found' });
    }

    return res.json(data);
  } catch (err) {
    console.error('[incubatorPortfolio] update unexpected error', err);
    return res.status(500).json({ error: 'update_unexpected_error' });
  }
});
