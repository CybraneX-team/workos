-- Portfolio detail (Phase 3) lets an incubator annotate a managed startup
-- independent of any cohort membership (cohort_members.notes is per-cohort
-- context, not a general note about the startup itself).
alter table public.companies
  add column incubator_notes text;
