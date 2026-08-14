-- AVAREN 8.10.10 — Schedule Session 42P10 precheck (READ ONLY)
-- Run before applying AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_10_SCHEDULE_CONFLICT_FIX.sql
-- DO NOT mutate schema.

-- A. Table-level unique constraints on dedupe_key (both notification tables)
select
  c.conrelid::regclass as table_name,
  c.conname as constraint_name,
  c.contype as constraint_type,
  pg_get_constraintdef(c.oid) as constraint_def
from pg_constraint as c
where c.connamespace = 'public'::regnamespace
  and c.conrelid in (
    'public.coach_notifications'::regclass,
    'public.appointment_notification_deliveries'::regclass
  )
  and pg_get_constraintdef(c.oid) ilike '%dedupe_key%'
order by 1, 2;

-- B. All indexes touching dedupe_key (including partial unique indexes)
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('coach_notifications', 'appointment_notification_deliveries')
  and indexdef ilike '%dedupe_key%'
order by tablename, indexname;

-- C. coach_notifications.dedupe_key column nullability
select
  table_name,
  column_name,
  is_nullable,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'coach_notifications'
  and column_name = 'dedupe_key';

-- D. appointment_notification_deliveries.dedupe_key column nullability
select
  table_name,
  column_name,
  is_nullable,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'appointment_notification_deliveries'
  and column_name = 'dedupe_key';

-- E. enqueue_appointment_notification ON CONFLICT targets (live function body)
select
  p.proname as function_name,
  pg_get_functiondef(p.oid) ilike '%on conflict (dedupe_key) do nothing%' as has_bare_dedupe_conflict,
  pg_get_functiondef(p.oid) ilike '%on conflict (dedupe_key) where dedupe_key is not null%' as has_partial_dedupe_conflict,
  pg_get_functiondef(p.oid) ilike '%on conflict on constraint appointment_notification_deliveries_dedupe_key_unique%' as has_delivery_constraint_conflict
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'enqueue_appointment_notification';

-- F. Insert trigger chain on coach_scheduled_sessions (schedule path)
select
  tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_def
from pg_trigger as t
join pg_class as c on c.oid = t.tgrelid
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'coach_scheduled_sessions'
  and not t.tgisinternal
order by tgname;

-- Expected live shape for 42P10 diagnosis:
--   appointment_notification_deliveries_dedupe_key_unique
--     UNIQUE CONSTRAINT on (dedupe_key) — supports ON CONFLICT (dedupe_key) or ON CONSTRAINT
--   coach_notifications_dedupe_key_unique
--     PARTIAL UNIQUE INDEX on (dedupe_key) WHERE dedupe_key IS NOT NULL
--     — bare ON CONFLICT (dedupe_key) raises 42P10; requires matching WHERE predicate
