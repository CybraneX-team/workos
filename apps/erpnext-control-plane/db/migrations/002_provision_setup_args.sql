-- ERPNext's setup wizard has to run as part of provisioning: a site created with
-- `bench new-site --install-app erpnext` has no Company, chart of accounts or
-- fiscal year until it completes, and erpnext's install_fixtures crashes outright
-- on a null country. The worker claims a job well after the request arrives, so
-- the company's locale facts are stored on the job row rather than resolved later
-- (the control-plane must not read WorkOS companies -- see AGENTS.md).
--
-- Nullable so in-flight rows written before this migration still claim cleanly;
-- the worker treats a job missing these as "cannot complete setup" and fails it
-- rather than provisioning a half-configured site.

ALTER TABLE erpnext.provision_jobs
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS fy_start_date date,
  ADD COLUMN IF NOT EXISTS fy_end_date date,
  ADD COLUMN IF NOT EXISTS timezone text;
