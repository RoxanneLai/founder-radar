-- Only a canonical, reviewed listing URL crosses the public data boundary.
create function public.public_listing_url(p_url text)
returns text language plpgsql immutable strict security invoker
set search_path = ''
as $$
declare
  v_url text;
begin
  if length(p_url) > 2048 or p_url ~ '[[:space:][:cntrl:]\\]' then return null; end if;
  v_url := split_part(split_part(p_url, '#', 1), '?', 1);
  v_url := regexp_replace(v_url, '/+$', '');
  v_url := regexp_replace(v_url, '^https://www\.', 'https://');
  v_url := regexp_replace(v_url, '^https://lu\.ma/', 'https://luma.com/');
  if v_url ~ '^https://luma\.com/[A-Za-z0-9_-]+$'
    and v_url !~* '^https://luma\.com/(discover|explore|home|signin|login|pricing|calendar|create|nyc|new-york)$'
    or v_url ~ '^https://meetup\.com/[A-Za-z0-9_-]+/events/[0-9]+$'
    or v_url ~ '^https://eventbrite\.com/e/[A-Za-z0-9_-]*tickets-[0-9]+$'
  then return v_url; end if;
  return null;
end;
$$;

alter table public.events add column public_registration_url text;
alter table public.events add constraint events_public_registration_url_safe check (
  public_registration_url is null or (
    public.public_listing_url(public_registration_url) is not null
    and public_registration_url = public.public_listing_url(public_registration_url)
  )
);
comment on column public.events.public_registration_url is
  'Explicitly reviewed canonical listing URL; no private query parameters or evidence.';

create table public.event_publication_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  source_id uuid not null references public.event_sources(id),
  review_token text not null,
  review_snapshot jsonb not null,
  approved_at timestamptz not null default now(),
  approved_by_role text not null default current_user,
  constraint publication_review_token_format check (review_token ~ '^[a-f0-9]{64}$')
);
alter table public.event_publication_reviews enable row level security;
revoke all on public.event_publication_reviews from public, anon, authenticated;
grant select, insert on public.event_publication_reviews to service_role;

-- A single statement snapshot binds approval to the event, all linked evidence,
-- and the explicitly selected source. No review writes or paid calls occur here.
create function public.get_event_review(p_event_id uuid, p_source_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_event jsonb;
  v_sources jsonb;
  v_snapshot jsonb;
  v_url text;
begin
  select to_jsonb(e) into v_event from public.events e where e.id = p_event_id;
  if v_event is null then raise exception 'review_event_missing' using errcode = 'P0001'; end if;
  if (select count(*) from public.event_sources where event_id = p_event_id) > 25 then
    raise exception 'review_too_many_sources' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) into v_sources
    from public.event_sources s where s.event_id = p_event_id;
  select public.public_listing_url(s.source_url) into v_url from public.event_sources s
    where s.id = p_source_id and s.event_id = p_event_id;
  v_snapshot := jsonb_build_object('event', v_event, 'sources', v_sources,
    'selected_source_id', p_source_id, 'public_registration_url', v_url);
  return v_snapshot || jsonb_build_object('review_token',
    encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex'));
end;
$$;

create function public.publish_reviewed_event(
  p_event_id uuid, p_source_id uuid, p_review_token text, p_approved boolean default false
)
returns jsonb language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_source public.event_sources%rowtype;
  v_review jsonb;
  v_url text;
begin
  if p_approved is distinct from true then
    raise exception 'review_approval_required' using errcode = 'P0001';
  end if;
  -- Match ingestion's source-before-event lock order. Re-read after waiting.
  perform id from public.event_sources where event_id = p_event_id order by id for update;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'review_event_missing' using errcode = 'P0001'; end if;
  select * into v_source from public.event_sources where id = p_source_id and event_id = p_event_id;
  if not found then raise exception 'review_source_missing' using errcode = 'P0001'; end if;
  v_review := public.get_event_review(p_event_id, p_source_id);
  if p_review_token is null or p_review_token <> v_review->>'review_token' then
    raise exception 'review_stale' using errcode = 'P0001';
  end if;
  if v_event.publication_status <> 'draft' or v_event.is_fixture then
    raise exception 'review_not_draft' using errcode = 'P0001';
  end if;
  if v_event.city <> 'New York' or v_event.region <> 'NY' or v_event.country_code <> 'US'
    or v_event.time_zone <> 'America/New_York' or v_event.event_format not in ('in-person', 'hybrid')
    or v_event.registration_status = 'cancelled'
    or v_event.starts_at <= clock_timestamp() or v_event.starts_at >= clock_timestamp() + interval '30 days'
  then raise exception 'review_not_visible' using errcode = 'P0001'; end if;
  if nullif(btrim(v_source.content_text), '') is null or v_source.fetched_at is null
    or v_source.last_attempt_error is not null then
    raise exception 'review_evidence_required' using errcode = 'P0001';
  end if;
  v_url := v_review->>'public_registration_url';
  if v_url is null then raise exception 'review_link_invalid' using errcode = 'P0001'; end if;
  insert into public.event_publication_reviews(event_id, source_id, review_token, review_snapshot)
    values(p_event_id, p_source_id, p_review_token, v_review);
  update public.events set publication_status = 'published', published_at = clock_timestamp(),
    public_registration_url = v_url where id = p_event_id;
  return jsonb_build_object('event_id', p_event_id, 'publication_status', 'published',
    'public_registration_url', v_url);
end;
$$;

revoke all on function public.get_event_review(uuid, uuid) from public, anon, authenticated;
revoke all on function public.publish_reviewed_event(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.get_event_review(uuid, uuid) to service_role;
grant execute on function public.publish_reviewed_event(uuid, uuid, text, boolean) to service_role;
-- Pure URL validation contains no data; callers need it for the CHECK constraint.
grant execute on function public.public_listing_url(text) to anon, authenticated, service_role;
