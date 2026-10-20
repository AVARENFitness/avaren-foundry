-- AVAREN calendar: transaction-safe, idempotent repeated ordinary events.
-- Apply before shipping the frontend that calls create_coach_calendar_event_batch.
alter table public.coach_calendar_events
  add column if not exists repeat_source_id uuid,
  add column if not exists repeat_occurrence_date date;

create unique index if not exists coach_calendar_repeat_occurrence_unique
  on public.coach_calendar_events (coach_id, repeat_source_id, repeat_occurrence_date)
  where repeat_source_id is not null and repeat_occurrence_date is not null;

create or replace function public.create_coach_calendar_event_batch(p_events jsonb)
returns setof public.coach_calendar_events
language plpgsql security invoker
set search_path = public
as $$
declare
  v_coach uuid := auth.uid();
  v_count integer;
  v_item jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_source uuid;
  v_day date;
  v_time time;
  v_duration integer;
  v_title text;
  v_existing public.coach_calendar_events%rowtype;
begin
  if v_coach is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(p_events) is distinct from 'array' then raise exception 'invalid_batch'; end if;
  v_count := jsonb_array_length(p_events);
  if v_count < 1 or v_count > 60 then raise exception 'invalid_batch_size'; end if;
  -- Serialize all coach calendar writes using the same lock in this RPC.
  perform pg_advisory_xact_lock(hashtextextended(v_coach::text, 0));
  create temporary table if not exists pg_temp.avaren_repeat_batch (
    source_id uuid, occurrence_date date, title text, event_date date,
    start_time time, duration_minutes integer, starts_at timestamptz, ends_at timestamptz,
    category text, notes text, location_name text, schedule_timezone text
  ) on commit drop;
  truncate pg_temp.avaren_repeat_batch;

  for v_item in select value from jsonb_array_elements(p_events)
  loop
    v_source := (v_item->>'repeatSourceId')::uuid;
    v_day := (v_item->>'eventDate')::date;
    v_time := (v_item->>'startTime')::time;
    v_duration := (v_item->>'durationMinutes')::integer;
    v_title := btrim(v_item->>'title');
    v_start := (v_item->>'startsAt')::timestamptz;
    v_end := v_start + make_interval(mins => v_duration);
    if v_source is null or v_day is null or v_time is null or v_duration not between 5 and 1440
       or v_start is null or v_title is null or v_title = '' or length(v_title) > 120
       or (v_start at time zone coalesce(nullif(v_item->>'scheduleTimezone',''),'America/New_York'))::date <> v_day
       or (v_start at time zone coalesce(nullif(v_item->>'scheduleTimezone',''),'America/New_York'))::time(0) <> v_time
    then raise exception 'invalid_event'; end if;
    if not exists(select 1 from public.coach_calendar_events where id = v_source and coach_id = v_coach and status = 'scheduled')
    then raise exception 'repeat_source_missing'; end if;

    insert into pg_temp.avaren_repeat_batch values
      (v_source,v_day,v_title,v_day,v_time,v_duration,v_start,v_end,
       coalesce(v_item->>'category','personal'),coalesce(v_item->>'notes',''),
       coalesce(v_item->>'locationName',''),coalesce(v_item->>'scheduleTimezone','America/New_York'));
  end loop;

  if exists (
    select 1 from pg_temp.avaren_repeat_batch
    group by source_id, occurrence_date having count(*) > 1
  ) then raise exception 'duplicate_occurrence_in_batch'; end if;

  if exists (
    select 1 from pg_temp.avaren_repeat_batch a join pg_temp.avaren_repeat_batch b
      on (a.source_id,a.occurrence_date) < (b.source_id,b.occurrence_date)
      and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)')
  ) then raise exception 'calendar_overlap_in_batch'; end if;

  if exists(
    select 1 from pg_temp.avaren_repeat_batch b
    join public.coach_calendar_events e on e.coach_id=v_coach and e.status='scheduled'
       and tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)')
    where (e.repeat_source_id,e.repeat_occurrence_date) is distinct from (b.source_id,b.occurrence_date)
  ) or exists(
    select 1 from pg_temp.avaren_repeat_batch b
    join public.coach_scheduled_sessions s on s.coach_id=v_coach and s.status='scheduled'
       and tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)')
  ) then raise exception 'calendar_overlap'; end if;

  if exists(
    select 1 from pg_temp.avaren_repeat_batch b
    join public.coach_calendar_events e on e.coach_id=v_coach and e.repeat_source_id=b.source_id
         and e.repeat_occurrence_date=b.occurrence_date
    where e.status <> 'scheduled' or e.event_date<>b.event_date or e.start_time<>b.start_time
       or e.duration_minutes<>b.duration_minutes or e.title<>b.title
       or e.starts_at is distinct from b.starts_at or e.ends_at is distinct from b.ends_at
       or e.notes is distinct from b.notes or e.category is distinct from b.category
       or e.location_name is distinct from b.location_name
  ) then raise exception 'repeat_retry_changed'; end if;

  insert into public.coach_calendar_events (
    coach_id,repeat_source_id,repeat_occurrence_date,title,event_date,start_time,
    duration_minutes,starts_at,ends_at,schedule_timezone,category,notes,location_name,status,updated_at
  )
  select v_coach,source_id,occurrence_date,title,event_date,start_time,duration_minutes,
    starts_at,ends_at,schedule_timezone,category,notes,location_name,'scheduled',now()
  from pg_temp.avaren_repeat_batch
  on conflict (coach_id,repeat_source_id,repeat_occurrence_date)
  where repeat_source_id is not null and repeat_occurrence_date is not null
  do nothing;

  return query select e.* from public.coach_calendar_events e
    join pg_temp.avaren_repeat_batch b on e.coach_id=v_coach and e.repeat_source_id=b.source_id
      and e.repeat_occurrence_date=b.occurrence_date;
end $$;
revoke all on function public.create_coach_calendar_event_batch(jsonb) from public;
grant execute on function public.create_coach_calendar_event_batch(jsonb) to authenticated;
