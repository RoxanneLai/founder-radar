alter table public.event_sources
  add column last_attempt_at timestamptz,
  add column last_attempt_error text;

comment on column public.event_sources.last_attempt_error is
  'Safe diagnostic code for the last ingestion attempt; never raw provider errors or secrets.';

-- One transaction owns source identity, the draft event, and the link between them.
-- Invoker security plus an explicit grant keeps this outside the public API roles.
create function public.ingest_event_source(
  p_run_id uuid,
  p_source jsonb,
  p_event jsonb default null,
  p_observed_at timestamptz default now()
)
returns table (source_id uuid, event_id uuid, source_created boolean, event_written boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.event_sources%rowtype;
  v_event public.events%rowtype;
  v_url_id uuid;
  v_external_id uuid;
  v_created boolean := false;
  v_written boolean := false;
  v_name text := nullif(btrim(p_source->>'source_name'), '');
  v_url text := nullif(btrim(p_source->>'source_url'), '');
  v_external text := nullif(btrim(p_source->>'external_id'), '');
  v_error text := p_source->>'error_code';
begin
  if v_name is null or v_url is null or v_url !~ '^https://' or p_observed_at is null then
    raise exception 'Invalid source identity' using errcode = '22023';
  end if;
  if not exists (select 1 from public.search_runs where id = p_run_id and status = 'running') then
    raise exception 'An active search run is required' using errcode = '22023';
  end if;
  if v_error is not null and v_error !~ '^[a-z_]{1,80}$' then
    raise exception 'Invalid diagnostic code' using errcode = '22023';
  end if;
  if v_error is not null and p_event is not null then
    raise exception 'Failed observations cannot write events' using errcode = '22023';
  end if;

  -- Small manual runs trade throughput for safe URL/external-ID reconciliation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_name, 0));
  select id into v_url_id from public.event_sources
    where source_name = v_name and source_url = v_url;
  select id into v_external_id from public.event_sources
    where source_name = v_name and external_id = v_external;
  if v_url_id is not null and v_external_id is not null and v_url_id <> v_external_id then
    raise exception 'Conflicting source identities require review' using errcode = '23505';
  end if;
  select * into v_source from public.event_sources
    where id = coalesce(v_url_id, v_external_id) for update;
  if found and v_source.external_id is not null and v_external is not null
    and v_source.external_id <> v_external then
    raise exception 'External ID changed for an existing URL' using errcode = '23505';
  end if;
  if v_source.id is null then
    insert into public.event_sources (
      discovered_by_run_id, source_name, source_url, external_id, first_seen_at, last_seen_at
    ) values (p_run_id, v_name, v_url, v_external, p_observed_at, p_observed_at)
    returning * into v_source;
    v_created := true;
  elsif v_source.last_attempt_at > p_observed_at then
    -- An older concurrent run must not replace a newer observation or draft.
    return query select v_source.id, v_source.event_id, false, false;
    return;
  end if;

  update public.event_sources set
    source_url = v_url,
    external_id = coalesce(v_external, external_id),
    last_seen_at = greatest(last_seen_at, p_observed_at),
    last_attempt_at = p_observed_at,
    last_attempt_error = v_error
  where id = v_source.id;

  -- Discovery-only and failed observations preserve earlier successful evidence.
  if v_error is null and nullif(p_source->>'content_text', '') is not null then
    update public.event_sources set
      content_text = p_source->>'content_text',
      content_hash = p_source->>'content_hash',
      raw_payload = coalesce(p_source->'raw_payload', '{}'::jsonb),
      fetched_at = p_observed_at
    where id = v_source.id;
  end if;

  if p_event is not null then
    if v_error is not null or nullif(p_source->>'content_text', '') is null then
      raise exception 'Event requires successful evidence' using errcode = '22023';
    end if;
    if nullif(p_event->>'title', '') is null or p_event->>'starts_at' is null
      or p_event->>'time_zone' is null or p_event->>'city' is null
      or p_event->>'region' is null or p_event->>'country_code' is null
      or p_event->>'event_format' is null then
      raise exception 'Incomplete event core' using errcode = '22023';
    end if;
    select * into v_event from public.events where id = v_source.event_id for update;
    -- Never modify fixtures or promote, overwrite, or unarchive reviewed records.
    if v_event.id is null or (
      v_event.publication_status = 'draft' and not v_event.is_fixture
      and v_event.last_seen_at <= p_observed_at
    ) then
      insert into public.events (
        id, title, organizer_name, starts_at, ends_at, time_zone, venue_name, address_line,
        city, region, country_code, event_format, price_amount_cents, currency_code,
        registration_status, publication_status, is_fixture, first_seen_at, last_seen_at
      ) values (
        coalesce(v_event.id, gen_random_uuid()), p_event->>'title', p_event->>'organizer_name',
        (p_event->>'starts_at')::timestamptz, (p_event->>'ends_at')::timestamptz,
        p_event->>'time_zone', p_event->>'venue_name', p_event->>'address_line',
        p_event->>'city', p_event->>'region', p_event->>'country_code', p_event->>'event_format',
        (p_event->>'price_amount_cents')::integer, p_event->>'currency_code',
        coalesce(p_event->>'registration_status', 'unknown'), 'draft', false,
        coalesce(v_event.first_seen_at, v_source.first_seen_at),
        greatest(coalesce(v_event.last_seen_at, v_source.first_seen_at), p_observed_at)
      ) on conflict (id) do update set
        title = excluded.title, organizer_name = excluded.organizer_name,
        starts_at = excluded.starts_at, ends_at = excluded.ends_at, time_zone = excluded.time_zone,
        venue_name = excluded.venue_name, address_line = excluded.address_line,
        city = excluded.city, region = excluded.region, country_code = excluded.country_code,
        event_format = excluded.event_format, price_amount_cents = excluded.price_amount_cents,
        currency_code = excluded.currency_code, registration_status = excluded.registration_status,
        last_seen_at = excluded.last_seen_at
      returning * into v_event;
      update public.event_sources set event_id = v_event.id where id = v_source.id;
      v_source.event_id := v_event.id;
      v_written := true;
    end if;
  end if;
  return query select v_source.id, v_source.event_id, v_created, v_written;
end;
$$;

revoke all on function public.ingest_event_source(uuid, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ingest_event_source(uuid, jsonb, jsonb, timestamptz)
  to service_role;
