-- Object Space AI playbooks: usage log.
--
-- The playbook endpoint is stateless: generated steps are stored by the client inside its own task.
-- This table is NOT a source of truth for tasks. It exists to (1) enforce per-user / per-company rate
-- limits across server instances, (2) track cost, and (3) compare classification quality and prompt
-- versions over time. One row per model-backed generation.

CREATE TABLE public.object_space_playbook_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,
  task_key          text NOT NULL,
  archetypes        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{key, weight}]
  confidence        real NOT NULL DEFAULT 0,
  broad_classification boolean NOT NULL DEFAULT false,
  fallback          boolean NOT NULL DEFAULT false,       -- deterministic template was used
  fallback_reason   text,
  model             text NOT NULL,
  prompt_version    text NOT NULL,
  archetype_version text NOT NULL,
  step_count        integer NOT NULL DEFAULT 0,
  latency_ms        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Rate-limit lookups: runs by user (last hour) and by company (last day).
CREATE INDEX object_space_playbook_runs_user_idx
  ON public.object_space_playbook_runs (company_id, user_id, created_at DESC);
CREATE INDEX object_space_playbook_runs_company_idx
  ON public.object_space_playbook_runs (company_id, created_at DESC);

-- Backend-only (service role); the browser never reads this table.
REVOKE ALL PRIVILEGES ON TABLE public.object_space_playbook_runs FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.object_space_playbook_runs TO service_role;
