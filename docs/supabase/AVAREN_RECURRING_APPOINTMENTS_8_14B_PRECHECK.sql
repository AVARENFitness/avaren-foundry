-- AVAREN 8.14B — Recurring Appointments (PRECHECK)
-- DO NOT RUN without explicit approval.
-- Read-only dependency and schema audit before migration.

-- Expected existing dependencies:
--   public.coach_scheduled_sessions (AVAREN_COACH_CALENDAR_7_1.sql + 8.3 + 8.4/8.5)
--   public.coach_business_clients
--   public.appointment_notification_deliveries (AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_MIGRATION.sql)
--   public.coach_notifications

-- 1) Verify base appointment table exists
select
  case
    when to_regclass('public.coach_scheduled_sessions') is null then 'FAIL: coach_scheduled_sessions missing'
    else 'OK: coach_scheduled_sessions present'
  end as coach_scheduled_sessions_check;

-- 2) Verify notification delivery ledger exists
select
  case
    when to_regclass('public.appointment_notification_deliveries') is null then 'FAIL: appointment_notification_deliveries missing'
    else 'OK: appointment_notification_deliveries present'
  end as appointment_notification_deliveries_check;

-- 3) Current coach_scheduled_sessions columns (audit baseline)
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'coach_scheduled_sessions'
order by ordinal_position;

-- 4) Confirm recurrence columns are not already present
select
  count(*) filter (where column_name = 'recurrence_series_id') as recurrence_series_id_exists,
  count(*) filter (where column_name = 'recurrence_occurrence_date') as recurrence_occurrence_date_exists,
  count(*) filter (where column_name = 'recurrence_exception') as recurrence_exception_exists
from information_schema.columns
where table_schema = 'public'
  and table_name = 'coach_scheduled_sessions';

-- 5) Confirm series table not already present
select
  case
    when to_regclass('public.coach_appointment_series') is null then 'OK: coach_appointment_series absent (expected pre-migration)'
    else 'WARN: coach_appointment_series already exists'
  end as coach_appointment_series_check;

-- 5a) Informational: authenticated privileges if recurrence tables already exist
select
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'coach_appointment_series',
    'coach_appointment_series_conflicts'
  )
  and grantee = 'authenticated'
order by table_name, privilege_type;

-- 6) Notification type constraint audit
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.coach_notifications'::regclass
  and contype = 'c'
  and conname like '%type%';

-- 7) Lifecycle trigger audit
select
  tgname,
  pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.coach_scheduled_sessions'::regclass
  and not tgisinternal
order by tgname;

-- 8) Overlap guard trigger audit
select
  tgname
from pg_trigger
where tgrelid = 'public.coach_scheduled_sessions'::regclass
  and tgname like '%overlap%';

-- 9) Athlete schedule RPC audit
select
  proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'list_athlete_scheduled_sessions',
    'update_scheduled_session_rsvp',
    'claim_appointment_reminder_targets'
  )
order by proname;

-- 11) Delivery ledger dedupe constraint present (series notifications reuse ledger)
select
  case
    when exists (
      select 1
      from pg_constraint
      where conname = 'appointment_notification_deliveries_dedupe_key_unique'
    ) then 'OK: delivery dedupe constraint present'
    else 'FAIL: delivery dedupe constraint missing'
  end as delivery_dedupe_constraint_check;

-- 12) Cron worker auth pattern available for horizon extension edge function
select
  case
    when current_setting('app.settings.cron_worker_secret_keys', true) is not null
      then 'OK: cron worker secret keys configured'
    else 'WARN: cron worker secret keys not visible in this session'
  end as cron_worker_secret_check;

-- 10) Sample appointment volume (sanity)
select
  status,
  count(*) as row_count
from public.coach_scheduled_sessions
group by status
order by status;

-- 13) btree_gist extension availability (required for overlap exclusion constraint)
select
  extname,
  extversion,
  n.nspname as schema_name
from pg_extension as e
join pg_namespace as n on n.oid = e.extnamespace
where e.extname = 'btree_gist';

select
  name,
  default_version,
  installed_version,
  case
    when installed_version is not null then 'OK: installed'
    when default_version is not null then 'OK: available (will CREATE EXTENSION IF NOT EXISTS)'
    else 'FAIL: btree_gist unavailable'
  end as btree_gist_status
from pg_available_extensions
where name = 'btree_gist';

-- 14) Scheduled rows missing canonical instants (exclusion partial-index scope)
select
  count(*) filter (
    where status = 'scheduled'
      and (starts_at is null or ends_at is null)
  ) as scheduled_missing_canonical_instants,
  count(*) filter (
    where status = 'scheduled'
      and starts_at is not null
      and ends_at is not null
  ) as scheduled_with_canonical_instants
from public.coach_scheduled_sessions;

-- 15) BLOCKING: existing overlapping scheduled appointments (must be 0 before migration)
select
  a.coach_id,
  a.id as appointment_a_id,
  b.id as appointment_b_id,
  a.session_date as appointment_a_date,
  a.start_time as appointment_a_start_time,
  a.starts_at as appointment_a_starts_at,
  a.ends_at as appointment_a_ends_at,
  b.session_date as appointment_b_date,
  b.start_time as appointment_b_start_time,
  b.starts_at as appointment_b_starts_at,
  b.ends_at as appointment_b_ends_at
from public.coach_scheduled_sessions as a
join public.coach_scheduled_sessions as b
  on a.coach_id = b.coach_id
  and a.id < b.id
  and a.status = 'scheduled'
  and b.status = 'scheduled'
  and a.starts_at is not null
  and a.ends_at is not null
  and b.starts_at is not null
  and b.ends_at is not null
  and a.starts_at < b.ends_at
  and b.starts_at < a.ends_at
order by a.coach_id, a.starts_at, b.starts_at;

-- 16) Overlap guard trigger definition (must exist pre/post migration)
select
  tgname,
  pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.coach_scheduled_sessions'::regclass
  and tgname = 'coach_scheduled_sessions_overlap_guard';

-- 17) Existing overlap exclusion constraint audit (expected absent pre-migration)
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.coach_scheduled_sessions'::regclass
  and contype = 'x'
order by conname;
