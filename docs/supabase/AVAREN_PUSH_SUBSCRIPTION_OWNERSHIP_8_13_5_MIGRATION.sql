-- AVAREN 8.13.5 — Push subscription endpoint ownership (MIGRATION)
-- DO NOT RUN without review. Applies atomic endpoint ownership transfer.
-- Requires: public.push_subscriptions from AVAREN_PUSH_NOTIFICATIONS_6_4.sql

begin;

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default '',
  p_platform text default ''
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

  -- Release this browser endpoint from any prior account.
  update public.push_subscriptions
  set
    active = false,
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
    active = true,
    last_seen_at = now(),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text, text) from public;
grant execute on function public.register_push_subscription(text, text, text, text, text) to authenticated;

create or replace function public.deactivate_push_subscription(
  p_endpoint text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(trim(p_endpoint), '') = '' then
    return;
  end if;

  update public.push_subscriptions
  set
    active = false,
    updated_at = now()
  where endpoint = p_endpoint
    and user_id = v_uid
    and active = true;
end;
$$;

revoke all on function public.deactivate_push_subscription(text) from public;
grant execute on function public.deactivate_push_subscription(text) to authenticated;

commit;
