-- AVAREN 8.10.9 — Dedupe key PL/pgSQL ambiguity fix (forward fix)
-- DO NOT RUN without explicit approval.
--
-- Problem:
--   claim_appointment_reminder_targets() RETURNS TABLE includes output column
--   dedupe_key, which PL/pgSQL treats as a variable. The INSERT ... ON CONFLICT
--   (dedupe_key) clause then becomes ambiguous with the table column.
--
-- Fix:
--   Use the existing table UNIQUE CONSTRAINT name in ON CONFLICT target:
--   appointment_notification_deliveries_dedupe_key_unique
--
-- Precheck:
--   docs/supabase/AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_9_DEDUPE_AMBIGUITY_PRECHECK.sql

begin;

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

select
  pg_get_functiondef(
    to_regprocedure('public.claim_appointment_reminder_targets(integer, integer)')
  ) like '%ON CONFLICT (dedupe_key)%' as has_ambiguous_on_conflict_target,
  pg_get_functiondef(
    to_regprocedure('public.claim_appointment_reminder_targets(integer, integer)')
  ) like '%ON CONFLICT ON CONSTRAINT appointment_notification_deliveries_dedupe_key_unique%' as has_constraint_conflict_target;

-- Expected after patch:
--   has_ambiguous_on_conflict_target = false
--   has_constraint_conflict_target = true
