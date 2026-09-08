begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(24);

select has_table('public', 'events', 'events table exists');
select has_table('public', 'event_sources', 'event_sources table exists');
select has_table('public', 'search_runs', 'search_runs table exists');

select has_column(
  'public',
  'event_sources',
  'raw_payload',
  'source records preserve raw provider payloads'
);

select has_column(
  'public',
  'event_sources',
  'content_text',
  'source records can preserve extracted page text'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_sources'
      and column_name = 'event_id'
  ),
  'YES',
  'a discovered source can exist before canonicalization'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'event_sources_event_id_fkey'
      and contype = 'f'
  ),
  'event_sources links to canonical events'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'event_sources_discovered_by_run_id_fkey'
      and contype = 'f'
  ),
  'event_sources links to the discovering search run'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'event_sources_source_external_id_key'
  ),
  'provider external IDs have a unique index'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'event_sources_source_url_key'
  ),
  'provider URLs have a unique index'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.events'::regclass
  ),
  'events has row-level security enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.event_sources'::regclass
  ),
  'event_sources has row-level security enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.search_runs'::regclass
  ),
  'search_runs has row-level security enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'events'
      and policyname = 'published events are publicly readable'
      and cmd = 'SELECT'
  ),
  'published events have an explicit public read policy'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'event_sources'
  ),
  0::bigint,
  'source payloads have no public policies'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'search_runs'
  ),
  0::bigint,
  'search-run diagnostics have no public policies'
);

select is(
  (select count(*) from public.events),
  6::bigint,
  'the seed contains six canonical events'
);

select is(
  (select count(*) from public.event_sources),
  6::bigint,
  'the seed contains six source records'
);

select is(
  (select count(*) from public.search_runs),
  1::bigint,
  'the seed contains one fixture search run'
);

select is(
  (
    select count(*)
    from public.event_sources
    where event_id is not null
  ),
  6::bigint,
  'all seeded source records are linked to canonical events'
);

insert into public.event_sources (
  source_name,
  source_url,
  raw_payload
)
values (
  'test-provider',
  'https://test.example.invalid/new-listing',
  '{"fixture":true}'::jsonb
);

select ok(
  exists (
    select 1
    from public.event_sources
    where source_name = 'test-provider'
      and event_id is null
  ),
  'a newly discovered source can be stored before normalization'
);

select is(
  (select count(*) from public.events where is_fixture),
  6::bigint,
  'all seeded events are explicitly marked as fixtures'
);

select is(
  (select count(*) from public.events where borough is not null),
  6::bigint,
  'seeded events retain the borough needed by the current UI'
);

select results_eq(
  'select networking_score::integer from public.events
    order by networking_score desc, starts_at, id',
  array[94, 91, 86, 84, 80, 76],
  'seeded event ranking matches the V0 display contract'
);

select * from finish();
rollback;
