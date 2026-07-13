import { Router } from 'express';
import { supabaseAdmin } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';

// Distinct from incubatorInvites.ts (which is authJwt+requireIncubator gated
// throughout): the founder clicking a magic link has no incubator, and often
// no account at all yet, so GET /:token must be reachable with no auth
// context whatsoever. Only POST /:token/claim needs a session — the
// founder's own, not an incubator's.
export const publicInvitesRouter = Router();

publicInvitesRouter.get('/:token', async (req, res) => {
  try {
    const { data: invite, error } = await supabaseAdmin
      .from('startup_invites')
      .select('id, incubator_id, cohort_id, email, startup_name, status, expires_at')
      .eq('token', req.params.token)
      .maybeSingle();

    if (error || !invite) {
      return res.status(404).json({ error: 'invite_not_found' });
    }

    const isExpired = new Date(invite.expires_at).getTime() < Date.now();
    if (isExpired && invite.status !== 'claimed') {
      if (invite.status !== 'expired') {
        await supabaseAdmin.from('startup_invites').update({ status: 'expired' }).eq('id', invite.id);
      }
      return res.status(410).json({ error: 'invite_expired' });
    }

    const { data: incubator } = await supabaseAdmin
      .from('incubators')
      .select('name, logo_url')
      .eq('id', invite.incubator_id)
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

    if (invite.status === 'sent') {
      await supabaseAdmin
        .from('startup_invites')
        .update({ status: 'opened', opened_at: new Date().toISOString() })
        .eq('id', invite.id);
    }

    return res.json({
      startupName: invite.startup_name,
      email: invite.email,
      status: invite.status === 'sent' ? 'opened' : invite.status,
      incubatorName: incubator?.name ?? 'An incubator',
      incubatorLogoUrl: incubator?.logo_url ?? null,
      cohortName,
      expiresAt: invite.expires_at,
      alreadyClaimed: invite.status === 'claimed',
    });
  } catch (err) {
    console.error('[publicInvites] token lookup failed', err);
    return res.status(500).json({ error: 'invite_lookup_unexpected_error' });
  }
});

publicInvitesRouter.post('/:token/claim', authJwt, async (req, res) => {
  try {
    const auth = req.auth!;

    const { data: invite, error } = await supabaseAdmin
      .from('startup_invites')
      .select('id, company_id, status, expires_at')
      .eq('token', req.params.token)
      .maybeSingle();

    if (error || !invite) {
      return res.status(404).json({ error: 'invite_not_found' });
    }
    if (invite.status === 'claimed') {
      return res.status(409).json({ error: 'invite_already_claimed' });
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'invite_expired' });
    }
    if (!invite.company_id) {
      return res.status(409).json({ error: 'invite_missing_company' });
    }

    const { data: existingMembership } = await supabaseAdmin
      .from('company_members')
      .select('company_id')
      .eq('user_id', auth.userId)
      .eq('status', 'active')
      .maybeSingle();
    if (existingMembership) {
      return res.status(409).json({ error: 'already_has_company' });
    }

    // Promote the provisional company in place rather than merging two rows —
    // the calling founder is attached directly to the record the incubator
    // already built from their roster upload. The kind='provisional' guard
    // makes this race-safe: a concurrent double-claim only lets one caller
    // through, the other gets 0 rows back from the update.
    const { data: company, error: companyErr } = await supabaseAdmin
      .from('companies')
      .update({ kind: 'active', claimed_from_invite_id: invite.id })
      .eq('id', invite.company_id)
      .eq('kind', 'provisional')
      .select('id, name')
      .maybeSingle();
    if (companyErr || !company) {
      return res.status(409).json({ error: 'company_already_claimed' });
    }

    await supabaseAdmin.from('company_members').insert({
      company_id: company.id,
      user_id: auth.userId,
      role: 'founder',
      status: 'active',
    });

    await supabaseAdmin.from('user_profiles').upsert(
      { id: auth.userId, company_id: company.id, role: 'founder', onboarding_completed: true },
      { onConflict: 'id' },
    );

    await supabaseAdmin
      .from('startup_invites')
      .update({
        status: 'claimed',
        claimed_at: new Date().toISOString(),
        claimed_company_id: company.id,
      })
      .eq('id', invite.id);

    return res.json({ companyId: company.id, companyName: company.name });
  } catch (err) {
    console.error('[publicInvites] claim failed', err);
    return res.status(500).json({ error: 'claim_unexpected_error' });
  }
});
