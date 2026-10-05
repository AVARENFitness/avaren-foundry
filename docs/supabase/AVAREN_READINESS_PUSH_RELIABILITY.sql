-- AVAREN reliability: local-day readiness + device-timezone push reminders
-- Applied to production as migration: readiness_local_day_push_reliability

begin;

alter table public.push_subscriptions
  add column if not exists timezone text not null default '';

create index if not exists push_subscriptions_active_timezone_idx
  on public.push_subscriptions (active, timezone)
  where active = true;

create or replace function public.register_push_subscription_v2(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default '',
  p_platform text default '',
  p_timezone text default ''
)
returns public.push_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.push_subscriptions;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(trim(p_endpoint), '') = '' then
    raise exception 'endpoint is required';
  end if;

  update public.push_subscriptions
  set active = false,
      updated_at = now()
  where endpoint = p_endpoint
    and user_id <> v_uid
    and active = true;

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    platform,
    timezone,
    active,
    last_seen_at,
    updated_at
  )
  values (
    v_uid,
    p_endpoint,
    p_p256dh,
    p_auth,
    coalesce(p_user_agent, ''),
    coalesce(p_platform, ''),
    left(coalesce(p_timezone, ''), 80),
    true,
    now(),
    now()
  )
  on conflict (endpoint) do update
  set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    platform = excluded.platform,
    timezone = excluded.timezone,
    active = true,
    last_seen_at = now(),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.register_push_subscription_v2(text,text,text,text,text,text)
  from public, anon;
grant execute on function public.register_push_subscription_v2(text,text,text,text,text,text)
  to authenticated;

create table if not exists public.smart_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_type text not null
    check (reminder_type in ('daily_readiness')),
  local_date date not null,
  timezone text not null default '',
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending','sent','failed','skipped')),
  subscription_count integer not null default 0,
  delivered_count integer not null default 0,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint smart_reminder_deliveries_unique
    unique (user_id, reminder_type, local_date)
);

create index if not exists smart_reminder_deliveries_user_date_idx
  on public.smart_reminder_deliveries (user_id, local_date desc);

alter table public.smart_reminder_deliveries enable row level security;

revoke all on public.smart_reminder_deliveries
  from public, anon, authenticated;
grant all on public.smart_reminder_deliveries to service_role;

commit;
