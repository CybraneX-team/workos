-- Provisioning can run much longer than an HTTP request, especially when a
-- local arm64 Docker host has to emulate an amd64 Frappe image. Persist enough
-- lifecycle state to distinguish a live operation from a stalled worker.

ALTER TABLE erpnext.provision_jobs
  ADD COLUMN IF NOT EXISTS current_stage text,
  ADD COLUMN IF NOT EXISTS stage_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS provision_jobs_active_lifecycle_idx
  ON erpnext.provision_jobs(environment, status, heartbeat_at)
  WHERE status IN ('pending', 'running');
