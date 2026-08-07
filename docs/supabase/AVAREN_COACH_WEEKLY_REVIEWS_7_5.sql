-- AVAREN Sprint 7.5 — Coach Weekly Reviews
-- Private coach weekly review records per client/week.
-- Idempotent: safe to run multiple times.

begin;

create table if not exists public.coach_weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  decision text not null default '',
  observation text not null default '',
  priorities jsonb not null default '[]'::jsonb,
  follow_up_required boolean not null default false,
  follow_up_note text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, athlete_id, week_start)
);

create index if not exists coach_weekly_reviews_coach_week_idx
  on public.coach_weekly_reviews (coach_id, week_start desc);

create index if not exists coach_weekly_reviews_athlete_idx
  on public.coach_weekly_reviews (athlete_id, week_start desc);

alter table public.coach_weekly_reviews enable row level security;

drop policy if exists coach_weekly_reviews_select on public.coach_weekly_reviews;
create policy coach_weekly_reviews_select on public.coach_weekly_reviews
for select to authenticated
using (coach_id = auth.uid());

drop policy if exists coach_weekly_reviews_insert on public.coach_weekly_reviews;
create policy coach_weekly_reviews_insert on public.coach_weekly_reviews
for insert to authenticated
with check (
  coach_id = auth.uid()
  and public.is_avaren_coach()
  and exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = coach_weekly_reviews.athlete_id
  )
);

drop policy if exists coach_weekly_reviews_update on public.coach_weekly_reviews;
create policy coach_weekly_reviews_update on public.coach_weekly_reviews
for update to authenticated
using (
  coach_id = auth.uid()
  and exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = coach_weekly_reviews.athlete_id
  )
)
with check (
  coach_id = auth.uid()
  and exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = coach_weekly_reviews.athlete_id
  )
);

drop policy if exists coach_weekly_reviews_delete on public.coach_weekly_reviews;
create policy coach_weekly_reviews_delete on public.coach_weekly_reviews
for delete to authenticated
using (coach_id = auth.uid());

commit;
