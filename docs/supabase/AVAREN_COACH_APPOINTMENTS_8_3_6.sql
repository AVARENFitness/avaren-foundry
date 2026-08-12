-- AVAREN Sprint 8.3.6 — Fix live list_athlete_scheduled_sessions RPC failure
-- DO NOT RUN AUTOMATICALLY — review and execute in Supabase SQL Editor.
--
-- Proven symptom (athlete debug panel):
--   RPC requested: yes · RPC status: error · category: rpc_unavailable
--
-- Live error (42883):
--   function pg_catalog.nullif(text, unknown) does not exist
--   NULLIF/COALESCE are conditional expressions — never pg_catalog-qualify them.
--
-- Typical root causes this patch addresses:
--   1. Signature drift — list_athlete_scheduled_sessions() calls the 3-arg
--      athlete_scheduled_session_public_json(...) helper but live DB still has
--      only the legacy 2-arg overload (42883 at runtime).
--   2. Identity enrichment failure — resolve_user_public_display_name() error
--      aborts the RPC instead of falling back to "Coach".
--   3. search_path = '' resolution — qualify real built-in functions only.
--
-- Safe to run when AVAREN_COACH_APPOINTMENTS_8_3.sql already ran (fully or partially).
-- Does NOT redesign schema. Recreates only the athlete read RPC chain.

begin;

-- ── 1. Internal identity helper (never aborts athlete reads) ─────────────────

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

revoke all on function public.resolve_user_public_display_name(uuid) from public;
revoke all on function public.resolve_user_public_display_name(uuid) from authenticated;
revoke all on function public.resolve_user_public_display_name(uuid) from anon;

-- ── 2. Allowlisted athlete JSON helper (3-arg canonical) ───────────────────────

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

-- Remove stale 2-arg overload that causes PostgREST / runtime ambiguity.
drop function if exists public.athlete_scheduled_session_public_json(
  public.coach_scheduled_sessions,
  text
);

-- ── 3. Athlete-safe read RPC ───────────────────────────────────────────────────

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

revoke all on function public.list_athlete_scheduled_sessions() from public;
grant execute on function public.list_athlete_scheduled_sessions() to authenticated;

commit;

-- Refresh PostgREST schema cache (run once after the transaction commits).
notify pgrst, 'reload schema';

-- ── Post-run verification (manual, athlete JWT) ───────────────────────────────
--
-- 1. Function exists, no overload ambiguity:
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args
--   from pg_proc as p
--   join pg_namespace as n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in (
--       'list_athlete_scheduled_sessions',
--       'athlete_scheduled_session_public_json',
--       'resolve_user_public_display_name'
--     )
--   order by p.proname, args;
--
-- 2. EXECUTE grant:
--   select has_function_privilege('authenticated', 'public.list_athlete_scheduled_sessions()', 'execute');
--
-- 3. Live RPC (athlete session):
--   select public.list_athlete_scheduled_sessions();
--
-- Expected athlete debug panel after app refetch:
--   RPC status: success · RPC results >= 1 · Canonical >= 1 · Next appointment: yes
