-- Roster ingestion needs data_sources/ingestion_files/ingestion_jobs to be
-- owned by an incubator (no company exists yet — that's the whole point of
-- a roster upload). Those three tables were built company-first: company_id
-- is NOT NULL and RLS is tenant-scoped to company_id = auth_company_id().
--
-- This migration adds a parallel incubator-owned path: incubator_id becomes
-- a sibling FK, company_id becomes nullable, and a CHECK enforces exactly
-- one owner (company XOR incubator) per row. Existing rows all have
-- company_id set and incubator_id null, so behavior is unchanged for them.

/* ------------------------------------------------------------------ */
/*  companies — carry the roster contact through to the (later) invite  */
/*  step. Only ever populated for source='incubator_roster' rows.       */
/* ------------------------------------------------------------------ */
alter table public.companies
  add column roster_contact_email text,
  add column roster_contact_name text;

/* ------------------------------------------------------------------ */
/*  data_sources                                                       */
/* ------------------------------------------------------------------ */
alter table public.data_sources
  alter column company_id drop not null,
  add column incubator_id uuid references public.incubators(id) on delete cascade,
  add constraint data_sources_owner_xor_check
    check (((company_id is not null)::int + (incubator_id is not null)::int) = 1);

alter table public.data_sources drop constraint data_sources_type_check;
alter table public.data_sources add constraint data_sources_type_check
  check (type in ('excel','manual','roster'));

-- Mirrors data_sources_company_id_type_key so the upload route can upsert
-- an incubator's roster data_source the same way ingestion.ts does for
-- companies. NULLs don't collide under a plain UNIQUE constraint, so this
-- has no effect on existing company-owned rows (incubator_id is null there).
alter table public.data_sources add constraint data_sources_incubator_id_type_key
  unique (incubator_id, type);

/* ------------------------------------------------------------------ */
/*  ingestion_files                                                     */
/* ------------------------------------------------------------------ */
alter table public.ingestion_files
  alter column company_id drop not null,
  add column incubator_id uuid references public.incubators(id) on delete cascade,
  add constraint ingestion_files_owner_xor_check
    check (((company_id is not null)::int + (incubator_id is not null)::int) = 1);

/* ------------------------------------------------------------------ */
/*  ingestion_jobs                                                      */
/* ------------------------------------------------------------------ */
alter table public.ingestion_jobs
  alter column company_id drop not null,
  add column incubator_id uuid references public.incubators(id) on delete cascade,
  add constraint ingestion_jobs_owner_xor_check
    check (((company_id is not null)::int + (incubator_id is not null)::int) = 1);

create index data_sources_incubator_idx on public.data_sources(incubator_id) where incubator_id is not null;
create index ingestion_files_incubator_idx on public.ingestion_files(incubator_id) where incubator_id is not null;
create index ingestion_jobs_incubator_idx on public.ingestion_jobs(incubator_id) where incubator_id is not null;

/* ------------------------------------------------------------------ */
/*  RLS — additive permissive policies for the incubator-owned path.    */
/*  Existing ds_tenant/if_tenant/ij_tenant policies are untouched and    */
/*  keep gating company-owned rows; Postgres OR's multiple permissive    */
/*  policies together, so this only adds visibility, never removes any. */
/* ------------------------------------------------------------------ */
create policy ds_incubator_owner on public.data_sources
  using (incubator_id in (select public.my_incubator_ids()))
  with check (incubator_id in (select public.my_incubator_ids()));

create policy if_incubator_owner on public.ingestion_files
  using (incubator_id in (select public.my_incubator_ids()))
  with check (incubator_id in (select public.my_incubator_ids()));

create policy ij_incubator_owner on public.ingestion_jobs
  using (incubator_id in (select public.my_incubator_ids()))
  with check (incubator_id in (select public.my_incubator_ids()));
