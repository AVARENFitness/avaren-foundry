-- AVAREN Sprint 7.1 — Atomic Coach Scheduled Session Completion
-- Run once AFTER AVAREN_COACH_CALENDAR_7_1.sql
--
-- Adds database RPCs that complete or undo a scheduled in-person session in one
-- transaction. Prevents duplicate package deductions from repeated clicks or races.

begin;

create or replace function public.complete_coach_scheduled_session(
  p_scheduled_session_id uuid,
  p_coach_label text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions;
  v_package public.coach_session_packages;
  v_history public.coach_session_history;
  v_history_id uuid;
  v_now timestamptz := now();
begin
  if v_coach_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  select *
  into v_session
  from public.coach_scheduled_sessions
  where id = p_scheduled_session_id
    and coach_id = v_coach_id
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  if v_session.status = 'completed' then
    raise exception 'already_completed';
  end if;

  if v_session.status = 'cancelled' then
    raise exception 'session_cancelled';
  end if;

  if not exists (
    select 1
    from public.coach_clients
    where coach_id = v_coach_id
      and athlete_id = v_session.athlete_id
  ) then
    raise exception 'not_authorized';
  end if;

  select *
  into v_package
  from public.coach_session_packages
  where coach_id = v_coach_id
    and athlete_id = v_session.athlete_id
  for update;

  if not found then
    raise exception 'no_package';
  end if;

  if v_package.sessions_remaining <= 0 then
    raise exception 'no_sessions_remaining';
  end if;

  if v_package.expires_at is not null
     and v_package.expires_at < timezone('utc', v_now)::date then
    raise exception 'package_expired';
  end if;

  insert into public.coach_session_history (
    package_id,
    coach_id,
    athlete_id,
    session_date,
    coach_label,
    note
  )
  values (
    v_package.id,
    v_coach_id,
    v_session.athlete_id,
    v_session.session_date,
    coalesce(nullif(trim(p_coach_label), ''), ''),
    coalesce(v_session.coach_note, '')
  )
  returning * into v_history;

  v_history_id := v_history.id;

  update public.coach_session_packages
  set
    sessions_remaining = sessions_remaining - 1,
    sessions_used = sessions_used + 1,
    updated_at = v_now
  where id = v_package.id
  returning * into v_package;

  update public.coach_scheduled_sessions
  set
    status = 'completed',
    completed_at = v_now,
    session_history_id = v_history_id,
    updated_at = v_now
  where id = v_session.id
  returning * into v_session;

  return jsonb_build_object(
    'ok', true,
    'session', to_jsonb(v_session),
    'package', to_jsonb(v_package),
    'history', to_jsonb(v_history)
  );
end;
$$;

create or replace function public.undo_complete_coach_scheduled_session(
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
  v_package public.coach_session_packages;
  v_now timestamptz := now();
begin
  if v_coach_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  select *
  into v_session
  from public.coach_scheduled_sessions
  where id = p_scheduled_session_id
    and coach_id = v_coach_id
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  if v_session.status <> 'completed' then
    raise exception 'not_completed';
  end if;

  if v_session.session_history_id is null then
    raise exception 'missing_history';
  end if;

  if not exists (
    select 1
    from public.coach_clients
    where coach_id = v_coach_id
      and athlete_id = v_session.athlete_id
  ) then
    raise exception 'not_authorized';
  end if;

  select *
  into v_package
  from public.coach_session_packages
  where coach_id = v_coach_id
    and athlete_id = v_session.athlete_id
  for update;

  if not found then
    raise exception 'no_package';
  end if;

  if v_package.sessions_used <= 0 then
    raise exception 'invalid_package_state';
  end if;

  delete from public.coach_session_history
  where id = v_session.session_history_id
    and coach_id = v_coach_id
    and athlete_id = v_session.athlete_id;

  if not found then
    raise exception 'history_not_found';
  end if;

  update public.coach_session_packages
  set
    sessions_remaining = sessions_remaining + 1,
    sessions_used = sessions_used - 1,
    updated_at = v_now
  where id = v_package.id
  returning * into v_package;

  update public.coach_scheduled_sessions
  set
    status = 'scheduled',
    completed_at = null,
    session_history_id = null,
    updated_at = v_now
  where id = v_session.id
  returning * into v_session;

  return jsonb_build_object(
    'ok', true,
    'session', to_jsonb(v_session),
    'package', to_jsonb(v_package)
  );
end;
$$;

revoke all on function public.complete_coach_scheduled_session(uuid, text) from public;
revoke all on function public.undo_complete_coach_scheduled_session(uuid) from public;

grant execute on function public.complete_coach_scheduled_session(uuid, text) to authenticated;
grant execute on function public.undo_complete_coach_scheduled_session(uuid) to authenticated;

commit;
