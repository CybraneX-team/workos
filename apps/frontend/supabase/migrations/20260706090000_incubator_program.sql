-- Incubator program: schema for incubators, cohorts, roster-import provisional
-- startups, and startup invites.
--
-- Lifecycle model (see docs/incubator/IMPLEMENTATION_PLAN.md):
--   roster upload -> provisional company (kind='provisional', managed_by_incubator_id set)
--   invite sent   -> startup_invites row (token, email)
--   founder claims -> real onboarding runs, company flips kind='active',
--                      claimed_from_invite_id set, invite.status='claimed'
--
-- D2a (confirmed): the managing incubator retains read access to a claimed
-- startup's live metrics. metric_snapshots / bdt_metrics / normalized_metrics
-- have no RLS today (access is enforced at the route layer, e.g.
-- backend/src/routes/metrics.ts checks auth.companyId === params.companyId).
-- Incubator metric reads follow the same pattern: the incubator API routes
-- verify managed_by_incubator_id / cohort_members linkage in the handler
-- before querying those tables with the service-role client. No RLS change
-- is made to the metric tables themselves.

/* ------------------------------------------------------------------ */
/*  incubators                                                         */
/* ------------------------------------------------------------------ */
create table public.incubators (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null references auth.users(id) on delete cascade,
  name                  text not null,
  legal_name            text,
  website               text,
  logo_url              text,
  hq_country            text,
  hq_city               text,
  program_type          text
    check (program_type in ('accelerator','incubator','studio','university','corporate')),
  focus_sectors         text[] not null default '{}',
  focus_stages          text[] not null default '{}',
  typical_cohort_size   integer,
  program_length_weeks  integer,
  description           text,
  onboarding_completed  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index incubators_owner_uniq on public.incubators(owner_user_id);

create trigger incubators_updated_at
  before update on public.incubators
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/*  cohorts                                                             */
/* ------------------------------------------------------------------ */
create table public.cohorts (
  id            uuid primary key default gen_random_uuid(),
  incubator_id  uuid not null references public.incubators(id) on delete cascade,
  name          text not null,
  description   text,
  status        text not null default 'active'
    check (status in ('draft','active','completed','archived')),
  starts_on     date,
  ends_on       date,
  goals         jsonb not null default '[]',   -- [{ label, metric_key, target }]
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index cohorts_incubator_idx on public.cohorts(incubator_id);

create trigger cohorts_updated_at
  before update on public.cohorts
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/*  companies — managed/provisional support                            */
/* ------------------------------------------------------------------ */
alter table public.companies
  add column kind text not null default 'active'
    check (kind in ('active','provisional')),
  add column managed_by_incubator_id uuid references public.incubators(id) on delete set null,
  add column source text not null default 'self'
    check (source in ('self','incubator_roster'));

create index companies_managed_by_idx on public.companies(managed_by_incubator_id)
  where managed_by_incubator_id is not null;

/* ------------------------------------------------------------------ */
/*  startup_invites (modeled on workspace_invites)                      */
/* ------------------------------------------------------------------ */
create table public.startup_invites (
  id                  uuid primary key default gen_random_uuid(),
  incubator_id        uuid not null references public.incubators(id) on delete cascade,
  company_id          uuid references public.companies(id) on delete set null,   -- the provisional startup
  cohort_id           uuid references public.cohorts(id) on delete set null,
  email               text not null,
  startup_name        text,
  token               text not null default encode(extensions.gen_random_bytes(24), 'base64url'::text),
  status              text not null default 'pending'
    check (status in ('pending','sent','opened','claimed','expired','bounced')),
  sent_at             timestamptz,
  opened_at           timestamptz,
  claimed_at          timestamptz,
  claimed_company_id  uuid references public.companies(id) on delete set null,
  expires_at          timestamptz not null default (now() + interval '30 days'),
  created_by          uuid not null references auth.users(id),
  created_at          timestamptz not null default now()
);

create index startup_invites_incubator_idx on public.startup_invites(incubator_id);
create index startup_invites_company_idx on public.startup_invites(company_id);
create unique index startup_invites_token_uniq on public.startup_invites(token);

alter table public.companies
  add column claimed_from_invite_id uuid references public.startup_invites(id) on delete set null;

/* ------------------------------------------------------------------ */
/*  cohort_members                                                      */
/* ------------------------------------------------------------------ */
create table public.cohort_members (
  cohort_id   uuid not null references public.cohorts(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  status      text not null default 'active'
    check (status in ('active','graduated','dropped')),
  notes       text,
  primary key (cohort_id, company_id)
);

create index cohort_members_company_idx on public.cohort_members(company_id);

/* ------------------------------------------------------------------ */
/*  ingestion_jobs — allow the new 'roster' job kind                    */
/* ------------------------------------------------------------------ */
alter table public.ingestion_jobs drop constraint ingestion_jobs_kind_check;
alter table public.ingestion_jobs add constraint ingestion_jobs_kind_check
  check (kind in ('normalize','roster'));

/* ------------------------------------------------------------------ */
/*  RLS helper functions                                                */
/*  SECURITY DEFINER, mirroring my_company_ids()/auth_company_id()/     */
/*  can_read_department() below — this lets a policy on one table       */
/*  reference another RLS-protected table without requiring the calling */
/*  role to hold a direct table-level GRANT on it.                      */
/* ------------------------------------------------------------------ */
create function public.my_incubator_ids() returns setof uuid
    language sql stable security definer
    set search_path to 'public'
    as $$
  select id from public.incubators where owner_user_id = auth.uid()
$$;

create function public.my_cohort_ids() returns setof uuid
    language sql stable security definer
    set search_path to 'public'
    as $$
  select c.id from public.cohorts c where c.incubator_id in (select public.my_incubator_ids())
$$;

/* ------------------------------------------------------------------ */
/*  RLS                                                                 */
/* ------------------------------------------------------------------ */
alter table public.incubators enable row level security;
alter table public.cohorts enable row level security;
alter table public.cohort_members enable row level security;
alter table public.startup_invites enable row level security;

create policy incubators_owner_all on public.incubators
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy cohorts_owner_all on public.cohorts
  using (incubator_id in (select public.my_incubator_ids()))
  with check (incubator_id in (select public.my_incubator_ids()));

create policy cohort_members_owner_all on public.cohort_members
  using (cohort_id in (select public.my_cohort_ids()))
  with check (cohort_id in (select public.my_cohort_ids()));

create policy startup_invites_owner_all on public.startup_invites
  using (incubator_id in (select public.my_incubator_ids()))
  with check (incubator_id in (select public.my_incubator_ids()));

-- Mirrors workspace_invites' invite_select_by_token: token is the secret,
-- so an unscoped select-by-active-unexpired policy is safe as long as callers
-- always filter by the (unguessable) token column.
create policy startup_invites_select_by_token on public.startup_invites
  for select using (status <> 'expired' and expires_at > now());

-- Tighten companies_read: provisional (unclaimed, incubator-owned) startups
-- must not appear in the global company feed (Twin galaxy, VC find-startups,
-- etc.) until claimed. Existing rows all default to kind='active', so this
-- is a no-op for every company that isn't part of this feature.
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies
  for select
  using (
    auth.uid() is not null
    and (
      kind = 'active'
      or managed_by_incubator_id in (select public.my_incubator_ids())
    )
  );
