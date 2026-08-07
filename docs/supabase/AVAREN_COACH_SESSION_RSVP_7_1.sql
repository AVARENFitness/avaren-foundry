-- AVAREN Sprint 7.1 Follow-Up — Session RSVP + Reminder Infrastructure (HARDENED)
-- Run once AFTER AVAREN_COACH_SESSION_COMPLETION_ATOMIC_7_1.sql
--
-- Privacy: athletes read sessions ONLY via list_athlete_scheduled_sessions() (allowlisted).
-- Time: starts_at timestamptz is authoritative for reminders; legacy rows need review/backfill.
-- Reminders: claim lock + retry; reminder_sent_at set only after successful push dispatch.
-- RSVP: idempotent updates; coach notified only when status actually changes.

begin;

alter table public.coach_scheduled_sessions
  add column if not exists rsvp_status text not null default 'awaiting_response'
    check (rsvp_status in ('awaiting_response', 'confirmed', 'cannot_attend')),
  add column if not exists rsvp_updated_at timestamptz,
  add column if not exists starts_at timestamptz,
  add column if not exists schedule_timezone text not null default 'America/New_York',
  add column if not exists reminder_claimed_at timestamptz,
  add column if not exists reminder_claim_expires_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;

update public.coach_scheduled_sessions
set rsvp_status = 'awaiting_response'
where rsvp_status is null;

comment on column public.coach_scheduled_sessions.starts_at is
  'Authoritative session instant (timestamptz, UTC storage). Used for push reminders.';

comment on column public.coach_scheduled_sessions.schedule_timezone is
  'IANA timezone for the wall-clock session_date/start_time (e.g. America/New_York). Handles DST via zone rules — never store EST/EDT directly.';

-- Legacy backfill: interpret existing session_date + start_time in America/New_York.
-- Only rows with NULL starts_at are updated. Already-set timestamptz values are never reinterpreted.
update public.coach_scheduled_sessions
set
  starts_at = (
    (session_date + start_time) at time zone 'America/New_York'
  ),
  schedule_timezone = 'America/New_York'
where starts_at is null
  and session_date is not null
  and start_time is not null;

alter table public.coach_notifications
  add column if not exists scheduled_session_id uuid
    references public.coach_scheduled_sessions(id) on delete cascade;

alter table public.coach_notifications
  drop constraint if exists coach_notifications_type_check;

alter table public.coach_notifications
  add constraint coach_notifications_type_check
  check (type in (
    'assignment-created',
    'assignment-due',
    'assignment-overdue',
    'assignment-completed',
    'coach-comment',
    'session-rsvp-confirmed',
    'session-rsvp-declined',
    'session-reminder'
  ));

create index if not exists coach_notifications_scheduled_session_idx
  on public.coach_notifications (scheduled_session_id);

create index if not exists coach_scheduled_sessions_reminder_idx
  on public.coach_scheduled_sessions (status, reminder_sent_at, starts_at);

-- Ensure no athlete table SELECT policy exists (coach-only direct access).
drop policy if exists coach_scheduled_sessions_athlete_select
  on public.coach_scheduled_sessions;

create or replace function public.athlete_scheduled_session_public_json(
  p_session public.coach_scheduled_sessions,
  p_coach_display_name text
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p_session.id,
    'coach_display_name', p_coach_display_name,
    'session_date', p_session.session_date,
    'start_time', p_session.start_time,
    'starts_at', p_session.starts_at,
    'schedule_timezone', p_session.schedule_timezone,
    'duration_minutes', p_session.duration_minutes,
    'status', p_session.status,
    'rsvp_status', p_session.rsvp_status,
    'rsvp_updated_at', p_session.rsvp_updated_at
  );
$$;

create or replace function public.reset_session_reminder_on_schedule_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.starts_at is distinct from old.starts_at
       or new.schedule_timezone is distinct from old.schedule_timezone
       or new.session_date is distinct from old.session_date
       or new.start_time is distinct from old.start_time then
      new.reminder_sent_at := null;
      new.reminder_claimed_at := null;
      new.reminder_claim_expires_at := null;
    end if;

    if new.status is distinct from old.status
       and new.status in ('cancelled', 'completed') then
      new.reminder_claimed_at := null;
      new.reminder_claim_expires_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists coach_scheduled_sessions_reminder_reset_trigger
  on public.coach_scheduled_sessions;

create trigger coach_scheduled_sessions_reminder_reset_trigger
before update on public.coach_scheduled_sessions
for each row execute function public.reset_session_reminder_on_schedule_change();

create or replace function public.update_scheduled_session_rsvp(
  p_session_id uuid,
  p_rsvp_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete_id uuid := auth.uid();
  v_session public.coach_scheduled_sessions;
  v_coach_display_name text;
  v_athlete_label text;
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_rsvp_status not in ('confirmed', 'cannot_attend') then
    raise exception 'invalid_rsvp_status';
  end if;

  select *
  into v_session
  from public.coach_scheduled_sessions
  where id = p_session_id
    and athlete_id = v_athlete_id
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  if v_session.status <> 'scheduled' then
    raise exception 'session_not_open';
  end if;

  select coalesce(
    u.raw_user_meta_data ->> 'display_name',
    split_part(u.email, '@', 1),
    'Coach'
  )
  into v_coach_display_name
  from auth.users u
  where u.id = v_session.coach_id;

  if v_session.rsvp_status = p_rsvp_status then
    return jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'session', public.athlete_scheduled_session_public_json(
        v_session,
        v_coach_display_name
      )
    );
  end if;

  update public.coach_scheduled_sessions
  set
    rsvp_status = p_rsvp_status,
    rsvp_updated_at = now(),
    updated_at = now()
  where id = p_session_id
  returning * into v_session;

  select coalesce(
    (
      select athlete_email
      from public.coach_clients
      where coach_id = v_session.coach_id
        and athlete_id = v_session.athlete_id
      limit 1
    ),
    'Athlete'
  )
  into v_athlete_label;

  insert into public.coach_notifications (
    recipient_id,
    actor_id,
    scheduled_session_id,
    type,
    title,
    body,
    action,
    payload
  )
  values (
    v_session.coach_id,
    v_athlete_id,
    v_session.id,
    case
      when p_rsvp_status = 'confirmed' then 'session-rsvp-confirmed'
      else 'session-rsvp-declined'
    end,
    case
      when p_rsvp_status = 'confirmed' then 'Session confirmed'
      else 'Session conflict'
    end,
    case
      when p_rsvp_status = 'confirmed' then
        concat(
          v_athlete_label,
          ' confirmed ',
          to_char(v_session.start_time, 'FMHH12:MI AM'),
          ' on ',
          to_char(v_session.session_date, 'Mon DD')
        )
      else
        concat(
          v_athlete_label,
          ' cannot make ',
          to_char(v_session.start_time, 'FMHH12:MI AM'),
          ' on ',
          to_char(v_session.session_date, 'Mon DD')
        )
    end,
    'open-coach-calendar',
    jsonb_build_object(
      'scheduledSessionId', v_session.id,
      'rsvpStatus', p_rsvp_status,
      'sessionDate', v_session.session_date,
      'startTime', v_session.start_time,
      'startsAt', v_session.starts_at
    )
  );

  return jsonb_build_object(
    'ok', true,
    'unchanged', false,
    'session', public.athlete_scheduled_session_public_json(
      v_session,
      v_coach_display_name
    )
  );
end;
$$;

revoke all on function public.update_scheduled_session_rsvp(uuid, text) from public;
grant execute on function public.update_scheduled_session_rsvp(uuid, text) to authenticated;

create or replace function public.list_athlete_scheduled_sessions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete_id uuid := auth.uid();
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  return coalesce((
    select jsonb_agg(
      public.athlete_scheduled_session_public_json(
        scoped.session_row,
        scoped.coach_display_name
      )
      order by scoped.session_row.starts_at
    )
    from (
      select
        s as session_row,
        coalesce(
          u.raw_user_meta_data ->> 'display_name',
          split_part(u.email, '@', 1),
          'Coach'
        ) as coach_display_name
      from public.coach_scheduled_sessions s
      join auth.users u on u.id = s.coach_id
      where s.athlete_id = v_athlete_id
        and s.status = 'scheduled'
        and s.starts_at is not null
        and s.starts_at >= now()
    ) scoped
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_athlete_scheduled_sessions() from public;
grant execute on function public.list_athlete_scheduled_sessions() to authenticated;

-- Claim due sessions for reminder processing (does NOT mark sent).
create or replace function public.claim_session_reminder_targets(
  p_limit integer default 25,
  p_claim_ttl_minutes integer default 10
)
returns setof public.coach_scheduled_sessions
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select s.id
    from public.coach_scheduled_sessions s
    where s.status = 'scheduled'
      and s.reminder_sent_at is null
      and s.starts_at is not null
      and s.starts_at > now()
      and s.starts_at - interval '2 hours' <= now()
      and (
        s.reminder_claimed_at is null
        or s.reminder_claim_expires_at <= now()
      )
    order by s.starts_at
    limit p_limit
    for update skip locked
  )
  update public.coach_scheduled_sessions s
  set
    reminder_claimed_at = now(),
    reminder_claim_expires_at = now() + make_interval(mins => p_claim_ttl_minutes),
    updated_at = now()
  from due
  where s.id = due.id
  returning s.*;
end;
$$;

revoke all on function public.claim_session_reminder_targets(integer, integer) from public;
grant execute on function public.claim_session_reminder_targets(integer, integer) to service_role;

create or replace function public.complete_session_reminder(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.coach_scheduled_sessions
  set
    reminder_sent_at = now(),
    reminder_claimed_at = null,
    reminder_claim_expires_at = null,
    updated_at = now()
  where id = p_session_id
    and status = 'scheduled'
    and reminder_sent_at is null
  returning 1 into v_updated;

  return coalesce(v_updated, 0) = 1;
end;
$$;

revoke all on function public.complete_session_reminder(uuid) from public;
grant execute on function public.complete_session_reminder(uuid) to service_role;

create or replace function public.release_session_reminder_claim(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.coach_scheduled_sessions
  set
    reminder_claimed_at = null,
    reminder_claim_expires_at = null,
    updated_at = now()
  where id = p_session_id
    and status = 'scheduled'
    and reminder_sent_at is null
  returning 1 into v_updated;

  return coalesce(v_updated, 0) = 1;
end;
$$;

revoke all on function public.release_session_reminder_claim(uuid) from public;
grant execute on function public.release_session_reminder_claim(uuid) to service_role;

commit;

-- After running this migration:
-- 1. Deploy supabase/functions/process-session-reminders
-- 2. Schedule it every 5 minutes: */5 * * * *
-- 3. Ensure VAPID secrets are configured (see AVAREN_PUSH_SETUP_6_4.md)
-- Legacy backfill uses America/New_York only for rows where starts_at was NULL before this migration.
