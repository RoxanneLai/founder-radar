begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select no_plan();

create function pg_temp.source(url text, external text default null, body text default null, failure text default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'source_name', 'ingestion-test', 'source_url', url, 'external_id', external,
    'content_text', body, 'content_hash', case when body is null then null else md5(body) end,
    'raw_payload', jsonb_build_object('evidence_kind', 'test'), 'error_code', failure
  );
$$;
create function pg_temp.event(title text default 'Ingestion test event')
returns jsonb language sql as $$
  select jsonb_build_object(
    'title', title, 'starts_at', '2026-09-05T22:00:00Z', 'time_zone', 'America/New_York',
    'city', 'New York', 'region', 'NY', 'country_code', 'US', 'event_format', 'in-person'
  );
$$;

insert into public.search_runs(id, agent_name, provider) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'test', 'test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'test', 'test');

select ok(not has_function_privilege('anon', 'public.ingest_event_source(uuid,jsonb,jsonb,timestamptz)', 'execute'),
  'anonymous users cannot ingest');
select ok(not has_function_privilege('authenticated', 'public.ingest_event_source(uuid,jsonb,jsonb,timestamptz)', 'execute'),
  'authenticated application users cannot ingest');
select ok(has_function_privilege('service_role', 'public.ingest_event_source(uuid,jsonb,jsonb,timestamptz)', 'execute'),
  'service role can ingest');
select ok(not (select prosecdef from pg_proc where oid = 'public.ingest_event_source(uuid,jsonb,jsonb,timestamptz)'::regprocedure),
  'RPC uses invoker security');

set local role service_role;
select lives_ok($test$
  select * from public.ingest_event_source('bbbbbbbb-0000-4000-8000-000000000001',
    '{"source_name":"service-role-test","source_url":"https://example.invalid/service-role"}'::jsonb)
$test$, 'service role can actually execute the write boundary');
reset role;

create temp table first_result as select * from public.ingest_event_source(
  'bbbbbbbb-0000-4000-8000-000000000001',
  pg_temp.source('https://example.invalid/one', 'one'), null, '2026-09-01T00:00:00Z'
);
select ok((select source_created from first_result), 'discovery creates one source');
select is((select event_id from first_result), null::uuid, 'discovery can remain unlinked');

create temp table normalized_result as select * from public.ingest_event_source(
  'bbbbbbbb-0000-4000-8000-000000000001',
  pg_temp.source('https://example.invalid/one', 'one', 'evidence'), pg_temp.event(), '2026-09-01T00:00:00Z'
);
select is((select source_id from normalized_result), (select source_id from first_result), 'normalization reuses the source');
select ok((select event_written from normalized_result), 'normalization writes an event');
select is((select publication_status from public.events where id = (select event_id from normalized_result)), 'draft', 'new event is a draft');
select is((select is_fixture from public.events where id = (select event_id from normalized_result)), false, 'new event is not a fixture');
select is((select price_amount_cents from public.events where id = (select event_id from normalized_result)), null::integer, 'unknown price is null');
select is((select founder_score from public.events where id = (select event_id from normalized_result)), null::smallint, 'score is not invented');

select * from public.ingest_event_source(
  'bbbbbbbb-0000-4000-8000-000000000002',
  pg_temp.source('https://example.invalid/one', 'one', 'new evidence'), pg_temp.event('Updated title'), '2026-09-02T00:00:00Z'
);
select is((select count(*) from public.event_sources where source_name = 'ingestion-test'), 1::bigint, 'repeat run does not duplicate a source');
select is((select count(*) from public.events where not is_fixture), 1::bigint, 'repeat run does not duplicate an event');
select is((select first_seen_at from public.event_sources where id = (select source_id from first_result)),
  '2026-09-01T00:00:00Z'::timestamptz, 'first seen is preserved');
select is((select last_seen_at from public.event_sources where id = (select source_id from first_result)),
  '2026-09-02T00:00:00Z'::timestamptz, 'last seen advances');
select is((select discovered_by_run_id from public.event_sources where id = (select source_id from first_result)),
  'bbbbbbbb-0000-4000-8000-000000000001'::uuid, 'original discovering run is preserved');
select is((select title from public.events where id = (select event_id from normalized_result)), 'Updated title', 'draft fields refresh');

select * from public.ingest_event_source(
  'bbbbbbbb-0000-4000-8000-000000000002',
  pg_temp.source('https://example.invalid/one', 'one', null, 'provider_request_failed'), null, '2026-09-03T00:00:00Z'
);
select is((select content_text from public.event_sources where id = (select source_id from first_result)),
  'new evidence', 'failure preserves successful content');
select is((select fetched_at from public.event_sources where id = (select source_id from first_result)),
  '2026-09-02T00:00:00Z'::timestamptz, 'failure preserves successful retrieval time');
select is((select last_attempt_error from public.event_sources where id = (select source_id from first_result)),
  'provider_request_failed', 'failure diagnostic is recorded separately');
select is((select event_id from public.event_sources where id = (select source_id from first_result)),
  (select event_id from normalized_result), 'failure preserves event link');

select * from public.ingest_event_source(
  'bbbbbbbb-0000-4000-8000-000000000002',
  pg_temp.source('https://example.invalid/renamed', 'one', 'current'), pg_temp.event('Current'), '2026-09-04T00:00:00Z'
);
select is((select count(*) from public.event_sources where source_name = 'ingestion-test'), 1::bigint, 'external ID reconciles changed URL');
select * from public.ingest_event_source(
  'bbbbbbbb-0000-4000-8000-000000000001',
  pg_temp.source('https://example.invalid/one', 'one', 'stale'), pg_temp.event('Stale'), '2026-09-02T00:00:00Z'
);
select is((select title from public.events where id = (select event_id from normalized_result)), 'Current', 'stale run does not overwrite a newer event');
select is((select source_url from public.event_sources where id = (select source_id from first_result)),
  'https://example.invalid/renamed', 'stale run does not revert a newer URL');

insert into public.event_sources(source_name, source_url, event_id)
values ('ingestion-test', 'https://example.invalid/other-source', (select event_id from normalized_result));
select * from public.ingest_event_source(
  'bbbbbbbb-0000-4000-8000-000000000001',
  pg_temp.source('https://example.invalid/other-source', null, 'older evidence'),
  pg_temp.event('Older source title'), '2026-09-03T00:00:00Z'
);
select is((select title from public.events where id = (select event_id from normalized_result)), 'Current',
  'an older observation from another linked source cannot overwrite a newer draft');

insert into public.event_sources(source_name, source_url, event_id)
values ('ingestion-test', 'https://example.invalid/fixture-link', (select id from public.events where is_fixture order by id limit 1));
select * from public.ingest_event_source(
  'bbbbbbbb-0000-4000-8000-000000000001',
  pg_temp.source('https://example.invalid/fixture-link', null, 'evidence'),
  pg_temp.event('Do not rewrite fixture'), '2026-09-07T00:00:00Z'
);
select is((select count(*) from public.events where title = 'Do not rewrite fixture'), 0::bigint,
  'fixture events are not overwritten');

select throws_ok($test$
  select * from public.ingest_event_source('bbbbbbbb-0000-4000-8000-000000000001',
    pg_temp.source('https://example.invalid/bad', null, 'bad'),
    pg_temp.event() || '{"price_amount_cents":-1,"currency_code":"USD"}'::jsonb)
$test$, '23514', null, 'invalid event violates database constraints');
select is((select count(*) from public.event_sources where source_url = 'https://example.invalid/bad'), 0::bigint,
  'invalid event rolls back its source too');
select throws_ok($test$
  select * from public.ingest_event_source('bbbbbbbb-0000-4000-8000-000000000001',
    pg_temp.source('https://example.invalid/no-evidence'), pg_temp.event())
$test$, '22023', null, 'event cannot be linked without evidence');

update public.events set publication_status = 'published', published_at = now()
where id = (select event_id from normalized_result);
select * from public.ingest_event_source(
  'bbbbbbbb-0000-4000-8000-000000000002',
  pg_temp.source('https://example.invalid/renamed', 'one', 'changed'), pg_temp.event('Do not overwrite'), '2026-09-05T00:00:00Z'
);
select is((select title from public.events where id = (select event_id from normalized_result)), 'Current', 'published events are protected from automated changes');
update public.events set publication_status = 'archived' where id = (select event_id from normalized_result);
select * from public.ingest_event_source(
  'bbbbbbbb-0000-4000-8000-000000000002',
  pg_temp.source('https://example.invalid/renamed', 'one', 'changed'), pg_temp.event('Do not unarchive'), '2026-09-06T00:00:00Z'
);
select is((select publication_status from public.events where id = (select event_id from normalized_result)), 'archived', 'archived events are not revived');

select * from public.ingest_event_source('bbbbbbbb-0000-4000-8000-000000000001',
  pg_temp.source('https://example.invalid/two', 'two'), null);
select throws_ok($test$
  select * from public.ingest_event_source('bbbbbbbb-0000-4000-8000-000000000001',
    pg_temp.source('https://example.invalid/two', 'one'), null)
$test$, '23505', null, 'conflicting URL and external identities require review');
select throws_ok($test$
  select * from public.ingest_event_source('bbbbbbbb-0000-4000-8000-000000000001',
    pg_temp.source('https://example.invalid/two', 'changed-id'), null)
$test$, '23505', null, 'external identity cannot silently change');
update public.search_runs set status = 'succeeded' where id = 'bbbbbbbb-0000-4000-8000-000000000002';
select throws_ok($test$
  select * from public.ingest_event_source('bbbbbbbb-0000-4000-8000-000000000002',
    pg_temp.source('https://example.invalid/closed-run'), null)
$test$, '22023', null, 'completed runs cannot keep ingesting');

set local role anon;
select is((select count(*) from public.events where not is_fixture), 0::bigint, 'nonpublished ingestion results are hidden from public reads');
reset role;
select * from finish();
rollback;
