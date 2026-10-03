create table if not exists public.athlete_goals (
  athlete_id uuid primary key references auth.users(id) on delete cascade,
  primary_goal text not null check (
    primary_goal in ('lose_fat','maintain','build_muscle','performance','consistency','general_fitness')
  ),
  target_label text not null default '',
  target_value numeric null,
  target_unit text not null default '',
  target_date date null,
  priority_areas text[] not null default '{}',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.athlete_goals enable row level security;

drop policy if exists athlete_goals_owner on public.athlete_goals;
create policy athlete_goals_owner
on public.athlete_goals
for all
using (athlete_id = auth.uid())
with check (athlete_id = auth.uid());

drop policy if exists athlete_goals_coach_read on public.athlete_goals;
create policy athlete_goals_coach_read
on public.athlete_goals
for select
using (
  exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = athlete_goals.athlete_id
  )
);

create or replace function public.touch_athlete_goals_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists athlete_goals_touch_updated_at on public.athlete_goals;
create trigger athlete_goals_touch_updated_at
before update on public.athlete_goals
for each row execute function public.touch_athlete_goals_updated_at();

comment on table public.athlete_goals is
  'Athlete-owned structured goal record used by Progress, AVA, and coach visibility.';
