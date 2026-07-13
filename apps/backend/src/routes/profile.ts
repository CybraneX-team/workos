import { Router } from 'express';
import { supabaseAdmin } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { getRoleDefinition, shapeProfileRole } from '../rbac.js';

export const profileRouter = Router();
profileRouter.use(authJwt);

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

profileRouter.patch('/', async (req: any, res: any) => {
  const allowed = ['first_name', 'last_name', 'title', 'avatar_url'] as const;
  const patch: Record<string, string | null> = {};

  for (const key of allowed) {
    const value = nullableString(req.body?.[key]);
    if (value !== undefined) patch[key] = value;
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'no_profile_fields' });
  }

  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .upsert({ id: req.auth.userId, ...patch }, { onConflict: 'id' })
    .select('id, company_id, role, first_name, last_name, title, avatar_url, onboarding_completed, created_at, updated_at')
    .single();

  if (error || !data) {
    console.error('[profile] update failed', error);
    return res.status(500).json({ error: 'profile_update_failed', details: error?.message });
  }

  const role = getRoleDefinition(req.auth.role, req.auth.companyId);

  return res.status(200).json({
    ...data,
    company_id: req.auth.companyId,
    ...shapeProfileRole(role),
  });
});
