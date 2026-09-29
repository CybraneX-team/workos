import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../db.js';
import { getRoleDefinition, type RoleId } from '../rbac.js';

export interface AuthContext {
  userId: string;
  jwt: string;
  companyId: string | null;
  role: RoleId | null;
}

// Transient Supabase/DB failures (dropped pooled connections, brief network
// blips, cold starts) must not look like "user has no profile/company", because
// the frontend turns that into an onboarding redirect. Retry the reads a couple
// of times before giving up, and report a 503 (transient) rather than a 401 so
// the client keeps the user signed in instead of demoting them.

async function getUserWithRetry(token: string, attempts = 3, baseDelay = 200) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await supabaseAdmin.auth.getUser(token);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseDelay * (i + 1)));
    }
  }
  throw lastErr;
}

async function queryWithRetry<T>(
  run: () => PromiseLike<{ data: T; error: unknown }>,
  attempts = 3,
  baseDelay = 200,
): Promise<{ data: T; error: unknown }> {
  let result: { data: T; error: unknown } = { data: null as unknown as T, error: new Error('not_run') };
  for (let i = 0; i < attempts; i += 1) {
    try {
      result = await run();
      if (!result.error) return result;
    } catch (err) {
      result = { data: null as unknown as T, error: err };
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseDelay * (i + 1)));
  }
  return result;
}

export async function authJwt(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'missing_token' });
    }

    const token = authHeader.slice(7);

    // Network failures reaching Supabase Auth are transient (503); an invalid or
    // expired token is a real 401 and is not retried.
    let userResult;
    try {
      userResult = await getUserWithRetry(token);
    } catch (err) {
      console.error('[authJwt] getUser unavailable', err);
      return res.status(503).json({ error: 'auth_unavailable' });
    }
    const user = userResult.data?.user;
    if (userResult.error || !user) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    const { data: profile, error } = await queryWithRetry(() =>
      supabaseAdmin
        .from('user_profiles')
        .select('company_id, role')
        .eq('id', user.id)
        .maybeSingle(),
    );

    if (error) {
      console.error('[authJwt] profile lookup failed (transient)', error);
      return res.status(503).json({ error: 'profile_lookup_failed' });
    }

    // One query for all active memberships (usually 0–1 rows); pick in JS:
    // prefer the profile's selected company, else the most recent membership.
    const { data: activeMemberships, error: membershipErr } = await queryWithRetry(() =>
      supabaseAdmin
        .from('company_members')
        .select('company_id, role, joined_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: false }),
    );

    if (membershipErr) {
      console.error('[authJwt] membership lookup failed (transient)', membershipErr);
      return res.status(503).json({ error: 'membership_lookup_failed' });
    }

    const memberships = (activeMemberships as Array<{ company_id: string; role: string; joined_at: string }> | null) ?? [];
    const typedProfile = profile as { company_id: string | null; role: string | null } | null;
    const membership =
      (typedProfile?.company_id && memberships.find((m) => m.company_id === typedProfile.company_id)) ||
      memberships[0] ||
      null;

    const candidateRole = membership?.role ?? null;
    const candidateCompanyId = membership?.company_id ?? null;
    const roleDefinition = getRoleDefinition(candidateRole, candidateCompanyId);
    const role = roleDefinition?.id ?? null;
    const companyId = role ? candidateCompanyId : null;

    if (companyId && role && (typedProfile?.company_id !== companyId || typedProfile?.role !== role)) {
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
