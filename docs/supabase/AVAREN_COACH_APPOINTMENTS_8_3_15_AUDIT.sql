-- AVAREN Sprint 8.3.15 — LIVE follow-up identity forensic audit (read-only)
-- Run in Supabase SQL Editor. Does NOT modify schema.
-- DO NOT RUN AUTOMATICALLY alongside corrective patches.
--
-- Use after athlete receives followup_insert_invalid_scheduled_session.
-- Replace placeholder UUIDs in section D with values from the failed attempt.

-- ── A. Live validation function definition ────────────────────────────────────

select
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  pg_catalog.pg_get_functiondef(p.oid) as live_definition
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'enforce_coach_client_followup_insert';

-- Expected failure mode when is_security_definer = false:
-- trigger EXISTS on coach_scheduled_sessions fails under athlete RLS.

-- ── B. coach_scheduled_sessions RLS policies (athlete has no direct SELECT) ─

select
  pol.polname as policy_name,
  case pol.polcmd
    when 'r' then 'SELECT'
    when 'a' then 'INSERT'
    when 'w' then 'UPDATE'
    when 'd' then 'DELETE'
    else pol.polcmd::text
  end as command,
  pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) as using_expression
from pg_catalog.pg_policy as pol
join pg_catalog.pg_class as cls on cls.oid = pol.polrelid
join pg_catalog.pg_namespace as nsp on nsp.oid = cls.relnamespace
where nsp.nspname = 'public'
  and cls.relname = 'coach_scheduled_sessions'
order by pol.polname;

-- ── C. Trigger wiring ─────────────────────────────────────────────────────────

select
  tg.tgname as trigger_name,
  cls.relname as table_name,
  p.proname as function_name,
  p.prosecdef as trigger_fn_security_definer
from pg_catalog.pg_trigger as tg
join pg_catalog.pg_class as cls on cls.oid = tg.tgrelid
join pg_catalog.pg_proc as p on p.oid = tg.tgfoid
join pg_catalog.pg_namespace as n on n.oid = cls.relnamespace
where n.nspname = 'public'
  and cls.relname = 'coach_client_followups'
  and not tg.tgisinternal
order by tg.tgname;

-- ── D. Identity probe for the failed appointment (postgres view — row exists) ─
-- Replace placeholders before running.

with probe as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as scheduled_session_id,
    '00000000-0000-0000-0000-000000000002'::uuid as coach_id,
    '00000000-0000-0000-0000-000000000003'::uuid as athlete_id
)
select
  exists (
    select 1
    from public.coach_scheduled_sessions as ss
    where ss.id = probe.scheduled_session_id
  ) as session_exists_bypassing_rls,
  exists (
    select 1
    from public.coach_scheduled_sessions as ss
    where ss.id = probe.scheduled_session_id
      and ss.coach_id = probe.coach_id
      and ss.athlete_id = probe.athlete_id
  ) as session_id_coach_athlete_match_bypassing_rls,
  exists (
    select 1
    from public.coach_clients as cc
    where cc.coach_id = probe.coach_id
      and cc.athlete_id = probe.athlete_id
  ) as coach_client_relationship_exists
from probe;

-- ── E. Compare displayed appointment JSON vs session row ──────────────────────
-- Replace scheduled_session_id placeholder.

select
  ss.id as session_id,
  ss.coach_id as session_coach_id,
  ss.athlete_id as session_athlete_id,
  public.athlete_scheduled_session_public_json(
    ss,
    public.resolve_user_public_display_name(ss.coach_id),
    null
  ) as athlete_public_json
from public.coach_scheduled_sessions as ss
where ss.id = '00000000-0000-0000-0000-000000000001'::uuid;

-- Safe booleans to report:
--   sessionExists                      = session_exists_bypassing_rls
--   sessionIdMatchesDisplayedAppointment = public JSON id = session_id
--   coachMatches                       = followup.coach_id = session_coach_id = JSON coach_id
--   athleteMatches                     = followup.athlete_id = session_athlete_id
--   authMatchesAthlete                 = auth.uid() = followup.athlete_id (verify in app)
--   coachClientRelationshipExists      = coach_client_relationship_exists
--
-- If all true but athlete insert still fails and is_security_definer = false:
--   failed condition = trigger session EXISTS blocked by RLS (invoker context)
--   fix = AVAREN_COACH_APPOINTMENTS_8_3_15.sql
