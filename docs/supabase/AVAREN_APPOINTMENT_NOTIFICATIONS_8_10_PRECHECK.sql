-- AVAREN 8.10.3 -- Appointment Notifications precheck (READ ONLY)
-- Safe to run before migration. Missing optional objects return empty/null rows.

-- A. Core tables

select
  'coach_scheduled_sessions' as object_name,
  to_regclass('public.coach_scheduled_sessions') is not null as present
union all
select
  'coach_notifications',
  to_regclass('public.coach_notifications') is not null
union all
select
  'push_subscriptions',
  to_regclass('public.push_subscriptions') is not null
union all
select
  'coach_business_clients',
  to_regclass('public.coach_business_clients') is not null
union all
select
  'coach_client_followups',
  to_regclass('public.coach_client_followups') is not null
union all
select
  'appointment_notification_deliveries',
  to_regclass('public.appointment_notification_deliveries') is not null;

-- B. LIVE function definitions (missing functions report text instead of error)

select
  'update_scheduled_session_rsvp(uuid, text)' as function_name,
  case
    when to_regprocedure('public.update_scheduled_session_rsvp(uuid, text)') is null then
      'MISSING'
    else
      pg_get_functiondef(to_regprocedure('public.update_scheduled_session_rsvp(uuid, text)'))
  end as function_definition;

select
  'reset_session_reminder_on_schedule_change()' as function_name,
  case
    when to_regprocedure('public.reset_session_reminder_on_schedule_change()') is null then
      'MISSING'
    else
      pg_get_functiondef(to_regprocedure('public.reset_session_reminder_on_schedule_change()'))
  end as function_definition;

select
  'claim_session_reminder_targets(integer, integer)' as function_name,
  case
    when to_regprocedure('public.claim_session_reminder_targets(integer, integer)') is null then
      'MISSING'
    else
      pg_get_functiondef(to_regprocedure('public.claim_session_reminder_targets(integer, integer)'))
  end as function_definition;

select
  'claim_appointment_reminder_targets(integer, integer)' as function_name,
  case
    when to_regprocedure('public.claim_appointment_reminder_targets(integer, integer)') is null then
      'MISSING (expected pre-migration)'
    else
      pg_get_functiondef(to_regprocedure('public.claim_appointment_reminder_targets(integer, integer)'))
  end as function_definition;

-- C. LIVE coach_notifications type constraint

select
  conname,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint as c
where c.conrelid = to_regclass('public.coach_notifications')
  and c.contype = 'c'
  and c.conname like '%type%';

-- D. Appointment canonical columns

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'coach_scheduled_sessions'
  and column_name in (
    'id',
    'coach_id',
    'athlete_id',
    'business_client_id',
    'session_date',
    'start_time',
    'starts_at',
    'ends_at',
    'schedule_timezone',
    'status',
    'rsvp_status',
    'rsvp_updated_at',
    'reminder_sent_at',
    'reminder_claimed_at',
    'reminder_claim_expires_at',
    'coach_reminder_sent_at'
  )
order by column_name;

-- E. Existing reminder / RSVP RPC inventory

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_session_reminder_targets',
    'complete_session_reminder',
    'release_session_reminder_claim',
    'update_scheduled_session_rsvp',
    'coach_session_wall_clock_to_starts_at',
    'claim_appointment_reminder_targets',
    'complete_appointment_reminder_delivery',
    'release_appointment_reminder_claim',
    'invalidate_stale_appointment_reminder_deliveries',
    'reset_session_reminder_on_schedule_change'
  )
order by p.proname;

-- F. Existing triggers on coach_scheduled_sessions

select
  t.tgname,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger as t
join pg_class as c on c.oid = t.tgrelid
where c.oid = to_regclass('public.coach_scheduled_sessions')
  and not t.tgisinternal
order by t.tgname;

-- G. Cron inventory (non-failing)

select
  exists (select 1 from pg_extension where extname = 'pg_cron') as pg_cron_extension_present,
  to_regclass('cron.job') is not null as cron_job_relation_present;

-- If cron_job_relation_present = true, run this separate query manually:
-- select jobid, schedule, command, active
-- from cron.job
-- where command ilike '%reminder%'
--    or command ilike '%session%'
--    or command ilike '%appointment%'
--    or command ilike '%push%'
-- order by jobid;

-- H. Repo-documented worker expectations
-- Legacy worker (if deployed): process-session-reminders
-- New worker (post-migration): process-appointment-reminders
-- Do not run both crons concurrently without approved cutover.

-- I. Indexes / RLS (safe when optional tables are absent)

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('coach_notifications', 'appointment_notification_deliveries')
  and to_regclass(format('public.%I', tablename)) is not null
order by indexname;

select
  pol.polname,
  n.nspname as schema_name,
  c.relname as table_name,
  pg_get_expr(pol.polqual, pol.polrelid) as using_expr
from pg_policy as pol
join pg_class as c on c.oid = pol.polrelid
join pg_namespace as n on n.oid = c.relnamespace
where pol.polrelid in (
  to_regclass('public.coach_notifications'),
  to_regclass('public.appointment_notification_deliveries')
)
order by pol.polname;

-- J. Linked athlete coverage (null when core table absent)

select
  case
    when to_regclass('public.coach_scheduled_sessions') is null then null::bigint
    else (
      select count(*)
      from public.coach_scheduled_sessions as s
      where s.status = 'scheduled'
        and s.starts_at >= now()
    )
  end as upcoming_total,
  case
    when to_regclass('public.coach_scheduled_sessions') is null then null::bigint
    else (
      select count(*)
      from public.coach_scheduled_sessions as s
      join public.coach_business_clients as bc on bc.id = s.business_client_id
      where s.status = 'scheduled'
        and s.starts_at >= now()
        and bc.linked_user_id is not null
    )
  end as upcoming_connected,
  case
    when to_regclass('public.coach_scheduled_sessions') is null then null::bigint
    else (
      select count(*)
      from public.coach_scheduled_sessions as s
      join public.coach_business_clients as bc on bc.id = s.business_client_id
      where s.status = 'scheduled'
        and s.starts_at >= now()
        and bc.linked_user_id is null
    )
  end as upcoming_offline;

-- K. Unsent legacy reminder backlog (null when core table absent)

select
  case
    when to_regclass('public.coach_scheduled_sessions') is null then null::bigint
    else (
      select count(*)
      from public.coach_scheduled_sessions as s
      where s.status = 'scheduled'
        and s.reminder_sent_at is null
        and s.starts_at is not null
        and s.starts_at > now()
        and s.starts_at - interval '2 hours' <= now()
    )
  end as legacy_due_unsent_reminders;

-- L. Migration prerequisites

select
  to_regclass('public.appointment_notification_deliveries') is null
    as delivery_table_missing,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coach_notifications'
      and column_name = 'dedupe_key'
  ) as coach_notifications_dedupe_key_present,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coach_scheduled_sessions'
      and column_name = 'coach_reminder_sent_at'
  ) as coach_reminder_sent_at_present;
