import { Router } from 'express';
import { supabaseAdmin } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { requirePermission } from '../rbac.js';

export const ecosystemRouter = Router();
ecosystemRouter.use(authJwt);
ecosystemRouter.use(requirePermission('ecosystem', 'write'));

function requireCompany(req: any, res: any): string | null {
  if (!req.auth.companyId) {
    res.status(403).json({ error: 'no_company' });
    return null;
  }
  return req.auth.companyId;
}

function normalizeInvestor(row: any) {
  return {
    ...row,
    shared_metrics: row.shared_metrics ?? [],
    tags: row.tags ?? [],
    vc_firm: row.vc_firms ?? null,
  };
}

ecosystemRouter.post('/investors', async (req: any, res: any) => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;

  const body = req.body ?? {};
  const { data, error } = await supabaseAdmin
    .from('investor_pipeline')
    .insert({
      company_id: companyId,
      created_by: req.auth.userId,
      vc_firm_id: body.vc_firm_id ?? null,
      custom_name: body.custom_name ?? null,
      custom_firm: body.custom_firm ?? null,
      partner_name: body.partner_name ?? null,
      status: body.status ?? 'prospect',
      ask_amount: body.ask_amount ?? null,
      warm_intro: body.warm_intro ?? false,
      intro_by: body.intro_by ?? null,
      notes: body.notes ?? null,
    })
    .select('*, vc_firms(*)')
    .single();

  if (error || !data) {
    console.error('[ecosystem] add investor failed', error);
    return res.status(500).json({ error: 'investor_create_failed', details: error?.message });
  }

  return res.status(201).json({ investor: normalizeInvestor(data) });
});

ecosystemRouter.patch('/investors/:id/status', async (req: any, res: any) => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;

  const { error } = await supabaseAdmin
    .from('investor_pipeline')
    .update({
      status: req.body?.status,
      notes: req.body?.notes,
      last_contact: req.body?.last_contact,
      next_followup: req.body?.next_followup,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .eq('company_id', companyId);

  if (error) {
    console.error('[ecosystem] investor status update failed', error);
    return res.status(500).json({ error: 'investor_update_failed', details: error.message });
  }

  return res.status(200).json({ success: true });
});

ecosystemRouter.patch('/investors/:id/notes', async (req: any, res: any) => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;

  const { error } = await supabaseAdmin
    .from('investor_pipeline')
    .update({ notes: req.body?.notes ?? null, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('company_id', companyId);

  if (error) {
    console.error('[ecosystem] investor notes update failed', error);
    return res.status(500).json({ error: 'investor_update_failed', details: error.message });
  }

  return res.status(200).json({ success: true });
});

ecosystemRouter.delete('/investors/:id', async (req: any, res: any) => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;

  const { error } = await supabaseAdmin
    .from('investor_pipeline')
    .delete()
    .eq('id', req.params.id)
    .eq('company_id', companyId);

  if (error) {
    console.error('[ecosystem] investor delete failed', error);
    return res.status(500).json({ error: 'investor_delete_failed', details: error.message });
  }

  return res.status(200).json({ success: true });
});

ecosystemRouter.post('/updates', async (req: any, res: any) => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;

  const body = req.body ?? {};
  const { data, error } = await supabaseAdmin
    .from('investor_updates')
    .insert({
      company_id: companyId,
      created_by: req.auth.userId,
      title: body.title ?? 'Investor Update',
      period: body.period ?? new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      highlights: body.highlights ?? [],
      asks: body.asks ?? [],
      metrics: body.metrics ?? {},
    })
    .select()
    .single();

  if (error || !data) {
    console.error('[ecosystem] investor update create failed', error);
    return res.status(500).json({ error: 'update_create_failed', details: error?.message });
  }

  return res.status(201).json({
    update: {
      ...data,
      highlights: data.highlights ?? [],
      asks: data.asks ?? [],
      sent_to: data.sent_to ?? [],
      metrics: data.metrics ?? {},
    },
  });
});

ecosystemRouter.patch('/updates/:id', async (req: any, res: any) => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;

  const body = req.body ?? {};
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ['title', 'period', 'highlights', 'asks', 'metrics', 'status']) {
    if (key in body) patch[key] = body[key];
  }

  const { error } = await supabaseAdmin
    .from('investor_updates')
    .update(patch)
    .eq('id', req.params.id)
    .eq('company_id', companyId);

  if (error) {
    console.error('[ecosystem] investor update save failed', error);
    return res.status(500).json({ error: 'update_save_failed', details: error.message });
  }

  return res.status(200).json({ success: true });
});

ecosystemRouter.post('/updates/:id/mark-sent', async (req: any, res: any) => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;

  const { error } = await supabaseAdmin
    .from('investor_updates')
    .update({
      status: 'sent',
      sent_to: Array.isArray(req.body?.recipientIds) ? req.body.recipientIds : [],
      sent_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .eq('company_id', companyId);

  if (error) {
    console.error('[ecosystem] investor update mark sent failed', error);
    return res.status(500).json({ error: 'update_send_failed', details: error.message });
  }

  return res.status(200).json({ success: true });
});

ecosystemRouter.post('/mentors', async (req: any, res: any) => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;

  const body = req.body ?? {};
  const { data, error } = await supabaseAdmin
    .from('vc_mentors')
    .insert({
      company_id: companyId,
      added_by: req.auth.userId,
      name: body.name,
      role: body.role ?? null,
      company: body.company ?? null,
      linkedin: body.linkedin ?? null,
      expertise: body.expertise ?? [],
      availability: body.availability ?? 'monthly',
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('[ecosystem] mentor create failed', error);
    return res.status(500).json({ error: 'mentor_create_failed', details: error?.message });
  }

  return res.status(201).json({ mentor: { ...data, expertise: data.expertise ?? [] } });
});

ecosystemRouter.delete('/mentors/:id', async (req: any, res: any) => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;

  const { error } = await supabaseAdmin
    .from('vc_mentors')
    .delete()
    .eq('id', req.params.id)
    .eq('company_id', companyId);

  if (error) {
    console.error('[ecosystem] mentor delete failed', error);
    return res.status(500).json({ error: 'mentor_delete_failed', details: error.message });
  }

  return res.status(200).json({ success: true });
});

ecosystemRouter.post('/mentor-sessions', async (req: any, res: any) => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;

  const body = req.body ?? {};
  const { data, error } = await supabaseAdmin
    .from('mentor_sessions')
    .insert({
      company_id: companyId,
      created_by: req.auth.userId,
      mentor_id: body.mentor_id,
      session_date: body.session_date,
      status: body.status ?? 'scheduled',
      agenda: body.agenda ?? [],
      actions: [],
      follow_ups: [],
    })
    .select()
    .single();

  if (error || !data) {
    console.error('[ecosystem] mentor session create failed', error);
    return res.status(500).json({ error: 'session_create_failed', details: error?.message });
  }

  return res.status(201).json({
    session: {
      ...data,
      agenda: data.agenda ?? [],
      actions: data.actions ?? [],
      follow_ups: data.follow_ups ?? [],
    },
  });
});

ecosystemRouter.patch('/mentor-sessions/:id', async (req: any, res: any) => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;

  const body = req.body ?? {};
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ['status', 'agenda', 'actions', 'follow_ups', 'notes']) {
    if (key in body) patch[key] = body[key];
  }

  const { error } = await supabaseAdmin
    .from('mentor_sessions')
    .update(patch)
    .eq('id', req.params.id)
    .eq('company_id', companyId);

  if (error) {
    console.error('[ecosystem] mentor session update failed', error);
    return res.status(500).json({ error: 'session_update_failed', details: error.message });
  }

  return res.status(200).json({ success: true });
});
