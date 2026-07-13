import { Router } from 'express';
import { authJwt } from '../middleware/authJwt.js';
import { supabaseAdmin, pool } from '../db.js';
import { env } from '../config.js';
import { sendMail, joinRequestEmail } from '../lib/mailer.js';
import { DEFAULT_MEMBER_ROLE, canAssignRole, requireTeamWrite } from '../rbac.js';
import { roleDepartmentGrantsSubset } from '../departmentAccess.js';

export const joinRequestsRouter = Router();
joinRequestsRouter.use(authJwt);

async function notifyCompanyOwners(joinRequest: { company_id: string; user_id: string }) {
  const [{ data: company }, { data: requesterProfile }, { data: owners }] = await Promise.all([
    supabaseAdmin.from('companies').select('name').eq('id', joinRequest.company_id).single(),
    supabaseAdmin
      .from('user_profiles')
      .select('first_name, last_name')
      .eq('id', joinRequest.user_id)
      .single(),
    supabaseAdmin
      .from('company_members')
      .select('user_id')
      .eq('company_id', joinRequest.company_id)
      .eq('status', 'active')
      .in('role', ['founder', 'super_admin']),
  ]);

  const ownerIds = (owners ?? []).map((f: any) => f.user_id);
  if (ownerIds.length === 0) {
    console.warn('[joinRequests] notify: no active founders/super_admins found for company', joinRequest.company_id);
    return 0;
  }

  const [{ rows: ownerEmails }, { data: ownerProfiles }] = await Promise.all([
    pool.query<{ id: string; email: string }>(
      `SELECT id, email FROM auth.users WHERE id = ANY($1::uuid[])`,
      [ownerIds],
    ),
    supabaseAdmin.from('user_profiles').select('id, first_name, last_name').in('id', ownerIds),
  ]);

  const requesterName = [requesterProfile?.first_name, requesterProfile?.last_name]
    .filter(Boolean)
    .join(' ') || 'A user';
  const companyName = company?.name || 'your company';
  const reviewUrl = `${env.FRONTEND_URL}/twin/team`;

  await Promise.all(
    ownerEmails.map((owner) => {
      const ownerProfile = (ownerProfiles ?? []).find((profile: any) => profile.id === owner.id);
      const founderName = [ownerProfile?.first_name, ownerProfile?.last_name]
        .filter(Boolean)
        .join(' ') || 'there';
      const { subject, html } = joinRequestEmail({ founderName, requesterName, companyName, reviewUrl });
      return sendMail({ to: owner.email, subject, html }).catch((err) =>
        console.error('[joinRequests] failed to email company owner', owner.email, err),
      );
    }),
  );

  return ownerEmails.length;
}

async function hasActiveMembership(userId: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from('company_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) throw error;
  return (count ?? 0) > 0;
}

function shapeJoinRequest(row: any, profilesByUserId: Record<string, any>) {
  return {
    ...row,
    first_name: profilesByUserId[row.user_id]?.first_name ?? null,
    last_name: profilesByUserId[row.user_id]?.last_name ?? null,
    title: profilesByUserId[row.user_id]?.title ?? null,
    email: null,
  };
}

joinRequestsRouter.post('/', async (req: any, res: any) => {
  const { companyId, message } = req.body ?? {};

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ error: 'company_required' });
  }
  try {
    if (req.auth.companyId || await hasActiveMembership(req.auth.userId)) {
      return res.status(409).json({ error: 'already_has_company' });
    }

    const { data: company, error: companyErr } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('status', 'active')
      .maybeSingle();

    if (companyErr || !company) {
      return res.status(404).json({ error: 'company_not_found' });
    }

    const { data, error } = await supabaseAdmin
      .from('join_requests')
      .insert({
        company_id: companyId,
        user_id: req.auth.userId,
        requested_role: DEFAULT_MEMBER_ROLE,
        message: typeof message === 'string' && message.trim() ? message.trim() : null,
      })
      .select('id, company_id, user_id')
      .single();

    if (error || !data) {
      if (error?.code === '23505') return res.status(409).json({ error: 'request_exists' });
      console.error('[joinRequests] submit error', error);
      return res.status(500).json({ error: 'submit_failed', details: error?.message });
    }

    const notified = await notifyCompanyOwners(data);
    return res.status(201).json({ success: true, requestId: data.id, notified });
  } catch (err: any) {
    console.error('[joinRequests] submit unexpected error', err);
    return res.status(500).json({ error: 'submit_failed', details: err.message });
  }
});

joinRequestsRouter.get('/', requireTeamWrite, async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  try {
    const { data, error } = await supabaseAdmin
      .from('join_requests')
      .select('id, company_id, user_id, requested_role, message, status, reviewed_by, reviewed_at, assigned_role, created_at')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[joinRequests] list error', error);
      return res.status(500).json({ error: 'list_failed' });
    }

    const rows = data ?? [];
    const userIds = [...new Set(rows.map((r: any) => r.user_id))];
    let profilesByUserId: Record<string, any> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, first_name, last_name, title')
        .in('id', userIds);
      profilesByUserId = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));
    }

    return res.status(200).json({ requests: rows.map((row: any) => shapeJoinRequest(row, profilesByUserId)) });
  } catch (err: any) {
    console.error('[joinRequests] list unexpected error', err);
    return res.status(500).json({ error: 'list_failed', details: err.message });
  }
});

joinRequestsRouter.get('/count', requireTeamWrite, async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const { count, error } = await supabaseAdmin
    .from('join_requests')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'pending');

  if (error) {
    console.error('[joinRequests] count error', error);
    return res.status(500).json({ error: 'count_failed', details: error.message });
  }

  return res.status(200).json({ count: count ?? 0 });
});

joinRequestsRouter.post('/:id/approve', requireTeamWrite, async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  const actorRole = req.auth.role;
  const assignedRole = req.body?.assignedRole ?? DEFAULT_MEMBER_ROLE;

  if (!companyId || !actorRole) return res.status(403).json({ error: 'no_company' });
  if (typeof assignedRole !== 'string' || !canAssignRole(actorRole, companyId, assignedRole)) {
    return res.status(400).json({ error: 'invalid_role' });
  }
  if (!(await roleDepartmentGrantsSubset({ companyId, userId: req.auth.userId, role: actorRole }, assignedRole))) {
    return res.status(403).json({ error: 'department_permission_escalation' });
  }

  try {
    const { data: joinRequest, error: requestErr } = await supabaseAdmin
      .from('join_requests')
      .select('id, company_id, user_id, status')
      .eq('id', req.params.id)
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .maybeSingle();

    if (requestErr || !joinRequest) return res.status(404).json({ error: 'request_not_found' });
    if (await hasActiveMembership(joinRequest.user_id)) {
      return res.status(409).json({ error: 'requester_already_has_company' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO company_members (company_id, user_id, role, status, invited_by, approved_at)
         VALUES ($1, $2, $3, 'active', $4, NOW())
         ON CONFLICT (company_id, user_id) DO UPDATE
           SET role = EXCLUDED.role, status = 'active', approved_at = NOW()`,
        [companyId, joinRequest.user_id, assignedRole, req.auth.userId],
      );

      await client.query(
        `INSERT INTO user_profiles (id, company_id, role, onboarding_completed)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (id) DO UPDATE
           SET company_id = EXCLUDED.company_id, role = EXCLUDED.role, onboarding_completed = true`,
        [joinRequest.user_id, companyId, assignedRole],
      );

      await client.query(
        `UPDATE join_requests
         SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), assigned_role = $2
         WHERE id = $3`,
        [req.auth.userId, assignedRole, joinRequest.id],
      );

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[joinRequests] approve transaction failed', err);
      return res.status(500).json({ error: 'approve_failed', details: err.message });
    } finally {
      client.release();
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[joinRequests] approve unexpected error', err);
    return res.status(500).json({ error: 'approve_failed', details: err.message });
  }
});

joinRequestsRouter.post('/:id/reject', requireTeamWrite, async (req: any, res: any) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const { error } = await supabaseAdmin
    .from('join_requests')
    .update({
      status: 'rejected',
      reviewed_by: req.auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .eq('company_id', companyId)
    .eq('status', 'pending');

  if (error) {
    console.error('[joinRequests] reject failed', error);
    return res.status(500).json({ error: 'reject_failed', details: error.message });
  }

  return res.status(200).json({ success: true });
});
