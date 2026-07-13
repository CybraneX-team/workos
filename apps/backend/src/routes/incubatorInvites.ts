import { Router } from 'express';
import { env } from '../config.js';
import { pool, supabaseAdmin } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { requireIncubator } from '../middleware/requireIncubator.js';
import { sendMail, startupInviteEmail } from '../lib/mailer.js';

export const incubatorInvitesRouter = Router();
incubatorInvitesRouter.use(authJwt, requireIncubator);

const ACTIVE_STATUSES = new Set(['pending', 'sent', 'opened']);

function buildJoinUrl(token: string): string {
  return `${env.FRONTEND_URL}/join-startup?token=${encodeURIComponent(token)}`;
}

incubatorInvitesRouter.post('/send', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    const auth = req.auth!;
    const body = (req.body ?? {}) as {
      companyIds?: unknown;
      cohortId?: string;
      emailOverrides?: Record<string, string>;
    };

    const companyIds = Array.isArray(body.companyIds)
      ? body.companyIds.filter((v): v is string => typeof v === 'string')
      : [];
    if (companyIds.length === 0) {
      return res.status(400).json({ error: 'company_ids_required' });
    }
    const emailOverrides =
      body.emailOverrides && typeof body.emailOverrides === 'object' ? body.emailOverrides : {};

    let cohortId: string | null = null;
    let cohortName: string | null = null;
    if (body.cohortId) {
      const { data: cohort, error: cohortErr } = await supabaseAdmin
        .from('cohorts')
        .select('id, name')
        .eq('id', body.cohortId)
        .eq('incubator_id', incubatorId)
        .maybeSingle();
      if (cohortErr || !cohort) {
        return res.status(400).json({ error: 'invalid_cohort' });
      }
      cohortId = cohort.id;
      cohortName = cohort.name;
    }

    const { data: companies, error: companiesErr } = await supabaseAdmin
      .from('companies')
      .select('id, name, kind, managed_by_incubator_id, roster_contact_email')
      .in('id', companyIds);
    if (companiesErr) {
      console.error('[incubatorInvites] company lookup failed', companiesErr);
      return res.status(500).json({ error: 'company_lookup_failed' });
    }
    const companyById = new Map((companies ?? []).map((c) => [c.id, c]));

    const { data: existingInvites, error: existingErr } = await supabaseAdmin
      .from('startup_invites')
      .select('company_id, status')
      .eq('incubator_id', incubatorId)
      .in('company_id', companyIds);
    if (existingErr) {
      console.error('[incubatorInvites] existing invite lookup failed', existingErr);
      return res.status(500).json({ error: 'existing_invite_lookup_failed' });
    }
    const activeInviteCompanyIds = new Set(
      (existingInvites ?? []).filter((i) => ACTIVE_STATUSES.has(i.status)).map((i) => i.company_id),
    );

    const results: Array<{ companyId: string; result: string }> = [];

    for (const companyId of companyIds) {
      const company = companyById.get(companyId);
      if (!company || company.managed_by_incubator_id !== incubatorId) {
        results.push({ companyId, result: 'not_found' });
        continue;
      }
      if (company.kind !== 'provisional') {
        results.push({ companyId, result: 'already_claimed' });
        continue;
      }
      if (activeInviteCompanyIds.has(companyId)) {
        results.push({ companyId, result: 'already_invited' });
        continue;
      }
      const email = emailOverrides[companyId] ?? company.roster_contact_email ?? null;
      if (!email) {
        results.push({ companyId, result: 'no_email' });
        continue;
      }

      const { data: invite, error: inviteErr } = await supabaseAdmin
        .from('startup_invites')
        .insert({
          incubator_id: incubatorId,
          company_id: companyId,
          cohort_id: cohortId,
          email,
          startup_name: company.name,
          created_by: auth.userId,
        })
        .select('id, token')
        .single();

      if (inviteErr || !invite) {
        console.error('[incubatorInvites] invite insert failed', inviteErr, { companyId });
        results.push({ companyId, result: 'invite_create_failed' });
        continue;
      }

      const { subject, html } = startupInviteEmail({
        incubatorName: req.incubator!.name,
        startupName: company.name,
        cohortName,
        joinUrl: buildJoinUrl(invite.token),
      });

      try {
        await sendMail({ to: email, subject, html });
        await supabaseAdmin
          .from('startup_invites')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', invite.id);
        results.push({ companyId, result: 'sent' });
      } catch (err) {
        console.error('[incubatorInvites] email send failed', err, { companyId });
        await supabaseAdmin.from('startup_invites').update({ status: 'bounced' }).eq('id', invite.id);
        results.push({ companyId, result: 'bounced' });
      }
    }

    return res.json({ results });
  } catch (err) {
    console.error('[incubatorInvites] send unexpected error', err);
    return res.status(500).json({ error: 'send_unexpected_error' });
  }
});

incubatorInvitesRouter.post('/:id/resend', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;

    const { rows } = await pool.query<{
      id: string;
      email: string;
      token: string;
      company_id: string | null;
      cohort_id: string | null;
    }>(
      `
      update public.startup_invites
         set token = encode(extensions.gen_random_bytes(24), 'hex'),
             status = 'pending',
             sent_at = null,
             opened_at = null,
             expires_at = now() + interval '30 days'
       where id = $1
         and incubator_id = $2
         and status <> 'claimed'
       returning id, email, token, company_id, cohort_id
      `,
      [req.params.id, incubatorId],
    );

    const invite = rows[0];
    if (!invite) {
      return res.status(404).json({ error: 'invite_not_found_or_claimed' });
    }

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name')
      .eq('id', invite.company_id ?? '')
      .maybeSingle();

    let cohortName: string | null = null;
    if (invite.cohort_id) {
      const { data: cohort } = await supabaseAdmin
        .from('cohorts')
        .select('name')
        .eq('id', invite.cohort_id)
        .maybeSingle();
      cohortName = cohort?.name ?? null;
    }

    const { subject, html } = startupInviteEmail({
      incubatorName: req.incubator!.name,
      startupName: company?.name ?? invite.email,
      cohortName,
      joinUrl: buildJoinUrl(invite.token),
    });

    try {
      await sendMail({ to: invite.email, subject, html });
      await pool.query(
        `update public.startup_invites set status = 'sent', sent_at = now() where id = $1`,
        [invite.id],
      );
      return res.json({ status: 'sent' });
    } catch (err) {
      console.error('[incubatorInvites] resend email failed', err, { inviteId: invite.id });
      await pool.query(`update public.startup_invites set status = 'bounced' where id = $1`, [invite.id]);
      return res.status(502).json({ error: 'email_send_failed' });
    }
  } catch (err) {
    console.error('[incubatorInvites] resend unexpected error', err);
    return res.status(500).json({ error: 'resend_unexpected_error' });
  }
});

incubatorInvitesRouter.get('/', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    let query = supabaseAdmin
      .from('startup_invites')
      .select(
        'id, company_id, cohort_id, email, startup_name, status, sent_at, opened_at, claimed_at, claimed_company_id, expires_at, created_at',
      )
      .eq('incubator_id', incubatorId)
      .order('created_at', { ascending: false });

    if (typeof req.query.status === 'string') {
      query = query.eq('status', req.query.status);
    }
    if (typeof req.query.cohortId === 'string') {
      query = query.eq('cohort_id', req.query.cohortId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[incubatorInvites] list failed', error);
      return res.status(500).json({ error: 'list_failed' });
    }
    return res.json(data ?? []);
  } catch (err) {
    console.error('[incubatorInvites] list unexpected error', err);
    return res.status(500).json({ error: 'list_unexpected_error' });
  }
});
