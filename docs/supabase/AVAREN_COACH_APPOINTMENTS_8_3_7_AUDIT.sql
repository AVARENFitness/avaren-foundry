-- AVAREN Sprint 8.3.7 — LIVE DATABASE INSTALLATION AUDIT (read-only)
-- Run in Supabase SQL Editor. Does NOT modify schema.
-- DO NOT RUN AUTOMATICALLY alongside corrective patches.

-- ── A. Required relations for list_athlete_scheduled_sessions() chain ─────────

select
  required.object_name,
  case
    when pg_catalog.to_regclass(required.regclass_name) is null then 'MISSING'
    else 'EXISTS'
  end as state,
  required.regclass_name
from (
  values
    ('coach_scheduled_sessions', 'public.coach_scheduled_sessions'),
    ('coach_assignments', 'public.coach_assignments'),
    ('coach_clients', 'public.coach_clients'),
    ('user_profiles', 'public.user_profiles'),
    ('coach_client_followups', 'public.coach_client_followups'),
    ('coach_notifications', 'public.coach_notifications')
) as required(object_name, regclass_name)
order by required.object_name;

-- ── B. Required RPC / helper functions ───────────────────────────────────────

select
  required.function_name,
  case
    when exists (
      select 1
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = required.function_name
        and pg_get_function_identity_arguments(p.oid) = required.function_args
    ) then 'EXISTS'
    else 'MISSING'
  end as state,
  required.function_args
from (
  values
    ('list_athlete_scheduled_sessions', ''),
    ('athlete_scheduled_session_public_json', 'p_session public.coach_scheduled_sessions, p_coach_display_name text, p_linked_workout_title text'),
    ('resolve_user_public_display_name', 'p_user_id uuid'),
    ('update_scheduled_session_rsvp', 'p_session_id uuid, p_rsvp_status text'),
    ('coach_session_wall_clock_to_starts_at', 'p_session_date date, p_start_time time, p_schedule_timezone text')
) as required(function_name, function_args)
order by required.function_name;

-- ── C. coach_scheduled_sessions live column shape ────────────────────────────

select
  required.column_name,
  case
    when c.column_name is null then 'MISSING'
    else 'EXISTS'
  end as state,
  c.data_type,
  c.is_nullable,
  c.column_default
from (
  values
    ('id'),
    ('coach_id'),
    ('athlete_id'),
    ('session_date'),
    ('start_time'),
    ('duration_minutes'),
    ('schedule_timezone'),
    ('starts_at'),
    ('ends_at'),
    ('status'),
    ('rsvp_status'),
    ('rsvp_updated_at'),
    ('appointment_type'),
    ('location_type'),
    ('location_name'),
    ('assignment_id'),
    ('workout_session_id'),
    ('created_at'),
    ('updated_at')
) as required(column_name)
left join information_schema.columns as c
  on c.table_schema = 'public'
 and c.table_name = 'coach_scheduled_sessions'
 and c.column_name = required.column_name
order by required.column_name;

-- ── D. Appointment row preservation check ────────────────────────────────────

select
  pg_catalog.to_regclass('public.coach_scheduled_sessions') is not null as sessions_table_exists,
  (
    select count(*)
    from public.coach_scheduled_sessions
  ) as scheduled_session_rows,
  (
    select count(*)
    from public.coach_scheduled_sessions
    where status = 'scheduled'
      and starts_at is not null
      and starts_at >= pg_catalog.now()
  ) as future_scheduled_rows;

-- ── E. Function ownership (SECURITY DEFINER must bypass RLS) ───────────────────

select
  p.proname as function_name,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'list_athlete_scheduled_sessions',
    'athlete_scheduled_session_public_json',
    'resolve_user_public_display_name'
  )
order by p.proname, args;

-- ── F. EXECUTE grants for athlete RPC ────────────────────────────────────────

select
  has_function_privilege(
    'authenticated',
    'public.list_athlete_scheduled_sessions()',
    'EXECUTE'
  ) as athlete_can_execute_list_rpc;

-- ── G. Live RPC probe (run as athlete JWT in SQL editor or via app refetch) ──
-- Expected on success: json array (possibly empty).
-- On 42P01 failure: note the FULL error text — especially relation name.

-- select public.list_athlete_scheduled_sessions();
