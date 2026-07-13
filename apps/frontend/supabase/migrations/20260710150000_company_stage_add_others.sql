-- Roster imports map free-text stage labels (from incubator spreadsheets) to
-- the funding-round company_stage enum. Labels with no confident match used
-- to silently fall through to the column's DEFAULT 'Seed', misclassifying
-- companies with no visible error. 'Others' gives the mapper an explicit,
-- honest fallback bucket instead.
alter type public.company_stage add value if not exists 'Others';
