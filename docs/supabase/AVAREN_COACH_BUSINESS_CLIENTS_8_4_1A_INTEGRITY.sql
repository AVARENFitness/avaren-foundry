-- AVAREN Sprint 8.4.4 — Integrity triggers + ledger semantic constraints (PROPOSAL)
-- Run AFTER 8_4_1A_SCHEMA.sql. DO NOT RUN AUTOMATICALLY.

begin;

-- ══════════════════════════════════════════════════════════════════════════════
-- LEDGER SIGN RULES
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.enforce_pass_ledger_entry_sign()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.entry_type in ('purchase', 'bonus', 'manual_credit', 'credit_restored')
     and new.quantity <= 0 then
    raise exception 'ledger_invalid_sign_positive';
  end if;

  if new.entry_type in (
    'session_used',
    'no_show_charged',
    'manual_debit',
    'package_refund',
    'expired_forfeit',
    'legacy_migration_debit'
  ) and new.quantity >= 0 then
    raise exception 'ledger_invalid_sign_negative';
  end if;

  return new;
end;
$$;

drop trigger if exists coach_client_pass_ledger_sign_trigger
  on public.coach_client_pass_ledger;
create trigger coach_client_pass_ledger_sign_trigger
before insert on public.coach_client_pass_ledger
for each row execute function public.enforce_pass_ledger_entry_sign();

-- ══════════════════════════════════════════════════════════════════════════════
-- LEDGER SEMANTIC INTEGRITY (defense-in-depth)
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.enforce_pass_ledger_entry_semantics()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_session public.coach_scheduled_sessions;
begin
  case new.entry_type
    when 'purchase' then
      if new.scheduled_session_id is not null then
        raise exception 'ledger_purchase_must_not_link_appointment';
      end if;

    when 'session_used' then
      if new.scheduled_session_id is null then
        raise exception 'ledger_session_used_requires_appointment';
      end if;
      select * into v_session
      from public.coach_scheduled_sessions as s
      where s.id = new.scheduled_session_id;
      if not found then
        raise exception 'ledger_appointment_not_found';
      end if;
      if v_session.status <> 'completed' then
        raise exception 'ledger_session_used_requires_completed';
      end if;

    when 'no_show_charged' then
      if new.scheduled_session_id is null then
        raise exception 'ledger_no_show_requires_appointment';
      end if;
      select * into v_session
      from public.coach_scheduled_sessions as s
      where s.id = new.scheduled_session_id;
      if not found then
        raise exception 'ledger_appointment_not_found';
      end if;
      if v_session.status <> 'missed' then
        raise exception 'ledger_no_show_requires_missed';
      end if;
      if v_session.missed_charge_decision is distinct from 'charge' then
        raise exception 'ledger_no_show_requires_charge_decision';
      end if;

    when 'legacy_migration_debit' then
      if new.scheduled_session_id is not null then
        raise exception 'ledger_migration_debit_must_not_link_appointment';
      end if;
      if length(trim(new.reason)) < 3 then
        raise exception 'ledger_migration_debit_reason_required';
      end if;

    when 'manual_credit', 'manual_debit', 'bonus',
         'credit_restored', 'package_refund', 'expired_forfeit' then
      if new.scheduled_session_id is not null then
        raise exception 'ledger_adjustment_must_not_link_appointment';
      end if;
    else
      raise exception 'ledger_unknown_entry_type';
  end case;

  return new;
end;
$$;

drop trigger if exists coach_client_pass_ledger_semantics
  on public.coach_client_pass_ledger;
create trigger coach_client_pass_ledger_semantics
before insert on public.coach_client_pass_ledger
for each row execute function public.enforce_pass_ledger_entry_semantics();

-- ══════════════════════════════════════════════════════════════════════════════
-- LEDGER IMMUTABILITY (no UPDATE/DELETE via normal app paths)
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.deny_pass_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ledger_immutable';
end;
$$;

drop trigger if exists coach_client_pass_ledger_deny_update
  on public.coach_client_pass_ledger;
create trigger coach_client_pass_ledger_deny_update
before update on public.coach_client_pass_ledger
for each row execute function public.deny_pass_ledger_mutation();

drop trigger if exists coach_client_pass_ledger_deny_delete
  on public.coach_client_pass_ledger;
create trigger coach_client_pass_ledger_deny_delete
before delete on public.coach_client_pass_ledger
for each row execute function public.deny_pass_ledger_mutation();

-- ══════════════════════════════════════════════════════════════════════════════
-- CROSS-TABLE COACH / CLIENT CONSISTENCY
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.enforce_business_client_notes_coach_match()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_coach_id uuid;
begin
  select bc.coach_id into v_coach_id
  from public.coach_business_clients as bc
  where bc.id = new.business_client_id;

  if v_coach_id is null then
    raise exception 'business_client_not_found';
  end if;

  if new.coach_id is distinct from v_coach_id then
    raise exception 'business_client_coach_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists coach_business_client_notes_coach_match
  on public.coach_business_client_notes;
create trigger coach_business_client_notes_coach_match
before insert or update on public.coach_business_client_notes
for each row execute function public.enforce_business_client_notes_coach_match();

create or replace function public.enforce_pass_client_coach_match()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row public.coach_business_clients;
begin
  select * into v_row
  from public.coach_business_clients as bc
  where bc.id = new.business_client_id;

  if not found then
    raise exception 'business_client_not_found';
  end if;

  if new.coach_id is distinct from v_row.coach_id then
    raise exception 'pass_coach_client_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists coach_client_passes_coach_match
  on public.coach_client_passes;
create trigger coach_client_passes_coach_match
before insert or update on public.coach_client_passes
for each row execute function public.enforce_pass_client_coach_match();

create or replace function public.enforce_ledger_pass_client_coach_match()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pass public.coach_client_passes;
begin
  select * into v_pass
  from public.coach_client_passes as p
  where p.id = new.pass_id;

  if not found then
    raise exception 'pass_not_found';
  end if;

  if new.coach_id is distinct from v_pass.coach_id then
    raise exception 'ledger_coach_pass_mismatch';
  end if;

  if new.business_client_id is distinct from v_pass.business_client_id then
    raise exception 'ledger_client_pass_mismatch';
  end if;

  if new.scheduled_session_id is not null then
    if not exists (
      select 1
      from public.coach_scheduled_sessions as s
      where s.id = new.scheduled_session_id
        and s.business_client_id = new.business_client_id
        and s.coach_id = new.coach_id
    ) then
      raise exception 'ledger_appointment_client_mismatch';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists coach_client_pass_ledger_integrity
  on public.coach_client_pass_ledger;
create trigger coach_client_pass_ledger_integrity
before insert on public.coach_client_pass_ledger
for each row execute function public.enforce_ledger_pass_client_coach_match();

create or replace function public.enforce_appointment_business_client_match()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client public.coach_business_clients;
begin
  if new.business_client_id is null then
    return new;
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

  if new.athlete_id is not null and v_client.linked_user_id is not null
     and new.athlete_id is distinct from v_client.linked_user_id then
    raise exception 'appointment_athlete_link_mismatch';
  end if;

  if new.athlete_id is not null and v_client.linked_user_id is null then
    raise exception 'appointment_athlete_without_link';
  end if;

  return new;
end;
$$;

drop trigger if exists coach_scheduled_sessions_business_client_match
  on public.coach_scheduled_sessions;
create trigger coach_scheduled_sessions_business_client_match
before insert or update on public.coach_scheduled_sessions
for each row execute function public.enforce_appointment_business_client_match();

create or replace function public.enforce_coach_clients_bridge_match()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client public.coach_business_clients;
begin
  if new.business_client_id is null then
    return new;
  end if;

  select * into v_client
  from public.coach_business_clients as bc
  where bc.id = new.business_client_id;

  if not found then
    raise exception 'business_client_not_found';
  end if;

  if new.coach_id is distinct from v_client.coach_id then
    raise exception 'bridge_coach_client_mismatch';
  end if;

  if v_client.linked_user_id is not null
     and new.athlete_id is distinct from v_client.linked_user_id then
    raise exception 'bridge_athlete_link_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists coach_clients_bridge_match
  on public.coach_clients;
create trigger coach_clients_bridge_match
before insert or update on public.coach_clients
for each row execute function public.enforce_coach_clients_bridge_match();

-- Prevent mutating immutable pass metadata after creation
create or replace function public.enforce_pass_metadata_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sessions_purchased is distinct from old.sessions_purchased then
    raise exception 'pass_sessions_purchased_immutable';
  end if;

  if new.business_client_id is distinct from old.business_client_id then
    raise exception 'pass_client_immutable';
  end if;

  if new.coach_id is distinct from old.coach_id then
    raise exception 'pass_coach_immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists coach_client_passes_metadata_immutable
  on public.coach_client_passes;
create trigger coach_client_passes_metadata_immutable
before update on public.coach_client_passes
for each row execute function public.enforce_pass_metadata_immutable();

-- Defense-in-depth: debits cannot drive balance below zero
create or replace function public.enforce_pass_ledger_balance_floor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_balance integer;
begin
  if new.quantity >= 0 then
    return new;
  end if;

  select coalesce(sum(l.quantity), 0)::integer into v_balance
  from public.coach_client_pass_ledger as l
  where l.pass_id = new.pass_id;

  if v_balance + new.quantity < 0 then
    raise exception 'ledger_would_go_negative';
  end if;

  return new;
end;
$$;

drop trigger if exists coach_client_pass_ledger_balance_floor
  on public.coach_client_pass_ledger;
create trigger coach_client_pass_ledger_balance_floor
before insert on public.coach_client_pass_ledger
for each row execute function public.enforce_pass_ledger_balance_floor();

-- Missed charge: only when status = missed; decision + decided_at immutable once set
create or replace function public.enforce_missed_charge_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.missed_charge_decision is not null
     and new.status <> 'missed' then
    raise exception 'missed_charge_requires_missed_status';
  end if;

  if old.missed_charge_decision is not null then
    if new.missed_charge_decision is distinct from old.missed_charge_decision then
      raise exception 'missed_charge_decision_immutable';
    end if;
    if new.missed_charge_decided_at is distinct from old.missed_charge_decided_at then
      raise exception 'missed_charge_decided_at_immutable';
    end if;
  end if;

  if new.missed_charge_decision is not null and old.missed_charge_decision is null then
    new.missed_charge_decided_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists coach_scheduled_sessions_missed_charge_once
  on public.coach_scheduled_sessions;
create trigger coach_scheduled_sessions_missed_charge_once
before update on public.coach_scheduled_sessions
for each row execute function public.enforce_missed_charge_decision();

commit;
