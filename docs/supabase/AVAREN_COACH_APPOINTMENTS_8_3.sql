-- AVAREN Sprint 8.3 — In-Person Appointments + Attendance Foundation (HARDENED)
-- Extends public.coach_scheduled_sessions (canonical appointment record).
-- Upgrades LIVE calendar-7.1 schema even when RSVP-7.1 was never applied.
-- Safe for a single production run (uses IF NOT EXISTS / DROP IF EXISTS where practical).
-- NOT guaranteed fully rerunnable end-to-end — execute once against current schema.
-- DO NOT RUN AUTOMATICALLY — review and execute in Supabase SQL Editor.
--
-- Domain (unchanged):
--   WORKOUT ASSIGNMENT      = coach_assignments (programming)
--   COACH SCHEDULED SESSION = coach_scheduled_sessions (appointment)
--   WORKOUT SESSION         = local Foundry session id (text, optional link)
--
-- Minimum live dependency:
--   • public.coach_scheduled_sessions (AVAREN_COACH_CALENDAR_7_1.sql)
--   • public.coach_clients, public.coach_assignments (AVAREN_COACH_BACKEND.sql)
--   • public.coach_client_followups (AVAREN_COACH_CLIENT_FOLLOWUPS_8_2.sql)
--
-- Subsumes (does NOT require separately applied):
--   • AVAREN_COACH_SESSION_RSVP_7_1.sql column additions + athlete RPCs
--
-- Optional:
--   • public.user_profiles (AVAREN_COACH_CLIENT_IDENTITY_7_9_3.sql)
--   • public.coach_notifications (AVAREN_ASSIGNMENT_NOTIFICATIONS_6_3_2.sql — RSVP notify)
--
-- Legacy live scheduling truth (calendar 7.1 only):
--   session_date + start_time = wall-clock schedule (no timezone column stored)
--   8.3 introduces schedule_timezone + starts_at/ends_at and backfills from wall clock
--
-- If migration previously FAILED inside BEGIN/COMMIT, PostgreSQL rolled back entirely.
-- Verify live state before re-run:
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'coach_scheduled_sessions'
--   order by ordinal_position;

begin;

-- ── A. Dependency + legacy schema guards ─────────────────────────────────────

do $$
declare
  v_invalid_statuses text[];
  v_missing_legacy text[];
begin
  if to_regclass('public.coach_scheduled_sessions') is null then
    raise exception 'Missing dependency: public.coach_scheduled_sessions. Run AVAREN_COACH_CALENDAR_7_1.sql first.';
  end if;

  if to_regclass('public.coach_clients') is null then
    raise exception 'Missing dependency: public.coach_clients. Run AVAREN_COACH_BACKEND.sql first.';
  end if;

  if to_regclass('public.coach_assignments') is null then
    raise exception 'Missing dependency: public.coach_assignments. Run AVAREN_COACH_BACKEND.sql first.';
  end if;

  if to_regclass('public.coach_client_followups') is null then
    raise exception 'Missing dependency: public.coach_client_followups. Run AVAREN_COACH_CLIENT_FOLLOWUPS_8_2.sql first.';
  end if;

  select coalesce(array_agg(c.column_name order by c.column_name), '{}')
  into v_missing_legacy
  from (
    values
      ('id'),
      ('coach_id'),
      ('athlete_id'),
      ('session_date'),
      ('start_time'),
      ('duration_minutes'),
      ('coach_note'),
      ('status'),
      ('created_at'),
      ('updated_at')
  ) as required(column_name)
  left join information_schema.columns as c
    on c.table_schema = 'public'
   and c.table_name = 'coach_scheduled_sessions'
   and c.column_name = required.column_name
  where c.column_name is null;

  if coalesce(array_length(v_missing_legacy, 1), 0) > 0 then
    raise exception
      'coach_scheduled_sessions missing required legacy columns: %',
      v_missing_legacy;
  end if;

  select coalesce(array_agg(distinct s.status), '{}')
  into v_invalid_statuses
  from public.coach_scheduled_sessions as s
  where s.status not in ('scheduled', 'completed', 'cancelled', 'missed');

  if coalesce(array_length(v_invalid_statuses, 1), 0) > 0 then
    raise exception
      'Cannot replace status CHECK: existing rows contain unexpected status values: %',
      v_invalid_statuses;
  end if;
end $$;

-- ── B. Add missing columns (RSVP 7.1 + 8.3) — before any reference ───────────
-- Live calendar 7.1 lacks: starts_at, schedule_timezone, rsvp_*, reminder_*, ends_at, 8.3 fields.

alter table public.coach_scheduled_sessions
  add column if not exists rsvp_status text,
  add column if not exists rsvp_updated_at timestamptz,
  add column if not exists starts_at timestamptz,
  add column if not exists schedule_timezone text,
  add column if not exists reminder_claimed_at timestamptz,
  add column if not exists reminder_claim_expires_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;

alter table public.coach_scheduled_sessions
  add column if not exists appointment_type text,
  add column if not exists location_type text,
  add column if not exists location_name text,
  add column if not exists assignment_id uuid,
  add column if not exists workout_session_id text,
  add column if not exists ends_at timestamptz;

-- Defaults for rows created before typed constraints (legacy-safe).
update public.coach_scheduled_sessions as s
set rsvp_status = 'awaiting_response'
where s.rsvp_status is null;

update public.coach_scheduled_sessions as s
set appointment_type = 'IN_PERSON_TRAINING'
where s.appointment_type is null;

update public.coach_scheduled_sessions as s
set location_type = 'default'
where s.location_type is null;

update public.coach_scheduled_sessions as s
set location_name = ''
where s.location_name is null;

-- Legacy calendar had no timezone column. AVAREN business default (see sessionTimezone.js).
update public.coach_scheduled_sessions as s
set schedule_timezone = 'America/New_York'
where s.schedule_timezone is null
   or trim(s.schedule_timezone) = '';

-- FK for assignment link (add only if column just added without constraint).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coach_scheduled_sessions_assignment_id_fkey'
      and conrelid = 'public.coach_scheduled_sessions'::regclass
  ) then
    alter table public.coach_scheduled_sessions
      add constraint coach_scheduled_sessions_assignment_id_fkey
      foreign key (assignment_id)
      references public.coach_assignments(id)
      on delete set null;
  end if;
exception
  when duplicate_object then
    null;
end $$;

-- coach_notifications support for RSVP RPC (may exist from assignment notifications).
do $$
begin
  if to_regclass('public.coach_notifications') is not null then
    alter table public.coach_notifications
      add column if not exists scheduled_session_id uuid
        references public.coach_scheduled_sessions(id) on delete cascade;

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
        'session-reminder'
      ));

    create index if not exists coach_notifications_scheduled_session_idx
      on public.coach_notifications (scheduled_session_id);
  end if;
end $$;

-- ── C. Normalize legacy values (before constraints) ────────────────────────────

update public.coach_scheduled_sessions as s
set duration_minutes = 60
where s.duration_minutes is null
   or s.duration_minutes < 15
   or s.duration_minutes > 480;

-- ── D. Internal wall-clock helper (needed for backfill) ──────────────────────

create or replace function public.coach_session_wall_clock_to_starts_at(
  p_session_date date,
  p_start_time time,
  p_schedule_timezone text
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (
    (p_session_date + p_start_time)
    -- America/New_York: current AVAREN business default when timezone is absent (see column comment).
    at time zone coalesce(nullif(trim(p_schedule_timezone), ''), 'America/New_York')
  );
$$;

revoke all on function public.coach_session_wall_clock_to_starts_at(date, time, text) from public;
revoke all on function public.coach_session_wall_clock_to_starts_at(date, time, text) from authenticated;
revoke all on function public.coach_session_wall_clock_to_starts_at(date, time, text) from anon;

-- ── E. Timezone-aware backfill (starts_at, then ends_at) ─────────────────────
-- Trusted sources only: session_date + start_time + schedule_timezone.
-- Never interpret local wall clock as UTC.

update public.coach_scheduled_sessions as s
set starts_at = public.coach_session_wall_clock_to_starts_at(
  s.session_date,
  s.start_time,
  s.schedule_timezone
)
where s.starts_at is null
  and s.session_date is not null
  and s.start_time is not null;

update public.coach_scheduled_sessions as s
set ends_at = s.starts_at + make_interval(mins => s.duration_minutes)
where s.starts_at is not null
  and s.ends_at is null;

-- ── F. Column comments ─────────────────────────────────────────────────────────

comment on column public.coach_scheduled_sessions.starts_at is
  'Canonical appointment instant (timestamptz, UTC storage). Authoritative for ordering, reminders, overlap.';
comment on column public.coach_scheduled_sessions.ends_at is
  'Canonical appointment end instant (timestamptz). Must be > starts_at when both are set.';
comment on column public.coach_scheduled_sessions.session_date is
  'Wall-clock date in schedule_timezone (display + legacy compatibility).';
comment on column public.coach_scheduled_sessions.start_time is
  'Wall-clock start time in schedule_timezone (display + legacy compatibility).';
comment on column public.coach_scheduled_sessions.schedule_timezone is
  'IANA timezone for session_date/start_time wall clock. Never interpret local time as UTC. '
  'When null/blank, AVAREN currently defaults to America/New_York — a Sprint 8.3 business '
  'assumption for the primary coaching market, NOT a universal timezone default. '
  'Multi-coach / multi-timezone per-coach defaults are future architecture debt (P1).';
comment on column public.coach_scheduled_sessions.assignment_id is
  'Optional link to coach_assignments — programming remains independent of scheduling.';
comment on column public.coach_scheduled_sessions.workout_session_id is
  'Optional local-first Foundry workout instance completed during this appointment.';

-- ── G. Constraints ─────────────────────────────────────────────────────────────

alter table public.coach_scheduled_sessions
  alter column rsvp_status set default 'awaiting_response',
  alter column rsvp_status set not null,
  alter column schedule_timezone set default 'America/New_York',
  alter column schedule_timezone set not null,
  alter column appointment_type set default 'IN_PERSON_TRAINING',
  alter column appointment_type set not null,
  alter column location_type set default 'default',
  alter column location_type set not null,
  alter column location_name set default '',
  alter column location_name set not null;

alter table public.coach_scheduled_sessions
  drop constraint if exists coach_scheduled_sessions_rsvp_status_check;

alter table public.coach_scheduled_sessions
  add constraint coach_scheduled_sessions_rsvp_status_check
  check (rsvp_status in ('awaiting_response', 'confirmed', 'cannot_attend'));

alter table public.coach_scheduled_sessions
  drop constraint if exists coach_scheduled_sessions_appointment_type_check;

alter table public.coach_scheduled_sessions
  add constraint coach_scheduled_sessions_appointment_type_check
  check (appointment_type in (
    'IN_PERSON_TRAINING',
    'CONSULTATION',
    'ASSESSMENT',
    'CHECK_IN'
  ));

alter table public.coach_scheduled_sessions
  drop constraint if exists coach_scheduled_sessions_location_type_check;

alter table public.coach_scheduled_sessions
  add constraint coach_scheduled_sessions_location_type_check
  check (location_type in ('default', 'avaren_gym', 'client_gym', 'other'));

alter table public.coach_scheduled_sessions
  drop constraint if exists coach_scheduled_sessions_workout_session_id_check;

alter table public.coach_scheduled_sessions
  add constraint coach_scheduled_sessions_workout_session_id_check
  check (
    workout_session_id is null
    or char_length(trim(workout_session_id)) > 0
  );

alter table public.coach_scheduled_sessions
  drop constraint if exists coach_scheduled_sessions_status_check;

alter table public.coach_scheduled_sessions
  add constraint coach_scheduled_sessions_status_check
  check (status in ('scheduled', 'completed', 'cancelled', 'missed'));

alter table public.coach_scheduled_sessions
  drop constraint if exists coach_scheduled_sessions_duration_minutes_check;

alter table public.coach_scheduled_sessions
  add constraint coach_scheduled_sessions_duration_minutes_check
  check (duration_minutes between 15 and 480);

alter table public.coach_scheduled_sessions
  drop constraint if exists coach_scheduled_sessions_window_check;

alter table public.coach_scheduled_sessions
  add constraint coach_scheduled_sessions_window_check
  check (
    starts_at is null
    or ends_at is null
    or ends_at > starts_at
  );

-- ── H. Indexes ─────────────────────────────────────────────────────────────────

create index if not exists coach_scheduled_sessions_coach_starts_idx
  on public.coach_scheduled_sessions (coach_id, starts_at)
  where status = 'scheduled';

create index if not exists coach_scheduled_sessions_assignment_idx
  on public.coach_scheduled_sessions (assignment_id)
  where assignment_id is not null;

create index if not exists coach_scheduled_sessions_reminder_idx
  on public.coach_scheduled_sessions (status, reminder_sent_at, starts_at);

-- ── I. Follow-up → appointment link ──────────────────────────────────────────

alter table public.coach_client_followups
  add column if not exists scheduled_session_id uuid
    references public.coach_scheduled_sessions(id) on delete set null;

create index if not exists coach_client_followups_scheduled_session_idx
  on public.coach_client_followups (scheduled_session_id)
  where scheduled_session_id is not null;

-- ── J. Internal identity helper (not API-exposed) ─────────────────────────────

create or replace function public.resolve_user_public_display_name(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if p_user_id is null then
    return 'Coach';
  end if;

  if to_regclass('public.user_profiles') is null then
    return 'Coach';
  end if;

  select coalesce(
    nullif(trim(up.preferred_name), ''),
    nullif(trim(up.display_name), ''),
    nullif(
      trim(btrim(concat_ws(
        ' ',
        nullif(trim(up.first_name), ''),
        nullif(trim(up.last_name), '')
      ))),
      ''
    ),
    'Coach'
  )
  into v_name
  from public.user_profiles as up
  where up.user_id = p_user_id;

  return coalesce(v_name, 'Coach');
end;
$$;

revoke all on function public.resolve_user_public_display_name(uuid) from public;
revoke all on function public.resolve_user_public_display_name(uuid) from authenticated;
revoke all on function public.resolve_user_public_display_name(uuid) from anon;

-- ── K. Triggers + integrity ───────────────────────────────────────────────────

create or replace function public.enforce_coach_scheduled_session_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.coach_clients as cc
    where cc.coach_id = new.coach_id
      and cc.athlete_id = new.athlete_id
  ) then
    raise exception 'appointment_unauthorized_client';
  end if;

  if auth.uid() is not null and tg_op = 'INSERT' then
    if not public.is_avaren_coach() or new.coach_id is distinct from auth.uid() then
      raise exception 'appointment_insert_not_coach';
    end if;
  end if;

  if new.assignment_id is not null and not exists (
    select 1
    from public.coach_assignments as ca
    where ca.id = new.assignment_id
      and ca.coach_id = new.coach_id
      and ca.athlete_id = new.athlete_id
  ) then
    raise exception 'appointment_invalid_assignment';
  end if;

  if new.duration_minutes is null then
    new.duration_minutes := 60;
  elsif new.duration_minutes < 15 or new.duration_minutes > 480 then
    raise exception 'appointment_invalid_duration';
  end if;

  if new.rsvp_status is null then
    new.rsvp_status := 'awaiting_response';
  end if;

  if new.schedule_timezone is null or trim(new.schedule_timezone) = '' then
    -- AVAREN business default (Sprint 8.3); not a universal IANA fallback.
    new.schedule_timezone := 'America/New_York';
  end if;

  if new.starts_at is null
     and new.session_date is not null
     and new.start_time is not null then
    new.starts_at := public.coach_session_wall_clock_to_starts_at(
      new.session_date,
      new.start_time,
      new.schedule_timezone
    );
  end if;

  if new.starts_at is not null then
    new.ends_at := new.starts_at + make_interval(mins => new.duration_minutes);
  end if;

  if new.starts_at is not null
     and new.ends_at is not null
     and new.ends_at <= new.starts_at then
    raise exception 'appointment_invalid_window';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_coach_scheduled_session_integrity() from public;
revoke all on function public.enforce_coach_scheduled_session_integrity() from authenticated;
revoke all on function public.enforce_coach_scheduled_session_integrity() from anon;

drop trigger if exists coach_scheduled_sessions_sync_ends_at
  on public.coach_scheduled_sessions;

drop trigger if exists coach_scheduled_sessions_enforce_integrity
  on public.coach_scheduled_sessions;

create trigger coach_scheduled_sessions_enforce_integrity
before insert or update of
  coach_id,
  athlete_id,
  session_date,
  start_time,
  starts_at,
  duration_minutes,
  schedule_timezone,
  assignment_id,
  ends_at,
  rsvp_status
on public.coach_scheduled_sessions
for each row
execute function public.enforce_coach_scheduled_session_integrity();

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
    raise exception 'appointment_overlap';
  end if;

  return new;
end;
$$;

revoke all on function public.coach_scheduled_sessions_overlap_guard() from public;
revoke all on function public.coach_scheduled_sessions_overlap_guard() from authenticated;
revoke all on function public.coach_scheduled_sessions_overlap_guard() from anon;

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

create or replace function public.reset_session_reminder_on_schedule_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.starts_at is distinct from old.starts_at
       or new.schedule_timezone is distinct from old.schedule_timezone
       or new.session_date is distinct from old.session_date
       or new.start_time is distinct from old.start_time then
      new.reminder_sent_at := null;
      new.reminder_claimed_at := null;
      new.reminder_claim_expires_at := null;
    end if;

    if new.status is distinct from old.status
       and new.status in ('cancelled', 'completed', 'missed') then
      new.reminder_claimed_at := null;
      new.reminder_claim_expires_at := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.reset_session_reminder_on_schedule_change() from public;
revoke all on function public.reset_session_reminder_on_schedule_change() from authenticated;
revoke all on function public.reset_session_reminder_on_schedule_change() from anon;

drop trigger if exists coach_scheduled_sessions_reminder_reset_trigger
  on public.coach_scheduled_sessions;

create trigger coach_scheduled_sessions_reminder_reset_trigger
before update on public.coach_scheduled_sessions
for each row
execute function public.reset_session_reminder_on_schedule_change();

create or replace function public.enforce_coach_client_followup_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.athlete_id is distinct from auth.uid() then
    raise exception 'followup_insert_not_self';
  end if;

  if not exists (
    select 1
    from public.coach_clients as cc
    where cc.coach_id = new.coach_id
      and cc.athlete_id = new.athlete_id
  ) then
    raise exception 'followup_insert_unauthorized_coach';
  end if;

  if new.assignment_id is not null and not exists (
    select 1
    from public.coach_assignments as ca
    where ca.id = new.assignment_id
      and ca.coach_id = new.coach_id
      and ca.athlete_id = new.athlete_id
  ) then
    raise exception 'followup_insert_invalid_assignment';
  end if;

  if new.scheduled_session_id is not null and not exists (
    select 1
    from public.coach_scheduled_sessions as ss
    where ss.id = new.scheduled_session_id
      and ss.coach_id = new.coach_id
      and ss.athlete_id = new.athlete_id
  ) then
    raise exception 'followup_insert_invalid_scheduled_session';
  end if;

  new.summary := trim(new.summary);
  new.session_id := nullif(trim(new.session_id), '');
  new.status := 'open';
  new.reviewed_at := null;
  new.resolved_at := null;
  new.created_at := now();
  new.updated_at := now();

  return new;
end;
$$;

revoke all on function public.enforce_coach_client_followup_insert() from public;
revoke all on function public.enforce_coach_client_followup_insert() from authenticated;
revoke all on function public.enforce_coach_client_followup_insert() from anon;

create or replace function public.enforce_coach_client_followup_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.coach_id is distinct from old.coach_id
    or new.athlete_id is distinct from old.athlete_id
    or new.reason_type is distinct from old.reason_type
    or new.source_type is distinct from old.source_type
    or new.summary is distinct from old.summary
    or new.session_id is distinct from old.session_id
    or new.assignment_id is distinct from old.assignment_id
    or new.scheduled_session_id is distinct from old.scheduled_session_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'followup_identity_immutable';
  end if;

  if new.status is not distinct from old.status then
    new.reviewed_at := old.reviewed_at;
    new.resolved_at := old.resolved_at;
    new.updated_at := now();
    return new;
  end if;

  if old.status = 'open' and new.status = 'reviewed' then
    new.reviewed_at := now();
    new.resolved_at := null;
  elsif old.status = 'open' and new.status = 'resolved' then
    new.reviewed_at := now();
    new.resolved_at := now();
  elsif old.status = 'reviewed' and new.status = 'resolved' then
    new.reviewed_at := old.reviewed_at;
    new.resolved_at := now();
  else
    raise exception 'followup_invalid_status_transition';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.enforce_coach_client_followup_update() from public;
revoke all on function public.enforce_coach_client_followup_update() from authenticated;
revoke all on function public.enforce_coach_client_followup_update() from anon;

-- ── L. Athlete-safe RPC surface ────────────────────────────────────────────────

create or replace function public.athlete_scheduled_session_public_json(
  p_session public.coach_scheduled_sessions,
  p_coach_display_name text,
  p_linked_workout_title text default null
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_session.id,
    'coach_display_name', coalesce(nullif(trim(p_coach_display_name), ''), 'Coach'),
    'session_date', p_session.session_date,
    'start_time', p_session.start_time,
    'starts_at', p_session.starts_at,
    'ends_at', p_session.ends_at,
    'schedule_timezone', p_session.schedule_timezone,
    'duration_minutes', p_session.duration_minutes,
    'status', p_session.status,
    'rsvp_status', p_session.rsvp_status,
    'rsvp_updated_at', p_session.rsvp_updated_at,
    'appointment_type', p_session.appointment_type,
    'location_type', p_session.location_type,
    'location_name', case
      when coalesce(nullif(trim(p_session.location_name), ''), '') <> '' then
        trim(p_session.location_name)
      when p_session.location_type = 'avaren_gym' then 'AVAREN Gym'
      when p_session.location_type = 'client_gym' then 'Client gym'
      else null
    end,
    'assignment_id', p_session.assignment_id,
    'linked_workout_title', nullif(trim(p_linked_workout_title), '')
  );
$$;

revoke all on function public.athlete_scheduled_session_public_json(public.coach_scheduled_sessions, text, text) from public;
revoke all on function public.athlete_scheduled_session_public_json(public.coach_scheduled_sessions, text, text) from authenticated;
revoke all on function public.athlete_scheduled_session_public_json(public.coach_scheduled_sessions, text, text) from anon;

drop function if exists public.athlete_scheduled_session_public_json(
  public.coach_scheduled_sessions,
  text
);

create or replace function public.list_athlete_scheduled_sessions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := auth.uid();
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  return coalesce((
    select jsonb_agg(
      public.athlete_scheduled_session_public_json(
        scoped.session_row,
        scoped.coach_display_name,
        scoped.linked_workout_title
      )
      order by scoped.session_starts_at
    )
    from (
      select
        s as session_row,
        s.starts_at as session_starts_at,
        public.resolve_user_public_display_name(s.coach_id) as coach_display_name,
        case
          when a.id is not null and a.athlete_id = s.athlete_id then a.title
          else null
        end as linked_workout_title
      from public.coach_scheduled_sessions as s
      left join public.coach_assignments as a
        on a.id = s.assignment_id
       and a.athlete_id = s.athlete_id
       and a.coach_id = s.coach_id
      where s.athlete_id = v_athlete_id
        and s.status = 'scheduled'
        and s.starts_at is not null
        and s.starts_at >= now()
    ) as scoped
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_athlete_scheduled_sessions() from public;
grant execute on function public.list_athlete_scheduled_sessions() to authenticated;

create or replace function public.update_scheduled_session_rsvp(
  p_session_id uuid,
  p_rsvp_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions;
  v_coach_display_name text;
  v_linked_workout_title text;
  v_athlete_label text;
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_rsvp_status not in ('confirmed', 'cannot_attend') then
    raise exception 'invalid_rsvp_status';
  end if;

  select s.*
  into v_session
  from public.coach_scheduled_sessions as s
  where s.id = p_session_id
    and s.athlete_id = v_athlete_id
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  if v_session.status <> 'scheduled' then
    raise exception 'session_not_open';
  end if;

  v_coach_display_name := public.resolve_user_public_display_name(v_session.coach_id);

  select a.title
  into v_linked_workout_title
  from public.coach_assignments as a
  where a.id = v_session.assignment_id
    and a.athlete_id = v_session.athlete_id
    and a.coach_id = v_session.coach_id
  limit 1;

  if v_session.rsvp_status = p_rsvp_status then
    return jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'session', public.athlete_scheduled_session_public_json(
        v_session,
        v_coach_display_name,
        v_linked_workout_title
      )
    );
  end if;

  update public.coach_scheduled_sessions as s
  set
    rsvp_status = p_rsvp_status,
    rsvp_updated_at = now(),
    updated_at = now()
  where s.id = p_session_id
  returning s.* into v_session;

  if to_regclass('public.coach_notifications') is not null then
    select coalesce(
      (
        select cc.athlete_email
        from public.coach_clients as cc
        where cc.coach_id = v_session.coach_id
          and cc.athlete_id = v_session.athlete_id
        limit 1
      ),
      'Athlete'
    )
    into v_athlete_label;

    insert into public.coach_notifications (
      recipient_id,
      actor_id,
      scheduled_session_id,
      type,
      title,
      body,
      action,
      payload
    )
    values (
      v_session.coach_id,
      v_athlete_id,
      v_session.id,
      case
        when p_rsvp_status = 'confirmed' then 'session-rsvp-confirmed'
        else 'session-rsvp-declined'
      end,
      case
        when p_rsvp_status = 'confirmed' then 'Session confirmed'
        else 'Session conflict'
      end,
      case
        when p_rsvp_status = 'confirmed' then
          concat(
            v_athlete_label,
            ' confirmed ',
            to_char(v_session.start_time, 'FMHH12:MI AM'),
            ' on ',
            to_char(v_session.session_date, 'Mon DD')
          )
        else
          concat(
            v_athlete_label,
            ' cannot make ',
            to_char(v_session.start_time, 'FMHH12:MI AM'),
            ' on ',
            to_char(v_session.session_date, 'Mon DD')
          )
      end,
      'open-coach-calendar',
      jsonb_build_object(
        'scheduledSessionId', v_session.id,
        'rsvpStatus', p_rsvp_status,
        'sessionDate', v_session.session_date,
        'startTime', v_session.start_time,
        'startsAt', v_session.starts_at
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'unchanged', false,
    'session', public.athlete_scheduled_session_public_json(
      v_session,
      v_coach_display_name,
      v_linked_workout_title
    )
  );
end;
$$;

revoke all on function public.update_scheduled_session_rsvp(uuid, text) from public;
grant execute on function public.update_scheduled_session_rsvp(uuid, text) to authenticated;

-- Reminder worker RPCs (from RSVP 7.1 — create if missing for live calendar-only DBs).
create or replace function public.claim_session_reminder_targets(
  p_limit integer default 25,
  p_claim_ttl_minutes integer default 10
)
returns setof public.coach_scheduled_sessions
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select s.id
    from public.coach_scheduled_sessions as s
    where s.status = 'scheduled'
      and s.reminder_sent_at is null
      and s.starts_at is not null
      and s.starts_at > now()
      and s.starts_at - interval '2 hours' <= now()
      and (
        s.reminder_claimed_at is null
        or s.reminder_claim_expires_at <= now()
      )
    order by s.starts_at
    limit p_limit
    for update skip locked
  )
  update public.coach_scheduled_sessions as s
  set
    reminder_claimed_at = now(),
    reminder_claim_expires_at = now() + make_interval(mins => p_claim_ttl_minutes),
    updated_at = now()
  from due
  where s.id = due.id
  returning s.*;
end;
$$;

revoke all on function public.claim_session_reminder_targets(integer, integer) from public;
grant execute on function public.claim_session_reminder_targets(integer, integer) to service_role;

create or replace function public.complete_session_reminder(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.coach_scheduled_sessions as s
  set
    reminder_sent_at = now(),
    reminder_claimed_at = null,
    reminder_claim_expires_at = null,
    updated_at = now()
  where s.id = p_session_id
    and s.status = 'scheduled'
    and s.reminder_sent_at is null
  returning 1 into v_updated;

  return coalesce(v_updated, 0) = 1;
end;
$$;

revoke all on function public.complete_session_reminder(uuid) from public;
grant execute on function public.complete_session_reminder(uuid) to service_role;

create or replace function public.release_session_reminder_claim(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.coach_scheduled_sessions as s
  set
    reminder_claimed_at = null,
    reminder_claim_expires_at = null,
    updated_at = now()
  where s.id = p_session_id
    and s.status = 'scheduled'
    and s.reminder_sent_at is null
  returning 1 into v_updated;

  return coalesce(v_updated, 0) = 1;
end;
$$;

revoke all on function public.release_session_reminder_claim(uuid) from public;
grant execute on function public.release_session_reminder_claim(uuid) to service_role;

-- ── M. RLS hardening — coach CRUD without DELETE ─────────────────────────────

drop policy if exists coach_scheduled_sessions_coach_all on public.coach_scheduled_sessions;
drop policy if exists coach_scheduled_sessions_athlete_select on public.coach_scheduled_sessions;

drop policy if exists coach_scheduled_sessions_coach_select on public.coach_scheduled_sessions;
create policy coach_scheduled_sessions_coach_select on public.coach_scheduled_sessions
for select to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach());

drop policy if exists coach_scheduled_sessions_coach_insert on public.coach_scheduled_sessions;
create policy coach_scheduled_sessions_coach_insert on public.coach_scheduled_sessions
for insert to authenticated
with check (
  coach_id = auth.uid()
  and public.is_avaren_coach()
  and exists (
    select 1
    from public.coach_clients as cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = coach_scheduled_sessions.athlete_id
  )
);

drop policy if exists coach_scheduled_sessions_coach_update on public.coach_scheduled_sessions;
create policy coach_scheduled_sessions_coach_update on public.coach_scheduled_sessions
for update to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (
  coach_id = auth.uid()
  and public.is_avaren_coach()
  and exists (
    select 1
    from public.coach_clients as cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = coach_scheduled_sessions.athlete_id
  )
);

commit;

-- ── Post-run verification (manual) ───────────────────────────────────────────
--
-- Confirm columns now exist:
--   select column_name from information_schema.columns
--   where table_name = 'coach_scheduled_sessions'
--     and column_name in ('starts_at','ends_at','schedule_timezone','rsvp_status');
--
-- Confirm legacy rows backfilled:
--   select count(*) filter (where starts_at is null) as missing_starts_at,
--          count(*) filter (where ends_at is null and starts_at is not null) as missing_ends_at
--   from public.coach_scheduled_sessions;
--
-- Display-name helper isolation (authenticated athlete JWT):
--   select public.list_athlete_scheduled_sessions();  -- PASS
--   select public.resolve_user_public_display_name('<coach-uuid>');  -- DENY 42501
--
-- P1 production hardening:
--   • btree_gist exclusion constraint for race-proof overlap
--   • separate athlete history RPC
--   • coach create/reschedule push notifications
--   • per-coach schedule_timezone default (multi-coach / multi-timezone)
