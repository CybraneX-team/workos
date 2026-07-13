import { supabase } from '../supabase';
import type { DbOnboardingProgress } from '../supabase';

/* ──────────────────────────────────────────────────
   Onboarding step data shapes
────────────────────────────────────────────────── */
export interface Step1Data {
  name: string;
  industry_id: string;
  stage: string;
  country: string;
  founded_year?: number;
  website?: string;
}

export interface Step2Data {
  description: string;
  problem_solved: string;
  usp: string;
  target_market: string;
  business_model: string;
}

export interface Step3Data {
  employees: number;
  mrr_usd: number;
  burn_rate_usd: number;
  runway_months: number;
  competitors: string[];
}

export interface Step4Data {
  first_name: string;
  last_name: string;
  title: string;
}

export type OnboardingStepsData = {
  step1?: Step1Data;
  step2?: Step2Data;
  step3?: Step3Data;
  step4?: Step4Data;
};

/* ──────────────────────────────────────────────────
   Get or create onboarding progress record
────────────────────────────────────────────────── */
export async function getOrCreateOnboardingProgress(
  companyId: string,
  userId: string,
): Promise<DbOnboardingProgress | null> {
  const { data: existing, error: fetchErr } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr) { console.error('[onboarding]', fetchErr); return null; }
  if (existing) return existing;

  const { data: created, error: createErr } = await supabase
    .from('onboarding_progress')
    .insert({ company_id: companyId, user_id: userId })
    .select()
    .single();

  if (createErr) { console.error('[onboarding] create', createErr); return null; }
  return created;
}

/* ──────────────────────────────────────────────────
   Save current step progress
────────────────────────────────────────────────── */
export async function saveOnboardingStep(
  companyId: string,
  userId: string,
  step: number,
  stepData: Partial<OnboardingStepsData>,
): Promise<boolean> {
  // Get existing steps_data first to merge
  const { data: existing } = await supabase
    .from('onboarding_progress')
    .select('steps_data')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  const merged = { ...(existing?.steps_data ?? {}), ...stepData };

  const { error } = await supabase
    .from('onboarding_progress')
    .upsert({
      company_id: companyId,
      user_id: userId,
      current_step: step,
      steps_data: merged,
    }, { onConflict: 'company_id,user_id' });

  if (error) { console.error('[onboarding] saveStep', error); return false; }
  return true;
}

/* ──────────────────────────────────────────────────
   Mark onboarding complete
────────────────────────────────────────────────── */
export async function completeOnboarding(
  companyId: string,
  userId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('onboarding_progress')
    .upsert({
      company_id: companyId,
      user_id: userId,
      completed: true,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'company_id,user_id' });

  if (error) { console.error('[onboarding] complete', error); return false; }
  return true;
}

/* ──────────────────────────────────────────────────
   Load progress for resuming onboarding
────────────────────────────────────────────────── */
export async function getOnboardingProgress(
  userId: string,
): Promise<DbOnboardingProgress | null> {
  const { data, error } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', false)
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (error) { console.error('[onboarding] load', error); return null; }
  return data;
}
