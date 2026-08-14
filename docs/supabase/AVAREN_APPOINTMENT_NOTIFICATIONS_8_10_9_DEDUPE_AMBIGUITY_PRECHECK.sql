-- AVAREN 8.10.9 — Dedupe key PL/pgSQL ambiguity precheck (READ ONLY)
-- Run before applying AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_9_DEDUPE_AMBIGUITY_FIX.sql

-- A. Table-level unique constraints on appointment_notification_deliveries.dedupe_key

select
  c.conname as constraint_name,
  c.contype as constraint_type,
  pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint as c
join pg_class as rel on rel.oid = c.conrelid
join pg_namespace as nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'appointment_notification_deliveries'
  and c.contype = 'u'
order by c.conname;

-- B. All indexes touching dedupe_key (including partial unique indexes)

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'appointment_notification_deliveries'
  and indexdef ilike '%dedupe_key%'
order by indexname;

-- C. Distinguish constraint-backed uniqueness vs index-only uniqueness

select
  c.conname as object_name,
  'constraint' as object_kind,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint as c
join pg_class as rel on rel.oid = c.conrelid
join pg_namespace as nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'appointment_notification_deliveries'
  and c.conname = 'appointment_notification_deliveries_dedupe_key_unique'

union all

select
  i.relname as object_name,
  case
    when ix.indisunique and c.oid is null then 'unique_index_only'
    when ix.indisunique and c.oid is not null then 'unique_index_backed_by_constraint'
    else 'non_unique_index'
  end as object_kind,
  pg_get_indexdef(i.oid) as definition
from pg_class as t
join pg_namespace as nsp on nsp.oid = t.relnamespace
join pg_index as ix on ix.indrelid = t.oid
join pg_class as i on i.oid = ix.indexrelid
left join pg_constraint as c on c.conindid = i.oid
where nsp.nspname = 'public'
  and t.relname = 'appointment_notification_deliveries'
  and pg_get_indexdef(i.oid) ilike '%dedupe_key%'
order by object_kind, object_name;

-- Expected for patch strategy:
--   appointment_notification_deliveries_dedupe_key_unique exists as constraint (contype = u)
--   ON CONFLICT ON CONSTRAINT appointment_notification_deliveries_dedupe_key_unique is valid

-- D. Current claim function still contains ambiguous conflict target?

select
  pg_get_functiondef(
    to_regprocedure('public.claim_appointment_reminder_targets(integer, integer)')
  ) like '%ON CONFLICT (dedupe_key)%' as has_ambiguous_on_conflict_target,
  pg_get_functiondef(
    to_regprocedure('public.claim_appointment_reminder_targets(integer, integer)')
  ) like '%ON CONFLICT ON CONSTRAINT appointment_notification_deliveries_dedupe_key_unique%' as has_constraint_conflict_target;

-- Expected before patch:
--   has_ambiguous_on_conflict_target = true
-- Expected after patch:
--   has_constraint_conflict_target = true
