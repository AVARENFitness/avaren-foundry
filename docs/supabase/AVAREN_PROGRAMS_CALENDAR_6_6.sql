-- AVAREN Sprint 6.6 — Programs & Coach Calendar
-- Run once after the existing Coach Platform migrations.

begin;

create table if not exists public.coach_schedule_items (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid references public.coach_assignments(id) on delete cascade,
  program_id uuid,
  kind text not null check (kind in ('workout','rest','deload','check-in')),
  title text not null,
  scheduled_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_schedule_coach_date_idx
  on public.coach_schedule_items (coach_id, scheduled_date);
create index if not exists coach_schedule_athlete_date_idx
  on public.coach_schedule_items (athlete_id, scheduled_date);

create table if not exists public.coach_programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  duration_weeks integer not null default 4 check (duration_weeks between 1 and 52),
  program_payload jsonb not null default '{"days":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_schedule_items enable row level security;
alter table public.coach_programs enable row level security;

drop policy if exists coach_schedule_visible on public.coach_schedule_items;
create policy coach_schedule_visible on public.coach_schedule_items
for select to authenticated
using (coach_id = auth.uid() or athlete_id = auth.uid());

drop policy if exists coach_schedule_coach_insert on public.coach_schedule_items;
create policy coach_schedule_coach_insert on public.coach_schedule_items
for insert to authenticated
with check (
  coach_id = auth.uid()
  and public.is_avaren_coach()
  and exists (
    select 1 from public.coach_clients
    where coach_id = auth.uid()
      and athlete_id = coach_schedule_items.athlete_id
  )
);

drop policy if exists coach_schedule_coach_update on public.coach_schedule_items;
create policy coach_schedule_coach_update on public.coach_schedule_items
for update to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (coach_id = auth.uid() and public.is_avaren_coach());

drop policy if exists coach_schedule_coach_delete on public.coach_schedule_items;
create policy coach_schedule_coach_delete on public.coach_schedule_items
for delete to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach());

drop policy if exists coach_programs_coach_all on public.coach_programs;
create policy coach_programs_coach_all on public.coach_programs
for all to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (coach_id = auth.uid() and public.is_avaren_coach());

-- Backfill calendar rows for active assignments so existing work appears immediately.
insert into public.coach_schedule_items (
  coach_id, athlete_id, assignment_id, kind, title, scheduled_date, notes
)
select
  coach_id, athlete_id, id, 'workout', title, due_date, coach_notes
from public.coach_assignments
where due_date is not null
  and status in ('assigned','started')
  and not exists (
    select 1 from public.coach_schedule_items item
    where item.assignment_id = coach_assignments.id
  );

commit;
