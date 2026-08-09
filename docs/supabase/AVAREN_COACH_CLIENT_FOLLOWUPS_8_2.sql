-- AVAREN Sprint 8.2 — Coach Client Follow-Ups (security-hardened)
-- Structured athlete → coach attention items (not raw chat).
-- Idempotent: safe to run multiple times.
--
-- Depends on:
--   • auth.users (Supabase Auth — always present)
--   • public.coach_clients + public.coach_assignments (AVAREN_COACH_BACKEND.sql)
--   • public.touch_updated_at() (AVAREN_COACH_CLIENT_IDENTITY_7_9_3.sql)
--
-- Security model:
--   • Athletes: INSERT own follow-ups only (no UPDATE/DELETE)
--   • Coaches: SELECT authorized clients; lifecycle via RPC only (no direct UPDATE)
--   • Immutable identity columns enforced by BEFORE UPDATE trigger (defense in depth)
--   • Lifecycle timestamps set deterministically in DB — clients cannot forge them
--   • No callable relationship-probe helper exposed via PostgREST
--   • Duplicate-click protection is app-layer (AVA pending proposal + submit lock)

begin;

-- ── 0. Dependency guard ─────────────────────────────────────────────────────

do $$
begin
  if to_regnamespace('auth') is null then
    raise exception 'Missing dependency: auth schema (Supabase Auth).';
  end if;

  if to_regclass('auth.users') is null then
    raise exception 'Missing dependency: auth.users (Supabase Auth).';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'touch_updated_at'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    raise exception
      'Missing dependency: public.touch_updated_at(). Run AVAREN_COACH_CLIENT_IDENTITY_7_9_3.sql first.';
  end if;

  if to_regclass('public.coach_clients') is null then
    raise exception
      'Missing dependency: public.coach_clients. Run AVAREN_COACH_BACKEND.sql first.';
  end if;

  if to_regclass('public.coach_assignments') is null then
    raise exception
      'Missing dependency: public.coach_assignments. Run AVAREN_COACH_BACKEND.sql first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coach_assignments'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) then
    raise exception
      'Missing dependency: public.coach_assignments.id must be uuid.';
  end if;
end $$;

-- Remove probeable helper if a prior draft was applied.
drop function if exists public.is_authorized_coach_client(uuid, uuid);

-- Remove incorrect dedupe index if a prior draft was applied.
drop index if exists public.coach_client_followups_open_session_dedupe_idx;

-- ── 1. Table ─────────────────────────────────────────────────────────────────
-- coach_clients has no inactive/status column today: row existence is the
-- canonical active relationship. If relationship ends, the row must be removed.

create table if not exists public.coach_client_followups (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  reason_type text not null
    check (reason_type in (
      'PAIN_OR_DISCOMFORT',
      'SCHEDULE_CONFLICT',
      'PROGRAM_CHANGE_REQUEST',
      'MISSED_TRAINING',
      'RECOVERY_CONCERN',
      'ATHLETE_QUESTION'
    )),
  source_type text not null default 'ava_athlete'
    check (source_type in ('ava_athlete', 'session_complete', 'weekly_checkin')),
  summary text not null check (char_length(trim(summary)) between 8 and 280),
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'resolved')),
  -- Client-generated workout instance id (local-first Foundry session UUID string).
  -- No canonical persisted workout-session table exists in Supabase today;
  -- coach_assignments.completed_session_id uses the same text pattern.
  session_id text check (session_id is null or char_length(trim(session_id)) > 0),
  assignment_id uuid references public.coach_assignments(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint coach_client_followups_open_ts check (
    status <> 'open'
    or (reviewed_at is null and resolved_at is null)
  ),
  constraint coach_client_followups_reviewed_ts check (
    status <> 'reviewed'
    or (reviewed_at is not null and resolved_at is null)
  ),
  constraint coach_client_followups_resolved_ts check (
    status <> 'resolved'
    or resolved_at is not null
  )
);

comment on column public.coach_client_followups.session_id is
  'Optional client-generated Foundry workout instance id (text UUID). Not an FK — sessions are local-first.';

comment on table public.coach_client_followups is
  'Structured athlete→coach follow-ups. Multiple open items per session are allowed (e.g. distinct pain sites). Duplicate-click protection is app-layer.';

create index if not exists coach_client_followups_coach_status_idx
  on public.coach_client_followups (coach_id, status, created_at desc);

create index if not exists coach_client_followups_athlete_idx
  on public.coach_client_followups (athlete_id, created_at desc);

-- No database UNIQUE dedupe for Sprint 8.2:
-- multiple legitimate open follow-ups may exist for the same session/reason
-- (e.g. shoulder pain then knee pain). AVA submit lock + pending proposal
-- idempotency prevents accidental double-submit from the UI.

-- ── 2. INSERT integrity (athlete submit path) ─────────────────────────────────

create or replace function public.enforce_coach_client_followup_insert()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- Athletes submit through PostgREST as authenticated; enforce self-submit.
  if auth.uid() is not null and new.athlete_id is distinct from auth.uid() then
    raise exception 'followup_insert_not_self';
  end if;

  if not exists (
    select 1
    from public.coach_clients as cc
    where cc.coach_id = new.coach_id
      and cc.athlete_id = new.athlete_id
  ) then
    raise exception 'followup_insert_unauthorized_coach';
  end if;

  if new.assignment_id is not null and not exists (
    select 1
    from public.coach_assignments as ca
    where ca.id = new.assignment_id
      and ca.coach_id = new.coach_id
      and ca.athlete_id = new.athlete_id
  ) then
    raise exception 'followup_insert_invalid_assignment';
  end if;

  new.summary := trim(new.summary);
  new.session_id := nullif(trim(new.session_id), '');
  new.status := 'open';
  new.reviewed_at := null;
  new.resolved_at := null;
  new.created_at := now();
  new.updated_at := now();

  return new;
end;
$$;

revoke all on function public.enforce_coach_client_followup_insert() from public;

drop trigger if exists coach_client_followups_enforce_insert on public.coach_client_followups;
create trigger coach_client_followups_enforce_insert
before insert on public.coach_client_followups
for each row
execute function public.enforce_coach_client_followup_insert();

-- ── 3. UPDATE integrity (immutable identity + lifecycle timestamps) ─────────
-- Fires for all UPDATE paths including SECURITY DEFINER RPC (defense in depth).

create or replace function public.enforce_coach_client_followup_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
    or new.coach_id is distinct from old.coach_id
    or new.athlete_id is distinct from old.athlete_id
    or new.reason_type is distinct from old.reason_type
    or new.source_type is distinct from old.source_type
    or new.summary is distinct from old.summary
    or new.session_id is distinct from old.session_id
    or new.assignment_id is distinct from old.assignment_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'followup_identity_immutable';
  end if;

  if new.status is not distinct from old.status then
    new.reviewed_at := old.reviewed_at;
    new.resolved_at := old.resolved_at;
    new.updated_at := now();
    return new;
  end if;

  if old.status = 'open' and new.status = 'reviewed' then
    new.reviewed_at := now();
    new.resolved_at := null;
  elsif old.status = 'open' and new.status = 'resolved' then
    new.reviewed_at := now();
    new.resolved_at := now();
  elsif old.status = 'reviewed' and new.status = 'resolved' then
    new.reviewed_at := old.reviewed_at;
    new.resolved_at := now();
  else
    raise exception 'followup_invalid_status_transition';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.enforce_coach_client_followup_update() from public;

drop trigger if exists coach_client_followups_enforce_update on public.coach_client_followups;
create trigger coach_client_followups_enforce_update
before update on public.coach_client_followups
for each row
execute function public.enforce_coach_client_followup_update();

-- ── 4. Coach lifecycle RPC (narrow write surface) ───────────────────────────

create or replace function public.update_coach_client_followup_status(
  p_followup_id uuid,
  p_status text
)
returns public.coach_client_followups
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.coach_client_followups;
begin
  if p_status not in ('reviewed', 'resolved') then
    raise exception 'followup_invalid_status';
  end if;

  select f.*
  into v_row
  from public.coach_client_followups as f
  where f.id = p_followup_id
    and f.coach_id = auth.uid();

  if not found then
    raise exception 'followup_not_found';
  end if;

  if not exists (
    select 1
    from public.coach_clients as cc
    where cc.coach_id = v_row.coach_id
      and cc.athlete_id = v_row.athlete_id
  ) then
    raise exception 'followup_not_authorized';
  end if;

  update public.coach_client_followups as f
  set status = p_status
  where f.id = p_followup_id
  returning f.* into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_coach_client_followup_status(uuid, text) from public;
grant execute on function public.update_coach_client_followup_status(uuid, text) to authenticated;

-- ── 5. Row Level Security ─────────────────────────────────────────────────────
-- Authorization is inlined in policies (not a callable probe helper).

alter table public.coach_client_followups enable row level security;

drop policy if exists coach_client_followups_select on public.coach_client_followups;
create policy coach_client_followups_select on public.coach_client_followups
for select to authenticated
using (
  athlete_id = auth.uid()
  or (
    coach_id = auth.uid()
    and exists (
      select 1
      from public.coach_clients as cc
      where cc.coach_id = auth.uid()
        and cc.athlete_id = coach_client_followups.athlete_id
    )
  )
);

drop policy if exists coach_client_followups_insert on public.coach_client_followups;
create policy coach_client_followups_insert on public.coach_client_followups
for insert to authenticated
with check (
  athlete_id = auth.uid()
  and exists (
    select 1
    from public.coach_clients as cc
    where cc.coach_id = coach_client_followups.coach_id
      and cc.athlete_id = auth.uid()
  )
);

-- No athlete UPDATE policy (Sprint 8.2).
-- No coach direct UPDATE policy — lifecycle via RPC only.
-- No DELETE policy — preserve operational history.

-- ── 6. Table privileges (RLS is not the whole permission layer) ─────────────

revoke all on table public.coach_client_followups from public;
revoke all on table public.coach_client_followups from anon;
revoke all on table public.coach_client_followups from authenticated;

grant select, insert on table public.coach_client_followups to authenticated;
-- UPDATE intentionally omitted — coaches use update_coach_client_followup_status().
-- service_role retains full access for operational tooling / migrations.

commit;

-- ── Post-run verification (manual — do not commit test users to migration) ────
--
-- ATHLETE A
--   insert own follow-up to authorized coach          -> PASS
--   insert for athlete B                              -> DENY (RLS + trigger)
--   insert to unrelated coach                         -> DENY (trigger)
--   select own follow-up                              -> PASS
--   select another athlete follow-up                  -> DENY
--   update follow-up                                  -> DENY (no UPDATE grant)
--   delete follow-up                                  -> DENY (no DELETE grant/policy)
--
-- AUTHORIZED COACH
--   select own client follow-up                       -> PASS
--   select unrelated client follow-up                 -> DENY
--   rpc update_coach_client_followup_status reviewed  -> PASS
--   rpc update_coach_client_followup_status resolved    -> PASS
--   direct update athlete_id                          -> DENY (no UPDATE grant)
--   direct update summary                             -> DENY (no UPDATE grant)
--   delete follow-up                                  -> DENY
--
-- UNAUTHORIZED COACH
--   select client follow-up                           -> DENY
--   rpc lifecycle update                              -> DENY (followup_not_found)
