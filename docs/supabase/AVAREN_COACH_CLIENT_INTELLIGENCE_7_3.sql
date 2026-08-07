-- AVAREN Sprint 7.3 — Coach read access for client intelligence
-- Enables connected coaches to read athlete foundry_state (training history, readiness, mobility).
-- Idempotent: safe to run multiple times.

begin;

create table if not exists public.foundry_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.foundry_state enable row level security;

drop policy if exists foundry_state_owner on public.foundry_state;
create policy foundry_state_owner on public.foundry_state
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists foundry_state_coach_read on public.foundry_state;
create policy foundry_state_coach_read on public.foundry_state
for select to authenticated
using (
  exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = foundry_state.user_id
  )
);

commit;
