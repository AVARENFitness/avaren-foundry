-- AVAREN 8.10.3 -- Appointment Notifications verification
-- Run after migration approval and edge function deployment.

-- A. Schema presence

select
  to_regclass('public.appointment_notification_deliveries') is not null
    as delivery_table_present;

select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointment_notification_deliveries'
      and column_name = 'claimed_at'
  ) as delivery_claimed_at_present,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointment_notification_deliveries'
      and column_name = 'claim_expires_at'
  ) as delivery_claim_expires_at_present;

select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coach_scheduled_sessions'
      and column_name = 'coach_reminder_sent_at'
  ) as coach_reminder_sent_at_present;

-- B. Notification type constraint includes legacy + appointment types

select
  conname,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint as c
where c.conrelid = to_regclass('public.coach_notifications')
  and c.conname = 'coach_notifications_type_check';

-- C. Claim lifecycle RPC presence + grants

select
  p.proname,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_appointment_reminder_targets',
    'complete_appointment_reminder_delivery',
    'release_appointment_reminder_claim',
    'invalidate_stale_appointment_reminder_deliveries',
    'update_scheduled_session_rsvp'
  )
order by p.proname;

-- D. Lifecycle dedupe includes transition identity for reschedule/cancel

select pg_get_functiondef(to_regprocedure('public.appointment_notification_dedupe_key(uuid, uuid, text, timestamptz, text)'))
  as appointment_notification_dedupe_key_def;

-- Expected transition_identity participation for:
-- appointment-rescheduled, appointment-cancelled,
-- appointment-athlete-confirmed, appointment-athlete-cannot-attend

-- E. Reminder reset trigger is SECURITY DEFINER and not directly executable by authenticated

select
  p.prosecdef as reset_trigger_security_definer,
  has_function_privilege(
    'authenticated',
    'public.reset_session_reminder_on_schedule_change()',
    'EXECUTE'
  ) as authenticated_can_execute_reset_trigger_fn
from pg_proc as p
where p.oid = to_regprocedure('public.reset_session_reminder_on_schedule_change()');

select pg_get_functiondef(to_regprocedure('public.reset_session_reminder_on_schedule_change()'))
  as reset_session_reminder_on_schedule_change_def;

-- Expected:
-- reset_trigger_security_definer = true
-- authenticated_can_execute_reset_trigger_fn = false
-- function body contains coach_reminder_sent_at := null

-- F. invalidate_stale helper remains service_role only

select
  has_function_privilege(
    'authenticated',
    'public.invalidate_stale_appointment_reminder_deliveries(uuid, timestamptz, timestamptz)',
    'EXECUTE'
  ) as authenticated_can_execute_invalidate_helper;

-- Expected: false

-- G. RSVP RPC preserves linked_user_id auth + wrapped response

select pg_get_functiondef(to_regprocedure('public.update_scheduled_session_rsvp(uuid, text)'))
  as update_scheduled_session_rsvp_def;

-- G. Successful delivery cannot duplicate

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'appointment_notification_deliveries'
  and indexname in (
    'appointment_notification_deliveries_dedupe_key_unique',
    'appointment_notification_deliveries_sent_dedupe_idx'
  );

-- H. Staging manual scenarios
-- 1. Authenticated coach reschedules appointment via normal app path; update succeeds.
-- 2. reminder_sent_at and coach_reminder_sent_at reset to null.
-- 3. stale reminder deliveries for old canonical_start_at become skipped.
-- 4. Claim expired delivery reclaims after TTL.
-- 5. Failed delivery retries and succeeds once.
-- 6. RSVP sequence: awaiting->confirmed, retry, confirmed->cannot_attend, cannot_attend->confirmed.

select
  n.scheduled_session_id,
  n.type,
  n.dedupe_key,
  n.created_at
from public.coach_notifications as n
where n.type in (
  'appointment-athlete-confirmed',
  'appointment-athlete-cannot-attend'
)
order by n.created_at desc
limit 20;

-- I. Cannot-attend suppression uses open SCHEDULE_CONFLICT follow-up

select
  s.id,
  s.rsvp_status,
  f.id as open_follow_up_id,
  f.reason_type,
  f.status
from public.coach_scheduled_sessions as s
left join public.coach_client_followups as f
  on f.scheduled_session_id = s.id
 and f.reason_type = 'SCHEDULE_CONFLICT'
 and f.status = 'open'
where s.status = 'scheduled'
  and s.rsvp_status = 'cannot_attend'
order by s.starts_at
limit 20;

-- J. No retroactive scheduled flood

select
  count(*) as retroactive_scheduled_notifications
from public.coach_notifications as n
where n.type = 'appointment-scheduled';

-- K. Legacy worker cutover check (manual dashboard review required)

select
  type,
  count(*) as count_last_24h
from public.coach_notifications
where created_at >= now() - interval '24 hours'
  and type in (
    'session-reminder',
    'appointment-athlete-reminder-2h',
    'appointment-coach-reminder-2h'
  )
group by type
order by type;

-- L. Security checks

select
  has_table_privilege('anon', 'public.appointment_notification_deliveries', 'SELECT')
    as anon_can_select_deliveries,
  has_function_privilege(
    'authenticated',
    'public.claim_appointment_reminder_targets(integer, integer)',
    'EXECUTE'
  ) as authenticated_can_claim_reminders;

-- Expected:
-- anon_can_select_deliveries = false
-- authenticated_can_claim_reminders = false

-- M. RLS on delivery ledger

select
  pol.polname,
  pg_get_expr(pol.polqual, pol.polrelid) as using_expr
from pg_policy as pol
where pol.polrelid = to_regclass('public.appointment_notification_deliveries');
