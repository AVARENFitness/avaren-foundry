-- AVAREN 8.11 — Main account athlete reset VERIFICATION (READ ONLY)
-- Run after AVAREN_MAIN_ACCOUNT_ATHLETE_RESET_ONCE.sql and local browser reset.

with target as (
  select u.id as target_user_id, u.email as target_email
  from auth.users as u
  where lower(u.email) = lower('hello@avarenfitness.com')
  limit 1
)
select
  target.target_user_id,
  target.target_email,
  'identity preserved' as check_group,
  exists (
    select 1 from auth.users as u where u.id = target.target_user_id
  ) as auth_user_present,
  (
    select count(*) from public.user_profiles as up
    where up.user_id = target.target_user_id
  ) as user_profile_rows,
  (
    select count(*) from public.coach_allowlist as ca
    where lower(ca.email) = lower(target.target_email)
  ) as allowlist_rows,
  (
    select count(*) from public.push_subscriptions as ps
    where ps.user_id = target.target_user_id
  ) as push_subscription_rows
from target;

-- ── Athlete-side should be clean ────────────────────────────────────────────

with target as (
  select u.id as target_user_id
  from auth.users as u
  where lower(u.email) = lower('hello@avarenfitness.com')
  limit 1
)
select
  jsonb_array_length(coalesce(fs.state -> 'history', '[]'::jsonb)) as history_count,
  (fs.state -> 'activeWorkout') as active_workout,
  jsonb_array_length(coalesce(fs.state -> 'readiness' -> 'entries', '[]'::jsonb)) as readiness_count,
  (
    select count(*)
    from jsonb_object_keys(coalesce(fs.state -> 'nutrition' -> 'days', '{}'::jsonb))
  ) as nutrition_day_keys,
  coalesce(fs.state -> 'onboarding' ->> 'completed', 'false') as onboarding_completed,
  (
    select count(*) from public.nutrition_days as nd
    where nd.user_id = target.target_user_id
  ) as nutrition_days_rows,
  (
    select count(*) from public.athlete_weekly_check_ins as awci
    where awci.athlete_id = target.target_user_id
  ) as weekly_check_in_rows,
  (
    select count(*) from public.coach_assignments as ca
    where ca.athlete_id = target.target_user_id
  ) as athlete_subject_assignment_rows,
  (
    select count(*) from public.coach_assignments as ca
    where ca.athlete_id = target.target_user_id
      and ca.coach_id = target.target_user_id
  ) as self_assigned_assignment_rows,
  (
    select count(*) from public.coach_assignments as ca
    where ca.coach_id = target.target_user_id
      and ca.athlete_id <> target.target_user_id
  ) as client_assignment_rows,
  (
    select count(*) from public.appointment_notification_deliveries as d
    where d.recipient_user_id = target.target_user_id
      and d.recipient_role = 'athlete'
  ) as athlete_delivery_rows,
  fs.state -> 'program' ->> 'nextWorkout' as next_workout,
  fs.state ->> 'selectedWorkout' as selected_workout
from public.foundry_state as fs
cross join target
where fs.user_id = target.target_user_id;

-- Expected athlete results:
--   history_count = 0
--   active_workout = null
--   readiness_count = 0
--   nutrition_day_keys = 0
--   nutrition_days_rows = 0
--   weekly_check_in_rows = 0
--   athlete_subject_assignment_rows = 0
--   self_assigned_assignment_rows = 0
--   next_workout = 'Legs + Core'
--   selected_workout = 'Legs + Core'
--   onboarding_completed = true

-- ── Coach/business should be unchanged (compare to precheck preserve counts) ─

with target as (
  select u.id as target_user_id
  from auth.users as u
  where lower(u.email) = lower('hello@avarenfitness.com')
  limit 1
)
select
  (select count(*) from public.coach_business_clients as bc where bc.coach_id = target.target_user_id) as business_clients,
  (select count(*) from public.coach_clients as cc where cc.coach_id = target.target_user_id) as connected_clients,
  (select count(*) from public.coach_assignments as ca where ca.coach_id = target.target_user_id and ca.athlete_id <> target.target_user_id) as client_assignments,
  (select count(*) from public.coach_scheduled_sessions as css where css.coach_id = target.target_user_id) as coach_appointments,
  (select count(*) from public.coach_client_passes as cp where cp.coach_id = target.target_user_id) as pass_rows,
  (select count(*) from public.coach_client_pass_ledger as cpl where cpl.coach_id = target.target_user_id) as ledger_rows,
  (select count(*) from public.coach_programs as p where p.coach_id = target.target_user_id) as program_templates,
  (select count(*) from public.coach_workout_templates as wt where wt.coach_id = target.target_user_id) as workout_templates,
  (select count(*) from public.coach_client_notes as n where n.coach_id = target.target_user_id) as client_notes,
  (select count(*) from public.coach_client_followups as f where f.coach_id = target.target_user_id) as coach_followups,
  (
    select count(*)
    from public.coach_notifications as cn
    where cn.recipient_id = target.target_user_id
      and cn.type in (
        'assignment-completed',
        'coach-comment',
        'session-rsvp-confirmed',
        'session-rsvp-declined',
        'session-reminder',
        'appointment-athlete-confirmed',
        'appointment-athlete-cannot-attend',
        'appointment-coach-reminder-2h'
      )
  ) as coach_operational_notifications
from target;

-- ── Backup snapshot confirmation ─────────────────────────────────────────────

select
  'foundry_state' as backup_table,
  count(*) as backup_rows,
  max(backed_up_at) as latest_backup
from _avaren_reset_backup.foundry_state
union all
select 'nutrition_days', count(*), max(backed_up_at)
from _avaren_reset_backup.nutrition_days
union all
select 'athlete_weekly_check_ins', count(*), max(backed_up_at)
from _avaren_reset_backup.athlete_weekly_check_ins
union all
select 'coach_assignments', count(*), max(backed_up_at)
from _avaren_reset_backup.coach_assignments
union all
select 'coach_notifications', count(*), max(backed_up_at)
from _avaren_reset_backup.coach_notifications
union all
select 'appointment_notification_deliveries', count(*), max(backed_up_at)
from _avaren_reset_backup.appointment_notification_deliveries;

-- Manual app checks after DB verification:
--   1. Run applyLocalAthleteReset() once in browser console OR use Account dev hook when wired.
--   2. Confirm Home has no stale completed workout.
--   3. Confirm Coach Hub client/appointment/pass counts match pre-reset notes.
--   4. Confirm push still enabled.
