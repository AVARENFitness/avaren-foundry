-- AVAREN Sprint 8.3.7 — Minimal live schema repair for athlete RPC 42P01
-- DO NOT RUN AUTOMATICALLY — run AVAREN_COACH_APPOINTMENTS_8_3_7_AUDIT.sql first.
--
-- Symptom: athlete RPC returns PostgreSQL 42P01 (undefined_table).
-- 8.3.6 recreated functions only; it does NOT create base tables/columns.
--
-- This patch is ADDITIVE ONLY:
--   • CREATE TABLE IF NOT EXISTS for missing canonical relations
--   • ADD COLUMN IF NOT EXISTS for 8.3 appointment columns
--   • Backfill starts_at / ends_at on existing rows (no truncate/drop)
--   • Reassert SECURITY DEFINER ownership on postgres
--   • Reapply corrected 8.3.6 RPC bodies
--
-- Does NOT drop tables, truncate data, or rerun full 8.3.

begin;

-- ── 1. Canonical coach backend tables (if never installed) ───────────────────

create table if not exists public.coach_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  athlete_email text not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (coach_id, athlete_id)
);

create table if not exists public.coach_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  workout_payload jsonb not null default '{}'::jsonb,
  coach_notes text not null default '',
  due_date date,
  status text not null default 'assigned'
    check (status in ('assigned', 'started', 'completed', 'missed', 'cancelled')),
  assigned_at timestamptz not null default pg_catalog.now(),
  started_at timestamptz,
  completed_at timestamptz,
  completed_session_id text
);

-- ── 2. Calendar base table (only if entirely missing) ────────────────────────

create table if not exists public.coach_scheduled_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  start_time time not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  coach_note text not null default '',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'missed')),
  completed_at timestamptz,
  session_history_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

-- ── 3. 8.3 / RSVP columns (safe if already present) ──────────────────────────

alter table public.coach_scheduled_sessions
  add column if not exists rsvp_status text,
  add column if not exists rsvp_updated_at timestamptz,
  add column if not exists starts_at timestamptz,
  add column if not exists schedule_timezone text,
  add column if not exists reminder_claimed_at timestamptz,
  add column if not exists reminder_claim_expires_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists appointment_type text,
  add column if not exists location_type text,
  add column if not exists location_name text,
  add column if not exists assignment_id uuid,
  add column if not exists workout_session_id text,
  add column if not exists ends_at timestamptz;

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

update public.coach_scheduled_sessions as s
set schedule_timezone = 'America/New_York'
where s.schedule_timezone is null
   or pg_catalog.btrim(s.schedule_timezone) = '';

update public.coach_scheduled_sessions as s
set starts_at = (
  (s.session_date + s.start_time)
  at time zone coalesce(nullif(pg_catalog.btrim(s.schedule_timezone), ''), 'America/New_York')
)
where s.starts_at is null
  and s.session_date is not null
  and s.start_time is not null;

update public.coach_scheduled_sessions as s
set ends_at = s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 60))
where s.starts_at is not null
  and s.ends_at is null;

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

-- ── 4. Optional identity table (resolve_user_public_display_name) ────────────

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  preferred_name text not null default '',
  display_name text not null default '',
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_owner on public.user_profiles;
create policy user_profiles_owner on public.user_profiles
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_profiles_coach_read on public.user_profiles;
create policy user_profiles_coach_read on public.user_profiles
for select to authenticated
using (
  exists (
    select 1
    from public.coach_clients as cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = user_profiles.user_id
  )
);

-- ── 5. Reapply corrected 8.3.6 RPC chain (same bodies, idempotent) ───────────

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

  if pg_catalog.to_regclass('public.user_profiles') is null then
    return 'Coach';
  end if;

  select coalesce(
    nullif(pg_catalog.btrim(up.preferred_name), ''),
    nullif(pg_catalog.btrim(up.display_name), ''),
    nullif(
      pg_catalog.btrim(pg_catalog.concat_ws(
        ' ',
        nullif(pg_catalog.btrim(up.first_name), ''),
        nullif(pg_catalog.btrim(up.last_name), '')
      )),
      ''
    ),
    'Coach'
  )
  into v_name
  from public.user_profiles as up
  where up.user_id = p_user_id;

  return coalesce(v_name, 'Coach');
exception
  when others then
    return 'Coach';
end;
$$;

create or replace function public.athlete_scheduled_session_public_json(
  p_session public.coach_scheduled_sessions,
  p_coach_display_name text,
  p_linked_workout_title text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', p_session.id,
    'coach_display_name', coalesce(
      nullif(pg_catalog.btrim(p_coach_display_name), ''),
      'Coach'
    ),
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
      when coalesce(
        nullif(pg_catalog.btrim(p_session.location_name), ''),
        ''
      ) <> '' then pg_catalog.btrim(p_session.location_name)
      when p_session.location_type in ('default', 'avaren_gym') then 'AVAREN Gym'
      when p_session.location_type = 'client_gym' then 'Client gym'
      else null
    end,
    'assignment_id', p_session.assignment_id,
    'linked_workout_title', nullif(pg_catalog.btrim(p_linked_workout_title), '')
  );
$$;

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
    select pg_catalog.jsonb_agg(
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
        and s.starts_at >= pg_catalog.now()
    ) as scoped
  ), '[]'::jsonb);
end;
$$;

alter function public.resolve_user_public_display_name(uuid) owner to postgres;
alter function public.athlete_scheduled_session_public_json(
  public.coach_scheduled_sessions,
  text,
  text
) owner to postgres;
alter function public.list_athlete_scheduled_sessions() owner to postgres;

revoke all on function public.resolve_user_public_display_name(uuid) from public;
revoke all on function public.resolve_user_public_display_name(uuid) from authenticated;
revoke all on function public.resolve_user_public_display_name(uuid) from anon;

revoke all on function public.athlete_scheduled_session_public_json(
  public.coach_scheduled_sessions,
  text,
  text
) from public;
revoke all on function public.athlete_scheduled_session_public_json(
  public.coach_scheduled_sessions,
  text,
  text
) from authenticated;
revoke all on function public.athlete_scheduled_session_public_json(
  public.coach_scheduled_sessions,
  text,
  text
) from anon;

revoke all on function public.list_athlete_scheduled_sessions() from public;
grant execute on function public.list_athlete_scheduled_sessions() to authenticated;

commit;

notify pgrst, 'reload schema';

-- Post-run (athlete JWT):
--   select public.list_athlete_scheduled_sessions();
--
-- Pass gate:
--   RPC status: success · RPC results >= 1 · Canonical >= 1 · Next appointment: yes
