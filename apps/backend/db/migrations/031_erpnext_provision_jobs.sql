-- Dedicated job table for ERPNext per-company site provisioning.
-- Deliberately separate from public.ingestion_jobs: that table has
-- file_id NOT NULL and a CHECK constraint locking kind to 'normalize',
-- so it cannot be reused for a non-file-based job without altering a
-- shared table another feature depends on.

CREATE TABLE public.erpnext_provision_jobs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'running', 'complete', 'failed')),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    locked_until timestamptz,
    locked_by text,
    last_error text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX erpnext_provision_jobs_pending_idx
  ON public.erpnext_provision_jobs (created_at)
  WHERE status IN ('pending', 'running');
