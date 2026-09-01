begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(23);

insert into public.events (id, title, starts_at)
values (
  '30000000-0000-4000-8000-000000000001',
  'Unscored draft test event',
  '2026-09-10T18:00:00-04:00'
);

insert into public.events (
  id, title, starts_at, publication_status, published_at
)
values (
  '30000000-0000-4000-8000-000000000002',
  'Published test event',
  '2026-09-10T18:00:00-04:00',
  'published',
  now()
);

select ok(
  (
    select networking_score is null and price_amount_cents is null
    from public.events
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  'discovery can store a draft without invented scores or prices'
);

select throws_ok(
  $$update public.events set ends_at = starts_at
    where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'end time must be later than start time'
);

select throws_ok(
  $$update public.events set networking_score = 101
    where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'scores above 100 are rejected'
);

select throws_ok(
  $$update public.events set price_amount_cents = 1000
    where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'known prices require a currency'
);

select throws_ok(
  $$update public.events set price_amount_cents = -1, currency_code = 'USD'
    where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'negative prices are rejected'
);

select throws_ok(
  $$update public.events set publication_status = 'published'
    where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'publishing requires an explicit publication timestamp'
);

insert into public.event_sources (source_name, external_id, source_url)
values ('contract-test', 'listing-1', 'https://test.example.invalid/listing-1');

select throws_ok(
  $$insert into public.event_sources (source_name, source_url)
    values ('contract-test', 'https://test.example.invalid/listing-1')$$,
  '23505', null, 'the same provider URL cannot create duplicate sources'
);

select throws_ok(
  $$insert into public.event_sources (source_name, external_id, source_url)
    values ('contract-test', 'listing-1', 'https://test.example.invalid/renamed')$$,
  '23505', null, 'a changed URL does not bypass provider ID uniqueness'
);

select throws_ok(
  $$insert into public.event_sources (event_id, source_name, source_url)
    values (
      '30000000-0000-4000-8000-999999999999',
      'contract-test', 'https://test.example.invalid/missing-event'
    )$$,
  '23503', null, 'sources cannot link to nonexistent events'
);

select throws_ok(
  $$insert into public.search_runs (agent_name, provider, sources_discovered)
    values ('contract-test', 'fixture', -1)$$,
  '23514', null, 'search-run counts cannot be negative'
);

update public.events
set title = 'Updated draft test event', updated_at = '2000-01-01T00:00:00Z'
where id = '30000000-0000-4000-8000-000000000001';

select is(
  (select updated_at from public.events
    where id = '30000000-0000-4000-8000-000000000001'),
  now(),
  'updates refresh updated_at automatically'
);

set local role anon;

select is(
  (select count(*) from public.events
    where id = '30000000-0000-4000-8000-000000000002'),
  1::bigint, 'anonymous readers see published events'
);

select is(
  (select count(*) from public.events
    where id = '30000000-0000-4000-8000-000000000001'),
  0::bigint, 'anonymous readers cannot see draft events'
);

select throws_ok(
  'select * from public.event_sources',
  '42501', null, 'anonymous readers cannot read raw source data'
);

select throws_ok(
  'select * from public.search_runs',
  '42501', null, 'anonymous readers cannot read run diagnostics'
);

select throws_ok(
  $$insert into public.events (title, starts_at)
    values ('Unauthorized event', '2026-09-10T18:00:00Z')$$,
  '42501', null, 'anonymous callers cannot create events'
);

reset role;
set local role authenticated;

select is(
  (select count(*) from public.events
    where id = '30000000-0000-4000-8000-000000000002'),
  1::bigint, 'authenticated readers see published events'
);

select is(
  (select count(*) from public.events
    where id = '30000000-0000-4000-8000-000000000001'),
  0::bigint, 'authenticated readers cannot see draft events'
);

select throws_ok(
  'select * from public.event_sources',
  '42501', null, 'authenticated readers cannot read raw source data'
);

select throws_ok(
  'select * from public.search_runs',
  '42501', null, 'authenticated readers cannot read run diagnostics'
);

select throws_ok(
  $$update public.events set title = 'Unauthorized change'
    where id = '30000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'authenticated callers cannot modify events'
);

reset role;
set local role service_role;

select is(
  (select count(*) from public.events
    where id = '30000000-0000-4000-8000-000000000001'),
  1::bigint, 'the trusted ingestion role can read draft events'
);

select lives_ok(
  $$insert into public.event_sources (source_name, source_url)
    values ('contract-test', 'https://test.example.invalid/service-role')$$,
  'the trusted ingestion role can store a newly discovered source'
);

reset role;
select * from finish();
rollback;
