-- AVAREN Sprint 8.3.14 — Athlete appointment coach_id for schedule-conflict handoff
-- DO NOT RUN AUTOMATICALLY — execute in Supabase SQL Editor.
--
-- Required when live athlete appointments omit coach_id from
-- athlete_scheduled_session_public_json, causing followup_missing_session_coach.
--
-- Additive only: extends athlete_scheduled_session_public_json with coach_id
-- (athlete already sees coach display name; UUID is required for follow-up link).
-- Does not expose email or other private coach data.

begin;

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
    'coach_id', p_session.coach_id,
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

notify pgrst, 'reload schema';

commit;

-- Verify (optional):
-- select public.list_athlete_scheduled_sessions();
