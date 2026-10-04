-- AVAREN Coach Floor Mode — manual pass policy
-- Applied to production as migration: coach_floor_mode_manual_passes
-- Recording/completing a workout never debits a training pass.

begin;

create or replace function public.complete_coach_floor_scheduled_attendance(
  p_scheduled_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  select *
  into v_session
  from public.coach_scheduled_sessions
  where id = p_scheduled_session_id
    and coach_id = v_coach_id
  for update;

  if not found then raise exception 'session_not_found'; end if;
  if v_session.status in ('cancelled','missed') then
    raise exception 'session_not_available';
  end if;

  update public.coach_scheduled_sessions
  set
    status = 'completed',
    completed_at = coalesce(completed_at, now()),
    updated_at = now()
  where id = v_session.id
  returning * into v_session;

  return jsonb_build_object(
    'ok', true,
    'session', to_jsonb(v_session),
    'passUnchanged', true
  );
end;
$$;

revoke all on function public.complete_coach_floor_scheduled_attendance(uuid)
  from public, anon;
grant execute on function public.complete_coach_floor_scheduled_attendance(uuid)
  to authenticated;

-- Keep existing six-argument RPC signature for preview/backward compatibility,
-- but ignore p_pass_id by policy. No ledger row is written here.
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

  v_workout_session_id := 'coach-floor:' || v_floor.id::text;

  if v_floor.status = 'completed' then
    return jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'floorSession', to_jsonb(v_floor),
      'athleteId', v_floor.athlete_id,
      'workoutSessionId',
        case when v_floor.athlete_id is not null then v_workout_session_id else null end,
      'athleteHistoryWritten', v_floor.athlete_id is not null,
      'passUnchanged', true
    );
  end if;

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
    completed_at = v_completed_at,
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
      v_completed_at,
      greatest(1, round(extract(epoch from (v_completed_at - v_floor.started_at)))::integer),
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

  return jsonb_build_object(
    'ok', true,
    'floorSession', to_jsonb(v_floor),
    'athleteId', v_floor.athlete_id,
    'workoutSessionId',
      case when v_floor.athlete_id is not null then v_workout_session_id else null end,
    'athleteHistoryWritten', v_floor.athlete_id is not null,
    'passUnchanged', true
  );
end;
$$;

revoke all on function public.complete_ad_hoc_coach_floor_session(uuid,text,jsonb,text,text,uuid)
  from public, anon;
grant execute on function public.complete_ad_hoc_coach_floor_session(uuid,text,jsonb,text,text,uuid)
  to authenticated;

commit;
