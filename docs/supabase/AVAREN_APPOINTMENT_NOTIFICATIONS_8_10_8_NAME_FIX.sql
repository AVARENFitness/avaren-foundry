-- AVAREN 8.10.8 — Business client reminder label fix (forward fix)
-- DO NOT RUN without explicit approval.
--
-- Problem:
--   claim_appointment_reminder_targets and update_scheduled_session_rsvp
--   referenced bc.full_name, which does not exist on coach_business_clients.
--
-- Fix:
--   Add canonical business-client display resolver aligned with AVAREN naming:
--   preferred_name → display_name → first+last → linked athlete public name → 'Athlete'

begin;

create or replace function public.resolve_business_client_display_name(
  p_business_client_id uuid
)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(trim(bc.preferred_name), ''),
    nullif(trim(bc.display_name), ''),
    nullif(
      trim(concat_ws(
        ' ',
        nullif(trim(bc.first_name), ''),
        nullif(trim(bc.last_name), '')
      )),
      ''
    ),
    case
      when bc.linked_user_id is not null then
        nullif(trim(public.resolve_user_public_display_name(bc.linked_user_id)), '')
      else null
    end,
    'Athlete'
  )
  from public.coach_business_clients as bc
  where bc.id = p_business_client_id
  limit 1;
$$;

revoke all on function public.resolve_business_client_display_name(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_business_client_display_name(uuid)
  to service_role;

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
  v_previous_rsvp text;
  v_coach_display_name text;
  v_linked_workout_title text;
  v_athlete_label text;
  v_notification_type text;
  v_transition_identity text;
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
    raise exception 'session_not_open';
  end if;

  v_previous_rsvp := v_session.rsvp_status;
  v_coach_display_name := public.resolve_user_public_display_name(v_session.coach_id);

  select a.title
  into v_linked_workout_title
  from public.coach_assignments as a
  where a.id = v_session.assignment_id
    and a.coach_id = v_session.coach_id
  limit 1;

  if v_previous_rsvp = p_rsvp_status then
    return jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'session', public.athlete_scheduled_session_public_json(
        v_session,
        v_coach_display_name,
        v_linked_workout_title
      )
    );
  end if;

  update public.coach_scheduled_sessions as ss
  set
    rsvp_status = p_rsvp_status,
    rsvp_updated_at = now(),
    updated_at = now()
  where ss.id = p_session_id
  returning ss.* into v_session;

  v_transition_identity := to_char(v_session.rsvp_updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF');
  v_athlete_label := public.resolve_business_client_display_name(v_session.business_client_id);

  v_notification_type := case
    when p_rsvp_status = 'confirmed' then 'appointment-athlete-confirmed'
    else 'appointment-athlete-cannot-attend'
  end;

  perform public.enqueue_appointment_notification(
    v_session.coach_id,
    'coach',
    v_session.id,
    v_athlete_id,
    v_notification_type,
    case
      when p_rsvp_status = 'confirmed' then concat(v_athlete_label, ' confirmed')
      else concat(v_athlete_label, ' can''t make it')
    end,
    concat(
      to_char(v_session.session_date, 'Dy'),
      ' · ',
      to_char(v_session.start_time, 'FMHH12:MI AM')
    ),
    'open-coach-calendar',
    jsonb_build_object(
      'scheduledSessionId', v_session.id,
      'rsvpStatus', p_rsvp_status,
      'startsAt', v_session.starts_at,
      'scheduleTimezone', v_session.schedule_timezone,
      'rsvpUpdatedAt', v_session.rsvp_updated_at
    ),
    v_session.starts_at,
    v_transition_identity
  );

  return jsonb_build_object(
    'ok', true,
    'unchanged', false,
    'session', public.athlete_scheduled_session_public_json(
      v_session,
      v_coach_display_name,
      v_linked_workout_title
    )
  );
end;
$$;

revoke all on function public.update_scheduled_session_rsvp(uuid, text)
  from public, anon;
grant execute on function public.update_scheduled_session_rsvp(uuid, text)
  to authenticated;

-- claim_appointment_reminder_targets: replace athlete_label resolution only.

create or replace function public.claim_appointment_reminder_targets(
  p_limit integer default 25,
  p_claim_ttl_minutes integer default 10
)
returns table (
  delivery_id uuid,
  recipient_user_id uuid,
  recipient_role text,
  appointment_id uuid,
  notification_type text,
  canonical_start_at timestamptz,
  dedupe_key text,
  coach_id uuid,
  athlete_label text,
  rsvp_status text,
  schedule_timezone text,
  starts_at timestamptz,
  start_time time,
  session_date date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select
      bc.linked_user_id as athlete_user_id,
      s.id as appointment_id,
      s.coach_id,
      s.starts_at,
      s.start_time,
      s.session_date,
      s.rsvp_status,
      s.schedule_timezone,
      public.resolve_business_client_display_name(bc.id) as athlete_label,
      public.appointment_notification_dedupe_key(
        bc.linked_user_id,
        s.id,
        'appointment-athlete-reminder-2h',
        s.starts_at,
        null
      ) as athlete_dedupe_key,
      public.appointment_notification_dedupe_key(
        s.coach_id,
        s.id,
        'appointment-coach-reminder-2h',
        s.starts_at,
        null
      ) as coach_dedupe_key
    from public.coach_scheduled_sessions as s
    join public.coach_business_clients as bc
      on bc.id = s.business_client_id
    where s.status = 'scheduled'
      and s.starts_at is not null
      and s.starts_at > now()
      and s.starts_at <= now() + interval '2 hours 5 minutes'
      and s.starts_at >= now() + interval '1 hour 55 minutes'
      and not (
        s.rsvp_status = 'cannot_attend'
        and exists (
          select 1
          from public.coach_client_followups as f
          where f.scheduled_session_id = s.id
            and f.reason_type = 'SCHEDULE_CONFLICT'
            and f.status = 'open'
        )
      )
  ),
  targets as (
    select
      d.appointment_id,
      d.athlete_user_id as recipient_user_id,
      'athlete'::text as recipient_role,
      'appointment-athlete-reminder-2h'::text as notification_type,
      d.starts_at as canonical_start_at,
      d.athlete_dedupe_key as dedupe_key,
      d.coach_id,
      d.athlete_label,
      d.rsvp_status,
      d.schedule_timezone,
      d.starts_at,
      d.start_time,
      d.session_date
    from due as d
    where d.athlete_user_id is not null
      and not exists (
        select 1
        from public.appointment_notification_deliveries as sent
        where sent.dedupe_key = d.athlete_dedupe_key
          and sent.delivery_status = 'sent'
      )

    union all

    select
      d.appointment_id,
      d.coach_id as recipient_user_id,
      'coach'::text as recipient_role,
      'appointment-coach-reminder-2h'::text as notification_type,
      d.starts_at as canonical_start_at,
      d.coach_dedupe_key as dedupe_key,
      d.coach_id,
      d.athlete_label,
      d.rsvp_status,
      d.schedule_timezone,
      d.starts_at,
      d.start_time,
      d.session_date
    from due as d
    where not exists (
      select 1
      from public.appointment_notification_deliveries as sent
      where sent.dedupe_key = d.coach_dedupe_key
        and sent.delivery_status = 'sent'
    )
  ),
  ranked as (
    select t.*
    from targets as t
    order by t.starts_at
    limit p_limit
  ),
  claimed as (
    insert into public.appointment_notification_deliveries as d (
      recipient_user_id,
      recipient_role,
      appointment_id,
      notification_type,
      canonical_start_at,
      dedupe_key,
      delivery_status,
      scheduled_for,
      claimed_at,
      claim_expires_at
    )
    select
      r.recipient_user_id,
      r.recipient_role,
      r.appointment_id,
      r.notification_type,
      r.canonical_start_at,
      r.dedupe_key,
      'claimed',
      now(),
      now(),
      now() + make_interval(mins => p_claim_ttl_minutes)
    from ranked as r
    on conflict on constraint appointment_notification_deliveries_dedupe_key_unique do update
    set
      delivery_status = 'claimed',
      claimed_at = now(),
      claim_expires_at = now() + make_interval(mins => p_claim_ttl_minutes),
      scheduled_for = now(),
      updated_at = now()
    where d.delivery_status <> 'sent'
      and (
        d.delivery_status in ('pending', 'failed')
        or (
          d.delivery_status = 'claimed'
          and d.claim_expires_at is not null
          and d.claim_expires_at <= now()
        )
      )
    returning d.*
  )
  select
    c.id,
    c.recipient_user_id,
    c.recipient_role,
    c.appointment_id,
    c.notification_type,
    c.canonical_start_at,
    c.dedupe_key,
    r.coach_id,
    r.athlete_label,
    r.rsvp_status,
    r.schedule_timezone,
    r.starts_at,
    r.start_time,
    r.session_date
  from claimed as c
  join ranked as r on r.dedupe_key = c.dedupe_key
  where c.delivery_status = 'claimed';
end;
$$;

revoke all on function public.claim_appointment_reminder_targets(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_appointment_reminder_targets(integer, integer)
  to service_role;

commit;

-- Verification (read-only after apply)

select pg_get_functiondef(
  to_regprocedure('public.resolve_business_client_display_name(uuid)')
) as resolve_business_client_display_name_def;

select
  pg_get_functiondef(
    to_regprocedure('public.claim_appointment_reminder_targets(integer, integer)')
  ) not like '%full_name%' as claim_function_has_no_full_name,
  pg_get_functiondef(
    to_regprocedure('public.update_scheduled_session_rsvp(uuid, text)')
  ) not like '%full_name%' as rsvp_function_has_no_full_name;

-- Expected:
--   claim_function_has_no_full_name = true
--   rsvp_function_has_no_full_name = true
