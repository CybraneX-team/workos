-- Manual rollback for 018_departments.sql.
-- This file is intentionally disabled so it is not auto-applied by migration tooling.
-- Run manually only after backing up/exporting any department data you want to keep.

BEGIN;

ALTER TABLE public.company_members
  DROP CONSTRAINT IF EXISTS company_members_department_id_fkey;

ALTER TABLE public.company_members
  DROP COLUMN IF EXISTS department_id;

DROP FUNCTION IF EXISTS public.seed_default_departments_for_company(UUID);
DROP FUNCTION IF EXISTS public.slugify_department_label(TEXT);

DROP TABLE IF EXISTS public.department_metric_links;
DROP TABLE IF EXISTS public.department_risks;
DROP TABLE IF EXISTS public.department_decisions;
DROP TABLE IF EXISTS public.department_resources;
DROP TABLE IF EXISTS public.department_processes;
DROP TABLE IF EXISTS public.department_projects;
DROP TABLE IF EXISTS public.department_teams;
DROP TABLE IF EXISTS public.department_bdt_nodes;
DROP TABLE IF EXISTS public.departments;

COMMIT;
