-- AVAREN 8.14B — Recurring Appointments (MIGRATION)
-- DO NOT RUN without explicit approval.
-- Canonical recurrence rule in coach_appointment_series.
-- Concrete occurrences remain coach_scheduled_sessions rows.

begin;

-- Section A: Recurrence series table

create table if not exists public.coach_appointment_series (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  business_client_id uuid not null references public.coach_business_clients(id) on delete restrict,
  athlete_id uuid references auth.users(id) on delete set null,
  schedule_timezone text not null default 'America/New_York',
  starts_on date not null,
  local_start_time time not null,
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  weekdays smallint[] not null check (array_length(weekdays, 1) >= 1),
  ends_on date,
  occurrence_limit integer check (occurrence_limit is null or occurrence_limit > 0),
  status text not null default 'active'
    check (status in ('active', 'ended', 'cancelled')),
  coach_note text not null default '',
  assignment_id uuid references public.coach_assignments(id) on delete set null,
  location_type text not null default 'default'
    check (location_type in ('default', 'avaren_gym', 'client_gym', 'other')),
  location_name text not null default '',
  appointment_type text not null default 'IN_PERSON_TRAINING'
    check (appointment_type in ('IN_PERSON_TRAINING', 'CONSULTATION', 'ASSESSMENT', 'CHECK_IN')),
  materialized_through date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_appointment_series_end_condition_check check (
    ends_on is not null or occurrence_limit is not null
  ),
  constraint coach_appointment_series_ends_on_order_check check (
    ends_on is null or ends_on >= starts_on
  ),
  constraint coach_appointment_series_weekdays_valid_check check (
    weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  constraint coach_appointment_series_starts_on_weekday_check check (
    extract(dow from starts_on)::smallint = any(weekdays)
  )
);

create index if not exists coach_appointment_series_coach_idx
  on public.coach_appointment_series (coach_id, status, starts_on);

create index if not exists coach_appointment_series_client_idx
  on public.coach_appointment_series (business_client_id, status);

alter table public.coach_appointment_series enable row level security;

drop policy if exists coach_appointment_series_coach_all
  on public.coach_appointment_series;
drop policy if exists coach_appointment_series_coach_select
  on public.coach_appointment_series;
create policy coach_appointment_series_coach_select
on public.coach_appointment_series
for select to authenticated
using (coach_id = auth.uid());

revoke all on public.coach_appointment_series
  from public, anon, authenticated;

grant select on public.coach_appointment_series
  to authenticated;

grant all on public.coach_appointment_series
  to service_role;

-- Section B: Extend concrete appointment rows

alter table public.coach_scheduled_sessions
  add column if not exists recurrence_series_id uuid
    references public.coach_appointment_series(id) on delete set null,
  add column if not exists recurrence_occurrence_date date,
  add column if not exists recurrence_exception boolean not null default false;

create unique index if not exists coach_scheduled_sessions_series_occurrence_unique
  on public.coach_scheduled_sessions (recurrence_series_id, recurrence_occurrence_date)
  where recurrence_series_id is not null
    and recurrence_occurrence_date is not null;

create index if not exists coach_scheduled_sessions_recurrence_series_idx
  on public.coach_scheduled_sessions (recurrence_series_id, session_date)
  where recurrence_series_id is not null;

comment on column public.coach_scheduled_sessions.recurrence_series_id is
  'Links a concrete occurrence to its recurrence series rule.';
comment on column public.coach_scheduled_sessions.recurrence_occurrence_date is
  'Local calendar date identity for a recurring occurrence (series_id + date is unique).';
comment on column public.coach_scheduled_sessions.recurrence_exception is
  'True when a single occurrence was intentionally detached/edited from the series rule.';

-- Section B.5: Explicit horizon conflict ledger (no silent recurrence gaps)

create table if not exists public.coach_appointment_series_conflicts (
  id uuid primary key default gen_random_uuid(),
  recurrence_series_id uuid not null
    references public.coach_appointment_series(id) on delete cascade,
  occurrence_date date not null,
  conflicting_session_id uuid
    references public.coach_scheduled_sessions(id) on delete set null,
  status text not null default 'unresolved'
    check (status in ('unresolved', 'resolved', 'waived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_appointment_series_conflicts_unique
    unique (recurrence_series_id, occurrence_date)
);

create index if not exists coach_appointment_series_conflicts_series_idx
  on public.coach_appointment_series_conflicts (recurrence_series_id, status, occurrence_date);

alter table public.coach_appointment_series_conflicts enable row level security;

drop policy if exists coach_appointment_series_conflicts_coach_select
  on public.coach_appointment_series_conflicts;
create policy coach_appointment_series_conflicts_coach_select
on public.coach_appointment_series_conflicts
for select to authenticated
using (
  exists (
    select 1
    from public.coach_appointment_series as s
    where s.id = recurrence_series_id
      and s.coach_id = auth.uid()
  )
);

revoke all on public.coach_appointment_series_conflicts
  from public, anon, authenticated;

grant select on public.coach_appointment_series_conflicts
  to authenticated;

grant all on public.coach_appointment_series_conflicts
  to service_role;

comment on table public.coach_appointment_series_conflicts is
  'Explicit recurrence dates that could not be materialized during horizon extension.';
comment on column public.coach_appointment_series_conflicts.status is
  'unresolved = blocked slot; resolved = materialized later; waived = past or coach-acknowledged skip (still consumes occurrence_limit).';

-- Section C: Extend notification types for series-level events

alter table public.coach_notifications
  drop constraint if exists coach_notifications_type_check;

alter table public.coach_notifications
  add constraint coach_notifications_type_check
  check (type in (
    'assignment-created',
    'assignment-due',
    'assignment-overdue',
    'assignment-completed',
    'coach-comment',
    'session-rsvp-confirmed',
    'session-rsvp-declined',
    'session-reminder',
    'appointment-scheduled',
    'appointment-rescheduled',
    'appointment-cancelled',
    'appointment-athlete-confirmed',
    'appointment-athlete-cannot-attend',
    'appointment-athlete-reminder-2h',
    'appointment-coach-reminder-2h',
    'appointment-series-created',
    'appointment-series-updated',
    'appointment-series-cancelled'
  ));

-- Section D: Bulk lifecycle suppression for materialization/reconciliation

create or replace function public.recurrence_bulk_lifecycle_suppressed()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('avaren.suppress_appointment_lifecycle', true), '') = 'true';
$$;

revoke all on function public.recurrence_bulk_lifecycle_suppressed() from public, anon, authenticated;
grant execute on function public.recurrence_bulk_lifecycle_suppressed() to service_role;

create or replace function public.set_recurrence_bulk_lifecycle_suppressed(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config(
    'avaren.suppress_appointment_lifecycle',
    case when p_enabled then 'true' else 'false' end,
    true
  );
end;
$$;

revoke all on function public.set_recurrence_bulk_lifecycle_suppressed(boolean) from public, anon;
grant execute on function public.set_recurrence_bulk_lifecycle_suppressed(boolean) to service_role;

-- Section D.5: Recurrence helpers (server-only)

create or replace function public.count_recurrence_series_occurrence_slots(
  p_series_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct slot.occurrence_date)::integer
  from (
    select s.recurrence_occurrence_date as occurrence_date
    from public.coach_scheduled_sessions as s
    where s.recurrence_series_id = p_series_id
      and s.recurrence_occurrence_date is not null
    union
    select c.occurrence_date
    from public.coach_appointment_series_conflicts as c
    where c.recurrence_series_id = p_series_id
  ) as slot;
$$;

revoke all on function public.count_recurrence_series_occurrence_slots(uuid)
  from public, anon, authenticated;
grant execute on function public.count_recurrence_series_occurrence_slots(uuid)
  to service_role;

create or replace function public.normalize_recurrence_weekdays(
  p_weekdays smallint[]
)
returns smallint[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array(
      select distinct w
      from unnest(coalesce(p_weekdays, array[]::smallint[])) as t(w)
      where w between 0 and 6
      order by w
    ),
    array[]::smallint[]
  );
$$;

revoke all on function public.normalize_recurrence_weekdays(smallint[])
  from public, anon, authenticated;
grant execute on function public.normalize_recurrence_weekdays(smallint[])
  to service_role;

create or replace function public.validate_recurrence_timezone(
  p_schedule_timezone text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
begin
  v_timezone := coalesce(nullif(trim(p_schedule_timezone), ''), 'America/New_York');

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as tz
    where tz.name = v_timezone
  ) then
    raise exception 'recurrence_invalid_timezone';
  end if;

  return v_timezone;
end;
$$;

revoke all on function public.validate_recurrence_timezone(text)
  from public, anon, authenticated;
grant execute on function public.validate_recurrence_timezone(text)
  to service_role;

create or replace function public.recurrence_occurrence_date_is_accounted_for(
  p_series_id uuid,
  p_occurrence_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_scheduled_sessions as s
    where s.recurrence_series_id = p_series_id
      and s.recurrence_occurrence_date = p_occurrence_date
  )
  or exists (
    select 1
    from public.coach_appointment_series_conflicts as c
    where c.recurrence_series_id = p_series_id
      and c.occurrence_date = p_occurrence_date
  );
$$;

revoke all on function public.recurrence_occurrence_date_is_accounted_for(uuid, date)
  from public, anon, authenticated;
grant execute on function public.recurrence_occurrence_date_is_accounted_for(uuid, date)
  to service_role;

create or replace function public.record_recurring_appointment_series_conflict(
  p_series_id uuid,
  p_occurrence_date date,
  p_conflicting_session_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted_id uuid;
begin
  insert into public.coach_appointment_series_conflicts (
    recurrence_series_id,
    occurrence_date,
    conflicting_session_id,
    status,
    updated_at
  )
  values (
    p_series_id,
    p_occurrence_date,
    p_conflicting_session_id,
    'unresolved',
    now()
  )
  on conflict on constraint coach_appointment_series_conflicts_unique do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    return true;
  end if;

  update public.coach_appointment_series_conflicts as c
  set
    conflicting_session_id = coalesce(
      p_conflicting_session_id,
      c.conflicting_session_id
    ),
    updated_at = now()
  where c.recurrence_series_id = p_series_id
    and c.occurrence_date = p_occurrence_date
    and c.status = 'unresolved';

  return false;
end;
$$;

revoke all on function public.record_recurring_appointment_series_conflict(uuid, date, uuid)
  from public, anon, authenticated;
grant execute on function public.record_recurring_appointment_series_conflict(uuid, date, uuid)
  to service_role;

create or replace function public.resolve_eligible_recurrence_conflicts(
  p_series_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series public.coach_appointment_series%rowtype;
  v_conflict record;
  v_materialized integer := 0;
  v_waived integer := 0;
  v_linked integer := 0;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_still_blocked boolean;
begin
  select *
  into v_series
  from public.coach_appointment_series as s
  where s.id = p_series_id
    and s.status = 'active';

  if not found then
    return jsonb_build_object(
      'materialized', 0,
      'waived', 0,
      'linked', 0
    );
  end if;

  perform public.set_recurrence_bulk_lifecycle_suppressed(true);

  for v_conflict in
    select c.*
    from public.coach_appointment_series_conflicts as c
    where c.recurrence_series_id = p_series_id
      and c.status = 'unresolved'
    order by c.occurrence_date asc
  loop
    if exists (
      select 1
      from public.coach_scheduled_sessions as s
      where s.recurrence_series_id = p_series_id
        and s.recurrence_occurrence_date = v_conflict.occurrence_date
    ) then
      update public.coach_appointment_series_conflicts as c
      set status = 'resolved', updated_at = now()
      where c.id = v_conflict.id;
      v_linked := v_linked + 1;
      continue;
    end if;

    v_starts_at := (
      (v_conflict.occurrence_date::text || ' ' || v_series.local_start_time::text)
      ::timestamp at time zone v_series.schedule_timezone
    );
    v_ends_at := v_starts_at + make_interval(mins => v_series.duration_minutes);

    if v_ends_at <= now() then
      update public.coach_appointment_series_conflicts as c
      set status = 'waived', updated_at = now()
      where c.id = v_conflict.id;
      v_waived := v_waived + 1;
      continue;
    end if;

    select exists (
      select 1
      from public.coach_scheduled_sessions as s
      where s.coach_id = v_series.coach_id
        and s.status = 'scheduled'
        and s.starts_at is not null
        and s.ends_at is not null
        and s.starts_at < v_ends_at
        and v_starts_at < s.ends_at
        and s.recurrence_series_id is distinct from v_series.id
    )
    into v_still_blocked;

    if v_still_blocked then
      continue;
    end if;

    begin
      insert into public.coach_scheduled_sessions (
        coach_id,
        athlete_id,
        business_client_id,
        session_date,
        start_time,
        starts_at,
        ends_at,
        schedule_timezone,
        duration_minutes,
        coach_note,
        assignment_id,
        location_type,
        location_name,
        appointment_type,
        status,
        recurrence_series_id,
        recurrence_occurrence_date,
        recurrence_exception,
        updated_at
      )
      values (
        v_series.coach_id,
        v_series.athlete_id,
        v_series.business_client_id,
        v_conflict.occurrence_date,
        v_series.local_start_time,
        v_starts_at,
        v_ends_at,
        v_series.schedule_timezone,
        v_series.duration_minutes,
        v_series.coach_note,
        v_series.assignment_id,
        v_series.location_type,
        v_series.location_name,
        v_series.appointment_type,
        'scheduled',
        v_series.id,
        v_conflict.occurrence_date,
        false,
        now()
      );

      update public.coach_appointment_series_conflicts as c
      set status = 'resolved', updated_at = now()
      where c.id = v_conflict.id;

      v_materialized := v_materialized + 1;
    exception
      when others then
        if sqlstate not in ('99001', '23P01') then
          raise;
        end if;
        null;
    end;
  end loop;

  perform public.set_recurrence_bulk_lifecycle_suppressed(false);

  return jsonb_build_object(
    'materialized', v_materialized,
    'waived', v_waived,
    'linked', v_linked
  );
exception
  when others then
    perform public.set_recurrence_bulk_lifecycle_suppressed(false);
    raise;
end;
$$;

revoke all on function public.resolve_eligible_recurrence_conflicts(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_eligible_recurrence_conflicts(uuid)
  to service_role;

-- Section E: Patch lifecycle trigger — suppress per-occurrence spam for series rows/bulk ops

create or replace function public.notify_appointment_lifecycle_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linked_user_id uuid;
  v_transition_identity text;
begin
  if public.recurrence_bulk_lifecycle_suppressed() then
    return new;
  end if;

  select bc.linked_user_id
  into v_linked_user_id
  from public.coach_business_clients as bc
  where bc.id = coalesce(new.business_client_id, old.business_client_id)
  limit 1;

  if tg_op = 'INSERT' then
    if v_linked_user_id is null or new.status <> 'scheduled' then
      return new;
    end if;

    -- Recurring materialization never emits appointment-scheduled per occurrence.
    if new.recurrence_series_id is not null then
      return new;
    end if;

    perform public.enqueue_appointment_notification(
      v_linked_user_id,
      'athlete',
      new.id,
      new.coach_id,
      'appointment-scheduled',
      'Training scheduled',
      concat(
        to_char(new.session_date, 'Dy, Mon DD'),
        ' · ',
        to_char(new.start_time, 'FMHH12:MI AM')
      ),
      'open-appointment-detail',
      jsonb_build_object(
        'scheduledSessionId', new.id,
        'startsAt', new.starts_at,
        'scheduleTimezone', new.schedule_timezone
      ),
      new.starts_at,
      null
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if v_linked_user_id is null then
      return new;
    end if;

    if new.status = 'cancelled'
       and coalesce(old.status, '') <> 'cancelled' then
      v_transition_identity := to_char(new.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF');

      perform public.enqueue_appointment_notification(
        v_linked_user_id,
        'athlete',
        new.id,
        new.coach_id,
        'appointment-cancelled',
        'Training cancelled',
        concat(
          to_char(coalesce(old.session_date, new.session_date), 'Dy, Mon DD'),
          ' · ',
          to_char(coalesce(old.start_time, new.start_time), 'FMHH12:MI AM')
        ),
        'open-appointment-detail',
        jsonb_build_object(
          'scheduledSessionId', new.id,
          'startsAt', coalesce(old.starts_at, new.starts_at),
          'scheduleTimezone', coalesce(old.schedule_timezone, new.schedule_timezone),
          'updatedAt', new.updated_at
        ),
        coalesce(old.starts_at, new.starts_at),
        v_transition_identity
      );
      return new;
    end if;

    if new.status = 'scheduled'
       and (
         new.starts_at is distinct from old.starts_at
         or new.schedule_timezone is distinct from old.schedule_timezone
         or new.session_date is distinct from old.session_date
         or new.start_time is distinct from old.start_time
       ) then
      v_transition_identity := to_char(new.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF');

      perform public.enqueue_appointment_notification(
        v_linked_user_id,
        'athlete',
        new.id,
        new.coach_id,
        'appointment-rescheduled',
        'Training rescheduled',
        concat(
          'Now ',
          to_char(new.session_date, 'Dy, Mon DD'),
          ' · ',
          to_char(new.start_time, 'FMHH12:MI AM')
        ),
        'open-appointment-detail',
        jsonb_build_object(
          'scheduledSessionId', new.id,
          'startsAt', new.starts_at,
          'scheduleTimezone', new.schedule_timezone,
          'updatedAt', new.updated_at
        ),
        new.starts_at,
        v_transition_identity
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_appointment_lifecycle_changes() from public, anon, authenticated;

-- Section F: Series delivery ledger column + deterministic dedupe

alter table public.appointment_notification_deliveries
  add column if not exists recurrence_series_id uuid
    references public.coach_appointment_series(id) on delete set null;

create index if not exists appointment_notification_deliveries_series_idx
  on public.appointment_notification_deliveries (recurrence_series_id, notification_type)
  where recurrence_series_id is not null;

create or replace function public.appointment_series_notification_dedupe_key(
  p_series_id uuid,
  p_notification_type text,
  p_transition_identity text default null
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_notification_type
    when 'appointment-series-created' then
      concat('series:', p_series_id::text, ':created')
    when 'appointment-series-updated' then
      concat(
        'series:',
        p_series_id::text,
        ':updated:',
        coalesce(nullif(trim(p_transition_identity), ''), 'initial')
      )
    when 'appointment-series-cancelled' then
      concat(
        'series:',
        p_series_id::text,
        ':cancelled:',
        coalesce(nullif(trim(p_transition_identity), ''), 'initial')
      )
    else
      concat(
        'series:',
        p_series_id::text,
        ':',
        p_notification_type,
        ':',
        coalesce(nullif(trim(p_transition_identity), ''), 'initial')
      )
  end;
$$;

revoke all on function public.appointment_series_notification_dedupe_key(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.appointment_series_notification_dedupe_key(uuid, text, text)
  to service_role;

-- Series notification enqueue — athlete-only, ledger + in-app center, one per series event

create or replace function public.enqueue_appointment_series_notification(
  p_series_id uuid,
  p_recipient_user_id uuid,
  p_actor_id uuid,
  p_notification_type text,
  p_title text,
  p_body text,
  p_anchor_appointment_id uuid,
  p_transition_identity text default null,
  p_canonical_start_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dedupe_key text;
  v_notification_id uuid;
  v_delivery_id uuid;
begin
  if p_recipient_user_id is null or p_anchor_appointment_id is null then
    return null;
  end if;

  -- Coach never receives creation/update/cancel push caused by their own action.
  if p_recipient_user_id = p_actor_id then
    return null;
  end if;

  v_dedupe_key := public.appointment_series_notification_dedupe_key(
    p_series_id,
    p_notification_type,
    p_transition_identity
  );

  insert into public.appointment_notification_deliveries (
    recipient_user_id,
    recipient_role,
    appointment_id,
    recurrence_series_id,
    notification_type,
    canonical_start_at,
    dedupe_key,
    delivery_status,
    scheduled_for
  )
  values (
    p_recipient_user_id,
    'athlete',
    p_anchor_appointment_id,
    p_series_id,
    p_notification_type,
    p_canonical_start_at,
    v_dedupe_key,
    'pending',
    now()
  )
  on conflict on constraint appointment_notification_deliveries_dedupe_key_unique do nothing
  returning id into v_delivery_id;

  if v_delivery_id is null then
    return null;
  end if;

  insert into public.coach_notifications (
    recipient_id,
    actor_id,
    scheduled_session_id,
    type,
    title,
    body,
    action,
    payload,
    dedupe_key
  )
  values (
    p_recipient_user_id,
    p_actor_id,
    p_anchor_appointment_id,
    p_notification_type,
    p_title,
    p_body,
    'open-athlete-schedule',
    jsonb_build_object(
      'recurrenceSeriesId', p_series_id,
      'openTarget', 'athlete-schedule'
    ),
    v_dedupe_key
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_notification_id;

  if v_notification_id is null then
    update public.appointment_notification_deliveries as d
    set delivery_status = 'skipped',
        updated_at = now()
    where d.id = v_delivery_id;
    return null;
  end if;

  update public.appointment_notification_deliveries as d
  set coach_notification_id = v_notification_id,
      updated_at = now()
  where d.id = v_delivery_id;

  return v_notification_id;
end;
$$;

revoke all on function public.enqueue_appointment_series_notification(uuid, uuid, uuid, text, text, text, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.enqueue_appointment_series_notification(uuid, uuid, uuid, text, text, text, uuid, text, timestamptz)
  to service_role;

-- Section G.1: Stable overlap discriminator for recurrence materialization

create or replace function public.coach_scheduled_sessions_overlap_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_conflict uuid;
begin
  if new.status <> 'scheduled' then
    return new;
  end if;

  v_new_start := new.starts_at;
  v_new_end := new.ends_at;

  if v_new_start is null or v_new_end is null then
    return new;
  end if;

  select s.id
  into v_conflict
  from public.coach_scheduled_sessions as s
  where s.coach_id = new.coach_id
    and s.status = 'scheduled'
    and s.id is distinct from new.id
    and s.starts_at is not null
    and s.ends_at is not null
    and s.starts_at < v_new_end
    and v_new_start < s.ends_at
  limit 1;

  if v_conflict is not null then
    raise exception 'appointment_overlap'
      using errcode = '99001';
  end if;

  return new;
end;
$$;

revoke all on function public.coach_scheduled_sessions_overlap_guard() from public, anon, authenticated;

drop trigger if exists coach_scheduled_sessions_overlap_guard
  on public.coach_scheduled_sessions;

create trigger coach_scheduled_sessions_overlap_guard
before insert or update of
  coach_id,
  starts_at,
  ends_at,
  duration_minutes,
  status,
  session_date,
  start_time,
  schedule_timezone
on public.coach_scheduled_sessions
for each row
execute function public.coach_scheduled_sessions_overlap_guard();

-- Section G.1.b: Concurrency-safe coach schedule overlap (btree_gist exclusion)

create extension if not exists btree_gist;

alter table public.coach_scheduled_sessions
  drop constraint if exists coach_scheduled_sessions_no_overlap;

alter table public.coach_scheduled_sessions
  add constraint coach_scheduled_sessions_no_overlap
  exclude using gist (
    coach_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (
    status = 'scheduled'
    and starts_at is not null
    and ends_at is not null
  );

comment on constraint coach_scheduled_sessions_no_overlap
  on public.coach_scheduled_sessions is
  'Race-proof overlap guard for scheduled appointments. Half-open [starts_at, ends_at) ranges; back-to-back allowed.';

create or replace function public.materialize_recurring_appointment_series(
  p_series_id uuid,
  p_horizon_weeks integer default 12,
  p_isolate_conflicts boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series public.coach_appointment_series%rowtype;
  v_coach_id uuid := auth.uid();
  v_end_date date;
  v_horizon_end date;
  v_cursor date;
  v_created integer := 0;
  v_conflicts integer := 0;
  v_occurrence_slots integer := 0;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_conflicting_session_id uuid;
  v_conflict_recorded boolean;
begin
  select *
  into v_series
  from public.coach_appointment_series as s
  where s.id = p_series_id
    and s.coach_id = coalesce(v_coach_id, s.coach_id)
    and s.status = 'active'
  for update;

  if not found then
    raise exception 'series_not_found';
  end if;

  v_horizon_end := greatest(current_date, v_series.starts_on)
    + make_interval(days => p_horizon_weeks * 7);
  v_end_date := coalesce(v_series.ends_on, v_horizon_end);
  if v_end_date > v_horizon_end then
    v_end_date := v_horizon_end;
  end if;

  if v_series.materialized_through is null then
    v_cursor := v_series.starts_on;
  else
    v_cursor := v_series.materialized_through + 1;
  end if;

  if v_cursor > v_end_date then
    return jsonb_build_object('created', 0, 'conflicts', 0, 'failed', 0);
  end if;

  v_occurrence_slots := public.count_recurrence_series_occurrence_slots(v_series.id);

  perform public.set_recurrence_bulk_lifecycle_suppressed(true);

  while v_cursor <= v_end_date loop
    if extract(dow from v_cursor)::smallint = any(v_series.weekdays) then
      if v_series.occurrence_limit is not null
         and v_occurrence_slots >= v_series.occurrence_limit then
        exit;
      end if;

      if not public.recurrence_occurrence_date_is_accounted_for(v_series.id, v_cursor) then
        v_starts_at := (
          (v_cursor::text || ' ' || v_series.local_start_time::text)
          ::timestamp at time zone v_series.schedule_timezone
        );
        v_ends_at := v_starts_at + make_interval(mins => v_series.duration_minutes);

        if p_isolate_conflicts then
          begin
            insert into public.coach_scheduled_sessions (
              coach_id,
              athlete_id,
              business_client_id,
              session_date,
              start_time,
              starts_at,
              ends_at,
              schedule_timezone,
              duration_minutes,
              coach_note,
              assignment_id,
              location_type,
              location_name,
              appointment_type,
              status,
              recurrence_series_id,
              recurrence_occurrence_date,
              recurrence_exception,
              updated_at
            )
            values (
              v_series.coach_id,
              v_series.athlete_id,
              v_series.business_client_id,
              v_cursor,
              v_series.local_start_time,
              v_starts_at,
              v_starts_at + make_interval(mins => v_series.duration_minutes),
              v_series.schedule_timezone,
              v_series.duration_minutes,
              v_series.coach_note,
              v_series.assignment_id,
              v_series.location_type,
              v_series.location_name,
              v_series.appointment_type,
              'scheduled',
              v_series.id,
              v_cursor,
              false,
              now()
            );

            v_created := v_created + 1;
            v_occurrence_slots := v_occurrence_slots + 1;
          exception
            when others then
              if sqlstate not in ('99001', '23P01') then
                perform public.set_recurrence_bulk_lifecycle_suppressed(false);
                raise;
              end if;

              select s.id
              into v_conflicting_session_id
              from public.coach_scheduled_sessions as s
              where s.coach_id = v_series.coach_id
                and s.status = 'scheduled'
                and s.starts_at is not null
                and s.ends_at is not null
                and s.starts_at < v_ends_at
                and v_starts_at < s.ends_at
                and s.recurrence_series_id is distinct from v_series.id
              limit 1;

              v_conflict_recorded := public.record_recurring_appointment_series_conflict(
                v_series.id,
                v_cursor,
                v_conflicting_session_id
              );

              if v_conflict_recorded then
                v_conflicts := v_conflicts + 1;
                v_occurrence_slots := v_occurrence_slots + 1;
              end if;
          end;
        else
          insert into public.coach_scheduled_sessions (
            coach_id,
            athlete_id,
            business_client_id,
            session_date,
            start_time,
            starts_at,
            ends_at,
            schedule_timezone,
            duration_minutes,
            coach_note,
            assignment_id,
            location_type,
            location_name,
            appointment_type,
            status,
            recurrence_series_id,
            recurrence_occurrence_date,
            recurrence_exception,
            updated_at
          )
          values (
            v_series.coach_id,
            v_series.athlete_id,
            v_series.business_client_id,
            v_cursor,
            v_series.local_start_time,
            v_starts_at,
            v_starts_at + make_interval(mins => v_series.duration_minutes),
            v_series.schedule_timezone,
            v_series.duration_minutes,
            v_series.coach_note,
            v_series.assignment_id,
            v_series.location_type,
            v_series.location_name,
            v_series.appointment_type,
            'scheduled',
            v_series.id,
            v_cursor,
            false,
            now()
          );

          v_created := v_created + 1;
          v_occurrence_slots := v_occurrence_slots + 1;
        end if;
      end if;
    end if;

    v_cursor := v_cursor + 1;
  end loop;

  update public.coach_appointment_series
  set materialized_through = v_end_date,
      updated_at = now()
  where id = v_series.id;

  perform public.set_recurrence_bulk_lifecycle_suppressed(false);

  return jsonb_build_object(
    'created', v_created,
    'conflicts', v_conflicts,
    'failed', 0,
    'materializedThrough', v_end_date
  );
exception
  when others then
    perform public.set_recurrence_bulk_lifecycle_suppressed(false);
    raise;
end;
$$;

revoke all on function public.materialize_recurring_appointment_series(uuid, integer, boolean) from public, anon;
grant execute on function public.materialize_recurring_appointment_series(uuid, integer, boolean) to authenticated, service_role;

-- Section H: Edit/cancel scoped RPCs (occurrence-level)

create or replace function public.update_recurring_appointment_occurrence(
  p_session_id uuid,
  p_session_date date,
  p_start_time time,
  p_duration_minutes integer default null
)
returns public.coach_scheduled_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions%rowtype;
  v_starts_at timestamptz;
begin
  select *
  into v_session
  from public.coach_scheduled_sessions as s
  where s.id = p_session_id
    and s.coach_id = v_coach_id
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  v_starts_at := (
    (p_session_date::text || ' ' || p_start_time::text)
    ::timestamp at time zone v_session.schedule_timezone
  );

  update public.coach_scheduled_sessions as s
  set
    session_date = p_session_date,
    start_time = p_start_time,
    starts_at = v_starts_at,
    ends_at = v_starts_at + make_interval(mins => coalesce(p_duration_minutes, s.duration_minutes)),
    duration_minutes = coalesce(p_duration_minutes, s.duration_minutes),
    recurrence_exception = case when s.recurrence_series_id is not null then true else s.recurrence_exception end,
    updated_at = now()
  where s.id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.cancel_recurring_appointment_occurrence(
  p_session_id uuid
)
returns public.coach_scheduled_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions%rowtype;
begin
  update public.coach_scheduled_sessions as s
  set status = 'cancelled', updated_at = now()
  where s.id = p_session_id
    and s.coach_id = v_coach_id
  returning * into v_session;

  if not found then
    raise exception 'session_not_found';
  end if;

  return v_session;
end;
$$;

revoke all on function public.update_recurring_appointment_occurrence(uuid, date, time, integer) from public, anon;
grant execute on function public.update_recurring_appointment_occurrence(uuid, date, time, integer) to authenticated;

revoke all on function public.cancel_recurring_appointment_occurrence(uuid) from public, anon;
grant execute on function public.cancel_recurring_appointment_occurrence(uuid) to authenticated;

-- Section I: Conflict preflight + atomic create/update + daily horizon extension

create or replace function public.preflight_recurring_appointment_conflicts(
  p_starts_on date,
  p_local_start_time time,
  p_duration_minutes integer,
  p_weekdays smallint[],
  p_schedule_timezone text,
  p_ends_on date default null,
  p_occurrence_limit integer default null,
  p_horizon_weeks integer default 12,
  p_effective_from_date date default null,
  p_exclude_series_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_cursor date;
  v_horizon_end date;
  v_end_date date;
  v_occurrence_slots integer := 0;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_conflicts jsonb := '[]'::jsonb;
  v_conflict record;
  v_from date;
  v_weekdays smallint[];
begin
  if v_coach_id is null then
    raise exception 'not_authenticated';
  end if;

  v_weekdays := public.normalize_recurrence_weekdays(p_weekdays);
  if array_length(v_weekdays, 1) is null then
    raise exception 'recurrence_invalid_weekdays';
  end if;

  v_from := coalesce(p_effective_from_date, p_starts_on);
  v_horizon_end := greatest(current_date, p_starts_on)
    + make_interval(days => p_horizon_weeks * 7);
  v_end_date := coalesce(p_ends_on, v_horizon_end);
  if v_end_date > v_horizon_end then
    v_end_date := v_horizon_end;
  end if;

  if p_exclude_series_id is not null then
    select count(distinct slot.occurrence_date)
    into v_occurrence_slots
    from (
      select s.recurrence_occurrence_date as occurrence_date
      from public.coach_scheduled_sessions as s
      where s.recurrence_series_id = p_exclude_series_id
        and s.recurrence_occurrence_date is not null
        and s.recurrence_occurrence_date < v_from
      union
      select c.occurrence_date
      from public.coach_appointment_series_conflicts as c
      where c.recurrence_series_id = p_exclude_series_id
        and c.occurrence_date < v_from
    ) as slot;
  end if;

  v_cursor := v_from;
  while v_cursor <= v_end_date loop
    if extract(dow from v_cursor)::smallint = any(v_weekdays) then
      v_occurrence_slots := v_occurrence_slots + 1;
      if p_occurrence_limit is not null and v_occurrence_slots > p_occurrence_limit then
        exit;
      end if;

      v_starts_at := (
        (v_cursor::text || ' ' || p_local_start_time::text)
        ::timestamp at time zone p_schedule_timezone
      );
      v_ends_at := v_starts_at + make_interval(mins => p_duration_minutes);

      select
        s.id,
        s.session_date,
        s.start_time,
        coalesce(
          nullif(trim(bc.preferred_name), ''),
          nullif(trim(bc.display_name), ''),
          'Another client'
        ) as client_name
      into v_conflict
      from public.coach_scheduled_sessions as s
      join public.coach_business_clients as bc
        on bc.id = s.business_client_id
      where s.coach_id = v_coach_id
        and s.status = 'scheduled'
        and s.starts_at is not null
        and s.ends_at is not null
        and s.starts_at < v_ends_at
        and v_starts_at < s.ends_at
        and (
          p_exclude_series_id is null
          or s.recurrence_series_id is distinct from p_exclude_series_id
        )
      limit 1;

      if found then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'occurrenceDate', v_cursor,
          'startTime', p_local_start_time,
          'conflictingSessionId', v_conflict.id,
          'conflictingClientName', v_conflict.client_name
        ));
      end if;
    end if;

    v_cursor := v_cursor + 1;
  end loop;

  return jsonb_build_object(
    'hasConflicts', jsonb_array_length(v_conflicts) > 0,
    'conflicts', v_conflicts
  );
end;
$$;

revoke all on function public.preflight_recurring_appointment_conflicts(date, time, integer, smallint[], text, date, integer, integer, date, uuid)
  from public, anon;
grant execute on function public.preflight_recurring_appointment_conflicts(date, time, integer, smallint[], text, date, integer, integer, date, uuid)
  to authenticated;

create or replace function public.extend_recurring_appointment_horizons(
  p_horizon_weeks integer default 12,
  p_extension_threshold_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series record;
  v_target date;
  v_extended integer := 0;
  v_created_total integer := 0;
  v_conflicted integer := 0;
  v_failed integer := 0;
  v_result jsonb;
  v_resolve_result jsonb;
  v_conflicted_series_ids jsonb := '[]'::jsonb;
  v_failed_series_ids jsonb := '[]'::jsonb;
  v_occurrence_slots integer;
  v_needs_horizon boolean;
  v_series_conflict_checked integer := 0;
  v_conflicts_materialized integer := 0;
  v_conflicts_waived integer := 0;
  v_conflicts_linked integer := 0;
  v_conflicts_remaining integer := 0;
begin
  v_target := current_date
    + make_interval(days => (p_horizon_weeks * 7) - p_extension_threshold_days);

  for v_series in
    select s.*
    from public.coach_appointment_series as s
    where s.status = 'active'
      and (s.ends_on is null or s.ends_on >= current_date)
      and (
        s.materialized_through is null
        or s.materialized_through < v_target
        or exists (
          select 1
          from public.coach_appointment_series_conflicts as c
          where c.recurrence_series_id = s.id
            and c.status = 'unresolved'
        )
      )
  loop
    begin
      v_series_conflict_checked := v_series_conflict_checked + 1;
      v_needs_horizon := (
        v_series.materialized_through is null
        or v_series.materialized_through < v_target
      );

      v_resolve_result := public.resolve_eligible_recurrence_conflicts(v_series.id);
      v_conflicts_materialized := v_conflicts_materialized
        + coalesce((v_resolve_result->>'materialized')::integer, 0);
      v_conflicts_waived := v_conflicts_waived
        + coalesce((v_resolve_result->>'waived')::integer, 0);
      v_conflicts_linked := v_conflicts_linked
        + coalesce((v_resolve_result->>'linked')::integer, 0);

      if v_series.occurrence_limit is not null then
        v_occurrence_slots := public.count_recurrence_series_occurrence_slots(v_series.id);
        if v_occurrence_slots >= v_series.occurrence_limit then
          continue;
        end if;
      end if;

      if not v_needs_horizon then
        continue;
      end if;

      v_result := public.materialize_recurring_appointment_series(
        v_series.id,
        p_horizon_weeks,
        true
      );

      v_extended := v_extended + 1;
      v_created_total := v_created_total + coalesce((v_result->>'created')::integer, 0);

      if coalesce((v_result->>'conflicts')::integer, 0) > 0 then
        v_conflicted := v_conflicted + 1;
        v_conflicted_series_ids := v_conflicted_series_ids
          || to_jsonb(v_series.id::text);
      end if;
    exception
      when others then
        v_failed := v_failed + 1;
        v_failed_series_ids := v_failed_series_ids || to_jsonb(v_series.id::text);
    end;
  end loop;

  select count(*)
  into v_conflicts_remaining
  from public.coach_appointment_series_conflicts as c
  where c.status = 'unresolved';

  return jsonb_build_object(
    'seriesExtended', v_extended,
    'seriesConflictChecked', v_series_conflict_checked,
    'occurrencesCreated', v_created_total,
    'seriesConflicted', v_conflicted,
    'seriesFailed', v_failed,
    'conflictsResolved', v_conflicts_materialized + v_conflicts_waived + v_conflicts_linked,
    'conflictsMaterialized', v_conflicts_materialized,
    'conflictsWaived', v_conflicts_waived,
    'conflictsLinked', v_conflicts_linked,
    'conflictsRemaining', v_conflicts_remaining,
    'conflictedSeriesIds', v_conflicted_series_ids,
    'failedSeriesIds', v_failed_series_ids
  );
end;
$$;

revoke all on function public.extend_recurring_appointment_horizons(integer, integer) from public, anon, authenticated;
grant execute on function public.extend_recurring_appointment_horizons(integer, integer) to service_role;

-- Atomic create: preflight before any writes

create or replace function public.create_recurring_appointment_series(
  p_business_client_id uuid,
  p_starts_on date,
  p_local_start_time time,
  p_duration_minutes integer,
  p_weekdays smallint[],
  p_ends_on date default null,
  p_occurrence_limit integer default null,
  p_schedule_timezone text default 'America/New_York',
  p_coach_note text default '',
  p_assignment_id uuid default null,
  p_location_type text default 'default',
  p_location_name text default '',
  p_appointment_type text default 'IN_PERSON_TRAINING'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_client public.coach_business_clients%rowtype;
  v_series_id uuid;
  v_anchor_appointment_id uuid;
  v_created integer;
  v_weekday_labels text;
  v_preflight jsonb;
  v_timezone text;
  v_weekdays smallint[];
  v_materialize jsonb;
begin
  if v_coach_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_client
  from public.coach_business_clients as bc
  where bc.id = p_business_client_id
    and bc.coach_id = v_coach_id;

  if not found then
    raise exception 'business_client_not_found';
  end if;

  if p_ends_on is null and p_occurrence_limit is null then
    raise exception 'recurrence_end_required';
  end if;

  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'recurrence_invalid_end_date';
  end if;

  v_weekdays := public.normalize_recurrence_weekdays(p_weekdays);
  if array_length(v_weekdays, 1) is null then
    raise exception 'recurrence_invalid_weekdays';
  end if;

  if not (extract(dow from p_starts_on)::smallint = any(v_weekdays)) then
    raise exception 'recurrence_starts_on_weekday_mismatch';
  end if;

  v_timezone := public.validate_recurrence_timezone(p_schedule_timezone);

  if p_assignment_id is not null then
    if v_client.linked_user_id is null then
      raise exception 'appointment_invalid_assignment';
    end if;

    if not exists (
      select 1
      from public.coach_assignments as ca
      where ca.id = p_assignment_id
        and ca.coach_id = v_coach_id
        and ca.athlete_id = v_client.linked_user_id
    ) then
      raise exception 'appointment_invalid_assignment';
    end if;
  end if;

  v_preflight := public.preflight_recurring_appointment_conflicts(
    p_starts_on,
    p_local_start_time,
    p_duration_minutes,
    v_weekdays,
    v_timezone,
    p_ends_on,
    p_occurrence_limit,
    12,
    p_starts_on,
    null
  );

  if coalesce((v_preflight->>'hasConflicts')::boolean, false) then
    raise exception 'recurrence_conflict' using detail = v_preflight::text;
  end if;

  insert into public.coach_appointment_series (
    coach_id,
    business_client_id,
    athlete_id,
    schedule_timezone,
    starts_on,
    local_start_time,
    duration_minutes,
    weekdays,
    ends_on,
    occurrence_limit,
    coach_note,
    assignment_id,
    location_type,
    location_name,
    appointment_type
  )
  values (
    v_coach_id,
    v_client.id,
    v_client.linked_user_id,
    v_timezone,
    p_starts_on,
    p_local_start_time,
    p_duration_minutes,
    v_weekdays,
    p_ends_on,
    p_occurrence_limit,
    coalesce(p_coach_note, ''),
    p_assignment_id,
    coalesce(p_location_type, 'default'),
    coalesce(p_location_name, ''),
    coalesce(p_appointment_type, 'IN_PERSON_TRAINING')
  )
  returning id into v_series_id;

  v_materialize := public.materialize_recurring_appointment_series(v_series_id, 12, false);
  v_created := coalesce((v_materialize->>'created')::integer, 0);

  if coalesce((v_materialize->>'conflicts')::integer, 0) > 0 then
    raise exception 'recurrence_conflict';
  end if;

  select s.id
  into v_anchor_appointment_id
  from public.coach_scheduled_sessions as s
  where s.recurrence_series_id = v_series_id
  order by s.session_date asc, s.start_time asc
  limit 1;

  if v_client.linked_user_id is not null and v_anchor_appointment_id is not null then
    select string_agg(label, ', ' order by ord)
    into v_weekday_labels
    from (
      select distinct
        case w
          when 0 then 'Sun'
          when 1 then 'Mon'
          when 2 then 'Tue'
          when 3 then 'Wed'
          when 4 then 'Thu'
          when 5 then 'Fri'
          when 6 then 'Sat'
        end as label,
        w as ord
      from unnest(v_weekdays) as t(w)
    ) as labels;

    perform public.enqueue_appointment_series_notification(
      v_series_id,
      v_client.linked_user_id,
      v_coach_id,
      'appointment-series-created',
      'Recurring appointments scheduled',
      concat(v_weekday_labels, ' at ', to_char(p_local_start_time, 'FMHH12:MI AM')),
      v_anchor_appointment_id,
      null
    );
  end if;

  return jsonb_build_object(
    'seriesId', v_series_id,
    'materializedCount', v_created,
    'anchorAppointmentId', v_anchor_appointment_id
  );
end;
$$;

-- Atomic this-and-future update: time/duration only; effective boundary from anchor session

create or replace function public.update_recurring_appointment_series_future(
  p_session_id uuid,
  p_start_time time,
  p_duration_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions%rowtype;
  v_series public.coach_appointment_series%rowtype;
  v_linked_user_id uuid;
  v_anchor_appointment_id uuid;
  v_transition text;
  v_preflight jsonb;
  v_weekday_labels text;
  v_duration integer;
  v_effective_date date;
begin
  select *
  into v_session
  from public.coach_scheduled_sessions as s
  where s.id = p_session_id
    and s.coach_id = v_coach_id
  for update;

  if not found or v_session.recurrence_series_id is null then
    raise exception 'session_not_found';
  end if;

  select *
  into v_series
  from public.coach_appointment_series as s
  where s.id = v_session.recurrence_series_id
    and s.coach_id = v_coach_id
  for update;

  v_effective_date := v_session.session_date;
  v_duration := coalesce(p_duration_minutes, v_series.duration_minutes);

  v_preflight := public.preflight_recurring_appointment_conflicts(
    v_series.starts_on,
    p_start_time,
    v_duration,
    v_series.weekdays,
    v_series.schedule_timezone,
    v_series.ends_on,
    v_series.occurrence_limit,
    12,
    v_effective_date,
    v_series.id
  );

  if coalesce((v_preflight->>'hasConflicts')::boolean, false) then
    raise exception 'recurrence_conflict' using detail = v_preflight::text;
  end if;

  perform public.set_recurrence_bulk_lifecycle_suppressed(true);

  update public.coach_appointment_series
  set
    local_start_time = p_start_time,
    duration_minutes = v_duration,
    updated_at = now()
  where id = v_series.id;

  update public.coach_scheduled_sessions as s
  set
    start_time = p_start_time,
    duration_minutes = v_duration,
    starts_at = (
      (s.session_date::text || ' ' || p_start_time::text)
      ::timestamp at time zone s.schedule_timezone
    ),
    ends_at = (
      (s.session_date::text || ' ' || p_start_time::text)
      ::timestamp at time zone s.schedule_timezone
    ) + make_interval(mins => v_duration),
    updated_at = now()
  where s.recurrence_series_id = v_series.id
    and s.session_date >= v_effective_date
    and s.status = 'scheduled'
    and s.recurrence_exception = false;

  perform public.set_recurrence_bulk_lifecycle_suppressed(false);

  select bc.linked_user_id
  into v_linked_user_id
  from public.coach_business_clients as bc
  where bc.id = v_series.business_client_id;

  select s.id
  into v_anchor_appointment_id
  from public.coach_scheduled_sessions as s
  where s.recurrence_series_id = v_series.id
    and s.session_date >= v_effective_date
  order by s.session_date asc
  limit 1;

  v_transition := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.USOF');

  if v_linked_user_id is not null and v_anchor_appointment_id is not null then
    select string_agg(label, ', ' order by ord)
    into v_weekday_labels
    from (
      select distinct
        case w
          when 0 then 'Sun'
          when 1 then 'Mon'
          when 2 then 'Tue'
          when 3 then 'Wed'
          when 4 then 'Thu'
          when 5 then 'Fri'
          when 6 then 'Sat'
        end as label,
        w as ord
      from unnest(v_series.weekdays) as t(w)
    ) as labels;

    perform public.enqueue_appointment_series_notification(
      v_series.id,
      v_linked_user_id,
      v_coach_id,
      'appointment-series-updated',
      'Recurring schedule updated',
      concat(
        'Starting ',
        to_char(v_effective_date, 'Mon DD'),
        ' · ',
        v_weekday_labels,
        ' at ',
        to_char(p_start_time, 'FMHH12:MI AM')
      ),
      v_anchor_appointment_id,
      v_transition
    );
  end if;

  return jsonb_build_object(
    'seriesId', v_series.id,
    'effectiveDate', v_effective_date
  );
end;
$$;

-- Cancellation dedupe uses effective date identity

create or replace function public.cancel_recurring_appointment_series_future(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions%rowtype;
  v_series_id uuid;
  v_anchor uuid;
begin
  select *
  into v_session
  from public.coach_scheduled_sessions as s
  where s.id = p_session_id
    and s.coach_id = v_coach_id
  for update;

  if not found or v_session.recurrence_series_id is null then
    raise exception 'session_not_found';
  end if;

  v_series_id := v_session.recurrence_series_id;

  perform public.set_recurrence_bulk_lifecycle_suppressed(true);

  update public.coach_scheduled_sessions as s
  set status = 'cancelled', updated_at = now()
  where s.recurrence_series_id = v_series_id
    and s.session_date >= v_session.session_date
    and s.status = 'scheduled';

  update public.coach_appointment_series
  set status = 'cancelled', updated_at = now()
  where id = v_series_id
    and coach_id = v_coach_id;

  perform public.set_recurrence_bulk_lifecycle_suppressed(false);

  select s.id
  into v_anchor
  from public.coach_scheduled_sessions as s
  where s.id = p_session_id;

  perform public.enqueue_appointment_series_notification(
    v_series_id,
    (select linked_user_id from public.coach_business_clients where id = v_session.business_client_id),
    v_coach_id,
    'appointment-series-cancelled',
    'Recurring appointments ended',
    concat('No sessions scheduled after ', to_char(v_session.session_date, 'Mon DD')),
    v_anchor,
    v_session.session_date::text
  );

  return jsonb_build_object('seriesId', v_series_id, 'effectiveDate', v_session.session_date);
end;
$$;

revoke all on function public.create_recurring_appointment_series(uuid, date, time, integer, smallint[], date, integer, text, text, uuid, text, text, text)
  from public, anon;
grant execute on function public.create_recurring_appointment_series(uuid, date, time, integer, smallint[], date, integer, text, text, uuid, text, text, text)
  to authenticated;

revoke all on function public.update_recurring_appointment_series_future(uuid, time, integer) from public, anon;
grant execute on function public.update_recurring_appointment_series_future(uuid, time, integer) to authenticated;

revoke all on function public.cancel_recurring_appointment_series_future(uuid) from public, anon;
grant execute on function public.cancel_recurring_appointment_series_future(uuid) to authenticated;

-- Section J: Function permission matrix (8.14B.2 audit)
-- coach_appointment_series: authenticated SELECT only; writes via SECURITY DEFINER RPCs.
-- count_recurrence_series_occurrence_slots: DEFINER, service_role only.
-- normalize_recurrence_weekdays / validate_recurrence_timezone: DEFINER, service_role only.
-- recurrence_bulk_lifecycle_suppressed: INVOKER SQL, service_role only.
-- set_recurrence_bulk_lifecycle_suppressed: DEFINER, service_role only (transaction-local set_config).
-- notify_appointment_lifecycle_changes: DEFINER trigger, no direct execute grants.
-- appointment_series_notification_dedupe_key: DEFINER IMMUTABLE, service_role only.
-- enqueue_appointment_series_notification: DEFINER, service_role only.
-- materialize_recurring_appointment_series: DEFINER, authenticated + service_role.
-- update/cancel occurrence + future + create series: DEFINER, authenticated only.
-- preflight_recurring_appointment_conflicts: DEFINER, authenticated only; coach = auth.uid().
-- count_recurrence_series_occurrence_slots: distinct session dates UNION conflict dates (deduped).
-- resolve_eligible_recurrence_conflicts: past blocked dates -> waived; future eligible -> materialized.
-- extend_recurring_appointment_horizons: daily conflict resolution OR horizon extension.
-- DB overlap protection: friendly trigger SQLSTATE 99001 + exclusion constraint SQLSTATE 23P01.
-- coach_scheduled_sessions_no_overlap: gist exclusion on scheduled rows with canonical instants.
-- Horizon conflict ledger: coach_appointment_series_conflicts accounts for blocked dates.
-- resolve_eligible_recurrence_conflicts: service_role only; called before horizon materialize.

commit;
