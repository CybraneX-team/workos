import { Router } from 'express';
import { authJwt } from '../middleware/authJwt.js';
import { supabaseAdmin, pool } from '../db.js';
import { env } from '../config.js';
import { sendMail, inviteCredentialsEmail } from '../lib/mailer.js';
import { requireTeamWrite } from '../rbac.js';

export const companyInvitesRouter = Router();
companyInvitesRouter.use(authJwt);

function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// POST /api/company-invites
// Founder enters an email; if no account exists for it, we create one with
// view-only access to the founder's company and email them the credentials.
companyInvitesRouter.post('/', requireTeamWrite, async (req: any, res: any) => {
  const { email } = req.body;
  const companyId = req.auth.companyId;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email_required' });
  }
  if (!companyId) {
    return res.status(400).json({ error: 'no_company' });
  }

  try {
    const { rows: existingRows } = await pool.query<{ id: string }>(
      'SELECT id FROM auth.users WHERE email = $1 LIMIT 1',
      [email],
    );

    if (existingRows.length > 0) {
      return res.status(409).json({ error: 'user_exists' });
    }

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single();
    const companyName = company?.name || 'the company';

    const plainPassword = generatePassword();
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: plainPassword,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      console.error('[companyInvites] createUser error', createErr);
      return res.status(500).json({ error: 'failed_to_create_user', details: createErr?.message });
    }
    const userId = created.user.id;

    const { error: profileErr } = await supabaseAdmin.from('user_profiles').upsert(
      {
        id: userId,
        company_id: companyId,
        role: 'viewer',
        onboarding_completed: true,
      },
      { onConflict: 'id' },
    );
    if (profileErr) {
      console.error('[companyInvites] profile upsert error', profileErr);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch((err) =>
        console.error('[companyInvites] failed to clean up invite auth user after profile error', err),
      );
      return res.status(500).json({ error: 'failed_to_create_profile', details: profileErr.message });
    }

    const { error: memberErr } = await supabaseAdmin.from('company_members').insert({
      company_id: companyId,
      user_id: userId,
      role: 'viewer',
      status: 'active',
      invited_by: req.auth.userId,
      approved_at: new Date().toISOString(),
    });
    if (memberErr) {
      console.error('[companyInvites] member insert error', memberErr);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch((err) =>
        console.error('[companyInvites] failed to clean up invite auth user after member error', err),
      );
      return res.status(500).json({ error: 'failed_to_create_membership', details: memberErr.message });
    }

    const { subject, html } = inviteCredentialsEmail({
      email,
      password: plainPassword,
      companyName,
      loginUrl: env.FRONTEND_URL,
    });
    await sendMail({ to: email, subject, html }).catch((err) =>
      console.error('[companyInvites] failed to email invitee', email, err),
    );

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[companyInvites] unexpected error', err);
    return res.status(500).json({ error: 'invite_failed', details: err.message });
  }
});
