-- AVAREN Coach Business Hub — Session Packages (Part 1)
-- Run once AFTER the Sprint 6.7 coach migrations.

begin;

create table if not exists public.coach_session_packages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  total_sessions integer not null default 0 check (total_sessions >= 0),
  sessions_remaining integer not null default 0 check (sessions_remaining >= 0),
  sessions_used integer not null default 0 check (sessions_used >= 0),
  purchased_at date,
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, athlete_id)
);

create table if not exists public.coach_session_history (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.coach_session_packages(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null default (timezone('utc', now()))::date,
  coach_label text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists coach_session_history_client_idx
  on public.coach_session_history (coach_id, athlete_id, session_date desc);

alter table public.coach_session_packages enable row level security;
alter table public.coach_session_history enable row level security;

drop policy if exists coach_session_packages_coach_all on public.coach_session_packages;
create policy coach_session_packages_coach_all on public.coach_session_packages
for all to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (
  coach_id = auth.uid()
  and public.is_avaren_coach()
  and exists (
    select 1 from public.coach_clients
    where coach_id = auth.uid()
      and athlete_id = coach_session_packages.athlete_id
  )
);

drop policy if exists coach_session_history_coach_all on public.coach_session_history;
create policy coach_session_history_coach_all on public.coach_session_history
for all to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (
  coach_id = auth.uid()
  and public.is_avaren_coach()
  and exists (
    select 1 from public.coach_clients
    where coach_id = auth.uid()
      and athlete_id = coach_session_history.athlete_id
  )
);

commit;
