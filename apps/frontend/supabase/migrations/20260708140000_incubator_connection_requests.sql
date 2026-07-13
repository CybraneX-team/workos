-- Incubator "Discover" feature: an incubator can find a real, already
-- founder-owned company (kind='active') and request to connect with it.
-- This is deliberately NOT the same thing as startup_invites (which claims
-- a *provisional*, incubator-owned shell company into an existing founder
-- account). Here the company already has a founder — connecting must be
-- consent-gated the same way claim/roster-import already are, so accepting
-- is a separate, explicit founder action (see backend routes/companies.ts).

create table public.company_connection_requests (
  id            uuid primary key default gen_random_uuid(),
  incubator_id  uuid not null references public.incubators(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  status        text not null default 'pending'
    check (status in ('pending','accepted','declined')),
  message       text,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (incubator_id, company_id)
);

create index company_connection_requests_company_idx on public.company_connection_requests(company_id);
create index company_connection_requests_incubator_idx on public.company_connection_requests(incubator_id);

alter table public.company_connection_requests enable row level security;

-- Incubator side: owns rows where incubator_id is one of theirs.
create policy company_connection_requests_incubator_all on public.company_connection_requests
  for all
  using (incubator_id in (select public.my_incubator_ids()))
  with check (incubator_id in (select public.my_incubator_ids()));

-- Founder side: can read/update requests aimed at their own company.
-- Reuses the same auth_company_id() tenant helper as every other
-- founder-scoped table (data_sources, normalized_metrics, etc.).
create policy company_connection_requests_company_read on public.company_connection_requests
  for select
  using (company_id = public.auth_company_id());

create policy company_connection_requests_company_respond on public.company_connection_requests
  for update
  using (company_id = public.auth_company_id())
  with check (company_id = public.auth_company_id());
