-- AVAREN Sprint 8.4.4 — RLS (coach-only) + SECURITY DEFINER RPCs (PROPOSAL)
-- Run ONLY after 8_4_1C verification passes (all mismatch counts = 0).
-- DO NOT RUN AUTOMATICALLY.

begin;

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE PRIVILEGES — NO DIRECT PASS / LEDGER MUTATION
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.coach_business_clients enable row level security;
alter table public.coach_business_client_notes enable row level security;
alter table public.coach_client_passes enable row level security;
alter table public.coach_client_pass_ledger enable row level security;

revoke all on table public.coach_business_clients from public, anon, authenticated;
revoke all on table public.coach_business_client_notes from public, anon, authenticated;
revoke all on table public.coach_client_passes from public, anon, authenticated;
revoke all on table public.coach_client_pass_ledger from public, anon, authenticated;

-- Coach: read/write business clients + notes; read passes + ledger only
grant select, insert, update on public.coach_business_clients to authenticated;
grant select, insert, update on public.coach_business_client_notes to authenticated;
grant select, update on public.coach_client_passes to authenticated;
grant select on public.coach_client_pass_ledger to authenticated;
-- NO INSERT on coach_client_passes or coach_client_pass_ledger for authenticated

drop policy if exists coach_business_clients_coach on public.coach_business_clients;
create policy coach_business_clients_coach on public.coach_business_clients
for all to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (coach_id = auth.uid() and public.is_avaren_coach());

drop policy if exists coach_business_client_notes_coach on public.coach_business_client_notes;
create policy coach_business_client_notes_coach on public.coach_business_client_notes
for all to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (coach_id = auth.uid() and public.is_avaren_coach());

drop policy if exists coach_client_passes_coach on public.coach_client_passes;
create policy coach_client_passes_coach on public.coach_client_passes
for all to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (coach_id = auth.uid() and public.is_avaren_coach());

drop policy if exists coach_client_pass_ledger_coach_select on public.coach_client_pass_ledger;
create policy coach_client_pass_ledger_coach_select on public.coach_client_pass_ledger
for select to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach());

-- ══════════════════════════════════════════════════════════════════════════════
-- HELPER: eligible passes for a business client on session date
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public._eligible_passes_for_session(
  p_business_client_id uuid,
  p_coach_id uuid,
  p_session_date date
)
returns table (
  pass_id uuid,
  pass_name text,
  balance integer,
  starts_at date,
  expires_at date
)
language sql
stable
set search_path = ''
as $$
  select
    p.id,
    p.name,
    coalesce(b.balance, 0)::integer,
    p.starts_at,
    p.expires_at
  from public.coach_client_passes as p
  left join public.coach_client_pass_balances as b on b.pass_id = p.id
  where p.business_client_id = p_business_client_id
    and p.coach_id = p_coach_id
    and p.status = 'active'
    and p.starts_at <= p_session_date
    and (p.expires_at is null or p.expires_at >= p_session_date)
    and coalesce(b.balance, 0) > 0;
$$;

revoke all on function public._eligible_passes_for_session(uuid, uuid, date) from public, anon, authenticated;

-- Returns true when pass satisfies canonical session eligibility (post-lock revalidation).
create or replace function public._pass_is_eligible_for_session(
  p_pass_id uuid,
  p_business_client_id uuid,
  p_coach_id uuid,
  p_session_date date
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public._eligible_passes_for_session(
      p_business_client_id, p_coach_id, p_session_date
    ) as e
    where e.pass_id = p_pass_id
  );
$$;

revoke all on function public._pass_is_eligible_for_session(uuid, uuid, uuid, date)
  from public, anon, authenticated;

-- Internal: atomically finalize missed charge (decision + debit) when eligible.
create or replace function public._execute_missed_session_pass_charge(
  p_scheduled_session_id uuid,
  p_pass_id uuid,
  p_coach_id uuid,
  p_set_decision boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.coach_scheduled_sessions;
  v_pass public.coach_client_passes;
  v_balance integer;
  v_session_date date;
begin
  select * into v_session
  from public.coach_scheduled_sessions as s
  where s.id = p_scheduled_session_id and s.coach_id = p_coach_id
  for update;

  if not found then raise exception 'session_not_found'; end if;
  if v_session.status <> 'missed' then raise exception 'session_not_missed'; end if;
  if v_session.business_client_id is null then raise exception 'session_missing_business_client'; end if;

  if v_session.missed_charge_decision = 'no_charge' then
    raise exception 'missed_charge_waived';
  end if;

  if exists (
    select 1 from public.coach_client_pass_ledger as l
    where l.scheduled_session_id = p_scheduled_session_id
      and l.entry_type in ('session_used', 'no_show_charged')
  ) then
    return jsonb_build_object('ok', true, 'unchanged', true, 'debited', true);
  end if;

  v_session_date := coalesce(
    v_session.session_date,
    (v_session.starts_at at time zone v_session.schedule_timezone)::date
  );

  select * into v_pass
  from public.coach_client_passes as p
  where p.id = p_pass_id
  for update;

  if not found then
    raise exception 'pass_not_eligible_for_session';
  end if;

  select coalesce(sum(l.quantity), 0)::integer into v_balance
  from public.coach_client_pass_ledger as l
  where l.pass_id = v_pass.id;

  if v_pass.coach_id is distinct from p_coach_id
     or v_pass.business_client_id is distinct from v_session.business_client_id
     or v_pass.status <> 'active'
     or v_pass.starts_at > v_session_date
     or (v_pass.expires_at is not null and v_pass.expires_at < v_session_date)
     or v_balance <= 0 then
    raise exception 'pass_not_eligible_for_session';
  end if;

  if p_set_decision and v_session.missed_charge_decision is null then
    update public.coach_scheduled_sessions
    set missed_charge_decision = 'charge'
    where id = p_scheduled_session_id;
  elsif v_session.missed_charge_decision is distinct from 'charge' then
    raise exception 'missed_charge_not_approved';
  end if;

  insert into public.coach_client_pass_ledger (
    pass_id, coach_id, business_client_id,
    entry_type, quantity, scheduled_session_id, reason, created_by
  ) values (
    v_pass.id, p_coach_id, v_session.business_client_id,
    'no_show_charged', -1, p_scheduled_session_id,
    'Missed session — coach charged credit', p_coach_id
  );

  return jsonb_build_object(
    'ok', true,
    'pass_id', v_pass.id,
    'balance_after', v_balance - 1,
    'debited', true,
    'decision', 'charge'
  );
end;
$$;

revoke all on function public._execute_missed_session_pass_charge(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- ATHLETE RPC: get_my_training_pass_summary
-- Caller: authenticated athlete (linked_user_id match)
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.get_my_training_pass_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := auth.uid();
  v_result jsonb := '[]'::jsonb;
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(jsonb_agg(row order by row->>'starts_at' desc), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'pass_id', p.id,
      'name', p.name,
      'balance', coalesce(b.balance, 0),
      'starts_at', p.starts_at,
      'expires_at', p.expires_at,
      'status', p.status
    ) as row
    from public.coach_business_clients as bc
    join public.coach_client_passes as p on p.business_client_id = bc.id
    left join public.coach_client_pass_balances as b on b.pass_id = p.id
    where bc.linked_user_id = v_athlete_id
      and p.status = 'active'
  ) as q;

  return v_result;
end;
$$;

revoke all on function public.get_my_training_pass_summary() from public, anon, authenticated;
grant execute on function public.get_my_training_pass_summary() to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- ATHLETE RPC: list_my_pass_usage_history (LIMIT before aggregate)
-- Caller: authenticated athlete
-- Regression: >30 ledger rows — only newest p_limit returned
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.list_my_pass_usage_history(p_limit integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'occurred_at', scoped.created_at,
          'entry_type', scoped.entry_type,
          'quantity', scoped.quantity,
          'pass_name', scoped.pass_name
        )
        order by scoped.created_at desc
      )
      from (
        select
          l.created_at,
          l.entry_type,
          l.quantity,
          p.name as pass_name
        from public.coach_client_pass_ledger as l
        join public.coach_client_passes as p on p.id = l.pass_id
        join public.coach_business_clients as bc on bc.id = l.business_client_id
        where bc.linked_user_id = v_athlete_id
          and l.entry_type in (
            'session_used', 'no_show_charged', 'purchase', 'bonus', 'credit_restored'
          )
        order by l.created_at desc
        limit v_limit
      ) as scoped
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_my_pass_usage_history(integer) from public, anon, authenticated;
grant execute on function public.list_my_pass_usage_history(integer) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- COACH RPC: create_coach_client_pass (atomic pass + PURCHASE)
-- Caller: authenticated coach
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.create_coach_client_pass(
  p_business_client_id uuid,
  p_name text,
  p_sessions_purchased integer,
  p_starts_at date,
  p_expires_at date default null,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_client public.coach_business_clients;
  v_pass public.coach_client_passes;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  if p_sessions_purchased <= 0 then
    raise exception 'invalid_session_count';
  end if;

  if p_starts_at is null then
    raise exception 'starts_at_required';
  end if;

  select * into v_client
  from public.coach_business_clients as bc
  where bc.id = p_business_client_id and bc.coach_id = v_coach_id;

  if not found then
    raise exception 'business_client_not_found';
  end if;

  insert into public.coach_client_passes (
    coach_id, business_client_id, name, sessions_purchased,
    starts_at, expires_at, notes
  ) values (
    v_coach_id, p_business_client_id, coalesce(nullif(trim(p_name), ''), 'Training pass'),
    p_sessions_purchased, p_starts_at, p_expires_at, coalesce(p_notes, '')
  ) returning * into v_pass;

  insert into public.coach_client_pass_ledger (
    pass_id, coach_id, business_client_id,
    entry_type, quantity, reason, created_by
  ) values (
    v_pass.id, v_coach_id, p_business_client_id,
    'purchase', p_sessions_purchased,
    'Package created', v_coach_id
  );

  return jsonb_build_object(
    'ok', true,
    'pass_id', v_pass.id,
    'balance', p_sessions_purchased
  );
end;
$$;

revoke all on function public.create_coach_client_pass(uuid, text, integer, date, date, text)
  from public, anon, authenticated;
grant execute on function public.create_coach_client_pass(uuid, text, integer, date, date, text)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- COACH RPC: record_completed_session_pass_usage
-- Caller: authenticated coach
-- Multiple eligible passes → pass_selection_required (no silent pick)
-- Concurrency: lock pass FOR UPDATE, recompute balance, then debit
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.record_completed_session_pass_usage(
  p_scheduled_session_id uuid,
  p_pass_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions;
  v_pass public.coach_client_passes;
  v_balance integer;
  v_eligible_count integer;
  v_candidates jsonb;
  v_session_date date;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  select * into v_session
  from public.coach_scheduled_sessions as s
  where s.id = p_scheduled_session_id and s.coach_id = v_coach_id
  for update;

  if not found then raise exception 'session_not_found'; end if;
  if v_session.status <> 'completed' then raise exception 'session_not_completed'; end if;
  if v_session.business_client_id is null then raise exception 'session_missing_business_client'; end if;

  v_session_date := coalesce(v_session.session_date, (v_session.starts_at at time zone v_session.schedule_timezone)::date);

  -- Idempotent: already charged
  if exists (
    select 1 from public.coach_client_pass_ledger as l
    where l.scheduled_session_id = p_scheduled_session_id
      and l.entry_type in ('session_used', 'no_show_charged')
  ) then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  select count(*), coalesce(jsonb_agg(jsonb_build_object(
    'pass_id', e.pass_id,
    'name', e.pass_name,
    'balance', e.balance,
    'starts_at', e.starts_at,
    'expires_at', e.expires_at
  )), '[]'::jsonb)
  into v_eligible_count, v_candidates
  from public._eligible_passes_for_session(
    v_session.business_client_id, v_coach_id, v_session_date
  ) as e;

  if v_eligible_count = 0 then
    return jsonb_build_object('ok', true, 'no_pass', true);
  end if;

  if p_pass_id is null and v_eligible_count > 1 then
    return jsonb_build_object(
      'ok', false,
      'pass_selection_required', true,
      'candidates', v_candidates
    );
  end if;

  if p_pass_id is null then
    select pass_id into p_pass_id
    from public._eligible_passes_for_session(
      v_session.business_client_id, v_coach_id, v_session_date
    )
    limit 1;
  end if;

  select * into v_pass
  from public.coach_client_passes as p
  where p.id = p_pass_id
  for update;

  if not found then
    raise exception 'pass_not_eligible_for_session';
  end if;

  select coalesce(sum(l.quantity), 0)::integer into v_balance
  from public.coach_client_pass_ledger as l
  where l.pass_id = v_pass.id;

  if v_pass.coach_id is distinct from v_coach_id
     or v_pass.business_client_id is distinct from v_session.business_client_id
     or v_pass.status <> 'active'
     or v_pass.starts_at > v_session_date
     or (v_pass.expires_at is not null and v_pass.expires_at < v_session_date)
     or v_balance <= 0 then
    raise exception 'pass_not_eligible_for_session';
  end if;

  insert into public.coach_client_pass_ledger (
    pass_id, coach_id, business_client_id,
    entry_type, quantity, scheduled_session_id, reason, created_by
  ) values (
    v_pass.id, v_coach_id, v_session.business_client_id,
    'session_used', -1, p_scheduled_session_id,
    'Completed in-person session', v_coach_id
  );

  return jsonb_build_object(
    'ok', true,
    'pass_id', v_pass.id,
    'balance_after', v_balance - 1
  );
end;
$$;

revoke all on function public.record_completed_session_pass_usage(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_completed_session_pass_usage(uuid, uuid)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- COACH RPC: record_missed_session_pass_charge
-- Caller: coach after pass selection (multi-pass) or direct with explicit pass_id
-- Atomically sets decision=charge + inserts no_show_charged when decision not yet set
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.record_missed_session_pass_charge(
  p_scheduled_session_id uuid,
  p_pass_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions;
  v_eligible_count integer;
  v_candidates jsonb;
  v_session_date date;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  if p_pass_id is null then
    raise exception 'pass_id_required';
  end if;

  select * into v_session
  from public.coach_scheduled_sessions as s
  where s.id = p_scheduled_session_id and s.coach_id = v_coach_id
  for update;

  if not found then raise exception 'session_not_found'; end if;
  if v_session.status <> 'missed' then raise exception 'session_not_missed'; end if;

  if v_session.missed_charge_decision = 'no_charge' then
    raise exception 'missed_charge_waived';
  end if;

  if exists (
    select 1 from public.coach_client_pass_ledger as l
    where l.scheduled_session_id = p_scheduled_session_id
      and l.entry_type in ('session_used', 'no_show_charged')
  ) then
    return jsonb_build_object('ok', true, 'unchanged', true, 'debited', true);
  end if;

  v_session_date := coalesce(
    v_session.session_date,
    (v_session.starts_at at time zone v_session.schedule_timezone)::date
  );

  if v_session.missed_charge_decision is null then
    if not public._pass_is_eligible_for_session(
      p_pass_id, v_session.business_client_id, v_coach_id, v_session_date
    ) then
      raise exception 'pass_not_eligible_for_session';
    end if;

    return public._execute_missed_session_pass_charge(
      p_scheduled_session_id, p_pass_id, v_coach_id, true
    );
  end if;

  if v_session.missed_charge_decision = 'charge' then
    return public._execute_missed_session_pass_charge(
      p_scheduled_session_id, p_pass_id, v_coach_id, false
    );
  end if;

  raise exception 'missed_charge_not_approved';
end;
$$;

revoke all on function public.record_missed_session_pass_charge(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_missed_session_pass_charge(uuid, uuid)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- COACH RPC: set_missed_session_charge_decision (immutable once set)
-- no_charge: persisted immediately
-- charge: eligibility resolved BEFORE irreversible decision; multi-pass returns selection first
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.set_missed_session_charge_decision(
  p_scheduled_session_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions;
  v_eligible_count integer;
  v_candidates jsonb;
  v_session_date date;
  v_pass_id uuid;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  if p_decision not in ('charge', 'no_charge') then
    raise exception 'invalid_missed_charge_decision';
  end if;

  select * into v_session
  from public.coach_scheduled_sessions as s
  where s.id = p_scheduled_session_id and s.coach_id = v_coach_id
  for update;

  if not found then raise exception 'session_not_found'; end if;
  if v_session.status <> 'missed' then raise exception 'session_not_missed'; end if;

  if v_session.missed_charge_decision is not null then
    return jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'decision', v_session.missed_charge_decision
    );
  end if;

  if exists (
    select 1 from public.coach_client_pass_ledger as l
    where l.scheduled_session_id = p_scheduled_session_id
      and l.entry_type in ('session_used', 'no_show_charged')
  ) then
    return jsonb_build_object('ok', true, 'unchanged', true, 'debited', true);
  end if;

  if p_decision = 'no_charge' then
    update public.coach_scheduled_sessions
    set missed_charge_decision = 'no_charge'
    where id = p_scheduled_session_id;

    return jsonb_build_object('ok', true, 'decision', 'no_charge', 'debited', false);
  end if;

  v_session_date := coalesce(
    v_session.session_date,
    (v_session.starts_at at time zone v_session.schedule_timezone)::date
  );

  select count(*), coalesce(jsonb_agg(jsonb_build_object(
    'pass_id', e.pass_id,
    'name', e.pass_name,
    'balance', e.balance,
    'starts_at', e.starts_at,
    'expires_at', e.expires_at
  )), '[]'::jsonb)
  into v_eligible_count, v_candidates
  from public._eligible_passes_for_session(
    v_session.business_client_id, v_coach_id, v_session_date
  ) as e;

  if v_eligible_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'no_pass', true,
      'requires_coach_resolution', true
    );
  end if;

  if v_eligible_count > 1 then
    return jsonb_build_object(
      'ok', false,
      'pass_selection_required', true,
      'candidates', v_candidates
    );
  end if;

  select e.pass_id into v_pass_id
  from public._eligible_passes_for_session(
    v_session.business_client_id, v_coach_id, v_session_date
  ) as e
  limit 1;

  return public._execute_missed_session_pass_charge(
    p_scheduled_session_id, v_pass_id, v_coach_id, true
  );
end;
$$;

revoke all on function public.set_missed_session_charge_decision(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_missed_session_charge_decision(uuid, text)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- COACH RPC: manual pass adjustments
-- Caller: authenticated coach
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.apply_coach_client_pass_manual_credit(
  p_pass_id uuid,
  p_quantity integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_pass public.coach_client_passes;
  v_balance integer;
begin
  if v_coach_id is null or not public.is_avaren_coach() then raise exception 'not_authorized'; end if;
  if p_quantity <= 0 then raise exception 'invalid_quantity'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;

  select * into v_pass from public.coach_client_passes as p
  where p.id = p_pass_id and p.coach_id = v_coach_id for update;
  if not found then raise exception 'pass_not_found'; end if;

  insert into public.coach_client_pass_ledger (
    pass_id, coach_id, business_client_id, entry_type, quantity, reason, created_by
  ) values (
    v_pass.id, v_coach_id, v_pass.business_client_id,
    'manual_credit', p_quantity, trim(p_reason), v_coach_id
  );

  select coalesce(sum(l.quantity), 0)::integer into v_balance
  from public.coach_client_pass_ledger as l where l.pass_id = v_pass.id;

  return jsonb_build_object('ok', true, 'balance_after', v_balance);
end;
$$;

revoke all on function public.apply_coach_client_pass_manual_credit(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.apply_coach_client_pass_manual_credit(uuid, integer, text)
  to authenticated;

create or replace function public.apply_coach_client_pass_manual_debit(
  p_pass_id uuid,
  p_quantity integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_pass public.coach_client_passes;
  v_balance integer;
begin
  if v_coach_id is null or not public.is_avaren_coach() then raise exception 'not_authorized'; end if;
  if p_quantity <= 0 then raise exception 'invalid_quantity'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;

  select * into v_pass from public.coach_client_passes as p
  where p.id = p_pass_id and p.coach_id = v_coach_id for update;
  if not found then raise exception 'pass_not_found'; end if;

  select coalesce(sum(l.quantity), 0)::integer into v_balance
  from public.coach_client_pass_ledger as l where l.pass_id = v_pass.id;

  if v_balance < p_quantity then
    raise exception 'insufficient_balance';
  end if;

  insert into public.coach_client_pass_ledger (
    pass_id, coach_id, business_client_id, entry_type, quantity, reason, created_by
  ) values (
    v_pass.id, v_coach_id, v_pass.business_client_id,
    'manual_debit', -p_quantity, trim(p_reason), v_coach_id
  );

  return jsonb_build_object('ok', true, 'balance_after', v_balance - p_quantity);
end;
$$;

revoke all on function public.apply_coach_client_pass_manual_debit(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.apply_coach_client_pass_manual_debit(uuid, integer, text)
  to authenticated;

create or replace function public.apply_coach_client_pass_bonus(
  p_pass_id uuid,
  p_quantity integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_pass public.coach_client_passes;
  v_balance integer;
begin
  if v_coach_id is null or not public.is_avaren_coach() then raise exception 'not_authorized'; end if;
  if p_quantity <= 0 then raise exception 'invalid_quantity'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;

  select * into v_pass from public.coach_client_passes as p
  where p.id = p_pass_id and p.coach_id = v_coach_id for update;
  if not found then raise exception 'pass_not_found'; end if;

  insert into public.coach_client_pass_ledger (
    pass_id, coach_id, business_client_id, entry_type, quantity, reason, created_by
  ) values (
    v_pass.id, v_coach_id, v_pass.business_client_id,
    'bonus', p_quantity, trim(p_reason), v_coach_id
  );

  select coalesce(sum(l.quantity), 0)::integer into v_balance
  from public.coach_client_pass_ledger as l where l.pass_id = v_pass.id;

  return jsonb_build_object('ok', true, 'balance_after', v_balance);
end;
$$;

revoke all on function public.apply_coach_client_pass_bonus(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.apply_coach_client_pass_bonus(uuid, integer, text)
  to authenticated;

create or replace function public.apply_coach_client_pass_credit_restored(
  p_pass_id uuid,
  p_quantity integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_pass public.coach_client_passes;
  v_balance integer;
begin
  if v_coach_id is null or not public.is_avaren_coach() then raise exception 'not_authorized'; end if;
  if p_quantity <= 0 then raise exception 'invalid_quantity'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;

  select * into v_pass from public.coach_client_passes as p
  where p.id = p_pass_id and p.coach_id = v_coach_id for update;
  if not found then raise exception 'pass_not_found'; end if;

  insert into public.coach_client_pass_ledger (
    pass_id, coach_id, business_client_id, entry_type, quantity, reason, created_by
  ) values (
    v_pass.id, v_coach_id, v_pass.business_client_id,
    'credit_restored', p_quantity, trim(p_reason), v_coach_id
  );

  select coalesce(sum(l.quantity), 0)::integer into v_balance
  from public.coach_client_pass_ledger as l where l.pass_id = v_pass.id;

  return jsonb_build_object('ok', true, 'balance_after', v_balance);
end;
$$;

revoke all on function public.apply_coach_client_pass_credit_restored(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.apply_coach_client_pass_credit_restored(uuid, integer, text)
  to authenticated;

create or replace function public.apply_coach_client_pass_package_refund(
  p_pass_id uuid,
  p_quantity integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_pass public.coach_client_passes;
  v_balance integer;
begin
  if v_coach_id is null or not public.is_avaren_coach() then raise exception 'not_authorized'; end if;
  if p_quantity <= 0 then raise exception 'invalid_quantity'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;

  select * into v_pass from public.coach_client_passes as p
  where p.id = p_pass_id and p.coach_id = v_coach_id for update;
  if not found then raise exception 'pass_not_found'; end if;

  select coalesce(sum(l.quantity), 0)::integer into v_balance
  from public.coach_client_pass_ledger as l where l.pass_id = v_pass.id;

  if v_balance < p_quantity then
    raise exception 'insufficient_balance';
  end if;

  insert into public.coach_client_pass_ledger (
    pass_id, coach_id, business_client_id, entry_type, quantity, reason, created_by
  ) values (
    v_pass.id, v_coach_id, v_pass.business_client_id,
    'package_refund', -p_quantity, trim(p_reason), v_coach_id
  );

  return jsonb_build_object('ok', true, 'balance_after', v_balance - p_quantity);
end;
$$;

revoke all on function public.apply_coach_client_pass_package_refund(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.apply_coach_client_pass_package_refund(uuid, integer, text)
  to authenticated;

create or replace function public.apply_coach_client_pass_expired_forfeit(
  p_pass_id uuid,
  p_quantity integer,
  p_reason text default 'Credits expired'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_pass public.coach_client_passes;
  v_balance integer;
  v_forfeit integer;
begin
  if v_coach_id is null or not public.is_avaren_coach() then raise exception 'not_authorized'; end if;

  select * into v_pass from public.coach_client_passes as p
  where p.id = p_pass_id and p.coach_id = v_coach_id for update;
  if not found then raise exception 'pass_not_found'; end if;

  select coalesce(sum(l.quantity), 0)::integer into v_balance
  from public.coach_client_pass_ledger as l where l.pass_id = v_pass.id;

  v_forfeit := coalesce(nullif(p_quantity, 0), v_balance);
  if v_forfeit <= 0 then
    return jsonb_build_object('ok', true, 'balance_after', v_balance, 'unchanged', true);
  end if;
  if v_balance < v_forfeit then
    raise exception 'insufficient_balance';
  end if;

  insert into public.coach_client_pass_ledger (
    pass_id, coach_id, business_client_id, entry_type, quantity, reason, created_by
  ) values (
    v_pass.id, v_coach_id, v_pass.business_client_id,
    'expired_forfeit', -v_forfeit, coalesce(nullif(trim(p_reason), ''), 'Credits expired'), v_coach_id
  );

  update public.coach_client_passes set status = 'expired', updated_at = now()
  where id = v_pass.id;

  return jsonb_build_object('ok', true, 'balance_after', v_balance - v_forfeit);
end;
$$;

revoke all on function public.apply_coach_client_pass_expired_forfeit(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.apply_coach_client_pass_expired_forfeit(uuid, integer, text)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- ATHLETE RPC: accept_coach_invitation_for_business_client
-- Caller: authenticated athlete (email validates recipient only)
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

  update public.coach_scheduled_sessions as s
  set athlete_id = v_user_id
  where s.business_client_id = v_client.id
    and s.athlete_id is null;

  return jsonb_build_object('ok', true, 'business_client_id', v_client.id);
end;
$$;

revoke all on function public.accept_coach_invitation_for_business_client(uuid)
  from public, anon, authenticated;
grant execute on function public.accept_coach_invitation_for_business_client(uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC EXECUTE PERMISSIONS SUMMARY (8.4.4)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- | RPC | Intended caller |
-- |-----|-----------------|
-- | get_my_training_pass_summary() | authenticated athlete |
-- | list_my_pass_usage_history(integer) | authenticated athlete |
-- | accept_coach_invitation_for_business_client(uuid) | authenticated athlete |
-- | create_coach_client_pass(...) | authenticated coach |
-- | record_completed_session_pass_usage(uuid, uuid) | authenticated coach |
-- | set_missed_session_charge_decision(uuid, text) | authenticated coach |
-- | record_missed_session_pass_charge(uuid, uuid) | authenticated coach |
-- | apply_coach_client_pass_manual_credit(...) | authenticated coach |
-- | apply_coach_client_pass_manual_debit(...) | authenticated coach |
-- | apply_coach_client_pass_bonus(...) | authenticated coach |
-- | apply_coach_client_pass_credit_restored(...) | authenticated coach |
-- | apply_coach_client_pass_package_refund(...) | authenticated coach |
-- | apply_coach_client_pass_expired_forfeit(...) | authenticated coach |
-- | _eligible_passes_for_session(...) | internal only (no GRANT) |
-- | _pass_is_eligible_for_session(...) | internal only (no GRANT) |
-- | _execute_missed_session_pass_charge(...) | internal only (no GRANT) |
--
-- All: REVOKE FROM public, anon; GRANT EXECUTE TO authenticated only.
-- Each RPC authenticates with auth.uid() internally.
