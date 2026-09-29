begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select no_plan();

select is(public.public_listing_url('https://www.finos.org/hosted-events/synthetic-talk/?token=private'), 'https://finos.org/hosted-events/synthetic-talk', 'FINOS individual listing canonicalizes');
select is(public.public_listing_url('https://events.datadoghq.com/events/synthetic-talk/?utm_source=test'), 'https://events.datadoghq.com/events/synthetic-talk', 'Datadog individual listing canonicalizes');
select is(public.public_listing_url('https://pminyc.org/calendar?token=private&eventId=45084#secret'), 'https://pminyc.org/calendar?eventId=45084', 'PMI identity survives tracking removal');
select is(public.public_listing_url('https://pminyc.org/calendar?eventId=45083'), 'https://pminyc.org/calendar?eventId=45083', 'PMI distinct events remain distinct');
select is(public.public_listing_url('https://pminyc.org/calendar?eventId=1&eventId=2'), null::text, 'duplicate identity is rejected');
select is(public.public_listing_url('https://pminyc.org/calendar?eventId=45084&x=eventId=999'), 'https://pminyc.org/calendar?eventId=45084', 'identity-like private values do not become keys');
select is(public.public_listing_url('https://pminyc.org/calendar?eventId=%34'), null::text, 'encoded identity value is rejected consistently');
select is(public.public_listing_url('https://pminyc.org/calendar?%65ventId=4'), null::text, 'encoded identity key is rejected consistently');
select is(public.public_listing_url('https://pminyc.org/calendar'), null::text, 'calendar is not an event');

insert into public.search_runs(id, agent_name, provider) values ('cccccccc-0000-4000-8000-000000000001', 'career-test', 'offline');
create function pg_temp.source(failed boolean default false) returns jsonb language sql as $$
  select jsonb_build_object('source_name','career-test','source_url','https://pminyc.org/calendar?eventId=999999',
    'external_id','999999','content_text',case when failed then null else 'SYNTHETIC PRIVATE EVIDENCE' end,
    'error_code',case when failed then 'invalid_candidate' else null end)
$$;
create function pg_temp.event(assessment jsonb default '{"version":"career-score-v1","score":75}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('title','Synthetic career talk','starts_at','2026-10-01T18:00:00-04:00',
    'time_zone','America/New_York','city','New York','region','NY','country_code','US',
    'event_format','in-person','career_assessment',assessment)
$$;
create temp table career_result as select * from public.ingest_event_source(
  'cccccccc-0000-4000-8000-000000000001', pg_temp.source(), pg_temp.event(), '2026-09-29T00:00:00Z');
select ok((select event_written from career_result), 'career RPC creates draft');
select is((select career_assessment->>'score' from public.events where id=(select event_id from career_result)), '75', 'career assessment persists');
select is((select publication_status from public.events where id=(select event_id from career_result)), 'draft', 'no automatic publication');
grant select on career_result to anon;
set local role anon;
select is((select count(*) from public.events where id=(select event_id from career_result)), 0::bigint, 'career draft is private');
reset role;
select * from public.ingest_event_source('cccccccc-0000-4000-8000-000000000001', pg_temp.source(true), null, '2026-09-29T01:00:00Z');
select is((select career_assessment->>'score' from public.events where id=(select event_id from career_result)), '75', 'failure preserves assessment');
select is((select content_text from public.event_sources where id=(select source_id from career_result)), 'SYNTHETIC PRIVATE EVIDENCE', 'failure preserves evidence');
select * from public.ingest_event_source('cccccccc-0000-4000-8000-000000000001', pg_temp.source(), pg_temp.event(null), '2026-09-29T02:00:00Z');
select is((select career_assessment from public.events where id=(select event_id from career_result)), null::jsonb, 'founder refresh clears draft assessment');
update public.events set publication_status='archived', career_assessment='{"score":75}' where id=(select event_id from career_result);
select * from public.ingest_event_source('cccccccc-0000-4000-8000-000000000001', pg_temp.source(), pg_temp.event('{"score":99}'), '2026-09-29T03:00:00Z');
select is((select career_assessment->>'score' from public.events where id=(select event_id from career_result)), '75', 'archived assessment is protected');
select * from finish();
rollback;
