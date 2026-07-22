-- Lead-form campaigns add two publish steps beyond the website flow:
--   leadform  creates the Meta instant form (a real Meta object, so it is also mapped)
--   crmsync   configures Frappe CRM lead syncing (no Meta object, so steps only)
-- Both object_kind CHECK constraints are recreated rather than altered, since Postgres has no
-- in-place edit for a CHECK. Names match the ones Postgres generated for the inline constraints
-- in 039_meta_ads_campaign_studio.sql.

ALTER TABLE public.meta_ads_campaign_job_steps
  DROP CONSTRAINT IF EXISTS meta_ads_campaign_job_steps_object_kind_check;
ALTER TABLE public.meta_ads_campaign_job_steps
  ADD CONSTRAINT meta_ads_campaign_job_steps_object_kind_check
  CHECK (object_kind IN ('image', 'campaign', 'adset', 'creative', 'ad', 'status', 'leadform', 'crmsync'));

ALTER TABLE public.meta_ads_entity_mappings
  DROP CONSTRAINT IF EXISTS meta_ads_entity_mappings_object_kind_check;
ALTER TABLE public.meta_ads_entity_mappings
  ADD CONSTRAINT meta_ads_entity_mappings_object_kind_check
  CHECK (object_kind IN ('image', 'campaign', 'adset', 'creative', 'ad', 'leadform'));
