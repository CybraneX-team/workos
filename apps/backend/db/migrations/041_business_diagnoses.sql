-- One current, server-managed business diagnosis per WorkOS company.

CREATE TABLE IF NOT EXISTS public.business_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  answers JSONB NOT NULL,
  dynamic_questions JSONB NOT NULL,
  dynamic_answers JSONB NOT NULL,
  report JSONB NOT NULL,
  questionnaire_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.business_diagnoses ENABLE ROW LEVEL SECURITY;
