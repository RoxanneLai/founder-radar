-- Additive: existing data and all publication/review rules remain intact.
alter table public.events add column career_assessment jsonb;
alter table public.events add constraint career_assessment_object check (
  career_assessment is null or jsonb_typeof(career_assessment) = 'object'
);
comment on column public.events.career_assessment is
  'Validated display-only career ranking; raw career evidence stays in private event_sources.';

alter function public.ingest_event_source(uuid, jsonb, jsonb, timestamptz)
  rename to ingest_event_source_v1;

create function public.ingest_event_source(
  p_run_id uuid, p_source jsonb, p_event jsonb default null,
  p_observed_at timestamptz default now()
)
returns table (source_id uuid, event_id uuid, source_created boolean, event_written boolean)
language plpgsql security invoker set search_path = '' as $$
declare v_result record;
begin
  select * into v_result from public.ingest_event_source_v1(p_run_id, p_source, p_event, p_observed_at);
  if v_result.event_written then
    update public.events set career_assessment = nullif(p_event->'career_assessment', 'null'::jsonb)
      where id = v_result.event_id;
  end if;
  return query select v_result.source_id, v_result.event_id, v_result.source_created, v_result.event_written;
end;
$$;
revoke all on function public.ingest_event_source(uuid, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_event_source(uuid, jsonb, jsonb, timestamptz) to service_role;
