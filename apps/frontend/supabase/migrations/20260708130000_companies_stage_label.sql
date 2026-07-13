-- Free-text product-maturity label for incubator-managed companies.
--
-- companies.stage is the funding-round enum (company_stage). Roster uploads
-- carry an incubator's own product-maturity taxonomy ("Idea Stage", "MVP in
-- Market", "Prototype Developed", "Scaling / Growth Stage") which does not fit
-- that enum. The roster import maps those to the nearest enum value for `stage`
-- (so aggregations/dashboards keep working) and stores the incubator's exact
-- wording here so nothing is lost or distorted in the UI.
alter table public.companies
  add column stage_label text;
