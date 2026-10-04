-- AVAREN Coach Floor Mode M1
-- Applied to production as migration: coach_floor_mode_m1
-- Purpose: durable coach-owned live session records with optional athlete history mirroring.

begin;

create table if not exists public.coach_floor_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  scheduled_session_id uuid not null references public.coach_scheduled_sessions(id) on delete cascade,
  business_client_id uuid null references public.coach_business_clients(id) on delete set null,
  athlete_id uuid null references auth.users(id) on delete set null,
  assignment_id uuid null,
  status text not null default 'in_progress'
    check (status in ('in_progress','completed')),
  workout_name text not null default 'In-person workout',
  workout_payload jsonb not null default '{}'::jsonb,
  private_coach_note text not null default '',
  athlete_recap text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_floor_sessions_scheduled_unique unique (scheduled_session_id)
);

create index if not exists coach_floor_sessions_coach_started_idx
  on public.coach_floor_sessions (coach_id, started_at desc);

create index if not exists coach_floor_sessions_business_client_idx
  on public.coach_floor_sessions (business_client_id, started_at desc)
  where business_client_id is not null;

create index if not exists coach_floor_sessions_athlete_idx
  on public.coach_floor_sessions (athlete_id, started_at desc)
  where athlete_id is not null;

alter table public.coach_floor_sessions enable row level security;

revoke all on table public.coach_floor_sessions from public, anon;
grant select, insert, update on table public.coach_floor_sessions to authenticated;

drop policy if exists coach_floor_sessions_owner_select on public.coach_floor_sessions;
drop policy if exists coach_floor_sessions_owner_insert on public.coach_floor_sessions;
drop policy if exists coach_floor_sessions_owner_update on public.coach_floor_sessions;

create policy coach_floor_sessions_owner_select
on public.coach_floor_sessions
for select to authenticated
using (coach_id = auth.uid());

create policy coach_floor_sessions_owner_insert
on public.coach_floor_sessions
for insert to authenticated
with check (coach_id = auth.uid());

create policy coach_floor_sessions_owner_update
on public.coach_floor_sessions
for update to authenticated
using (coach_id = auth.uid())
with check (coach_id = auth.uid());

create or replace function public.save_coach_floor_session(
  p_scheduled_session_id uuid,
  p_workout_name text,
  p_workout_payload jsonb,
  p_started_at timestamptz,
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
  v_session public.coach_scheduled_sessions;
  v_business public.coach_business_clients;
  v_athlete_id uuid;
  v_row public.coach_floor_sessions;
begin
  if v_coach_id is null then raise exception 'not_authenticated'; end if;

  select *
  into v_session
  from public.coach_scheduled_sessions
  where id = p_scheduled_session_id
    and coach_id = v_coach_id;

  if not found then raise exception 'session_not_found'; end if;
  if v_session.status in ('cancelled','missed') then
    raise exception 'session_not_available';
  end if;

  if v_session.business_client_id is not null then
    select *
    into v_business
    from public.coach_business_clients
    where id = v_session.business_client_id
      and coach_id = v_coach_id;

    if not found then raise exception 'business_client_not_found'; end if;
  end if;

  v_athlete_id := coalesce(v_session.athlete_id, v_business.linked_user_id);

  insert into public.coach_floor_sessions (
    coach_id, scheduled_session_id, business_client_id, athlete_id, assignment_id,
    status, workout_name, workout_payload, private_coach_note, athlete_recap,
    started_at, updated_at
  )
  values (
    v_coach_id, v_session.id, v_session.business_client_id, v_athlete_id,
    v_session.assignment_id, 'in_progress',
    left(coalesce(nullif(trim(p_workout_name), ''), 'In-person workout'), 200),
    coalesce(p_workout_payload, '{}'::jsonb),
    left(coalesce(p_private_coach_note, ''), 4000),
    left(coalesce(p_athlete_recap, ''), 2000),
    coalesce(p_started_at, now()), now()
  )
  on conflict (scheduled_session_id)
  do update set
    workout_name = excluded.workout_name,
    workout_payload = excluded.workout_payload,
    private_coach_note = excluded.private_coach_note,
    athlete_recap = excluded.athlete_recap,
    started_at = least(public.coach_floor_sessions.started_at, excluded.started_at),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.complete_coach_floor_session(
  p_scheduled_session_id uuid,
  p_workout_name text,
  p_workout_payload jsonb,
  p_started_at timestamptz,
  p_private_coach_note text default '',
  p_athlete_recap text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions;
  v_business public.coach_business_clients;
  v_floor public.coach_floor_sessions;
  v_athlete_id uuid;
  v_completed_at timestamptz := now();
  v_workout_session_id text;
  v_payload jsonb;
  v_sets_count integer := 0;
  v_exercise_count integer := 0;
begin
  if v_coach_id is null then raise exception 'not_authenticated'; end if;

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

  if v_session.business_client_id is not null then
    select *
    into v_business
    from public.coach_business_clients
    where id = v_session.business_client_id
      and coach_id = v_coach_id;

    if not found then raise exception 'business_client_not_found'; end if;
  end if;

  v_athlete_id := coalesce(v_session.athlete_id, v_business.linked_user_id);
  v_workout_session_id := 'coach-floor:' || v_session.id::text;

  v_payload := coalesce(p_workout_payload, '{}'::jsonb) || jsonb_build_object(
    'id', v_workout_session_id,
    'name', left(coalesce(nullif(trim(p_workout_name), ''), 'In-person workout'), 200),
    'startedAt', coalesce(p_started_at, v_completed_at),
    'finishedAt', v_completed_at,
    'date', timezone('utc', v_completed_at)::date::text,
    'sessionMode', 'coached_in_person',
    'scheduledSessionId', v_session.id,
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

  insert into public.coach_floor_sessions (
    coach_id, scheduled_session_id, business_client_id, athlete_id, assignment_id,
    status, workout_name, workout_payload, private_coach_note, athlete_recap,
    started_at, completed_at, updated_at
  )
  values (
    v_coach_id, v_session.id, v_session.business_client_id, v_athlete_id,
    v_session.assignment_id, 'completed',
    left(coalesce(nullif(trim(p_workout_name), ''), 'In-person workout'), 200),
    v_payload,
    left(coalesce(p_private_coach_note, ''), 4000),
    left(coalesce(p_athlete_recap, ''), 2000),
    coalesce(p_started_at, v_completed_at),
    v_completed_at, now()
  )
  on conflict (scheduled_session_id)
  do update set
    status = 'completed',
    workout_name = excluded.workout_name,
    workout_payload = excluded.workout_payload,
    private_coach_note = excluded.private_coach_note,
    athlete_recap = excluded.athlete_recap,
    started_at = least(public.coach_floor_sessions.started_at, excluded.started_at),
    completed_at = excluded.completed_at,
    updated_at = now()
  returning * into v_floor;

  if v_athlete_id is not null then
    insert into public.athlete_workout_sessions (
      athlete_id, session_id, assignment_id, workout_name, workout_key,
      started_at, completed_at, duration_seconds, session_payload,
      completion_summary, source, updated_at
    )
    values (
      v_athlete_id, v_workout_session_id, v_session.assignment_id,
      v_floor.workout_name, v_floor.workout_name, v_floor.started_at,
      v_completed_at,
      greatest(1, round(extract(epoch from (v_completed_at - v_floor.started_at)))::integer),
      v_payload,
      jsonb_build_object(
        'sets', v_sets_count,
        'exercises', v_exercise_count,
        'assignmentId', v_session.assignment_id,
        'sessionMode', 'coached_in_person',
        'scheduledSessionId', v_session.id
      ),
      'coach_floor',
      now()
    )
    on conflict (athlete_id, session_id) do nothing;

    if v_session.assignment_id is not null then
      update public.coach_assignments
      set
        status = 'completed',
        completed_at = coalesce(completed_at, v_completed_at),
        completed_session_id = coalesce(completed_session_id, v_workout_session_id),
        completion_summary = coalesce(completion_summary, '{}'::jsonb) || jsonb_build_object(
          'sets', v_sets_count,
          'exercises', v_exercise_count,
          'sessionMode', 'coached_in_person'
        )
      where id = v_session.assignment_id
        and coach_id = v_coach_id
        and athlete_id = v_athlete_id
        and status in ('assigned','started');
    end if;
  end if;

  update public.coach_scheduled_sessions
  set
    workout_session_id = case
      when v_athlete_id is not null then v_workout_session_id
      else workout_session_id
    end,
    updated_at = now()
  where id = v_session.id;

  return jsonb_build_object(
    'ok', true,
    'floorSession', to_jsonb(v_floor),
    'athleteId', v_athlete_id,
    'workoutSessionId', case when v_athlete_id is not null then v_workout_session_id else null end,
    'athleteHistoryWritten', v_athlete_id is not null
  );
end;
$$;

revoke all on function public.save_coach_floor_session(uuid,text,jsonb,timestamptz,text,text) from public, anon;
revoke all on function public.complete_coach_floor_session(uuid,text,jsonb,timestamptz,text,text) from public, anon;

grant execute on function public.save_coach_floor_session(uuid,text,jsonb,timestamptz,text,text) to authenticated;
grant execute on function public.complete_coach_floor_session(uuid,text,jsonb,timestamptz,text,text) to authenticated;

commit;
