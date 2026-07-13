import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../db.js';
import { getRoleDefinition, type RoleId } from '../rbac.js';

export interface AuthContext {
  userId: string;
  jwt: string;
  companyId: string | null;
  role: RoleId | null;
}

export async function authJwt(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'missing_token' });
    }

    const token = authHeader.slice(7);

    const {
      data: { user },
      error: userErr,
    } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('user_profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return res.status(401).json({ error: 'profile_lookup_failed' });
    }

    // One query for all active memberships (usually 0–1 rows); pick in JS:
    // prefer the profile's selected company, else the most recent membership.
    const { data: activeMemberships, error: membershipErr } = await supabaseAdmin
      .from('company_members')
      .select('company_id, role, joined_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: false });

    if (membershipErr) {
      return res.status(401).json({ error: 'membership_lookup_failed' });
    }

    const memberships = activeMemberships ?? [];
    const membership =
      (profile?.company_id && memberships.find((m) => m.company_id === profile.company_id)) ||
      memberships[0] ||
      null;

    const candidateRole = membership?.role ?? null;
    const candidateCompanyId = membership?.company_id ?? null;
    const roleDefinition = getRoleDefinition(candidateRole, candidateCompanyId);
    const role = roleDefinition?.id ?? null;
    const companyId = role ? candidateCompanyId : null;

    if (companyId && role && (profile?.company_id !== companyId || profile?.role !== role)) {
      await supabaseAdmin
        .from('user_profiles')
        .upsert(
          { id: user.id, company_id: companyId, role, onboarding_completed: true },
          { onConflict: 'id' },
        );
    }

    req.auth = {
      userId: user.id,
      jwt: token,
      companyId,
      role,
    };

    return next();
  } catch (err) {
    console.error('[authJwt] unexpected error', err);
    return res.status(500).json({ error: 'auth_unavailable' });
  }
}
