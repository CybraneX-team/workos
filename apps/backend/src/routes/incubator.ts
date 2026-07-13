import { Router } from 'express';
import { supabaseAdmin } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { requireIncubator } from '../middleware/requireIncubator.js';

export const incubatorRouter = Router();
incubatorRouter.use(authJwt);

const PROGRAM_TYPES = ['accelerator', 'incubator', 'studio', 'university', 'corporate'] as const;
type ProgramType = (typeof PROGRAM_TYPES)[number];

const SELECT_COLUMNS =
  'id, owner_user_id, name, legal_name, website, logo_url, hq_country, hq_city, ' +
  'program_type, focus_sectors, focus_stages, typical_cohort_size, program_length_weeks, ' +
  'description, onboarding_completed, created_at, updated_at';

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requiredString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function programType(value: unknown): ProgramType | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' && (PROGRAM_TYPES as readonly string[]).includes(value)) {
    return value as ProgramType;
  }
  return null;
}

function stringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function nullableInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : null;
}

incubatorRouter.post('/', async (req, res) => {
  try {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: 'missing_auth_context' });
    }

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('incubators')
      .select('id')
      .eq('owner_user_id', auth.userId)
      .maybeSingle();

    if (existingErr) {
      console.error('[incubator] existing-check failed', existingErr);
      return res.status(500).json({ error: 'incubator_lookup_failed' });
    }
    if (existing) {
      return res.status(409).json({ error: 'incubator_already_exists', incubatorId: existing.id });
    }

    const body = req.body ?? {};
    const name = requiredString(body.name);
    const hqCountry = requiredString(body.hq_country ?? body.hqCountry);
    const type = programType(body.program_type ?? body.programType);

    if (!name) return res.status(400).json({ error: 'name_required' });
    if (!hqCountry) return res.status(400).json({ error: 'hq_country_required' });
    if (type === null) return res.status(400).json({ error: 'invalid_program_type' });
    if (!type) return res.status(400).json({ error: 'program_type_required' });

    const insertRow = {
      owner_user_id: auth.userId,
      name,
      legal_name: nullableString(body.legal_name ?? body.legalName) ?? null,
      website: nullableString(body.website) ?? null,
      logo_url: nullableString(body.logo_url ?? body.logoUrl) ?? null,
      hq_country: hqCountry,
      hq_city: nullableString(body.hq_city ?? body.hqCity) ?? null,
      program_type: type,
      focus_sectors: stringArray(body.focus_sectors ?? body.focusSectors) ?? [],
      focus_stages: stringArray(body.focus_stages ?? body.focusStages) ?? [],
      typical_cohort_size: nullableInt(body.typical_cohort_size ?? body.typicalCohortSize) ?? null,
      program_length_weeks: nullableInt(body.program_length_weeks ?? body.programLengthWeeks) ?? null,
      description: nullableString(body.description) ?? null,
      onboarding_completed: true,
    };

    const { data, error } = await supabaseAdmin
      .from('incubators')
      .insert(insertRow)
      .select(SELECT_COLUMNS)
      .single();

    if (error || !data) {
      console.error('[incubator] create failed', error);
      return res.status(500).json({ error: 'incubator_create_failed', details: error?.message });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('[incubator] create unexpected error', err);
    return res.status(500).json({ error: 'incubator_create_unexpected_error' });
  }
});

incubatorRouter.get('/me', requireIncubator, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('incubators')
      .select(SELECT_COLUMNS)
      .eq('id', req.incubator!.id)
      .single();

    if (error || !data) {
      console.error('[incubator] me lookup failed', error);
      return res.status(500).json({ error: 'incubator_lookup_failed' });
    }

    return res.json(data);
  } catch (err) {
    console.error('[incubator] me unexpected error', err);
    return res.status(500).json({ error: 'incubator_me_unexpected_error' });
  }
});

incubatorRouter.patch('/me', requireIncubator, async (req, res) => {
  try {
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};

    const name = nullableString(body.name);
    if (name !== undefined) {
      if (name === null) return res.status(400).json({ error: 'name_required' });
      patch.name = name;
    }

    const legalName = nullableString(body.legal_name ?? body.legalName);
    if (legalName !== undefined) patch.legal_name = legalName;

    const website = nullableString(body.website);
    if (website !== undefined) patch.website = website;

    const logoUrl = nullableString(body.logo_url ?? body.logoUrl);
    if (logoUrl !== undefined) patch.logo_url = logoUrl;

    const hqCountry = nullableString(body.hq_country ?? body.hqCountry);
    if (hqCountry !== undefined) {
      if (hqCountry === null) return res.status(400).json({ error: 'hq_country_required' });
      patch.hq_country = hqCountry;
    }

    const hqCity = nullableString(body.hq_city ?? body.hqCity);
    if (hqCity !== undefined) patch.hq_city = hqCity;

    const type = programType(body.program_type ?? body.programType);
    if (type !== undefined) {
      if (type === null) return res.status(400).json({ error: 'invalid_program_type' });
      patch.program_type = type;
    }

    const focusSectors = stringArray(body.focus_sectors ?? body.focusSectors);
    if (focusSectors !== undefined) patch.focus_sectors = focusSectors;

    const focusStages = stringArray(body.focus_stages ?? body.focusStages);
    if (focusStages !== undefined) patch.focus_stages = focusStages;

    const typicalCohortSize = nullableInt(body.typical_cohort_size ?? body.typicalCohortSize);
    if (typicalCohortSize !== undefined) patch.typical_cohort_size = typicalCohortSize;

    const programLengthWeeks = nullableInt(body.program_length_weeks ?? body.programLengthWeeks);
    if (programLengthWeeks !== undefined) patch.program_length_weeks = programLengthWeeks;

    const description = nullableString(body.description);
    if (description !== undefined) patch.description = description;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'no_fields' });
    }

    const { data, error } = await supabaseAdmin
      .from('incubators')
      .update(patch)
      .eq('id', req.incubator!.id)
      .select(SELECT_COLUMNS)
      .single();

    if (error || !data) {
      console.error('[incubator] update failed', error);
      return res.status(500).json({ error: 'incubator_update_failed', details: error?.message });
    }

    return res.json(data);
  } catch (err) {
    console.error('[incubator] update unexpected error', err);
    return res.status(500).json({ error: 'incubator_update_unexpected_error' });
  }
});
