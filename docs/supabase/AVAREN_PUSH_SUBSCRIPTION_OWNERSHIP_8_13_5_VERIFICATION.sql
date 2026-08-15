-- AVAREN 8.13.5 — Push subscription endpoint ownership (VERIFICATION)
-- Run after AVAREN_PUSH_SUBSCRIPTION_OWNERSHIP_8_13_5_MIGRATION.sql

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'register_push_subscription',
    'deactivate_push_subscription'
  )
order by p.proname;

-- No active endpoint should belong to more than one user_id
select
  case
    when count(*) = 0 then 'PASS: no active endpoint collisions'
    else 'FAIL: active endpoint collisions remain'
  end as collision_check,
  count(*) as collision_groups
from (
  select endpoint
  from public.push_subscriptions
  where active = true
  group by endpoint
  having count(distinct user_id) > 1
) collisions;
