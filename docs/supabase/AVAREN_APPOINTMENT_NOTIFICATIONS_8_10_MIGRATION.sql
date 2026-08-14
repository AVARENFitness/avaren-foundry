-- AVAREN 8.10.3 -- Appointment Notifications migration
-- DO NOT RUN without explicit approval.
-- Reuses coach_notifications + push_subscriptions + Web Push edge functions.
-- Does NOT create a second notification system.

begin;

-- Section:
-- A. Delivery ledger — durable claim/retry lifecycle
-- Section:

create table if not exists public.appointment_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('athlete', 'coach')),
  appointment_id uuid not null references public.coach_scheduled_sessions(id) on delete cascade,
  notification_type text not null,
  canonical_start_at timestamptz,
  dedupe_key text not null,
  scheduled_for timestamptz,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  sent_at timestamptz,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'claimed', 'sent', 'failed', 'skipped')),
  attempt_count integer not null default 0,
  last_error text,
  coach_notification_id uuid references public.coach_notifications(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_notification_deliveries_dedupe_key_unique unique (dedupe_key)
);

create index if not exists appointment_notification_deliveries_recipient_idx
  on public.appointment_notification_deliveries (recipient_user_id, created_at desc);

create index if not exists appointment_notification_deliveries_appointment_idx
  on public.appointment_notification_deliveries (appointment_id, notification_type);

create index if not exists appointment_notification_deliveries_retry_idx
  on public.appointment_notification_deliveries (delivery_status, claim_expires_at, scheduled_for)
  where delivery_status in ('pending', 'failed', 'claimed');

create unique index if not exists appointment_notification_deliveries_sent_dedupe_idx
  on public.appointment_notification_deliveries (dedupe_key)
  where delivery_status = 'sent';

alter table public.appointment_notification_deliveries enable row level security;

drop policy if exists appointment_notification_deliveries_recipient_select
  on public.appointment_notification_deliveries;
create policy appointment_notification_deliveries_recipient_select
on public.appointment_notification_deliveries
for select to authenticated
using (recipient_user_id = auth.uid());

revoke all on public.appointment_notification_deliveries from public;
revoke all on public.appointment_notification_deliveries from anon;
grant select on public.appointment_notification_deliveries to authenticated;
grant all on public.appointment_notification_deliveries to service_role;

-- Section:
-- B. Extend coach_notifications — union of LIVE + appointment types
-- Existing LIVE types preserved from 8.3 / RSVP 7.1:
--   assignment-created, assignment-due, assignment-overdue, assignment-completed,
--   coach-comment, session-rsvp-confirmed, session-rsvp-declined, session-reminder
-- Added appointment types:
--   appointment-scheduled, appointment-rescheduled, appointment-cancelled,
--   appointment-athlete-confirmed, appointment-athlete-cannot-attend,
--   appointment-athlete-reminder-2h, appointment-coach-reminder-2h
-- Section:

alter table public.coach_notifications
  add column if not exists dedupe_key text;

create unique index if not exists coach_notifications_dedupe_key_unique
  on public.coach_notifications (dedupe_key)
  where dedupe_key is not null;

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
    'session-reminder',
    'appointment-scheduled',
    'appointment-rescheduled',
    'appointment-cancelled',
    'appointment-athlete-confirmed',
    'appointment-athlete-cannot-attend',
    'appointment-athlete-reminder-2h',
    'appointment-coach-reminder-2h'
  ));

-- Section:
-- C. Compatibility reminder markers (ledger remains canonical dedupe truth)
-- Section:

alter table public.coach_scheduled_sessions
  add column if not exists coach_reminder_sent_at timestamptz;

-- Section:
-- D. Helpers
-- Section:

create or replace function public.appointment_notification_dedupe_key(
  p_recipient_user_id uuid,
  p_appointment_id uuid,
  p_notification_type text,
  p_canonical_start_at timestamptz,
  p_transition_identity text default null
)
returns text
language sql
immutable
set search_path = ''
as $$
  select concat_ws(
    ':',
    p_recipient_user_id::text,
    p_appointment_id::text,
    p_notification_type,
    coalesce(p_canonical_start_at::text, 'none'),
    case
      when p_notification_type in (
        'appointment-rescheduled',
        'appointment-cancelled',
        'appointment-athlete-confirmed',
        'appointment-athlete-cannot-attend'
      ) then coalesce(p_transition_identity, 'unknown')
      else null
    end
  );
$$;

revoke all on function public.appointment_notification_dedupe_key(uuid, uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.appointment_notification_dedupe_key(uuid, uuid, text, timestamptz, text)
  to service_role;

create or replace function public.invalidate_stale_appointment_reminder_deliveries(
  p_appointment_id uuid,
  p_previous_start_at timestamptz,
  p_next_start_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_appointment_id is null
     or p_previous_start_at is not distinct from p_next_start_at then
    return 0;
  end if;

  update public.appointment_notification_deliveries as d
  set
    delivery_status = 'skipped',
    last_error = concat(
      'superseded_by_reschedule:',
      coalesce(p_previous_start_at::text, 'null'),
      '->',
      coalesce(p_next_start_at::text, 'null')
    ),
    claimed_at = null,
    claim_expires_at = null,
    updated_at = now()
  where d.appointment_id = p_appointment_id
    and d.notification_type in (
      'appointment-athlete-reminder-2h',
      'appointment-coach-reminder-2h'
    )
    and d.canonical_start_at is not distinct from p_previous_start_at
    and d.delivery_status in ('pending', 'claimed', 'failed');

  get diagnostics v_updated = row_count;
  return coalesce(v_updated, 0);
end;
$$;

revoke all on function public.invalidate_stale_appointment_reminder_deliveries(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.invalidate_stale_appointment_reminder_deliveries(uuid, timestamptz, timestamptz)
  to service_role;

create or replace function public.reset_session_reminder_on_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.starts_at is distinct from old.starts_at
       or new.schedule_timezone is distinct from old.schedule_timezone
       or new.session_date is distinct from old.session_date
       or new.start_time is distinct from old.start_time then
      new.reminder_sent_at := null;
      new.coach_reminder_sent_at := null;
      new.reminder_claimed_at := null;
      new.reminder_claim_expires_at := null;

      perform public.invalidate_stale_appointment_reminder_deliveries(
        new.id,
        old.starts_at,
        new.starts_at
      );
    end if;

    if new.status is distinct from old.status
       and new.status in ('cancelled', 'completed', 'missed') then
      new.reminder_claimed_at := null;
      new.reminder_claim_expires_at := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.reset_session_reminder_on_schedule_change()
  from public, anon, authenticated;

-- Trigger-only SECURITY DEFINER function. Authenticated coaches do not receive
-- direct EXECUTE, but BEFORE UPDATE trigger invocation can call service_role-only
-- invalidate_stale_appointment_reminder_deliveries under owner privileges.

drop trigger if exists coach_scheduled_sessions_reminder_reset_trigger
  on public.coach_scheduled_sessions;

create trigger coach_scheduled_sessions_reminder_reset_trigger
before update on public.coach_scheduled_sessions
for each row
execute function public.reset_session_reminder_on_schedule_change();

create or replace function public.enqueue_appointment_notification(
  p_recipient_user_id uuid,
  p_recipient_role text,
  p_appointment_id uuid,
  p_actor_id uuid,
  p_notification_type text,
  p_title text,
  p_body text,
  p_action text,
  p_payload jsonb,
  p_canonical_start_at timestamptz default null,
  p_transition_identity text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dedupe_key text;
  v_notification_id uuid;
  v_delivery_id uuid;
begin
  if p_recipient_user_id is null then
    return null;
  end if;

  v_dedupe_key := public.appointment_notification_dedupe_key(
    p_recipient_user_id,
    p_appointment_id,
    p_notification_type,
    p_canonical_start_at,
    p_transition_identity
  );

  insert into public.appointment_notification_deliveries (
    recipient_user_id,
    recipient_role,
    appointment_id,
    notification_type,
    canonical_start_at,
    dedupe_key,
    delivery_status,
    scheduled_for
  )
  values (
    p_recipient_user_id,
    p_recipient_role,
    p_appointment_id,
    p_notification_type,
    p_canonical_start_at,
    v_dedupe_key,
    'pending',
    now()
  )
  on conflict (dedupe_key) do nothing
  returning id into v_delivery_id;

  if v_delivery_id is null then
    return null;
  end if;

  insert into public.coach_notifications (
    recipient_id,
    actor_id,
    scheduled_session_id,
    type,
    title,
    body,
    action,
    payload,
    dedupe_key
  )
  values (
    p_recipient_user_id,
    p_actor_id,
    p_appointment_id,
    p_notification_type,
    p_title,
    p_body,
    p_action,
    p_payload,
    v_dedupe_key
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_notification_id;

  if v_notification_id is null then
    update public.appointment_notification_deliveries as d
    set delivery_status = 'skipped',
        updated_at = now()
    where d.id = v_delivery_id;
    return null;
  end if;

  update public.appointment_notification_deliveries as d
  set coach_notification_id = v_notification_id,
      updated_at = now()
  where d.id = v_delivery_id;

  return v_notification_id;
end;
$$;

revoke all on function public.enqueue_appointment_notification(uuid, text, uuid, uuid, text, text, text, text, jsonb, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_appointment_notification(uuid, text, uuid, uuid, text, text, text, text, jsonb, timestamptz, text)
  to service_role;

-- Section:
-- E. Immediate athlete lifecycle notifications
-- Coach never receives schedule/reschedule/cancel echoes.
-- Section:

create or replace function public.notify_appointment_lifecycle_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linked_user_id uuid;
  v_transition_identity text;
begin
  select bc.linked_user_id
  into v_linked_user_id
  from public.coach_business_clients as bc
  where bc.id = coalesce(new.business_client_id, old.business_client_id)
  limit 1;

  if tg_op = 'INSERT' then
    if v_linked_user_id is null or new.status <> 'scheduled' then
      return new;
    end if;

    perform public.enqueue_appointment_notification(
      v_linked_user_id,
      'athlete',
      new.id,
      new.coach_id,
      'appointment-scheduled',
      'Training scheduled',
      concat(
        to_char(new.session_date, 'Dy, Mon DD'),
        ' · ',
        to_char(new.start_time, 'FMHH12:MI AM')
      ),
      'open-appointment-detail',
      jsonb_build_object(
        'scheduledSessionId', new.id,
        'startsAt', new.starts_at,
        'scheduleTimezone', new.schedule_timezone
      ),
      new.starts_at,
      null
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if v_linked_user_id is null then
      return new;
    end if;

    if new.status = 'cancelled'
       and coalesce(old.status, '') <> 'cancelled' then
      v_transition_identity := to_char(new.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF');

      perform public.enqueue_appointment_notification(
        v_linked_user_id,
        'athlete',
        new.id,
        new.coach_id,
        'appointment-cancelled',
        'Training cancelled',
        concat(
          to_char(coalesce(old.session_date, new.session_date), 'Dy, Mon DD'),
          ' · ',
          to_char(coalesce(old.start_time, new.start_time), 'FMHH12:MI AM')
        ),
        'open-appointment-detail',
        jsonb_build_object(
          'scheduledSessionId', new.id,
          'startsAt', coalesce(old.starts_at, new.starts_at),
          'scheduleTimezone', coalesce(old.schedule_timezone, new.schedule_timezone),
          'updatedAt', new.updated_at
        ),
        coalesce(old.starts_at, new.starts_at),
        v_transition_identity
      );
      return new;
    end if;

    if new.status = 'scheduled'
       and (
         new.starts_at is distinct from old.starts_at
         or new.schedule_timezone is distinct from old.schedule_timezone
         or new.session_date is distinct from old.session_date
         or new.start_time is distinct from old.start_time
       ) then
      v_transition_identity := to_char(new.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF');

      perform public.enqueue_appointment_notification(
        v_linked_user_id,
        'athlete',
        new.id,
        new.coach_id,
        'appointment-rescheduled',
        'Training rescheduled',
        concat(
          'Now ',
          to_char(new.session_date, 'Dy, Mon DD'),
          ' · ',
          to_char(new.start_time, 'FMHH12:MI AM')
        ),
        'open-appointment-detail',
        jsonb_build_object(
          'scheduledSessionId', new.id,
          'startsAt', new.starts_at,
          'scheduleTimezone', new.schedule_timezone,
          'updatedAt', new.updated_at
        ),
        new.starts_at,
        v_transition_identity
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_appointment_lifecycle_changes()
  from public, anon, authenticated;

drop trigger if exists coach_scheduled_sessions_appointment_notify_trigger
  on public.coach_scheduled_sessions;

create trigger coach_scheduled_sessions_appointment_notify_trigger
after insert or update of
  status,
  starts_at,
  schedule_timezone,
  session_date,
  start_time,
  business_client_id
on public.coach_scheduled_sessions
for each row
execute function public.notify_appointment_lifecycle_changes();

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

-- Section:
-- F. RSVP RPC patch — preserve Phase C auth + existing client workflows
--
-- PRESERVED from LIVE Phase C (8.5):
--   • authorize via coach_business_clients.linked_user_id
--   • update rsvp_status + rsvp_updated_at
--   • return athlete-safe session JSON
--
-- PRESERVED from existing app architecture:
--   • SCHEDULE_CONFLICT follow-ups remain CLIENT-SIDE
--     (submitAppointmentScheduleConflict → coachBackend.createCoachFollowUp)
--   • this RPC never created follow-ups in Phase C or 8.3
--
-- ADDED in 8.10.2:
--   • unchanged early return (retry-safe)
--   • coach notification enqueue on real transitions only
--   • RSVP dedupe uses rsvp_updated_at transition identity
--   • wrapped { ok, unchanged, session } response for normalizeRsvpRpcResult
-- Section:

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

-- Section:
-- G. Reminder claim / complete / release RPCs
--
-- Retry policy:
--   • pending/failed rows are reclaimable immediately on next cron run
--   • claimed rows are reclaimable after claim_expires_at (default TTL 10 min)
--   • sent rows are terminal and never reclaimed
--   • attempt_count increments on each complete call
--   • successful push is deduped by dedupe_key + delivery_status = sent
-- Section:

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

create or replace function public.complete_appointment_reminder_delivery(
  p_delivery_id uuid,
  p_success boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.appointment_notification_deliveries;
begin
  select *
  into v_row
  from public.appointment_notification_deliveries as d
  where d.id = p_delivery_id
  for update;

  if not found then
    return false;
  end if;

  if v_row.delivery_status = 'sent' then
    return true;
  end if;

  update public.appointment_notification_deliveries as d
  set
    delivery_status = case when p_success then 'sent' else 'failed' end,
    sent_at = case when p_success then now() else d.sent_at end,
    attempt_count = d.attempt_count + 1,
    last_error = p_error,
    claimed_at = null,
    claim_expires_at = null,
    updated_at = now()
  where d.id = p_delivery_id;

  if p_success then
    if v_row.recipient_role = 'athlete' then
      update public.coach_scheduled_sessions as s
      set reminder_sent_at = now(),
          updated_at = now()
      where s.id = v_row.appointment_id;
    elsif v_row.recipient_role = 'coach' then
      update public.coach_scheduled_sessions as s
      set coach_reminder_sent_at = now(),
          updated_at = now()
      where s.id = v_row.appointment_id;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.complete_appointment_reminder_delivery(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_appointment_reminder_delivery(uuid, boolean, text)
  to service_role;

create or replace function public.release_appointment_reminder_claim(
  p_delivery_id uuid,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.appointment_notification_deliveries as d
  set
    delivery_status = 'failed',
    attempt_count = d.attempt_count + 1,
    last_error = coalesce(p_error, d.last_error),
    claimed_at = null,
    claim_expires_at = null,
    updated_at = now()
  where d.id = p_delivery_id
    and d.delivery_status = 'claimed'
  returning 1 into v_updated;

  return coalesce(v_updated, 0) = 1;
end;
$$;

revoke all on function public.release_appointment_reminder_claim(uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_appointment_reminder_claim(uuid, text)
  to service_role;

commit;

-- Section:
-- H. Legacy worker cutover plan (approval required — do not auto-disable)
--
-- LEGACY (if deployed today):
--   Edge Function: process-session-reminders
--   RPCs: claim_session_reminder_targets / complete_session_reminder
--   Athlete-only reminders, session-reminder type, RSVP-oriented copy
--
-- NEW (8.10.2):
--   Edge Function: process-appointment-reminders
--   RPCs: claim_appointment_reminder_targets / complete_appointment_reminder_delivery
--   Dual athlete+coach reminders, delivery ledger dedupe, 8.10 copy
--
-- Cutover sequence (manual approval):
--   1. Deploy SQL migration
--   2. Deploy process-appointment-reminders edge function
--   3. Enable Supabase Cron */5 * * * * for new function
--   4. Verify no duplicate reminders in staging
--   5. DISABLE legacy process-session-reminders cron (do not delete RPC yet)
--   6. Monitor delivery ledger for 48h
--
-- Until step 5 is approved, running both workers may duplicate athlete reminders.
-- Precheck section G must confirm whether legacy cron is active before cutover.
