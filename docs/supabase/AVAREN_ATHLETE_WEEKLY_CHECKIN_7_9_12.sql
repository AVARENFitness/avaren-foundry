-- AVAREN Sprint 7.9.12 — Athlete Weekly Check-Ins
-- Canonical athlete submission per active coach week (Sprint 7.5 week boundary).
-- Separate from coach_weekly_reviews and daily readiness.
-- Idempotent: safe to run multiple times.
-- DO NOT conflate with coach private review records.
--
-- Depends on: public.touch_updated_at() from AVAREN_COACH_CLIENT_IDENTITY_7_9_3.sql

begin;

create table if not exists public.athlete_weekly_check_ins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  training_rating smallint not null check (training_rating between 1 and 5),
  recovery_rating smallint not null check (recovery_rating between 1 and 5),
  nutrition_rating smallint not null check (nutrition_rating between 1 and 5),

  pain_or_issue text not null default 'no_issues'
    check (pain_or_issue in ('no_issues', 'minor_issue', 'coach_should_know')),
  pain_note text not null default '',
  weekly_win text not null default '',
  coach_note text not null default '',

  status text not null default 'submitted'
    check (status in ('submitted')),

  unique (athlete_id, week_start)
);

create index if not exists athlete_weekly_check_ins_athlete_week_idx
  on public.athlete_weekly_check_ins (athlete_id, week_start desc);

create index if not exists athlete_weekly_check_ins_week_idx
  on public.athlete_weekly_check_ins (week_start desc);

alter table public.athlete_weekly_check_ins enable row level security;

drop policy if exists athlete_weekly_check_ins_select on public.athlete_weekly_check_ins;
create policy athlete_weekly_check_ins_select on public.athlete_weekly_check_ins
for select to authenticated
using (
  athlete_id = auth.uid()
  or exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = athlete_weekly_check_ins.athlete_id
  )
);

drop policy if exists athlete_weekly_check_ins_insert on public.athlete_weekly_check_ins;
create policy athlete_weekly_check_ins_insert on public.athlete_weekly_check_ins
for insert to authenticated
with check (athlete_id = auth.uid());

drop policy if exists athlete_weekly_check_ins_update on public.athlete_weekly_check_ins;
create policy athlete_weekly_check_ins_update on public.athlete_weekly_check_ins
for update to authenticated
using (athlete_id = auth.uid())
with check (athlete_id = auth.uid());

drop trigger if exists athlete_weekly_check_ins_touch_updated_at on public.athlete_weekly_check_ins;
create trigger athlete_weekly_check_ins_touch_updated_at
before update on public.athlete_weekly_check_ins
for each row
execute function public.touch_updated_at();

commit;

-- Notes:
-- • week_start / week_end follow getCoachWeekRange() (Monday–Sunday, Sprint 7.5).
-- • One canonical row per athlete per week (unique athlete_id + week_start).
-- • App upserts on (athlete_id, week_start); repeated submit updates same row.
-- • Athlete INSERT/UPDATE owned by athlete_id = auth.uid() only.
-- • Coach SELECT requires live coach_clients authorization (revoked when relationship ends).
-- • No backfill from readiness entries — historical weekly truth starts at migration.
