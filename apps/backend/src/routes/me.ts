import { Router } from 'express';
import { supabaseAdmin, pool } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { DEFAULT_MEMBER_ROLE, getRoleDefinition, shapeProfileRole } from '../rbac.js';

export const meRouter = Router();
meRouter.use(authJwt);

meRouter.get('/', async (req: any, res: any) => {
  const { data: profile, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, company_id, role, first_name, last_name, title, avatar_url, onboarding_completed, created_at, updated_at')
    .eq('id', req.auth.userId)
    .maybeSingle();

  if (error) {
    console.error('[me] profile lookup failed', error);
    return res.status(500).json({ error: 'profile_lookup_failed' });
  }

  const roleId = req.auth.role ?? (req.auth.companyId && profile?.role ? profile.role : DEFAULT_MEMBER_ROLE);
  const role = getRoleDefinition(roleId, req.auth.companyId);

  let bdtCompanySize: string | null = null;
  if (req.auth.companyId) {
    const { rows } = await pool.query<{ bdt_company_size: string | null }>(
      `SELECT bdt_company_size FROM public.companies WHERE id = $1`,
      [req.auth.companyId],
    );
    bdtCompanySize = rows[0]?.bdt_company_size ?? null;
  }

  return res.status(200).json({
    id: req.auth.userId,
    company_id: req.auth.companyId,
    bdt_company_size: bdtCompanySize,
    ...shapeProfileRole(role),
    first_name: profile?.first_name ?? null,
    last_name: profile?.last_name ?? null,
    title: profile?.title ?? null,
    avatar_url: profile?.avatar_url ?? null,
    onboarding_completed: Boolean(req.auth.companyId) || Boolean(profile?.onboarding_completed),
    created_at: profile?.created_at ?? new Date().toISOString(),
    updated_at: profile?.updated_at ?? new Date().toISOString(),
  });
});
