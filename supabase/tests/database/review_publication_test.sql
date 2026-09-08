begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select no_plan();

select is(public.public_listing_url('https://www.lu.ma/review-test/?token=private#secret'), 'https://luma.com/review-test', 'Luma aliases and private parameters normalize');
select is(public.public_listing_url('https://www.meetup.com/test-group/events/123/?token=private'), 'https://meetup.com/test-group/events/123', 'Meetup listing normalizes');
select is(public.public_listing_url('https://www.eventbrite.com/e/test-tickets-123?private=1'), 'https://eventbrite.com/e/test-tickets-123', 'Eventbrite listing normalizes');
select is(public.public_listing_url(url), null::text, 'reject unsafe URL: ' || url)
from unnest(array['javascript:alert(1)', 'http://luma.com/test', 'https://u:p@luma.com/test',
  'https://luma.com:443/test', 'https://luma.com.evil.test/test', 'https://luma.com/login',
  'https://luma.com/../test', 'https://luma.com/%74est', 'https://meetup.com/test',
  'https://eventbrite.com/e/test', E'https://luma.com/test\n', E'https://luma.com/test\\bad']) as url;

insert into public.events(id, title, starts_at)
values ('61000000-0000-4000-8000-000000000001', 'Synthetic reviewed event', now() + interval '1 day');
insert into public.event_sources(id, event_id, source_name, source_url, content_text, fetched_at, raw_payload)
values ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001',
  'luma.com', 'https://lu.ma/review-test?token=private#secret', 'PRIVATE SYNTHETIC EVIDENCE', now(), '{"private":"snapshot"}');

create temporary table review_checkpoint as select public.get_event_review(
  '61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001') as snapshot;
select is((select snapshot->'event'->>'publication_status' from review_checkpoint), 'draft', 'review does not publish');
select is((select count(*) from public.event_publication_reviews), 0::bigint, 'preview writes no audit rows');
select is((select snapshot->>'public_registration_url' from review_checkpoint), 'https://luma.com/review-test', 'preview selects a canonical public URL');
select ok((select snapshot->>'review_token' ~ '^[a-f0-9]{64}$' from review_checkpoint), 'preview has a SHA-256 revision token');
select is(public.get_event_review('61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001'),
  (select snapshot from review_checkpoint), 'unchanged review has a stable token and snapshot');
select throws_ok($$select public.publish_reviewed_event('61000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001', (select snapshot->>'review_token' from review_checkpoint))$$,
  'P0001', 'review_approval_required', 'omitted approval never publishes');
select throws_ok($$select public.publish_reviewed_event('61000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001', null, true)$$,
  'P0001', 'review_stale', 'null token never publishes');
select throws_ok($$select public.publish_reviewed_event('61000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000002', (select snapshot->>'review_token' from review_checkpoint), true)$$,
  'P0001', 'review_source_missing', 'unlinked source never publishes');

update public.events set title = 'Changed after preview' where id = '61000000-0000-4000-8000-000000000001';
select throws_ok($$select public.publish_reviewed_event('61000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001', (select snapshot->>'review_token' from review_checkpoint), true)$$,
  'P0001', 'review_stale', 'changed event requires fresh approval');
update review_checkpoint set snapshot = public.get_event_review('61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001');
update public.event_sources set content_text = 'CHANGED PRIVATE EVIDENCE' where id = '62000000-0000-4000-8000-000000000001';
select throws_ok($$select public.publish_reviewed_event('61000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001', (select snapshot->>'review_token' from review_checkpoint), true)$$,
  'P0001', 'review_stale', 'changed evidence requires fresh approval even within the same transaction timestamp');

-- Exercise every hard gate with a fresh token so token checks cannot hide a missing gate.
create function pg_temp.attempt_publish() returns jsonb language sql as $$
  select public.publish_reviewed_event('61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001',
    public.get_event_review('61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001')->>'review_token', true);
$$;
update public.events set is_fixture = true where id = '61000000-0000-4000-8000-000000000001';
select throws_ok('select pg_temp.attempt_publish()', 'P0001', 'review_not_draft', 'fixtures cannot be published');
update public.events set is_fixture = false, publication_status = 'archived' where id = '61000000-0000-4000-8000-000000000001';
select throws_ok('select pg_temp.attempt_publish()', 'P0001', 'review_not_draft', 'archives cannot be republished');
update public.events set publication_status = 'draft', city = 'Boston' where id = '61000000-0000-4000-8000-000000000001';
select throws_ok('select pg_temp.attempt_publish()', 'P0001', 'review_not_visible', 'non-NYC events stay drafts');
update public.events set city = 'New York', starts_at = now() - interval '1 hour' where id = '61000000-0000-4000-8000-000000000001';
select throws_ok('select pg_temp.attempt_publish()', 'P0001', 'review_not_visible', 'past events stay drafts');
update public.events set starts_at = now() + interval '31 days' where id = '61000000-0000-4000-8000-000000000001';
select throws_ok('select pg_temp.attempt_publish()', 'P0001', 'review_not_visible', 'events beyond the dashboard window stay drafts');
update public.events set starts_at = now() + interval '1 day', registration_status = 'cancelled' where id = '61000000-0000-4000-8000-000000000001';
select throws_ok('select pg_temp.attempt_publish()', 'P0001', 'review_not_visible', 'cancelled events stay drafts');
update public.events set registration_status = 'unknown', event_format = 'virtual' where id = '61000000-0000-4000-8000-000000000001';
select throws_ok('select pg_temp.attempt_publish()', 'P0001', 'review_not_visible', 'virtual events stay drafts');
update public.events set event_format = 'in-person' where id = '61000000-0000-4000-8000-000000000001';
update public.event_sources set last_attempt_error = 'failed' where id = '62000000-0000-4000-8000-000000000001';
select throws_ok('select pg_temp.attempt_publish()', 'P0001', 'review_evidence_required', 'failed observations block publication');
update public.event_sources set last_attempt_error = null, content_text = ' ' where id = '62000000-0000-4000-8000-000000000001';
select throws_ok('select pg_temp.attempt_publish()', 'P0001', 'review_evidence_required', 'blank evidence blocks publication');
update public.event_sources set content_text = 'PRIVATE EVIDENCE', fetched_at = null where id = '62000000-0000-4000-8000-000000000001';
select throws_ok('select pg_temp.attempt_publish()', 'P0001', 'review_evidence_required', 'missing evidence time blocks publication');
update public.event_sources set fetched_at = now(), source_url = 'https://evil.test/event' where id = '62000000-0000-4000-8000-000000000001';
select throws_ok('select pg_temp.attempt_publish()', 'P0001', 'review_link_invalid', 'arbitrary hosts cannot be made public');
update public.event_sources set source_url = 'https://lu.ma/review-test?token=private' where id = '62000000-0000-4000-8000-000000000001';
select is((select count(*) from public.event_publication_reviews), 0::bigint, 'all rejected publications leave audit unchanged');
select lives_ok('select pg_temp.attempt_publish()', 'valid explicit approval publishes atomically');
select is((select publication_status from public.events where id = '61000000-0000-4000-8000-000000000001'), 'published', 'approved draft is published');
select is((select count(*) from public.event_publication_reviews), 1::bigint, 'one private approval snapshot recorded');
select is((select review_snapshot->'sources'->0->>'content_text' from public.event_publication_reviews), 'PRIVATE EVIDENCE', 'private audit retains the reviewed evidence');
select ok((select founder_score is null and networking_score is null and price_amount_cents is null
  and published_at is not null from public.events where id = '61000000-0000-4000-8000-000000000001'), 'publication invents no facts or scores');
select throws_ok('select pg_temp.attempt_publish()', 'P0001', 'review_not_draft', 'repeated publication cannot overwrite a reviewed event');
select throws_ok($$update public.events set public_registration_url = 'https://luma.com/test?secret=private'
  where id = '61000000-0000-4000-8000-000000000001'$$, '23514', null, 'database also rejects noncanonical public URLs');

set local role anon;
select is((select public_registration_url from public.events where id = '61000000-0000-4000-8000-000000000001'),
  'https://luma.com/review-test', 'anonymous readers see only the approved canonical link');
select throws_ok('select * from public.event_publication_reviews', '42501', null, 'approval history stays private');
select throws_ok($$select public.get_event_review('61000000-0000-4000-8000-000000000001')$$, '42501', null, 'anonymous review RPC is denied');
select throws_ok($$select public.publish_reviewed_event('61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', repeat('a',64), true)$$, '42501', null, 'anonymous publication RPC is denied');
reset role;
set local role authenticated;
select throws_ok('select * from public.event_publication_reviews', '42501', null, 'ordinary authenticated users cannot see approval history');
select throws_ok($$select public.get_event_review('61000000-0000-4000-8000-000000000001')$$, '42501', null, 'ordinary authenticated review RPC is denied');
select throws_ok($$select public.publish_reviewed_event('61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', repeat('a',64), true)$$, '42501', null, 'ordinary authenticated publication RPC is denied');
reset role;
select * from finish();
rollback;
