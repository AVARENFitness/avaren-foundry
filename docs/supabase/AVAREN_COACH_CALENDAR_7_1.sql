-- AVAREN Sprint 7.1 — Coach Calendar + Athlete Package Read Access
-- Run once AFTER AVAREN_COACH_BUSINESS_PACKAGES_6_8.sql

begin;

-- Athletes may read their own session package summary (read-only).
drop policy if exists coach_session_packages_athlete_select on public.coach_session_packages;
create policy coach_session_packages_athlete_select on public.coach_session_packages
for select to authenticated
using (athlete_id = auth.uid());

create table if not exists public.coach_scheduled_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  start_time time not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  coach_note text not null default '',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  completed_at timestamptz,
  session_history_id uuid references public.coach_session_history(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_scheduled_sessions_coach_date_idx
  on public.coach_scheduled_sessions (coach_id, session_date, start_time);

create index if not exists coach_scheduled_sessions_athlete_date_idx
  on public.coach_scheduled_sessions (athlete_id, session_date);

alter table public.coach_scheduled_sessions enable row level security;

drop policy if exists coach_scheduled_sessions_coach_all on public.coach_scheduled_sessions;
create policy coach_scheduled_sessions_coach_all on public.coach_scheduled_sessions
for all to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (
  coach_id = auth.uid()
  and public.is_avaren_coach()
  and exists (
    select 1 from public.coach_clients
    where coach_id = auth.uid()
      and athlete_id = coach_scheduled_sessions.athlete_id
  )
);

commit;
