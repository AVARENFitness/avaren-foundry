-- AVAREN 8.7.1 — Coach Client Coaching Requirements (hardened)
-- STOP: review and approve before running in Supabase.
--
-- Depends on:
--   public.coach_business_clients (8.4.1A)
--   public.coach_clients bridge (existing)
--
-- Run precheck first:
--   AVAREN_COACH_CLIENT_REQUIREMENTS_8_7_PRECHECK.sql (8.7.2 column-safe)
--
-- Run verification after:
--   AVAREN_COACH_CLIENT_REQUIREMENTS_8_7_VERIFICATION.sql

-- ══════════════════════════════════════════════════════════════════════════════
-- SCHEMA
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.coach_business_clients
  add column if not exists coaching_requirements jsonb not null
    default '{"weekly_check_in":"required"}'::jsonb;

comment on column public.coach_business_clients.coaching_requirements is
  'Coach-controlled recurring athlete obligations. Supported keys today: weekly_check_in = required|not_required. Additional keys may be added in future migrations.';

alter table public.coach_business_clients
  drop constraint if exists coach_business_clients_coaching_requirements_check;

alter table public.coach_business_clients
  add constraint coach_business_clients_coaching_requirements_check
  check (
    coaching_requirements ? 'weekly_check_in'
    and coaching_requirements->>'weekly_check_in' in ('required', 'not_required')
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- COACH UPDATE RPC — merge supported key only; never replace entire JSON object
-- ══════════════════════════════════════════════════════════════════════════════

drop function if exists public.update_business_client_coaching_requirements(uuid, jsonb);

create or replace function public.update_business_client_coaching_requirements(
  p_business_client_id uuid,
  p_weekly_check_in text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_row public.coach_business_clients;
  v_merged jsonb;
begin
  if v_coach_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_business_client_id is null then
    raise exception 'business_client_not_found';
  end if;

  if p_weekly_check_in is null
     or p_weekly_check_in not in ('required', 'not_required') then
    raise exception 'invalid_weekly_check_in_requirement';
  end if;

  update public.coach_business_clients as bc
  set
    coaching_requirements = jsonb_set(
      coalesce(bc.coaching_requirements, '{}'::jsonb),
      '{weekly_check_in}',
      to_jsonb(p_weekly_check_in),
      true
    ),
    updated_at = pg_catalog.now()
  where bc.id = p_business_client_id
    and bc.coach_id = v_coach_id
  returning bc.* into v_row;

  if not found then
    raise exception 'business_client_not_found';
  end if;

  v_merged := v_row.coaching_requirements;

  return jsonb_build_object(
    'ok', true,
    'business_client_id', v_row.id,
    'weekly_check_in', v_merged->>'weekly_check_in'
  );
end;
$$;

revoke all on function public.update_business_client_coaching_requirements(uuid, text) from public;
grant execute on function public.update_business_client_coaching_requirements(uuid, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- ATHLETE READ RPC — exact active bridged relationship; fail on duplicates
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.get_athlete_coaching_requirements()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := auth.uid();
  v_relationship_count integer := 0;
  v_requirements jsonb;
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  select count(distinct bc.id)::integer
  into v_relationship_count
  from public.coach_business_clients as bc
  join public.coach_clients as cc
    on cc.business_client_id = bc.id
   and cc.coach_id = bc.coach_id
   and cc.athlete_id = bc.linked_user_id
  where bc.linked_user_id = v_athlete_id
    and bc.status = 'active';

  if v_relationship_count > 1 then
    raise exception 'duplicate_active_linked_relationships';
  end if;

  if v_relationship_count = 0 then
    return jsonb_build_object('weekly_check_in', 'not_required');
  end if;

  select bc.coaching_requirements
  into v_requirements
  from public.coach_business_clients as bc
  join public.coach_clients as cc
    on cc.business_client_id = bc.id
   and cc.coach_id = bc.coach_id
   and cc.athlete_id = bc.linked_user_id
  where bc.linked_user_id = v_athlete_id
    and bc.status = 'active';

  return jsonb_build_object(
    'weekly_check_in',
    coalesce(v_requirements->>'weekly_check_in', 'required')
  );
end;
$$;

revoke all on function public.get_athlete_coaching_requirements() from public;
grant execute on function public.get_athlete_coaching_requirements() to authenticated;
