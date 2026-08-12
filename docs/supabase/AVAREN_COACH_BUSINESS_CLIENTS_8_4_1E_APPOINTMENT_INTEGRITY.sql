-- AVAREN Sprint 8.4.3 — Appointment integrity (replaces 8.3 coach_clients-only path)
-- Run AFTER 8_4_1A_SCHEMA. Required before Phase C (nullable athlete_id).
-- DO NOT RUN AUTOMATICALLY.

begin;

create or replace function public.enforce_coach_scheduled_session_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client public.coach_business_clients;
begin
  -- ── Coach authorization on INSERT ─────────────────────────────────────────
  if auth.uid() is not null and tg_op = 'INSERT' then
    if not public.is_avaren_coach() or new.coach_id is distinct from auth.uid() then
      raise exception 'appointment_insert_not_coach';
    end if;
  end if;

  -- ── Client authorization ───────────────────────────────────────────────────
  if new.business_client_id is not null then
    select * into v_client
    from public.coach_business_clients as bc
    where bc.id = new.business_client_id;

    if not found then
      raise exception 'business_client_not_found';
    end if;

    if new.coach_id is distinct from v_client.coach_id then
      raise exception 'appointment_coach_client_mismatch';
    end if;

    -- Connected client: athlete_id must match linked_user_id when present
    if v_client.linked_user_id is not null then
      if new.athlete_id is null then
        raise exception 'appointment_linked_client_requires_athlete';
      end if;
      if new.athlete_id is distinct from v_client.linked_user_id then
        raise exception 'appointment_athlete_link_mismatch';
      end if;
    else
      -- Offline client: athlete_id may be NULL (Phase C). Phase B transitional:
      -- if athlete_id present without link, reject (no fake athlete accounts).
      if new.athlete_id is not null then
        raise exception 'appointment_offline_client_no_athlete';
      end if;
    end if;
  else
    -- Transitional legacy path (pre-Phase C backfill complete):
    -- require coach_clients bridge when business_client_id absent.
    if new.athlete_id is null then
      raise exception 'appointment_missing_client_identity';
    end if;

    if not exists (
      select 1
      from public.coach_clients as cc
      where cc.coach_id = new.coach_id
        and cc.athlete_id = new.athlete_id
    ) then
      raise exception 'appointment_unauthorized_client';
    end if;
  end if;

  -- ── Assignment linkage (only when athlete_id present) ─────────────────────
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

  -- ── Defaults / validation (unchanged from 8.3) ────────────────────────────
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

  if new.starts_at is null
     and new.session_date is not null
     and new.session_time is not null then
    new.starts_at := (
      (new.session_date::text || ' ' || new.session_time::text)
      ::timestamp at time zone new.schedule_timezone
    );
  end if;

  return new;
end;
$$;

-- Re-bind existing trigger (name from 8.3)
drop trigger if exists coach_scheduled_sessions_integrity
  on public.coach_scheduled_sessions;
create trigger coach_scheduled_sessions_integrity
before insert or update on public.coach_scheduled_sessions
for each row execute function public.enforce_coach_scheduled_session_integrity();

commit;

-- Phase C gate (commented — enable only after full regression):
-- alter table public.coach_scheduled_sessions alter column athlete_id drop not null;
-- alter table public.coach_scheduled_sessions
--   add constraint coach_scheduled_sessions_business_client_required
--   check (business_client_id is not null);
