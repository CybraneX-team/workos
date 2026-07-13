import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../db.js';

// Incubators are not company_members — authJwt's companyId resolution doesn't
// apply to them. This middleware independently resolves the caller's
// incubator from their user id and never trusts any client-supplied role.
export async function requireIncubator(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: 'missing_auth_context' });
    }

    const { data: incubator, error } = await supabaseAdmin
      .from('incubators')
      .select('id, name, onboarding_completed')
      .eq('owner_user_id', auth.userId)
      .maybeSingle();

    if (error) {
      console.error('[requireIncubator] lookup failed', error);
      return res.status(500).json({ error: 'incubator_lookup_failed' });
    }
    if (!incubator) {
      return res.status(403).json({ error: 'no_incubator' });
    }

    req.incubator = {
      id: incubator.id,
      name: incubator.name,
      onboardingCompleted: incubator.onboarding_completed,
    };

    return next();
  } catch (err) {
    console.error('[requireIncubator] unexpected error', err);
    return res.status(500).json({ error: 'incubator_unavailable' });
  }
}
