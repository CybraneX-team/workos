-- Free-text sector for incubator-managed companies.
--
-- Roster uploads carry an incubator's own sector labels ("Policy Tech",
-- "TourismTech", "Electronics", ...) that rarely match the global `industries`
-- taxonomy. Previously those values were resolved to industry_id via a strict
-- label match and silently dropped when unmatched. This column preserves the
-- raw sector as free text; industry_id remains a best-effort catalog link on
-- top of it rather than a gate.
alter table public.companies
  add column sector text;
