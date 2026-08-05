-- AVAREN Sprint 6.5 — Coach Workout Designer
-- Run once after previous Coach Platform migrations.

begin;

create table if not exists public.coach_workout_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  workout_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_workout_templates_coach_idx
  on public.coach_workout_templates (coach_id, updated_at desc);

alter table public.coach_workout_templates enable row level security;

drop policy if exists coach_workout_templates_select on public.coach_workout_templates;
create policy coach_workout_templates_select
on public.coach_workout_templates for select to authenticated
using (coach_id = auth.uid());

drop policy if exists coach_workout_templates_insert on public.coach_workout_templates;
create policy coach_workout_templates_insert
on public.coach_workout_templates for insert to authenticated
with check (coach_id = auth.uid() and public.is_avaren_coach());

drop policy if exists coach_workout_templates_update on public.coach_workout_templates;
create policy coach_workout_templates_update
on public.coach_workout_templates for update to authenticated
using (coach_id = auth.uid())
with check (coach_id = auth.uid());

drop policy if exists coach_workout_templates_delete on public.coach_workout_templates;
create policy coach_workout_templates_delete
on public.coach_workout_templates for delete to authenticated
using (coach_id = auth.uid());

commit;
