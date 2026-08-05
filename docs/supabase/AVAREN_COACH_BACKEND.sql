-- AVAREN Sprint 6.2 — Real Coach/Athlete Backend
-- Run this entire file once in Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;

create table if not exists public.coach_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_invitations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_email text not null,
  athlete_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists coach_invitations_pending_unique
on public.coach_invitations (coach_id, lower(athlete_email))
where status = 'pending';

create table if not exists public.coach_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  athlete_email text not null,
  created_at timestamptz not null default now(),
  unique (coach_id, athlete_id)
);

create table if not exists public.coach_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  workout_payload jsonb not null,
  coach_notes text not null default '',
  due_date date,
  status text not null default 'assigned'
    check (status in ('assigned','started','completed','missed','cancelled')),
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  completed_session_id text
);

create or replace function public.is_avaren_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_allowlist
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.accept_coach_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.coach_invitations;
begin
  select * into invitation
  from public.coach_invitations
  where id = invitation_id
    and status = 'pending'
    and lower(athlete_email) = lower(coalesce(auth.jwt() ->> 'email', ''));

  if invitation.id is null then
    raise exception 'Invitation not found or not authorized';
  end if;

  update public.coach_invitations
  set athlete_id = auth.uid(), status = 'accepted', responded_at = now()
  where id = invitation_id;

  insert into public.coach_clients (coach_id, athlete_id, athlete_email)
  values (invitation.coach_id, auth.uid(), lower(invitation.athlete_email))
  on conflict (coach_id, athlete_id) do nothing;
end;
$$;

create or replace function public.decline_coach_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coach_invitations
  set athlete_id = auth.uid(), status = 'declined', responded_at = now()
  where id = invitation_id
    and status = 'pending'
    and lower(athlete_email) = lower(coalesce(auth.jwt() ->> 'email', ''));

  if not found then
    raise exception 'Invitation not found or not authorized';
  end if;
end;
$$;

alter table public.coach_allowlist enable row level security;
alter table public.coach_invitations enable row level security;
alter table public.coach_clients enable row level security;
alter table public.coach_assignments enable row level security;

drop policy if exists coach_allowlist_read_self on public.coach_allowlist;
create policy coach_allowlist_read_self on public.coach_allowlist
for select to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists coach_invites_select on public.coach_invitations;
create policy coach_invites_select on public.coach_invitations
for select to authenticated
using (
  coach_id = auth.uid()
  or lower(athlete_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists coach_invites_insert on public.coach_invitations;
create policy coach_invites_insert on public.coach_invitations
for insert to authenticated
with check (coach_id = auth.uid() and public.is_avaren_coach());

drop policy if exists coach_invites_update on public.coach_invitations;
create policy coach_invites_update on public.coach_invitations
for update to authenticated
using (coach_id = auth.uid())
with check (coach_id = auth.uid());

drop policy if exists coach_clients_select on public.coach_clients;
create policy coach_clients_select on public.coach_clients
for select to authenticated
using (coach_id = auth.uid() or athlete_id = auth.uid());

drop policy if exists coach_assignments_select on public.coach_assignments;
create policy coach_assignments_select on public.coach_assignments
for select to authenticated
using (coach_id = auth.uid() or athlete_id = auth.uid());

drop policy if exists coach_assignments_insert on public.coach_assignments;
create policy coach_assignments_insert on public.coach_assignments
for insert to authenticated
with check (
  coach_id = auth.uid()
  and public.is_avaren_coach()
  and exists (
    select 1 from public.coach_clients
    where coach_id = auth.uid()
      and athlete_id = coach_assignments.athlete_id
  )
);

drop policy if exists coach_assignments_update on public.coach_assignments;
create policy coach_assignments_update on public.coach_assignments
for update to authenticated
using (coach_id = auth.uid() or athlete_id = auth.uid())
with check (coach_id = auth.uid() or athlete_id = auth.uid());

grant execute on function public.accept_coach_invitation(uuid) to authenticated;
grant execute on function public.decline_coach_invitation(uuid) to authenticated;

commit;

-- Run this separately after replacing the email:
-- insert into public.coach_allowlist (email)
-- values ('YOUR_AVAREN_LOGIN_EMAIL')
-- on conflict (email) do nothing;
