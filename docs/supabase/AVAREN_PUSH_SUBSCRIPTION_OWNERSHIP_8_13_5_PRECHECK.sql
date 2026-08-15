-- AVAREN 8.13.5 — Push subscription endpoint ownership (PRECHECK)
-- Read-only. Run before AVAREN_PUSH_SUBSCRIPTION_OWNERSHIP_8_13_5_MIGRATION.sql

-- 1) Table exists
select
  'push_subscriptions table' as check_name,
  to_regclass('public.push_subscriptions') is not null as ok;

-- 2) Endpoint uniqueness (one row per browser endpoint globally)
select
  'endpoint unique constraint' as check_name,
  exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'push_subscriptions'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%endpoint%'
  ) as ok;

-- 3) Active endpoint collisions across distinct user_ids
select
  left(endpoint, 16) || '…' || right(endpoint, 6) as endpoint_masked,
  count(distinct user_id) as distinct_users,
  array_agg(distinct user_id) as user_ids,
  count(*) filter (where active) as active_rows
from public.push_subscriptions
where active = true
group by endpoint
having count(distinct user_id) > 1;

-- 4) Duplicate active rows for same endpoint (should be impossible with unique endpoint)
select
  'duplicate active endpoint rows' as check_name,
  count(*) as collision_groups
from (
  select endpoint
  from public.push_subscriptions
  where active = true
  group by endpoint
  having count(*) > 1
) collisions;

-- 5) RPC not yet installed
select
  'register_push_subscription missing' as check_name,
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'register_push_subscription'
  ) as ok;
