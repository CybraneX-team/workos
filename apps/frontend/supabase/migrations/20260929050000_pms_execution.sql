-- Phase 4 — Execution layer persistence.
--
-- Moves the last browser-only slice of the PMS store (projects, tasks,
-- milestones, risks, decisions, file links, messages) out of localStorage into
-- Postgres. Together with the supercycle slice (048) and the skeleton (050),
-- this makes the server authoritative for the ENTIRE PmsState — localStorage is
-- now only an offline cache.
--
-- Stored as per-company JSONB arrays (one row per company) so the client
-- objects round-trip exactly, including their client-generated ids, createdAt
-- timestamps and array order. The supercycle PUT mirrors these the same way it
-- mirrors cycles: a full replace of the row on every save.

CREATE TABLE public.pms_execution (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  projects   jsonb NOT NULL DEFAULT '[]'::jsonb,
  tasks      jsonb NOT NULL DEFAULT '[]'::jsonb,
  milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks      jsonb NOT NULL DEFAULT '[]'::jsonb,
  decisions  jsonb NOT NULL DEFAULT '[]'::jsonb,
  files      jsonb NOT NULL DEFAULT '[]'::jsonb,
  messages   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER pms_execution_updated_at BEFORE UPDATE ON public.pms_execution
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL PRIVILEGES ON TABLE public.pms_execution FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.pms_execution TO service_role;
