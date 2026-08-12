-- AVAREN Sprint 8.3.8 — Install missing appointment helper functions only
-- DO NOT RUN AUTOMATICALLY — execute in Supabase SQL Editor.
--
-- Live audit (Section B) proved MISSING:
--   • public.athlete_scheduled_session_public_json(coach_scheduled_sessions, text, text)
--   • public.coach_session_wall_clock_to_starts_at(date, time, text)
--
-- Already EXISTS (do not recreate here):
--   • public.list_athlete_scheduled_sessions()
--   • public.resolve_user_public_display_name(uuid)
--   • public.update_scheduled_session_rsvp(uuid, text)
--
-- Additive only: functions + revokes. No table/data changes.

begin;

-- ── 1. Wall-clock → timestamptz (internal; used by triggers/backfill) ─────────

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
    at time zone coalesce(
      nullif(pg_catalog.btrim(p_schedule_timezone), ''),
      'America/New_York'
    )
  );
$$;

revoke all on function public.coach_session_wall_clock_to_starts_at(date, time, text)
  from public;
revoke all on function public.coach_session_wall_clock_to_starts_at(date, time, text)
  from authenticated;
revoke all on function public.coach_session_wall_clock_to_starts_at(date, time, text)
  from anon;

-- ── 2. Athlete-safe appointment JSON (internal; called by list + RSVP RPCs) ───

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

alter function public.coach_session_wall_clock_to_starts_at(date, time, text) owner to postgres;
alter function public.athlete_scheduled_session_public_json(
  public.coach_scheduled_sessions,
  text,
  text
) owner to postgres;

commit;

notify pgrst, 'reload schema';

-- ── Post-run verification ─────────────────────────────────────────────────────
--
-- Rerun Section B from AVAREN_COACH_APPOINTMENTS_8_3_7_AUDIT.sql — all five = EXISTS
--
-- Athlete JWT:
--   select public.list_athlete_scheduled_sessions();
--
-- Pass gate (app debug panel after refetch):
--   RPC status: success · RPC results >= 1 · Canonical >= 1 · Next appointment: yes
