-- AVAREN Coach Floor Mode — ad-hoc client training
-- Applied to production as migration: coach_floor_mode_ad_hoc_sessions
-- Extends Floor Mode so a coach can start training from an active client profile
-- without a pre-existing calendar appointment.

begin;

alter table public.coach_floor_sessions
  alter column scheduled_session_id drop not null;

alter table public.coach_floor_sessions
  add column if not exists origin text not null default 'scheduled'
    check (origin in ('scheduled','ad_hoc'));

update public.coach_floor_sessions
set origin = case
  when scheduled_session_id is null then 'ad_hoc'
  else 'scheduled'
end;

alter table public.coach_client_pass_ledger
  add column if not exists coach_floor_session_id uuid null
    references public.coach_floor_sessions(id) on delete restrict;

create unique index if not exists coach_client_pass_ledger_floor_session_unique
  on public.coach_client_pass_ledger (coach_floor_session_id)
  where coach_floor_session_id is not null
    and entry_type = 'session_used';

create or replace function public.start_ad_hoc_coach_floor_session(
  p_business_client_id uuid,
  p_workout_name text default 'In-person workout'
)
returns public.coach_floor_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_client public.coach_business_clients;
  v_existing public.coach_floor_sessions;
  v_row public.coach_floor_sessions;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  select *
  into v_client
  from public.coach_business_clients
  where id = p_business_client_id
    and coach_id = v_coach_id
    and coalesce(status, 'active') = 'active';

  if not found then
    raise exception 'business_client_not_found';
  end if;

  select *
  into v_existing
  from public.coach_floor_sessions
  where coach_id = v_coach_id
    and business_client_id = p_business_client_id
    and origin = 'ad_hoc'
    and status = 'in_progress'
  order by started_at desc
  limit 1;

  if found then
    return v_existing;
  end if;

  insert into public.coach_floor_sessions (
    coach_id,
    scheduled_session_id,
    business_client_id,
    athlete_id,
    assignment_id,
    origin,
    status,
    workout_name,
    workout_payload,
    started_at,
    updated_at
  )
  values (
    v_coach_id,
    null,
    v_client.id,
    v_client.linked_user_id,
    null,
    'ad_hoc',
    'in_progress',
    left(coalesce(nullif(trim(p_workout_name), ''), 'In-person workout'), 200),
    '{}'::jsonb,
    now(),
    now()
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.save_ad_hoc_coach_floor_session(
  p_floor_session_id uuid,
  p_workout_name text,
  p_workout_payload jsonb,
  p_private_coach_note text default '',
  p_athlete_recap text default ''
)
returns public.coach_floor_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_row public.coach_floor_sessions;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  update public.coach_floor_sessions
  set
    workout_name = left(coalesce(nullif(trim(p_workout_name), ''), 'In-person workout'), 200),
    workout_payload = coalesce(p_workout_payload, '{}'::jsonb),
    private_coach_note = left(coalesce(p_private_coach_note, ''), 4000),
    athlete_recap = left(coalesce(p_athlete_recap, ''), 2000),
    updated_at = now()
  where id = p_floor_session_id
    and coach_id = v_coach_id
    and origin = 'ad_hoc'
    and status = 'in_progress'
  returning * into v_row;

  if not found then
    raise exception 'floor_session_not_found';
  end if;

  return v_row;
end;
$$;

create or replace function public.complete_ad_hoc_coach_floor_session(
  p_floor_session_id uuid,
  p_workout_name text,
  p_workout_payload jsonb,
  p_private_coach_note text default '',
  p_athlete_recap text default '',
  p_pass_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_floor public.coach_floor_sessions;
  v_completed_at timestamptz := now();
  v_workout_session_id text;
  v_payload jsonb;
  v_sets_count integer := 0;
  v_exercise_count integer := 0;
  v_eligible_count integer := 0;
  v_candidates jsonb := '[]'::jsonb;
  v_selected_pass uuid;
  v_pass public.coach_client_passes;
  v_balance integer := 0;
  v_pass_result jsonb := jsonb_build_object('ok', true, 'no_pass', true);
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  select *
  into v_floor
  from public.coach_floor_sessions
  where id = p_floor_session_id
    and coach_id = v_coach_id
    and origin = 'ad_hoc'
  for update;

  if not found then raise exception 'floor_session_not_found'; end if;

  if v_floor.status = 'completed'
     and exists (
       select 1
       from public.coach_client_pass_ledger
       where coach_floor_session_id = v_floor.id
         and entry_type = 'session_used'
     ) then
    return jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'floorSession', to_jsonb(v_floor),
      'athleteId', v_floor.athlete_id,
      'workoutSessionId',
        case
          when v_floor.athlete_id is not null
            then 'coach-floor:' || v_floor.id::text
          else null
        end,
      'athleteHistoryWritten', v_floor.athlete_id is not null,
      'passResult', jsonb_build_object('ok', true, 'unchanged', true)
    );
  end if;

  select
    count(*),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'pass_id', e.pass_id,
          'name', e.pass_name,
          'balance', e.balance,
          'starts_at', e.starts_at,
          'expires_at', e.expires_at
        )
      ),
      '[]'::jsonb
    )
  into v_eligible_count, v_candidates
  from public._eligible_passes_for_session(
    v_floor.business_client_id,
    v_coach_id,
    timezone('utc', v_completed_at)::date
  ) as e;

  if p_pass_id is null and v_eligible_count > 1 then
    return jsonb_build_object(
      'ok', false,
      'passSelectionRequired', true,
      'candidates', v_candidates
    );
  end if;

  if p_pass_id is null and v_eligible_count = 1 then
    select pass_id
    into v_selected_pass
    from public._eligible_passes_for_session(
      v_floor.business_client_id,
      v_coach_id,
      timezone('utc', v_completed_at)::date
    )
    limit 1;
  else
    v_selected_pass := p_pass_id;
  end if;

  v_workout_session_id := 'coach-floor:' || v_floor.id::text;
  v_payload := coalesce(p_workout_payload, '{}'::jsonb) || jsonb_build_object(
    'id', v_workout_session_id,
    'name', left(coalesce(nullif(trim(p_workout_name), ''), 'In-person workout'), 200),
    'startedAt', v_floor.started_at,
    'finishedAt', v_completed_at,
    'date', timezone('utc', v_completed_at)::date::text,
    'sessionMode', 'coached_in_person',
    'coachFloorSession', true,
    'coachRecap', left(coalesce(p_athlete_recap, ''), 2000)
  );

  v_sets_count := case
    when jsonb_typeof(v_payload -> 'sets') = 'array'
      then jsonb_array_length(v_payload -> 'sets')
    else 0
  end;

  v_exercise_count := case
    when jsonb_typeof(v_payload -> 'exercisesPerformed') = 'array'
      then jsonb_array_length(v_payload -> 'exercisesPerformed')
    else 0
  end;

  update public.coach_floor_sessions
  set
    status = 'completed',
    workout_name = left(coalesce(nullif(trim(p_workout_name), ''), 'In-person workout'), 200),
    workout_payload = v_payload,
    private_coach_note = left(coalesce(p_private_coach_note, ''), 4000),
    athlete_recap = left(coalesce(p_athlete_recap, ''), 2000),
    completed_at = coalesce(completed_at, v_completed_at),
    updated_at = now()
  where id = v_floor.id
  returning * into v_floor;

  if v_floor.athlete_id is not null then
    insert into public.athlete_workout_sessions (
      athlete_id, session_id, assignment_id, workout_name, workout_key,
      started_at, completed_at, duration_seconds, session_payload,
      completion_summary, source, updated_at
    )
    values (
      v_floor.athlete_id,
      v_workout_session_id,
      null,
      v_floor.workout_name,
      v_floor.workout_name,
      v_floor.started_at,
      v_floor.completed_at,
      greatest(
        1,
        round(extract(epoch from (v_floor.completed_at - v_floor.started_at)))::integer
      ),
      v_payload,
      jsonb_build_object(
        'sets', v_sets_count,
        'exercises', v_exercise_count,
        'sessionMode', 'coached_in_person'
      ),
      'coach_floor',
      now()
    )
    on conflict (athlete_id, session_id) do nothing;
  end if;

  if v_selected_pass is not null then
    select *
    into v_pass
    from public.coach_client_passes
    where id = v_selected_pass
    for update;

    if not found
       or v_pass.coach_id is distinct from v_coach_id
       or v_pass.business_client_id is distinct from v_floor.business_client_id
       or not public._pass_is_eligible_for_session(
         v_pass.id,
         v_floor.business_client_id,
         v_coach_id,
         timezone('utc', v_completed_at)::date
       ) then
      raise exception 'pass_not_eligible_for_session';
    end if;

    select coalesce(sum(quantity), 0)::integer
    into v_balance
    from public.coach_client_pass_ledger
    where pass_id = v_pass.id;

    insert into public.coach_client_pass_ledger (
      pass_id,
      coach_id,
      business_client_id,
      entry_type,
      quantity,
      scheduled_session_id,
      coach_floor_session_id,
      reason,
      created_by
    )
    values (
      v_pass.id,
      v_coach_id,
      v_floor.business_client_id,
      'session_used',
      -1,
      null,
      v_floor.id,
      'Ad-hoc coached session',
      v_coach_id
    )
    on conflict do nothing;

    v_pass_result := jsonb_build_object(
      'ok', true,
      'pass_id', v_pass.id,
      'balance_after', greatest(0, v_balance - 1)
    );
  elsif v_eligible_count = 0 then
    v_pass_result := jsonb_build_object('ok', true, 'noPass', true);
  end if;

  return jsonb_build_object(
    'ok', true,
    'floorSession', to_jsonb(v_floor),
    'athleteId', v_floor.athlete_id,
    'workoutSessionId',
      case when v_floor.athlete_id is not null then v_workout_session_id else null end,
    'athleteHistoryWritten', v_floor.athlete_id is not null,
    'passResult', v_pass_result
  );
end;
$$;

revoke all on function public.start_ad_hoc_coach_floor_session(uuid,text)
  from public, anon;
revoke all on function public.save_ad_hoc_coach_floor_session(uuid,text,jsonb,text,text)
  from public, anon;
revoke all on function public.complete_ad_hoc_coach_floor_session(uuid,text,jsonb,text,text,uuid)
  from public, anon;

grant execute on function public.start_ad_hoc_coach_floor_session(uuid,text)
  to authenticated;
grant execute on function public.save_ad_hoc_coach_floor_session(uuid,text,jsonb,text,text)
  to authenticated;
grant execute on function public.complete_ad_hoc_coach_floor_session(uuid,text,jsonb,text,text,uuid)
  to authenticated;

commit;
