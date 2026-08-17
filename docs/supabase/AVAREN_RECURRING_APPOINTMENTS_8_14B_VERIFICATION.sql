-- AVAREN 8.14B — Recurring Appointments (VERIFICATION)
-- DO NOT RUN without explicit approval.
-- Post-migration checks (read-only).

-- 1) Series table present
select
  case
    when to_regclass('public.coach_appointment_series') is null then 'FAIL'
    else 'OK'
  end as coach_appointment_series_table;

-- 2) Recurrence columns on concrete appointments
select
  column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'coach_scheduled_sessions'
  and column_name in (
    'recurrence_series_id',
    'recurrence_occurrence_date',
    'recurrence_exception'
  )
order by column_name;

-- 3) Unique occurrence identity index
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'coach_scheduled_sessions'
  and indexname = 'coach_scheduled_sessions_series_occurrence_unique';

-- 4) Series notification types allowed
select pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.coach_notifications'::regclass
  and conname = 'coach_notifications_type_check';

-- 5) RPCs installed
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'create_recurring_appointment_series',
    'materialize_recurring_appointment_series',
    'update_recurring_appointment_occurrence',
    'update_recurring_appointment_series_future',
    'cancel_recurring_appointment_occurrence',
    'cancel_recurring_appointment_series_future',
    'enqueue_appointment_series_notification',
    'set_recurrence_bulk_lifecycle_suppressed',
    'preflight_recurring_appointment_conflicts',
    'extend_recurring_appointment_horizons',
    'appointment_series_notification_dedupe_key'
  )
order by proname;

-- 6) Lifecycle trigger still present
select tgname
from pg_trigger
where tgrelid = 'public.coach_scheduled_sessions'::regclass
  and tgname = 'coach_scheduled_sessions_appointment_notify_trigger';

-- 7) Sample: recurring rows should have series_id + occurrence_date when present
select
  count(*) filter (where recurrence_series_id is not null) as recurring_rows,
  count(*) filter (
    where recurrence_series_id is not null
      and recurrence_occurrence_date is null
  ) as invalid_recurring_rows
from public.coach_scheduled_sessions;

-- 8) Sample: no duplicate occurrence identities
select
  recurrence_series_id,
  recurrence_occurrence_date,
  count(*) as duplicate_count
from public.coach_scheduled_sessions
where recurrence_series_id is not null
group by 1, 2
having count(*) > 1;

-- 9) Series delivery ledger column
select
  column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'appointment_notification_deliveries'
  and column_name = 'recurrence_series_id';

-- 10) Series dedupe helper installed
select
  case
    when to_regprocedure('public.appointment_series_notification_dedupe_key(uuid,text,text)') is null
      then 'FAIL'
    else 'OK'
  end as series_dedupe_function;

-- 11) Series notifications should enqueue delivery ledger rows (sample audit)
select
  notification_type,
  count(*) as delivery_rows
from public.appointment_notification_deliveries
where notification_type like 'appointment-series-%'
group by 1
order by 1;

-- 12) Series create should not also create per-occurrence scheduled rows (sample audit)
select
  count(*) filter (where n.type = 'appointment-series-created') as series_created_notifications,
  count(*) filter (where n.type = 'appointment-scheduled') as occurrence_scheduled_notifications
from public.coach_notifications as n
join public.coach_scheduled_sessions as s
  on s.id = n.scheduled_session_id
where s.recurrence_series_id is not null
  and n.created_at > now() - interval '7 days';

-- 14) Overlap guard uses stable AVAREN overlap SQLSTATE
select
  case
    when pg_get_functiondef(p.oid) like '%errcode = ''99001''%'
      then 'OK'
    else 'FAIL'
  end as overlap_sqlstate_check
from pg_proc as p
where p.pronamespace = 'public'::regnamespace
  and p.proname = 'coach_scheduled_sessions_overlap_guard';

-- 15) coach_appointment_series authenticated privileges must be SELECT-only
select
  'coach_appointment_series' as table_name,
  case
    when to_regclass('public.coach_appointment_series') is null then 'SKIP'
    when not exists (
      select 1
      from information_schema.role_table_grants as g
      where g.table_schema = 'public'
        and g.table_name = 'coach_appointment_series'
        and g.grantee = 'authenticated'
        and g.privilege_type = 'SELECT'
    ) then 'FAIL: authenticated missing SELECT'
    when exists (
      select 1
      from information_schema.role_table_grants as g
      where g.table_schema = 'public'
        and g.table_name = 'coach_appointment_series'
        and g.grantee = 'authenticated'
        and g.privilege_type in (
          'INSERT',
          'UPDATE',
          'DELETE',
          'TRUNCATE',
          'REFERENCES',
          'TRIGGER'
        )
    ) then 'FAIL: authenticated has extra privileges'
    else 'OK'
  end as authenticated_privileges_check;

-- 16) coach_appointment_series_conflicts authenticated privileges must be SELECT-only
select
  'coach_appointment_series_conflicts' as table_name,
  case
    when to_regclass('public.coach_appointment_series_conflicts') is null then 'SKIP'
    when not exists (
      select 1
      from information_schema.role_table_grants as g
      where g.table_schema = 'public'
        and g.table_name = 'coach_appointment_series_conflicts'
        and g.grantee = 'authenticated'
        and g.privilege_type = 'SELECT'
    ) then 'FAIL: authenticated missing SELECT'
    when exists (
      select 1
      from information_schema.role_table_grants as g
      where g.table_schema = 'public'
        and g.table_name = 'coach_appointment_series_conflicts'
        and g.grantee = 'authenticated'
        and g.privilege_type in (
          'INSERT',
          'UPDATE',
          'DELETE',
          'TRUNCATE',
          'REFERENCES',
          'TRIGGER'
        )
    ) then 'FAIL: authenticated has extra privileges'
    else 'OK'
  end as authenticated_privileges_check;

-- 16a) Detail: any forbidden authenticated privileges still present
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
  and privilege_type in (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER'
  )
order by table_name, privilege_type;

-- 17) Horizon conflict ledger present
select
  case
    when to_regclass('public.coach_appointment_series_conflicts') is null then 'FAIL'
    else 'OK'
  end as coach_appointment_series_conflicts_table;

-- 18) Conflict helper RPCs installed
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'recurrence_occurrence_date_is_accounted_for',
    'record_recurring_appointment_series_conflict',
    'resolve_eligible_recurrence_conflicts'
  )
order by proname;

-- 19) Occurrence slots count sessions UNION conflicts
select
  case
    when pg_get_functiondef(p.oid) like '%coach_appointment_series_conflicts%'
      and pg_get_functiondef(p.oid) like '%union%'
    then 'OK'
    else 'FAIL'
  end as occurrence_slot_union_check
from pg_proc as p
where p.pronamespace = 'public'::regnamespace
  and p.proname = 'count_recurrence_series_occurrence_slots';

-- 20) Daily worker selects unresolved conflicts
select
  case
    when pg_get_functiondef(p.oid) like '%status = ''unresolved''%'
      and pg_get_functiondef(p.oid) like '%conflictsRemaining%'
    then 'OK'
    else 'FAIL'
  end as daily_conflict_worker_check
from pg_proc as p
where p.pronamespace = 'public'::regnamespace
  and p.proname = 'extend_recurring_appointment_horizons';

-- 21) Past conflicts waive instead of retroactive schedule
select
  case
    when pg_get_functiondef(p.oid) like '%v_ends_at <= now()%'
      and pg_get_functiondef(p.oid) like '%waived%'
    then 'OK'
    else 'FAIL'
  end as past_conflict_waive_check
from pg_proc as p
where p.pronamespace = 'public'::regnamespace
  and p.proname = 'resolve_eligible_recurrence_conflicts';

-- 22) In-run occurrence_limit increments on new conflict records
select
  case
    when pg_get_functiondef(p.oid) like '%v_conflict_recorded%'
      and pg_get_functiondef(p.oid) like '%v_occurrence_slots := v_occurrence_slots + 1%'
    then 'OK'
    else 'FAIL'
  end as in_run_occurrence_limit_check
from pg_proc as p
where p.pronamespace = 'public'::regnamespace
  and p.proname = 'materialize_recurring_appointment_series';

-- 23) Overlap guard trigger installed on coach_scheduled_sessions
select
  case
    when exists (
      select 1
      from pg_trigger as t
      where t.tgrelid = 'public.coach_scheduled_sessions'::regclass
        and t.tgname = 'coach_scheduled_sessions_overlap_guard'
        and not t.tgisinternal
    ) then 'OK'
    else 'FAIL'
  end as overlap_guard_trigger_check;

-- 24) btree_gist extension installed
select
  case
    when exists (select 1 from pg_extension where extname = 'btree_gist')
      then 'OK'
    else 'FAIL'
  end as btree_gist_extension_check;

-- 25) Concurrency-safe overlap exclusion constraint installed
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.coach_scheduled_sessions'::regclass
  and conname = 'coach_scheduled_sessions_no_overlap';

-- 26) Materializer handles trigger + exclusion overlap discriminators
select
  case
    when pg_get_functiondef(p.oid) like '%23P01%'
      and pg_get_functiondef(p.oid) like '%99001%'
    then 'OK'
    else 'FAIL'
  end as overlap_sqlstate_dual_handling_check
from pg_proc as p
where p.pronamespace = 'public'::regnamespace
  and p.proname = 'materialize_recurring_appointment_series';
