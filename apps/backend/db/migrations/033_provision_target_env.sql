-- Defense-in-depth against a cross-environment worker race.
--
-- Dev and prod share ONE Supabase project, so the erpnext_provision_jobs queue
-- is shared too. A local dev backend running with RUN_WORKER=true polls the same
-- queue as the Azure prod backend and can win a prod signup's job, then provision
-- it against local Colima instead of the Azure VM — leaving <slug>.erp.os.cybranex.com
-- with no site on the VM (Caddy on-demand-TLS gate 403s → ERR_SSL_PROTOCOL_ERROR).
--
-- Fix: stamp each job with the environment that must fulfil it, and have each
-- worker claim ONLY jobs matching its own environment. The tag mirrors the actual
-- provisioning path (see config.ts provisionEnv): the backend that provisions via
-- the remote shim tags 'remote'; the one that shells out to local docker tags 'local'.
--
-- Default 'remote' is deliberate: an untagged job (legacy row, or an enqueuer on
-- old code mid-deploy) can only ever be claimed by the remote/Azure worker, never
-- by a local dev worker — the safe failure direction.

ALTER TABLE public.erpnext_provision_jobs
  ADD COLUMN IF NOT EXISTS target_env text NOT NULL DEFAULT 'remote';

-- Claim-path index: workers filter by (target_env, status) ordered by created_at.
DROP INDEX IF EXISTS erpnext_provision_jobs_pending_idx;
CREATE INDEX erpnext_provision_jobs_pending_idx
  ON public.erpnext_provision_jobs (target_env, created_at)
  WHERE status IN ('pending', 'running');
