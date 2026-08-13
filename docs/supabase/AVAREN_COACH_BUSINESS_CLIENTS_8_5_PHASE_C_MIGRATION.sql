-- AVAREN Sprint 8.5.1 — Phase C migration (revised, approval-ready)
-- TRUE NON-APP CLIENTS + UNLINK / RELINK + END-COACHING LIFECYCLE
--
-- ══════════════════════════════════════════════════════════════════════════════
-- CANONICAL IDENTITY
-- ══════════════════════════════════════════════════════════════════════════════
--   business_client_id = permanent client identity (coach business truth)
--   linked_user_id     = optional AVAREN account connection (NULL = offline)
--   athlete_id (appointment) = delivery/cache when linked; NULL when offline
--
-- ══════════════════════════════════════════════════════════════════════════════
-- BRIDGE STRATEGY (8.5.1 — RESOLVED)
-- ══════════════════════════════════════════════════════════════════════════════
-- OPTION A: coach_clients = ACTIVE connected-coaching access bridge ONLY.
--
-- DELETE bridge on:
--   • unlink (linked_user_id cleared; business client lifecycle unchanged)
--   • end coaching (always — archived clients must never retain active bridge)
--
-- UPSERT bridge on:
--   • link / relink / invitation accept (when linked_user_id present)
--   • reopen coaching (when linked_user_id still present)
--
-- This is NOT a contradiction with audit preservation:
--   • DELETE removes live authorization, NOT historical records.
--   • coach_client_labels CASCADE is acceptable (private coach nickname only).
--
-- Historical "was coached" truth MUST NOT depend on bridge row existence.
-- Durable sources (survive unlink / end / bridge delete):
--   A. coach_business_clients        — identity, status, started_at, ended_at
--   B. coach_assignments             — athlete_id permanent on assignment rows
--   C. coach_scheduled_sessions      — business_client_id on all appointments
--   D. coach_client_pass_*           — balances + ledger keyed by business_client_id
--   E. coach_business_client_notes   — coach-private notes
--   F. coach_weekly_reviews          — business_client_id path (when present)
--   G. coach_client_followups        — historical rows retained
--   H. athlete local workout history — Foundry state (not bridge-dependent)
--
-- After unlink the athlete loses CURRENT coaching access (bridge gone,
-- linked_user_id NULL) but completed assignments + local history remain.
-- Appointment history returns on relink via bc.linked_user_id join
-- (including rows where athlete_id stayed NULL historically).
--
-- DO NOT RUN AUTOMATICALLY.
-- Run ONLY after:
--   1. AVAREN_COACH_BUSINESS_CLIENTS_8_5_PHASE_C_PRECHECK.sql (blocking = 0)
--   2. AVAREN_COACH_BUSINESS_CLIENTS_8_4_1C_VERIFICATION.sql (blocking = 0)
--   3. Offline appointment gate checklist (section C.0 below) verified
--   4. Explicit product approval
--
-- ══════════════════════════════════════════════════════════════════════════════
-- END vs UNLINK (separate semantics)
-- ══════════════════════════════════════════════════════════════════════════════
-- END COACHING: status=archived, ended_at set, future appts cancelled (default),
--               bridge deleted, linked_user_id preserved unless p_unlink_user.
-- UNLINK:       linked_user_id cleared, bridge deleted, business client unchanged.
-- END + UNLINK: end_business_client_coaching(p_unlink_user := true).
-- REOPEN:       status=active, ended_at cleared, started_at preserved,
--               bridge restored when linked_user_id present.
--               Multiple coaching periods NOT modeled yet (no period table).

begin;

-- ══════════════════════════════════════════════════════════════════════════════
-- C.0 — OFFLINE APPOINTMENT GATE (verify before C.1)
-- ══════════════════════════════════════════════════════════════════════════════
-- [ ] appointmentsMissingBusinessClient = 0 (precheck)
-- [ ] create scheduling writes business_client_id (app: coachBackend.createScheduledSession)
-- [ ] connected clients derive athlete_id from linked_user_id (integrity trigger)
-- [ ] offline clients permit athlete_id NULL (integrity trigger)
-- [ ] coach calendar keyed by business_client_id (app post-UI wave)
-- [ ] appointment detail / pass debit keyed by business_client_id (8.4 live)
-- [ ] athlete RPCs authorize via linked_user_id (this migration)
-- [ ] follow-ups: offline clients excluded from athlete-initiated flows (no athlete_id)
-- [ ] AVA coach context uses business_client_id (app post-UI wave)

-- ══════════════════════════════════════════════════════════════════════════════
-- C.1 — COACH-LOCAL BUSINESS DATE HELPER
-- Same timezone discipline as appointment scheduling (schedule_timezone).
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.coach_local_business_date(
  p_schedule_timezone text default 'America/New_York'
)
returns date
language sql
stable
set search_path = ''
as $$
  select (
    timezone(
      coalesce(nullif(trim(p_schedule_timezone), ''), 'America/New_York'),
      now()
    )
  )::date;
$$;

revoke all on function public.coach_local_business_date(text)
  from public, anon, authenticated;
grant execute on function public.coach_local_business_date(text)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- C.1b — INTERNAL: active bridge delete / restore helpers
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.delete_coach_client_bridge_for_business_client(
  p_coach_id uuid,
  p_business_client_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.coach_clients as cc
  where cc.coach_id = p_coach_id
    and cc.business_client_id = p_business_client_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.delete_coach_client_bridge_for_business_client(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.restore_coach_client_bridge_for_business_client(
  p_coach_id uuid,
  p_business_client_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.coach_business_clients;
  v_email text;
begin
  select * into v_client
  from public.coach_business_clients as bc
  where bc.id = p_business_client_id
    and bc.coach_id = p_coach_id;

  if not found or v_client.linked_user_id is null then
    return false;
  end if;

  v_email := coalesce(
    nullif(lower(trim(v_client.email)), ''),
    lower(coalesce((
      select u.email
      from auth.users as u
      where u.id = v_client.linked_user_id
    ), ''))
  );

  insert into public.coach_clients (
    coach_id,
    athlete_id,
    athlete_email,
    business_client_id
  ) values (
    p_coach_id,
    v_client.linked_user_id,
    coalesce(nullif(v_email, ''), 'linked@avaren.local'),
    v_client.id
  )
  on conflict (coach_id, athlete_id) do update
  set business_client_id = excluded.business_client_id,
      athlete_email = excluded.athlete_email
  where public.coach_clients.business_client_id is null
     or public.coach_clients.business_client_id = excluded.business_client_id;

  return true;
end;
$$;

revoke all on function public.restore_coach_client_bridge_for_business_client(uuid, uuid)
  from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- C.2 — SCHEMA UNLOCK (nullable athlete_id, required business_client_id)
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.coach_scheduled_sessions
  alter column athlete_id drop not null;

alter table public.coach_scheduled_sessions
  drop constraint if exists coach_scheduled_sessions_business_client_required;

alter table public.coach_scheduled_sessions
  add constraint coach_scheduled_sessions_business_client_required
  check (business_client_id is not null);

-- ══════════════════════════════════════════════════════════════════════════════
-- C.3 — APPOINTMENT INTEGRITY
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.enforce_coach_scheduled_session_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client public.coach_business_clients;
begin
  if auth.uid() is not null and tg_op = 'INSERT' then
    if not public.is_avaren_coach() or new.coach_id is distinct from auth.uid() then
      raise exception 'appointment_insert_not_coach';
    end if;
  end if;

  if new.business_client_id is null then
    raise exception 'appointment_missing_business_client';
  end if;

  select * into v_client
  from public.coach_business_clients as bc
  where bc.id = new.business_client_id;

  if not found then
    raise exception 'business_client_not_found';
  end if;

  if new.coach_id is distinct from v_client.coach_id then
    raise exception 'appointment_coach_client_mismatch';
  end if;

  -- New appointments blocked for archived clients; updates to historical rows allowed.
  if v_client.status = 'archived' and tg_op = 'INSERT' then
    raise exception 'appointment_archived_client';
  end if;

  if v_client.linked_user_id is not null then
    if new.athlete_id is null then
      new.athlete_id := v_client.linked_user_id;
    elsif new.athlete_id is distinct from v_client.linked_user_id then
      raise exception 'appointment_athlete_link_mismatch';
    end if;
  else
    if new.athlete_id is not null then
      raise exception 'appointment_offline_client_no_athlete';
    end if;
  end if;

  if new.assignment_id is not null then
    if new.athlete_id is null then
      raise exception 'appointment_assignment_requires_athlete';
    end if;

    if not exists (
      select 1
      from public.coach_assignments as ca
      where ca.id = new.assignment_id
        and ca.coach_id = new.coach_id
        and ca.athlete_id = new.athlete_id
    ) then
      raise exception 'appointment_invalid_assignment';
    end if;
  end if;

  if new.duration_minutes is null then
    new.duration_minutes := 60;
  elsif new.duration_minutes < 15 or new.duration_minutes > 480 then
    raise exception 'appointment_invalid_duration';
  end if;

  if new.rsvp_status is null then
    new.rsvp_status := 'awaiting_response';
  end if;

  if new.schedule_timezone is null or trim(new.schedule_timezone) = '' then
    new.schedule_timezone := 'America/New_York';
  end if;

  return new;
end;
$$;

drop trigger if exists coach_scheduled_sessions_integrity
  on public.coach_scheduled_sessions;
create trigger coach_scheduled_sessions_integrity
before insert or update on public.coach_scheduled_sessions
for each row execute function public.enforce_coach_scheduled_session_integrity();

-- ══════════════════════════════════════════════════════════════════════════════
-- C.4 — COACH RPC: create_coach_business_client
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.create_coach_business_client(
  p_first_name text,
  p_last_name text default '',
  p_preferred_name text default '',
  p_email text default null,
  p_phone text default null,
  p_started_at date default null,
  p_private_note text default null,
  p_schedule_timezone text default 'America/New_York'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_display_name text;
  v_client public.coach_business_clients;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  if coalesce(trim(p_first_name), '') = '' then
    raise exception 'first_name_required';
  end if;

  v_display_name := coalesce(
    nullif(trim(p_preferred_name), ''),
    nullif(trim(p_first_name), '') || case
      when coalesce(trim(p_last_name), '') <> '' then ' ' || trim(p_last_name)
      else ''
    end,
    'Client'
  );

  insert into public.coach_business_clients (
    coach_id,
    linked_user_id,
    first_name,
    last_name,
    preferred_name,
    display_name,
    email,
    phone,
    status,
    started_at
  ) values (
    v_coach_id,
    null,
    coalesce(trim(p_first_name), ''),
    coalesce(trim(p_last_name), ''),
    coalesce(trim(p_preferred_name), ''),
    v_display_name,
    nullif(lower(trim(p_email)), ''),
    nullif(trim(p_phone), ''),
    'active',
    coalesce(
      p_started_at,
      public.coach_local_business_date(p_schedule_timezone)
    )
  )
  returning * into v_client;

  if coalesce(trim(p_private_note), '') <> '' then
    insert into public.coach_business_client_notes (
      business_client_id,
      coach_id,
      notes
    )
    values (v_client.id, v_coach_id, trim(p_private_note))
    on conflict (business_client_id) do update
    set notes = excluded.notes, updated_at = now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'business_client_id', v_client.id,
    'display_name', v_client.display_name,
    'linked', false
  );
end;
$$;

revoke all on function public.create_coach_business_client(text, text, text, text, text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.create_coach_business_client(text, text, text, text, text, date, text, text)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- C.5 — COACH RPC: invite_business_client_to_avaren
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.invite_business_client_to_avaren(
  p_business_client_id uuid,
  p_athlete_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_client public.coach_business_clients;
  v_email text := lower(trim(p_athlete_email));
  v_invitation_id uuid;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  if v_email is null or v_email = '' then
    raise exception 'email_required';
  end if;

  select * into v_client
  from public.coach_business_clients as bc
  where bc.id = p_business_client_id and bc.coach_id = v_coach_id
  for update;

  if not found then raise exception 'business_client_not_found'; end if;
  if v_client.status = 'archived' then raise exception 'business_client_archived'; end if;
  if v_client.linked_user_id is not null then raise exception 'business_client_already_linked'; end if;

  insert into public.coach_invitations (
    coach_id, athlete_email, business_client_id, status
  ) values (
    v_coach_id, v_email, v_client.id, 'pending'
  )
  returning id into v_invitation_id;

  return jsonb_build_object(
    'ok', true,
    'invitation_id', v_invitation_id,
    'business_client_id', v_client.id
  );
end;
$$;

revoke all on function public.invite_business_client_to_avaren(uuid, text)
  from public, anon, authenticated;
grant execute on function public.invite_business_client_to_avaren(uuid, text)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- C.6 — ATHLETE RPC: accept_coach_invitation_for_business_client
-- FUTURE-ONLY athlete_id backfill (8.5.1)
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.accept_coach_invitation_for_business_client(
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.coach_invitations;
  v_client public.coach_business_clients;
  v_existing_business_client_id uuid;
  v_backfilled integer := 0;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select * into v_inv
  from public.coach_invitations as i
  where i.id = p_invitation_id and i.status = 'pending'
  for update;

  if not found then raise exception 'invitation_not_found'; end if;

  if lower(v_inv.athlete_email) <> v_email then
    raise exception 'invitation_email_mismatch';
  end if;

  if v_inv.business_client_id is null then
    raise exception 'invitation_missing_business_client';
  end if;

  select * into v_client
  from public.coach_business_clients as bc
  where bc.id = v_inv.business_client_id
  for update;

  if not found then raise exception 'business_client_not_found'; end if;

  if v_client.coach_id is distinct from v_inv.coach_id then
    raise exception 'invitation_business_client_coach_mismatch';
  end if;

  if v_client.linked_user_id is not null
     and v_client.linked_user_id is distinct from v_user_id then
    raise exception 'business_client_already_linked';
  end if;

  select cc.business_client_id into v_existing_business_client_id
  from public.coach_clients as cc
  where cc.coach_id = v_inv.coach_id
    and cc.athlete_id = v_user_id;

  if v_existing_business_client_id is not null
     and v_existing_business_client_id is distinct from v_client.id then
    raise exception 'bridge_business_client_conflict';
  end if;

  update public.coach_business_clients
  set linked_user_id = v_user_id, updated_at = now()
  where id = v_client.id;

  update public.coach_invitations
  set athlete_id = v_user_id, status = 'accepted', responded_at = now()
  where id = p_invitation_id;

  insert into public.coach_clients (coach_id, athlete_id, athlete_email, business_client_id)
  values (v_inv.coach_id, v_user_id, v_email, v_client.id)
  on conflict (coach_id, athlete_id) do update
  set business_client_id = excluded.business_client_id,
      athlete_email = excluded.athlete_email
  where public.coach_clients.business_client_id is null
     or public.coach_clients.business_client_id = excluded.business_client_id;

  -- FUTURE-ONLY backfill (8.5.1):
  --   SCHEDULED + session_date >= coach-local today → athlete_id populated.
  --   COMPLETED / CANCELLED / MISSED → athlete_id NEVER rewritten from NULL.
  -- Athlete visibility for ALL statuses resolves via bc.linked_user_id = auth.uid().
  update public.coach_scheduled_sessions as s
  set athlete_id = v_user_id,
      updated_at = now()
  where s.business_client_id = v_client.id
    and s.athlete_id is null
    and s.status = 'scheduled'
    and s.session_date >= public.coach_local_business_date(s.schedule_timezone);
  get diagnostics v_backfilled = row_count;

  return jsonb_build_object(
    'ok', true,
    'business_client_id', v_client.id,
    'future_appointments_backfilled', v_backfilled
  );
end;
$$;

revoke all on function public.accept_coach_invitation_for_business_client(uuid)
  from public, anon, authenticated;
grant execute on function public.accept_coach_invitation_for_business_client(uuid)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- C.7 — COACH RPC: unlink_business_client_user
-- DELETE active bridge row. Preserves all business/historical records.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.unlink_business_client_user(
  p_business_client_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_client public.coach_business_clients;
  v_linked uuid;
  v_bridge_deleted integer := 0;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  select * into v_client
  from public.coach_business_clients as bc
  where bc.id = p_business_client_id and bc.coach_id = v_coach_id
  for update;

  if not found then raise exception 'business_client_not_found'; end if;

  v_linked := v_client.linked_user_id;

  if v_linked is null then
    return jsonb_build_object('ok', true, 'unchanged', true, 'unlinked', false);
  end if;

  update public.coach_business_clients
  set linked_user_id = null, updated_at = now()
  where id = v_client.id;

  -- Active access bridge only. coach_client_labels CASCADE via FK.
  v_bridge_deleted := public.delete_coach_client_bridge_for_business_client(
    v_coach_id,
    v_client.id
  );

  return jsonb_build_object(
    'ok', true,
    'unlinked', true,
    'former_linked_user_id', v_linked,
    'bridge_rows_deleted', v_bridge_deleted
  );
end;
$$;

revoke all on function public.unlink_business_client_user(uuid)
  from public, anon, authenticated;
grant execute on function public.unlink_business_client_user(uuid)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- C.8 — COACH RPC: end_business_client_coaching
-- Default cancels future appointments. Optional keep when coach chooses.
-- Always deletes active bridge. Optional unlink clears linked_user_id.
-- ended_at uses coach-local business date (never UTC date truncation).
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.end_business_client_coaching(
  p_business_client_id uuid,
  p_unlink_user boolean default false,
  p_keep_future_appointments boolean default false,
  p_ended_at date default null,
  p_schedule_timezone text default 'America/New_York'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_client public.coach_business_clients;
  v_cancelled integer := 0;
  v_bridge_deleted integer := 0;
  v_ended_at date;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  select * into v_client
  from public.coach_business_clients as bc
  where bc.id = p_business_client_id and bc.coach_id = v_coach_id
  for update;

  if not found then raise exception 'business_client_not_found'; end if;

  if v_client.status = 'archived' then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  v_ended_at := coalesce(
    p_ended_at,
    public.coach_local_business_date(p_schedule_timezone)
  );

  if not p_keep_future_appointments then
    update public.coach_scheduled_sessions as s
    set status = 'cancelled', updated_at = now()
    where s.business_client_id = v_client.id
      and s.coach_id = v_coach_id
      and s.status = 'scheduled'
      and s.session_date >= public.coach_local_business_date(
        coalesce(nullif(trim(s.schedule_timezone), ''), p_schedule_timezone)
      );
    get diagnostics v_cancelled = row_count;
  end if;

  update public.coach_business_clients
  set status = 'archived',
      ended_at = coalesce(v_client.ended_at, v_ended_at),
      linked_user_id = case
        when p_unlink_user then null
        else v_client.linked_user_id
      end,
      updated_at = now()
  where id = v_client.id;

  v_bridge_deleted := public.delete_coach_client_bridge_for_business_client(
    v_coach_id,
    v_client.id
  );

  return jsonb_build_object(
    'ok', true,
    'archived', true,
    'ended_at', coalesce(v_client.ended_at, v_ended_at),
    'cancelled_future_appointments', v_cancelled,
    'kept_future_appointments', p_keep_future_appointments,
    'bridge_rows_deleted', v_bridge_deleted,
    'unlinked', p_unlink_user,
    'linked_user_id_preserved', not p_unlink_user and v_client.linked_user_id is not null
  );
end;
$$;

revoke all on function public.end_business_client_coaching(uuid, boolean, boolean, date, text)
  from public, anon, authenticated;
grant execute on function public.end_business_client_coaching(uuid, boolean, boolean, date, text)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- C.9 — COACH RPC: reopen_business_client_coaching
-- Restores bridge when linked_user_id present.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.reopen_business_client_coaching(
  p_business_client_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_client public.coach_business_clients;
  v_bridge_restored boolean := false;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  select * into v_client
  from public.coach_business_clients as bc
  where bc.id = p_business_client_id and bc.coach_id = v_coach_id
  for update;

  if not found then raise exception 'business_client_not_found'; end if;

  if v_client.status = 'active' then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  update public.coach_business_clients
  set status = 'active',
      ended_at = null,
      updated_at = now()
  where id = v_client.id;

  if v_client.linked_user_id is not null then
    v_bridge_restored := public.restore_coach_client_bridge_for_business_client(
      v_coach_id,
      v_client.id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'reopened', true,
    'started_at', v_client.started_at,
    'bridge_restored', v_bridge_restored
  );
end;
$$;

revoke all on function public.reopen_business_client_coaching(uuid)
  from public, anon, authenticated;
grant execute on function public.reopen_business_client_coaching(uuid)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- C.10 — COACH RPC: list_coach_business_clients
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.list_coach_business_clients(
  p_include_archived boolean default false
)
returns table (
  business_client_id uuid,
  coach_id uuid,
  linked_user_id uuid,
  first_name text,
  last_name text,
  preferred_name text,
  display_name text,
  email text,
  phone text,
  status text,
  started_at date,
  ended_at date,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    bc.id,
    bc.coach_id,
    bc.linked_user_id,
    bc.first_name,
    bc.last_name,
    bc.preferred_name,
    bc.display_name,
    bc.email,
    bc.phone,
    bc.status,
    bc.started_at,
    bc.ended_at,
    bc.created_at
  from public.coach_business_clients as bc
  where bc.coach_id = auth.uid()
    and public.is_avaren_coach()
    and (p_include_archived or bc.status = 'active')
  order by bc.status asc, bc.display_name asc, bc.created_at desc;
$$;

revoke all on function public.list_coach_business_clients(boolean)
  from public, anon, authenticated;
grant execute on function public.list_coach_business_clients(boolean)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- C.11 — ATHLETE RPCs: visibility via linked_user_id (not athlete_id alone)
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.list_athlete_scheduled_sessions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  return coalesce((
    select jsonb_agg(row_to_json(s)::jsonb order by s.session_date asc, s.start_time asc)
    from (
      select
        ss.id,
        ss.coach_id,
        ss.athlete_id,
        ss.business_client_id,
        ss.session_date,
        ss.start_time,
        ss.duration_minutes,
        ss.status,
        ss.rsvp_status,
        ss.location_type,
        ss.location_name,
        ss.starts_at,
        ss.schedule_timezone
      from public.coach_scheduled_sessions as ss
      join public.coach_business_clients as bc on bc.id = ss.business_client_id
      where bc.linked_user_id = v_user_id
        and ss.status = 'scheduled'
        and ss.session_date >= public.coach_local_business_date(ss.schedule_timezone)
      order by ss.session_date asc, ss.start_time asc
    ) as s
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_athlete_scheduled_sessions()
  from public, anon, authenticated;
grant execute on function public.list_athlete_scheduled_sessions()
  to authenticated;

create or replace function public.list_athlete_scheduled_session_history(
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  return coalesce(
    (
      select jsonb_agg(
        public.athlete_scheduled_session_public_json(
          s,
          public.resolve_user_public_display_name(s.coach_id),
          (
            select a.title
            from public.coach_assignments as a
            where a.id = s.assignment_id
              and a.coach_id = s.coach_id
              and a.athlete_id = bc.linked_user_id
            limit 1
          )
        )
        order by coalesce(s.starts_at, s.session_date::timestamptz) desc
      )
      from public.coach_scheduled_sessions as s
      join public.coach_business_clients as bc on bc.id = s.business_client_id
      where bc.linked_user_id = v_user_id
        and s.status in ('completed', 'cancelled', 'missed')
      limit v_limit
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_athlete_scheduled_session_history(integer)
  from public, anon, authenticated;
grant execute on function public.list_athlete_scheduled_session_history(integer)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- C.11b — ATHLETE RPC: update_scheduled_session_rsvp
-- Authorize via business_client.linked_user_id (not athlete_id alone).
-- Supports historical rows where athlete_id remained NULL after offline period.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.update_scheduled_session_rsvp(
  p_session_id uuid,
  p_rsvp_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions;
  v_coach_display_name text;
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_rsvp_status not in ('confirmed', 'cannot_attend') then
    raise exception 'invalid_rsvp_status';
  end if;

  select ss.*
  into v_session
  from public.coach_scheduled_sessions as ss
  join public.coach_business_clients as bc on bc.id = ss.business_client_id
  where ss.id = p_session_id
    and bc.linked_user_id = v_athlete_id
  for update of ss;

  if not found then
    raise exception 'session_not_found';
  end if;

  if v_session.status <> 'scheduled' then
    raise exception 'session_not_scheduled';
  end if;

  update public.coach_scheduled_sessions as ss
  set rsvp_status = p_rsvp_status,
      rsvp_updated_at = now(),
      updated_at = now()
  where ss.id = p_session_id;

  v_coach_display_name := public.resolve_user_public_display_name(v_session.coach_id);

  return public.athlete_scheduled_session_public_json(
    v_session,
    v_coach_display_name
  );
end;
$$;

revoke all on function public.update_scheduled_session_rsvp(uuid, text)
  from public, anon, authenticated;
grant execute on function public.update_scheduled_session_rsvp(uuid, text)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- C.12 — RLS: coach_business_clients (coach-only direct access)
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.coach_business_clients enable row level security;

drop policy if exists coach_business_clients_coach_select on public.coach_business_clients;
create policy coach_business_clients_coach_select
  on public.coach_business_clients
  for select
  to authenticated
  using (coach_id = auth.uid() and public.is_avaren_coach());

drop policy if exists coach_business_clients_coach_update on public.coach_business_clients;
create policy coach_business_clients_coach_update
  on public.coach_business_clients
  for update
  to authenticated
  using (coach_id = auth.uid() and public.is_avaren_coach())
  with check (coach_id = auth.uid() and public.is_avaren_coach());

-- ══════════════════════════════════════════════════════════════════════════════
-- C.13 — RLS: coach_scheduled_sessions coach CRUD via business_client_id
-- Replaces legacy coach_clients + athlete_id gate (blocks offline clients).
-- Athletes continue using SECURITY DEFINER RPCs only (no table SELECT policy).
-- ══════════════════════════════════════════════════════════════════════════════

drop policy if exists coach_scheduled_sessions_coach_insert on public.coach_scheduled_sessions;
create policy coach_scheduled_sessions_coach_insert on public.coach_scheduled_sessions
for insert to authenticated
with check (
  coach_id = auth.uid()
  and public.is_avaren_coach()
  and exists (
    select 1
    from public.coach_business_clients as bc
    where bc.id = coach_scheduled_sessions.business_client_id
      and bc.coach_id = auth.uid()
      and bc.status = 'active'
  )
);

drop policy if exists coach_scheduled_sessions_coach_update on public.coach_scheduled_sessions;
create policy coach_scheduled_sessions_coach_update on public.coach_scheduled_sessions
for update to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (
  coach_id = auth.uid()
  and public.is_avaren_coach()
  and exists (
    select 1
    from public.coach_business_clients as bc
    where bc.id = coach_scheduled_sessions.business_client_id
      and bc.coach_id = auth.uid()
  )
);

-- ══════════════════════════════════════════════════════════════════════════════
-- C.14 — RLS: coach_assignments insert via active bridge OR linked business client
-- Bridge DELETE on unlink/end removes NEW assignment authorization only.
-- Existing assignment rows remain readable via athlete_id RLS SELECT policy.
-- ══════════════════════════════════════════════════════════════════════════════

drop policy if exists coach_assignments_insert on public.coach_assignments;
create policy coach_assignments_insert on public.coach_assignments
for insert to authenticated
with check (
  coach_id = auth.uid()
  and public.is_avaren_coach()
  and (
    exists (
      select 1
      from public.coach_clients as cc
      where cc.coach_id = auth.uid()
        and cc.athlete_id = coach_assignments.athlete_id
    )
    or exists (
      select 1
      from public.coach_business_clients as bc
      where bc.coach_id = auth.uid()
        and bc.linked_user_id = coach_assignments.athlete_id
        and bc.status = 'active'
    )
  )
);

notify pgrst, 'reload schema';

commit;

-- ══════════════════════════════════════════════════════════════════════════════
-- POST-RUN: AVAREN_COACH_BUSINESS_CLIENTS_8_5_PHASE_C_VERIFICATION.sql
-- ══════════════════════════════════════════════════════════════════════════════
