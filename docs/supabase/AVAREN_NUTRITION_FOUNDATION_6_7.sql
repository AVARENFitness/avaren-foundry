-- AVAREN Sprint 6.7 — Nutrition Foundation
begin;

create table if not exists public.nutrition_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goals jsonb not null default '{}'::jsonb,
  coach_access boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.nutrition_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

alter table public.nutrition_profiles enable row level security;
alter table public.nutrition_days enable row level security;

drop policy if exists nutrition_profiles_owner on public.nutrition_profiles;
create policy nutrition_profiles_owner on public.nutrition_profiles
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists nutrition_days_owner on public.nutrition_days;
create policy nutrition_days_owner on public.nutrition_days
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists nutrition_profiles_coach_read on public.nutrition_profiles;
create policy nutrition_profiles_coach_read on public.nutrition_profiles
for select to authenticated
using (
  coach_access = true and exists (
    select 1 from public.coach_clients cc
    where cc.coach_id = auth.uid() and cc.athlete_id = nutrition_profiles.user_id
  )
);

drop policy if exists nutrition_days_coach_read on public.nutrition_days;
create policy nutrition_days_coach_read on public.nutrition_days
for select to authenticated
using (
  exists (
    select 1 from public.nutrition_profiles np
    join public.coach_clients cc on cc.athlete_id = np.user_id
    where np.user_id = nutrition_days.user_id
      and np.coach_access = true
      and cc.coach_id = auth.uid()
  )
);

commit;
