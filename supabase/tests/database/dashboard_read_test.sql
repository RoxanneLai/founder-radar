begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(10);

insert into public.events (id, title, starts_at, publication_status, published_at, is_fixture, registration_status)
values
  ('50000000-0000-4000-8000-000000000001', 'Dashboard published test', now() + interval '1 day', 'published', now(), false, 'unknown'),
  ('50000000-0000-4000-8000-000000000002', 'Dashboard private draft', now() + interval '1 day', 'draft', null, false, 'unknown'),
  ('50000000-0000-4000-8000-000000000003', 'Dashboard private archive', now() + interval '1 day', 'archived', null, false, 'unknown'),
  ('50000000-0000-4000-8000-000000000004', 'Dashboard fixture test', now() + interval '1 day', 'published', now(), true, 'unknown'),
  ('50000000-0000-4000-8000-000000000005', 'Dashboard past test', now() - interval '1 day', 'published', now(), false, 'unknown'),
  ('50000000-0000-4000-8000-000000000006', 'Dashboard cancelled test', now() + interval '1 day', 'published', now(), false, 'cancelled');

set local role anon;

select is(
  (select count(*) from public.events
   where publication_status = 'published' and not is_fixture
     and city = 'New York' and region = 'NY' and country_code = 'US'
     and time_zone = 'America/New_York' and event_format in ('in-person', 'hybrid')
     and registration_status <> 'cancelled'
     and starts_at >= now() and starts_at < now() + interval '30 days'),
  1::bigint, 'public dashboard predicate excludes fixture, draft, archive, past, and cancelled events'
);

select is(
  (select count(*) from public.events where id in (
    '50000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003')),
  0::bigint, 'RLS hides drafts and archives even without application filters'
);

select ok(
  (select networking_score is null and founder_score is null and investor_score is null
    and price_amount_cents is null and currency_code is null and ends_at is null
   from public.events where id = '50000000-0000-4000-8000-000000000001'),
  'published unscored events are readable without inventing optional facts'
);

select throws_ok('select * from public.event_sources', '42501', null, 'dashboard role cannot read private source evidence');
select throws_ok('select * from public.search_runs', '42501', null, 'dashboard role cannot read private run diagnostics');
select throws_ok(
  $$update public.events set publication_status = 'published', published_at = now()
    where id = '50000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'dashboard role cannot publish drafts'
);
select throws_ok(
  $$insert into public.events(title, starts_at) values ('Unauthorized dashboard insert', now())$$,
  '42501', null, 'dashboard role cannot insert events'
);
select throws_ok(
  $$delete from public.events where id = '50000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'dashboard role cannot delete events'
);

reset role;
set local role authenticated;
select is(
  (select count(*) from public.events where id in (
    '50000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003')),
  0::bigint, 'authenticated clients also cannot read drafts or archives'
);
select throws_ok('select * from public.event_sources', '42501', null, 'authenticated clients cannot read source evidence');

reset role;
select * from finish();
rollback;
