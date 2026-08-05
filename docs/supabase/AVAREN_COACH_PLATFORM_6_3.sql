-- AVAREN Sprint 6.3 — Coach Platform migration
-- Run once AFTER the Sprint 6.2 coach backend migration.
begin;

alter table public.coach_assignments
  add column if not exists priority text not null default 'normal'
    check (priority in ('normal','high','optional')),
  add column if not exists completion_summary jsonb;

create table if not exists public.coach_client_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  unique (coach_id, athlete_id)
);

alter table public.coach_client_notes enable row level security;
drop policy if exists coach_client_notes_select on public.coach_client_notes;
create policy coach_client_notes_select on public.coach_client_notes for select to authenticated using (coach_id = auth.uid());
drop policy if exists coach_client_notes_insert on public.coach_client_notes;
create policy coach_client_notes_insert on public.coach_client_notes for insert to authenticated with check (coach_id = auth.uid() and public.is_avaren_coach());
drop policy if exists coach_client_notes_update on public.coach_client_notes;
create policy coach_client_notes_update on public.coach_client_notes for update to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());

commit;
