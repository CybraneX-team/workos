import { Router } from 'express';
import { supabaseAdmin } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { requireIncubator } from '../middleware/requireIncubator.js';

export const incubatorDashboardRouter = Router();
incubatorDashboardRouter.use(authJwt, requireIncubator);

const SENT_STATUSES = ['sent', 'opened', 'claimed', 'bounced', 'expired'];
const OUTSTANDING_STATUSES = ['pending', 'sent', 'opened'];

incubatorDashboardRouter.get('/summary', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;

    const { data: companies, error: companiesErr } = await supabaseAdmin
      .from('companies')
      .select('id, kind, status, mrr_usd')
      .eq('managed_by_incubator_id', incubatorId);
    if (companiesErr) {
      console.error('[incubatorDashboard] company lookup failed', companiesErr);
      return res.status(500).json({ error: 'company_lookup_failed' });
    }
    const claimedCount = (companies ?? []).filter((c) => c.kind === 'active').length;
    const provisionalCount = (companies ?? []).filter((c) => c.kind === 'provisional').length;
    const totalMrrUsd = (companies ?? []).reduce((s, c) => s + (Number(c.mrr_usd) || 0), 0);

    const { data: cohorts, error: cohortsErr } = await supabaseAdmin
      .from('cohorts')
      .select('id, status')
      .eq('incubator_id', incubatorId);
    if (cohortsErr) {
      console.error('[incubatorDashboard] cohort lookup failed', cohortsErr);
      return res.status(500).json({ error: 'cohort_lookup_failed' });
    }
    const activeCohortCount = (cohorts ?? []).filter((c) => c.status === 'active').length;

    const { data: invites, error: invitesErr } = await supabaseAdmin
      .from('startup_invites')
      .select('id, company_id, startup_name, email, status, expires_at, created_at')
      .eq('incubator_id', incubatorId);
    if (invitesErr) {
      console.error('[incubatorDashboard] invite lookup failed', invitesErr);
      return res.status(500).json({ error: 'invite_lookup_failed' });
    }
    const totalInvited = (invites ?? []).filter((i) => SENT_STATUSES.includes(i.status)).length;
    const claimedInvites = (invites ?? []).filter((i) => i.status === 'claimed').length;
    const conversionPct = totalInvited > 0 ? Math.round((claimedInvites / totalInvited) * 1000) / 10 : null;

    const now = Date.now();
    const in3Days = now + 3 * 24 * 60 * 60 * 1000;
    const in7Days = now + 7 * 24 * 60 * 60 * 1000;

    const bounced = (invites ?? [])
      .filter((i) => i.status === 'bounced')
      .slice(0, 10)
      .map((i) => ({ id: i.id, companyId: i.company_id, startupName: i.startup_name, email: i.email }));

    const expiringSoon = (invites ?? [])
      .filter((i) => {
        if (!OUTSTANDING_STATUSES.includes(i.status)) return false;
        const expiresAt = new Date(i.expires_at).getTime();
        return expiresAt >= now && expiresAt <= in3Days;
      })
      .slice(0, 10)
      .map((i) => ({ id: i.id, companyId: i.company_id, startupName: i.startup_name, email: i.email, expiresAt: i.expires_at }));

    const { data: endingCohorts, error: endingErr } = await supabaseAdmin
      .from('cohorts')
      .select('id, name, ends_on')
      .eq('incubator_id', incubatorId)
      .eq('status', 'active')
      .not('ends_on', 'is', null);
    if (endingErr) {
      console.error('[incubatorDashboard] ending-cohort lookup failed', endingErr);
    }
    const cohortsEndingSoon = (endingCohorts ?? [])
      .filter((c) => {
        const endsAt = new Date(c.ends_on as string).getTime();
        return endsAt >= now && endsAt <= in7Days;
      })
      .slice(0, 10)
      .map((c) => ({ id: c.id, name: c.name, endsOn: c.ends_on }));

    return res.json({
      startups: {
        total: (companies ?? []).length,
        claimed: claimedCount,
        provisional: provisionalCount,
      },
      cohorts: {
        total: (cohorts ?? []).length,
        active: activeCohortCount,
      },
      invites: {
        totalInvited,
        claimed: claimedInvites,
        conversionPct,
      },
      portfolio: {
        totalMrrUsd,
      },
      attention: {
        bouncedInvites: bounced,
        expiringSoonInvites: expiringSoon,
        cohortsEndingSoon,
      },
    });
  } catch (err) {
    console.error('[incubatorDashboard] summary unexpected error', err);
    return res.status(500).json({ error: 'summary_unexpected_error' });
  }
});
