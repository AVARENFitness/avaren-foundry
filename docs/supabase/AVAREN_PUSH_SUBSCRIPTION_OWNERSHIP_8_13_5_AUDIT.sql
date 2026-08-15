-- AVAREN 8.13.5 — Push subscription ownership audit (READ ONLY)
-- Returns masked endpoints only. Safe for support review.

-- Active endpoints claimed by more than one user (should be zero after migration + re-registration)
select
  left(endpoint, 16) || '…' || right(endpoint, 6) as endpoint_masked,
  count(distinct user_id) as users,
  array_agg(distinct user_id order by user_id) as user_ids,
  count(*) filter (where active) as active_rows
from public.push_subscriptions
where active = true
group by endpoint
having count(distinct user_id) > 1
order by users desc, endpoint_masked;

-- Per-user active subscription counts (multi-device is expected)
select
  user_id,
  count(*) as active_endpoints
from public.push_subscriptions
where active = true
group by user_id
order by active_endpoints desc, user_id;

-- Stale inactive rows (informational)
select
  count(*) as inactive_rows,
  count(*) filter (where updated_at > now() - interval '30 days') as inactive_recent
from public.push_subscriptions
where active = false;
