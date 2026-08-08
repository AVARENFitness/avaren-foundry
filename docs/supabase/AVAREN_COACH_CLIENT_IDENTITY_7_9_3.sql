-- AVAREN Patch 7.9.3 — Client identity (FINAL PROPOSAL — DO NOT RUN)
--
-- Canonical identity: public.user_profiles (user-owned)
-- Coach-private label: public.coach_client_labels (coach-owned, athlete-invisible)
--
-- SECURITY DEFINER: NONE
-- Callable backfill RPC: NONE
-- Auth backfill: inline INSERT … SELECT below (migration runner only)
--
-- Display precedence (app helper getClientDisplayName):
--   coach_label → preferred_name → display_name → first + last → email prefix

begin;

-- ── 1. Canonical user-owned profile ────────────────────────────────────────

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  preferred_name text not null default '',
  display_name text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.user_profiles is
  'Canonical athlete/user identity — single owner per auth user';
comment on column public.user_profiles.preferred_name is
  'Optional nickname (e.g. Will)';
comment on column public.user_profiles.display_name is
  'Optional explicit display override when preferred_name is empty';

alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_owner on public.user_profiles;
create policy user_profiles_owner on public.user_profiles
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_profiles_coach_read on public.user_profiles;
create policy user_profiles_coach_read on public.user_profiles
for select to authenticated
using (
  exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = user_profiles.user_id
  )
);

-- ── 2. updated_at trigger (user_profiles) ──────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_touch_updated_at on public.user_profiles;
create trigger user_profiles_touch_updated_at
before update on public.user_profiles
for each row
execute function public.touch_updated_at();

-- ── 3. Coach-private roster label (separate table — not on coach_clients) ──
-- Athletes can SELECT coach_clients rows; a label column there would leak.
-- This table has coach-only RLS so labels stay private to the coach.

create table if not exists public.coach_client_labels (
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  coach_label text not null default '',
  updated_at timestamptz not null default now(),
  primary key (coach_id, athlete_id),
  constraint coach_client_labels_roster_fk
    foreign key (coach_id, athlete_id)
    references public.coach_clients (coach_id, athlete_id)
    on delete cascade
);

comment on table public.coach_client_labels is
  'Coach-private roster nickname; not visible to athletes';
comment on column public.coach_client_labels.coach_label is
  'Optional label used only in that coach''s Hub and AVA context';

alter table public.coach_client_labels enable row level security;

drop policy if exists coach_client_labels_coach_select on public.coach_client_labels;
create policy coach_client_labels_coach_select on public.coach_client_labels
for select to authenticated
using (coach_id = auth.uid());

drop policy if exists coach_client_labels_coach_insert on public.coach_client_labels;
create policy coach_client_labels_coach_insert on public.coach_client_labels
for insert to authenticated
with check (
  coach_id = auth.uid()
  and exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = coach_client_labels.athlete_id
  )
);

drop policy if exists coach_client_labels_coach_update on public.coach_client_labels;
create policy coach_client_labels_coach_update on public.coach_client_labels
for update to authenticated
using (coach_id = auth.uid())
with check (coach_id = auth.uid());

drop policy if exists coach_client_labels_coach_delete on public.coach_client_labels;
create policy coach_client_labels_coach_delete on public.coach_client_labels
for delete to authenticated
using (coach_id = auth.uid());

drop trigger if exists coach_client_labels_touch_updated_at on public.coach_client_labels;
create trigger coach_client_labels_touch_updated_at
before update on public.coach_client_labels
for each row
execute function public.touch_updated_at();

-- ── 4. One-time backfill: auth.users → user_profiles (migration-only) ──────
-- Runs as migration superuser. Not exposed as a callable RPC.

insert into public.user_profiles (
  user_id,
  display_name,
  first_name,
  last_name,
  preferred_name
)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    ''
  ),
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'first_name'), ''), ''),
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'last_name'), ''), ''),
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'preferred_name'), ''), '')
from auth.users u
on conflict (user_id) do update
set
  display_name = case
    when trim(public.user_profiles.display_name) = ''
      and trim(excluded.display_name) <> ''
    then excluded.display_name
    else public.user_profiles.display_name
  end,
  first_name = case
    when trim(public.user_profiles.first_name) = ''
      and trim(excluded.first_name) <> ''
    then excluded.first_name
    else public.user_profiles.first_name
  end,
  last_name = case
    when trim(public.user_profiles.last_name) = ''
      and trim(excluded.last_name) <> ''
    then excluded.last_name
    else public.user_profiles.last_name
  end,
  preferred_name = case
    when trim(public.user_profiles.preferred_name) = ''
      and trim(excluded.preferred_name) <> ''
    then excluded.preferred_name
    else public.user_profiles.preferred_name
  end,
  updated_at = now();

commit;

-- ── Post-migration notes (not SQL) ─────────────────────────────────────────
-- • coach_clients policies unchanged — see report for existing RLS inventory
-- • App: join user_profiles + coach_client_labels when loading coach roster
-- • App: coach edits coach_client_labels only; athletes edit user_profiles only
-- • No SECURITY DEFINER functions in this file
-- • No GRANT EXECUTE to authenticated for backfill
