create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organizer_name text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  time_zone text not null default 'America/New_York',
  venue_name text,
  address_line text,
  neighborhood text,
  borough text,
  city text not null default 'New York',
  region text not null default 'NY',
  country_code text not null default 'US',
  event_format text not null default 'in-person',
  categories text[] not null default '{}',
  price_amount_cents integer,
  currency_code text,
  registration_status text not null default 'unknown',
  publication_status text not null default 'draft',
  is_fixture boolean not null default false,
  founder_score smallint,
  investor_score smallint,
  networking_score smallint,
  recommendation text,
  potential_downside text,
  scoring_version text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_not_blank check (btrim(title) <> ''),
  constraint events_organizer_not_blank check (
    organizer_name is null or btrim(organizer_name) <> ''
  ),
  constraint events_valid_duration check (
    ends_at is null or ends_at > starts_at
  ),
  constraint events_time_zone_not_blank check (btrim(time_zone) <> ''),
  constraint events_country_code_format check (
    country_code ~ '^[A-Z]{2}$'
  ),
  constraint events_format_allowed check (
    event_format in ('in-person', 'hybrid', 'virtual')
  ),
  constraint events_price_nonnegative check (
    price_amount_cents is null or price_amount_cents >= 0
  ),
  constraint events_price_currency_pair check (
    (price_amount_cents is null and currency_code is null)
    or (price_amount_cents is not null and currency_code is not null)
  ),
  constraint events_currency_code_format check (
    currency_code is null or currency_code ~ '^[A-Z]{3}$'
  ),
  constraint events_registration_status_allowed check (
    registration_status in (
      'unknown',
      'open',
      'almost-full',
      'waitlist',
      'closed',
      'cancelled'
    )
  ),
  constraint events_publication_status_allowed check (
    publication_status in ('draft', 'published', 'archived')
  ),
  constraint events_founder_score_range check (
    founder_score is null or founder_score between 0 and 100
  ),
  constraint events_investor_score_range check (
    investor_score is null or investor_score between 0 and 100
  ),
  constraint events_networking_score_range check (
    networking_score is null or networking_score between 0 and 100
  ),
  constraint events_seen_order check (last_seen_at >= first_seen_at),
  constraint events_published_at_required check (
    publication_status <> 'published' or published_at is not null
  )
);

create table public.search_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  agent_version text,
  provider text not null,
  search_parameters jsonb not null default '{}'::jsonb,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  sources_discovered integer not null default 0,
  sources_created integer not null default 0,
  sources_updated integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint search_runs_agent_name_not_blank check (btrim(agent_name) <> ''),
  constraint search_runs_provider_not_blank check (btrim(provider) <> ''),
  constraint search_runs_status_allowed check (
    status in (
      'queued',
      'running',
      'succeeded',
      'partial',
      'failed',
      'cancelled'
    )
  ),
  constraint search_runs_completion_order check (
    completed_at is null or completed_at >= started_at
  ),
  constraint search_runs_counts_nonnegative check (
    sources_discovered >= 0
    and sources_created >= 0
    and sources_updated >= 0
  )
);

create table public.event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid,
  discovered_by_run_id uuid,
  source_name text not null,
  source_kind text not null default 'listing',
  external_id text,
  source_url text not null,
  registration_url text,
  fetched_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  http_status smallint,
  content_hash text,
  content_text text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sources_event_id_fkey foreign key (event_id)
    references public.events (id) on delete set null,
  constraint event_sources_discovered_by_run_id_fkey
    foreign key (discovered_by_run_id)
    references public.search_runs (id) on delete set null,
  constraint event_sources_source_name_not_blank check (
    btrim(source_name) <> ''
  ),
  constraint event_sources_kind_allowed check (
    source_kind in ('listing', 'organizer', 'calendar', 'other')
  ),
  constraint event_sources_external_id_not_blank check (
    external_id is null or btrim(external_id) <> ''
  ),
  constraint event_sources_source_url_format check (
    source_url ~ '^https?://'
  ),
  constraint event_sources_registration_url_format check (
    registration_url is null or registration_url ~ '^https?://'
  ),
  constraint event_sources_http_status_range check (
    http_status is null or http_status between 100 and 599
  ),
  constraint event_sources_seen_order check (
    last_seen_at >= first_seen_at
  )
);

create index events_starts_at_idx on public.events (starts_at);

create index events_publication_starts_at_idx
  on public.events (publication_status, starts_at);

create index event_sources_event_id_idx
  on public.event_sources (event_id);

create index event_sources_discovered_by_run_id_idx
  on public.event_sources (discovered_by_run_id);

create index event_sources_last_seen_at_idx
  on public.event_sources (last_seen_at desc);

create unique index event_sources_source_external_id_key
  on public.event_sources (source_name, external_id)
  where external_id is not null;

create unique index event_sources_source_url_key
  on public.event_sources (source_name, source_url);

create index search_runs_started_at_idx
  on public.search_runs (started_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger event_sources_set_updated_at
before update on public.event_sources
for each row execute function public.set_updated_at();

create trigger search_runs_set_updated_at
before update on public.search_runs
for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.event_sources enable row level security;
alter table public.search_runs enable row level security;

create policy "published events are publicly readable"
on public.events
for select
to anon, authenticated
using (publication_status = 'published');

revoke all on table public.events from anon, authenticated;
revoke all on table public.event_sources from anon, authenticated;
revoke all on table public.search_runs from anon, authenticated;
revoke execute on function public.set_updated_at() from public;

grant select on table public.events to anon, authenticated;
grant all on table public.events to service_role;
grant all on table public.event_sources to service_role;
grant all on table public.search_runs to service_role;

comment on table public.events is
  'Canonical normalized events shown by FounderRadar.';

comment on table public.event_sources is
  'Discovered source listings and provenance; event_id stays null until normalization.';

comment on table public.search_runs is
  'Auditable executions of discovery agents and provider searches.';
