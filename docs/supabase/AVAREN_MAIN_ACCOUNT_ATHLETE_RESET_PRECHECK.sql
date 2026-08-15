-- AVAREN 8.11 — Main account athlete reset PRECHECK (READ ONLY)
-- DO NOT execute DELETE/UPDATE statements from this file.
--
-- Purpose:
--   Resolve the primary AVAREN owner account and show every row that WOULD
--   be reset vs preserved before running AVAREN_MAIN_ACCOUNT_ATHLETE_RESET_ONCE.sql
--
-- Target resolution:
--   1. auth.uid() when run as the signed-in primary account
--   2. auth.users.id for hello@avarenfitness.com (matches src/config/coachAccess.js)
--   3. Cross-check against public.coach_allowlist
--
-- STOP and review output before any destructive reset.

-- ── A. Resolve target account ───────────────────────────────────────────────

with target_candidates as (
  select
    u.id,
    u.email,
    u.created_at,
    'auth.users.email' as resolved_via
  from auth.users as u
  where lower(u.email) = lower('hello@avarenfitness.com')

  union all

  select
    u.id,
    u.email,
    u.created_at,
    'coach_allowlist.email' as resolved_via
  from auth.users as u
  join public.coach_allowlist as ca
    on lower(ca.email) = lower(u.email)
  where lower(u.email) = lower('hello@avarenfitness.com')
)
select
  id as target_user_id,
  email as target_email,
  created_at,
  array_agg(distinct resolved_via order by resolved_via) as resolved_via
from target_candidates
group by id, email, created_at;

select
  auth.uid() as current_auth_uid,
  (
    select u.email
    from auth.users as u
    where u.id = auth.uid()
  ) as current_auth_email,
  (
    select lower(u.email) = lower('hello@avarenfitness.com')
    from auth.users as u
    where u.id = auth.uid()
  ) as current_auth_is_primary_owner;

-- Copy target_user_id from the first result set into RESET_ONCE.sql before running it.

-- ── B. Coach-owned rows that MUST survive (sanity counts) ───────────────────

with target as (
  select u.id as target_user_id
  from auth.users as u
  where lower(u.email) = lower('hello@avarenfitness.com')
  limit 1
)
select 'coach_business_clients (coach-owned)' as table_name,
       count(*) as preserve_count,
       'coach_id = target' as predicate
from public.coach_business_clients as t
cross join target
where t.coach_id = target.target_user_id

union all
select 'coach_clients (coach-owned bridge)',
       count(*),
       'coach_id = target'
from public.coach_clients as t
cross join target
where t.coach_id = target.target_user_id

union all
select 'coach_assignments (assigned TO clients)',
       count(*),
       'coach_id = target AND athlete_id <> target'
from public.coach_assignments as t
cross join target
where t.coach_id = target.target_user_id
  and t.athlete_id <> target.target_user_id

union all
select 'coach_scheduled_sessions (coach-managed appointments)',
       count(*),
       'coach_id = target'
from public.coach_scheduled_sessions as t
cross join target
where t.coach_id = target.target_user_id

union all
select 'coach_client_passes',
       count(*),
       'coach_id = target'
from public.coach_client_passes as t
cross join target
where t.coach_id = target.target_user_id

union all
select 'coach_client_pass_ledger',
       count(*),
       'coach_id = target'
from public.coach_client_pass_ledger as t
cross join target
where t.coach_id = target.target_user_id

union all
select 'coach_programs',
       count(*),
       'coach_id = target'
from public.coach_programs as t
cross join target
where t.coach_id = target.target_user_id

union all
select 'coach_workout_templates',
       count(*),
       'coach_id = target'
from public.coach_workout_templates as t
cross join target
where t.coach_id = target.target_user_id

union all
select 'push_subscriptions (preserve)',
       count(*),
       'user_id = target'
from public.push_subscriptions as t
cross join target
where t.user_id = target.target_user_id

union all
select 'user_profiles (preserve identity)',
       count(*),
       'user_id = target'
from public.user_profiles as t
cross join target
where t.user_id = target.target_user_id

order by table_name;

-- ── C. Athlete-personal rows that WOULD reset ────────────────────────────────

with target as (
  select u.id as target_user_id
  from auth.users as u
  where lower(u.email) = lower('hello@avarenfitness.com')
  limit 1
)
select 'foundry_state (patch json)' as table_name,
       count(*) as would_reset_count,
       'user_id = target' as predicate,
       'A' as class
from public.foundry_state as t
cross join target
where t.user_id = target.target_user_id

union all
select 'nutrition_days',
       count(*),
       'user_id = target',
       'A'
from public.nutrition_days as t
cross join target
where t.user_id = target.target_user_id

union all
select 'nutrition_profiles (goals preserved, logs separate)',
       count(*),
       'user_id = target',
       'D preserve row / reset days only'
from public.nutrition_profiles as t
cross join target
where t.user_id = target.target_user_id

union all
select 'athlete_weekly_check_ins',
       count(*),
       'athlete_id = target',
       'A'
from public.athlete_weekly_check_ins as t
cross join target
where t.athlete_id = target.target_user_id

union all
select 'coach_assignments (main user as athlete subject — all coaches)',
       count(*),
       'athlete_id = target',
       'C'
from public.coach_assignments as t
cross join target
where t.athlete_id = target.target_user_id

union all
select 'coach_assignments (self-assigned test instances)',
       count(*),
       'athlete_id = target AND coach_id = target',
       'C reset'
from public.coach_assignments as t
cross join target
where t.athlete_id = target.target_user_id
  and t.coach_id = target.target_user_id

union all
select 'coach_assignments (client assignments — preserve)',
       count(*),
       'coach_id = target AND athlete_id <> target',
       'B preserve'
from public.coach_assignments as t
cross join target
where t.coach_id = target.target_user_id
  and t.athlete_id <> target.target_user_id

union all
select 'coach_schedule_items (main user as athlete subject)',
       count(*),
       'athlete_id = target',
       'C'
from public.coach_schedule_items as t
cross join target
where t.athlete_id = target.target_user_id

union all
select 'coach_session_packages (legacy athlete packages)',
       count(*),
       'athlete_id = target',
       'C'
from public.coach_session_packages as t
cross join target
where t.athlete_id = target.target_user_id

union all
select 'coach_session_history (legacy athlete packages)',
       count(*),
       'athlete_id = target',
       'C'
from public.coach_session_history as t
cross join target
where t.athlete_id = target.target_user_id

union all
select 'coach_client_followups (athlete-submitted — reset)',
       count(*),
       'athlete_id = target',
       'C'
from public.coach_client_followups as t
cross join target
where t.athlete_id = target.target_user_id

union all
select 'coach_notifications (athlete-facing history only)',
       count(*),
       'recipient_id = target AND athlete-facing types',
       'C'
from public.coach_notifications as t
cross join target
where t.recipient_id = target.target_user_id
  and t.type in (
    'appointment-scheduled',
    'appointment-rescheduled',
    'appointment-cancelled',
    'appointment-athlete-reminder-2h',
    'assignment-created',
    'assignment-due',
    'assignment-overdue'
  )

union all
select 'appointment_notification_deliveries (athlete role only)',
       count(*),
       'recipient_user_id = target AND recipient_role = athlete',
       'C'
from public.appointment_notification_deliveries as t
cross join target
where t.recipient_user_id = target.target_user_id
  and t.recipient_role = 'athlete'

order by table_name;

-- ── D. Ambiguous / report-only cases ────────────────────────────────────────

with target as (
  select u.id as target_user_id
  from auth.users as u
  where lower(u.email) = lower('hello@avarenfitness.com')
  limit 1
)
select 'coach_scheduled_sessions (main user as athlete of another coach — preserve)' as topic,
       count(*) as row_count,
       'athlete_id = target AND coach_id <> target — report only, no delete' as predicate
from public.coach_scheduled_sessions as t
cross join target
where t.athlete_id = target.target_user_id
  and t.coach_id <> target.target_user_id

union all
select 'coach_business_clients (main user linked as client elsewhere)',
       count(*),
       'linked_user_id = target AND coach_id <> target'
from public.coach_business_clients as t
cross join target
where t.linked_user_id = target.target_user_id
  and t.coach_id <> target.target_user_id

union all
select 'coach_clients (main user connected as athlete elsewhere)',
       count(*),
       'athlete_id = target AND coach_id <> target'
from public.coach_clients as t
cross join target
where t.athlete_id = target.target_user_id
  and t.coach_id <> target.target_user_id

union all
select 'coach_notifications (coach-operational, preserve)',
       count(*),
       'recipient_id = target AND coach-facing types'
from public.coach_notifications as t
cross join target
where t.recipient_id = target.target_user_id
  and t.type in (
    'assignment-completed',
    'coach-comment',
    'session-rsvp-confirmed',
    'session-rsvp-declined',
    'session-reminder',
    'appointment-athlete-confirmed',
    'appointment-athlete-cannot-attend',
    'appointment-coach-reminder-2h'
  )

union all
select 'coach_programs (reusable templates — preserve)',
       count(*),
       'coach_id = target'
from public.coach_programs as t
cross join target
where t.coach_id = target.target_user_id

union all
select 'coach_workout_templates (reusable templates — preserve)',
       count(*),
       'coach_id = target'
from public.coach_workout_templates as t
cross join target
where t.coach_id = target.target_user_id

union all
select 'coach_assignments (self-assigned — reset)',
       count(*),
       'coach_id = target AND athlete_id = target'
from public.coach_assignments as t
cross join target
where t.coach_id = target.target_user_id
  and t.athlete_id = target.target_user_id;

-- ── E. FK / cascade notes ───────────────────────────────────────────────────

-- coach_assignments (athlete_id = target)
--   deletes self-assigned and external-coach assignment instances only.
--   Preserves coach_id = target AND athlete_id <> target (client assignments).
--   Does NOT delete coach_programs / coach_workout_templates (reusable definitions).
-- coach_scheduled_sessions where coach_id = target are NEVER deleted by this reset.
-- appointment_notification_deliveries for coach role are preserved.

-- ── F. foundry_state JSON field preview ─────────────────────────────────────

with target as (
  select u.id as target_user_id
  from auth.users as u
  where lower(u.email) = lower('hello@avarenfitness.com')
  limit 1
)
select
  fs.user_id,
  jsonb_array_length(coalesce(fs.state -> 'history', '[]'::jsonb)) as history_count,
  (fs.state ? 'activeWorkout') and (fs.state -> 'activeWorkout' is not null) as has_active_workout,
  jsonb_array_length(coalesce(fs.state -> 'readiness' -> 'entries', '[]'::jsonb)) as readiness_count,
  (
    select count(*)
    from jsonb_object_keys(coalesce(fs.state -> 'nutrition' -> 'days', '{}'::jsonb))
  ) as nutrition_day_keys,
  coalesce(fs.state -> 'onboarding' ->> 'completed', 'false') as onboarding_completed,
  fs.state -> 'program' ->> 'nextWorkout' as current_next_workout,
  fs.state ->> 'selectedWorkout' as current_selected_workout
from public.foundry_state as fs
cross join target
where fs.user_id = target.target_user_id;
