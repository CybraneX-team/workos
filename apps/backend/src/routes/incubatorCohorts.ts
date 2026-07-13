import { Router } from 'express';
import { supabaseAdmin } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { requireIncubator } from '../middleware/requireIncubator.js';
import { TRACKABLE_METRIC_COLUMNS } from '../adapters/excel/rosterExtraction.js';

export const incubatorCohortsRouter = Router();
incubatorCohortsRouter.use(authJwt, requireIncubator);

const COHORT_STATUSES = ['draft', 'active', 'completed', 'archived'];

// Cohorts store no metric data of their own — tracking is an aggregation
// over the member companies' own table columns. This intentionally does not
// reach into normalized_metrics/bdt_metrics: those use per-company,
// inconsistent metric_key vocabularies (that's the whole problem the main
// product's ingestion pipeline exists to normalize), so a goal's metric_key
// is only "trackable" here if it maps to one of TRACKABLE_METRIC_COLUMNS.
// Roster commit (incubatorRoster.ts) writes recognized seed metrics onto
// these same columns, so seeded numbers do count toward goal progress.

interface Goal {
  label: string;
  metric_key: string;
  target: number;
}

function parseGoals(raw: unknown): Goal[] | null | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return null;
  const goals: Goal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const g = item as Record<string, unknown>;
    const label = typeof g.label === 'string' ? g.label.trim() : '';
    const metricKey =
      typeof g.metric_key === 'string' ? g.metric_key.trim() : typeof g.metricKey === 'string' ? g.metricKey.trim() : '';
    const target = Number(g.target);
    if (!label || !metricKey || !Number.isFinite(target)) return null;
    goals.push({ label, metric_key: metricKey, target });
  }
  return goals;
}

async function memberCountsByCohort(cohortIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (cohortIds.length === 0) return counts;
  const { data, error } = await supabaseAdmin.from('cohort_members').select('cohort_id').in('cohort_id', cohortIds);
  if (error) {
    console.error('[incubatorCohorts] member count lookup failed', error);
    return counts;
  }
  for (const row of data ?? []) counts.set(row.cohort_id, (counts.get(row.cohort_id) ?? 0) + 1);
  return counts;
}

incubatorCohortsRouter.get('/', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    const { data: cohorts, error } = await supabaseAdmin
      .from('cohorts')
      .select('*')
      .eq('incubator_id', incubatorId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[incubatorCohorts] list failed', error);
      return res.status(500).json({ error: 'list_failed' });
    }
    const counts = await memberCountsByCohort((cohorts ?? []).map((c) => c.id));
    return res.json((cohorts ?? []).map((c) => ({ ...c, memberCount: counts.get(c.id) ?? 0 })));
  } catch (err) {
    console.error('[incubatorCohorts] list unexpected error', err);
    return res.status(500).json({ error: 'list_unexpected_error' });
  }
});

incubatorCohortsRouter.post('/', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    const auth = req.auth!;
    const body = req.body ?? {};

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name_required' });

    const status = typeof body.status === 'string' && COHORT_STATUSES.includes(body.status) ? body.status : 'active';
    const goals = parseGoals(body.goals);
    if (goals === null) return res.status(400).json({ error: 'invalid_goals' });

    const { data, error } = await supabaseAdmin
      .from('cohorts')
      .insert({
        incubator_id: incubatorId,
        name,
        description: typeof body.description === 'string' ? body.description.trim() || null : null,
        status,
        starts_on: typeof body.startsOn === 'string' ? body.startsOn : null,
        ends_on: typeof body.endsOn === 'string' ? body.endsOn : null,
        goals: goals ?? [],
        created_by: auth.userId,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[incubatorCohorts] create failed', error);
      return res.status(500).json({ error: 'create_failed' });
    }
    return res.status(201).json({ ...data, memberCount: 0 });
  } catch (err) {
    console.error('[incubatorCohorts] create unexpected error', err);
    return res.status(500).json({ error: 'create_unexpected_error' });
  }
});

incubatorCohortsRouter.get('/:id', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    const { data: cohort, error } = await supabaseAdmin
      .from('cohorts')
      .select('*')
      .eq('id', req.params.id)
      .eq('incubator_id', incubatorId)
      .maybeSingle();
    if (error || !cohort) return res.status(404).json({ error: 'cohort_not_found' });

    const { data: members, error: membersErr } = await supabaseAdmin
      .from('cohort_members')
      .select('company_id, joined_at, status, notes, companies(id, name, kind, stage, mrr_usd)')
      .eq('cohort_id', cohort.id);
    if (membersErr) {
      console.error('[incubatorCohorts] member lookup failed', membersErr);
      return res.status(500).json({ error: 'members_lookup_failed' });
    }

    const memberRows = (members ?? []).map((m: any) => ({
      companyId: m.company_id,
      joinedAt: m.joined_at,
      status: m.status,
      notes: m.notes,
      company: Array.isArray(m.companies) ? m.companies[0] : m.companies,
    }));

    return res.json({ ...cohort, members: memberRows, memberCount: memberRows.length });
  } catch (err) {
    console.error('[incubatorCohorts] detail unexpected error', err);
    return res.status(500).json({ error: 'detail_unexpected_error' });
  }
});

incubatorCohortsRouter.patch('/:id', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.description === 'string') patch.description = body.description.trim() || null;
    if (typeof body.status !== 'undefined') {
      if (!COHORT_STATUSES.includes(body.status)) return res.status(400).json({ error: 'invalid_status' });
      patch.status = body.status;
    }
    if (typeof body.startsOn === 'string' || body.startsOn === null) patch.starts_on = body.startsOn;
    if (typeof body.endsOn === 'string' || body.endsOn === null) patch.ends_on = body.endsOn;
    if (body.goals !== undefined) {
      const goals = parseGoals(body.goals);
      if (goals === null) return res.status(400).json({ error: 'invalid_goals' });
      patch.goals = goals;
    }

    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'no_fields' });

    const { data, error } = await supabaseAdmin
      .from('cohorts')
      .update(patch)
      .eq('id', req.params.id)
      .eq('incubator_id', incubatorId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[incubatorCohorts] update failed', error);
      return res.status(500).json({ error: 'update_failed' });
    }
    if (!data) return res.status(404).json({ error: 'cohort_not_found' });
    return res.json(data);
  } catch (err) {
    console.error('[incubatorCohorts] update unexpected error', err);
    return res.status(500).json({ error: 'update_unexpected_error' });
  }
});

incubatorCohortsRouter.delete('/:id', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    const { error, count } = await supabaseAdmin
      .from('cohorts')
      .delete({ count: 'exact' })
      .eq('id', req.params.id)
      .eq('incubator_id', incubatorId);
    if (error) {
      console.error('[incubatorCohorts] delete failed', error);
      return res.status(500).json({ error: 'delete_failed' });
    }
    if (!count) return res.status(404).json({ error: 'cohort_not_found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[incubatorCohorts] delete unexpected error', err);
    return res.status(500).json({ error: 'delete_unexpected_error' });
  }
});

incubatorCohortsRouter.post('/:id/members', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    const { data: cohort } = await supabaseAdmin
      .from('cohorts')
      .select('id')
      .eq('id', req.params.id)
      .eq('incubator_id', incubatorId)
      .maybeSingle();
    if (!cohort) return res.status(404).json({ error: 'cohort_not_found' });

    const body = req.body ?? {};
    const companyIds: string[] = Array.isArray(body.companyIds)
      ? body.companyIds.filter((v: unknown): v is string => typeof v === 'string')
      : [];
    if (companyIds.length === 0) return res.status(400).json({ error: 'company_ids_required' });

    const { data: companies, error: companiesErr } = await supabaseAdmin
      .from('companies')
      .select('id, managed_by_incubator_id')
      .in('id', companyIds);
    if (companiesErr) {
      console.error('[incubatorCohorts] company lookup failed', companiesErr);
      return res.status(500).json({ error: 'company_lookup_failed' });
    }
    const validIds = new Set((companies ?? []).filter((c) => c.managed_by_incubator_id === incubatorId).map((c) => c.id));
    const skipped = companyIds.filter((id) => !validIds.has(id));
    const rows = companyIds.filter((id) => validIds.has(id)).map((id) => ({ cohort_id: cohort.id, company_id: id }));

    if (rows.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from('cohort_members')
        .upsert(rows, { onConflict: 'cohort_id,company_id', ignoreDuplicates: true });
      if (insertErr) {
        console.error('[incubatorCohorts] member insert failed', insertErr);
        return res.status(500).json({ error: 'member_insert_failed' });
      }
    }

    return res.json({ added: rows.length, skipped });
  } catch (err) {
    console.error('[incubatorCohorts] add members unexpected error', err);
    return res.status(500).json({ error: 'add_members_unexpected_error' });
  }
});

incubatorCohortsRouter.delete('/:id/members/:companyId', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    const { data: cohort } = await supabaseAdmin
      .from('cohorts')
      .select('id')
      .eq('id', req.params.id)
      .eq('incubator_id', incubatorId)
      .maybeSingle();
    if (!cohort) return res.status(404).json({ error: 'cohort_not_found' });

    const { error, count } = await supabaseAdmin
      .from('cohort_members')
      .delete({ count: 'exact' })
      .eq('cohort_id', cohort.id)
      .eq('company_id', req.params.companyId);
    if (error) {
      console.error('[incubatorCohorts] remove member failed', error);
      return res.status(500).json({ error: 'remove_member_failed' });
    }
    if (!count) return res.status(404).json({ error: 'member_not_found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[incubatorCohorts] remove member unexpected error', err);
    return res.status(500).json({ error: 'remove_member_unexpected_error' });
  }
});

incubatorCohortsRouter.get('/:id/tracking', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    const { data: cohort, error } = await supabaseAdmin
      .from('cohorts')
      .select('id, name, goals, starts_on, ends_on, status')
      .eq('id', req.params.id)
      .eq('incubator_id', incubatorId)
      .maybeSingle();
    if (error || !cohort) return res.status(404).json({ error: 'cohort_not_found' });

    const { data: members, error: membersErr } = await supabaseAdmin
      .from('cohort_members')
      .select('company_id, companies(id, name, kind, stage, mrr_usd, employees, burn_rate_usd, runway_months, annual_revenue)')
      .eq('cohort_id', cohort.id);
    if (membersErr) {
      console.error('[incubatorCohorts] tracking member lookup failed', membersErr);
      return res.status(500).json({ error: 'members_lookup_failed' });
    }

    const companies = (members ?? [])
      .map((m: any) => (Array.isArray(m.companies) ? m.companies[0] : m.companies))
      .filter(Boolean) as Array<Record<string, any>>;
    const n = companies.length;
    const sum = (key: string) => companies.reduce((s, c) => s + (Number(c[key]) || 0), 0);
    const avg = (key: string) => (n === 0 ? 0 : sum(key) / n);

    const aggregate = {
      memberCount: n,
      claimedCount: companies.filter((c) => c.kind === 'active').length,
      provisionalCount: companies.filter((c) => c.kind === 'provisional').length,
      totalMrrUsd: sum('mrr_usd'),
      avgMrrUsd: avg('mrr_usd'),
      totalEmployees: sum('employees'),
      avgRunwayMonths: avg('runway_months'),
      totalAnnualRevenue: sum('annual_revenue'),
      totalBurnRateUsd: sum('burn_rate_usd'),
    };

    const byStage: Record<string, number> = {};
    for (const c of companies) {
      const stage = c.stage ?? 'Unknown';
      byStage[stage] = (byStage[stage] ?? 0) + 1;
    }

    const goals: Goal[] = Array.isArray(cohort.goals) ? cohort.goals : [];
    const goalsProgress = goals.map((g) => {
      const column = TRACKABLE_METRIC_COLUMNS[String(g.metric_key ?? '').toLowerCase()];
      if (!column) {
        return {
          label: g.label,
          metricKey: g.metric_key,
          target: g.target,
          actual: null,
          progressPct: null,
          note: 'metric_key not aggregable from company fields yet',
        };
      }
      const actual = sum(column);
      const target = Number(g.target) || 0;
      const progressPct = target > 0 ? Math.round((actual / target) * 1000) / 10 : null;
      return { label: g.label, metricKey: g.metric_key, target, actual, progressPct };
    });

    return res.json({
      cohort: {
        id: cohort.id,
        name: cohort.name,
        status: cohort.status,
        startsOn: cohort.starts_on,
        endsOn: cohort.ends_on,
      },
      aggregate,
      byStage,
      goalsProgress,
      members: companies,
    });
  } catch (err) {
    console.error('[incubatorCohorts] tracking unexpected error', err);
    return res.status(500).json({ error: 'tracking_unexpected_error' });
  }
});
