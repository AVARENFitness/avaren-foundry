-- AVAREN 8.10.10 — Fix Schedule Session 42P10 regression (forward fix)
-- DO NOT RUN without explicit approval.
-- DO NOT re-run AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_MIGRATION.sql
-- DO NOT change cron.
--
-- Problem:
--   Coach Schedule Session INSERT on coach_scheduled_sessions fails with HTTP 400 / 42P10.
--   Trigger notify_appointment_lifecycle_changes → enqueue_appointment_notification
--   inserts into coach_notifications with:
--     ON CONFLICT (dedupe_key) DO NOTHING
--   Live dedupe object is a PARTIAL unique index only:
--     coach_notifications_dedupe_key_unique
--       UNIQUE (dedupe_key) WHERE dedupe_key IS NOT NULL
--   PostgreSQL requires the ON CONFLICT inference to match that partial index predicate.
--
-- Fix:
--   coach_notifications insert only:
--     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
--   Preserves legacy rows with NULL dedupe_key and existing dedupe semantics.
--
-- Precheck:
--   docs/supabase/AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_10_SCHEDULE_CONFLICT_PRECHECK.sql

begin;

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

-- Post-patch verification (read-only checks inside transaction)
select
  pg_get_functiondef(to_regprocedure('public.enqueue_appointment_notification(uuid, text, uuid, uuid, text, text, text, text, jsonb, timestamptz, text)'))
    ilike '%on conflict (dedupe_key) where dedupe_key is not null do nothing%' as coach_partial_conflict_present,
  pg_get_functiondef(to_regprocedure('public.enqueue_appointment_notification(uuid, text, uuid, uuid, text, text, text, text, jsonb, timestamptz, text)'))
    ilike '%insert into public.coach_notifications%on conflict (dedupe_key) do nothing%' as bare_coach_conflict_removed;

commit;
