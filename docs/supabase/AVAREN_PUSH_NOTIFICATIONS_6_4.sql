-- AVAREN Sprint 6.4 — Phone Push Notifications
-- Run once in Supabase SQL Editor after Sprint 6.3.2.

begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  platform text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id, active);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own
  on public.push_subscriptions;
create policy push_subscriptions_select_own
on public.push_subscriptions for select to authenticated
using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert_own
  on public.push_subscriptions;
create policy push_subscriptions_insert_own
on public.push_subscriptions for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists push_subscriptions_update_own
  on public.push_subscriptions;
create policy push_subscriptions_update_own
on public.push_subscriptions for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete_own
  on public.push_subscriptions;
create policy push_subscriptions_delete_own
on public.push_subscriptions for delete to authenticated
using (user_id = auth.uid());

alter table public.coach_notifications
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_delivery_count integer not null default 0;

commit;
